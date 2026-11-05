// 자체 설치 화면. 설치, 제거, 업데이트 서명은 기존 NSIS 설치 파일을 그대로 사용
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    env, fs,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

static PAYLOAD: &[u8] = include_bytes!(env!("KARMO_SETUP_PAYLOAD_PATH"));
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const APP_DIR: &str = "Karmo Launcher";
const APP_EXE: &str = "karmo-launcher.exe";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Karmo Launcher";

#[derive(Serialize)]
struct Info {
    dir: String,
    installed: bool,
}

fn installed_dir() -> Option<String> {
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(UNINSTALL_KEY).ok()?;
    let raw: String = key.get_value("InstallLocation").ok()?;
    let dir = raw.trim_matches('"').to_string();
    Path::new(&dir).join(APP_EXE).is_file().then_some(dir)
}

fn default_dir() -> Result<String, String> {
    let base = env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA 를 찾지 못함".to_string())?;
    Ok(Path::new(&base).join(APP_DIR).to_string_lossy().into_owned())
}

/// 설치 경로 계산. 고른 폴더 이름이 앱 폴더면 그대로, 아니면 그 아래 앱 폴더
fn app_dir_in(picked: &Path) -> PathBuf {
    if picked.file_name().is_some_and(|n| n == APP_DIR) {
        picked.to_path_buf()
    } else {
        picked.join(APP_DIR)
    }
}

#[tauri::command]
fn info() -> Result<Info, String> {
    match installed_dir() {
        Some(dir) => Ok(Info { dir, installed: true }),
        None => Ok(Info { dir: default_dir()?, installed: false }),
    }
}

#[tauri::command]
async fn pick_dir(app: AppHandle, current: String) -> Result<Option<String>, String> {
    let start = Path::new(&current).parent().map(Path::to_path_buf);
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file();
        if let Some(start) = start.filter(|p| p.is_dir()) {
            dialog = dialog.set_directory(start);
        }
        let picked = dialog.blocking_pick_folder()?;
        let path = picked.into_path().ok()?;
        Some(app_dir_in(&path).to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())
}

fn install_blocking(dir: &str) -> Result<(), String> {
    if PAYLOAD.is_empty() {
        return Err("이 빌드에는 설치 파일이 없습니다".into());
    }
    let temp = env::temp_dir().join(format!("karmo-launcher-install-{}.exe", std::process::id()));
    fs::write(&temp, PAYLOAD).map_err(|e| format!("설치 파일 쓰기 실패: {e}"))?;
    /* NSIS 규칙: /D 는 맨 끝, 공백이 있어도 따옴표 없이 */
    let run = Command::new(&temp).arg("/S").raw_arg(format!("/D={dir}")).creation_flags(CREATE_NO_WINDOW).status();
    let _ = fs::remove_file(&temp);
    let status = run.map_err(|e| format!("설치 실행 실패: {e}"))?;
    if !status.success() {
        return Err(format!("설치 프로그램 종료 코드 {}", status.code().unwrap_or(-1)));
    }
    if !Path::new(dir).join(APP_EXE).is_file() {
        return Err("설치 뒤 실행 파일을 찾지 못했습니다".into());
    }
    Ok(())
}

#[tauri::command]
async fn install(dir: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install_blocking(&dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn launch(app: AppHandle, dir: String) -> Result<(), String> {
    Command::new(Path::new(&dir).join(APP_EXE)).spawn().map_err(|e| format!("실행 실패: {e}"))?;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![info, pick_dir, install, launch])
        .run(tauri::generate_context!())
        .expect("설치 화면 실행 실패");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_dir_is_not_nested_twice() {
        assert_eq!(app_dir_in(Path::new(r"D:\Games")), Path::new(r"D:\Games\Karmo Launcher"));
        assert_eq!(app_dir_in(Path::new(r"D:\Karmo Launcher")), Path::new(r"D:\Karmo Launcher"));
    }
}
