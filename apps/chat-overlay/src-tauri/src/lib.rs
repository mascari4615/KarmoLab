mod ingest_server;
mod advisor_history;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
#[cfg(windows)]
use tauri::tray::{MouseButton, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, WindowEvent, Wry};

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/** `apps/chat-overlay` ( `src-tauri` 의 부모 ). `.env` · Vite 루트. */
fn chat_overlay_workspace_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn open_chat_overlay_folder() {
    let p = chat_overlay_workspace_dir();
    if let Err(e) = open::that(&p) {
        eprintln!("[chat-overlay] 폴더 열기 실패: {e}");
    }
}

fn open_dotenv_file() {
    let dir = chat_overlay_workspace_dir();
    let env_path = dir.join(".env");
    if env_path.exists() {
        if let Err(e) = open::that(&env_path) {
            eprintln!("[chat-overlay] .env 열기 실패: {e}");
        }
    } else if let Err(e) = open::that(&dir) {
        eprintln!("[chat-overlay] 폴더 열기 실패: {e}");
    }
}

fn overlay_state_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut dir = app.path().app_data_dir().ok()?;
    dir.push("chat-overlay");
    Some(dir)
}

fn state_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    Some(overlay_state_dir(app)?.join("window-state.json"))
}

fn load_window_state(app: &tauri::AppHandle) -> Option<WindowState> {
    let path = state_path(app)?;
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn persist_window_state(
    pos: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
    app: &tauri::AppHandle,
) {
    let st = WindowState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    };
    let Some(path) = state_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(bytes) = serde_json::to_string(&st) {
        let _ = std::fs::write(path, bytes);
    }
}

fn save_window_state(window: &tauri::Window, app: &tauri::AppHandle) {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    persist_window_state(pos, size, app);
}

fn apply_window_state(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    if let Some(st) = load_window_state(app) {
        let _ = window.set_position(PhysicalPosition::new(st.x, st.y));
        let _ = window.set_size(PhysicalSize::new(st.width, st.height));
    }
}

fn save_window_state_webview(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    persist_window_state(pos, size, app);
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
async fn submit_question(text: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || save_screen_request(text, false))
        .await.map_err(|e| e.to_string())?
}

