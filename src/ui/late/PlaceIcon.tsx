/**
 * Lane Q: a place's pixel icon (the Game Menu, the facility windows, the Construction Board).
 * The emoji stays as the fallback where no canvas draws (tests, a canvas-less browser).
 */
import type { PlaceId } from '../world/lobbyMap'
import { cachedDataUrl } from '../pixel/render'
import { PLACE_ICONS, placeIconBitmap } from '../pixel/placeIcons'
import './late.css'

export function PlaceIcon({ place, size = 20, label }: { place: PlaceId; size?: number; label?: string }) {
  const url = cachedDataUrl(`placeicon|${place}`, () => placeIconBitmap(place))
  if (!url) {
    return (
      <span className="place-icon pxicon-glyph" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        {PLACE_ICONS[place].glyph}
      </span>
    )
  }
  return <img className="px place-icon" src={url} width={size} height={size} alt={label ?? ''} aria-hidden={label ? undefined : true} draggable={false} />
}
