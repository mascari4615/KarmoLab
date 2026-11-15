//! 확장과 독립된 트레이 방송 창 제어.

use tauri::{menu::{IsMenuItem, Menu, MenuItem, Submenu}, Manager};

#[derive(Default)]
pub struct StreamingState {
    #[cfg(windows)]
    pub pip: std::sync::Mutex<crate::stream_windows::PipTransparency>,
}

const LEVELS: [u8; 5] = [20, 40, 60, 80, 100];

pub fn menu(app: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let refresh = MenuItem::with_id(app, "stream_refresh", "PIP 목록 새로고침", true, None::<&str>)?;
    let chat = MenuItem::with_id(app, "stream_chat_open", "복사한 치지직 주소로 투명 채팅 열기", true, None::<&str>)?;
    let restore = MenuItem::with_id(app, "stream_restore", "PIP 원래 투명도로 복구", true, None::<&str>)?;
    let mut entries: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = vec![Box::new(chat), Box::new(refresh), Box::new(restore)];
    #[cfg(windows)]
    {
        let windows = crate::stream_windows::list();
        if windows.is_empty() {
            entries.push(Box::new(MenuItem::with_id(app, "stream_none", "Edge 또는 Chrome에서 PIP를 연 뒤 새로고침", false, None::<&str>)?));
        }
        for window in windows {
            let levels: Vec<_> = LEVELS.iter().map(|percent| {
                MenuItem::with_id(app, format!("stream_pip_{}_{}_{}", window.handle, window.pid, percent), format!("불투명도 {percent}%"), true, None::<&str>)
            }).collect::<tauri::Result<_>>()?;
            let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = levels.iter().map(|i| i as _).collect();
            entries.push(Box::new(Submenu::with_items(app, format!("{} PIP", window.browser), true, &refs)?));
        }
    }
    let refs: Vec<_> = entries.iter().map(|i| i.as_ref()).collect();
    Submenu::with_items(app, "방송 창", cfg!(windows), &refs)
}

pub fn handle(app: &tauri::AppHandle, id: &str) -> bool {
    if !id.starts_with("stream_") { return false; }
    let result = handle_inner(app, id);
    if let Err(error) = result {
        use tauri_plugin_dialog::DialogExt;
        app.dialog().message(error).title("방송 창").show(|_| {});
    }
    true
}

fn handle_inner(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    if id == "stream_refresh" {
        crate::refresh_tray(app);
        return Ok(());
    }
    #[cfg(windows)]
    {
        if id == "stream_chat_open" {
            return open_chat(app, &clipboard_text()?);
        }
        let state = app.state::<StreamingState>();
        let mut pip = state.pip.lock().map_err(|_| "PIP 상태를 읽을 수 없습니다.")?;
        if id == "stream_restore" { return pip.restore_all(); }
        if let Some(raw) = id.strip_prefix("stream_pip_") {
            let parts: Vec<_> = raw.split('_').collect();
            if parts.len() != 3 { return Err("잘못된 PIP 메뉴입니다.".into()); }
            let handle: usize = parts[0].parse().map_err(|_| "잘못된 창 번호입니다.")?;
            let pid: u32 = parts[1].parse().map_err(|_| "잘못된 프로세스 번호입니다.")?;
            let percent: u8 = parts[2].parse().map_err(|_| "잘못된 불투명도입니다.")?;
            if !LEVELS.contains(&percent) { return Err("지원하지 않는 불투명도입니다.".into()); }
            let window = crate::stream_windows::list().into_iter().find(|w| w.handle == handle && w.pid == pid)
                .ok_or("PIP 창이 바뀌었습니다. 목록을 새로고침하세요.")?;
            pip.set(&window, percent)?;
        }
    }
    Ok(())
}

fn chat_url(raw: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw.trim()).map_err(|_| "치지직 방송 주소를 복사한 뒤 다시 선택하세요.")?;
    if url.scheme() != "https" || url.host_str() != Some("chzzk.naver.com") || !url.username().is_empty()
        || url.password().is_some() || url.port().is_some() {
        return Err("https://chzzk.naver.com/live/채널ID 주소가 필요합니다.".into());
    }
    let parts: Vec<_> = url.path().trim_end_matches('/').split('/').collect();
    if !(parts.len() == 3 || (parts.len() == 4 && parts[3] == "chat")) || parts[1] != "live"
        || parts[2].len() != 32 || !parts[2].bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("치지직 생방송 또는 별도 채팅 주소를 복사하세요.".into());
    }
    tauri::Url::parse(&format!("https://chzzk.naver.com/live/{}/chat", parts[2].to_ascii_lowercase())).map_err(|e| e.to_string())
}

