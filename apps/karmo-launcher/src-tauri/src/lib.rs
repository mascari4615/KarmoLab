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
    let mut rq = client()?.get(url);
    if let Some(a) = accept {
        rq = rq.header("Accept", a);
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
async fn stop_app(app: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
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
        std::fs::remove_dir_all(dest).map_err(|e| format!("옛 판을 못 지움 (실행 중인지 확인): {}", e))?;
    }
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
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
    tauri::async_runtime::spawn_blocking(move || {
        let say = |got: u64, total: u64, phase: &str| {
            let _ = handle.emit("install-progress", Progress { id: id.clone(), got, total, phase: phase.to_string() });
        };
        let mut res = request(&url, Some("application/octet-stream"))?;
        let total = res.content_length().unwrap_or(0);
        /* %TEMP% 에 exe 를 받아 실행하는 것도 다운로더 모양이라 런처 자기 캐시 폴더에 받음 */
        let dir = handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("downloads");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file: PathBuf = dir.join(if format == "zip" { format!("{}.zip", id) } else { format!("{}-setup.exe", id) });
        let mut out = std::fs::File::create(&file).map_err(|e| e.to_string())?;
        /* sha256 은 받으면서 잼. WM zip 은 2GB 가까이라 통째로 메모리에 올리지 않음 */
        use sha2::Digest;
        let mut hasher = sha2::Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let mut got: u64 = 0;
        let mut last: u64 = 0;
        loop {
            if cancel_list().contains(&id) {
                drop(out);
                let _ = std::fs::remove_file(&file);
                return Err("취소함".into());
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
    .map_err(|e| e.to_string())?
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
            let p = path.to_string_lossy().to_string();
            let run: Vec<String> = app
                .get("local")
                .and_then(|l| l.get("run"))
                .and_then(|r| r.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.replace("{path}", &p)).collect())
                .unwrap_or_else(|| vec![p.clone()]);
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
        return Err(e.to_string());
    }
    app.restart();
}

fn show_main(app: &AppHandle) {
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
            open_location,
            quit_app
        ])
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
