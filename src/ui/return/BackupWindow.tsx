import { useEffect, useMemo, useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { PixelWindow } from '../kit'
import { t } from '../i18n/i18n'
import { DEFAULT_SAVE_KEY } from '../../engine/account'
import { BEFORE_IMPORT_KEY, commitImport, downloadSave, encodeSaveCode, exportSaveJson, parseImport, storageIsPersistent, type ImportResult } from './saveTransfer'
import './return.css'

/**
 * Back up or restore the save (spec 2026-10-12 S28). Export: a file, or a code to copy.
 * Import: a file or a pasted code, validated by the engine before anything is written,
 * then confirmed. The replaced save is kept under a backup key.
 */
export function BackupWindow({
  state,
  store,
  onClose,
  canRestore = true,
}: {
  state: GameState
  store: Store
  onClose: () => void
  /** False while a climb is on screen: a save is only swapped from the waiting room. */
  canRestore?: boolean
}) {
  // The code is a snapshot taken when the window opens (and after a restore). Re-encoding
  // it on every clock tick would cost a full save per second and, worse, reset the
  // selection of a Master copying it by hand.
  const [codeVersion, setCodeVersion] = useState(0)
  const code = useMemo(() => encodeSaveCode(exportSaveJson(store.getState() ?? state, Date.now())), [codeVersion])
  const [note, setNote] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [pending, setPending] = useState<Extract<ImportResult, { ok: true }> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(false)

  useEffect(() => {
    let live = true
    void storageIsPersistent().then((p) => live && setPersisted(p))
    return () => {
      live = false
    }
  }, [])

  function download() {
    setNote(downloadSave(state, Date.now()) ? t('Save file downloaded.') : t('Downloads are not available here — copy the code instead.'))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setNote(t('Save code copied.'))
    } catch {
      setNote(t('Select the code and copy it by hand.'))
    }
  }

  function check(text: string) {
    setErr(null)
    setNote(null)
    const r = parseImport(text)
    if (r.ok) setPending(r)
    else {
      setPending(null)
      setErr(t(r.error))
    }
  }

  function onFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    // Clear the picker so choosing the same file again still fires a change.
    input.value = ''
    if (!file) return
    void file.text().then((text) => {
      // The file is checked as a whole; the paste box stays for codes (a truncated copy of
      // a file there would fail the next check).
      setPaste('')
      check(text)
    })
  }

  function restore() {
    if (!pending || !canRestore) return
    const ls = window.localStorage
    const previous = ls.getItem(DEFAULT_SAVE_KEY)
    try {
      commitImport(ls, pending.json)
    } catch {
      setErr(t('That save could not be read. Nothing was changed.'))
      return
    }
    try {
      store.load()
    } catch {
      // Put the old save back exactly as it was: the promise is that nothing changed.
      if (previous !== null) ls.setItem(DEFAULT_SAVE_KEY, previous)
      else ls.removeItem(DEFAULT_SAVE_KEY)
      ls.removeItem(BEFORE_IMPORT_KEY)
      setErr(t('That save could not be read. Nothing was changed.'))
      return
    }
    setPending(null)
    setPaste('')
    setCodeVersion((v) => v + 1)
    setNote(t('Save restored. Welcome back, Master.'))
  }

  const p = pending?.state
  return (
    <PixelWindow title={t('Back up your save')} icon="💾" onClose={onClose}>
      <div className="backup">
        <p className="muted">
          {t('Your save lives only in this browser, and some browsers clear it after a week away. Keep a copy somewhere safe — you can bring it back here, or to another device.')}
        </p>
        {persisted && <p className="backup-ok">✓ {t('This browser has promised to keep your save.')}</p>}

        <h4 className="panel-sub">{t('Make a copy')}</h4>
        <div className="backup-row">
          <button className="pbtn" onClick={download}>
            ⬇ {t('Download save file')}
          </button>
          <button className="pbtn" onClick={() => void copy()}>
            ⧉ {t('Copy save code')}
          </button>
        </div>
        <textarea className="backup-code" readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} aria-label={t('Save code')} />

        <h4 className="panel-sub">{t('Restore a copy')}</h4>
        <textarea
          className="backup-code"
          rows={3}
          value={paste}
          placeholder={t('Paste a save code here…')}
          onChange={(e) => {
            setPaste(e.target.value)
            setPending(null)
            setErr(null)
          }}
          aria-label={t('Paste a save code here…')}
        />
        <div className="backup-row">
          <button className="pbtn" onClick={() => check(paste)} disabled={paste.trim() === ''}>
            ✓ {t('Check this save')}
          </button>
          <label className="pbtn backup-file">
            📂 {t('Open a save file')}
            <input type="file" accept=".json,.txt,application/json,text/plain" onChange={(e) => onFile(e.currentTarget)} />
          </label>
        </div>
        {p && (
          <div className="backup-confirm">
            <div>
              {t('Found: Master Lv {ml} · floor {f} cleared · {n} heroes.', {
                ml: p.meta.masterLevel,
                f: p.tower.highestCleared,
                n: Object.values(p.heroes).filter((h) => h.alive).length,
              })}
            </div>
            <div className="muted">{t('This replaces the save in this browser (the current one is kept aside, just in case).')}</div>
            {!canRestore && <div className="muted">{t('Finish the climb first: a save is restored from the waiting room.')}</div>}
            <div className="backup-row">
              <button className="pbtn" onClick={() => setPending(null)}>
                {t('Cancel')}
              </button>
              <button className="pbtn danger" onClick={restore} disabled={!canRestore}>
                {t('Replace my save')}
              </button>
            </div>
          </div>
        )}
        {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
        {note && <div className="lr-action-note">{note}</div>}
      </div>
    </PixelWindow>
  )
}
