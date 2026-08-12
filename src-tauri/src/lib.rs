use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use tauri::Manager;

// --- Secret storage -------------------------------------------------------
//
// The user's OpenAI key lives in the OS credential store, not in webview
// localStorage. localStorage is a plaintext file inside the app's data
// directory: anything running as the user could read the key straight off
// disk. The Keychain (and its Windows/Linux equivalents) is the platform's
// own answer to this, so we use it rather than rolling our own encryption.

const KEYCHAIN_SERVICE: &str = "com.screenlabel.app";
const KEYCHAIN_ACCOUNT: &str = "openai-api-key";

fn keychain() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_api_key() -> Result<String, String> {
    match keychain()?.get_password() {
        Ok(key) => Ok(key),
        // No stored key yet is a normal first-run state, not an error.
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let entry = keychain()?;
    if key.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&key).map_err(|e| e.to_string())
}

// --- Thumbnails -----------------------------------------------------------
//
// The grid used to render full-resolution screenshots scaled down in CSS,
// which meant decoding several megabytes per cell to paint a ~200px tile.
// Instead we downscale once, cache the result next to the index, and let the
// UI read the small file.
//
// The cache key includes the source file's modification time, so editing or
// replacing a screenshot invalidates its thumbnail without any explicit
// cache-busting from the frontend.

const THUMB_MAX_EDGE: u32 = 480;

fn thumb_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn cache_key(path: &str, modified_ms: u128) -> String {
    // FNV-1a: not cryptographic, just a fast way to turn a path plus mtime
    // into a stable filename. Collisions only cost a regenerated thumbnail.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in path.as_bytes().iter().chain(modified_ms.to_le_bytes().iter()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("{hash:016x}.jpg")
}

/// Returns the absolute path to a cached thumbnail, generating it on first use.
#[tauri::command]
fn thumbnail(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let modified_ms = fs::metadata(&path)
        .and_then(|m| m.modified())
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dest = thumb_cache_dir(&app)?.join(cache_key(&path, modified_ms));
    if dest.exists() {
        return Ok(dest.to_string_lossy().into_owned());
    }

    let img = image::open(&path).map_err(|e| e.to_string())?;
    // `thumbnail` preserves aspect ratio and is much cheaper than a full
    // Lanczos resize — the quality difference is invisible at this size.
    let thumb = img.thumbnail(THUMB_MAX_EDGE, THUMB_MAX_EDGE);
    thumb
        .into_rgb8()
        .save_with_format(&dest, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
