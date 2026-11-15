//! 선택한 창에만 고정된 관리자 보조 프로세스. 임의 실행/파일 접근 명령 없음.
use crate::window_opacity_native::{OpacityStatus, WindowTarget};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpStream};
use std::time::Duration;

#[derive(Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request { Set { opacity: u8 }, Status, Close }
#[derive(Serialize, Deserialize)]
pub struct Reply { pub status: Option<OpacityStatus>, pub error: Option<String> }

fn line(stream: &mut TcpStream) -> Result<String, String> {
    let mut value = String::new();
    BufReader::new(stream.take(4097)).read_line(&mut value).map_err(|e| e.to_string())?;
    if value.len() > 4096 || !value.ends_with('\n') { return Err("보조 프로세스 연결이 종료되었습니다.".into()); }
    Ok(value)
}

pub struct Connection { stream: TcpStream, pub session_id: String }
fn prepare_client_stream(stream: &TcpStream) -> Result<(), String> {
    // Windows accept 소켓은 비동기 listener 속성을 상속.
    stream.set_nonblocking(false).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())
}
impl Connection {
    pub fn request(&mut self, request: Request) -> Result<OpacityStatus, String> {
        let mut payload = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
        payload.push(b'\n');
        self.stream.write_all(&payload).map_err(|e| e.to_string())?;
        let reply: Reply = serde_json::from_str(&line(&mut self.stream)?).map_err(|e| e.to_string())?;
        match (reply.status, reply.error) {
            (_, Some(e)) => Err(e),
            (Some(mut status), None) => { status.session_id = Some(self.session_id.clone()); Ok(status) },
            _ => Err("잘못된 보조 프로세스 응답".into()),
        }
    }
}
impl Drop for Connection { fn drop(&mut self) { let _ = self.stream.shutdown(Shutdown::Both); } }

#[cfg(windows)]
pub fn connect(target: WindowTarget) -> Result<Connection, String> {
    use std::net::TcpListener;
    use std::time::Instant;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    crate::window_opacity_native::validate_target(&target)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let secret = uuid::Uuid::new_v4().simple().to_string();
    let params = format!("--window-opacity-helper {} {} {} {}", listener.local_addr().map_err(|e| e.to_string())?.port(), secret, target.id, target.process_id);
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let (verb, file, args) = (wide("runas"), wide(&exe.to_string_lossy()), wide(&params));
    let result = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), args.as_ptr(), std::ptr::null(), 0) } as isize;
    if result <= 32 { return Err("관리자 승인이 취소되었거나 보조 프로세스를 실행할 수 없습니다.".into()); }
    let deadline = Instant::now() + Duration::from_secs(90);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                prepare_client_stream(&stream)?;
                if line(&mut stream).ok().as_deref() != Some(&(secret.clone()+"\n")) { continue; }
                let mut connection = Connection { stream, session_id: uuid::Uuid::new_v4().to_string() };
                connection.request(Request::Status)?;
                return Ok(connection);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(25)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("보조 프로세스 연결 시간이 초과되었습니다. 다시 연결하세요.".into())
}

#[cfg(not(windows))]
pub fn connect(_: WindowTarget) -> Result<Connection, String> { Err("Windows 앱에서 사용할 수 있습니다.".into()) }

// Tauri와 single-instance 플러그인보다 먼저 실행하는 제한 모드.
pub fn run_helper_if_requested() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--window-opacity-helper") { return false; }
    #[cfg(windows)]
    if let Err(e) = helper(&args) { eprintln!("[window-opacity] {e}"); }
    true
}

#[cfg(windows)]
fn helper(args: &[String]) -> Result<(), String> {
    use crate::window_opacity_native::SavedWindow;
    if args.len() != 6 || args[3].len() != 32 || !args[3].bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("잘못된 보조 모드 인자".into());
    }
    let port: u16 = args[2].parse().map_err(|_| "잘못된 포트")?;
    let id: usize = args[4].parse().map_err(|_| "잘못된 창 ID")?;
    let process_id: u32 = args[5].parse().map_err(|_| "잘못된 프로세스 ID")?;
    let mut stream = TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().map_err(|_| "잘못된 주소")?, Duration::from_secs(3)).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(3))).map_err(|e| e.to_string())?;
    stream.write_all(format!("{}\n",args[3]).as_bytes()).map_err(|e| e.to_string())?;
    let target = crate::window_opacity_native::list_windows()?.into_iter()
        .find(|t| t.id == id.to_string() && t.process_id == process_id)
        .ok_or("선택한 창을 찾을 수 없습니다.")?;
    let mut saved = SavedWindow::new(target)?;
    loop {
        let request: Request = serde_json::from_str(&line(&mut stream)?).map_err(|e| e.to_string())?;
        let close = matches!(request,Request::Close);
        let result = match request {
            Request::Set { opacity } => saved.apply(opacity),
            Request::Status => saved.status(),
            Request::Close => saved.restore(),
        };
        let success = result.is_ok();
        let reply = match result {
            Ok(status) => Reply { status: Some(status), error: None },
            Err(error) => Reply { status: None, error: Some(error) },
        };
        stream.write_all((serde_json::to_string(&reply).map_err(|e| e.to_string())?+"\n").as_bytes()).map_err(|e| e.to_string())?;
        if close && success { return Ok(()); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_rejects_unknown_operations_and_fields() {
        for raw in [r#"{"action":"exec","command":"anything"}"#,r#"{"action":"set","opacity":80,"target":"other"}"#,r#"{"action":"set","opacity":256}"#] {
            assert!(serde_json::from_str::<Request>(raw).is_err());
        }
    }
    #[test]
    fn accepted_socket_waits_for_delayed_reply() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let mut peer = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (stream,_) = listener.accept().unwrap();
        prepare_client_stream(&stream).unwrap();
        let responder = std::thread::spawn(move || {
            let request = line(&mut peer).unwrap();
            assert!(matches!(serde_json::from_str::<Request>(&request).unwrap(),Request::Status));
            std::thread::sleep(Duration::from_millis(40));
            let reply = Reply { status: Some(OpacityStatus { opacity: 100, ..Default::default() }), error: None };
            peer.write_all((serde_json::to_string(&reply).unwrap()+"\n").as_bytes()).unwrap();
        });
        let mut connection = Connection { stream, session_id: "test-session".into() };
        let result = connection.request(Request::Status).unwrap();
        assert_eq!(result.opacity,100);
        assert_eq!(result.session_id.as_deref(),Some("test-session"));
        responder.join().unwrap();
    }
}
