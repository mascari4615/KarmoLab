use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant},
};

pub const ORIGIN: &str = "https://dash.mascari4615.com";
const LIMIT: usize = 1024 * 1024;
const KEYS: &[&str] = &[
    "karmolab.mydash.gh",
    "karmolab_google_token",
    "karmolab_google_refresh",
    "karmolab_planner_events",
    "karmolab_planner_tasks",
    "toolbox_theme",
    "toolbox_home_bg",
];

pub fn decode(headers: &str, body: &str, nonce: &str) -> Result<BTreeMap<String, String>, String> {
    let mut lines = headers.lines();
    if lines.next() != Some(&format!("POST /{nonce} HTTP/1.1")) {
        return Err("잘못된 연결 요청".into());
    }
    let origin = lines.find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case("origin").then(|| value.trim())
    });
    // HTTPS -> loopback HTTP form: browser Origin null, nonce as one-time capability
    if !matches!(origin, Some(ORIGIN) | Some("null")) {
        return Err("허용되지 않은 연결 출처".into());
    }
    let fields: BTreeMap<_, _> = url::form_urlencoded::parse(body.as_bytes())
        .into_owned()
        .collect();
    let payload = fields.get("payload").ok_or("연결 데이터 없음")?;
    let data: BTreeMap<String, String> =
        serde_json::from_str(payload).map_err(|_| "연결 데이터 형식 오류")?;
    if data.keys().any(|key| !KEYS.contains(&key.as_str())) {
        return Err("허용되지 않은 저장 항목".into());
    }
    if !data.contains_key("karmolab.mydash.gh") {
        return Err("브라우저에서 Dash 로그인 필요".into());
    }
    Ok(data)
}

fn read_request(stream: &mut TcpStream, nonce: &str) -> Result<BTreeMap<String, String>, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    loop {
        let n = stream
            .read(&mut chunk)
            .map_err(|_| "연결 데이터 읽기 실패")?;
        if n == 0 {
            return Err("연결 중단".into());
        }
        bytes.extend_from_slice(&chunk[..n]);
        if bytes.len() > LIMIT {
            return Err("연결 데이터 용량 초과".into());
        }
        if let Some(split) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            if split > 8192 {
                return Err("연결 헤더 용량 초과".into());
            }
            let headers = std::str::from_utf8(&bytes[..split]).map_err(|_| "헤더 형식 오류")?;
            let length: usize = headers
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse().ok())
                        .flatten()
                })
                .ok_or("데이터 크기 없음")?;
            if length > LIMIT - split - 4 {
                return Err("연결 데이터 용량 초과".into());
            }
            if bytes.len() >= split + 4 + length {
                let body = std::str::from_utf8(&bytes[split + 4..split + 4 + length])
                    .map_err(|_| "데이터 형식 오류")?;
                return decode(headers, body, nonce);
            }
        }
    }
}

pub fn receive(
    listener: TcpListener,
    nonce: &str,
    apply: impl Fn(BTreeMap<String, String>) -> Result<(), String>,
) -> Result<(), String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let result = read_request(&mut stream, nonce).and_then(&apply);
                let (status, message) = if result.is_ok() {
                    (
                        "200 OK",
                        "KarmoDash 연결 완료. PC 앱으로 돌아가세요. 이 창은 닫아도 됩니다.",
                    )
                } else {
                    ("400 Bad Request", "연결 실패. PC 앱에서 다시 연결하세요.")
                };
                let html = format!("<!doctype html><html lang=ko><meta charset=utf-8><title>KarmoDash 연결</title><p>{message}</p></html>");
                let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len());
                let _ = stream.write_all(response.as_bytes());
                if result.is_ok() {
                    return Ok(());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("연결 대기 5분 만료. 메뉴에서 다시 연결하세요.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn body() -> String {
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair(
                "payload",
                r#"{"karmolab.mydash.gh":"fixture","karmolab_planner_events":"[]"}"#,
            )
            .finish()
    }
    #[test]
    fn accepts_exact_origin_and_nonce() {
        assert_eq!(
            decode(
                &format!("POST /secret HTTP/1.1\r\nOrigin: {ORIGIN}"),
                &body(),
                "secret"
            )
            .unwrap()
            .len(),
            2
        );
        assert_eq!(
            decode("POST /secret HTTP/1.1\r\nOrigin: null", &body(), "secret")
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn rejects_wrong_origin_nonce_and_extra_keys() {
        assert!(decode(
            "POST /secret HTTP/1.1\r\nOrigin: https://example.com",
            &body(),
            "secret"
        )
        .is_err());
        assert!(decode(
            &format!("POST /wrong HTTP/1.1\r\nOrigin: {ORIGIN}"),
            &body(),
            "secret"
        )
        .is_err());
        let bad = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("payload", r#"{"arbitrary":"script"}"#)
            .finish();
        assert!(decode(
            &format!("POST /secret HTTP/1.1\r\nOrigin: {ORIGIN}"),
            &bad,
            "secret"
        )
        .is_err());
        assert!(decode("POST /secret HTTP/1.1", &body(), "secret").is_err());
    }
    #[test]
    fn socket_delivers_once_after_apply() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let task = std::thread::spawn(move || {
            receive(listener, "secret", |data| {
                assert_eq!(data.len(), 2);
                Ok(())
            })
        });
        let mut stream = TcpStream::connect(addr).unwrap();
        let body = body();
        write!(
            stream,
            "POST /secret HTTP/1.1\r\nOrigin: {ORIGIN}\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK"));
        assert!(!response.contains("fixture"));
        task.join().unwrap().unwrap();
        assert!(TcpStream::connect(addr).is_err());
    }
}
