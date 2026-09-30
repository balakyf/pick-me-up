import type { BonusRoom, BonusRoomKind, CombatLog, EquipmentSlot, GameState } from '../../engine/types'
import { CHALLENGE, challengeOf, merchantWares, roomChoices, type RoomOutcome, type Ware } from '../../engine/challenge'
import { floorXp } from '../../engine/tower'
import { HeroCard } from '../HeroCard'
import { t } from '../i18n/i18n'
import { lootLine, matLabel } from './common'

const R = CHALLENGE.rooms

export const ROOM_TITLE: Record<BonusRoomKind, string> = {
  vault: 'Treasure Vault',
  shrine: 'Cursed Shrine',
  lostHero: 'Lost Hero',
  merchant: 'Wandering Merchant',
  training: 'Training Grounds',
  mimic: 'Mimic',
}
const ROOM_ICON: Record<BonusRoomKind, string> = { vault: '💰', shrine: '🕯', lostHero: '🧭', merchant: '🛒', training: '🎯', mimic: '📦' }

function roomBlurb(room: BonusRoom): string {
  switch (room.kind) {
    case 'vault':
      return t('A vault the tower forgot: {g} gold and {s} Promotion Stones.', {
        g: (R.vaultGoldPerFloor * room.floor).toLocaleString(),
        s: R.vaultStones + Math.floor(room.floor / 20),
      })
    case 'shrine':
      return t('Every fit hero in your party pays {s} Sanity. On the next floor you attempt, they fight at +{p}% stats.', {
        s: R.shrineSanity,
        p: Math.round(R.shrineBuff * 100),
      })
    case 'lostHero':
      return t('A lone hero from a party that never came back. They will join you (a free Normal-pool hero).')
    case 'merchant':
      return t('A merchant who climbs the tower selling to Masters. Each ware once, for gold.')
    case 'training':
      return t('An old drill yard. Every fit hero in your party earns {xp} XP.', { xp: Math.round(floorXp(room.floor) * R.trainingXpMult).toLocaleString() })
    case 'mimic':
      return t('A chest that breathes. Fight it for gold, stones and gear — it is still the tower: the fallen stay fallen.')
  }
}

const CHOICE_LABEL: Record<string, string> = {
  take: 'Take it',
  accept: 'Accept',
  train: 'Train',
  fight: 'Fight ⚔',
  leave: 'Leave',
}

const GEAR_LABEL: Record<EquipmentSlot, string> = {
  weapon: '{grade}-grade weapon',
  armor: '{grade}-grade armor',
  accessory: '{grade}-grade accessory',
}

/** "C-grade weapon" */
export function gearLabel(item: { slot: EquipmentSlot; grade: string }): string {
  return t(GEAR_LABEL[item.slot], { grade: item.grade })
}

function wareLabel(w: Ware): string {
  if (w.item) return gearLabel(w.item)
  return Object.entries(w.materials)
    .map(([k, n]) => `${n} × ${matLabel(k)}`)
    .join(' · ')
}

/** The side door on the Tower screen: optional, waits until taken or left. */
export function BonusRoomPanel({ state, onChoose }: { state: GameState; onChoose: (choice: string) => void }) {
  const room = challengeOf(state).room
  if (!room) return null
  const choices = roomChoices(room)
  const wares = room.kind === 'merchant' ? merchantWares(state, room.floor) : []
  const party = state.party.slots.some((id) => id && state.heroes[id]?.alive)
  return (
    <div className="pframe side-room">
      <div className="event-head">
        <span className="event-kind">
          🚪 {t('A side door')} · {ROOM_ICON[room.kind]} {t(ROOM_TITLE[room.kind])}
        </span>
        <span className="muted">{t('found after F{n} · optional', { n: room.floor })}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {roomBlurb(room)}
      </p>
      <div className="side-room-choices">
        {room.kind === 'merchant'
          ? wares
              .filter((w) => choices.includes(w.id))
              .map((w) => (
                <button key={w.id} className="event-option" onClick={() => onChoose(w.id)} disabled={state.gold < w.price}>
                  <span className="eo-name">{wareLabel(w)}</span>
                  <span className="eo-blurb">{w.price.toLocaleString()} ◆</span>
                </button>
              ))
          : choices
              .filter((c) => c !== 'leave')
              .map((c) => (
                <button
                  key={c}
                  className={`pbtn ${room.kind === 'mimic' ? 'danger' : 'primary'}`}
                  onClick={() => onChoose(c)}
                  disabled={(room.kind === 'shrine' || room.kind === 'training' || room.kind === 'mimic') && !party}
                >
                  {t(CHOICE_LABEL[c] ?? c)}
                </button>
              ))}
        <button className="pbtn ghost" onClick={() => onChoose('leave')}>
          {t('Leave')}
        </button>
      </div>
    </div>
  )
}

/** What a side room just did. */
export function RoomOutcomeCard({ outcome, onReplay, onClose }: { outcome: RoomOutcome; onReplay: (log: CombatLog) => void; onClose: () => void }) {
  const loot = lootLine({ gold: outcome.gold, materials: outcome.materials })
  return (
    <div className="overlay">
      <div className="result-card">
        <div className={`big-outcome ${outcome.won === false ? 'lose' : 'win'}`}>{t(ROOM_TITLE[outcome.kind])}</div>
        <div className="muted">{t(outcome.note)}</div>
        {(loot || outcome.item || outcome.sanity !== 0 || outcome.xp > 0) && (
          <div className="room-loot">
            {loot && <div>{loot}</div>}
            {outcome.item && <div>⚒ {gearLabel(outcome.item)}</div>}
            {outcome.sanity !== 0 && <div style={{ color: 'var(--bad)' }}>{t('Party Sanity {n}', { n: outcome.sanity })}</div>}
            {outcome.xp > 0 && <div style={{ color: 'var(--good)' }}>{t('+{n} XP to the party', { n: outcome.xp.toLocaleString() })}</div>}
          </div>
        )}
        {outcome.fallen.length > 0 && <div style={{ color: 'var(--bad)' }}>☠ {t('{n} fell to the Mimic.', { n: outcome.fallen.length })}</div>}
        {outcome.recruit && (
          <div className="reveal" style={{ margin: '0 auto 12px' }}>
            <HeroCard hero={outcome.recruit} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
          {outcome.log && (
            <button className="pbtn" onClick={() => onReplay(outcome.log!)}>
              ▸ {t('Watch the fight')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {t('Onward ▸')}
          </button>
        </div>
      </div>
    </div>
  )
}
