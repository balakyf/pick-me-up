import { useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { DEFAULT_SAVE_KEY, SaveLoadError, encodeSaveCode, exportSave, importSave, saveState } from '../../engine/account'
import { PixelWindow } from '../kit'
import { t } from '../i18n/i18n'
import { daysSinceExport, lastExportAt, markExported, saveFileName } from './saveBackup'
import './qol.css'

/**
 * Export / import the save. Saves otherwise live only in this browser's localStorage,
 * so this is the Master's backup and the way to move a world to another device.
 * Import validates (and migrates) through the engine's loadState before anything is
 * touched, and asks in-page before overwriting — confirm() is blocked in embedded viewers.
 */

/** "Last exported: never / today / N days ago". */
export function lastExportText(now: number): string {
  const d = daysSinceExport(lastExportAt(), now)
  if (d === null) return t('Last exported: never')
  if (d === 0) return t('Last exported: today')
  if (d === 1) return t('Last exported: yesterday')
  return t('Last exported: {n} days ago', { n: d })
}

/** A SaveLoadError's engine message → words for the Master. */
export function importErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (!(e instanceof SaveLoadError)) return t('That save couldn’t be read.')
  if (msg.includes('nothing to import')) return t('Paste a save code or choose a file first.')
  if (msg.includes('not a save file')) return t('That isn’t a Pick Me Up! save file or save code.')
  if (msg.includes('not valid JSON')) return t('The file is damaged — it isn’t valid JSON.')
  if (msg.includes('newer than engine')) return t('That save comes from a newer version of the game.')
  return t('That save couldn’t be read: {detail}', { detail: msg.replace(/^\w+: /, '') })
}

function summary(s: GameState): string {
  const living = Object.values(s.heroes).filter((h) => h.alive).length
  return t('Master Lv {ml} · floor {floor} cleared · {n} living heroes', { ml: s.meta.masterLevel, floor: s.tower.highestCleared, n: living })
}

export function SaveTransfer({ state, store, onClose, onImported }: { state: GameState; store: Store; onClose: () => void; onImported?: () => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<{ state: GameState; from: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [, bump] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  function download() {
    const now = Date.now()
    const json = exportSave(state, now)
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = saveFileName(state.accountId, now)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      markExported(now)
      bump((n) => n + 1)
    } catch {
      // No Blob URLs here (some embedded viewers): fall back to the copyable code.
      setCode(encodeSaveCode(json))
    }
  }

  async function copy() {
    const now = Date.now()
    const c = encodeSaveCode(exportSave(state, now))
    setCode(c)
    try {
      await navigator.clipboard.writeText(c)
      setCopied('ok')
      markExported(now)
      bump((n) => n + 1)
    } catch {
      setCopied('fail')
    }
  }

  function check(text: string, from: string) {
    setErr(null)
    setDone(null)
    setCandidate(null)
    try {
      setCandidate({ state: importSave(text), from })
    } catch (e) {
      setErr(importErrorText(e))
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    try {
      check(await f.text(), f.name)
    } catch {
      setErr(t('That file couldn’t be opened.'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function replace() {
    if (!candidate) return
    try {
      window.localStorage.setItem(DEFAULT_SAVE_KEY, saveState(candidate.state, Date.now()))
      store.load()
      setCandidate(null)
      setPaste('')
      setDone(t('Save imported. Welcome back, Master.'))
      onImported?.()
    } catch (e) {
      setErr(e instanceof SaveLoadError ? importErrorText(e) : t('The browser refused to store the save.'))
    }
  }

  return (
    <PixelWindow title={t('Export / import save')} icon="💾" onClose={onClose}>
      <div className="qol-save">
        <p className="place-blurb">{t('Your save lives only in this browser. Export it to keep a backup or to carry your world to another device.')}</p>

        <div className="panel-sub">{t('Export')}</div>
        <div className="qol-row">
          <button className="pbtn primary" onClick={download}>
            ⬇ {t('Download save (.json)')}
          </button>
          <button className="pbtn" onClick={copy}>
            ⧉ {t('Copy save code')}
          </button>
          <span className="muted qol-last">{lastExportText(Date.now())}</span>
        </div>
        {copied === 'ok' && <div className="qol-ok">✓ {t('Save code copied to the clipboard.')}</div>}
        {copied === 'fail' && <div className="qol-warn">{t('The clipboard is blocked here — select the code below and copy it by hand.')}</div>}
        {code !== null && (
          <textarea className="pinput qol-code" readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label={t('Save code')} rows={3} />
        )}

        <div className="panel-sub">{t('Import')}</div>
        <div className="qol-row">
          <button className="pbtn" onClick={() => fileRef.current?.click()}>
            📂 {t('Choose a save file…')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            style={{ display: 'none' }}
            data-testid="save-file"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        <textarea
          className="pinput qol-code"
          rows={3}
          placeholder={t('…or paste a save code (or the file’s JSON) here')}
          aria-label={t('Paste a save code')}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="qol-row">
          <button className="pbtn" onClick={() => check(paste, t('pasted code'))} disabled={paste.trim() === ''}>
            {t('Check save')}
          </button>
        </div>

        {err && (
          <div className="qol-err" role="alert">
            ✖ {err}
          </div>
        )}
        {done && <div className="qol-ok">✓ {done}</div>}

        {candidate && (
          <div className="qol-confirm pframe">
            <div>
              <b>{t('Found a valid save')}</b> <span className="muted">({candidate.from})</span>
            </div>
            <div className="qol-compare">
              <span className="muted">{t('Incoming:')}</span> <span>{summary(candidate.state)}</span>
              <span className="muted">{t('Current:')}</span> <span>{summary(state)}</span>
            </div>
            <div className="qol-warn">{t('Replacing overwrites the current save in this browser. It cannot be undone — export first if you are unsure.')}</div>
            <div className="qol-row">
              <button className="pbtn ghost" onClick={() => setCandidate(null)}>
                {t('Cancel')}
              </button>
              <button className="pbtn danger" onClick={replace}>
                {t('Replace my save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </PixelWindow>
  )
}
