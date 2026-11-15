//! Windows PIP 창 식별, alpha 변경과 원상복구.

#[cfg(windows)]
mod platform {
    use std::collections::HashMap;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        Graphics::Gdi::{RedrawWindow, RDW_INVALIDATE, RDW_FRAME, RDW_ALLCHILDREN},
        System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
        UI::WindowsAndMessaging::*,
    };

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub struct PipWindow {
        pub handle: usize,
        pub pid: u32,
        pub title: String,
        pub browser: String,
    }

    #[derive(Clone, Debug)]
    struct Original {
        window: PipWindow,
        layered: bool,
        color: u32,
        alpha: u8,
        flags: u32,
        marker: usize,
    }

    #[derive(Default)]
    pub struct PipTransparency {
        originals: HashMap<usize, Original>,
    }

    fn is_pip_title(title: &str) -> bool {
        matches!(title.to_lowercase().as_str(),
            "picture in picture" | "picture-in-picture" | "화면 속 화면" | "pip 모드")
    }

    unsafe fn identify(hwnd: HWND) -> Option<PipWindow> {
        if IsWindowVisible(hwnd) == 0 || GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST == 0 {
            return None;
        }
        let mut class = [0u16; 128];
        let class_len = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        if String::from_utf16_lossy(&class[..class_len.max(0) as usize]) != "Chrome_WidgetWin_1" {
            return None;
        }
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
        let title = String::from_utf16_lossy(&title[..len.max(0) as usize]);
        if !is_pip_title(&title) { return None; }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() { return None; }
        let mut path = [0u16; 1024];
        let mut size = path.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if ok == 0 { return None; }
        let path = String::from_utf16_lossy(&path[..size as usize]).to_lowercase();
        if !path.ends_with("\\msedge.exe") && !path.ends_with("\\chrome.exe") { return None; }
        let browser = if path.ends_with("\\msedge.exe") { "Edge" } else { "Chrome" }.into();
        Some(PipWindow { handle: hwnd as usize, pid, title, browser })
    }

    pub fn list() -> Vec<PipWindow> {
        unsafe extern "system" fn collect(hwnd: HWND, data: LPARAM) -> i32 {
            if let Some(window) = identify(hwnd) {
                (*(data as *mut Vec<PipWindow>)).push(window);
            }
            1
        }
        let mut windows = Vec::new();
        unsafe { EnumWindows(Some(collect), &mut windows as *mut _ as LPARAM); }
        windows
    }

    fn error(action: &str) -> String {
        format!("{action}: {}", std::io::Error::last_os_error())
    }

    fn property_name() -> Vec<u16> {
        format!("KarmoLab.PipTransparency.{}", std::process::id()).encode_utf16().chain(Some(0)).collect()
    }

    unsafe fn still_owned(original: &Original) -> bool {
        let hwnd = original.window.handle as HWND;
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        IsWindow(hwnd) != 0 && pid == original.window.pid
            && GetPropW(hwnd, property_name().as_ptr()) as usize == original.marker
    }

    impl PipTransparency {
        pub fn set(&mut self, window: &PipWindow, percent: u8) -> Result<(), String> {
            if !(20..=100).contains(&percent) { return Err("불투명도는 20~100% 범위입니다.".into()); }
            unsafe {
                let hwnd = window.handle as HWND;
                if identify(hwnd).as_ref() != Some(window) { return Err("PIP 창이 바뀌었습니다. 목록을 새로고침하세요.".into()); }
                self.originals.retain(|_, original| still_owned(original));
                if !self.originals.contains_key(&window.handle) {
                    let layered = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_LAYERED != 0;
                    let (mut color, mut alpha, mut flags) = (0, 255, 0);
                    if layered && GetLayeredWindowAttributes(hwnd, &mut color, &mut alpha, &mut flags) == 0 {
                        return Err("기존 창의 투명도 상태를 읽을 수 없어 변경하지 않았습니다.".into());
                    }
                    static NEXT_MARKER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);
                    let marker = NEXT_MARKER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    if SetPropW(hwnd, property_name().as_ptr(), marker as _) == 0 {
                        return Err(error("PIP 창 복구 표식 설정 실패"));
                    }
                    self.originals.insert(window.handle, Original { window: window.clone(), layered, color, alpha, flags, marker });
                }
                let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                windows_sys::Win32::Foundation::SetLastError(0);
                if SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED as i32) == 0
                    && windows_sys::Win32::Foundation::GetLastError() != 0 {
                    return Err(error("PIP 창 속성 변경 실패"));
                }
                let alpha = ((percent as u32 * 255 + 50) / 100) as u8;
                if SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA) == 0 {
                    let detail = error("PIP 투명도 변경 실패");
                    let _ = self.restore_one(window.handle);
                    return Err(detail);
                }
                Ok(())
            }
        }

        pub fn restore_one(&mut self, handle: usize) -> Result<(), String> {
            let Some(original) = self.originals.get(&handle) else { return Ok(()); };
            unsafe {
                let hwnd = handle as HWND;
                if !still_owned(original) {
                    self.originals.remove(&handle);
                    return Ok(());
                }
                if original.layered {
                    if SetLayeredWindowAttributes(hwnd, original.color, original.alpha, original.flags) == 0 {
                        return Err(error("PIP 원래 투명도 복구 실패"));
                    }
                } else {
                    let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    windows_sys::Win32::Foundation::SetLastError(0);
                    if SetWindowLongW(hwnd, GWL_EXSTYLE, style & !(WS_EX_LAYERED as i32)) == 0
                        && windows_sys::Win32::Foundation::GetLastError() != 0 {
                        return Err(error("PIP 창 속성 복구 실패"));
                    }
                    RedrawWindow(hwnd, std::ptr::null(), std::ptr::null_mut(), RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN);
                }
                RemovePropW(hwnd, property_name().as_ptr());
                self.originals.remove(&handle);
                Ok(())
            }
        }

        pub fn restore_all(&mut self) -> Result<(), String> {
            let handles: Vec<_> = self.originals.keys().copied().collect();
            let mut errors = Vec::new();
            for handle in handles {
                if let Err(error) = self.restore_one(handle) { errors.push(error); }
            }
            if errors.is_empty() { Ok(()) } else { Err(errors.join("\n")) }
        }
    }

    impl Drop for PipTransparency {
        fn drop(&mut self) { let _ = self.restore_all(); }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn rejects_other_browser_windows() {
            for title in ["치지직", "Picture in picture - article", "", "YouTube"] {
                assert!(!is_pip_title(title));
            }
            assert!(is_pip_title("Picture in picture"));
            assert!(is_pip_title("화면 속 화면"));
        }

        #[test]
        fn rejects_stale_handles_and_invisible_values() {
            let mut state = PipTransparency::default();
            let stale = PipWindow { handle: 0, pid: 0, title: "Picture in picture".into(), browser: "Edge".into() };
            assert!(state.set(&stale, 50).is_err());
            assert!(state.set(&stale, 0).is_err());
            assert!(state.originals.is_empty());
        }
    }
}

#[cfg(windows)]
pub use platform::*;
