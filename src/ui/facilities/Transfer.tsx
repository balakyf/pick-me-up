import { useState } from 'react'
import type { GameState, OwnedHero, HeroId, Command } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { SKILLS } from '../../engine/content'
import { fuseOptions, maxTransferGrade, transferCost, transferRefusal, transferredLevel } from '../../engine/transfer'
import { SkillList } from '../bits'
import { t } from '../i18n/i18n'
import { HeroPicker } from '../hero/HeroPicker'
import { busyRefusal } from '../hero/refusals'

const TRANSFER = TUNING.skills.transfer

/** The Transfer Station: move a skill between heroes, or fuse/evolve skills early. */
export function TransferAction({ state, store }: { state: GameState; store: Store }) {
  const [tab, setTab] = useState<'transfer' | 'fuse'>('transfer')
  const [donorId, setDonorId] = useState<HeroId | null>(null)
  const [recipientId, setRecipientId] = useState<HeroId | null>(null)
  const [fuserId, setFuserId] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const level = state.facilities.transferStation.level
  const ceiling = maxTransferGrade(level)
  const free = (Object.values(state.heroes) as OwnedHero[]).filter(
    (h) => h.alive && h.promotion === null && h.training === null,
  )
  const donor = donorId ? free.find((h) => h.id === donorId) ?? null : null
  const recipient = recipientId ? free.find((h) => h.id === recipientId) ?? null : null
  const fuser = fuserId ? free.find((h) => h.id === fuserId) ?? null : null

  function run(cmd: Command) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
    }
  }

  if (ceiling === null) {
    return <div className="lr-action-note">{t('Build the Transfer Station to move and fuse skills.')}</div>
  }

  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const chips = (label: string, selected: OwnedHero | null, pick: (id: HeroId | null) => void, exclude?: HeroId | null, other?: string) => (
    <HeroPicker
      state={state}
      heroes={living}
      label={label}
      selected={selected ? [selected.id] : []}
      refusal={(h) => (h.id === exclude && other ? other : busyRefusal(state, h))}
      onPick={(id) => pick(selected?.id === id ? null : id)}
    />
  )

  return (
    <div className="lr-action transfer-action">
      <div className="ta-row"><span>{t('Max transferable grade')}</span><span className="ta-val">{ceiling}</span></div>
      <div className="ta-row">
        <span>{t('A moved skill arrives at')}</span>
        <span className="ta-val">{level >= TRANSFER.keepLevelAt ? t('its full level') : t('one level lower')}</span>
      </div>
      <div className="syn-modes">
        <button className={`btn sm ${tab === 'transfer' ? 'primary' : ''}`} onClick={() => setTab('transfer')}>{t('⇄ Transfer')}</button>
        <button className={`btn sm ${tab === 'fuse' ? 'primary' : ''}`} onClick={() => setTab('fuse')}>{t('✦ Fuse & evolve')}</button>
      </div>

      {tab === 'transfer' ? (
        <>
          <div className="syn-label">{t('Donor (forgets the skill)')}</div>
          {chips(t('Donor (forgets the skill)'), donor, (id) => { setDonorId(id); setErr(null) }, recipientId, 'Already the recipient.')}
          <div className="syn-label">{t('Recipient')}</div>
          {chips(t('Recipient'), recipient, (id) => { setRecipientId(id); setErr(null) }, donorId, 'Already the donor.')}
          {donor && recipient && (
            <div className="drill-list">
              {donor.skills.map((sk) => {
                const def = SKILLS[sk.id]
                if (!def) return null
                const reason = transferRefusal(state, donor.id, recipient.id, sk.id)
                return (
                  <div key={sk.id} className={`drill-row ${reason ? 'off' : ''}`} title={reason ? t(reason) : undefined}>
                    <span className="skill-grade">{def.grade}</span>
                    <span className="drill-name">
                      {t('{name} Lv{level} → Lv{n}', { name: t(def.name), level: sk.level, n: transferredLevel(sk.level, level) })}
                    </span>
                    <span className="muted">{transferCost(sk.id).toLocaleString()} ◆</span>
                    <button
                      className="btn sm"
                      disabled={reason !== null}
                      onClick={() => run({ type: 'TRANSFER_SKILL', donorId: donor.id, recipientId: recipient.id, skillId: sk.id })}
                    >
                      {t('Move')}
                    </button>
                  </div>
                )
              })}
              {donor.skills.length === 0 && <div className="lr-empty">{t('The donor has no skills.')}</div>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="syn-label">{t('Hero')}</div>
          {chips(t('Hero'), fuser, (id) => { setFuserId(id); setErr(null) })}
          {fuser && (
            <div className="drill-list">
              <SkillList hero={fuser} />
              {fuseOptions(state, fuser.id).map((o) => {
                const def = SKILLS[o.result]!
                return (
                  <div key={o.result} className={`drill-row ${o.ok ? '' : 'off'}`} title={o.reason ? t(o.reason) : undefined}>
                    <span className="skill-grade">{def.grade}</span>
                    <span className="drill-name">
                      {o.kind === 'evolve' ? t('Evolve') : t('Fuse')} {o.inputs.map((i) => t(SKILLS[i]?.name ?? i)).join(' + ')} → {t(def.name)}
                    </span>
                    <span className="muted">{o.cost.toLocaleString()} ◆</span>
                    <button className="btn sm" disabled={!o.ok} onClick={() => run({ type: 'FUSE_SKILL', heroId: fuser.id, result: o.result })}>
                      {o.kind === 'evolve' ? t('Evolve') : t('Fuse')}
                    </button>
                  </div>
                )
              })}
              {fuseOptions(state, fuser.id).length === 0 && <div className="lr-empty">{t('No recipe uses this hero’s skills yet.')}</div>}
            </div>
          )}
        </>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
