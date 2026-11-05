use std::{env, fs, path::PathBuf};

/// 안에 넣을 NSIS 설치 파일. KARMO_SETUP_PAYLOAD 가 없으면 런처 빌드 산출물의 최신 파일
fn payload() -> PathBuf {
    println!("cargo:rerun-if-env-changed=KARMO_SETUP_PAYLOAD");
    if let Some(p) = env::var_os("KARMO_SETUP_PAYLOAD") {
        return PathBuf::from(p);
    }
    let nsis = PathBuf::from("../../src-tauri/target/release/bundle/nsis");
    let newest = fs::read_dir(&nsis).ok().and_then(|dir| {
        dir.flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "exe"))
            .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
            .map(|e| e.path())
    });
    if let Some(p) = newest {
        return p;
    }
    /* 설치 파일 없는 개발 빌드. 설치를 누르면 오류로 알림 */
    let empty = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("empty-payload.exe");
    fs::write(&empty, []).unwrap();
    empty
}

fn main() {
    let path = fs::canonicalize(payload()).expect("KARMO_SETUP_PAYLOAD 파일 없음");
    println!("cargo:rerun-if-changed={}", path.display());
    println!("cargo:rustc-env=KARMO_SETUP_PAYLOAD_PATH={}", path.display());
    tauri_build::build()
}
