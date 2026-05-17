use std::path::PathBuf;

// Must match `identifier` in tauri.conf.json — duplicated here because
// main.rs reads preferences.json before Tauri's path resolver is up.
pub const BUNDLE_ID: &str = "com.github.mgxv.owlbox";

pub const PREFS_FILENAME: &str = "preferences.json";
pub const WINDOW_MAIN: &str = "main";
pub const WINDOW_COMPOSE: &str = "compose";

pub fn prefs_path() -> Option<PathBuf> {
    Some(dirs::data_dir()?.join(BUNDLE_ID).join(PREFS_FILENAME))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_ends_with_bundle_and_filename() {
        let path = prefs_path().expect("data_dir available on test host");
        let suffix_unix = format!("{BUNDLE_ID}/{PREFS_FILENAME}");
        let suffix_win = format!("{BUNDLE_ID}\\{PREFS_FILENAME}");
        let s = path.to_string_lossy();
        assert!(
            s.ends_with(&suffix_unix) || s.ends_with(&suffix_win),
            "{s} did not end with {suffix_unix} or {suffix_win}"
        );
    }
}
