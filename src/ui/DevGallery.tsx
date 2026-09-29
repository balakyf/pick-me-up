import type { Element, HeroClass, Star } from '../engine/types'
import type { LookSource } from './pixel/look'
import { heroBustUrl, heroFrameUrl, enemyUrl, enemySize } from './pixel/sprites'
import { ENEMY_TEMPLATES } from '../engine/content'
import type { Dir, WalkFrame } from './pixel/heroSprite'

/**
 * Dev-only sprite sheet (`?gallery=1`): a spread of generated heroes in every
 * direction/frame plus their busts — the fast feedback loop for pixel work.
 */
const CLASSES: (HeroClass | null)[] = [null, null, 'warrior', 'spearman', 'thief', 'archer', 'mage']
const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical']
const DIRS: Dir[] = ['down', 'left', 'right', 'up']
const FRAMES: WalkFrame[] = [0, 1, 2]

function sample(i: number): LookSource {
  const heroClass = CLASSES[i % CLASSES.length]!
  const star = (heroClass === null ? (i % 2 === 0 ? 1 : 2) : 3 + (i % 3)) as Star
  return { id: `h_${String(i).padStart(6, '0')}`, name: `Sample ${i}`, star, heroClass, element: ELEMENTS[i % ELEMENTS.length]! }
}

export function DevGallery() {
  const heroes = Array.from({ length: 21 }, (_, i) => sample(i))
  return (
    <div className="gallery">
      <div className="gallery-row">
        {Object.values(ENEMY_TEMPLATES).map((t) => {
          const s = enemySize(t.name, t.element)
          return <img key={t.id} className="px" src={enemyUrl(t.name, t.element)} width={s.w * 3} height={s.h * 3} alt={t.name} />
        })}
      </div>
      {heroes.map((h) => (
        <div key={h.id} className="gallery-row">
          <img className="px" src={heroBustUrl(h)} width={96} height={96} alt="" />
          {DIRS.map((d) =>
            FRAMES.map((f) => <img key={`${d}${f}`} className="px" src={heroFrameUrl(h, d, f)} width={72} height={96} alt="" />),
          )}
          <span className="gallery-cap">
            {h.star}★ {h.heroClass ?? 'classless'} · {h.element}
          </span>
        </div>
      ))}
    </div>
  )
}
