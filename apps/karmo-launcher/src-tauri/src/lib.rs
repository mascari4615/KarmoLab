//! 런처 백엔드. 목록 (manifest) 받기, 설치 상태와 최신 버전 재기, 받기와 설치, 실행, 삭제.
//!
//! 화면이 GitHub 에 직접 fetch 하면 CORS 로 막혀서 받기는 전부 여기서.
//! 설치 형식 셋 (`install.format`):
//! - `nsis`: 설치 프로그램. 상태는 NSIS 가 남기는 HKCU Uninstall 레지스트리. 런처 밖에서 깐 것도 보임
//! - `zip`: 압축을 런처 데이터 폴더 `apps/<id>` 에 풂. 상태는 그 폴더의 `.karmo-version`
//! - `local`: 받지 않음. 작업 폴더 (설정) 아래에 파일이 있으면 그것을 실행
//!
//! 목록은 둘. 공개 목록 (KarmoLab 저장소) 과 비공개 목록 (memo 저장소, GitHub 토큰이 있어야 읽힘).
//! 토큰은 Windows 자격 증명 관리자에 런처 이름으로 보관.
//! 정본: memo/changes/launcher.md
use serde::Serialize;
use serde_json::Value;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

/// 공개 목록 정본. 공개 저장소의 파일 하나 (API 가 아니라 raw 라 시간당 60회 제한 없음)
const MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/mascari4615/KarmoLab/main/apps/karmo-launcher/manifest.json";

/// 비공개 목록. memo (private) 라 토큰이 없으면 404. 공개 목록에 비공개 항목 이름을 남기지 않으려고 따로 둠
const PRIVATE_MANIFEST_API: &str =
    "https://api.github.com/repos/mascari4615/memo/contents/data/launcher/apps.json";

/// 토큰을 붙여 보내는 곳. 내 저장소 API 만 (다른 주소로 토큰이 새지 않게)
const OWNER_API: &str = "https://api.github.com/repos/mascari4615/";

/// 자격 증명 관리자 항목 이름
const TOKEN_TARGET: &str = "karmo-launcher:github";

/// 이 PC 의 git 로그인 (Git Credential Manager 가 남기는 항목). 사용자가 버튼을 눌렀을 때만 읽음
const GIT_LOGIN_TARGET: &str = "git:https://github.com";

/// 앱마다 최신 판 (버전, 날짜, 주소, 서명). 릴리스 CI 가 판을 낼 때마다 그 앱 줄을 고쳐 씀 (memo changes/launcher.md 구조 결정)
const CATALOG_URL: &str =
    "https://github.com/mascari4615/KarmoLab/releases/download/launcher-catalog/catalog.json";

/// 릴리스 서명 공개 키 (minisign, Tauri 업데이터와 같은 키. tauri.conf.json plugins.updater.pubkey)
const RELEASE_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDdCNERFQUE2MzRGNTVEQ0IKUldUTFhmVTBwdXBOZXdJMk1RODMyVEw0YjdvYjJZK3ovTzZRWUNlaUM2N2EvNlJxRzZmbkhuSmMK";

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

/// 받은 파일의 sha256 이 GitHub 가 적어 둔 값 (`digest`) 과 같은지. zip 처럼 minisign 서명이 없는 판에 씀
#[cfg(test)]
fn verify_sha256(data: &[u8], want_hex: &str) -> Result<(), String> {
    use sha2::Digest;
    same_sha256(sha2::Sha256::digest(data).as_slice(), want_hex)
}

fn same_sha256(got: &[u8], want_hex: &str) -> Result<(), String> {
    let got: String = got.iter().map(|b| format!("{:02x}", b)).collect();
    if got.eq_ignore_ascii_case(want_hex.trim()) {
        Ok(())
    } else {
        Err("sha256 이 맞지 않음. 받은 파일을 풀지 않음".into())
    }
}

/* ---------- GitHub 토큰 (자격 증명 관리자) ---------- */

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn cred_read(target: &str) -> Option<Vec<u8>> {
    use windows_sys::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};
    let t = wide(target);
    unsafe {
        let mut p: *mut CREDENTIALW = std::ptr::null_mut();
        if CredReadW(t.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p) == 0 || p.is_null() {
            return None;
        }
        let c = &*p;
        let blob = if c.CredentialBlob.is_null() {
            Vec::new()
        } else {
            std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
        };
        CredFree(p as *const _);
        Some(blob)
    }
}

#[cfg(windows)]
fn cred_write(target: &str, user: &str, secret: &str) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::{CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};
    let mut t = wide(target);
    let mut u = wide(user);
    let blob = secret.as_bytes();
    unsafe {
        let mut c: CREDENTIALW = std::mem::zeroed();
        c.Type = CRED_TYPE_GENERIC;
        c.TargetName = t.as_mut_ptr();
        c.UserName = u.as_mut_ptr();
        c.CredentialBlobSize = blob.len() as u32;
        c.CredentialBlob = blob.as_ptr() as *mut u8;
        c.Persist = CRED_PERSIST_LOCAL_MACHINE;
        if CredWriteW(&c, 0) == 0 {
            return Err("자격 증명 저장 실패".into());
        }
    }
    Ok(())
}

#[cfg(windows)]
fn cred_delete(target: &str) {
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    let t = wide(target);
    unsafe {
        CredDeleteW(t.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
}

#[cfg(not(windows))]
fn cred_read(_target: &str) -> Option<Vec<u8>> {
    None
}
#[cfg(not(windows))]
fn cred_write(_t: &str, _u: &str, _s: &str) -> Result<(), String> {
    Err("Windows 전용".into())
}
#[cfg(not(windows))]
fn cred_delete(_target: &str) {}

/// 자격 증명 값. 런처가 쓴 것은 UTF-8, cmdkey 같은 도구가 쓴 것은 UTF-16
fn decode_secret(blob: &[u8]) -> String {
    let utf16 = blob.len() >= 2 && blob.len() % 2 == 0 && blob.iter().skip(1).step_by(2).all(|&b| b == 0);
    let s = if utf16 {
        let w: Vec<u16> = blob.chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&w)
    } else {
        String::from_utf8_lossy(blob).to_string()
    };
    s.trim().to_string()
}

fn token() -> Option<String> {
    cred_read(TOKEN_TARGET).map(|b| decode_secret(&b)).filter(|t| !t.is_empty())
}

/// 토큰으로 GitHub 사용자 이름. 틀린 토큰이면 Err
fn github_login_of(token: &str) -> Result<String, String> {
    let res = client()?
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub 가 토큰을 거절 ({})", res.status().as_u16()));
    }
    let v: Value = serde_json::from_str(&res.text().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    str_at(&v, &["login"]).map(String::from).ok_or_else(|| "사용자 이름 없음".into())
}

fn save_token(token: &str) -> Result<String, String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("토큰이 비어 있음".into());
    }
    let login = github_login_of(t)?;
    cred_write(TOKEN_TARGET, &login, t)?;
    Ok(login)
}

/// 로그인한 GitHub 이름. 토큰이 없으면 None
#[tauri::command]
async fn github_status() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| match token() {
        None => Ok(None),
        Some(t) => github_login_of(&t).map(Some),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_set_token(token: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || save_token(&token))
        .await
        .map_err(|e| e.to_string())?
}

/// 이 PC 의 git 로그인을 런처 토큰으로 복사 (사용자가 누를 때만)
#[tauri::command]
async fn github_use_git_login() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let blob = cred_read(GIT_LOGIN_TARGET).ok_or("이 PC 에 git 로그인 기록이 없음")?;
        save_token(&decode_secret(&blob))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn github_clear() {
    cred_delete(TOKEN_TARGET);
}

/* ---------- 설정 (작업 폴더) ---------- */

fn settings_path(handle: &AppHandle) -> Result<PathBuf, String> {
    Ok(handle.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

fn default_workspace() -> String {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    Path::new(&home).join("repos").join("karmoddrine").to_string_lossy().to_string()
}

fn read_settings(handle: &AppHandle) -> Value {
    settings_path(handle)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}))
}