pub(crate) fn open_chat(app: &tauri::AppHandle, raw: &str) -> Result<(), String> {
    let url = chat_url(raw)?;
    let channel = url.path().split('/').nth(2).ok_or("채널 ID가 없습니다.")?;
    let label = format!("stream-chat-{channel}");
    if let Some(window) = app.get_webview_window(&label) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    let mut items = Vec::new();
    for percent in [0, 25, 50, 75, 100] {
        items.push(MenuItem::with_id(app, format!("{label}-bg-{percent}"), format!("배경 불투명도 {percent}%"), true, None::<&str>).map_err(|e| e.to_string())?);
    }
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = items.iter().map(|i| i as _).collect();
    let background = Submenu::with_items(app, "배경", true, &refs).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&background]).map_err(|e| e.to_string())?;
    let prefix = format!("{label}-bg-");
    // 외부 페이지에는 capability를 추가하지 않음. 네이티브 메뉴로만 배경 제어.
    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
        .title("치지직 투명 채팅")
        .inner_size(400.0, 660.0)
        .min_inner_size(280.0, 300.0)
        .always_on_top(true)
        .transparent(true)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .initialization_script(include_str!("stream_chat.js"))
        .menu(menu)
        .on_navigation(|url| url.scheme() == "https" && matches!(url.host_str(), Some("chzzk.naver.com" | "nid.naver.com")))
        .on_new_window(|url, _| {
            if url.scheme() == "https" { let _ = open::that(url.as_str()); }
            tauri::webview::NewWindowResponse::Deny
        })
        .on_menu_event(move |window, event| {
            let Some(raw) = event.id().as_ref().strip_prefix(&prefix) else { return; };
            let Ok(percent) = raw.parse::<u8>() else { return; };
            if ![0, 25, 50, 75, 100].contains(&percent) { return; }
            let script = format!("if(location.origin==='https://chzzk.naver.com'){{document.documentElement.style.setProperty('--karmo-chat-alpha','{}');try{{localStorage.setItem('karmoChatBackground','{percent}')}}catch{{}}}}", percent as f32 / 100.0);
            if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                if let Err(error) = webview.eval(&script) { eprintln!("[stream-chat] 배경 변경 실패: {error}"); }
            }
        })
        .build().map_err(|e| format!("채팅창 생성 실패: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn clipboard_text() -> Result<String, String> {
    use winapi::um::{winbase::{GlobalLock, GlobalSize, GlobalUnlock}, winuser::{CloseClipboard, GetClipboardData, OpenClipboard, CF_UNICODETEXT}};
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 { return Err("클립보드를 열 수 없습니다. 잠시 뒤 다시 선택하세요.".into()); }
        struct Clipboard;
        impl Drop for Clipboard { fn drop(&mut self) { unsafe { CloseClipboard(); } } }
        let _guard = Clipboard;
        let handle = GetClipboardData(CF_UNICODETEXT);
        if handle.is_null() { return Err("치지직 방송 주소를 먼저 복사하세요.".into()); }
        let size = GlobalSize(handle);
        if size == 0 || size > 8192 { return Err("치지직 방송 주소 하나를 복사하세요.".into()); }
        let data = GlobalLock(handle) as *const u16;
        if data.is_null() { return Err("클립보드 글자를 읽을 수 없습니다.".into()); }
        let units = std::slice::from_raw_parts(data, size / 2);
        let end = units.iter().position(|c| *c == 0).unwrap_or(units.len());
        let text = String::from_utf16(&units[..end]).map_err(|_| "클립보드 글자가 올바르지 않습니다.".to_string());
        GlobalUnlock(handle);
        text
    }
}

pub fn restore(app: &tauri::AppHandle) {
    #[cfg(windows)]
    if let Ok(mut state) = app.state::<StreamingState>().pip.lock() {
        if let Err(error) = state.restore_all() { eprintln!("[stream-pip] {error}"); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restricts_clipboard_to_live_channels() {
        let id = "0123456789abcdef0123456789abcdef";
        assert_eq!(chat_url(&format!("https://chzzk.naver.com/live/{id}?tracking=x")).unwrap().as_str(), format!("https://chzzk.naver.com/live/{id}/chat"));
        for raw in ["https://example.com/live/0123456789abcdef0123456789abcdef", "javascript:alert(1)", "https://chzzk.naver.com.evil.test/live/a", "https://chzzk.naver.com/live/abc", "https://chzzk.naver.com/"] {
            assert!(chat_url(raw).is_err());
        }
    }
}
