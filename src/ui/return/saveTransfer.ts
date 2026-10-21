/**
 * A protected save (spec 2026-10-12 S28). The save lives only in this browser's
 * localStorage, which Safari may wipe after seven days without a visit — so the Master
 * can carry a copy: a file download or a paste-able save code, and import either back.
 *
 * The import ALWAYS validates before it writes anything: the engine's `loadState`
 * (migrations included), then a structural check against a fresh account, then one TICK
 * run on the real clock (a save that loads but cannot run would otherwise blank the app
 * on every boot). The replaced save is kept under a backup key and can be brought back.
 */
import { createAccount, DEFAULT_SAVE_KEY, loadState, saveState } from '../../engine/account'
import { reduce } from '../../engine/store'
import { toWorldTime } from '../../engine/time'
import type { GameState } from '../../engine/types'
import { accountKey } from './arrival'

/** Save codes start with this, so a pasted code is recognisable. */
export const SAVE_CODE_PREFIX = 'PMU1:'
/** Where the save an import replaced is kept, just in case. */
export const BEFORE_IMPORT_KEY = `${DEFAULT_SAVE_KEY}.beforeImport`
/** Which account the last import brought in, and when (`{ account, at }` real epoch-ms);
 *  '' once undone. A second import tried soon after it keeps the original backup instead
 *  of the first import. */
export const IMPORTED_KEY = `${DEFAULT_SAVE_KEY}.imported`
/** Imports within this long of the last one are "in a row" (one search for the right code).
 *  Past it, the save on screen is the Master's own progress and is what gets kept aside. */
export const IMPORT_RUN_MS = 30 * 60_000

const DAMAGED = 'That save is damaged and cannot be played. Nothing was changed.'
const GREYED = 'That save has greyed and cannot be restored.'
/** OwnedHero fields the type marks optional (absent until first needed). */
const OPTIONAL_HERO_KEYS = new Set(['life', 'nickname', 'displayStar'])

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Does `value` have the shape of `template`? Every key of a fixed-shape object in the
 * template must be present with the same kind (number, string, boolean, list, object);
 * a null in the template only needs the key present (it holds an object later); an empty
 * object in the template is an id-keyed record (any keys). Returns the first bad path.
 */
function shapeProblem(value: unknown, template: unknown, path: string, skip?: Set<string>): string | null {
  if (template === null) return null
  if (Array.isArray(template)) return Array.isArray(value) ? null : path
  if (isPlain(template)) {
    if (!isPlain(value)) return path
    for (const [k, tv] of Object.entries(template)) {
      if (skip?.has(k)) continue
      if (!(k in value)) return `${path}.${k}`
      const bad = shapeProblem(value[k], tv, `${path}.${k}`)
      if (bad) return bad
    }
    return null
  }
  return typeof value === typeof template ? null : path
}

/** The first structural problem of a loaded save (null when it can run), checked against
 *  a fresh account so new fields are covered without a hand-kept list. */
export function stateProblem(state: GameState): string | null {
  const tpl = createAccount(0) as unknown as Record<string, unknown>
  const { heroes: tplHeroes, ...rest } = tpl
  const top = shapeProblem(state, rest, 'state')
  if (top) return top
  if (!isPlain(state.heroes)) return 'state.heroes'
  const starter = Object.values(tplHeroes as Record<string, unknown>)[0]
  for (const [id, h] of Object.entries(state.heroes)) {
    const bad = shapeProblem(h, starter, `state.heroes.${id}`, OPTIONAL_HERO_KEYS)
    if (bad) return bad
  }
  const t = state.tower
  if (!Number.isInteger(t.currentFloor) || t.currentFloor < 1 || !Number.isInteger(t.highestCleared) || t.highestCleared < 0) return 'state.tower.currentFloor'
  return null
}

/**
 * Load, migrate and RUN a save: the structural check, then one TICK on the real clock (the
 * first thing the lobby does with it). Throws on any failure; returns the state as loaded.
 */
function validateImport(json: string, nowReal: number): GameState {
  const state = loadState(json)
  const bad = stateProblem(state)
  if (bad) throw new ImportRefused(DAMAGED, bad)
  if (state.meta.deleted) throw new ImportRefused(GREYED)
  let ran: GameState
  try {
    ran = reduce(state, { type: 'TICK' }, toWorldTime(nowReal))
  } catch (e) {
    throw new ImportRefused(DAMAGED, e instanceof Error ? e.message : String(e))
  }
  if (ran.meta.deleted) throw new ImportRefused(GREYED)
  return state
}

