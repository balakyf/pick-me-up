/**
 * "Open a hero" from anywhere (lane N): the Registry, the Party Board, every facility
 * picker and the Armory call `openHeroSheet(id)`; the App's `HeroSheetHost` shows the one
 * hero sheet. The lobby registers its camera so a sheet opened there can "find" the hero.
 * The promotion planner window (the advisor's one-click "promote", the sheet's Promote
 * button) rides on the same bus.
 */
import { useSyncExternalStore } from 'react'

export type SheetTab = 'overview' | 'stats' | 'skills' | 'gear' | 'story'
export const SHEET_TABS: SheetTab[] = ['overview', 'stats', 'skills', 'gear', 'story']

export interface SheetRequest {
  heroId: string
  tab: SheetTab
  /** Bumps on every open, so re-opening the same hero on another tab re-mounts it. */
  nonce: number
}

interface BusState {
  sheet: SheetRequest | null
  planner: string | null
  finder: ((id: string) => void) | null
}

let bus: BusState = { sheet: null, planner: null, finder: null }
let nonce = 0
const subs = new Set<() => void>()

function set(next: Partial<BusState>): void {
  bus = { ...bus, ...next }
  for (const f of subs) f()
}

export function openHeroSheet(heroId: string, tab: SheetTab = 'overview'): void {
  set({ sheet: { heroId, tab, nonce: ++nonce } })
}

export function closeHeroSheet(): void {
  if (bus.sheet !== null) set({ sheet: null })
}

/** Open the promotion planner for a hero (a window of its own). */
export function openPromotionPlanner(heroId: string): void {
  set({ planner: heroId })
}

export function closePromotionPlanner(): void {
  if (bus.planner !== null) set({ planner: null })
}

/** The lobby's "find on the map" (null off the lobby). Returns the unregister. */
export function registerSheetFinder(fn: (id: string) => void): () => void {
  set({ finder: fn })
  return () => {
    if (bus.finder === fn) set({ finder: null })
  }
}

function subscribe(f: () => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}

export function useSheetBus(): BusState {
  return useSyncExternalStore(subscribe, () => bus, () => bus)
}

/** Tests: forget everything. */
export function resetSheetBus(): void {
  bus = { sheet: null, planner: null, finder: null }
  for (const f of subs) f()
}
