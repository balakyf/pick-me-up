import type { GameState, OwnedHero, FacilityId } from '../engine/types'
import type { Store } from '../engine/store'
import { t } from './i18n/i18n'
import { CodexButton } from './codex/CodexWindow'
import { HallOfMagicInfo, RiftPanel, ShopPanel } from './metaPanels'
import { GuildPanel } from './pvpPanels'
import { DormitoryInfo, HereNow, KitchenPantry, LibraryInfo, MemorialPanel, StaffSection, WatchtowerInfo } from './life/lifePanels'
import { WeeklyTrialLauncher } from './challenge/WeeklyTrial'
import { EstateSection } from './life/EstatePanels'
import { UpgradeControl, roomFor } from './facilities/shared'
import { BanquetAction } from './facilities/Kitchen'
import { PromotionAction } from './facilities/Promotion'
import { TacticalAction } from './facilities/Tactical'
import { DailyPortal } from './facilities/DailyPortal'
import { SynthesisChamber } from './facilities/Synthesis'
import { Armory } from './facilities/Armory'
import { TrainingAction } from './facilities/Training'
import { TransferAction } from './facilities/Transfer'
import { ForgeOrders } from './facilities/Forge'
import { HeroPicker } from './hero/HeroPicker'

/**
 * Facility panels — the rules-facing half of the Lobby. The walkable world
 * (world/LobbyWorld) opens these inside an RPG window when the Master uses a
 * facility; every action still goes through the engine's Commands unchanged.
 *
 * Each facility's own panel lives in src/ui/facilities/*; this module keeps only the
 * PlacePanel switch (which pieces a place shows) and re-exports the shared helpers.
 */

export { roomFor, sanityColor, timeLeft, UpgradeControl } from './facilities/shared'

export type PanelPlace =
  | 'kitchen'
  | 'tacticalCenter'
  | 'promotionChamber'
  | 'trainingCenter'
  | 'transferStation'
  | 'synthesis'
  | 'armory'
  | 'daily'
  | 'shop'
  | 'hallOfMagic'
  | 'rift'
  | 'guild'
  | 'dormitory'
  | 'tavern'
  | 'infirmary'
  | 'garden'
  | 'memorial'
  | 'library'
  | 'watchtower'
  | 'market'

const BLURB: Record<PanelPlace, string> = {
  kitchen: 'A warm hearth and a long table. Heroes with frayed nerves come here to recover.',
  tacticalCenter: 'Maps, pins and the party board. Focus & overlook combat levers.',
  promotionChamber: 'A sealed marble chamber. Heroes at their star cap are raised past it here.',
  trainingCenter: 'Sand, straw dummies and a chalk drill board. Training sharpens skills — never stats or level.',
  transferStation: 'Twin crystal plinths hum in the dark. A skill can leave one hero and settle in another here.',
  synthesis: 'The vats bubble. Heroes who enter do not come out whole.',
  armory: 'The Smithy forge and the equipment racks.',
  daily: "A rift that opens onto a different dungeon each world-day.",
  shop: "Isel's counter. Bright banners, limited offers, a smile that never reaches her eyes.",
  hallOfMagic: 'Brass orreries turn slowly. The world’s Probability Interference is measured — and strengthened — here.',
  rift: 'The air itself is cracked here. Beyond it: the Ruins, and other Masters’ worlds.',
  guild: 'A tall standard and a notice board. Other Masters’ names, other Masters’ wars.',
  dormitory: 'Rows of narrow beds. Every hero who has one sleeps better; the rest make do on the hall floor.',
  tavern: 'Low beams, a long bar and too few chairs. Where heroes become friends — and rivals.',
  infirmary: 'Clean white cots. Broken nerves and heavy grief mend faster under a healer’s care.',
  garden: 'Neat rows in dark soil. Produce for the kitchen and a little gold at market.',
  memorial: 'A quiet lawn behind a hedge, an obelisk with an eternal flame, and a grave for every hero who fell.',
  library: 'Shelves of books no one remembers writing. Scholars study the floors ahead here.',
  watchtower: 'A stone tower over the Crack of Time. Guards here see invaders coming.',
  market: 'Stalls under striped awnings. Merchants trade the lobby’s surplus with other worlds.',
}

