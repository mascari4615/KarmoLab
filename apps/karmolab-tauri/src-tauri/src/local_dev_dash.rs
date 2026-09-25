//! Dash 머신 방이 부르는 좁은 문 (`/dash/*`). change.dash-machines MVP 2.
//!
//! Dash 는 `https://dash.mascari4615.com` 의 웹 장. 앱 밖이라 `invoke` 가 없어,
//! 같은 localhost HTTP (`local_dev_http`) 에 브라우저용 길을 따로 둠
//!
//! 막는 것
//! - 출처: `Origin` 이 dash 주소 또는 로컬 dev 출처 (`http://127.0.0.1:<포트>`, `http://localhost:<포트>`) 일 때만.
//!   브라우저 안의 장은 `Origin` 변경 불가
//! - DNS rebinding: `Host` 가 `127.0.0.1:<포트>` 또는 `localhost:<포트>` 일 때만
//! - 짝 맺기: 첫 요청 `POST /dash/pair` 는 앱이 창으로 묻고 사람이 허용해야 토큰 발급
//!   토큰은 dash 용 따로 (`localdev-dash.json`). 에이전트용 토큰 (`localdev-http.json`) 은 브라우저로 안 감
//! - 범위: 로컬 서버 켜고 끄기, 로그, stdin, 저장소 루트, `envFiles` 에 적힌 파일만 읽고 쓰기.
//!   `/files/*` 같은 다른 길과 아무 저장소 파일 쓰기는 없음
//!
//! 브라우저 쪽 조건 (2026-09-25 실측, Edge 153): 공개 https 장이 loopback 을 부르면
//! Local Network Access 권한 창 한 번. 허용 뒤에는 보통 CORS
//! preflight 에 `Access-Control-Request-Private-Network` 없음 (옛 PNA 는 폐기)
//! 옛 판 브라우저를 위해 `Access-Control-Allow-Private-Network: true` 도 같이 보냄

use crate::local_dev::{self, LocalDevState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Manager;
use tiny_http::{Header, Method, Request, Response};

const DASH_ORIGIN: &str = "https://dash.mascari4615.com";
const TOKEN_FILE: &str = "localdev-dash.json";
const DEFAULT_TAIL_LINES: usize = 200;
const MAX_TAIL_LINES: usize = 2000;
const PORT_PROBE_MS: u64 = 250;

/// 짝 맺기 창은 한 번에 하나
static PAIR_OPEN: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize, Default)]
struct TokenFile {
    #[serde(default)]
    tokens: Vec<TokenEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct TokenEntry {
    token: String,
    origin: String,
    at: String,
}

/// `/dash` 아래 경로인지. 호출자가 인증 전에 먼저 가름
pub fn is_dash_path(path: &str) -> bool {
    path == "/dash" || path.starts_with("/dash/")
}

/// 요청 하나를 따로 thread 에서. 짝 맺기 창과 외부 PID 풀스캔이 에이전트 요청을 막지 않게
pub fn handle(app: tauri::AppHandle, request: Request, port: u16) {
    std::thread::spawn(move || handle_blocking(&app, request, port));
}

fn header_value(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_string())
}

/// dash 주소, 또는 로컬 dev 서버 출처
pub(crate) fn origin_allowed(origin: &str) -> bool {
    if origin == DASH_ORIGIN {
        return true;
    }
    for prefix in ["http://127.0.0.1:", "http://localhost:"] {
        if let Some(rest) = origin.strip_prefix(prefix) {
            return !rest.is_empty() && rest.len() <= 5 && rest.chars().all(|c| c.is_ascii_digit());
        }
    }
    false
}

/// rebinding 으로 남의 이름이 127.0.0.1 을 가리키는 판을 막음
pub(crate) fn host_allowed(host: &str, port: u16) -> bool {
    host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}")
}

fn cors_headers(origin: &str) -> Vec<Header> {
    let pairs: [(&str, &str); 6] = [
        ("Access-Control-Allow-Origin", origin),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "authorization, content-type"),
        ("Access-Control-Allow-Private-Network", "true"),
        ("Access-Control-Max-Age", "600"),
        ("Vary", "Origin"),
    ];
    pairs
        .iter()
        .filter_map(|(k, v)| Header::from_bytes(k.as_bytes(), v.as_bytes()).ok())
        .collect()
}

fn reply(request: Request, origin: Option<&str>, code: u16, payload: &str) {
    let mut response = Response::from_string(payload).with_status_code(code);
    if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]) {
        response = response.with_header(h);
    }
    if let Some(o) = origin {
        for h in cors_headers(o) {
            response = response.with_header(h);
        }
    }
    let _ = request.respond(response);
}

fn ok_json(value: serde_json::Value) -> String {
    serde_json::json!({ "ok": true, "data": value }).to_string()
}

