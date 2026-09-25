//! 런처 백엔드. 목록 (manifest) 받기, 설치 상태와 최신 버전 재기, 받기와 설치, 실행, 삭제.
//!
//! 화면이 GitHub 에 직접 fetch 하면 CORS 로 막혀서 받기는 전부 여기서.
//! 설치 상태는 NSIS 가 남기는 레지스트리 (HKCU Uninstall) 에서 읽음. 런처 밖에서 깐 것도 보임.
//! 정본: memo/changes/launcher.md
use serde::Serialize;
use serde_json::Value;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

/// 목록 정본. 공개 저장소의 파일 하나 (API 가 아니라 raw 라 시간당 60회 제한 없음)
const MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/mascari4615/mascari4615.github.io/main/apps/karmo-launcher/manifest.json";

/// 앱마다 최신 판 (버전, 날짜, 주소, 서명). 릴리스 CI 가 판을 낼 때마다 그 앱 줄을 고쳐 씀 (memo changes/launcher.md 구조 결정)
const CATALOG_URL: &str =
    "https://github.com/mascari4615/mascari4615.github.io/releases/download/launcher-catalog/catalog.json";

/// 릴리스 서명 공개 키 (minisign, Tauri 업데이터와 같은 키. tauri.conf.json plugins.updater.pubkey)
const RELEASE_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDdCNERFQUE2MzRGNTVEQ0IKUldUTFhmVTBwdXBOZXdJMk1RODMyVEw0YjdvYjJZK3ovTzZRWUNlaUM2N2EvNlJxRzZmbkhuSmMK";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Tauri 서명 (minisign 서명 파일을 base64 로 한 번 더 싼 것) 으로 받은 파일을 확인
fn verify_signature(data: &[u8], signature_b64: &str) -> Result<(), String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let key_text = String::from_utf8(b64.decode(RELEASE_PUBKEY_B64).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let sig_text = String::from_utf8(b64.decode(signature_b64.trim()).map_err(|e| format!("서명 풀기 실패: {}", e))?).map_err(|e| e.to_string())?;
    let key = minisign_verify::PublicKey::decode(&key_text).map_err(|e| format!("공개 키 {:?}", e))?;
    let sig = minisign_verify::Signature::decode(&sig_text).map_err(|e| format!("서명 {:?}", e))?;
    key.verify(data, &sig, false).map_err(|_| "서명이 맞지 않음. 받은 파일을 실행하지 않음".to_string())
}

/// 한 앱의 최신 판. 목록 (catalog) 을 먼저 보고, 그 줄이 없으면 앱의 Tauri latest.json (옛 길)
struct Latest {
    version: Option<String>,
    pub_date: Option<String>,
    url: Option<String>,
    signature: Option<String>,
}

fn latest_of(app: &Value) -> Result<Latest, String> {
    let id = str_at(app, &["id"]).unwrap_or_default();
    if let Ok(text) = get_text(CATALOG_URL) {
        if let Ok(cat) = serde_json::from_str::<Value>(&text) {
            if let Some(e) = cat.get("apps").and_then(|a| a.get(id)) {
                return Ok(Latest {
                    version: str_at(e, &["version"]).map(String::from),
                    pub_date: str_at(e, &["pub_date"]).map(String::from),
                    url: str_at(e, &["url"]).map(String::from),
                    signature: str_at(e, &["signature"]).map(String::from),
                });
            }
        }
    }
    let url = str_at(app, &["source", "url"]).ok_or("최신 판을 물을 곳이 없음")?;
    let platform = str_at(app, &["source", "platform"]).unwrap_or("windows-x86_64");
    let latest: Value = serde_json::from_str(&get_text(url)?).map_err(|e| e.to_string())?;
    Ok(Latest {
        version: str_at(&latest, &["version"]).map(String::from),
        pub_date: str_at(&latest, &["pub_date"]).map(String::from),
        url: str_at(&latest, &["platforms", platform, "url"]).map(String::from),
        signature: str_at(&latest, &["platforms", platform, "signature"]).map(String::from),
    })
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("karmo-launcher")
        .build()
        .map_err(|e| e.to_string())
}

