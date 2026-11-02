fn main() {
    // 창 내용이 바깥 주소(localhost)라 앱 명령도 권한 필요. 목록의 명령마다 allow-<이름> 권한 생성,
    // capabilities/default.json 에서 부여
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["set_hit_areas", "set_dragging", "quit"]),
    ))
    .expect("tauri build");
}