fn err_json(msg: &str) -> String {
    serde_json::json!({ "ok": false, "error": msg }).to_string()
}

fn token_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir 조회 실패: {}", e))?;
    fs::create_dir_all(&base).map_err(|e| format!("데이터 폴더 만들기 실패: {}", e))?;
    Ok(base.join(TOKEN_FILE))
}

fn load_tokens(app: &tauri::AppHandle) -> TokenFile {
    token_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<TokenFile>(&raw).ok())
        .unwrap_or_default()
}

fn save_tokens(app: &tauri::AppHandle, file: &TokenFile) -> Result<(), String> {
    let path = token_path(app)?;
    let raw = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| format!("토큰 파일 쓰기 실패: {}", e))
}

fn bearer(request: &Request) -> Option<String> {
    header_value(request, "Authorization")
        .and_then(|v| v.strip_prefix("Bearer ").map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
}

fn token_valid(app: &tauri::AppHandle, token: &str) -> bool {
    load_tokens(app).tokens.iter().any(|t| t.token == token)
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

fn handle_blocking(app: &tauri::AppHandle, mut request: Request, port: u16) {
    let origin = header_value(&request, "Origin").unwrap_or_default();
    let host = header_value(&request, "Host").unwrap_or_default();
    if !origin_allowed(&origin) {
        return reply(request, None, 403, &err_json("허용 안 된 출처"));
    }
    if !host_allowed(&host, port) {
        return reply(request, None, 403, &err_json("허용 안 된 Host"));
    }
    let o = Some(origin.as_str());
    let method = request.method().clone();
    if method == Method::Options {
        return reply(request, o, 204, "");
    }
    let url = request.url().to_string();
    let (path, query) = match url.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (url.clone(), String::new()),
    };
    let token = bearer(&request);
    let paired = token.as_deref().map(|t| token_valid(app, t)).unwrap_or(false);

    /* 인증 없이 되는 둘: 인사 (앱이 있나, 짝이 맞나), 짝 맺기 */
    if method == Method::Get && path == "/dash/hello" {
        let host_name = std::env::var("COMPUTERNAME").unwrap_or_default();
        return reply(
            request,
            o,
            200,
            &ok_json(serde_json::json!({
                "app": "karmolab",
                "version": env!("CARGO_PKG_VERSION"),
                "host": host_name,
                "paired": paired,
            })),
        );
    }
    if method == Method::Post && path == "/dash/pair" {
        return pair(app, request, &origin);
    }
    if !paired {
        return reply(request, o, 401, &err_json("짝 맺기 전 (앱에서 허용 필요)"));
    }

    let mut body = String::new();
    if method == Method::Post {
        let _ = request.as_reader().read_to_string(&mut body);
    }
    let (code, payload) = route(app, &method, &path, &query, &body, token.as_deref().unwrap_or(""));
    reply(request, o, code, &payload)
}

/// 앱 창으로 묻고, 허용이면 새 토큰. 창이 떠 있는 동안 응답을 붙들고 있음 (dash 는 기다림)
fn pair(app: &tauri::AppHandle, request: Request, origin: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    let o = Some(origin);
    if PAIR_OPEN.swap(true, Ordering::SeqCst) {
        return reply(request, o, 409, &err_json("이미 묻는 창이 떠 있음"));
    }
    let ok = app
        .dialog()
        .message(format!(
            "{} 이 이 PC 의 로컬 서버 조작을 요청.\n허용하면 그 브라우저에서 켜기, 끄기, 로그, stdin, .env 편집 가능. 허용할까요?",
            origin
        ))
        .title("KarmoLab, Dash 연결")
        .buttons(MessageDialogButtons::OkCancelCustom("허용".into(), "거절".into()))
        .blocking_show();
    PAIR_OPEN.store(false, Ordering::SeqCst);
    if !ok {
        return reply(request, o, 403, &err_json("앱에서 거절함"));
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    let mut file = load_tokens(app);
    file.tokens.push(TokenEntry {
        token: token.clone(),
        origin: origin.to_string(),
        at: now_iso(),
    });
    /* 오래된 것부터 버림. 브라우저 몇 개면 충분 */
    let excess = file.tokens.len().saturating_sub(8);
    if excess > 0 {
        file.tokens.drain(0..excess);
    }
    match save_tokens(app, &file) {
        Ok(()) => reply(request, o, 200, &ok_json(serde_json::json!({ "token": token }))),
        Err(e) => reply(request, o, 500, &err_json(&e)),
    }
}

fn json_str(body: &str, key: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    v.get(key)?.as_str().map(|s| s.to_string())
}

fn query_str(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        if k != key {
            return None;
        }
        let bytes = v.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                if let Ok(b) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
            }
            out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
            i += 1;
        }
        Some(String::from_utf8_lossy(&out).into_owned())
    })
}