fn get_text(url: &str) -> Result<String, String> {
    let res = client()?.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("{} {}", res.status().as_u16(), url));
    }
    res.text().map_err(|e| e.to_string())
}

/// 개발 중에는 `KARMO_LAUNCHER_MANIFEST` 로 로컬 파일이나 다른 주소
#[tauri::command]
async fn fetch_manifest() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let src = std::env::var("KARMO_LAUNCHER_MANIFEST").unwrap_or_else(|_| MANIFEST_URL.to_string());
        let text = if src.starts_with("http") {
            get_text(&src)?
        } else {
            std::fs::read_to_string(&src).map_err(|e| format!("{}: {}", src, e))?
        };
        serde_json::from_str(&text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Default)]
struct Status {
    installed: bool,
    version: Option<String>,
    latest: Option<String>,
    pub_date: Option<String>,
    running: bool,
    download: Option<String>,
    signature: Option<String>,
    location: Option<String>,
    error: Option<String>,
}

/// HKCU Uninstall 키 하나의 값들. 없으면 None
fn registry(key: &str) -> Option<std::collections::HashMap<String, String>> {
    let path = format!(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", key);
    let mut cmd = Command::new("reg");
    cmd.args(["query", &path]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let mut map = std::collections::HashMap::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.trim().splitn(3, "    ").collect();
        if parts.len() == 3 && parts[1].starts_with("REG_") {
            map.insert(parts[0].to_string(), parts[2].trim().trim_matches('"').to_string());
        }
    }
    Some(map)
}

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// 실행 중인가. tasklist CSV 한 줄이 `"<exe>",` 로 시작하면 있음 (없으면 안내 문장 한 줄)
fn is_running(exe: &str) -> bool {
    let filter = format!("IMAGENAME eq {}", exe);
    let out = match hidden(Command::new("tasklist").args(["/FI", &filter, "/FO", "CSV", "/NH"])).output() {
        Ok(o) => o,
        Err(_) => return false,
    };
    let head = format!("\"{}\"", exe.to_lowercase());
    String::from_utf8_lossy(&out.stdout).lines().any(|l| l.trim().to_lowercase().starts_with(&head))
}

/// 실행 중인 것만 가볍게. 화면이 몇 초마다 부름 (최신 판은 다시 안 받음)
#[tauri::command]
fn running_status(registry_key: String) -> bool {
    registry(&registry_key)
        .and_then(|r| r.get("MainBinaryName").cloned())
        .map(|exe| is_running(&exe))
        .unwrap_or(false)
}

/// 끄기. 창 닫기만으로는 트레이로 숨는 앱이 실행 중으로 남음 (2026-09-25 KarmoLab)
/// 먼저 `<exe> --quit` 로 트레이 끝내기와 같은 길,
/// 그 인자를 모르는 옛 판은 3초 뒤 강제 종료
#[tauri::command]
async fn stop_app(registry_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop_blocking(&registry_key))
        .await
        .map_err(|e| e.to_string())?
}

