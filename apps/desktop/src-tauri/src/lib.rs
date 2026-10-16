mod commands;
mod db;
mod models;
mod ollama;

use std::sync::atomic::Ordering;
use tauri::Manager;

pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(debug_assertions)]
    let context = {
        let mut context = context;
        if let Some(port) = std::env::var("CORTEXOS_TEST_CDP_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|port| *port != 0)
        {
            if let Some(window) = context.config_mut().app.windows.first_mut() {
                // ponytail: preserve wry 0.57 defaults; review these flags when upgrading wry.
                window.additional_browser_args = Some(format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-address=127.0.0.1 --remote-debugging-port={port}"
                ));
            }
        }
        context
    };
    tauri::Builder::default()
        .setup(|app| {
            let mut directory = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            if let Ok(value) = std::env::var("CORTEXOS_TEST_DATA_DIR") {
                directory = std::path::PathBuf::from(value);
            }
            app.manage(commands::AppState::new(&directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::create_workspace,
            commands::list_conversations,
            commands::create_conversation,
            commands::rename_conversation,
            commands::load_messages,
            commands::check_ollama,
            commands::save_settings,
            commands::get_run,
            commands::cancel_run,
            commands::start_chat
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<commands::AppState>().inner().clone();
                if state.has_active() {
                    api.prevent_close();
                    if !state.closing.swap(true, Ordering::SeqCst) {
                        state.cancel_active();
                        let window = window.clone();
                        tauri::async_runtime::spawn(async move {
                            while state.has_active() {
                                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                            }
                            let _ = window.close();
                        });
                    }
                }
            }
        })
        .run(context)
        .expect("CortexOS desktop failed to start");
}
