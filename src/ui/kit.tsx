import { useEffect, useState, type ReactNode } from 'react'

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
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pwin-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`pwin ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="pwin-title">
          {icon && <span className="pwin-icon">{icon}</span>}
          <span>{title}</span>
          {onClose && (
            <button className="pwin-close" onClick={onClose} aria-label="Close">
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
  const line = script.lines[idx] ?? ''
  const done = shown >= line.length

  useEffect(() => {
    setShown(0)
  }, [idx, script])

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setShown((n) => Math.min(line.length, n + 2)), 22)
    return () => clearTimeout(t)
  }, [shown, done, line.length])

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
    <div className="dialog" onClick={advance}>
      {script.bust && <img className="px dialog-bust" src={script.bust} alt="" width={96} height={96} />}
      <div className="dialog-body">
        <div className="dialog-name">{script.speaker}</div>
        <div className="dialog-text">{line.slice(0, shown)}</div>
        {done && <span className="dialog-next">{idx + 1 < script.lines.length ? '▼' : '■'}</span>}
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
