/**
 * The "New facility!" fanfare (spec 2026-10-12 S3). Shown in the lobby when a place has
 * just opened: rays and sparkles behind the building's own pixel art, Isel's one
 * sentence about what it is good for, the unlock sting, and a single "Show me" action
 * that walks the Master there. Places that opened at the same moment ride along as
 * "Also open".
 *
 * It owns no game state: the lobby records the fanfare as seen (`SEE_UNLOCK`) when it
 * opens it, so it plays once per place. Presentation randomness (sparkle positions) is
 * hashed from the place id, never Math.random.
 */
import { useEffect, useRef } from 'react'
import { PLACE_LABEL, propForPlace, type PlaceId } from '../world/lobbyMap'
import { drawProp } from '../pixel/props'
import { scale } from '../pixel/bitmap'
import { cachedDataUrl } from '../pixel/render'
import { iselBustUrl } from '../pixel/sprites'
import { hashString } from '../pixel/rand'
import { sfx } from '../audio/sound'
import { getPrefs } from '../prefs'
import { unlockLine } from './unlocks'
import { t } from '../i18n/i18n'
import './shell.css'

/** The place's own prop, drawn large ('' where there is no canvas, e.g. tests). */
function placeArtUrl(place: PlaceId): string {
  const kind = propForPlace(place).kind
  return cachedDataUrl(`unlock-art|${kind}`, () => scale(drawProp(kind, 0).bmp, 4))
}

/** Eight sparkles at stable, place-specific spots around the art. */
export function sparkleSpots(place: PlaceId): { x: number; y: number; d: number }[] {
  const out: { x: number; y: number; d: number }[] = []
  for (let i = 0; i < 8; i++) {
    const h = hashString(`${place}|spark|${i}`)
    out.push({ x: 8 + (h % 84), y: 6 + ((h >>> 8) % 70), d: ((h >>> 16) % 9) * 0.15 })
  }
  return out
}

/** Places whose opening is marked quietly (they may open because someone died). */
const SOMBER: ReadonlySet<PlaceId> = new Set<PlaceId>(['memorial'])

export function UnlockBanner({
  places,
  icons,
  onShow,
  onClose,
}: {
  /** The newly open places; the first is featured. */
  places: PlaceId[]
  icons: Record<PlaceId, string>
  onShow: (place: PlaceId) => void
  onClose: () => void
}) {
  const featured = places[0]!
  const others = places.slice(1)
  const showRef = useRef<HTMLButtonElement>(null)
  const art = placeArtUrl(featured)
  const calm = getPrefs().reducedMotion
  // The Memorial can open with the first death: no confetti for that.
  const somber = SOMBER.has(featured)

  useEffect(() => {
    if (!somber) sfx('unlock')
    showRef.current?.focus()
  }, [featured, somber])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = t(PLACE_LABEL[featured])
  return (
    <div className={`unlock-backdrop${calm ? ' calm' : ''}${somber ? ' somber' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="unlock-card" role="dialog" aria-modal="true" aria-labelledby="unlock-name" aria-describedby="unlock-line">
        <div className="unlock-kicker">{somber ? t('A place to remember') : t('New facility!')}</div>
        <div className="unlock-art">
          {!somber && <span className="unlock-rays" aria-hidden="true" />}
          {!somber && sparkleSpots(featured).map((s, i) => (
            <span key={i} className="unlock-spark" aria-hidden="true" style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }}>
              ✦
            </span>
          ))}
          {art ? (
            <img className="px unlock-sprite" src={art} alt="" />
          ) : (
            <span className="unlock-glyph" aria-hidden="true">
              {icons[featured]}
            </span>
          )}
        </div>
        <h2 className="unlock-name" id="unlock-name">
          <span aria-hidden="true">{icons[featured]}</span> {name}
        </h2>
        <div className="unlock-isel">
          <img className="px unlock-bust" src={iselBustUrl()} width={40} height={40} alt="" />
          <p id="unlock-line">
            <b>Isel</b> {unlockLine(featured)}
          </p>
        </div>
        {others.length > 0 && (
          <div className="unlock-also">
            <span className="muted">{t('Also open:')}</span>
            {others.map((p) => (
              <span key={p} className="unlock-also-chip">
                {icons[p]} {t(PLACE_LABEL[p])}
              </span>
            ))}
          </div>
        )}
        <div className="unlock-actions">
          <button className="pbtn ghost" onClick={onClose}>
            {t('Later')}
          </button>
          <button ref={showRef} className="pbtn unlock-show" onClick={() => onShow(featured)}>
            {t('Show me')} ▸
          </button>
        </div>
      </div>
    </div>
  )
}
