import { invoke } from '@tauri-apps/api/core'

// Local, per-device settings.
//
// The user's OpenAI API key is "BYOK" (bring your own key): it lives on the
// user's machine and is never bundled into the app or sent anywhere except
// directly to OpenAI.
//
// The key is stored in the OS credential store (macOS Keychain, Windows
// Credential Manager, Linux Secret Service) via the Rust side. It used to live
// in localStorage, which is a plaintext file in the app's data directory —
// readable by anything running as the user. For an app whose whole pitch is
// that your data stays yours, that was the wrong default.
//
// The keychain is async, but `getApiKey` is called synchronously from the AI
// provider, so the key is read once at startup and kept in memory for the
// lifetime of the process. `loadApiKey` must run before any AI call.

const LEGACY_KEY = 'screenlabel.openaiKey'

let cached = ''

/** Reads the key into memory, migrating any pre-keychain localStorage key. */
export async function loadApiKey(): Promise<void> {
  const legacy = localStorage.getItem(LEGACY_KEY)?.trim()
  if (legacy) {
    await invoke('set_api_key', { key: legacy })
    localStorage.removeItem(LEGACY_KEY)
    cached = legacy
    return
  }
  try {
    cached = await invoke<string>('get_api_key')
  } catch (e) {
    // A locked or unavailable keychain shouldn't hard-fail startup; the user
    // just gets prompted for their key as if it were a first run.
    console.error('Could not read key from keychain:', e)
    cached = ''
  }
}

export function getApiKey(): string {
  return cached
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim()
  await invoke('set_api_key', { key: trimmed })
  cached = trimmed
}

export function hasApiKey(): boolean {
  return cached.length > 0
}
