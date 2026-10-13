/**
 * A protected save (spec 2026-10-12 S28). The save lives only in this browser's
 * localStorage, which Safari may wipe after seven days without a visit — so the Master
 * can carry a copy: a file download or a paste-able save code, and import either back.
 *
 * The import ALWAYS validates through the engine's `loadState` (migrations included)
 * before it writes anything, and keeps the replaced save under a backup key.
 */
import { DEFAULT_SAVE_KEY, loadState, saveState } from '../../engine/account'
import type { GameState } from '../../engine/types'

/** Save codes start with this, so a pasted code is recognisable. */
export const SAVE_CODE_PREFIX = 'PMU1:'
/** Where the save an import replaced is kept, just in case. */
export const BEFORE_IMPORT_KEY = `${DEFAULT_SAVE_KEY}.beforeImport`

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** The save as JSON (the same envelope the game writes to localStorage). */
export function exportSaveJson(state: GameState, nowReal = 0): string {
  return saveState(state, nowReal)
}

/** A compact, copy-paste-able save code. */
export function encodeSaveCode(json: string): string {
  return SAVE_CODE_PREFIX + toBase64(json)
}

/** Turn whatever the Master pasted (a code, or a file's JSON) back into JSON text. */
export function decodeSaveInput(text: string): string {
  const s = text.trim()
  if (s.startsWith('{')) return s
  const body = s.startsWith(SAVE_CODE_PREFIX) ? s.slice(SAVE_CODE_PREFIX.length) : s
  try {
    return fromBase64(body.replace(/\s+/g, ''))
  } catch {
    throw new Error('That does not look like a save code.')
  }
}

export type ImportResult = { ok: true; state: GameState; json: string } | { ok: false; error: string }

/** Validate an import without touching storage. `json` is normalised to the current
 *  schema (the migrated save, re-serialised). */
export function parseImport(text: string): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Paste a save code or choose a save file first.' }
  let json: string
  try {
    json = decodeSaveInput(text)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'That does not look like a save code.' }
  }
  try {
    const state = loadState(json)
    return { ok: true, state, json: saveState(state) }
  } catch {
    return { ok: false, error: 'That save could not be read. Nothing was changed.' }
  }
}

/** Minimal storage surface (localStorage satisfies it). */
export interface SaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Write a validated import as the save, keeping the replaced one under BEFORE_IMPORT_KEY. */
export function commitImport(storage: SaveStorage, json: string): void {
  loadState(json) // never write what the engine cannot read
  const current = storage.getItem(DEFAULT_SAVE_KEY)
  if (current !== null) storage.setItem(BEFORE_IMPORT_KEY, current)
  storage.setItem(DEFAULT_SAVE_KEY, json)
}

/** A friendly file name: "pick-me-up-F12-2026-10-12.json". */
export function saveFileName(state: GameState, nowReal: number): string {
  const d = new Date(nowReal)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `pick-me-up-F${state.tower.highestCleared}-${ymd}.json`
}

/** Offer the save as a file download (browser only; a no-op elsewhere). */
export function downloadSave(state: GameState, nowReal: number): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false
  const blob = new Blob([exportSaveJson(state, nowReal)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = saveFileName(state, nowReal)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/**
 * Ask the browser to keep this site's storage (best effort; Chromium grants it quietly to
 * engaged sites, Firefox may ask). Guarded for jsdom and old browsers. Resolves to whether
 * storage is persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!sm || typeof sm.persist !== 'function') return false
    if (typeof sm.persisted === 'function' && (await sm.persisted())) return true
    return await sm.persist()
  } catch {
    return false
  }
}

/** Is storage already persistent? (false when unknown) */
export async function storageIsPersistent(): Promise<boolean> {
  try {
    const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!sm || typeof sm.persisted !== 'function') return false
    return await sm.persisted()
  } catch {
    return false
  }
}
