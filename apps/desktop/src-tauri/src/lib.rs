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
        .run(context)
        .expect("CortexOS desktop failed to start");
}