/// 설정 한 칸만 바꿈. 임시 파일 뒤 이름 바꾸기라 도중에 꺼져도 옛 파일이 남음
fn write_setting(handle: &AppHandle, key: &str, value: Value) -> Result<(), String> {
    let p = settings_path(handle)?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut all = read_settings(handle);
    all[key] = value;
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, all.to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// 로컬 항목을 찾는 뿌리. 기본은 `%USERPROFILE%\repos\karmoddrine`
fn workspace(handle: &AppHandle) -> String {
    str_at(&read_settings(handle), &["workspace"])
        .map(String::from)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(default_workspace)
}

#[tauri::command]
fn get_settings(handle: AppHandle) -> Value {
    let all = read_settings(&handle);
    serde_json::json!({
        "workspace": workspace(&handle),
        "prefs": all.get("prefs").cloned().unwrap_or_else(|| serde_json::json!({})),
        "autostart": autostart_enabled(),
    })
}

#[tauri::command]
fn set_workspace(handle: AppHandle, path: String) -> Result<(), String> {
    write_setting(&handle, "workspace", Value::from(path.trim()))
}

/// 화면 쪽 설정 (자동 업데이트, 앱별 값, 실행 기록). 뜻은 ui/updates.js 와 app.js 가 앎
#[tauri::command]
fn save_prefs(handle: AppHandle, prefs: Value) -> Result<(), String> {
    write_setting(&handle, "prefs", prefs)
}

/* ---------- Windows 시작 시 켜기 ---------- */

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "Karmo Launcher";
/// 이 인자로 켜지면 창 없이 트레이로
const TRAY_ARG: &str = "--tray";

#[cfg(windows)]
fn autostart_enabled() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|k| k.get_value::<String, _>(RUN_VALUE))
        .is_ok()
}

#[cfg(not(windows))]
fn autostart_enabled() -> bool {
    false
}

/// 사용자가 켤 때만 등록 (기본 꺼짐). 시작 프로그램 등록은 백신이 눈여겨보는 행동이라 기본값으로 두지 않음
#[cfg(windows)]
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(RUN_VALUE, &format!("\"{}\" {}", exe.display(), TRAY_ARG)).map_err(|e| e.to_string())
    } else {
        match key.delete_value(RUN_VALUE) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn set_autostart(_enabled: bool) -> Result<(), String> {
    Err("Windows 전용".into())
}

/* ---------- 받기 ---------- */

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("karmo-launcher")
        .build()
        .map_err(|e| e.to_string())
}

/// GET. 내 저장소 API 주소면 토큰을 붙임 (비공개 저장소, 시간당 제한 완화)
fn request(url: &str, accept: Option<&str>) -> Result<reqwest::blocking::Response, String> {
    request_from(url, accept, 0)
}

/// GET, `from` 바이트부터. 서버가 Range 를 무시하면 200 으로 처음부터 옴
fn request_from(url: &str, accept: Option<&str>, from: u64) -> Result<reqwest::blocking::Response, String> {
    let mut rq = client()?.get(url);
    if let Some(a) = accept {
        rq = rq.header("Accept", a);
    }
    if from > 0 {
        rq = rq.header("Range", format!("bytes={}-", from));
    }
    if url.starts_with(OWNER_API) {
        if let Some(t) = token() {
            rq = rq.bearer_auth(t);
        }
    }
    let res = rq.send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let code = res.status().as_u16();
        if code == 404 && url.starts_with(OWNER_API) && token().is_none() {
            return Err("비공개 저장소. GitHub 로그인이 필요함".into());
        }
        return Err(format!("{} {}", code, url));
    }
    Ok(res)
}

fn get_text(url: &str) -> Result<String, String> {
    request(url, None)?.text().map_err(|e| e.to_string())
}

/// 목록 둘을 합침. 비공개 목록의 항목에는 `access: "private"` 를 붙임.
/// 개발 중에는 `KARMO_LAUNCHER_MANIFEST` 로 공개 목록 자리에 로컬 파일이나 다른 주소
#[tauri::command]
async fn fetch_manifest() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let src = std::env::var("KARMO_LAUNCHER_MANIFEST").unwrap_or_else(|_| MANIFEST_URL.to_string());
        let text = if src.starts_with("http") {
            get_text(&src)?
        } else {
            std::fs::read_to_string(&src).map_err(|e| format!("{}: {}", src, e))?
        };
        let mut m: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let private = if token().is_none() {
            serde_json::json!({ "state": "no-token" })
        } else {
            match request(PRIVATE_MANIFEST_API, Some("application/vnd.github.raw"))
                .and_then(|r| r.text().map_err(|e| e.to_string()))
                .and_then(|t| serde_json::from_str::<Value>(&t).map_err(|e| e.to_string()))
            {
                Ok(p) => {
                    let mut n = 0;
                    if let (Some(dst), Some(src)) = (m.get_mut("apps").and_then(|a| a.as_array_mut()), p.get("apps").and_then(|a| a.as_array())) {
                        for a in src {
                            let mut a = a.clone();
                            a["access"] = Value::from("private");
                            dst.push(a);
                            n += 1;
                        }
                    }
                    serde_json::json!({ "state": "ok", "count": n })
                }
                Err(e) => serde_json::json!({ "state": "error", "error": e }),
            }
        };
        m["private"] = private;
        Ok(m)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 한 앱의 최신 판
#[derive(Default)]
struct Latest {
    version: Option<String>,
    pub_date: Option<String>,
    url: Option<String>,
    signature: Option<String>,
    sha256: Option<String>,
    notes: Option<String>,
    page: Option<String>,
}

/// 릴리스 글. WM 은 커밋 목록이라 10만 자가 넘어 앞만 보임
const NOTES_MAX_CHARS: usize = 1500;
fn short_notes(text: Option<&str>) -> Option<String> {
    let t = text?.trim();
    if t.is_empty() {
        return None;
    }
    let cut: String = t.chars().take(NOTES_MAX_CHARS).collect();
    Some(if cut.len() < t.len() { cut + "..." } else { cut })
}

