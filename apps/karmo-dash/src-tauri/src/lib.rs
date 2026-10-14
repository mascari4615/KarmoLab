mod handoff;

use std::{
    net::TcpListener,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static CONNECTING: AtomicBool = AtomicBool::new(false);

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn connect(app: AppHandle) {
    if CONNECTING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let nonce = format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            open::that(format!(
                "{}/?desktop_port={port}&desktop_nonce={nonce}",
                handoff::ORIGIN
            ))
            .map_err(|e| e.to_string())?;
            handoff::receive(listener, &nonce, |data| {
                let window = app.get_webview_window("main").ok_or("앱 창 없음")?;
                if window
                    .url()
                    .map_err(|e| e.to_string())?
                    .origin()
                    .ascii_serialization()
                    != handoff::ORIGIN
                {
                    return Err("앱 화면 출처 오류".into());
                }
                let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
                window.eval(&format!("for(const [k,v] of Object.entries({json})) localStorage.setItem(k,v); location.hash='#planner'; location.reload();")).map_err(|e| e.to_string())?;
                show(&app);
                Ok(())
            })
        })();
        CONNECTING.store(false, Ordering::SeqCst);
        if let Err(error) = result {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(message) = serde_json::to_string(&error) {
                    let _ = window.eval(&format!("alert({message})"));
                }
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if args.iter().any(|arg| arg == "--quit") {
                app.exit(0);
            } else {
                show(app);
            }
        }))
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            if std::env::args().any(|arg| arg == "--quit") {
                app.handle().exit(0);
                return Ok(());
            }
            let open = MenuItem::with_id(app, "open", "KarmoDash 열기", true, None::<&str>)?;
            let connect_item =
                MenuItem::with_id(app, "connect", "브라우저 연결 가져오기", true, None::<&str>)?;
            let reload = MenuItem::with_id(app, "reload", "새로고침", true, None::<&str>)?;
            let browser = MenuItem::with_id(app, "browser", "브라우저로 열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "끝내기", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &connect_item, &reload, &browser, &quit])?;
            app.set_menu(menu.clone())?;
            app.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show(app),
                "connect" => connect(app.clone()),
                "reload" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("location.hash='#planner'; location.reload();");
                    }
                }
                "browser" => {
                    let _ = open::that(format!("{}/#planner", handoff::ORIGIN));
                }
                "quit" => app.exit(0),
                _ => {}
            });
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(format!("{}/#planner", handoff::ORIGIN).parse()?),
            )
            .title("KarmoDash")
            .initialization_script("window.KarmoDashDesktop = true;")
            .inner_size(1280.0, 840.0)
            .min_inner_size(380.0, 600.0)
            .on_navigation(|url| {
                if url.origin().ascii_serialization() == handoff::ORIGIN {
                    return true;
                }
                if matches!(url.scheme(), "https" | "http") {
                    let _ = open::that(url.as_str());
                }
                false
            })
            .on_new_window(|url, _| {
                if matches!(url.scheme(), "https" | "http") {
                    let _ = open::that(url.as_str());
                }
                tauri::webview::NewWindowResponse::Deny
            })
            .build()?;
            TrayIconBuilder::with_id("dash")
                .tooltip("KarmoDash")
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("KarmoDash 실행 실패");
}