fn stop_blocking(registry_key: &str) -> Result<(), String> {
    let reg = registry(registry_key).ok_or("설치 안 됨")?;
    let exe = reg.get("MainBinaryName").ok_or("실행 파일 이름 모름")?.clone();
    if let Some(dir) = reg.get("InstallLocation") {
        let _ = hidden(Command::new(std::path::Path::new(dir).join(&exe)).arg("--quit")).spawn();
    }
    for _ in 0..30 {
        if !is_running(&exe) {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let status = hidden(Command::new("taskkill").args(["/F", "/IM", &exe])).status().map_err(|e| e.to_string())?;
    if !status.success() && is_running(&exe) {
        return Err(format!("끄기 실패 {:?}", status.code()));
    }
    Ok(())
}

fn str_at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_str()
}

#[tauri::command]
async fn app_status(app: Value) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut st = Status::default();
        if let Some(key) = str_at(&app, &["install", "registry"]) {
            if let Some(reg) = registry(key) {
                st.installed = true;
                st.version = reg.get("DisplayVersion").cloned();
                st.location = reg.get("InstallLocation").cloned();
                st.running = reg.get("MainBinaryName").map(|exe| is_running(exe)).unwrap_or(false);
            }
        }
        if app.get("source").is_some() {
            match latest_of(&app) {
                Ok(l) => {
                    st.latest = l.version;
                    st.pub_date = l.pub_date;
                    st.download = l.url;
                    st.signature = l.signature;
                }
                Err(e) => st.error = Some(e),
            }
        }
        st
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
struct Progress {
    id: String,
    got: u64,
    total: u64,
    phase: String,
}

/// 받기 (진행을 `install-progress` 로), 설치 프로그램을 인자와 함께 실행, 끝날 때까지 대기.
/// GitHub 자산 API 주소는 `Accept: application/octet-stream` 이라야 파일이 옴
#[tauri::command]
async fn install_app(handle: AppHandle, id: String, url: String, args: Vec<String>, signature: String) -> Result<(), String> {
    /* 받아서 실행하는 파일이라 출처를 내 저장소 릴리스로 묶고, 받은 뒤 릴리스 서명 (minisign) 이 맞을 때만 실행 */
    if signature.trim().is_empty() {
        return Err("서명이 없는 판은 설치하지 않음".into());
    }
    const ALLOWED: [&str; 2] = [
        "https://github.com/mascari4615/",
        "https://api.github.com/repos/mascari4615/",
    ];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err(format!("허용 안 된 주소: {}", url));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let say = |got: u64, total: u64, phase: &str| {
            let _ = handle.emit("install-progress", Progress { id: id.clone(), got, total, phase: phase.to_string() });
        };
        let mut res = client()?
            .get(&url)
            .header("Accept", "application/octet-stream")
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("받기 실패 {}", res.status().as_u16()));
        }
        let total = res.content_length().unwrap_or(0);
        let dir = std::env::temp_dir().join("karmo-launcher");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file: PathBuf = dir.join(format!("{}-setup.exe", id));
        let mut out = std::fs::File::create(&file).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 256 * 1024];
        let mut got: u64 = 0;
        let mut last: u64 = 0;
        loop {
            let n = res.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            got += n as u64;
            if got - last > 1024 * 1024 {
                last = got;
                say(got, total, "download");
            }
        }
        drop(out);
        say(got, total, "verify");
        let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
        if let Err(e) = verify_signature(&bytes, &signature) {
            let _ = std::fs::remove_file(&file);
            return Err(e);
        }
        say(got, total, "install");
        let status = Command::new(&file).args(&args).status().map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&file);
        if !status.success() {
            return Err(format!("설치 프로그램이 {:?} 로 끝남", status.code()));
        }
        say(got, total, "done");
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 설치된 실행 파일. 레지스트리의 설치 자리와 본 실행 파일 이름
#[tauri::command]
fn launch_app(registry_key: String) -> Result<(), String> {
    let reg = registry(&registry_key).ok_or("설치 안 됨")?;
    let dir = reg.get("InstallLocation").ok_or("설치 자리 모름")?;
    let exe = reg.get("MainBinaryName").ok_or("실행 파일 이름 모름")?;
    Command::new(PathBuf::from(dir).join(exe)).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn uninstall_app(registry_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let reg = registry(&registry_key).ok_or("설치 안 됨")?;
        let un = reg.get("UninstallString").ok_or("제거 프로그램 모름")?;
        let status = Command::new(un).arg("/S").status().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("제거 프로그램이 {:?} 로 끝남", status.code()));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("https 주소만".into());
    }
    open::that(url).map_err(|e| e.to_string())
}

