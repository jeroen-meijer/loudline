#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(window) = app.get_webview_window("main") {
                use tauri::utils::config::Color;
                let bg = Color(11, 13, 16, 255);
                let _ = window.set_background_color(Some(bg));

                // macOS: title bar + window chrome use NSWindow background, not only the webview.
                // See https://v2.tauri.app/learn/window-customization/ (Transparent title bar).
                #[cfg(target_os = "macos")]
                {
                    use cocoa::appkit::{NSColor, NSWindow};
                    use cocoa::base::{id, nil};

                    if let Ok(ns_ptr) = window.ns_window() {
                        let ns_window = ns_ptr as id;
                        unsafe {
                            let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                                nil,
                                11.0 / 255.0,
                                13.0 / 255.0,
                                16.0 / 255.0,
                                1.0,
                            );
                            ns_window.setBackgroundColor_(bg_color);
                        }
                    }
                }

                // Ensure the window is visible (in case config used visible: false for flash workaround).
                let _ = window.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
