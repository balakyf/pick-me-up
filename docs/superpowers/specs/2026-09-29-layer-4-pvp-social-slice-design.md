# Layer 4 — PvP & Social Slice · Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layer:** Layer 4 (`2026-06-15-layer-4-pvp-social-design.md`).
> **Depends on:** Layer 3's Crack of Time (the opt-in PvP gate) and Probability Interference
> (the account lifecycle); Layer 1 synthesis (the only permadeath route PvP may use); Layer 2's
> tournament formats and the F90/F100 terminus.

## Stance: an offline game with a living server

This build has no server, so **other Masters are simulated.** Every rival is a *seeded ghost
Master*: a name, a lobby, a guild, a tower floor and a CP drawn from the account seed and its
sector. Their parties are built from the same enemy templates as the tournament rivals. Real
networking can later replace `rivals.ts` without changing the rules.

## Canon anchors (inviolable)

- The Crack of Time exposes the base to **invasions**; opening it is the player's choice.
- Raiders take **storerooms** and **kidnap heroes**, who are "later enslaved or synthesized".
  Below **Lv40**, heroes are protected (penalty only).
- **Sectors of 100 Masters, reassigned every 10 floors.** Ranks 1–5 are the floor-80 tier.
- **Whale guilds** (canon 단결회 / Kaiser) are PKers who spend fortunes. Server wars (Niflheim
  130-0).
- **6 months of inactivity deletes the account** (grey towers). **Clearing F90 destroys the
  world**; F100 is the goal.

## 1. Sectors and rank

`sector = floor(highestCleared / 10) + 1`: 100 Masters at your tower band. The sector's ghost
rivals are seeded from `(seed, sector)`, so crossing a 10-floor line re-buckets you. **Rating**
starts at 1000, moves with raids, defenses and wars, and ranks you among your sector's 100. The
**server rank** overlay puts anyone who has cleared F80 in the top 5 (canon).

## 2. Invasions: the kidnap-chain (Open Q4)

Only while the crack is open.

**Outgoing** (`RAID_RIVAL { rival }`): your party against a sector rival's defense party. It is
non-lethal: PvP never kills directly, and your raiders lose a little Sanity.
A win pays the rival's storeroom (gold + stones) and raises your rating. A defeated rival defender
at Lv40+ may be **kidnapped** into `pvp.captives`. Each rival can be raided once per world-week.

**Captives** (the dark path): `RELEASE_CAPTIVE` lets the rival ransom them back (gold + gems).
`SYNTHESIZE_CAPTIVE { survivorId }` feeds them into one of your heroes: a synthesis transfer at η,
the survivor's Sanity drops, and the roster's favor falls.

**Incoming** (resolved offline in `advanceTime`, one seeded roll per world-day, last 7 days max):
a rival raids you unless a **protection shield** is up. Your **defense roster** (`SET_DEFENSE`;
defaults to the party) auto-fights, backed by the Tactical Center (defenders get its focus bonus).
- **Defense holds** → rating up, shield.
- **Defense falls** → the storeroom loses 10% of gold and stones. Each fallen defender **below
  Lv40** loses 1 point of its best growth grade (a permanent penalty; it is never captured).
  Each fallen defender at **Lv40+** is **captured**: held by the raider for 3 world-days with a
  ransom price. Shield either way.
- Whale-guild raiders hit harder but field **brittle, low-Sanity rosters** (they panic), which a
  well-bonded defense can beat.

**Recovering a captured hero:** `RANSOM_HERO` (pay the price) or `COUNTER_RAID` (beat the
captor's defense; it is stronger). If neither happens before the deadline, the captor
**synthesizes** the hero: permadeath, the third and last source in the game.

## 3. Guilds and server wars

Seeded guilds per sector, including the canon **whale guilds** (Unity Society 단결회, Kaiser),
which only admit Masters whose simulated spend tops $100. `JOIN_GUILD` / `LEAVE_GUILD`.

- **Guild aid** (`CLAIM_GUILD_AID`): daily stones from the storehouse.
- **Guild raid** (`GUILD_RAID`, once per world-week): your party's damage against the weekly guild
  boss plus your guildmates' seeded damage. Felling it pays out and has a chance at a
  **Book of Reverse Heaven** (a Layer 2 raid source).
- **Server war** (`SERVER_WAR`, once per world-week): your party fights three squads from a rival
  guild. The record feeds prestige and rating.

## 4. Account lifecycle

When PI **falls** below 1 (a world that had interference and lost it; one that never had any
isn't fading), `meta.piZeroSince` records the moment it crossed. After **30 world-days** the waiting
room is shown **greying** (a warning). After **540 world-days** (6 real months at the canon 3×
dilation) the account is **deleted**: `meta.deleted` is set and the game offers only a new
Master.

## 5. The terminus (F90/F100)

At F90 a Master who has found **7+ of the 10 hidden truths** may **subvert** the win condition
(`ATTEMPT_FLOOR { subvert: true }`). The truth strips the Herald's aegis, and a clear then
**saves** the world (`worldSaved`) instead of ending it. A naive clear is the canon bad end. F100
is the win either way; the ending names which world you won it for.

## 6. Data (schema v8 → v9)

```
GameState.pvp: { defense, shieldUntil, lastInvasionDay, rating, log, captives, raided, guild,
                 guildAidDay, guildRaidWeek, warWeek, war }
OwnedHero.captiveOf: { master, ransomGold, ransomGems, deadlineWorld } | null
MetaState += piZeroSince: number | null; deleted: boolean
TowerState += worldSaved: boolean
```

## 7. Testing

Sector bucketing and re-bucketing; rival determinism · raid win/loss, loot, the Lv40 kidnap gate,
weekly limit · captives released or synthesized · offline invasions: shield, storeroom loss,
the below-Lv40 penalty, the Lv40+ capture, ransom, counter-raid, deadline → synthesized
(permadeath), and no path that kills directly · guild join rules (whales only),
aid, raid, war · greying and deletion · F90 subversion vs the naive clear · migration v8→v9 ·
UI smoke tests.