class ImportRefused extends Error {
  constructor(
    readonly reason: string,
    detail?: string,
  ) {
    super(detail ? `${reason} (${detail})` : reason)
  }
}

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
export function parseImport(text: string, nowReal: number = Date.now()): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Paste a save code or choose a save file first.' }
  let json: string
  try {
    json = decodeSaveInput(text)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'That does not look like a save code.' }
  }
  try {
    const state = validateImport(json, nowReal)
    return { ok: true, state, json: saveState(state) }
  } catch (e) {
    return { ok: false, error: e instanceof ImportRefused ? e.reason : 'That save could not be read. Nothing was changed.' }
  }
}

/** Minimal storage surface (localStorage satisfies it). */
export interface SaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The account a stored save belongs to, or null when it cannot be read. */
function storedAccount(json: string | null): string | null {
  if (json === null) return null
  try {
    return accountKey(loadState(json))
  } catch {
    return null
  }
}

/** The last import (account and real time), or null when none is recorded or it was undone. */
function lastImport(storage: SaveStorage): { account: string; at: number } | null {
  try {
    const raw = storage.getItem(IMPORTED_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { account?: unknown; at?: unknown }
    return typeof v.account === 'string' && typeof v.at === 'number' && Number.isFinite(v.at) ? { account: v.account, at: v.at } : null
  } catch {
    return null
  }
}

/**
 * Write a validated import as the save, keeping the replaced one under BEFORE_IMPORT_KEY.
 * When the save on screen is the account the last import brought in, imported less than
 * IMPORT_RUN_MS ago (a second code tried in a row), the backup already holds the save from
 * before the imports and is kept: overwriting it would lose the Master's own progress for
 * good. Any later import keeps aside the save on screen, as days of play on an imported
 * save are the Master's own progress too.
 */
export function commitImport(storage: SaveStorage, json: string, nowReal: number = Date.now()): void {
  const incoming = validateImport(json, nowReal) // never write what the game cannot run
  const current = storage.getItem(DEFAULT_SAVE_KEY)
  const last = lastImport(storage)
  const inARow = last !== null && nowReal >= last.at && nowReal - last.at < IMPORT_RUN_MS
  const keepBackup = inARow && storage.getItem(BEFORE_IMPORT_KEY) !== null && storedAccount(current) === last.account
  if (current !== null && !keepBackup) storage.setItem(BEFORE_IMPORT_KEY, current)
  storage.setItem(DEFAULT_SAVE_KEY, json)
  storage.setItem(IMPORTED_KEY, JSON.stringify({ account: accountKey(incoming), at: nowReal }))
}

/** The save an import replaced, if one is kept and it can still be played. */
export function beforeImportSave(storage: SaveStorage, nowReal: number = Date.now()): { state: GameState; json: string } | null {
  const json = storage.getItem(BEFORE_IMPORT_KEY)
  if (json === null) return null
  try {
    return { state: validateImport(json, nowReal), json }
  } catch {
    return null
  }
}

/**
 * Bring back the save an import replaced. The two swap places, so the undo can itself be
 * undone, and the next import keeps aside the save then on screen. Throws (writing
 * nothing) when there is no playable backup.
 */
export function undoImport(storage: SaveStorage, nowReal: number = Date.now()): void {
  const backup = beforeImportSave(storage, nowReal)
  if (!backup) throw new Error('undoImport: no save from before the import')
  const current = storage.getItem(DEFAULT_SAVE_KEY)
  if (current !== null) storage.setItem(BEFORE_IMPORT_KEY, current)
  storage.setItem(DEFAULT_SAVE_KEY, backup.json)
  storage.setItem(IMPORTED_KEY, '')
}

/** A friendly file name: "pick-me-up-F12-2026-10-12.json". */
export function saveFileName(state: GameState, nowReal: number): string {
  const d = new Date(nowReal)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `pick-me-up-F${state.tower.highestCleared}-${ymd}.json`
}

/** Offer some text as a file download (browser only; false elsewhere). */
export function downloadText(text: string, fileName: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/** Offer the save as a file download (browser only; a no-op elsewhere). */
export function downloadSave(state: GameState, nowReal: number): boolean {
  return downloadText(exportSaveJson(state, nowReal), saveFileName(state, nowReal))
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
