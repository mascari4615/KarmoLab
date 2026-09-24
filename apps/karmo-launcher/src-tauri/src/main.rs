// 릴리스에서 콘솔 창 없이
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    karmo_launcher_lib::run()
}
