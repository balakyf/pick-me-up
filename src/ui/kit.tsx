import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { t } from './i18n/i18n'
import { useRegisterWindow } from './qol/windowRegistry'
import { isTopmost, restoreFocus, trapTab } from './focusTrap'
import { charsPerTick } from './qol/settings'
import { useSettings } from './qol/useSettings'

/**
 * The pixel UI kit: RPG windows, the dialog box and small HUD pieces. Styling
 * lives in ui.css (`.pwin`, `.dialog`, …); these components only add behaviour.
 */

export function PixelWindow({
  title,
  icon,
  onClose,
  children,
  wide,
}: {
  title: string
  icon?: ReactNode
  onClose?: () => void
  children: ReactNode
  wide?: boolean
}) {
  const backdrop = useRef<HTMLDivElement>(null)
  const win = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useRegisterWindow()
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only the topmost window closes: a window opened inside another keeps its parent.
      if (backdrop.current && !isTopmost(backdrop.current)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A modal: the window takes focus when it opens, Tab stays inside it, and focus goes
  // back to whatever opened it when it closes.
  useEffect(() => {
    const prev = document.activeElement
    const el = win.current
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !backdrop.current || !win.current || !isTopmost(backdrop.current)) return
      trapTab(e, win.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      restoreFocus(prev)
    }
  }, [])

  return (
    <div ref={backdrop} className="pwin-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={win} className={`pwin ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="pwin-title">
          {icon && <span className="pwin-icon" aria-hidden="true">{icon}</span>}
          <span id={titleId}>{title}</span>
          {onClose && (
            <button className="pwin-close" onClick={onClose} aria-label={t('Close')}>
              ✕
            </button>
          )}
        </div>
        <div className="pwin-body">{children}</div>
      </div>
    </div>
  )
}

export interface DialogScript {
  speaker: string
  bust?: string
  lines: string[]
  /** Buttons offered on the last line (e.g. "Profile"). Choosing one closes the dialog. */
  actions?: { label: string; onClick: () => void }[]
}

/**
 * Bottom-of-screen dialog with a typewriter effect. Space / Enter / E / click:
 * finish the current line, then advance; closes after the last line.
 */
export function DialogBox({ script, onDone }: { script: DialogScript; onDone: () => void }) {
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(0)
  useRegisterWindow()
  // The typewriter's pace is the Master's (Settings: slow, normal, fast or instant).
  const [{ textSpeed }] = useSettings()
  const step = charsPerTick(textSpeed)
  const line = script.lines[idx] ?? ''
  const done = shown >= line.length

  useEffect(() => {
    setShown(0)
  }, [idx, script])

  useEffect(() => {
    if (done) return
    if (!Number.isFinite(step)) {
      setShown(line.length)
      return
    }
    const t = setTimeout(() => setShown((n) => Math.min(line.length, n + step)), 22)
    return () => clearTimeout(t)
  }, [shown, done, line.length, step])

  function advance() {
    if (!done) {
      setShown(line.length)
      return
    }
    if (idx + 1 < script.lines.length) setIdx(idx + 1)
    else onDone()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="dialog" onClick={advance} role="group" aria-label={script.speaker}>
      {script.bust && <img className="px dialog-bust" src={script.bust} alt="" width={96} height={96} />}
      <div className="dialog-body">
        <div className="dialog-name">{script.speaker}</div>
        {/* Screen readers hear each whole line once; the typewriter is for the eyes. */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {line}
        </div>
        <div className="dialog-text" aria-hidden="true">
          {line.slice(0, shown)}
        </div>
        {done && (
          <span className="dialog-next" aria-hidden="true">
            {idx + 1 < script.lines.length ? '▼' : '■'}
          </span>
        )}
        {done && idx + 1 >= script.lines.length && script.actions && script.actions.length > 0 && (
          <div className="dialog-actions">
            {script.actions.map((a) => (
              <button
                key={a.label}
                className="pbtn sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDone()
                  a.onClick()
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function Gauge({ pct, color, label }: { pct: number; color: string; label?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="gauge" title={label}>
      <span style={{ width: `${w}%`, background: color }} />
    </div>
  )
}
