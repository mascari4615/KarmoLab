//! 선택한 창 하나의 투명도와 원상복구. 관리자 보조 모드에서도 같은 구현 사용.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowTarget {
    pub id: String,
    pub process_id: u32,
    pub title: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct OpacityStatus {
    pub session_id: Option<String>,
    pub target: Option<WindowTarget>,
    pub opacity: u8,
    pub changed: bool,
}

pub fn validate_opacity(value: u8) -> Result<u8, String> {
    if (20..=100).contains(&value) { Ok(value) }
    else { Err("불투명도는 20~100% 사이여야 합니다.".into()) }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use windows_sys::Win32::{
        Foundation::{GetLastError, SetLastError, BOOL, HWND, LPARAM},
        UI::WindowsAndMessaging::{
            EnumWindows, GetLayeredWindowAttributes, GetWindowLongW, GetWindowTextW,
            GetWindowThreadProcessId, IsWindow, IsWindowVisible, SetLayeredWindowAttributes,
            SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA, WS_EX_LAYERED,
        },
    };

    fn hwnd(target: &WindowTarget) -> Result<HWND, String> {
        target.id.parse::<usize>().map(|v| v as HWND).map_err(|_| "잘못된 창 ID".into())
    }
    fn error() -> String { std::io::Error::last_os_error().to_string() }
    fn style(h: HWND) -> Result<i32, String> {
        unsafe {
            SetLastError(0);
            let value = GetWindowLongW(h, GWL_EXSTYLE);
            if value == 0 && GetLastError() != 0 { Err(error()) } else { Ok(value) }
        }
    }
    fn set_style(h: HWND, value: i32) -> Result<(), String> {
        unsafe {
            SetLastError(0);
            let old = SetWindowLongW(h, GWL_EXSTYLE, value);
            if old == 0 && GetLastError() != 0 { Err(error()) } else { Ok(()) }
        }
    }
    pub fn validate_target(target: &WindowTarget) -> Result<(), String> {
        let h = hwnd(target)?;
        let mut pid = 0;
        unsafe {
            if IsWindow(h) == 0 { return Err("선택한 창이 닫혔습니다. 창을 다시 선택하세요.".into()); }
            GetWindowThreadProcessId(h, &mut pid);
        }
        if pid != target.process_id || pid == 0 { Err("선택한 창의 프로그램이 변경되었습니다.".into()) }
        else { Ok(()) }
    }
    unsafe extern "system" fn collect(h: HWND, data: LPARAM) -> BOOL {
        if IsWindowVisible(h) == 0 { return 1; }
        let mut title = [0u16; 512];
        let len = GetWindowTextW(h, title.as_mut_ptr(), title.len() as i32);
        if len <= 0 { return 1; }
        let mut pid = 0;
        GetWindowThreadProcessId(h, &mut pid);
        if pid == 0 || pid == std::process::id() { return 1; }
        let result = &mut *(data as *mut Vec<WindowTarget>);
        result.push(WindowTarget { id: (h as usize).to_string(), process_id: pid,
            title: String::from_utf16_lossy(&title[..len as usize]) });
        if result.len() >= 256 { 0 } else { 1 }
    }
    pub fn list_windows() -> Result<Vec<WindowTarget>, String> {
        let mut result = Vec::<WindowTarget>::new();
        unsafe { EnumWindows(Some(collect), &mut result as *mut _ as LPARAM); }
        result.sort_by(|a,b| a.title.cmp(&b.title));
        Ok(result)
    }

    pub struct SavedWindow {
        target: WindowTarget,
        original_layered: bool,
        original_color: u32,
        original_alpha: u8,
        original_flags: u32,
        changed: bool,
        opacity: u8,
    }
    impl SavedWindow {
        pub fn new(target: WindowTarget) -> Result<Self, String> {
            validate_target(&target)?;
            let h = hwnd(&target)?;
            let layered = style(h)? as u32 & WS_EX_LAYERED != 0;
            let (mut color, mut alpha, mut flags) = (0, 255, LWA_ALPHA);
            if layered && unsafe { GetLayeredWindowAttributes(h, &mut color, &mut alpha, &mut flags) } == 0 {
                return Err("이미 다른 투명 효과를 사용하는 창입니다. 기존 효과를 해제한 뒤 다시 선택하세요.".into());
            }
            Ok(Self { target, original_layered: layered, original_color: color,
                original_alpha: alpha, original_flags: flags, changed: false,
                opacity: ((alpha as u32 * 100 + 127) / 255) as u8 })
        }
        pub fn status(&self) -> Result<OpacityStatus, String> {
            validate_target(&self.target)?;
            Ok(OpacityStatus { session_id: None, target: Some(self.target.clone()), opacity: self.opacity, changed: self.changed })
        }
        pub fn restore(&mut self) -> Result<OpacityStatus, String> {
            if validate_target(&self.target).is_err() {
                self.changed = false;
                return Ok(OpacityStatus::default());
            }
            if self.changed {
                let h = hwnd(&self.target)?;
                if self.original_layered {
                    if unsafe { SetLayeredWindowAttributes(h, self.original_color, self.original_alpha, self.original_flags) } == 0 {
                        return Err(error());
                    }
                } else {
                    set_style(h, style(h)? & !(WS_EX_LAYERED as i32))?;
                    if style(h)? as u32 & WS_EX_LAYERED != 0 { return Err("원래 창 스타일 복구 실패".into()); }
                }
                self.changed = false;
            }
            self.opacity = ((self.original_alpha as u32 * 100 + 127) / 255) as u8;
            self.status()
        }
        pub fn apply(&mut self, percent: u8) -> Result<OpacityStatus, String> {
            validate_opacity(percent)?;
            validate_target(&self.target)?;
            let h = hwnd(&self.target)?;
            let result = (|| {
                set_style(h, style(h)? | WS_EX_LAYERED as i32)?;
                self.changed = true;
                let alpha = ((percent as u32 * 255 + 50) / 100) as u8;
                if unsafe { SetLayeredWindowAttributes(h, 0, alpha, LWA_ALPHA) } == 0 { return Err(error()); }
                let (mut color, mut actual, mut flags) = (0, 0, 0);
                if unsafe { GetLayeredWindowAttributes(h, &mut color, &mut actual, &mut flags) } == 0 || actual != alpha {
                    return Err("창 투명도 적용 확인 실패".into());
                }
                self.opacity = percent;
                self.status()
            })();
            if let Err(ref cause) = result {
                if let Err(restore) = self.restore() { return Err(format!("{cause}; 복구 실패: {restore}")); }
            }
            result
        }
    }
    impl Drop for SavedWindow {
        fn drop(&mut self) { if let Err(e) = self.restore() { eprintln!("[window-opacity] restore: {e}"); } }
    }
}

#[cfg(windows)]
pub use platform::*;

#[cfg(not(windows))]
pub fn list_windows() -> Result<Vec<WindowTarget>, String> { Err("Windows 앱에서 사용할 수 있습니다.".into()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invisible_and_out_of_range_values() {
        for value in [0, 1, 19, 101, 255] { assert!(validate_opacity(value).is_err()); }
        for value in [20, 80, 100] { assert_eq!(validate_opacity(value).unwrap(),value); }
    }
}