fn save_screen_request(text: String, manual: bool) -> Result<serde_json::Value, String> {
    use std::io::Write;
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let text = text.trim();
    if (!manual && text.is_empty()) || text.chars().count() > 2000 {
        return Err("질문은 1~2000자로 입력하세요.".into());
    }
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let home = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let dir = PathBuf::from(home).join(".karmoddrine").join("civ-advisor");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let request_id = format!("{}-{}", now_ms(), SEQUENCE.fetch_add(1, Ordering::SeqCst));
    let capture_dir = dir.join("requests").join(&request_id);
    let mut command = std::process::Command::new(dir.join("venv/Scripts/python.exe"));
    command.arg("-X").arg("utf8").arg(dir.join("capture.py"))
        .args(["--backend", "wgc", "--output"]).arg(&capture_dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().map_err(|e| format!("화면 캡처 실행 실패: {e}"))?;
    if !output.status.success() {
        return Err(format!("화면 첨부 실패: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let raw = std::fs::read_to_string(capture_dir.join("latest.json")).map_err(|e| e.to_string())?;
    let observation: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new().create(true).append(true)
        .open(dir.join("questions.jsonl")).map_err(|e| e.to_string())?;
    let entry = serde_json::json!({"ts": now_ms(), "text": text,
        "id": request_id, "kind": if manual { "screen" } else { "question" }, "observation": observation});
    writeln!(file, "{}", entry)
        .map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(entry)
}

#[cfg(test)]
mod advisor_tests {
    use super::*;

    #[test]
    fn invalid_question_is_rejected_before_capture() {
        assert!(save_screen_request(String::new(), false).is_err());
        assert!(save_screen_request("가".repeat(2001), false).is_err());
    }

    #[test]
    #[ignore = "Requires the local advisor conversation files"]
    fn local_advisor_history_includes_questions_and_answers() {
        let rows = advisor_history::load_advisor_history().unwrap();
        assert!(rows.iter().any(|row| row["source"] == "question"));
        assert!(rows.iter().any(|row| row["source"] == "answer"));
        assert!(rows.iter().all(|row| row["record"].is_object()));
    }

    #[test]
    #[ignore = "Requires the local capture runtime and a running Civ game"]
    fn live_question_has_retained_game_capture() {
        save_screen_request("화면 첨부 연결 검증 메시지".into(), false).unwrap();
        let root = PathBuf::from(std::env::var("USERPROFILE").unwrap())
            .join(".karmoddrine/civ-advisor");
        let queue = std::fs::read_to_string(root.join("questions.jsonl")).unwrap();
        let entry: serde_json::Value = serde_json::from_str(queue.lines().last().unwrap()).unwrap();
        let observation = &entry["observation"];
        assert_eq!(entry["kind"], "question");
        assert_eq!(observation["mode"], "windows-graphics-capture");
        assert!(observation["window"]["executable"].as_str().unwrap().starts_with("Civ7_"));
        assert!(Path::new(observation["image"].as_str().unwrap()).exists());
        assert!(observation["image"].as_str().unwrap().contains("requests"));
    }
}

fn emit_test_chat(app: &tauri::AppHandle) {
    let ts = now_ms();
    let _ = app.emit(
        "extension-ingest",
        serde_json::json!({
            "author": "테스트",
            "text": format!("테스트 메시지 ({ts})"),
            "ts": ts,
        }),
    );
}

/// 트레이 메뉴 문구·툴팁을 `창 / 클릭통과 / 편집모드` 상태에 맞춤
struct TrayMenuSync {
    tray: TrayIcon<Wry>,
    item_window: MenuItem<Wry>,
    item_ct: MenuItem<Wry>,
    item_layout: MenuItem<Wry>,
    ig: Arc<AtomicBool>,
    le: Arc<AtomicBool>,
}

impl TrayMenuSync {
    fn refresh(&self, app: &tauri::AppHandle<Wry>) {
        let win_visible = app
            .get_webview_window("main")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(true);
        let ct = self.ig.load(Ordering::SeqCst);
        let layout_on = self.le.load(Ordering::SeqCst);

        let _ = self.item_window.set_text(format!(
            "창: {} · 클릭 시 전환",
            if win_visible { "보임" } else { "숨김" }
        ));
        let _ = self.item_ct.set_text(format!(
            "클릭 통과: {} · Ctrl+Shift+T",
            if ct { "켜짐" } else { "꺼짐" }
        ));
        let _ = self.item_layout.set_text(format!(
            "편집 모드: {} · Ctrl+Shift+E",
            if layout_on { "켜짐" } else { "꺼짐" }
        ));

        let tip = format!(
            "chat-overlay — 창:{} · 통과:{} · 편집:{}",
            if win_visible { "보임" } else { "숨김" },
            if ct { "켜짐" } else { "꺼짐" },
            if layout_on { "켜짐" } else { "꺼짐" }
        );
        let _ = self.tray.set_tooltip(Some(tip));
    }
}

fn tray_refresh(app: &tauri::AppHandle<Wry>) {
    if let Some(sync) = app.try_state::<TrayMenuSync>() {
        sync.refresh(app);
    }
}

/// 전체화면/최대화에 빠졌을 때 복구 + 기본 크기로 되돌림 (단축키·트레이에서 공통 사용).
/// move/resize 손잡이 표시 여부. 켜면 마우스 이벤트를 받아야 하므로 클릭 통과는 잠시 끔.
struct MouseInteraction {
    ignore_mouse: Arc<AtomicBool>,
    layout_edit: Arc<AtomicBool>,
    question_open: AtomicBool,
}

fn should_ignore_mouse(base: bool, editing: bool, question: bool) -> bool {
    base && !editing && !question
}

#[tauri::command]
fn close_question(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<MouseInteraction>();
    state.question_open.store(false, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        w.set_ignore_cursor_events(should_ignore_mouse(
            state.ignore_mouse.load(Ordering::SeqCst),
            state.layout_edit.load(Ordering::SeqCst),
            false,
        )).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn apply_layout_edit(
    app: &tauri::AppHandle,
    layout_edit: &Arc<AtomicBool>,
    ignore_mouse: &Arc<AtomicBool>,
    visible: bool,
) {
    layout_edit.store(visible, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        if visible {
            let _ = w.set_ignore_cursor_events(false);
            let _ = w.set_focus();
        } else {
            let question = app.state::<MouseInteraction>().question_open.load(Ordering::SeqCst);
            let _ = w.set_ignore_cursor_events(should_ignore_mouse(ignore_mouse.load(Ordering::SeqCst), false, question));
        }
    }
    let _ = app.emit(
        "layout-edit",
        serde_json::json!({ "visible": visible }),
    );
    tray_refresh(app);
}

fn reset_window_layout(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    const DEFAULT_X: i32 = 40;
    const DEFAULT_Y: i32 = 40;
    const DEFAULT_W: u32 = 420;
    const DEFAULT_H: u32 = 640;

    let _ = w.set_fullscreen(false);
    let _ = w.unmaximize();
    let _ = w.set_size(PhysicalSize::new(DEFAULT_W, DEFAULT_H));
    let _ = w.set_position(PhysicalPosition::new(DEFAULT_X, DEFAULT_Y));
    let _ = w.show();
    let _ = w.set_focus();

    if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
        persist_window_state(pos, size, app);
    }
    tray_refresh(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(p) = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|d| d.join(".env"))
    {
        if p.exists() {
            let _ = dotenvy::from_path(&p);
        }
    }

    // 기본은 "이동/설정 가능" 상태로 시작: 클릭 통과를 켜면 드래그 영역도 함께 막히기 때문.
    let ignore_mouse = Arc::new(AtomicBool::new(option_env!("VITE_ADVISOR_MODE") == Some("1")));
    let layout_edit = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .manage(MouseInteraction {
            ignore_mouse: ignore_mouse.clone(),
            layout_edit: layout_edit.clone(),
            question_open: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![submit_question, close_question, advisor_history::load_advisor_history])
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            tray_refresh(app);
        }))
        .setup({
            let ignore_mouse = ignore_mouse.clone();
            let layout_edit = layout_edit.clone();
            move |app| {
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

                    app.handle().plugin(
                        tauri_plugin_global_shortcut::Builder::new()
                            .with_shortcuts([
                                "ctrl+shift+0",
                                "ctrl+shift+t",
                                "ctrl+shift+e",
                                "ctrl+shift+q",
                                "ctrl+shift+s",
                                "ctrl+shift+comma",
                            ])?
                            .with_handler({
                                let ig = ignore_mouse.clone();
                                let le = layout_edit.clone();
                                move |app, shortcut, event| {
                                    if event.state != ShortcutState::Pressed {
                                        return;
                                    }
                                    let ctrl_shift =
                                        Modifiers::CONTROL.union(Modifiers::SHIFT);
                                    if shortcut.matches(ctrl_shift, Code::Digit0) {
                                        reset_window_layout(app);
                                    } else if shortcut.matches(ctrl_shift, Code::KeyT) {
                                        let v = option_env!("VITE_ADVISOR_MODE") == Some("1") || !ig.load(Ordering::SeqCst);
                                        ig.store(v, Ordering::SeqCst);
                                        if !le.load(Ordering::SeqCst) {
                                            if let Some(w) = app.get_webview_window("main") {
                                                let question = app.state::<MouseInteraction>().question_open.load(Ordering::SeqCst);
                                                let _ = w.set_ignore_cursor_events(should_ignore_mouse(v, false, question));
                                            }
                                        }
                                        tray_refresh(app);
                                    } else if shortcut.matches(ctrl_shift, Code::KeyE) {
                                        let v = !le.load(Ordering::SeqCst);
                                        apply_layout_edit(app, &le, &ig, v);
                                    } else if shortcut.matches(ctrl_shift, Code::KeyS) {
                                        let handle = app.clone();
                                        std::thread::spawn(move || {
                                            let result = save_screen_request(String::new(), true);
                                            let text = match result {
                                                Ok(_) => "지금 게임 화면을 전달했어요.".to_string(),
                                                Err(error) => error,
                                            };
                                            let _ = handle.emit("extension-ingest", serde_json::json!({
                                                "author": "캡처", "text": text, "ts": now_ms()
                                            }));
                                        });
                                    } else if shortcut.matches(ctrl_shift, Code::KeyQ) {
                                        app.state::<MouseInteraction>().question_open.store(true, Ordering::SeqCst);
                                        if let Some(w) = app.get_webview_window("main") {
                                            let _ = w.set_ignore_cursor_events(false);
                                            let _ = w.show();
                                            let _ = w.set_focus();
                                        }
                                        let _ = app.emit("question-focus", serde_json::json!({}));
                                        tray_refresh(app);
                                    } else if shortcut.matches(ctrl_shift, Code::Comma) {
                                        let _ = app.emit("theme-editor-toggle", serde_json::json!({}));
                                    }
                                }
                            })
                            .build(),
                    )?;
                }

                let handle = app.handle().clone();
                let window = app
                    .get_webview_window("main")
                    .expect("main webview window must exist");
                apply_window_state(&window, &handle);
                let _ = window.set_always_on_top(true);
                let _ = window.set_ignore_cursor_events(ignore_mouse.load(Ordering::SeqCst));

                #[cfg(debug_assertions)]
                eprintln!(
                    "chat-overlay: 실행 중입니다. 작업 표시줄에는 안 보일 수 있습니다(트레이·투명 창). \
                     창이 안 보이면 Ctrl+Shift+0(위치 초기화) 또는 트레이 아이콘 더블클릭."
                );

                ingest_server::spawn_ingest_server(handle.clone());

                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                {
                    let vis_toggle_i = MenuItem::with_id(
                        app,
                        "tray_toggle_visible",
                        "창 표시 전환",
                        true,
                        None::<&str>,
                    )?;
                    let toggle_i = MenuItem::with_id(
                        app,
                        "tray_toggle_ct",
                        "클릭 통과 전환",
                        true,
                        None::<&str>,
                    )?;
                    let reset_i = MenuItem::with_id(
                        app,
                        "tray_reset",
                        "창 크기 초기화 (Ctrl+Shift+0)",
                        true,
                        None::<&str>,
                    )?;
                    let layout_edit_i = MenuItem::with_id(
                        app,
                        "tray_layout_edit",
                        "편집 모드 (손잡이) — Ctrl+Shift+E",
                        true,
                        None::<&str>,
                    )?;
                    let theme_editor_i = MenuItem::with_id(
                        app,
                        "tray_theme_editor",
                        "채팅 스타일… (Ctrl+Shift+,)",
                        true,
                        None::<&str>,
                    )?;
                    let test_chat_i = MenuItem::with_id(
                        app,
                        "tray_test_chat",
                        "테스트 채팅 보내기",
                        true,
                        None::<&str>,
                    )?;
                    let sep_before_dev = PredefinedMenuItem::separator(app)?;
                    let open_folder_i = MenuItem::with_id(
                        app,
                        "tray_open_overlay_folder",
                        "chat-overlay 폴더 열기",
                        true,
                        None::<&str>,
                    )?;
                    let open_env_i = MenuItem::with_id(
                        app,
                        "tray_open_env",
                        ".env 파일 열기",
                        true,
                        None::<&str>,
                    )?;
                    let sep_before_quit = PredefinedMenuItem::separator(app)?;
                    let quit_i = MenuItem::with_id(app, "tray_quit", "종료", true, None::<&str>)?;
                    let menu = Menu::with_items(
                        app,
                        &[
                            &vis_toggle_i,
                            &toggle_i,
                            &layout_edit_i,
                            &reset_i,
                            &theme_editor_i,
                            &test_chat_i,
                            &sep_before_dev,
                            &open_folder_i,
                            &open_env_i,
                            &sep_before_quit,
                            &quit_i,
                        ],
                    )?;

                    let ig = ignore_mouse.clone();
                    let le = layout_edit.clone();
                    if let Some(icon) = app.default_window_icon().cloned() {
                        let tray = TrayIconBuilder::new()
                            .icon(icon)
                            .menu(&menu)
                            .tooltip("chat-overlay")
                            .show_menu_on_left_click(true)
                            .on_menu_event(move |app, event| {
                                if event.id == "tray_toggle_visible" {
                                    if let Some(w) = app.get_webview_window("main") {
                                        if w.is_visible().unwrap_or(true) {
                                            let _ = w.hide();
                                        } else {
                                            let _ = w.unminimize();
                                            let _ = w.show();
                                            let _ = w.set_focus();
                                        }
                                    }
                                    tray_refresh(app);
                                } else if event.id == "tray_toggle_ct" {
                                    let v = option_env!("VITE_ADVISOR_MODE") == Some("1") || !ig.load(Ordering::SeqCst);
                                    ig.store(v, Ordering::SeqCst);
                                    if !le.load(Ordering::SeqCst) {
                                        if let Some(w) = app.get_webview_window("main") {
                                            let question = app.state::<MouseInteraction>().question_open.load(Ordering::SeqCst);
                                            let _ = w.set_ignore_cursor_events(should_ignore_mouse(v, false, question));
                                        }
                                    }
                                    tray_refresh(app);
                                } else if event.id == "tray_layout_edit" {
                                    let v = !le.load(Ordering::SeqCst);
                                    apply_layout_edit(app, &le, &ig, v);
                                } else if event.id == "tray_reset" {
                                    reset_window_layout(app);
                                } else if event.id == "tray_theme_editor" {
                                    let _ = app.emit("theme-editor-toggle", serde_json::json!({}));
                                } else if event.id == "tray_test_chat" {
                                    emit_test_chat(app);
                                } else if event.id == "tray_open_overlay_folder" {
                                    open_chat_overlay_folder();
                                } else if event.id == "tray_open_env" {
                                    open_dotenv_file();
                                } else if event.id == "tray_quit" {
                                    if let Some(w) = app.get_webview_window("main") {
                                        save_window_state_webview(&w, app);
                                    }
                                    app.exit(0);
                                }
                            })
                            .on_tray_icon_event(|tray, event| {
                                #[cfg(windows)]
                                if let TrayIconEvent::DoubleClick {
                                    button: MouseButton::Left,
                                    ..
                                } = event
                                {
                                    let app = tray.app_handle();
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                        let _ = w.set_focus();
                                    }
                                    tray_refresh(app);
                                }
                                #[cfg(not(windows))]
                                let _ = (tray, event);
                            })
                            .build(app)?;

                        let tray_sync = TrayMenuSync {
                            tray,
                            item_window: vis_toggle_i.clone(),
                            item_ct: toggle_i.clone(),
                            item_layout: layout_edit_i.clone(),
                            ig: ignore_mouse.clone(),
                            le: layout_edit.clone(),
                        };
                        tray_sync.refresh(app.handle());
                        app.manage(tray_sync);
                    }
                }

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                save_window_state(window, &window.app_handle());
                let _ = window.hide();
                tray_refresh(&window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error building chat-overlay")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(w) = app_handle.get_webview_window("main") {
                    save_window_state_webview(&w, app_handle);
                }
            }
        });
}
