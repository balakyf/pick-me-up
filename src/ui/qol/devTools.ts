/**
 * Developer conveniences (the free-gold button in the Game Menu) exist only in a dev
 * build, or when the page is opened with `?dev=1`. A player's build never shows them.
 */
export function devToolsEnabled(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  devBuild: boolean = import.meta.env.DEV,
): boolean {
  return devBuild || new URLSearchParams(search).get('dev') === '1'
}
