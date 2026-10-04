import { useState } from 'react'
import type { GameState, OwnedHero, HeroId, RescueChoice } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { canSynthesize, rescueOptions, synthesisPreview, synthesisUnlocked, type SynthesisInput } from '../../engine/synthesis'
import { SKILLS } from '../../engine/content'
import { t } from '../i18n/i18n'
import { matLabel } from './shared'
import { HeroPicker } from '../hero/HeroPicker'
import { busyRefusal, sacrificeRefusal } from '../hero/refusals'
import { attrLabel, gradeDeltaLine, rescueLabel } from './facilityText'
import { tn } from '../text'

const SYN = TUNING.lobby.synthesis

/** The Synthesis Chamber — closed-door, ML-gated. Transfer or Salvage heroes. */
export function SynthesisChamber({ state, store }: { state: GameState; store: Store }) {
  const [mode, setMode] = useState<'transfer' | 'salvage'>('salvage')
  const [survivorId, setSurvivorId] = useState<HeroId | null>(null)
  const [sacrificeIds, setSacrificeIds] = useState<HeroId[]>([])
  const [confirming, setConfirming] = useState(false)
  const [rescue, setRescue] = useState<RescueChoice | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const unlocked = synthesisUnlocked(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)

  if (!unlocked) {
    return (
      <div className="lobby-portal synth-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🧪</span>
          <span className="lp-name">{t('Synthesis Chamber')}</span>
          <span className="muted">{t('— the door stays shut')}</span>
        </div>
        <div className="lr-blurb">{t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: SYN.unlockMasterLevel })}</div>
      </div>
    )
  }

  const reset = () => { setSacrificeIds([]); setSurvivorId(null); setConfirming(false); setRescue(null); setErr(null) }
  const toggleSac = (id: HeroId) => {
    setConfirming(false)
    setRescue(null)
    setSacrificeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const chooseSurvivor = (id: HeroId) => {
    setConfirming(false)
    setRescue(null)
    setSurvivorId((cur) => (cur === id ? null : id))
    setSacrificeIds((cur) => cur.filter((x) => x !== id)) // a survivor can't also be a sacrifice
  }

  const chosen = mode === 'salvage' && survivorId !== null && rescue !== null ? rescue : undefined
  const input: SynthesisInput = { mode, survivorId, sacrificeIds, ...(chosen ? { rescue: chosen } : {}) }
  const valid = canSynthesize(state, input)
  const preview = valid ? synthesisPreview(state, input) : null
  const rescueChoices = mode === 'salvage' && survivorId !== null ? rescueOptions(state, survivorId, sacrificeIds) : []
  const rescueKey = (r: RescueChoice) => (r.kind === 'skill' ? `s:${r.skillId}` : `g:${r.attr}`)

  function run() {
    setErr(null)
    try {
      store.dispatch({ type: 'SYNTHESIZE', mode, survivorId, sacrificeIds, ...(chosen ? { rescue: chosen } : {}) }, Date.now())
      reset()
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Synthesis failed'))
    }
  }

  return (
    <div className="lobby-portal synth-portal">
      <div className="lp-head">
        <span className="lp-glyph">🧪</span>
        <span className="lp-name">{t('Synthesis Chamber')}</span>
        <span className="muted">{t('— the Master can’t watch')}</span>
      </div>

      <div className="syn-modes">
        <button className={`btn sm ${mode === 'salvage' ? 'primary' : ''}`} onClick={() => { setMode('salvage'); setConfirming(false) }}>
          {t('♻ Salvage')}
        </button>
        <button className={`btn sm ${mode === 'transfer' ? 'primary' : ''}`} onClick={() => { setMode('transfer'); setConfirming(false) }}>
          {t('⇄ Transfer')}
        </button>
      </div>

      <div className="syn-section">
        <div className="syn-label">
          {mode === 'transfer' ? t('Survivor (required)') : t('Rescue onto (optional)')}
        </div>
        <HeroPicker
          state={state}
          heroes={living}
          label={mode === 'transfer' ? t('Survivor (required)') : t('Rescue onto (optional)')}
          selected={survivorId ? [survivorId] : []}
          refusal={(h) => busyRefusal(state, h)}
          onPick={chooseSurvivor}
        />
      </div>

      <div className="syn-section">
        <div className="syn-label">{t('Sacrifices (permanently destroyed)')}</div>
        <HeroPicker
          state={state}
          heroes={living}
          label={t('Sacrifices (permanently destroyed)')}
          selected={sacrificeIds}
          refusal={(h) => sacrificeRefusal(state, h, survivorId)}
          onPick={toggleSac}
          sort="cp"
          flip
        />
      </div>

      {rescueChoices.length > 0 && (
        <div className="syn-section">
          <div className="syn-label">{t('Rescue (optional — else the first missing skill, then the best grade)')}</div>
          <div className="syn-row">
            {rescueChoices.map((r) => {
              const key = rescueKey(r)
              const on = rescue !== null && rescueKey(rescue) === key
              return (
                <button key={key} type="button" className={`btn sm ${on ? 'primary' : ''}`} onClick={() => setRescue(on ? null : r)}>
                  {r.kind === 'skill' ? `✦ ${t(SKILLS[r.skillId]?.name ?? r.skillId)}` : `▲ ${t('{attr} grade', { attr: attrLabel(r.attr) })}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {preview && (
        <div className="syn-preview">
          {mode === 'transfer' ? (
            <span>
              {Object.keys(preview.gradeDeltas).length > 0
                ? t('Grades') + ' ' + gradeDeltaLine(preview.gradeDeltas)
                : t('No grade gain')}
              {' · '}
              {preview.skillCopyOdds.length > 0
                ? t('copy odds') + ' ' +
                  preview.skillCopyOdds.map((o) => `${t(SKILLS[o.skillId]?.name ?? o.skillId)} ${Math.round(o.chance * 100)}%`).join(', ')
                : t('no skill to copy')}
            </span>
          ) : (
            <span>
              {t('Yields')} {Object.entries(preview.materialYield).map(([k, v]) => `${v} × ${matLabel(k)}`).join(', ') || '—'}
              {preview.rescue ? ` · ${t('rescue')} ${rescueLabel(preview.rescue)}` : ''}
            </span>
          )}
          <span className="muted">
            {' · '}
            {t('−{a} survivor / −{b} witness Sanity', { a: preview.survivorSanityCost, b: preview.witnessSanityCost })}
          </span>
        </div>
      )}

      <div className="syn-actions">
        {!confirming ? (
          <button className="btn sm" disabled={!valid} onClick={() => setConfirming(true)}>
            {mode === 'transfer' ? t('⇄ Synthesize') : t('♻ Render')}
          </button>
        ) : (
          <>
            <button className="btn sm syn-destroy" onClick={run}>
              {tn(sacrificeIds.length, 'Permanently destroy 1 hero', 'Permanently destroy {n} heroes')}
            </button>
            <button className="btn sm" onClick={() => setConfirming(false)}>{t('Cancel')}</button>
          </>
        )}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
