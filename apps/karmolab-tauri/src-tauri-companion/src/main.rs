// 동반자 창 — 배경이 뚫려 있고, 창틀이 없고, 늘 위에 떠 있는 창 하나.
//
// 하는 일은 그것뿐이다. 인격·기억·목소리는 전부 `packages/companion` 이 갖고 있고,
// 이 창은 그 화면을 불러다 화면 위에 얹기만 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 창에서 「눌러야 하는 자리」. 화면이 알려준 값을 여기 담아 둔다.
struct HitArea(std::sync::Mutex<Vec<(f64, f64, f64, f64)>>);

/// 몸을 끄는 중인지. 끄는 중 커서가 다른 모니터로 넘어가면 창을 그 모니터로 옮김
struct Dragging(std::sync::atomic::AtomicBool);

/**
 * 화면이 「여기는 눌러야 한다」고 알려주는 자리.
 *
 * 배경이 뚫린 창은 보이지 않아도 창이라, 그 위를 지나는 클릭을 전부 삼킨다 — 뒤에 있는
 * 프로그램을 못 누른다. 그렇다고 통째로 통과시키면 얘한테도 말을 못 건다.
 * 그래서 눌러야 하는 자리만 화면이 알려주고, 커서가 거기 있을 때만 창이 클릭을 받는다.
 */
#[tauri::command]
fn set_hit_areas(areas: Vec<(f64, f64, f64, f64)>, state: tauri::State<HitArea>) {
    if let Ok(mut guard) = state.0.lock() {
        // 개수가 바뀔 때만 알린다 — 「알려주고 있나」를 밖에서 확인할 수 있어야 한다.
        if guard.len() != areas.len() {
            eprintln!("[창] 누를 자리 {}개: {:?}", areas.len(), areas);
        }
        *guard = areas;
    }
}

/**
 * 그냥 끈다.
 *
 * 창을 닫는 정식 길이 막히면(권한·시점 문제) 닫기 단추가 아무 일도 안 한 것처럼 보인다.
 * 실제로 그랬다. 눌렀는데 안 꺼지는 것보다 나쁜 건 없으므로 확실한 길을 하나 더 둔다.
 */
#[tauri::command]
fn set_dragging(on: bool, state: tauri::State<Dragging>) {
    state.0.store(on, std::sync::atomic::Ordering::Relaxed);
}

/// (x, y, 너비, 높이), 물리 px
type Rect = (i32, i32, i32, i32);

/// dir 방향 (음수 왼쪽, 양수 오른쪽) 으로 가로로 맞닿고 세로로 겹치는 영역의 번호. 경계 오차 8px 허용
fn neighbor(dir: i32, current: Rect, areas: &[Rect]) -> Option<usize> {
    let (left, top, width, height) = current;
    let (right, bottom) = (left + width, top + height);
    areas.iter().position(|&(l, t, w, h)| {
        let touches = if dir < 0 { (l + w - left).abs() <= 8 } else { (l - right).abs() <= 8 };
        touches && t < bottom && t + h > top
    })
}

/**
 * 걷다가 화면 끝에 닿았을 때 그 방향의 옆 모니터로 창을 옮김. 옮겼으면 원점 이동량 (논리 px).
 *
 * 옆 모니터는 지금 모니터와 가로로 맞닿고 세로로 겹치는 것. 없으면 None, 화면은 거기서 멈춤
 */
