/**
 * The Enemy Codex: every enemy of the tower in a grid — dark silhouettes until met, then
 * name, kind, the floors it was met on and how often it fell; once studied (felled often
 * enough, or met on a scouted floor) its element, weaknesses and traits too.
 */
import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import type { EnemyTemplate, GameState } from '../../engine/types'
import { ACTS } from '../../engine/content'
import { DEPTH } from '../../engine/depth'
import { actOfTemplate, codexTemplates, intelOf } from '../../engine/codex'
import { PixelWindow } from '../kit'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { codexSpriteUrl } from './codexArt'
import { familyLabel, keywordText } from './codexText'
import './combatDepth.css'

/** "Act I — The Prairie" → "Act I" (in the current language). */
function actShort(title: string): string {
  return t(title).split(' — ')[0]!
}

function floorsText(floors: number[]): string {
  if (floors.length === 0) return '—'
  return floors.map((f) => `F${f}`).join(', ')
}

function Detail({ state, tpl }: { state: GameState; tpl: EnemyTemplate }) {
  const entry = state.codex.entries[tpl.id]
  if (!entry || entry.seen === 0) {
    return (
      <div className="codex-detail">
        <b>???</b>
        <div className="muted">{t('Not yet met. Climb on.')}</div>
      </div>
    )
  }
  const intel = intelOf(tpl)
  const left = Math.max(0, DEPTH.codex.studyAfterDefeats - entry.defeated)
  return (
    <div className="codex-detail">
      <div className="codex-detail-head">
        <b>{t(tpl.name)}</b>
        <span className="chip">{familyLabel(tpl.family)}</span>
        {entry.studied && <span className="chip codex-studied">📖 {t('studied')}</span>}
      </div>
      <div className="muted small">
        {t('Met in {n} battles · felled {k}', { n: entry.seen, k: entry.defeated })} · {t('floors: {list}', { list: floorsText(entry.floors) })}
      </div>
      {entry.studied ? (
        <div className="codex-intel">
          <div>
            {t('Element')}: <span style={{ color: ELEMENT_VIS[intel.element].color }}>{ELEMENT_VIS[intel.element].glyph} {t(ELEMENT_VIS[intel.element].label)}</span>
          </div>
          <div>
            {t('Weak to')}:{' '}
            {intel.weakTo.length > 0
              ? intel.weakTo.map((el) => (
                  <span key={el} className="codex-weak" style={{ color: ELEMENT_VIS[el].color }}>
                    {ELEMENT_VIS[el].glyph} {t(ELEMENT_VIS[el].label)}
                  </span>
                ))
              : t('nothing in particular')}
          </div>
          {intel.immune.length > 0 && <div>{intel.immune.map(keywordText).join(' · ')}</div>}
          {intel.resists.length > 0 && <div>{intel.resists.map(keywordText).join(' · ')}</div>}
          {intel.traits.length > 0 && <div className="codex-traits">{intel.traits.map(keywordText).join(' · ')}</div>}
        </div>
      ) : (
        <div className="muted small">
          {t('Weaknesses unknown — fell it {n} more times, or have its floor scouted.', { n: left })}
        </div>
      )}
    </div>
  )
}

export function CodexWindow({ state, onClose }: { state: GameState; onClose: () => void }) {
  const all = useMemo(() => codexTemplates(), [])
  const actOf = useMemo(() => new Map(all.map((tpl) => [tpl.id, actOfTemplate(tpl.id)])), [all])
  const [act, setAct] = useState<string>('all')
  const [sel, setSel] = useState<string | null>(null)
  const shown = act === 'all' ? all : all.filter((tpl) => actOf.get(tpl.id) === act)
  const seen = all.filter((tpl) => (state.codex.entries[tpl.id]?.seen ?? 0) > 0).length
  const studied = all.filter((tpl) => state.codex.entries[tpl.id]?.studied).length
  const selected = all.find((tpl) => tpl.id === sel) ?? null

  return (
    <PixelWindow title={t('Enemy Codex')} icon="📖" onClose={onClose} wide>
      <div className="codex">
        <div className="codex-top">
          <span className="muted">
            {t('Met {n} of {m} · studied {k}', { n: seen, m: all.length, k: studied })}
          </span>
          <div className="codex-filter">
            <button className={`pbtn sm ghost ${act === 'all' ? 'on' : ''}`} onClick={() => setAct('all')}>
              {t('All')}
            </button>
            {ACTS.map((a) => (
              <button key={a.id} className={`pbtn sm ghost ${act === a.id ? 'on' : ''}`} onClick={() => setAct(a.id)} title={t(a.title)}>
                {actShort(a.title)}
              </button>
            ))}
          </div>
        </div>
        {selected && <Detail state={state} tpl={selected} />}
        <div className="codex-grid">
          {shown.map((tpl) => {
            const e = state.codex.entries[tpl.id]
            const met = (e?.seen ?? 0) > 0
            return (
              <button
                key={tpl.id}
                className={`codex-cell ${met ? 'met' : 'unmet'} ${e?.studied ? 'studied' : ''} ${sel === tpl.id ? 'sel' : ''}`}
                onClick={() => setSel(sel === tpl.id ? null : tpl.id)}
                title={met ? t(tpl.name) : '???'}
              >
                <span className="codex-art">
                  <img className="px" src={codexSpriteUrl(tpl.id, tpl.element, met)} alt={met ? t(tpl.name) : '???'} />
                </span>
                <span className="codex-name">{met ? t(tpl.name) : '???'}</span>
                {met && (
                  <span className="codex-sub">
                    {e!.studied && '📖 '}
                    {familyLabel(tpl.family)} · ✝{e!.defeated}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </PixelWindow>
  )
}

/** A button that opens the Codex (the Tower screen and the Library both carry one). */
export function CodexButton({ state, label }: { state: GameState; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="pbtn sm codex-btn" onClick={() => setOpen(true)} title={t('What the Master knows of the tower’s enemies')}>
        📖 {label ?? t('Enemy Codex')}
      </button>
      {/* Portalled: the button sits inside inline text (a <p>) on the Tower screen. */}
      {open && createPortal(<CodexWindow state={state} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
