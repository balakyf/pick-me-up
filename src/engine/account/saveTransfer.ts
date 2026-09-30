/**
 * Save transfer (quality of life): the save as something the Master can carry out of
 * the browser and bring back — a downloadable JSON file, or a compact "save code"
 * (base64 of the same JSON) for the clipboard.
 *
 * PURE. exportSave is the ordinary SaveEnvelope (saveState); importSave accepts either
 * form, then validates and migrates through loadState, so an export from an older
 * build loads exactly like an old localStorage save would. Every failure is a
 * SaveLoadError with a message the UI can show.
 */

import type { GameState } from '../types'
import { SaveLoadError, loadState, saveState } from './account'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The save as the JSON a file download carries (the versioned SaveEnvelope). */
export function exportSave(state: GameState, now?: number): string {
  return saveState(state, now)
}

/** UTF-8 → base64 (hero names can carry accents, so btoa alone would throw). */
export function encodeSaveCode(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}

/** base64 → UTF-8. Accepts the URL-safe alphabet and ignores whitespace / padding. */
export function decodeSaveCode(code: string): string {
  const clean = code.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (clean.length === 0 || !/^[A-Za-z0-9+/]+$/.test(clean) || clean.length % 4 === 1) {
    throw new SaveLoadError('importSave: this is not a save file or save code')
  }
  const bytes: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of clean) {
    buf = ((buf << 6) | B64.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buf >> bits) & 255)
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    throw new SaveLoadError('importSave: this is not a save file or save code')
  }
}

/**
 * Read an exported save — the JSON file's text or a pasted save code — back into a
 * GameState (migrated to the current schema). Throws SaveLoadError on anything else.
 */
export function importSave(text: string): GameState {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new SaveLoadError('importSave: nothing to import')
  const json = trimmed.startsWith('{') ? trimmed : decodeSaveCode(trimmed)
  if (!json.trimStart().startsWith('{')) {
    throw new SaveLoadError('importSave: this is not a save file or save code')
  }
  return loadState(json)
}