/// 런처 자신의 새 판. 있으면 판 번호, 없으면 None (tauri-plugin-updater, 엔드포인트는 tauri.conf 의 launcher-updater 릴리스)
#[tauri::command]
async fn self_update_check(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(u.version.clone())),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 새 판을 받아 설치하고 다시 켬. 받는 동안 `self-update-progress` (받은 바이트, 전체)
#[tauri::command]
async fn self_update_install(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("새 판이 없음".into());
    };
    let mut got: u64 = 0;
    let handle = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                got += chunk as u64;
                let _ = handle.emit("self-update-progress", (got, total.unwrap_or(0)));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

fn show_main(app: &AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        /* 두 번째로 켜면 새 창 대신 떠 있는 창을 앞으로 */
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            /* 트레이 (Steam 처럼 창을 닫아도 남음). 왼쪽 누르기는 창 열기, 메뉴는 열기와 끝내기 */
            let open = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "끝내기", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            /* 창과 트레이 아이콘을 파일에서 직접 박음. 기본 창 아이콘에 맡겼더니 작업 표시줄이 옛 별 아이콘으로
               돌아갔다 (사용자 2026-09-25 "계속 예전 아이콘으로 돌아가") */
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))?;
            {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_icon(icon.clone());
                }
            }
            let tray = TrayIconBuilder::with_id("main")
                .tooltip("Karmo Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(icon);
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            })
            .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![fetch_manifest, app_status, running_status, stop_app, self_update_check, self_update_install, install_app, launch_app, uninstall_app, open_url])
        .run(tauri::generate_context!())
        .expect("런처를 띄우지 못함");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 이 PC 의 KarmoLab 설치 기록과 최신 판 읽기 (네트워크, 레지스트리 실측). `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn karmolab_status_live() {
        let reg = registry("KarmoLab").expect("KarmoLab 레지스트리");
        assert!(reg.contains_key("DisplayVersion"));
        let latest: Value = serde_json::from_str(&get_text("https://github.com/mascari4615/mascari4615.github.io/releases/latest/download/latest.json").unwrap()).unwrap();
        assert!(str_at(&latest, &["platforms", "windows-x86_64-nsis", "url"]).is_some());
        println!("installed {:?} latest {:?}", reg.get("DisplayVersion"), latest.get("version"));
    }

    #[test]
    fn not_running_for_unknown_exe() {
        assert!(!is_running("karmo-launcher-no-such-app.exe"));
    }

    /// 탐색기는 늘 떠 있음. 있는 것을 있다고 읽는지
    #[test]
    fn running_for_explorer() {
        assert!(is_running("explorer.exe"));
    }

    /// 실제 KarmoLab 최신 설치 파일을 받아 latest.json 의 서명으로 확인 (네트워크 수십 MB). `cargo test -- --ignored`
    /// 떠 있는 KarmoLab 을 끄고 실행 중이 아닌지 (실제로 끔). `cargo test karmolab_stop_live -- --ignored`
    #[test]
    #[ignore]
    fn karmolab_stop_live() {
        let exe = registry("KarmoLab").and_then(|r| r.get("MainBinaryName").cloned()).expect("KarmoLab 레지스트리");
        assert!(is_running(&exe), "먼저 KarmoLab 을 켜 둔다");
        stop_blocking("KarmoLab").unwrap();
        assert!(!is_running(&exe));
    }

    #[test]
    #[ignore]
    fn karmolab_signature_live() {
        let app: Value = serde_json::json!({
            "id": "karmolab",
            "source": { "url": "https://github.com/mascari4615/mascari4615.github.io/releases/latest/download/latest.json", "platform": "windows-x86_64-nsis" }
        });
        let l = latest_of(&app).unwrap();
        let bytes = client().unwrap().get(l.url.unwrap()).header("Accept", "application/octet-stream").send().unwrap().bytes().unwrap();
        verify_signature(&bytes, l.signature.as_deref().unwrap()).expect("서명 확인");
        let mut bad = bytes.to_vec();
        bad[1000] ^= 0xff;
        assert!(verify_signature(&bad, l.signature.as_deref().unwrap()).is_err(), "한 바이트 바뀐 파일은 거절");
    }

    #[test]
    fn registry_missing_is_none() {
        assert!(registry("karmo-launcher-no-such-app").is_none());
    }
}
