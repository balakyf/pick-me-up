import { useEffect, useRef, useState } from 'react'
import type { Element, HeroClass, Star } from '../engine/types'
import type { LookSource } from './pixel/look'
import { heroBustUrl, heroFrameUrl, enemyUrl, enemySize, heroPoseUrl, heroBlinkUrl, enemyPoseUrl, type ArtPose } from './pixel/sprites'
import { ENEMY_TEMPLATES } from '../engine/content'
import { HERO_POSES, type Dir, type WalkFrame } from './pixel/heroSprite'
import { LivingSprite } from './pixel/LivingSprite'
import { canvasAvailable } from './pixel/render'
import { nightOf, renderAmbience } from './world/ambience'

/**
 * Dev-only sprite sheet (`?gallery=1`): a spread of generated heroes in every
 * direction/frame plus their busts and every battle pose, every enemy in every
 * pose, the idle-life rhythm and the lobby ambience: the fast feedback loop for
 * pixel work. Not player-facing (no i18n).
 */
const CLASSES: (HeroClass | null)[] = [null, null, 'warrior', 'spearman', 'thief', 'archer', 'mage']
const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical']
const DIRS: Dir[] = ['down', 'left', 'right', 'up']
const FRAMES: WalkFrame[] = [0, 1, 2]
const ENEMY_POSES: ArtPose[] = ['idle', 'windup', 'attack', 'cast', 'hurt', 'ko']
const HOURS = [0, 6, 12, 17.5, 19.5, 22]

function sample(i: number): LookSource {
  const heroClass = CLASSES[i % CLASSES.length]!
  const star = (heroClass === null ? (i % 2 === 0 ? 1 : 2) : 3 + (i % 3)) as Star
  return { id: `h_${String(i).padStart(6, '0')}`, name: `Sample ${i}`, star, heroClass, element: ELEMENTS[i % ELEMENTS.length]! }
}

/** The lobby ambience over a stand-in lawn, at a chosen hour (world and real clocks pinned together). */
function AmbiencePreview() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hour, setHour] = useState(21)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !canvasAvailable()) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    const step = () => {
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#4e8e3a'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.fillStyle = '#5a9a42'
      for (let y = 0; y < cv.height; y += 16) ctx.fillRect(0, y, cv.width, 8)
      const dark = nightOf(hour) * 0.62
      if (dark > 0) {
        ctx.fillStyle = `rgba(10,14,46,${dark})`
        ctx.fillRect(0, 0, cv.width, cv.height)
      }
      renderAmbience(ctx, { nowReal: Date.now(), view: { camX: 0, camY: 0, w: cv.width, h: cv.height }, zoom: 3 }, { realHour: hour, worldHour: hour })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hour])
  return (
    <div className="gallery-amb">
      <canvas ref={ref} className="px" width={192} height={108} style={{ width: 576, height: 324 }} />
      <div>
        {HOURS.map((h) => (
          <button key={h} className={`btn sm ${h === hour ? 'primary' : ''}`} onClick={() => setHour(h)}>
            {String(Math.floor(h)).padStart(2, '0')}:{h % 1 ? '30' : '00'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DevGallery() {
  const heroes = Array.from({ length: 21 }, (_, i) => sample(i))
  const templates = Object.values(ENEMY_TEMPLATES)
  return (
    <div className="gallery">
      <div className="gallery-row">
        {templates.map((t) => {
          const s = enemySize(t.name, t.element)
          return <img key={t.id} className="px" src={enemyUrl(t.name, t.element)} width={s.w * 3} height={s.h * 3} alt={t.name} />
        })}
      </div>

      <div className="gallery-sec">Heroes: bust · walk (down, left, right, up × 3) · battle poses ({HERO_POSES.join(', ')})</div>
      {heroes.map((h) => (
        <div key={h.id} className="gallery-row">
          <img className="px" src={heroBustUrl(h)} width={96} height={96} alt="" />
          {DIRS.map((d) =>
            FRAMES.map((f) => <img key={`${d}${f}`} className="px" src={heroFrameUrl(h, d, f)} width={72} height={96} alt="" />),
          )}
          <span style={{ width: 12 }} />
          {HERO_POSES.map((p) => (
            <span key={p} className="gallery-pose">
              <img className="px" src={heroPoseUrl(h, p)} width={72} height={96} alt={p} title={p} />
              <small>{p}</small>
            </span>
          ))}
          <span className="gallery-cap">
            {h.star}★ {h.heroClass ?? 'classless'} · {h.element}
          </span>
        </div>
      ))}

      <div className="gallery-sec">Idle life: per-unit breathing and blinking (no two in step)</div>
      <div className="gallery-row">
        {heroes.slice(0, 10).map((h) => (
          <LivingSprite
            key={h.id}
            id={h.id}
            src={heroPoseUrl(h, 'idle')}
            blinkSrc={heroBlinkUrl(h)}
            width={72}
            height={96}
            className="gallery-living"
            alt={h.name}
          />
        ))}
      </div>

      <div className="gallery-sec">Enemies: {ENEMY_POSES.join(', ')}</div>
      {templates.map((t) => {
        const s = enemySize(t.name, t.element)
        return (
          <div key={t.id} className="gallery-row">
            {ENEMY_POSES.map((p) => (
              <img key={p} className="px" src={enemyPoseUrl(t.name, t.element, p)} width={s.w * 2} height={s.h * 2} alt={`${t.name} ${p}`} title={p} />
            ))}
            <span className="gallery-cap">{t.name}</span>
          </div>
        )
      })}

      <div className="gallery-sec">Lobby ambience</div>
      <AmbiencePreview />
    </div>
  )
}