fn unit(r: Result<(), String>) -> (u16, String) {
    match r {
        Ok(()) => (200, ok_json(serde_json::Value::Null)),
        Err(e) => (500, err_json(&e)),
    }
}

fn value<T: Serialize>(r: Result<T, String>) -> (u16, String) {
    match r {
        Ok(v) => (200, ok_json(serde_json::to_value(v).unwrap_or(serde_json::Value::Null))),
        Err(e) => (500, err_json(&e)),
    }
}

/// 저장소의 servermonitor-config.json 원문. 없거나 깨졌으면 null
fn read_config(state: &LocalDevState) -> Option<serde_json::Value> {
    let root = state.repo_root.lock().ok()?.clone()?;
    let raw = fs::read_to_string(PathBuf::from(root).join(local_dev::CONFIG_REL_PATH)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// `http://127.0.0.1:4615/...` 의 포트
pub(crate) fn port_of(url: &str) -> Option<u16> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split('/').next()?;
    let (host, port) = authority.rsplit_once(':')?;
    if !(host == "127.0.0.1" || host == "localhost") {
        return None;
    }
    port.parse().ok()
}

fn listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(PORT_PROBE_MS)).is_ok()
}

/// config 에 적힌 포트 전부 (devProfiles healthUrl, localMonitors url)
fn ports_in(config: &serde_json::Value) -> Vec<u16> {
    let mut out: Vec<u16> = Vec::new();
    for (list, key) in [("devProfiles", "healthUrl"), ("localMonitors", "url")] {
        if let Some(arr) = config.get(list).and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(p) = item.get(key).and_then(|v| v.as_str()).and_then(port_of) {
                    if !out.contains(&p) {
                        out.push(p);
                    }
                }
            }
        }
    }
    out
}

fn env_paths(config: &Option<serde_json::Value>) -> Vec<String> {
    config
        .as_ref()
        .and_then(|c| c.get("envFiles"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.get("relPath").and_then(|v| v.as_str()))
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn state_payload(app: &tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<LocalDevState>();
    let repo_root = local_dev::localdev_get_repo_root(app.state::<LocalDevState>());
    let config = read_config(&state);
    let tracked: Vec<serde_json::Value> = state
        .pids
        .lock()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), *v)).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .map(|(id, pid)| serde_json::json!({ "id": id, "pid": pid, "alive": local_dev::is_pid_alive(pid) }))
        .collect();
    let (external, external_err) = if repo_root.is_some() {
        match local_dev::localdev_list_external_pids_sync(&state) {
            Ok(m) => (m, None),
            Err(e) => (HashMap::new(), Some(e)),
        }
    } else {
        (HashMap::new(), None)
    };
    let ports: serde_json::Map<String, serde_json::Value> = config
        .as_ref()
        .map(ports_in)
        .unwrap_or_default()
        .into_iter()
        .map(|p| (p.to_string(), serde_json::Value::Bool(listening(p))))
        .collect();
    serde_json::json!({
        "repoRoot": repo_root,
        "config": config,
        "tracked": tracked,
        "external": external,
        "externalError": external_err,
        "listening": ports,
    })
}