#[tauri::command]
fn hop_monitor(dir: i32, window: tauri::WebviewWindow) -> Option<(f64, f64)> {
    let origin = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let monitors = window.available_monitors().ok()?;
    let areas: Vec<Rect> = monitors
        .iter()
        .map(|m| {
            let a = m.work_area();
            (a.position.x, a.position.y, a.size.width as i32, a.size.height as i32)
        })
        .collect();
    let current = (origin.x, origin.y, size.width as i32, size.height as i32);
    let target = monitors.get(neighbor(dir, current, &areas)?)?;
    fit_to(&window, &target).ok()?;
    let area = target.work_area();
    let scale = target.scale_factor();
    eprintln!("[창] 걸어서 모니터 옮김: {:?} -> {:?}", origin, area.position);
    Some((
        (origin.x - area.position.x) as f64 / scale,
        (origin.y - area.position.y) as f64 / scale,
    ))
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    // 어디에 붙을지는 실행할 때 정한다 — 동반자가 다른 포트로 떠 있을 수 있다.
    let url = std::env::var("COMPANION_URL").unwrap_or_else(|_| "http://localhost:4620".to_string());
    let width: f64 = env_number("COMPANION_WIDTH", 380.0);
    let height: f64 = env_number("COMPANION_HEIGHT", 560.0);
    let margin: f64 = env_number("COMPANION_MARGIN", 24.0);
    // 한 모니터의 작업 영역을 채우는 모드. 시작은 커서 모니터, 끌어서 넘기면 그 모니터
    let fit_monitor = std::env::var("COMPANION_FIT").is_ok_and(|v| v == "work");

    // 어디서든 말 걸 수 있게 하는 단축키. 창을 찾아 앞으로 꺼내는 게 아니라,
    // 하던 일 위에서 그냥 말하면 되게 하는 게 목적이다.
    let talk_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .manage(HitArea(std::sync::Mutex::new(Vec::new())))
        .manage(Dragging(std::sync::atomic::AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![set_hit_areas, set_dragging, hop_monitor, quit])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut != &talk_key || event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(window) = app.get_webview_window("companion") {
                        // 받아쓰기는 창 안에서 도는 것이라, 창이 살아 있어야 듣는다.
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("companion://talk", ());
                    }
                })
                .build(),
        )
        .setup(move |app| {
            if let Err(e) = app.global_shortcut().register(talk_key) {
                // 다른 프로그램이 이미 쓰고 있을 수 있다. 그래도 창은 떠야 한다.
                eprintln!("말하기 단축키를 못 잡았다 (Ctrl+Alt+Space): {e}");
            }

            let parsed = url
                .parse()
                .map_err(|e| format!("동반자 주소를 못 읽었다 ({url}): {e}"))?;

            let window = WebviewWindowBuilder::new(app, "companion", WebviewUrl::External(parsed))
                .title("동반자")
                .inner_size(width, height)
                .decorations(false) // 창틀·최소화·닫기 단추 없음
                .transparent(true) // 배경이 그대로 뚫린다
                .always_on_top(true)
                .skip_taskbar(true) // 작업표시줄에도 안 뜬다 — 창이 아니라 존재처럼
                .shadow(false)
                .resizable(true)
                .build()?;

            if fit_monitor {
                let monitor = window
                    .cursor_position()
                    .ok()
                    .and_then(|c| window.monitor_from_point(c.x, c.y).ok().flatten())
                    .or(window.primary_monitor()?);
                if let Some(monitor) = monitor {
                    fit_to(&window, &monitor)?;
                }
            } else if let Some(monitor) = window.primary_monitor()? {
                // 화면 오른쪽 아래에 앉힌다. 작업표시줄을 덮지 않게 작업 영역 기준으로.
                let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
                // 작업표시줄 높이를 정확히 알 수 없으므로 여백을 넉넉히 둔다.
                let x = screen.width - width - margin;
                let y = screen.height - height - margin - 48.0;
                window.set_position(tauri::LogicalPosition::new(x.max(0.0), y.max(0.0)))?;
            }

            mark_tool_window(&window);

            // 커서가 「눌러야 하는 자리」에 있을 때만 창이 클릭을 받는다.
            //
            // 화면 쪽에서 커서를 좇을 수는 없다 — 클릭을 통과시키는 동안에는 창이 마우스
            // 움직임 자체를 못 받기 때문이다. 그래서 여기서 커서 위치를 직접 들여다본다.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut passing_through = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(70));
                    let Some(window) = handle.get_webview_window("companion") else { continue };
                    let Ok(cursor) = window.cursor_position() else { continue };
                    let Ok(mut origin) = window.outer_position() else { continue };

                    if fit_monitor && handle.state::<Dragging>().0.load(std::sync::atomic::Ordering::Relaxed) {
                        if let Some(moved) = follow_cursor_monitor(&window, cursor.x, cursor.y, origin) {
                            origin = moved;
                        }
                    }
                    let scale = window.scale_factor().unwrap_or(1.0);

                    let local_x = (cursor.x - origin.x as f64) / scale;
                    let local_y = (cursor.y - origin.y as f64) / scale;

                    let inside = handle
                        .state::<HitArea>()
                        .0
                        .lock()
                        .map(|areas| {
                            areas.iter().any(|(x, y, w, h)| {
                                local_x >= *x && local_x <= x + w && local_y >= *y && local_y <= y + h
                            })
                        })
                        .unwrap_or(false);

                    if std::env::var("COMPANION_DEBUG_HIT").is_ok() {
                        eprintln!("[창] 커서 {:.0},{:.0} · 창 {:?} · 배율 {} · 안쪽 {}", cursor.x, cursor.y, origin, scale, inside);
                    }

                    // 바뀔 때만 알린다 — 매 번 부르면 창이 깜빡인다.
                    if inside == passing_through {
                        passing_through = !inside;
                        let _ = window.set_ignore_cursor_events(!inside);
                        // tao 가 확장 스타일을 통째로 다시 써서 매번 다시 붙임
                        mark_tool_window(&window);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("동반자 창을 띄우지 못했다");
}

/**
 * 창에 WS_EX_TOOLWINDOW 를 붙임.
 *
 * 크로뮴 계열 브라우저(Edge, Chrome, 웨일)는 자기 창이 다른 창에 다 가려지면 그리기를
 * 멈춤. 이 창은 화면 전체 크기라, 클릭을 받는 동안 (WS_EX_TRANSPARENT 해제) 아래 브라우저가
 * 가려졌다고 판정해 영상이 검게 변했음 (사용자 2026-11-02, 몸에 커서를 올리면 유튜브와
 * 치지직이 검정). 크로뮴의 가림 판정 `gfx::IsWindowVisibleAndFullyOpaque` 는 도구 창을 제외함
 */
fn mark_tool_window(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        extern "system" {
            fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
            fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
        }
        const GWL_EXSTYLE: i32 = -20;
        const WS_EX_TOOLWINDOW: isize = 0x80;
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = hwnd.0 as isize;
            unsafe {
                let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                if style & WS_EX_TOOLWINDOW == 0 {
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW);
                }
            }
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

/// 창을 그 모니터의 작업 영역 (작업표시줄 뺀 자리) 에 맞춤
fn fit_to(window: &tauri::WebviewWindow, monitor: &tauri::Monitor) -> tauri::Result<()> {
    let area = monitor.work_area();
    window.set_position(area.position)?;
    window.set_size(area.size)?;
    Ok(())
}

/**
 * 커서가 창 밖 다른 모니터에 있으면 창을 그 모니터로 옮김. 옮겼으면 새 원점.
 *
 * 화면에 창 원점 이동량을 알림. 화면은 그만큼 몸 자리를 되돌려 몸을 커서 아래에 유지
 */
fn follow_cursor_monitor(
    window: &tauri::WebviewWindow,
    x: f64,
    y: f64,
    origin: tauri::PhysicalPosition<i32>,
) -> Option<tauri::PhysicalPosition<i32>> {
    let target = window.monitor_from_point(x, y).ok().flatten()?;
    let area = target.work_area();
    let size = window.outer_size().ok()?;
    let already = area.position == origin && area.size == size;
    if already {
        return None;
    }
    // 커서가 아직 창 안이면 그대로 (모니터 경계 근처에서 창이 겹친 경우)
    let inside = x >= origin.x as f64
        && x < origin.x as f64 + size.width as f64
        && y >= origin.y as f64
        && y < origin.y as f64 + size.height as f64;
    if inside {
        return None;
    }
    fit_to(window, &target).ok()?;
    let scale = target.scale_factor();
    let _ = window.emit(
        "companion://moved",
        serde_json::json!({
            "dx": (origin.x - area.position.x) as f64 / scale,
            "dy": (origin.y - area.position.y) as f64 / scale,
        }),
    );
    eprintln!("[창] 모니터 옮김: {:?} -> {:?}", origin, area.position);
    Some(area.position)
}

fn env_number(key: &str, fallback: f64) -> f64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|v| *v > 0.0)
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::neighbor;

    // 이 PC 실측 배치: 주 모니터 2560x1392 (작업 영역), 왼쪽 1920x1032 가 y 156 에서 시작
    const PRIMARY: (i32, i32, i32, i32) = (0, 0, 2560, 1392);
    const LEFT: (i32, i32, i32, i32) = (-1920, 156, 1920, 1032);

    #[test]
    fn finds_left_and_right_neighbors() {
        let areas = [PRIMARY, LEFT];
        assert_eq!(neighbor(-1, PRIMARY, &areas), Some(1));
        assert_eq!(neighbor(1, LEFT, &areas), Some(0));
    }

    #[test]
    fn none_when_no_monitor_that_way() {
        let areas = [PRIMARY, LEFT];
        assert_eq!(neighbor(1, PRIMARY, &areas), None);
        assert_eq!(neighbor(-1, LEFT, &areas), None);
        assert_eq!(neighbor(-1, PRIMARY, &[PRIMARY]), None);
    }

    #[test]
    fn not_neighbor_without_vertical_overlap() {
        let below = (-1920, 1400, 1920, 1032);
        assert_eq!(neighbor(-1, PRIMARY, &[PRIMARY, below]), None);
    }

    #[test]
    fn tolerates_small_edge_gap() {
        let gap = (-1925, 0, 1920, 1080);
        assert_eq!(neighbor(-1, PRIMARY, &[PRIMARY, gap]), Some(1));
    }
}