/** The body of a facility window: rules UI for one place in the lobby. */
export function PlacePanel({
  place,
  state,
  store,
  onProfile,
}: {
  place: PanelPlace
  state: GameState
  store: Store
  onFindHero?: (id: string) => void
  onProfile?: (id: string) => void
}) {
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const partyIds = new Set(state.party.slots.filter(Boolean) as string[])
  const here = (room: 'tacticalCenter') => living.filter((h) => roomFor(h, partyIds) === room)
  const lifeFacility: FacilityId | null =
    place === 'dormitory' ||
    place === 'tavern' ||
    place === 'infirmary' ||
    place === 'garden' ||
    place === 'memorial' ||
    place === 'library' ||
    place === 'watchtower' ||
    place === 'market'
      ? place
      : place === 'armory'
        ? 'forge'
        : null

  return (
    <div className={`place-panel place-${place}`}>
      <p className="place-blurb">{t(BLURB[place])}</p>
      {(place === 'kitchen' ||
        place === 'tacticalCenter' ||
        place === 'promotionChamber' ||
        place === 'trainingCenter' ||
        place === 'transferStation' ||
        place === 'hallOfMagic' ||
        lifeFacility !== null) && (
        <div className="lr-lvl-row">
          <span className="lr-lvl">
            {state.facilities[lifeFacility ?? (place as FacilityId)].level === 0
              ? t('Not built')
              : t('Facility Lv {n}', { n: state.facilities[lifeFacility ?? (place as FacilityId)].level })}
          </span>
        </div>
      )}
      {place === 'kitchen' && (
        <>
          <BanquetAction state={state} store={store} />
          <KitchenPantry state={state} />
          <h4 className="panel-sub">{t('Who needs the kitchen')}</h4>
          <HeroPicker state={state} heroes={living} label={t('Heroes by morale, the lowest first')} sort="morale" flip />
          <UpgradeControl state={state} store={store} facility="kitchen" />
          <StaffSection state={state} store={store} job="cook" onProfile={onProfile} />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="kitchen" onProfile={onProfile} />
        </>
      )}
      {place === 'tacticalCenter' && (
        <>
          <TacticalAction state={state} />
          <UpgradeControl state={state} store={store} facility="tacticalCenter" />
          <h4 className="panel-sub">{t('On duty')}</h4>
          <HeroPicker state={state} heroes={here('tacticalCenter')} label={t('The party on duty')} empty="No party assigned — use the party board." />
        </>
      )}
      {place === 'promotionChamber' && (
        <>
          <PromotionAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="promotionChamber" />
        </>
      )}
      {place === 'trainingCenter' && (
        <>
          <TrainingAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="trainingCenter" />
          <StaffSection state={state} store={store} job="instructor" onProfile={onProfile} />
          <h4 className="panel-sub">{t('In the yard now')}</h4>
          <HereNow state={state} place="yard" onProfile={onProfile} />
        </>
      )}
      {place === 'transferStation' && (
        <>
          <TransferAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="transferStation" />
        </>
      )}
      {place === 'hallOfMagic' && (
        <>
          <HallOfMagicInfo state={state} />
          <UpgradeControl state={state} store={store} facility="hallOfMagic" />
        </>
      )}
      {place === 'rift' && <RiftPanel state={state} store={store} />}
      {place === 'rift' && state.meta.crackOpen && <WeeklyTrialLauncher state={state} store={store} />}
      {place === 'shop' && <ShopPanel state={state} store={store} />}
      {place === 'guild' && <GuildPanel state={state} store={store} />}
      {place === 'synthesis' && <SynthesisChamber state={state} store={store} />}
      {place === 'armory' && (
        <>
          <Armory state={state} store={store} />
          <ForgeOrders state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="forge" />
          <StaffSection state={state} store={store} job="blacksmith" onProfile={onProfile} />
        </>
      )}
      {place === 'dormitory' && (
        <>
          <DormitoryInfo state={state} />
          <UpgradeControl state={state} store={store} facility="dormitory" />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="dormitory" onProfile={onProfile} />
        </>
      )}
      {place === 'tavern' && (
        <>
          <UpgradeControl state={state} store={store} facility="tavern" />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="tavern" onProfile={onProfile} empty="The bar is empty. For now." />
        </>
      )}
      {place === 'infirmary' && (
        <>
          <UpgradeControl state={state} store={store} facility="infirmary" />
          <StaffSection state={state} store={store} job="healer" onProfile={onProfile} />
          <h4 className="panel-sub">{t('Resting here')}</h4>
          <HereNow state={state} place="infirmary" onProfile={onProfile} />
        </>
      )}
      {place === 'garden' && (
        <>
          <UpgradeControl state={state} store={store} facility="garden" />
          <StaffSection state={state} store={store} job="gardener" onProfile={onProfile} />
          <HereNow state={state} place="garden" onProfile={onProfile} />
        </>
      )}
      {place === 'library' && (
        <>
          <LibraryInfo state={state} />
          <CodexButton state={state} />
          <UpgradeControl state={state} store={store} facility="library" />
          <StaffSection state={state} store={store} job="scholar" onProfile={onProfile} />
          <HereNow state={state} place="library" onProfile={onProfile} />
        </>
      )}
      {place === 'watchtower' && (
        <>
          <WatchtowerInfo state={state} />
          <UpgradeControl state={state} store={store} facility="watchtower" />
          <StaffSection state={state} store={store} job="guard" onProfile={onProfile} />
        </>
      )}
      {place === 'market' && (
        <>
          <UpgradeControl state={state} store={store} facility="market" />
          <StaffSection state={state} store={store} job="merchant" onProfile={onProfile} />
          <HereNow state={state} place="market" onProfile={onProfile} />
        </>
      )}
      {place === 'memorial' && (
        <>
          <UpgradeControl state={state} store={store} facility="memorial" />
          <h4 className="panel-sub">{t('Visiting now')}</h4>
          <HereNow state={state} place="memorial" onProfile={onProfile} empty="No one is visiting." />
          <MemorialPanel state={state} />
        </>
      )}
      {place === 'daily' && <DailyPortal state={state} store={store} />}
      <EstateSection place={place} state={state} store={store} />
    </div>
  )
}
