//! 도구 내려받기 파일의 다운로드 폴더 쓰기, 알림의 폴더 열기와 파일 열기
//!
//! WebView2 의 `<a download>` 는 표시 없이 끝남. 사용자가 저장 여부를 몰라
//! 같은 버튼 세 번 (2026-09-25, 같은 PNG 세 벌). 쓰기는 앱 몫, 결과는 경로
//!
//! 원격 사이트를 띄우는 앱이라 사이트 입력은 불신:
//! - 이름은 파일 이름 한 조각만. 경로 구분자와 예약 문자는 `_`
//! - 실행되는 확장자는 저장 거부
//! - 폴더 열기와 파일 열기는 다운로드 폴더 안의 파일만, 파일 열기는 그림, 소리, 영상, 글만

use std::path::{Path, PathBuf};

use tauri::Manager;

/// 저장 자체를 막는 확장자. 더블클릭 한 번에 실행되는 것들
const BLOCKED_EXT: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp",
    "scr", "lnk", "hta", "cpl", "reg", "jar", "dll", "sys", "url", "appref-ms", "pif",
];

/// 기본 앱으로 열어도 되는 확장자
const OPENABLE_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "apng", "avif", "ico", "mp3", "wav", "ogg",
    "flac", "m4a", "mp4", "webm", "mov", "txt", "md", "csv", "json", "pdf",
];

fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

/// `encodeURIComponent` 되돌리기. 머리글이 ASCII 전용이라 한글 이름은 이 길
fn percent_decode(raw: &str) -> String {
    let b = raw.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 사이트가 준 이름을 파일 이름 한 조각으로. 비면 `download`
fn clean_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut out: String = base
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    out = out.trim().trim_end_matches(['.', ' ']).to_string();
    if out.is_empty() || out == "." || out == ".." {
        out = "download".into();
    }
    if out.chars().count() > 150 {
        let ext = ext_of(&out);
        let stem: String = out.chars().take(140).collect();
        out = if ext.is_empty() { stem } else { format!("{stem}.{ext}") };
    }
    out
}

/// 같은 이름이 있으면 브라우저처럼 `이름 (1).png`
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..10_000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|c| !c.exists())
        .unwrap_or(first)
}

fn download_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().download_dir().map_err(|e| format!("다운로드 폴더를 못 찾았다: {e}"))
}

/// 다운로드 폴더 안 실제 파일 판정. 심볼릭 링크와 `..` 는 정규화로 거름
fn inside_downloads(app: &tauri::AppHandle, raw: &str) -> Result<PathBuf, String> {
    let dir = download_dir(app)?.canonicalize().map_err(|e| e.to_string())?;
    let path = PathBuf::from(raw).canonicalize().map_err(|_| "파일이 없다".to_string())?;
    if !path.starts_with(&dir) || !path.is_file() {
        return Err("다운로드 폴더 밖의 파일은 열지 않는다".into());
    }
    Ok(path)
}

/// 본문은 파일 바이트 그대로, 이름은 `x-file-name` 머리글 (URI 인코딩). 결과는 쓴 경로
#[tauri::command]
pub async fn download_save(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("파일 바이트가 필요하다".into());
    };
    let raw_name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let name = clean_name(&raw_name);
    if BLOCKED_EXT.contains(&ext_of(&name).as_str()) {
        return Err(format!("실행 파일 확장자는 저장하지 않는다: {name}"));
    }
    let dir = download_dir(&app)?;
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = unique_path(&dir, &name);
        std::fs::write(&path, &bytes).map_err(|e| format!("저장 실패: {e}"))?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

/// 탐색기 폴더 열기, 그 파일 선택 상태
#[tauri::command]
pub fn download_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = inside_downloads(&app, &path)?;
    crate::repo_file::reveal_in_explorer(&path)
}

/// 기본 앱으로 열기. 그림, 소리, 영상, 글만
#[tauri::command]
pub fn download_open(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = inside_downloads(&app, &path)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if !OPENABLE_EXT.contains(&ext_of(&name).as_str()) {
        return Err("이 형식은 폴더에서 직접 연다".into());
    }
    open::that(&path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 한글_이름_되돌리기() {
        assert_eq!(percent_decode("%EC%83%88-%EA%B7%B8%EB%A6%BC.png"), "새-그림.png");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn 이름은_파일_한_조각만() {
        assert_eq!(clean_name("../../Windows/evil.png"), "evil.png");
        assert_eq!(clean_name("a\\b\\c.png"), "c.png");
        assert_eq!(clean_name("새:그림?.png"), "새_그림_.png");
        assert_eq!(clean_name(""), "download");
        assert_eq!(clean_name(".."), "download");
        assert_eq!(clean_name("그림. . "), "그림");
    }

    #[test]
    fn 실행_확장자는_막고_그림은_연다() {
        assert!(BLOCKED_EXT.contains(&ext_of("run.EXE").as_str()));
        assert!(!BLOCKED_EXT.contains(&ext_of("새-그림.png").as_str()));
        assert!(OPENABLE_EXT.contains(&ext_of("새-그림.PNG").as_str()));
        assert!(!OPENABLE_EXT.contains(&ext_of("새-그림.meok").as_str()));
    }

    #[test]
    fn 같은_이름은_번호를_붙인다() {
        let dir = std::env::temp_dir().join(format!("kl-dl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.png"), b"x").unwrap();
        std::fs::write(dir.join("a (1).png"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "a.png"), dir.join("a (2).png"));
        assert_eq!(unique_path(&dir, "b.png"), dir.join("b.png"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
