import type { Element, HeroClass, Star } from '../engine/types'
import type { LookSource } from './pixel/look'
import { heroBustUrl, heroFrameUrl, heroPoseUrl, enemyUrl, enemySize, poseSize } from './pixel/sprites'
import { ENEMY_TEMPLATES } from '../engine/content'
import { HERO_POSES, type Dir, type WalkFrame } from './pixel/heroSprite'
import { BOSS_SPRITES } from './pixel/enemySprite'
import { hashString } from './pixel/rand'

/**
 * Dev-only sprite sheet (`?gallery=1`): a spread of generated heroes in every
 * direction/frame plus their busts — the fast feedback loop for pixel work.
 */
const CLASSES: (HeroClass | null)[] = [null, null, 'warrior', 'spearman', 'thief', 'archer', 'mage']
const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical']
const DIRS: Dir[] = ['down', 'left', 'right', 'up']
const FRAMES: WalkFrame[] = [0, 1, 2]

/** Like the engine, every sample carries a random signature (portraitToken) colour. */
function token(i: number): string {
  return '#' + (hashString(`tok${i}`) & 0xffffff).toString(16).padStart(6, '0')
}

function sample(i: number): LookSource {
  const heroClass = CLASSES[i % CLASSES.length]!
  const star = (heroClass === null ? (i % 2 === 0 ? 1 : 2) : 3 + (i % 3)) as Star
  return { id: `h_${String(i).padStart(6, '0')}`, name: `Sample ${i}`, star, heroClass, element: ELEMENTS[i % ELEMENTS.length]!, portraitToken: token(i) }
}

/** The star ladder: one hero per class, promoted 3★ → 7★ (the regalia should escalate). */
const LADDER: { heroClass: HeroClass | null; stars: Star[] }[] = [
  { heroClass: null, stars: [1, 2] },
  ...(['warrior', 'spearman', 'thief', 'archer', 'mage'] as HeroClass[]).map((heroClass) => ({ heroClass, stars: [3, 4, 5, 6, 7] as Star[] })),
]

export function DevGallery() {
  const heroes = Array.from({ length: 21 }, (_, i) => sample(i))
  return (
    <div className="gallery">
      {LADDER.map(({ heroClass, stars }, k) => (
        <div key={`ladder${k}`} className="gallery-row">
          {stars.map((star) => {
            const h: LookSource = { id: `lad_${k}`, name: `Ladder ${k}`, star, heroClass, element: ELEMENTS[(k + 2) % ELEMENTS.length]!, portraitToken: token(k * 5 + 3) }
            return (
              <span key={star} style={{ display: 'inline-flex', alignItems: 'flex-end', marginRight: 14 }}>
                <img className="px" src={heroBustUrl(h)} width={96} height={96} alt="" />
                <img className="px" src={heroFrameUrl(h, 'down', 0)} width={72} height={96} alt="" />
                <img className="px" src={heroFrameUrl(h, 'left', 1)} width={72} height={96} alt="" />
                <img className="px" src={heroFrameUrl(h, 'up', 0)} width={72} height={96} alt="" />
                <span className="gallery-cap">{star}★</span>
              </span>
            )
          })}
          <span className="gallery-cap">{heroClass ?? 'classless'}</span>
        </div>
      ))}
      {/* Lane I: the bosses at native size (both idle frames), then every hero's battle poses. */}
      <div className="gallery-row">
        {BOSS_SPRITES.map((id) => {
          const t = ENEMY_TEMPLATES[id]!
          const s = enemySize(t.name, t.element)
          return (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'flex-end', marginRight: 10 }}>
              <img className="px" src={enemyUrl(t.name, t.element, 0)} width={s.w * 2} height={s.h * 2} alt={t.name} />
              <img className="px" src={enemyUrl(t.name, t.element, 1)} width={s.w * 2} height={s.h * 2} alt="" />
            </span>
          )
        })}
      </div>
      {LADDER.slice(1).map(({ heroClass }, k) => {
        const h: LookSource = { id: `pose_${k}`, name: `Pose ${k}`, star: 5, heroClass, element: ELEMENTS[k % ELEMENTS.length]!, portraitToken: token(k * 7 + 1) }
        return (
          <div key={`pose${k}`} className="gallery-row">
            {HERO_POSES.map((p) => {
              const s = poseSize(p)
              return <img key={p} className="px" src={heroPoseUrl(h, p)} width={s.w * 3} height={s.h * 3} alt={p} title={p} />
            })}
            <span className="gallery-cap">{heroClass} poses</span>
          </div>
        )
      })}
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
