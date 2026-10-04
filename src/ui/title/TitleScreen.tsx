import type { CSSProperties } from 'react'
import type { Store } from '../../engine/store'
import type { Element, HeroClass, Star } from '../../engine/types'
import { freshSeed } from '../useGame'
import { heroFrameUrl } from '../pixel/sprites'
import type { Dir, WalkFrame } from '../pixel/heroSprite'
import { cachedDataUrl } from '../pixel/render'
import { t } from '../i18n/i18n'
import {
  DIORAMA_H,
  DIORAMA_SPOTS,
  DIORAMA_W,
  drawCampfire,
  drawDioramaBase,
  drawDioramaLights,
  drawDioramaStars,
  FIRE_H,
  FIRE_W,
} from './diorama'
import './title.css'

// ── Title ────────────────────────────────────────────────────────────────────
interface Figure {
  heroClass: HeroClass | null
  star: Star
  element: Element
  /** Where they stand (diorama pixels: the feet), and which way they face. */
  x: number
  y: number
  dir: Dir
  /** A walker crosses the yard on the path (CSS moves them). */
  walk?: boolean
}

/** The heroes of the diorama: three keep watch by the fire, one walks to the tower. */
const FIGURES: Figure[] = [
  { heroClass: 'warrior', star: 4, element: 'fire', x: 128, y: 130, dir: 'right' },
  { heroClass: 'mage', star: 5, element: 'dark', x: 173, y: 130, dir: 'left' },
  { heroClass: null, star: 1, element: 'earth', x: 151, y: 118, dir: 'down' },
  { heroClass: 'archer', star: 3, element: 'wind', x: 100, y: 116, dir: 'left', walk: true },
]

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** One hero, two stacked walk frames (CSS alternates them; nothing animated is cached). */
function HeroFigure({ f, i }: { f: Figure; i: number }) {
  const src = { id: `title_${i}`, name: `Parade ${i}`, heroClass: f.heroClass, star: f.star, element: f.element }
  const frames: WalkFrame[] = f.walk ? [1, 2] : [0, 1]
  const style: CSSProperties = {
    left: pct(f.x - 12, DIORAMA_W),
    top: pct(f.y - 32, DIORAMA_H),
    width: pct(24, DIORAMA_W),
  }
  return (
    <span className={`dio-hero ${f.walk ? 'walker' : 'idle'}`} style={style}>
      {frames.map((fr, k) => (
        <img key={k} className={`px fr${k}`} src={heroFrameUrl(src, f.dir, fr)} alt="" />
      ))}
    </span>
  )
}

/** The tower at night, the lobby's lights, a campfire and a few heroes. */
function Diorama() {
  const base = cachedDataUrl('dio|base', drawDioramaBase)
  const stars0 = cachedDataUrl('dio|stars|0', () => drawDioramaStars(0))
  const stars1 = cachedDataUrl('dio|stars|1', () => drawDioramaStars(1))
  const lights = cachedDataUrl('dio|lights', drawDioramaLights)
  const fire0 = cachedDataUrl('campfire|0', () => drawCampfire(0))
  const fire1 = cachedDataUrl('campfire|1', () => drawCampfire(1))
  const fire = DIORAMA_SPOTS.fire
  const fireStyle: CSSProperties = {
    left: pct(fire.x - FIRE_W / 2, DIORAMA_W),
    top: pct(fire.y - FIRE_H + 4, DIORAMA_H),
    width: pct(FIRE_W, DIORAMA_W),
  }
  return (
    <div className="diorama" role="img" aria-label={t('The tower at night, seen from the waiting room’s yard')}>
      {base && <img className="px dio-layer" src={base} alt="" />}
      {stars0 && <img className="px dio-layer dio-stars s0" src={stars0} alt="" />}
      {stars1 && <img className="px dio-layer dio-stars s1" src={stars1} alt="" />}
      {lights && <img className="px dio-layer dio-lights" src={lights} alt="" />}
      <span className="dio-fire" style={fireStyle}>
        {fire0 && <img className="px f0" src={fire0} alt="" />}
        {fire1 && <img className="px f1" src={fire1} alt="" />}
        {[0, 1, 2, 3].map((k) => (
          <i key={k} className={`dio-ember e${k}`} />
        ))}
      </span>
      {FIGURES.map((f, i) => (
        <HeroFigure key={i} f={f} i={i} />
      ))}
    </div>
  )
}

export function TitleScreen({ store, hasSave }: { store: Store; hasSave: boolean }) {
  return (
    <div className="title-wrap">
      <div className="subtitle">{t('Infinite Gacha')}</div>
      <div className="logo">
        Pick Me Up<span className="spark">!</span>
      </div>
      <Diorama />
      <div className="tag">
        {t('Summon unique heroes from the Mobius gacha, build a party of five, and climb the permadeath tower. Every hero is one of a kind. Every death is forever.')}
      </div>
      <div className="btns">
        {hasSave && (
          <button className="btn big" onClick={() => store.load()}>
            {t('Continue')}
          </button>
        )}
        <button
          className="btn primary big"
          onClick={() => store.dispatch({ type: 'NEW_ACCOUNT', seed: freshSeed(), now: Date.now() })}
        >
          {hasSave ? t('New Game') : t('Begin')}
        </button>
      </div>
      {hasSave && <div className="muted" style={{ marginTop: 14 }}>{t('Starting a new game overwrites your save.')}</div>}
    </div>
  )
}
