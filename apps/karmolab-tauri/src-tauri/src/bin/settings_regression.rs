#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if let Err(error) = karmolab_desktop_lib::run_settings_regression() {
        eprintln!("{error}");
        std::process::exit(1);
    }
    #[cfg(not(windows))]
    {
        eprintln!("The KarmoLab settings regression runner requires Windows.");
        std::process::exit(1);
    }
}