/// `source.type`: `tauri-latest` (목록 catalog 먼저, 없으면 앱 latest.json) 또는 `gh-release` (저장소 릴리스의 자산 하나)
fn latest_of(app: &Value) -> Result<Latest, String> {
    if str_at(app, &["source", "type"]) == Some("gh-release") {
        return latest_gh_release(app);
    }
    let id = str_at(app, &["id"]).unwrap_or_default();
    if let Ok(text) = get_text(CATALOG_URL) {
        if let Ok(cat) = serde_json::from_str::<Value>(&text) {
            if let Some(e) = cat.get("apps").and_then(|a| a.get(id)) {
                return Ok(Latest {
                    version: str_at(e, &["version"]).map(String::from),
                    pub_date: str_at(e, &["pub_date"]).map(String::from),
                    url: str_at(e, &["url"]).map(String::from),
                    signature: str_at(e, &["signature"]).map(String::from),
                    notes: short_notes(str_at(e, &["notes"])),
                    ..Default::default()
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
        notes: short_notes(str_at(&latest, &["notes"])),
        ..Default::default()
    })
}

/// 저장소 릴리스를 새것부터 보며 태그 머리 (`tag_prefix`) 와 자산 이름 (`asset_prefix`, `asset_suffix`) 이 맞는 첫 자산.
/// 판 번호는 태그에서 머리와 `v` 를 뗀 것. 주소는 자산 API 주소 (비공개 저장소도 토큰으로 받음)
fn latest_gh_release(app: &Value) -> Result<Latest, String> {
    let repo = str_at(app, &["source", "repo"]).ok_or("source.repo 없음")?;
    if !repo.starts_with("mascari4615/") {
        return Err(format!("허용 안 된 저장소: {}", repo));
    }
    let tag_prefix = str_at(app, &["source", "tag_prefix"]).unwrap_or("");
    let asset_prefix = str_at(app, &["source", "asset_prefix"]).unwrap_or("");
    let asset_suffix = str_at(app, &["source", "asset_suffix"]).unwrap_or("");
    let list: Value = serde_json::from_str(&get_text(&format!("https://api.github.com/repos/{}/releases?per_page=30", repo))?)
        .map_err(|e| e.to_string())?;
    for r in list.as_array().into_iter().flatten() {
        if r.get("draft").and_then(|d| d.as_bool()).unwrap_or(false) {
            continue;
        }
        let tag = str_at(r, &["tag_name"]).unwrap_or("");
        if !tag.starts_with(tag_prefix) {
            continue;
        }
        for a in r.get("assets").and_then(|a| a.as_array()).into_iter().flatten() {
            let name = str_at(a, &["name"]).unwrap_or("");
            if name.starts_with(asset_prefix) && name.ends_with(asset_suffix) {
                return Ok(Latest {
                    version: Some(tag[tag_prefix.len()..].trim_start_matches('v').to_string()),
                    pub_date: str_at(r, &["published_at"]).map(String::from),
                    url: str_at(a, &["url"]).map(String::from),
                    signature: None,
                    sha256: str_at(a, &["digest"]).and_then(|d| d.strip_prefix("sha256:")).map(String::from),
                    notes: short_notes(str_at(r, &["body"])),
                    page: str_at(r, &["html_url"]).map(String::from),
                });
            }
        }
    }
    Err("받을 수 있는 판이 아직 없음".into())
}

/* ---------- 설치 상태 ---------- */

#[derive(Serialize, Default)]
struct Status {
    installed: bool,
    version: Option<String>,
    prev: Option<String>,
    latest: Option<String>,
    pub_date: Option<String>,
    running: bool,
    download: Option<String>,
    signature: Option<String>,
    sha256: Option<String>,
    location: Option<String>,
    notes: Option<String>,
    page: Option<String>,
    error: Option<String>,
}

fn format_of(app: &Value) -> &str {
    str_at(app, &["install", "format"]).unwrap_or("nsis")
}

/// 앱 id 는 폴더 이름이 되므로 소문자, 숫자, 하이픈만
fn safe_id(app: &Value) -> Result<String, String> {
    let id = str_at(app, &["id"]).ok_or("id 없음")?;
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err(format!("쓸 수 없는 id: {}", id));
    }
    Ok(id.to_string())
}

/// 상대 경로만 (뿌리 밖으로 나가는 `..`, 드라이브, 절대 경로 거절)
fn safe_rel(rel: &str) -> Result<String, String> {
    let r = rel.replace('\\', "/");
    if r.is_empty() || r.starts_with('/') || r.contains(':') || r.split('/').any(|p| p == "..") {
        return Err(format!("쓸 수 없는 경로: {}", rel));
    }
    Ok(r)
}

fn zip_dir(handle: &AppHandle, app: &Value) -> Result<PathBuf, String> {
    Ok(handle.path().app_local_data_dir().map_err(|e| e.to_string())?.join("apps").join(safe_id(app)?))
}

fn local_path(handle: &AppHandle, app: &Value) -> Result<PathBuf, String> {
    let rel = safe_rel(str_at(app, &["local", "path"]).ok_or("local.path 없음")?)?;
    Ok(Path::new(&workspace(handle)).join(rel))
}

const VERSION_FILE: &str = ".karmo-version";

/// 로컬 서버 항목의 포트 (`local.port`). 떠 있으면 다시 안 켜고 브라우저만 엶
fn local_port(app: &Value) -> Option<u16> {
    app.get("local")?.get("port")?.as_u64().and_then(|p| u16::try_from(p).ok())
}

fn port_open(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(150)).is_ok()
}

/// `local.open` 주소를 포트가 열리면 엶 (최대 30초). 이 PC 주소만
fn open_when_ready(app: &Value) {
    let (Some(url), Some(port)) = (str_at(app, &["local", "open"]).map(String::from), local_port(app)) else {
        return;
    };
    if !url.starts_with("http://127.0.0.1:") && !url.starts_with("http://localhost:") {
        return;
    }
    std::thread::spawn(move || {
        for _ in 0..150 {
            if port_open(port) {
                let _ = open::that(&url);
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    });
}

/// 실행 중을 볼 프로세스 이름. nsis 는 레지스트리의 MainBinaryName, zip 은 `install.exe`
fn exe_of(app: &Value) -> Option<String> {
    match format_of(app) {
        "nsis" => registry(str_at(app, &["install", "registry"])?)?.get("MainBinaryName").cloned(),
        "zip" => str_at(app, &["install", "exe"]).map(String::from),
        _ => None,
    }
}

fn status_blocking(handle: &AppHandle, app: &Value) -> Status {
    let mut st = Status::default();
    match format_of(app) {
        "zip" => match zip_dir(handle, app) {
            Ok(dir) => {
                if let Ok(v) = std::fs::read_to_string(dir.join(VERSION_FILE)) {
                    st.installed = true;
                    st.version = Some(v.trim().to_string());
                    st.location = Some(dir.to_string_lossy().to_string());
                    st.prev = std::fs::read_to_string(prev_dir(&dir).join(VERSION_FILE)).ok().map(|p| p.trim().to_string());
                }
            }
            Err(e) => st.error = Some(e),
        },
        "local" => match local_path(handle, app) {
            Ok(p) => {
                st.installed = p.exists();
                st.location = Some(p.to_string_lossy().to_string());
                st.running = local_port(app).map(port_open).unwrap_or(false);
            }
            Err(e) => st.error = Some(e),
        },
        _ => {
            if let Some(key) = str_at(app, &["install", "registry"]) {
                if let Some(reg) = registry(key) {
                    st.installed = true;
                    st.version = reg.get("DisplayVersion").cloned();
                    st.location = reg.get("InstallLocation").cloned();
                }
            }
        }
    }
    if st.installed && format_of(app) != "local" {
        st.running = exe_of(app).map(|exe| is_running(&exe)).unwrap_or(false);
    }
    if app.get("source").is_some() {
        match latest_of(app) {
            Ok(l) => {
                st.latest = l.version;
                st.pub_date = l.pub_date;
                st.download = l.url;
                st.signature = l.signature;
                st.sha256 = l.sha256;
                st.notes = l.notes;
                st.page = l.page;
            }
            Err(e) => st.error = Some(e),
        }
    }
    st
}

#[tauri::command]
async fn app_status(handle: AppHandle, app: Value) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || status_blocking(&handle, &app))
        .await
        .map_err(|e| e.to_string())
}

/* 레지스트리와 프로세스는 Windows API 로 직접. 예전엔 reg, tasklist, taskkill 을 창 없이 띄웠는데
   "숨김 시스템 도구 실행 + exe 받아 실행" 조합이 다운로더 모양이라 Defender 가 런처를
   Trojan:Win32/Bearfoos.A!ml 로 지웠다 (2026-11-02, memo changes/launcher.md) */

/// HKCU Uninstall 키 하나의 값들 (문자열과 DWORD). 없으면 None
#[cfg(windows)]
fn registry(key: &str) -> Option<std::collections::HashMap<String, String>> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let path = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", key);
    let k = RegKey::predef(HKEY_CURRENT_USER).open_subkey(path).ok()?;
    let mut map = std::collections::HashMap::new();
    for (name, _) in k.enum_values().flatten() {
        let v = match k.get_value::<String, _>(&name) {
            Ok(s) => s,
            Err(_) => match k.get_value::<u32, _>(&name) {
                Ok(n) => n.to_string(),
                Err(_) => continue,
            },
        };
        map.insert(name, v.trim().trim_matches('"').to_string());
    }
    Some(map)
}

#[cfg(not(windows))]
fn registry(_key: &str) -> Option<std::collections::HashMap<String, String>> {
    None
}

/// 전체 프로세스 (id, 부모 id, 소문자 이름). ToolHelp 스냅샷 한 번
#[cfg(windows)]
fn procs() -> Vec<(u32, u32, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut e) != 0;
        while ok {
            let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            let name = String::from_utf16_lossy(&e.szExeFile[..len]).to_lowercase();
            out.push((e.th32ProcessID, e.th32ParentProcessID, name));
            ok = Process32NextW(snap, &mut e) != 0;
        }
        CloseHandle(snap);
    }
    out
}

#[cfg(not(windows))]
fn procs() -> Vec<(u32, u32, String)> {
    Vec::new()
}

/// 이름이 exe 인 프로세스 id 들 (대소문자 무시)
fn pids_of(exe: &str) -> Vec<u32> {
    let want = exe.to_lowercase();
    procs().into_iter().filter(|p| p.2 == want).map(|p| p.0).collect()
}

/// exe 를 띄운 실행기 (start.cmd 의 cmd, 서버 node). 부모 쪽으로 최대 3단, 이 두 이름만
/// 창만 끄면 컴패니언 node 서버가 포트를 쥔 채 남던 문제 (2026-11-03)
fn launcher_chain(exe: &str) -> Vec<u32> {
    let all = procs();
    let want = exe.to_lowercase();
    let mut out = Vec::new();
    for child in all.iter().filter(|p| p.2 == want) {
        let mut ppid = child.1;
        for _ in 0..3 {
            match all.iter().find(|p| p.0 == ppid && p.0 != 0) {
                Some(p) if p.2 == "node.exe" || p.2 == "cmd.exe" => {
                    if !out.contains(&p.0) {
                        out.push(p.0);
                    }
                    ppid = p.1;
                }
                _ => break,
            }
        }
    }
    out
}

