#[path = "../../../src-tauri/src/window_opacity_native.rs"]
mod window_opacity_native;
#[path = "../../../src-tauri/src/window_opacity_service.rs"]
mod window_opacity_service;

fn main() { window_opacity_service::run_helper_if_requested(); }

#[cfg(all(test,windows))]
mod native_tests {
    use super::window_opacity_native::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use windows_sys::Win32::Foundation::HWND;
    struct TestWindow(HWND);
    impl TestWindow {
        fn new() -> Self {
            let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
            let title: Vec<u16> = "Opacity verification\0".encode_utf16().collect();
            let h = unsafe { CreateWindowExW(0,class.as_ptr(),title.as_ptr(),WS_OVERLAPPEDWINDOW,0,0,320,200,std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null()) };
            assert!(!h.is_null(),"native test window creation");
            Self(h)
        }
        fn target(&self) -> WindowTarget {
            WindowTarget { id: (self.0 as usize).to_string(), process_id: std::process::id(), title: "Opacity verification".into() }
        }
        fn style(&self) -> u32 { unsafe { GetWindowLongW(self.0,GWL_EXSTYLE) as u32 } }
        fn alpha(&self) -> u8 {
            let (mut color,mut alpha,mut flags) = (0,0,0);
            assert_ne!(unsafe { GetLayeredWindowAttributes(self.0,&mut color,&mut alpha,&mut flags) },0);
            alpha
        }
    }
    impl Drop for TestWindow { fn drop(&mut self) { unsafe { DestroyWindow(self.0); } } }
    #[test]
    fn native_alpha_and_explicit_restore() {
        let window = TestWindow::new(); let original = window.style();
        let mut saved = SavedWindow::new(window.target()).unwrap();
        assert_eq!(saved.apply(80).unwrap().opacity,80); assert_eq!(window.alpha(),204);
        saved.apply(20).unwrap(); assert_eq!(window.alpha(),51);
        saved.apply(100).unwrap(); assert_eq!(window.alpha(),255);
        saved.restore().unwrap(); assert_eq!(window.style(),original);
    }
    #[test]
    fn disconnect_drop_restores_original_layered_attributes() {
        let window = TestWindow::new();
        unsafe { SetWindowLongW(window.0,GWL_EXSTYLE,(window.style() | WS_EX_LAYERED) as i32); SetLayeredWindowAttributes(window.0,0,230,LWA_ALPHA); }
        { let mut saved = SavedWindow::new(window.target()).unwrap(); saved.apply(55).unwrap(); assert_eq!(window.alpha(),140); }
        assert_eq!(window.alpha(),230); assert_ne!(window.style() & WS_EX_LAYERED,0);
    }
    #[test]
    fn closed_target_can_be_disconnected_before_any_change() {
        let window = TestWindow::new();
        let mut saved = SavedWindow::new(window.target()).unwrap();
        unsafe { DestroyWindow(window.0); }
        assert!(saved.restore().unwrap().target.is_none());
    }
    #[test]
    fn wrong_process_and_invalid_percent_leave_window_unchanged() {
        let window = TestWindow::new(); let original = window.style();
        let mut wrong = window.target(); wrong.process_id = 0;
        assert!(SavedWindow::new(wrong).is_err());
        let mut saved = SavedWindow::new(window.target()).unwrap();
        assert!(saved.apply(0).is_err()); assert!(saved.apply(101).is_err());
        assert_eq!(window.style(),original);
    }
}
