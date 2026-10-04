/**
 * Dev-only (lane N, lane J's follow-up): force a cameo summon for QA. Shown only in a dev
 * build or with `?dev=1` (qol/devTools), never in normal play. It plays the real summon
 * reveal for a canon cameo — the gilded frame, the fanfare, the cameo's own words — built
 * from its authored template the way a pull builds it, but it never touches the save.
 */
import { useState } from 'react'
import type { HeroId } from '../../engine/types'
import { CAMEO_HEROES } from '../../engine/content'
import { buildOwnedHeroFromTemplate } from '../../engine/gacha/gacha'
import { devToolsEnabled } from '../qol/devTools'
import { SummonReveal } from '../summon/SummonReveal'
import { t } from '../i18n/i18n'

/** The cameo the dev hook shows for the n-th press (cycles through every cameo). */
export function devCameo(n: number) {
  const tpl = CAMEO_HEROES[((n % CAMEO_HEROES.length) + CAMEO_HEROES.length) % CAMEO_HEROES.length]!
  return buildOwnedHeroFromTemplate(tpl, `h_dev_cameo_${n}` as HeroId)
}

export function DevCameoButton({ masterLevel }: { masterLevel: number }) {
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(false)
  if (!devToolsEnabled() || CAMEO_HEROES.length === 0) return null
  const hero = devCameo(n)
  return (
    <>
      <button
        type="button"
        className="pbtn sm ghost dev-cameo"
        onClick={() => setOpen(true)}
        title={t('Testing only: play a cameo summon reveal (the save is not touched)')}
      >
        {t('Debug · cameo reveal ({name})', { name: hero.name })}
      </button>
      {open && (
        <SummonReveal
          key={n}
          heroes={[hero]}
          masterLevel={masterLevel}
          pool="advanced"
          onClose={() => {
            setOpen(false)
            setN(n + 1)
          }}
        />
      )}
    </>
  )
}