fn route(
    app: &tauri::AppHandle,
    method: &Method,
    path: &str,
    query: &str,
    body: &str,
    token: &str,
) -> (u16, String) {
    let need = |key: &str| json_str(body, key);
    match (method, path) {
        (Method::Get, "/dash/localdev/state") => (200, ok_json(state_payload(app))),

        (Method::Post, "/dash/localdev/start") => match need("profile") {
            Some(p) => unit(local_dev::localdev_start_sync(p, app.clone(), &app.state::<LocalDevState>())),
            None => (400, err_json("profile 필요")),
        },
        (Method::Post, "/dash/localdev/stop") => match need("profile") {
            Some(p) => unit(local_dev::localdev_stop_sync(p, app.clone(), &app.state::<LocalDevState>())),
            None => (400, err_json("profile 필요")),
        },
        (Method::Post, "/dash/localdev/external-stop") => match need("profile") {
            Some(p) => value(local_dev::localdev_stop_external_sync(p, &app.state::<LocalDevState>())),
            None => (400, err_json("profile 필요")),
        },
        (Method::Post, "/dash/localdev/stdin") => match (need("profile"), need("text")) {
            (Some(p), Some(t)) => unit(local_dev::localdev_send_stdin(p, t, app.state::<LocalDevState>())),
            _ => (400, err_json("profile, text 필요")),
        },
        (Method::Post, "/dash/localdev/deploy") => match need("profile") {
            Some(p) => value(tauri::async_runtime::block_on(local_dev::localdev_deploy_stream(
                p,
                app.clone(),
                app.state::<LocalDevState>(),
            ))),
            None => (400, err_json("profile 필요")),
        },
        (Method::Post, "/dash/localdev/npm-install") => match need("profile") {
            Some(p) => value(tauri::async_runtime::block_on(local_dev::localdev_npm_install_stream(
                p,
                app.clone(),
                app.state::<LocalDevState>(),
            ))),
            None => (400, err_json("profile 필요")),
        },
        (Method::Get, "/dash/localdev/log") => {
            let Some(profile) = query_str(query, "profile") else {
                return (400, err_json("profile 필요"));
            };
            let lines = query_str(query, "tail")
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(DEFAULT_TAIL_LINES)
                .min(MAX_TAIL_LINES);
            match local_dev::localdev_log_tail(app, &profile, lines) {
                Ok(text) => (200, ok_json(serde_json::json!({ "profile": profile, "log": text }))),
                Err(e) => (500, err_json(&e)),
            }
        }
        (Method::Post, "/dash/localdev/repo-root") => match need("path") {
            Some(p) => unit(local_dev::localdev_set_repo_root(p, app.clone(), app.state::<LocalDevState>())),
            None => (400, err_json("path 필요")),
        },

        /* .env 는 envFiles 에 적힌 자리만 */
        (Method::Get, "/dash/env") => {
            let Some(rel) = query_str(query, "path") else {
                return (400, err_json("path 필요"));
            };
            let config = read_config(&app.state::<LocalDevState>());
            if !env_paths(&config).contains(&rel) {
                return (403, err_json("envFiles 에 없는 파일"));
            }
            match crate::repo_file::repofile_read(rel, app.state::<LocalDevState>()) {
                Ok(text) => (200, ok_json(serde_json::json!({ "exists": true, "text": text }))),
                Err(e) if e == "FILE_NOT_FOUND" => (200, ok_json(serde_json::json!({ "exists": false, "text": "" }))),
                Err(e) => (500, err_json(&e)),
            }
        }
        (Method::Post, "/dash/env") => {
            let (Some(rel), Some(content)) = (need("path"), need("content")) else {
                return (400, err_json("path, content 필요"));
            };
            let config = read_config(&app.state::<LocalDevState>());
            if !env_paths(&config).contains(&rel) {
                return (403, err_json("envFiles 에 없는 파일"));
            }
            unit(crate::repo_file::repofile_write(rel, content, app.state::<LocalDevState>()))
        }

        (Method::Post, "/dash/unpair") => {
            let mut file = load_tokens(app);
            file.tokens.retain(|t| t.token != token);
            unit(save_tokens(app, &file))
        }

        _ => (404, err_json("알 수 없는 경로")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_rule() {
        assert!(origin_allowed("https://dash.mascari4615.com"));
        assert!(origin_allowed("http://127.0.0.1:8871"));
        assert!(origin_allowed("http://localhost:8813"));
        assert!(!origin_allowed("https://dash.mascari4615.com.evil.com"));
        assert!(!origin_allowed("https://lab.mascari4615.com"));
        assert!(!origin_allowed("http://127.0.0.1:"));
        assert!(!origin_allowed("http://127.0.0.1:80.evil.com"));
        assert!(!origin_allowed("null"));
        assert!(!origin_allowed(""));
    }

    #[test]
    fn host_rule() {
        assert!(host_allowed("127.0.0.1:8766", 8766));
        assert!(host_allowed("localhost:8766", 8766));
        assert!(!host_allowed("evil.com:8766", 8766));
        assert!(!host_allowed("127.0.0.1:8767", 8766));
    }

    #[test]
    fn port_rule() {
        assert_eq!(port_of("http://127.0.0.1:4615/webhook/github"), Some(4615));
        assert_eq!(port_of("http://localhost:5173/"), Some(5173));
        assert_eq!(port_of("https://example.com:443/"), None);
        assert_eq!(port_of("http://127.0.0.1/"), None);
    }

    #[test]
    fn query_decode() {
        assert_eq!(query_str("path=apps%2Fa%2F.env&x=1", "path").as_deref(), Some("apps/a/.env"));
        assert_eq!(query_str("profile=karmolab-bot-tunnel", "profile").as_deref(), Some("karmolab-bot-tunnel"));
        assert_eq!(query_str("a=1", "profile"), None);
    }

    #[test]
    fn env_whitelist() {
        let c: serde_json::Value = serde_json::from_str(
            r#"{"envFiles":[{"id":"a","relPath":"apps/x/.env"},{"id":"b","relPath":" "}]}"#,
        )
        .unwrap();
        assert_eq!(env_paths(&Some(c)), vec!["apps/x/.env".to_string()]);
        assert!(env_paths(&None).is_empty());
    }
}