/// 강제 종료. 못 끄면 false
#[cfg(windows)]
fn kill_pid(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if h.is_null() {
            return false;
        }
        let ok = TerminateProcess(h, 1) != 0;
        CloseHandle(h);
        ok
    }
}

#[cfg(not(windows))]
fn kill_pid(_pid: u32) -> bool {
    false
}

/// 이름이 exe 인 것 전부 강제 종료. 하나라도 못 끄면 false
fn kill_all(exe: &str) -> bool {
    pids_of(exe).into_iter().fold(true, |all, pid| kill_pid(pid) && all)
}

fn is_running(exe: &str) -> bool {
    !pids_of(exe).is_empty()
}

/// 실행 중인 것만 가볍게. 화면이 1초마다 부름 (최신 판은 다시 안 받음)
#[tauri::command]
async fn running_status(app: Value) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || running_blocking(&app)).await.map_err(|e| e.to_string())
}

fn running_blocking(app: &Value) -> bool {
    if format_of(app) == "local" {
        return local_port(app).map(port_open).unwrap_or(false);
    }
    exe_of(app).map(|exe| is_running(&exe)).unwrap_or(false)
}

/// 끄기. 창 닫기만으로는 트레이로 숨는 앱이 실행 중으로 남음 (2026-09-25 KarmoLab)
/// nsis 앱은 먼저 `<exe> --quit` 로 트레이 끝내기와 같은 길, 그 인자를 모르는 옛 판은 3초 뒤 강제 종료.
/// zip 앱은 바로 강제 종료, 띄운 cmd 와 node 도 같이
#[tauri::command]
async fn stop_app(handle: AppHandle, app: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if format_of(&app) == "local" {
            stop_local(&handle, &app)
        } else {
            stop_blocking(&app)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 로컬 항목의 명령 (`local.run`, `local.stop`). `{path}` 자리에 찾은 파일. 없으면 None
fn local_command(app: &Value, key: &str, path: &Path) -> Option<Vec<String>> {
    let p = path.to_string_lossy();
    let list = app.get("local")?.get(key)?.as_array()?;
    let out: Vec<String> = list.iter().filter_map(|x| x.as_str()).map(|s| s.replace("{path}", &p)).collect();
    (!out.is_empty()).then_some(out)
}

/// 로컬 서버 끄기. 목록의 `local.stop` 명령을 돌리고 포트가 닫히길 기다림 (최대 15초)
fn stop_local(handle: &AppHandle, app: &Value) -> Result<(), String> {
    let path = local_path(handle, app)?;
    let run = local_command(app, "stop", &path).ok_or("이 항목은 끄는 명령이 목록에 없음")?;
    let port = local_port(app).ok_or("이 항목은 포트가 목록에 없음")?;
    let (cmd, args) = run.split_first().ok_or("local.stop 이 비어 있음")?;
    let mut c = Command::new(cmd);
    c.args(args);
    if let Some(d) = path.parent() {
        c.current_dir(d);
    }
    let status = c.status().map_err(|e| e.to_string())?;
    if !status.success() {
        log_line(handle, &format!("local stop failed: {:?}", status.code()));
        return Err(format!("끄기 명령이 {:?} 로 끝남", status.code()));
    }
    for _ in 0..150 {
        if !port_open(port) {
            log_line(handle, &format!("local stop done, port {}", port));
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    log_line(handle, &format!("local stop timeout, port {}", port));
    Err(format!("끄기 명령은 끝났지만 {} 포트가 아직 열려 있음", port))
}

fn stop_blocking(app: &Value) -> Result<(), String> {
    let exe = exe_of(app).ok_or("끌 프로세스 이름 모름")?;
    if format_of(app) == "nsis" {
        let reg = registry(str_at(app, &["install", "registry"]).unwrap_or_default()).ok_or("설치 안 됨")?;
        if let Some(dir) = reg.get("InstallLocation") {
            let _ = Command::new(Path::new(dir).join(&exe)).arg("--quit").spawn();
        }
        for _ in 0..30 {
            if !is_running(&exe) {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }
    if format_of(app) == "zip" {
        for pid in launcher_chain(&exe) {
            kill_pid(pid);
        }
    }
    kill_all(&exe);
    for _ in 0..20 {
        if !is_running(&exe) {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Err("끄기 실패".into())
}

fn str_at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_str()
}

/* ---------- 설치, 실행, 제거 ---------- */

/// 설치 프로그램과 제거 프로그램은 한 번에 하나. 받기와 zip 풀기는 앱마다 동시에 돎
fn native_setup_turn() -> std::sync::MutexGuard<'static, ()> {
    static TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());
    TURN.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize, Clone)]
struct Progress {
    id: String,
    got: u64,
    total: u64,
    phase: String,
}

/// zip 안 이름. UTF-8 이 아니면 CP949 (Windows PowerShell 5.1 의 Compress-Archive 가 한글 이름을 그렇게 씀)
fn zip_name(raw: &[u8]) -> String {
    match std::str::from_utf8(raw) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::EUC_KR.decode(raw).0.to_string(),
    }
}

/// 옆 폴더에 다 풀고 나서 바꿔 끼움. 중간에 실패하면 깔린 판은 그대로
/// 새 폴더에 다 풀고 판 번호까지 적은 뒤 바꿔 끼움. 도중에 꺼져도 옛 판이 멀쩡하거나, 새 판이 완전함
fn extract_zip(file: &Path, dest: &Path, version: &str) -> Result<(), String> {
    let tmp = dest.with_extension("new");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let mut z = zip::ZipArchive::new(std::fs::File::open(file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    for i in 0..z.len() {
        let mut e = z.by_index(i).map_err(|e| e.to_string())?;
        let name = zip_name(e.name_raw());
        let dir_entry = name.ends_with('/') || name.ends_with('\\');
        let rel = safe_rel(name.trim_end_matches(['/', '\\']))?;
        let out = tmp.join(&rel);
        if dir_entry {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut e, &mut f).map_err(|e| e.to_string())?;
    }
    std::fs::write(tmp.join(VERSION_FILE), version).map_err(|e| e.to_string())?;
    if dest.exists() {
        /* 판이 바뀔 때만 옛 판 보관. 같은 판 다시 설치로 더 옛 판을 잃지 않게 */
        let same = std::fs::read_to_string(dest.join(VERSION_FILE)).map(|v| v.trim() == version).unwrap_or(false);
        if same {
            std::fs::remove_dir_all(dest).map_err(|e| format!("옛 판을 못 지움 (실행 중인지 확인): {}", e))?;
        } else {
            let prev = prev_dir(dest);
            let _ = std::fs::remove_dir_all(&prev);
            std::fs::rename(dest, &prev).map_err(|e| format!("옛 판을 못 옮김 (실행 중인지 확인): {}", e))?;
        }
    }
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

/// 바로 전 판을 보관하는 폴더. `apps/<id>.prev`
fn prev_dir(dest: &Path) -> PathBuf {
    dest.with_extension("prev")
}

/// 지금 판과 보관한 판을 맞바꿈. 중간에 실패하면 원래대로 되돌림
fn swap_with_prev(dest: &Path) -> Result<(), String> {
    let prev = prev_dir(dest);
    if !prev.join(VERSION_FILE).is_file() {
        return Err("되돌릴 판이 없음".into());
    }
    let hold = dest.with_extension("swap");
    let _ = std::fs::remove_dir_all(&hold);
    std::fs::rename(dest, &hold).map_err(|e| format!("지금 판을 못 옮김 (실행 중인지 확인): {}", e))?;
    if let Err(e) = std::fs::rename(&prev, dest) {
        let _ = std::fs::rename(&hold, dest);
        return Err(e.to_string());
    }
    std::fs::rename(&hold, &prev).map_err(|e| e.to_string())
}

/// 바로 전 판으로 되돌리기. zip 앱만, 꺼져 있을 때만
#[tauri::command]
async fn rollback_app(handle: AppHandle, app: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if format_of(&app) != "zip" {
            return Err("zip 앱만 되돌릴 수 있음".into());
        }
        if exe_of(&app).map(|e| is_running(&e)).unwrap_or(false) {
            return Err("실행 중. 끈 뒤에 다시".into());
        }
        let dest = zip_dir(&handle, &app)?;
        let result = swap_with_prev(&dest);
        log_line(&handle, &format!("rollback {}: {:?}", safe_id(&app).unwrap_or_default(), result));
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 받는 중인 것을 멈춤. 설치 단계에 들어간 뒤에는 안 멈춤
static CANCEL_INSTALL: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn cancel_list() -> std::sync::MutexGuard<'static, Vec<String>> {
    CANCEL_INSTALL.lock().unwrap_or_else(|e| e.into_inner())
}

/// 앱마다 따로 받으므로 취소도 앱별
#[tauri::command]
fn cancel_install(id: String) {
    cancel_list().push(id);
}

/// 일시정지 요청. 받은 조각을 남기고 멈춤
static PAUSE_INSTALL: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
/// 화면이 이 글자로 일시정지와 실패를 가름
const PAUSED_TEXT: &str = "일시정지함";

fn pause_list() -> std::sync::MutexGuard<'static, Vec<String>> {
    PAUSE_INSTALL.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
fn pause_install(id: String) {
    pause_list().push(id);
}

fn downloads_dir(handle: &AppHandle) -> Result<PathBuf, String> {
    /* %TEMP% 에 exe 를 받아 실행하는 것도 다운로더 모양이라 런처 자기 캐시 폴더에 받음 */
    Ok(handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("downloads"))
}

/// 파일 이름용 판 번호. 숫자, 글자, 점, 하이픈만
fn safe_version(version: &str) -> String {
    version.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-').collect()
}

/// 앱의 받다 만 조각 삭제. `keep` 은 남길 파일 이름
fn remove_parts(dir: &Path, id: &str, keep: Option<&str>) {
    let prefix = format!("{}-", id);
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(&prefix) && name.ends_with(".part") && Some(name.as_str()) != keep {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// 일시정지한 앱의 조각 버리기
#[tauri::command]
fn discard_partial(handle: AppHandle, app: Value) -> Result<(), String> {
    remove_parts(&downloads_dir(&handle)?, &safe_id(&app)?, None);
    Ok(())
}

/// 드라이브 남은 공간. 못 재면 None
#[cfg(windows)]
fn free_space(dir: &Path) -> Option<u64> {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let path = wide(&dir.to_string_lossy());
    let mut free: u64 = 0;
    let ok = unsafe { GetDiskFreeSpaceExW(path.as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut()) };
    (ok != 0).then_some(free)
}

#[cfg(not(windows))]
fn free_space(_dir: &Path) -> Option<u64> {
    None
}

/// zip 을 풀면 커지는 만큼의 여유. 실제 압축률은 받기 전에 모름
const ZIP_EXTRACT_FACTOR: u64 = 3;

/// 받기와 설치에 필요한 공간. nsis 는 받을 나머지와 전체 크기만큼 (설치 프로그램이 풀 자리), zip 은 풀 자리까지
fn space_needed(format: &str, total: u64, have: u64) -> u64 {
    let left = total.saturating_sub(have);
    if format == "zip" {
        left + total.saturating_mul(ZIP_EXTRACT_FACTOR)
    } else {
        left + total
    }
}

fn fmt_size(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    let b = bytes as f64;
    if b >= GB { format!("{:.1}GB", b / GB) } else { format!("{:.0}MB", b / MB) }
}

/// 런처 로그. 토큰과 비밀값은 넘기지 않음
const LOG_MAX_BYTES: u64 = 1024 * 1024;

/// 유닉스 초를 UTC 시각 글자로
fn utc_stamp(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rest = secs % 86400;
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, rest / 3600, rest % 3600 / 60, rest % 60)
}

fn log_line(handle: &AppHandle, text: &str) {
    let Ok(dir) = handle.path().app_log_dir() else { return };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let file = dir.join("launcher.log");
    if std::fs::metadata(&file).map(|m| m.len() > LOG_MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(&file, dir.join("launcher.old.log"));
    }
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let clean: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).take(2000).collect();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&file) {
        let _ = writeln!(f, "{} {}", utc_stamp(secs), clean);
    }
}

#[tauri::command]
fn log_event(handle: AppHandle, text: String) {
    log_line(&handle, &text);
}

#[tauri::command]
fn open_logs(handle: AppHandle) -> Result<(), String> {
    let dir = handle.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open::that(dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn notify_user(handle: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    handle.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

/// 받기 (진행을 `install-progress` 로), 확인, 설치.
/// nsis 는 릴리스 서명 (minisign) 이 맞을 때만 설치 프로그램을 인자와 함께 실행, zip 은 sha256 이 맞을 때만 풂.
/// GitHub 자산 API 주소는 `Accept: application/octet-stream` 이라야 파일이 옴
#[tauri::command]
async fn install_app(handle: AppHandle, app: Value, url: String, version: String, signature: String, sha256: String) -> Result<(), String> {
    let format = format_of(&app).to_string();
    if format == "nsis" && signature.trim().is_empty() {
        return Err("서명이 없는 판은 설치하지 않음".into());
    }
    if format == "zip" && sha256.trim().is_empty() {
        return Err("sha256 이 없는 판은 풀지 않음".into());
    }
    if format != "nsis" && format != "zip" {
        return Err(format!("받아서 까는 형식이 아님: {}", format));
    }
    const ALLOWED: [&str; 2] = [
        "https://github.com/mascari4615/",
        "https://api.github.com/repos/mascari4615/",
    ];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err(format!("허용 안 된 주소: {}", url));
    }
    let id = safe_id(&app)?;
    cancel_list().retain(|x| x != &id);
    pause_list().retain(|x| x != &id);
    let log_handle = handle.clone();
    let log_id = id.clone();
    let version_for_log = version.clone();
    log_line(&log_handle, &format!("install start {} {}", log_id, version));
    let done = tauri::async_runtime::spawn_blocking(move || {
        let say = |got: u64, total: u64, phase: &str| {
            let _ = handle.emit("install-progress", Progress { id: id.clone(), got, total, phase: phase.to_string() });
        };
        let dir = downloads_dir(&handle)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file: PathBuf = dir.join(if format == "zip" { format!("{}.zip", id) } else { format!("{}-setup.exe", id) });
        /* 판마다 조각 하나. 다른 판 조각은 이어 쓰면 안 됨 */
        let part_name = format!("{}-{}.part", id, safe_version(&version));
        let part = dir.join(&part_name);
        remove_parts(&dir, &id, Some(&part_name));
        let mut have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        let mut res = match request_from(&url, Some("application/octet-stream"), have) {
            Ok(r) => r,
            Err(e) if have > 0 && e.starts_with("416") => {
                /* 조각이 이미 전체거나 어긋남. 처음부터 */
                let _ = std::fs::remove_file(&part);
                have = 0;
                request_from(&url, Some("application/octet-stream"), 0)?
            }
            Err(e) => return Err(e),
        };
        if res.status().as_u16() != 206 {
            have = 0;
        }
        log_line(&handle, &format!("download {} from {} status {}", id, have, res.status().as_u16()));
        let total = res.content_length().map(|n| n + have).unwrap_or(0);
        if let Some(free) = free_space(&dir) {
            let need = space_needed(&format, total, have);
            if total > 0 && free < need {
                return Err(format!("디스크 공간 부족. 필요 약 {}, 남음 {}", fmt_size(need), fmt_size(free)));
            }
        }
        /* sha256 은 받으면서 잼. WM zip 은 2GB 가까이라 통째로 메모리에 올리지 않음 */
        use sha2::Digest;
        let mut hasher = sha2::Sha256::new();
        if have > 0 && format == "zip" {
            let mut old = std::fs::File::open(&part).map_err(|e| e.to_string())?;
            std::io::copy(&mut old, &mut hasher).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(have > 0)
            .truncate(have == 0)
            .open(&part)
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 256 * 1024];
        let mut got: u64 = have;
        let mut last: u64 = have;
        say(got, total, "download");
        loop {
            if cancel_list().contains(&id) {
                drop(out);
                let _ = std::fs::remove_file(&part);
                return Err("취소함".into());
            }
            if pause_list().contains(&id) {
                return Err(PAUSED_TEXT.into());
            }
            let n = res.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            hasher.update(&buf[..n]);
            got += n as u64;
            if got - last > 1024 * 1024 {
                last = got;
                say(got, total, "download");
            }
        }
        drop(out);
        if total > 0 && got < total {
            return Err(format!("받기가 끊김 ({} / {}). 다음에 이어 받음", fmt_size(got), fmt_size(total)));
        }
        std::fs::rename(&part, &file).map_err(|e| e.to_string())?;
        say(got, total, "verify");
        let checked = if format == "zip" {
            same_sha256(hasher.finalize().as_slice(), &sha256)
        } else {
            std::fs::read(&file).map_err(|e| e.to_string()).and_then(|bytes| verify_signature(&bytes, &signature))
        };
        if let Err(e) = checked {
            let _ = std::fs::remove_file(&file);
            return Err(e);
        }
        if format == "zip" {
            say(got, total, "install");
            let dest = zip_dir(&handle, &app)?;
            if let Some(exe) = exe_of(&app) {
                if is_running(&exe) {
                    let _ = std::fs::remove_file(&file);
                    return Err("실행 중. 끈 뒤에 다시".into());
                }
            }
            let r = extract_zip(&file, &dest, version.trim());
            let _ = std::fs::remove_file(&file);
            r?;
        } else {
            let args: Vec<String> = app
                .get("install")
                .and_then(|i| i.get("args"))
                .and_then(|a| a.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            say(got, total, "wait");
            let turn = native_setup_turn();
            say(got, total, "install");
            let status = Command::new(&file).args(&args).status().map_err(|e| e.to_string())?;
            drop(turn);
            let _ = std::fs::remove_file(&file);
            if !status.success() {
                return Err(format!("설치 프로그램이 {:?} 로 끝남", status.code()));
            }
        }
        say(got, total, "done");
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?;
    match &done {
        Ok(()) => log_line(&log_handle, &format!("install done {} {}", log_id, version_for_log)),
        Err(e) => log_line(&log_handle, &format!("install stop {} {}: {}", log_id, version_for_log, e)),
    }
    done
}

/// 실행. nsis 는 레지스트리의 설치 자리와 본 실행 파일, zip 은 풀린 폴더의 `install.entry`,
/// local 은 `local.run` (명령과 인자, `{path}` 자리에 찾은 파일). 모두 보이는 창으로
#[tauri::command]
fn launch_app(handle: AppHandle, app: Value, args: Option<Vec<String>>) -> Result<(), String> {
    let args = args.unwrap_or_default();
    match format_of(&app) {
        "zip" => {
            let dir = zip_dir(&handle, &app)?;
            let entry = safe_rel(str_at(&app, &["install", "entry"]).ok_or("install.entry 없음")?)?;
            let mut c = Command::new(dir.join(entry));
            c.current_dir(&dir).args(&args);
            /* `install.env`: 앱에 넘길 환경 변수. `{workspace}` 는 설정의 작업 폴더, `{dir}` 은 풀린 폴더.
               컴패니언은 저장소 밖에 풀려 이웃 (memo, 게임 저장소) 을 못 찾아서 작업 폴더를 알려 줌 */
            if let Some(env) = app.get("install").and_then(|i| i.get("env")).and_then(|e| e.as_object()) {
                let ws = workspace(&handle);
                let d = dir.to_string_lossy().to_string();
                for (k, v) in env {
                    if let Some(v) = v.as_str() {
                        c.env(k, v.replace("{workspace}", &ws).replace("{dir}", &d));
                    }
                }
            }
            c.spawn().map_err(|e| e.to_string())?;
        }
        "local" => {
            let path = local_path(&handle, &app)?;
            if !path.exists() {
                return Err(format!("이 PC 에 없음: {}", path.display()));
            }
            /* 서버가 이미 떠 있으면 또 켜면 포트 충돌. 브라우저만 */
            if local_port(&app).map(port_open).unwrap_or(false) {
                open_when_ready(&app);
                return Ok(());
            }
            let run = local_command(&app, "run", &path).unwrap_or_else(|| vec![path.to_string_lossy().to_string()]);
            let (cmd, args) = run.split_first().ok_or("local.run 이 비어 있음")?;
            let mut c = Command::new(cmd);
            c.args(args);
            if let Some(d) = path.parent() {
                c.current_dir(d);
            }
            c.spawn().map_err(|e| e.to_string())?;
            open_when_ready(&app);
        }
        _ => {
            let reg = registry(str_at(&app, &["install", "registry"]).ok_or("install.registry 없음")?).ok_or("설치 안 됨")?;
            let dir = reg.get("InstallLocation").ok_or("설치 자리 모름")?;
            let exe = reg.get("MainBinaryName").ok_or("실행 파일 이름 모름")?;
            Command::new(PathBuf::from(dir).join(exe)).args(&args).spawn().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn uninstall_app(handle: AppHandle, app: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match format_of(&app) {
        "zip" => {
            if exe_of(&app).map(|e| is_running(&e)).unwrap_or(false) {
                return Err("실행 중. 끈 뒤에 다시".into());
            }
            let dir = zip_dir(&handle, &app)?;
            let _ = std::fs::remove_dir_all(prev_dir(&dir));
            std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())
        }
        "local" => Err("로컬 항목은 런처가 지우지 않음".into()),
        _ => {
            let reg = registry(str_at(&app, &["install", "registry"]).ok_or("install.registry 없음")?).ok_or("설치 안 됨")?;
            let un = reg.get("UninstallString").ok_or("제거 프로그램 모름")?;
            let _turn = native_setup_turn();
            let status = Command::new(un).arg("/S").status().map_err(|e| e.to_string())?;
            if !status.success() {
                return Err(format!("제거 프로그램이 {:?} 로 끝남", status.code()));
            }
            Ok(())
        }
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

/// 비공개 그림 경로는 memo 의 마스코트 폴더 바로 아래 파일만
fn private_image_path(path: &str) -> Result<(String, &'static str), String> {
    const ROOT: &str = "data/launcher/mascots/";
    let rel = safe_rel(path)?;
    let name = rel.strip_prefix(ROOT).ok_or_else(|| format!("허용 안 된 경로: {}", path))?;
    if name.is_empty() || name.contains('/') {
        return Err(format!("허용 안 된 경로: {}", path));
    }
    let mime = if name.ends_with(".webp") {
        "image/webp"
    } else if name.ends_with(".png") {
        "image/png"
    } else {
        return Err(format!("그림 파일이 아님: {}", path));
    };
    Ok((rel, mime))
}

/// 비공개 항목의 마스코트. 토큰으로 받아 하루 동안 캐시, 못 받으면 옛 캐시. 화면에는 data 주소로 줌
#[tauri::command]
async fn private_image(handle: AppHandle, path: String) -> Result<String, String> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(move || {
        const FRESH: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);
        let (rel, mime) = private_image_path(&path)?;
        let name = rel.rsplit('/').next().ok_or("파일 이름 없음")?;
        let dir = handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("mascots");
        let file = dir.join(name);
        let fresh = std::fs::metadata(&file)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|age| age < FRESH)
            .unwrap_or(false);
        let bytes = if fresh {
            std::fs::read(&file).map_err(|e| e.to_string())?
        } else {
            let got = request(&format!("{}memo/contents/{}", OWNER_API, rel), Some("application/vnd.github.raw"))
                .and_then(|r| r.bytes().map_err(|e| e.to_string()));
            match got {
                Ok(b) => {
                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                    std::fs::write(&file, &b).map_err(|e| e.to_string())?;
                    b.to_vec()
                }
                Err(e) => std::fs::read(&file).map_err(|_| e)?,
            }
        };
        Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 앱이 깔린 폴더 열기 (Steam 로컬 파일 보기, Hub Show in Explorer)
#[tauri::command]
async fn open_location(handle: AppHandle, app: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = match format_of(&app) {
            "zip" => zip_dir(&handle, &app)?,
            "local" => local_path(&handle, &app)?.parent().ok_or("상위 폴더 없음")?.to_path_buf(),
            _ => {
                let reg = registry(str_at(&app, &["install", "registry"]).ok_or("install.registry 없음")?).ok_or("설치 안 됨")?;
                PathBuf::from(reg.get("InstallLocation").ok_or("설치 자리 모름")?)
            }
        };
        if !dir.exists() {
            return Err(format!("폴더 없음: {}", dir.display()));
        }
        open::that(dir).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 닫기 버튼을 "끝내기" 로 설정했을 때
#[tauri::command]
fn quit_app(handle: AppHandle) {
    handle.exit(0);
}

/// 런처 자신의 새 판. 있으면 판 번호, 없으면 None (tauri-plugin-updater, 엔드포인트는 tauri.conf 의 launcher-updater 릴리스)
#[tauri::command]
async fn self_update_check(app: AppHandle) -> Result<Option<String>, String> {
    /* 로컬 개발 판이 공개 판으로 설치본을 덮어쓰지 않게 */
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(u)) => {
            log_line(&app, &format!("self update found {}", u.version));
            Ok(Some(u.version.clone()))
        }
        Ok(None) => Ok(None),
        Err(e) => {
            log_line(&app, &format!("self update check failed: {}", e));
            Err(e.to_string())
        }
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
    /* 설치 프로그램이 다시 켤 때 인자를 못 넘김. 트레이에 숨어 있었으면 다음 한 번도 숨어서 켜짐 */
    let hidden = app.get_webview_window("main").and_then(|w| w.is_visible().ok()).map(|v| !v).unwrap_or(false);
    write_setting(&app, "start_hidden_once", Value::from(hidden))?;
    let mut got: u64 = 0;
    let handle = app.clone();
    let done = update
        .download_and_install(
            move |chunk, total| {
                got += chunk as u64;
                let _ = handle.emit("self-update-progress", (got, total.unwrap_or(0)));
            },
            || {},
        )
        .await;
    if let Err(e) = done {
        /* 실패하면 표시를 지움. 안 그러면 다음에 손으로 켤 때 창이 안 뜸 */
        let _ = write_setting(&app, "start_hidden_once", Value::from(false));
        log_line(&app, &format!("self update install failed: {}", e));
        return Err(e.to_string());
    }
    log_line(&app, "self update installed, restart");
    app.restart();
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// PC 간 런처 설정. 비공개 memo 의 파일 하나, 토큰이 있을 때만. 기기 현황은 Dash 몫이라 여기 안 넣음
const SYNC_API: &str = "https://api.github.com/repos/mascari4615/memo/contents/data/launcher/sync.json";

/// 파일 내용과 sha. 파일이 아직 없으면 data 와 sha 모두 null
#[tauri::command]
async fn sync_pull() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if token().is_none() {
            return Err("GitHub 로그인이 없음".to_string());
        }
        let res = match request(SYNC_API, Some("application/vnd.github+json")) {
            Ok(r) => r,
            Err(e) if e.starts_with("404") => return Ok(serde_json::json!({ "data": null, "sha": null })),
            Err(e) => return Err(e),
        };
        let body: Value = serde_json::from_str(&res.text().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let sha = body.get("sha").cloned().unwrap_or(Value::Null);
        use base64::Engine;
        let b64: String = body.get("content").and_then(|c| c.as_str()).unwrap_or("").chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
        let data: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "data": data, "sha": sha }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 파일 쓰기. sha 가 어긋나면 GitHub 가 409 를 돌려줘 화면이 다시 합침
#[tauri::command]
async fn sync_push(handle: AppHandle, data: Value, sha: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let t = token().ok_or("GitHub 로그인이 없음")?;
        use base64::Engine;
        let text = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())? + "\n";
        let mut body = serde_json::json!({
            "message": "chore(launcher): PC 간 설정 맞춤",
            "content": base64::engine::general_purpose::STANDARD.encode(text),
        });
        if let Some(s) = sha {
            body["sha"] = Value::from(s);
        }
        let res = client()?
            .put(SYNC_API)
            .bearer_auth(t)
            .header("Content-Type", "application/json")
            .body(body.to_string())
            .send()
            .map_err(|e| e.to_string())?;
        let code = res.status().as_u16();
        if !res.status().is_success() {
            log_line(&handle, &format!("sync push failed {}", code));
            return Err(format!("{}", code));
        }
        log_line(&handle, "sync push done");
        let out: Value = serde_json::from_str(&res.text().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        out.get("content").and_then(|c| c.get("sha")).and_then(|s| s.as_str()).map(String::from).ok_or("sha 없음".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Deserialize)]
struct TrayApp {
    id: String,
    name: String,
}

/// 트레이 메뉴. 열기, 실행 (설치된 앱), 업데이트 확인, 끝내기
fn tray_menu(app: &AppHandle, apps: &[TrayApp]) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
    let open = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "업데이트 확인", true, None::<&str>)?;
    let line = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "끝내기", true, None::<&str>)?;
    let items: Vec<MenuItem<tauri::Wry>> = apps
        .iter()
        .map(|a| MenuItem::with_id(app, format!("run:{}", a.id), &a.name, true, None::<&str>))
        .collect::<tauri::Result<_>>()?;
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
    let run = Submenu::with_items(app, "실행", !refs.is_empty(), &refs)?;
    Menu::with_items(app, &[&open, &run, &check, &line, &quit])
}

#[tauri::command]
fn set_tray_apps(handle: AppHandle, apps: Vec<TrayApp>) -> Result<(), String> {
    let menu = tray_menu(&handle, &apps).map_err(|e| e.to_string())?;
    let tray = handle.tray_by_id("main").ok_or("트레이 없음")?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        /* 두 번째로 켜면 새 창 대신 떠 있는 창을 앞으로 */
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            /* 트레이 (Steam 처럼 창을 닫아도 남음). 왼쪽 누르기는 창 열기. 실행 목록은 화면이 set_tray_apps 로 채움 */
            log_line(app.handle(), &format!("start v{}", app.package_info().version));
            let menu = tray_menu(app.handle(), &[])?;
            /* 창과 트레이 아이콘을 파일에서 직접 박음. 기본 창 아이콘에 맡겼더니 작업 표시줄이 옛 별 아이콘으로
               돌아갔다 (사용자 2026-09-25 "계속 예전 아이콘으로 돌아가") */
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))?;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_icon(icon.clone());
                /* 창은 숨은 채로 만들어짐 (tauri.conf visible false). 트레이 시작이 아니면 여기서 보임 */
                let once = read_settings(app.handle()).get("start_hidden_once").and_then(|v| v.as_bool()).unwrap_or(false);
                if once {
                    let _ = write_setting(app.handle(), "start_hidden_once", Value::from(false));
                }
                if !once && !std::env::args().any(|a| a == TRAY_ARG) {
                    let _ = w.show();
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
                "check" => {
                    let _ = app.emit("tray-check", ());
                }
                other => {
                    if let Some(id) = other.strip_prefix("run:") {
                        let _ = app.emit("tray-run", id.to_string());
                    }
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            })
            .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_manifest,
            app_status,
            running_status,
            stop_app,
            self_update_check,
            self_update_install,
            install_app,
            launch_app,
            uninstall_app,
            open_url,
            github_status,
            github_set_token,
            github_use_git_login,
            github_clear,
            get_settings,
            set_workspace,
            save_prefs,
            set_autostart,
            cancel_install,
            pause_install,
            discard_partial,
            rollback_app,
            sync_pull,
            sync_push,
            log_event,
            open_logs,
            notify_user,
            set_tray_apps,
            open_location,
            private_image,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("런처를 띄우지 못함");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zip_with(path: &Path, name: &str, body: &[u8]) {
        let f = std::fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(f);
        z.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(body).unwrap();
        z.finish().unwrap();
    }

    #[test]
    fn update_keeps_previous_version_and_swaps_back() {
        let root = std::env::temp_dir().join(format!("karmo-prev-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let dest = root.join("app");
        let file = root.join("a.zip");
        let read = |d: &Path| std::fs::read_to_string(d.join(VERSION_FILE)).unwrap();

        zip_with(&file, "x.txt", b"one");
        extract_zip(&file, &dest, "1").unwrap();
        assert!(!prev_dir(&dest).exists());
        assert!(swap_with_prev(&dest).is_err());

        zip_with(&file, "x.txt", b"two");
        extract_zip(&file, &dest, "2").unwrap();
        assert_eq!(read(&dest), "2");
        assert_eq!(read(&prev_dir(&dest)), "1");

        /* 같은 판을 다시 깔아도 옛 판은 남음 */
        extract_zip(&file, &dest, "2").unwrap();
        assert_eq!(read(&prev_dir(&dest)), "1");

        swap_with_prev(&dest).unwrap();
        assert_eq!(read(&dest), "1");
        assert_eq!(std::fs::read(dest.join("x.txt")).unwrap(), b"one");
        assert_eq!(read(&prev_dir(&dest)), "2");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn space_needed_counts_left_and_install() {
        const MB: u64 = 1024 * 1024;
        assert_eq!(space_needed("nsis", 10 * MB, 0), 20 * MB);
        assert_eq!(space_needed("nsis", 10 * MB, 4 * MB), 16 * MB);
        assert_eq!(space_needed("zip", 10 * MB, 10 * MB), 30 * MB);
        assert_eq!(space_needed("zip", 10 * MB, 20 * MB), 30 * MB);
    }

    #[test]
    fn utc_stamp_known_values() {
        assert_eq!(utc_stamp(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc_stamp(1793883626), "2026-11-05T13:00:26Z");
        assert_eq!(utc_stamp(951782400), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn safe_version_keeps_only_file_safe_chars() {
        assert_eq!(safe_version("0.1.21"), "0.1.21");
        assert_eq!(safe_version("..\\x/y v1"), "..xyv1");
    }

    #[test]
    fn remove_parts_only_touches_this_app() {
        let dir = std::env::temp_dir().join(format!("karmo-parts-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["wm-1.part", "wm-2.part", "wm-setup.exe", "dash-1.part"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        remove_parts(&dir, "wm", Some("wm-2.part"));
        assert!(!dir.join("wm-1.part").exists());
        assert!(dir.join("wm-2.part").exists());
        assert!(dir.join("wm-setup.exe").exists());
        assert!(dir.join("dash-1.part").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// 이 PC 의 KarmoLab 설치 기록과 최신 판 읽기 (네트워크, 레지스트리 실측). `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn karmolab_status_live() {
        let reg = registry("KarmoLab").expect("KarmoLab 레지스트리");
        assert!(reg.contains_key("DisplayVersion"));
        let latest: Value = serde_json::from_str(&get_text("https://github.com/mascari4615/KarmoLab/releases/latest/download/latest.json").unwrap()).unwrap();
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

    /// 떠 있는 KarmoLab 을 끄고 실행 중이 아닌지 (실제로 끔). `cargo test karmolab_stop_live -- --ignored`
    #[test]
    #[ignore]
    fn karmolab_stop_live() {
        let app = serde_json::json!({ "id": "karmolab", "install": { "format": "nsis", "registry": "KarmoLab" } });
        let exe = exe_of(&app).expect("KarmoLab 레지스트리");
        assert!(is_running(&exe), "먼저 KarmoLab 을 켜 둔다");
        stop_blocking(&app).unwrap();
        assert!(!is_running(&exe));
    }

    /// 실제 KarmoLab 최신 설치 파일을 받아 latest.json 의 서명으로 확인 (네트워크 수십 MB). `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn karmolab_signature_live() {
        let app: Value = serde_json::json!({
            "id": "karmolab",
            "source": { "url": "https://github.com/mascari4615/KarmoLab/releases/latest/download/latest.json", "platform": "windows-x86_64-nsis" }
        });
        let l = latest_of(&app).unwrap();
        let bytes = client().unwrap().get(l.url.unwrap()).header("Accept", "application/octet-stream").send().unwrap().bytes().unwrap();
        verify_signature(&bytes, l.signature.as_deref().unwrap()).expect("서명 확인");
        let mut bad = bytes.to_vec();
        bad[1000] ^= 0xff;
        assert!(verify_signature(&bad, l.signature.as_deref().unwrap()).is_err(), "한 바이트 바뀐 파일은 거절");
    }

    /// 컴패니언 zip: 공개 릴리스에서 찾고, 받고, sha256 확인, 한 바이트 바꾸면 거절, 풀어서 한글 이름과 시작 파일 확인.
    /// `cargo test companion_zip_live -- --ignored`
    #[test]
    #[ignore]
    fn companion_zip_live() {
        let app = serde_json::json!({
            "id": "companion",
            "source": { "type": "gh-release", "repo": "mascari4615/KarmoLab", "tag_prefix": "karmolab-v", "asset_prefix": "companion-", "asset_suffix": ".zip" }
        });
        let l = latest_of(&app).unwrap();
        let sha = l.sha256.expect("GitHub digest");
        let bytes = request(&l.url.unwrap(), Some("application/octet-stream")).unwrap().bytes().unwrap();
        verify_sha256(&bytes, &sha).expect("sha256");
        let mut bad = bytes.to_vec();
        bad[100] ^= 0xff;
        assert!(verify_sha256(&bad, &sha).is_err());
        let base = std::env::temp_dir().join("karmo-launcher-zip-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let file = base.join("c.zip");
        std::fs::write(&file, &bytes).unwrap();
        let dest = base.join("companion");
        extract_zip(&file, &dest, "test").unwrap();
        assert!(dest.join("scripts").join("start.cmd").exists());
        assert!(dest.join("companion-window.exe").exists());
        let names: Vec<String> = std::fs::read_dir(dest.join("characters")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        println!("version {:?} characters {:?}", l.version, names);
        assert!(names.iter().any(|n| n.chars().any(|c| ('\u{AC00}'..='\u{D7A3}').contains(&c))), "한글 이름이 깨지지 않음");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 이름이 겹치지 않는 ping 사본을 띄워 실행 중으로 읽고, 강제 종료 뒤 사라지는지 (Windows API 경로)
    #[cfg(windows)]
    #[test]
    fn chain_finds_cmd_parent() {
        let exe = "karmo-launcher-chain-test.exe";
        let path = std::env::temp_dir().join(exe);
        std::fs::copy(r"C:\Windows\System32\PING.EXE", &path).unwrap();
        let mut cmd = Command::new("cmd.exe").arg("/c").arg(&path).args(["-n", "30", "127.0.0.1"]).spawn().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(500));
        let chain = launcher_chain(exe);
        assert!(chain.contains(&cmd.id()), "cmd {} not in {:?}", cmd.id(), chain);
        for pid in chain {
            kill_pid(pid);
        }
        assert!(kill_all(exe));
        let _ = cmd.wait();
        std::thread::sleep(std::time::Duration::from_millis(200));
        assert!(!is_running(exe));
        let _ = std::fs::remove_file(&path);
    }

    #[cfg(windows)]
    #[test]
    fn kill_spawned_copy() {
        let exe = "karmo-launcher-kill-test.exe";
        let path = std::env::temp_dir().join(exe);
        std::fs::copy(r"C:\Windows\System32\PING.EXE", &path).unwrap();
        let mut child = Command::new(&path).args(["-n", "30", "127.0.0.1"]).spawn().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        assert!(is_running(exe));
        assert!(kill_all(exe));
        let _ = child.wait();
        assert!(!is_running(exe));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn registry_missing_is_none() {
        assert!(registry("karmo-launcher-no-such-app").is_none());
    }

    #[test]
    fn private_image_only_from_mascot_folder() {
        assert_eq!(private_image_path("data/launcher/mascots/wm.webp").unwrap().1, "image/webp");
        assert_eq!(private_image_path("data/launcher/mascots/wm.png").unwrap().1, "image/png");
        for bad in [
            "data/launcher/apps.json",
            "characters/yawn/card.md",
            "data/launcher/mascots/",
            "data/launcher/mascots/a/b.webp",
            "data/launcher/mascots/../secret.webp",
            "data/launcher/mascots/note.txt",
        ] {
            assert!(private_image_path(bad).is_err(), "{}", bad);
        }
    }

    #[test]
    fn rel_paths_stay_inside() {
        assert!(safe_rel("scripts\\start.cmd").is_ok());
        assert!(safe_rel("../x").is_err());
        assert!(safe_rel("a/../../x").is_err());
        assert!(safe_rel("C:/Windows").is_err());
        assert!(safe_rel("/etc").is_err());
    }

    #[test]
    fn secret_both_encodings() {
        assert_eq!(decode_secret(b"gho_abc"), "gho_abc");
        let w: Vec<u8> = "gho_abc".encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
        assert_eq!(decode_secret(&w), "gho_abc");
    }

    #[test]
    fn cp949_zip_name() {
        let (raw, _, _) = encoding_rs::EUC_KR.encode("characters\\욘.md");
        assert_eq!(zip_name(&raw), "characters\\욘.md");
        assert_eq!(zip_name("a/b.txt".as_bytes()), "a/b.txt");
    }
}
