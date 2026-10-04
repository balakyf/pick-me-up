import { useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { toWorldTime } from '../../engine/time'
import { masterXpToNext } from '../../engine/master'
import { canUpgrade } from '../../engine/facilities'
import { PixelWindow } from '../kit'
import { timeLeft } from '../facilities/shared'
import { t } from '../i18n/i18n'
import { withToasts } from '../qol/toastStore'
import { allSites, type Site, type SiteStatus } from './sites'
import { PlaceIcon } from '../late/PlaceIcon'
import type { PlaceId } from './lobbyMap'
import { BoardTabs, DecorateTab } from '../life/EstatePanels'

/**
 * The Construction Board: every building on the campus in one list — what can be built
 * this minute, what is under way, what waits on a Master Level, and what stands and can
 * grow. Each row builds in place or walks the Master to the site.
 */
export function ConstructionBoard({
  state,
  store,
  onClose,
  onGo,
}: {
  state: GameState
  store: Store
  onClose: () => void
  onGo: (place: PlaceId) => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'build' | 'decor'>('build')
  const sites = allSites(state)
  const nowWorld = toWorldTime(Date.now())
  const ml = state.meta.masterLevel
  const group = (ss: SiteStatus[]) => sites.filter((s) => ss.includes(s.status))

  function build(s: Site) {
    setErr(null)
    try {
      withToasts(store).dispatch({ type: 'UPGRADE_FACILITY', facility: s.facility }, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Action failed'))
    }
  }

  function status(s: Site): string {
    switch (s.status) {
      case 'building':
        return t('⏳ Lv {toLevel} · {n}', { toLevel: s.toLevel ?? s.level + 1, n: timeLeft((s.completesAtWorld ?? nowWorld) - nowWorld) })
      case 'ready':
        return s.level === 0 ? t('Ready to build') : t('Lv {n} → Lv {m}', { n: s.level, m: s.level + 1 })
      case 'short':
        return t('Needs {n} more gold', { n: ((s.cost ?? 0) - state.gold).toLocaleString() })
      case 'locked':
        if (s.unlockAt !== null && ml < s.unlockAt) return t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: s.unlockAt })
        if (s.piNeeded !== null && state.meta.pi < s.piNeeded) return t('Needs Interference {n}', { n: s.piNeeded })
        return t('Raise Master Level to upgrade.')
      case 'built':
        if (s.cost === null) return t('Max level reached.')
        if (s.level >= ml) return t('Lv {n} · raise Master Level to upgrade', { n: s.level })
        return t('Lv {n} · upgrade for {cost} gold', { n: s.level, cost: s.cost.toLocaleString() })
    }
  }

  const row = (s: Site) => (
    <li key={s.facility} className={`cb-row cb-${s.status}`}>
      <span className="cb-icon">
        <PlaceIcon place={s.place} size={20} />
      </span>
      <span className="cb-name">
        <b>{t(s.label)}</b>
        <span className="cb-status">{status(s)}</span>
      </span>
      {s.cost !== null && s.status !== 'building' && (
        <button className="btn sm" disabled={!canUpgrade(state, s.facility)} onClick={() => build(s)}>
          {s.level === 0 ? t('🔨 Build') : t('⬆ Upgrade')} · {s.cost.toLocaleString()} ◆
        </button>
      )}
      <button className="btn sm ghost" onClick={() => onGo(s.place)} title={t('Walk there')}>
        {t('Go ▸')}
      </button>
    </li>
  )

  const sections: { title: string; list: Site[] }[] = [
    { title: t('Ready to build'), list: group(['ready']).filter((s) => s.level === 0) },
    { title: t('Under construction'), list: group(['building']) },
    { title: t('Not yet'), list: group(['short', 'locked']) },
    { title: t('Standing'), list: [...group(['ready']).filter((s) => s.level > 0), ...group(['built'])] },
  ]

  if (tab === 'decor') {
    return (
      <PixelWindow title={t('Construction')} icon="🔨" onClose={onClose} wide>
        <BoardTabs tab={tab} onTab={setTab} />
        <DecorateTab state={state} store={store} />
      </PixelWindow>
    )
  }
  return (
    <PixelWindow title={t('Construction')} icon="🔨" onClose={onClose} wide>
      <BoardTabs tab={tab} onTab={setTab} />
      <p className="place-blurb">
        {t('Unbuilt places stand as staked dirt lots and bare timber frames, marked with a hammer. Build them here or walk to the signpost on the site.')}
      </p>
      <p className="cb-ml">
        {t('Master Lv {n}', { n: ml })} · {state.meta.masterXp} / {masterXpToNext(ml)} XP ·{' '}
        <span className="muted">{t('Clearing floors, drills and every build raise it. A building can’t outgrow the Master Level.')}</span>
      </p>
      {err && <p className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</p>}
      {sections.map(
        (sec) =>
          sec.list.length > 0 && (
            <section key={sec.title} className="cb-section">
              <h4>{sec.title}</h4>
              <ul className="cb-list">{sec.list.map(row)}</ul>
            </section>
          ),
      )}
      <p className="muted cb-foot">{t('Each level takes {m} world-minutes to build; gems can hurry it.', { m: Math.round(TUNING.lobby.facilities.durationPerLevel / 60_000) })}</p>
    </PixelWindow>
  )
}
