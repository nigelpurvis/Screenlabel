// Local, per-device settings.
//
// For v1 we store the user's OpenAI API key in localStorage. This is "BYOK"
// (bring your own key): the key lives on the user's machine and is never
// bundled into the app or sent anywhere except directly to OpenAI.
//
// Future hardening: move the key into the OS keychain (Tauri secure storage)
// so it isn't sitting in plaintext webview storage.

const KEY_API = 'screenlabel.openaiKey'

export function getApiKey(): string {
  return localStorage.getItem(KEY_API) ?? ''
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY_API, key.trim())
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}
