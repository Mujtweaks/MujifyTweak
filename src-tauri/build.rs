fn main() {
    let mut attrs = tauri_build::Attributes::new();

    // requireAdministrator manifest on RELEASE builds only.
    // Debug/dev builds stay unelevated — a process spawned by `tauri dev` from a
    // normal terminal cannot self-elevate and would die with ERROR_ELEVATION_REQUIRED (740).
    // The shipped NSIS installer/exe gets the manifest and prompts UAC once at launch.
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let windows = tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("windows-app-manifest.xml"));
        attrs = attrs.windows_attributes(windows);
    }

    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
