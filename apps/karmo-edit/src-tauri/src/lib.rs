mod downloads;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            downloads::download_save,
            downloads::download_reveal,
            downloads::download_open,
        ])
        .run(tauri::generate_context!())
        .expect("앱 실행 실패");
}
