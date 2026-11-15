use crate::window_opacity_native::{self, OpacityStatus, WindowTarget};
use crate::window_opacity_service::{self, Connection, Request};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use tauri::{Emitter, Manager};

#[derive(Clone, Default)]
pub struct WindowOpacityState {
    connection: Arc<Mutex<Option<Connection>>>,
    starting: Arc<AtomicBool>,
}

async fn operate(state: WindowOpacityState, request: Request, expected: Option<String>) -> Result<OpacityStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.connection.lock().map_err(|_| "투명도 상태 잠금 실패")?;
        if let Some(connection) = session.as_mut() {
            if expected.as_ref().is_some_and(|id| *id != connection.session_id) {
                return Err("다른 조절창에서 연결이 변경되었습니다. 상태를 확인한 뒤 다시 조절하세요.".into());
            }
            let closing = matches!(request, Request::Close);
            let result = connection.request(request);
            if (closing && result.is_ok()) || (!closing && result.is_err()) { *session = None; }
            result
        } else if matches!(request,Request::Status) { Ok(OpacityStatus { opacity: 100, ..Default::default() }) }
        else { Err("연결된 창이 없습니다. 게임 창을 다시 연결하세요.".into()) }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn window_opacity_list() -> Result<Vec<WindowTarget>, String> {
    tauri::async_runtime::spawn_blocking(window_opacity_native::list_windows).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn window_opacity_connect(app: tauri::AppHandle, state: tauri::State<'_, WindowOpacityState>, id: String) -> Result<OpacityStatus, String> {
    let state = state.inner().clone();
    if state.starting.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err() {
        return Err("다른 조절창에서 연결 중입니다. Windows 권한 창을 확인하세요.".into());
    }
    let starting = state.starting.clone();
    let status = tauri::async_runtime::spawn_blocking(move || {
        let target = window_opacity_native::list_windows()?.into_iter().find(|w| w.id == id).ok_or("선택한 창을 찾을 수 없습니다. 목록을 새로고침하세요.")?;
        {
            let mut session = state.connection.lock().map_err(|_| "투명도 상태 잠금 실패")?;
            if let Some(previous) = session.as_mut() { previous.request(Request::Close)?; }
            *session = None;
        }
        let mut connection = window_opacity_service::connect(target)?;
        let status = connection.request(Request::Status)?;
        let mut active = state.connection.lock().map_err(|_| "투명도 상태 잠금 실패")?;
        *active = Some(connection);
        Ok::<_, String>(status)
    }).await.map_err(|e| e.to_string());
    starting.store(false,Ordering::SeqCst);
    let status = status??;
    let _ = app.emit("window-opacity:changed", &status);
    Ok(status)
}

#[tauri::command]
pub async fn window_opacity_set(app: tauri::AppHandle, state: tauri::State<'_, WindowOpacityState>, opacity: u8, session_id: String) -> Result<OpacityStatus, String> {
    window_opacity_native::validate_opacity(opacity)?;
    let status = operate(state.inner().clone(), Request::Set { opacity }, Some(session_id)).await?;
    let _ = app.emit("window-opacity:changed", &status);
    Ok(status)
}

#[tauri::command]
pub async fn window_opacity_status(state: tauri::State<'_, WindowOpacityState>) -> Result<OpacityStatus, String> {
    operate(state.inner().clone(), Request::Status, None).await
}

#[tauri::command]
pub async fn window_opacity_restore(app: tauri::AppHandle, state: tauri::State<'_, WindowOpacityState>, session_id: String) -> Result<OpacityStatus, String> {
    operate(state.inner().clone(), Request::Close, Some(session_id)).await?;
    let status = OpacityStatus { opacity: 100, ..Default::default() };
    let _ = app.emit("window-opacity:changed", &status);
    Ok(status)
}

#[tauri::command]
pub async fn window_opacity_open_panel(app: tauri::AppHandle) -> Result<(), String> {
    let mut url = app.get_webview_window("main").ok_or("기본 창 없음")?.url().map_err(|e| e.to_string())?;
    let path = if url.path().contains("/apps/karmolab") { "/apps/karmolab/window-opacity.html" } else { "/window-opacity.html" };
    url.set_path(path); url.set_query(None); url.set_fragment(None);
    let (send, receive) = std::sync::mpsc::channel();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            if let Some(window) = app2.get_webview_window("window-opacity") {
                window.show().map_err(|e| e.to_string())?;
                return window.set_focus().map_err(|e| e.to_string());
            }
            tauri::WebviewWindowBuilder::new(&app2, "window-opacity", tauri::WebviewUrl::External(url))
                .title("창 투명도").inner_size(380.0, 340.0).min_inner_size(320.0, 300.0)
                .always_on_top(true).resizable(true).initialization_script("window.__KARMOLAB_DESKTOP__ = true;")
                .on_navigation(crate::allow_in_webview)
                .build().map(|_| ()).map_err(|e| e.to_string())
        })();
        let _ = send.send(result);
    }).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv_timeout(std::time::Duration::from_secs(10)).map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?
}

pub fn shutdown(state: &WindowOpacityState) {
    // 앱 종료에서 소켓을 닫으면 보조 프로세스가 원래 창 효과 복구.
    if let Ok(mut session) = state.connection.try_lock() { *session = None; }
}
