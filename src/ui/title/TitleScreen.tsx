import type { Store } from '../../engine/store'
import type { Element, HeroClass, Star } from '../../engine/types'
import { freshSeed } from '../useGame'
import { heroFrameUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'

// ── Title ────────────────────────────────────────────────────────────────────
const PARADE: { heroClass: HeroClass | null; star: Star; element: Element }[] = [
  { heroClass: null, star: 1, element: 'earth' },
  { heroClass: 'warrior', star: 4, element: 'fire' },
  { heroClass: 'mage', star: 5, element: 'dark' },
  { heroClass: 'archer', star: 3, element: 'wind' },
  { heroClass: 'spearman', star: 4, element: 'water' },
  { heroClass: 'thief', star: 3, element: 'light' },
  { heroClass: null, star: 2, element: 'physical' },
]

export function TitleScreen({ store, hasSave }: { store: Store; hasSave: boolean }) {
  return (
    <div className="title-wrap">
      <div className="subtitle">{t('Infinite Gacha')}</div>
      <div className="logo">
        Pick Me Up<span className="spark">!</span>
      </div>
      <div className="title-parade">
        {PARADE.map((p, i) => (
          <img
            key={i}
            className="px"
            src={heroFrameUrl({ id: `title_${i}`, name: `Parade ${i}`, ...p }, 'down', 0)}
            width={72}
            height={96}
            alt=""
          />
        ))}
      </div>
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
