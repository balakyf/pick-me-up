# Tower Challenges · bonds, side rooms, raids, the weekly trial

> **Status:** Built (first pass) · **Date:** 2026-09-30 · Slice: `state.challenge` (schema v11) +
> `OwnedHero.bondGroup`. Builds on Layer 2 full climb (2026-09-29) and Act II (its "Deferred" list).

## Goal

The climb is one long line of floors. This slice adds the things canon hangs around it:
heroes who arrive **bound to each other** (인연), **side rooms** between the floors,
**raids** where three parties take turns at one boss (F20's "15 went, 8 returned"), and a
**weekly Crack of Time trial** that is a pure score chase with nothing to lose. The tower
image also starts to wear the climb.

All rules are pure and deterministic (engine rng streams named below); tuning lives in
`src/engine/challenge/tuning.ts` (`CHALLENGE`), not in the shared TUNING.

## 1. Bond groups (`challenge/bonds.ts`)

- **When:** after any ten-pull (`summonMany`, count 10, either pool — the free tutorial
  ten-pull included). Stream: `rngFor(seed, 'bond', pool, pullCounterAfterBatch)` — a
  separate stream, so *who* was pulled never changes.
- **Chance:** Normal 20 %, Advanced 35 % per ten-pull.
- **Size:** weights 2:60 · 3:22 · 4:10 · 5:8 (pairs by far the likeliest).
- **Name:** pairs are "the Twin {Stars|Blades|Flames|Moons|Shadows|Roses}"; 3–5 are
  "the {adjective} {Trio|Triad / Four|Wardens / Band|Company|Brigade}" with the adjective
  flavoured by the lead member's element (wind → Gale/Storm, fire → Ember/Crimson …).
  Names are unique per account (a numeral is appended if all are taken). The parts are kept
  (`adj`, `noun`) so the UI can translate them.
- **Friendship:** every pair of members starts at affinity 65 (close friends) in
  `state.life.relations`.
- **Set bonus** (`applyPartyBonuses`, applied at combat-unit build in the tower, raids, the
  weekly trial and the Mimic): members fighting in one party get +3 % HP/ATK/DEF per member
  beyond the first, +5 % more when the *whole* group fights (a pair: +8 %; a full band of
  five: +17 %). A group that has lost someone can never be whole again.
- **Grief:** a bond sibling's grief and Sanity loss on a death are ×1.5 (`life/react.ts`).
- **UI:** `BondBadge` (⛓ + name) on hero cards and the pickers; `BondList` on the profile.

## 2. Side rooms after anchors (`challenge/rooms.ts`)

The existing event floor (rest / treasure / merchant / gamble) still **blocks** the climb
after every anchor's first clear. Side rooms are **optional extras** on top:

- **When:** an anchor's first clear (not F100) reveals one with 60 % chance, fixed per
  account + floor (`rngFor(seed, 'room', floor)`). It waits on the Tower screen until the
  Master takes it, leaves it, or clears the next anchor (which may replace it).
- **Kinds** (weights): Treasure Vault 22 · Wandering Merchant 22 · Training Grounds 16 ·
  Cursed Shrine 14 · Mimic 14 · Lost Hero 12.

| Room | Effect |
|---|---|
| Treasure Vault | +45 × floor gold, 2 + ⌊floor/20⌋ Promotion Stones |
| Cursed Shrine | every fit party hero pays 18 Sanity → +12 % stats for the party on the next floor attempted (spent on that attempt) |
| Lost Hero | a free Normal-pool summon (the gacha's own builder) |
| Wandering Merchant | 3 stones (360 + 12f), 2 attribute stones (240 + 8f), 1 rank material (300 + 10f), one grade-by-floor gear piece (500 + 30f) — each once; a gold sink |
| Training Grounds | fit party heroes earn 1.5 × the floor's clear XP |
| Mimic | a real fight (permadeath applies) against one brute at 1.25 × the floor's enemy level; win: 70 × floor gold, 3 stones, a gear piece a grade above the floor's |

Command: `BONUS_ROOM { choice }` (`leave` always offered). The store's ATTEMPT_FLOOR path
calls `afterFloor` (opens rooms, spends the blessing).

## 3. Raids (`challenge/raid.ts`)

- **Which:** F20 Halgiraf, F35 Kthat, F60 El Cid, F80 Pryos — open once first cleared,
  replayable from the Tower screen's raid table.
- **Shape:** up to 3 parties of 5 fight **one after another** against **one HP pool**
  (the anchor boss's HP × 4). Each party has 250 ticks, then falls back (survivors live);
  the boss keeps every wound. Its wave-mates come back fresh for each party.
- **Scales & the ballista:** the raid boss wears its scales — a 75 % `resist` to both
  damage types. The Master's ballista and up to 3 **crew** heroes (who don't fight) break
  them for `60 × performance + 25 per crew (archers ×1.5)` ticks at the start of every
  party's fight, ×1.25 when a light hero or a mage holds the Goddess' altar. Combat reads
  this through a new optional `resist.fromTick`. The ballista minigame can be played
  (performance, and practice) or skipped (tracked skill).
- **Stakes:** permadeath for every fighter (lobby graves say *battle*, at the raid floor);
  fighters lose Sanity like a floor attempt; crew lose 5. A clear gives the floor's XP to
  everyone who came back.
- **Rewards:** the chest pays on the first clear per boss per world-week: 20 + f/2 gems,
  4 + ⌊f/10⌋ stones, 2 rank material, and a (15 % + 0.4 %·f) chance at a **page of the Book
  of Reverse Heaven**; five pages bind into a Book automatically.
- Command: `TOWER_RAID { floor, parties, crew, ballista? }`.

## 4. The weekly Crack of Time trial (`challenge/weekly.ts`)

- **Week:** `⌊worldDay / 7⌋` (shared with PvP). Opens once F10 is cleared; reachable from
  the Tower screen, and from the lobby's Crack of Time once the Crack is open.
- **Rule of the week** (cycles): 3★ and below · one element only (the element rotates) ·
  two heroes · enemies ×1.5 HP · no mages.
- **Gauntlet:** 30 waves; wave *w* is a filler squad from floor 1 + 3w, drawn from the
  week's own stream (`hash('weekly', week)`), the same for every Master.
- **Simulation:** the Crack fields copies at full Sanity; the real roster is never touched
  (no permadeath, no Sanity, no XP). Score = waves cleared; 3 attempts a week; the best is
  kept in `state.challenge.weekly`.
- **Thresholds** (first time each week): 3 → 15💎+1 stone · 6 → 25💎+2 · 10 → 40💎+3 stones
  +1 rank · 15 → 60💎+2 rank · 20 → 100💎 + a page of Reverse Heaven.
- Command: `WEEKLY_TRIAL { heroIds }`.

## 5. The tower's look (`ui/pixel/towerMap.ts`, `ui/challenge/TowerExterior.tsx`)

- After a clear the marker **climbs** to the new floor (≈1 s, held while the battle or
  its results are still up), with a brief glow on arrival.
- Cleared **anchor ledges glow** gold.
- **Cracks** spread through F55–89 as the highest cleared floor goes from 50 to 80 (the
  Wailing Wall splits the stone).
- Once F90 has **ended the world**, every floor past it, the crown and the sky above are
  grey and dead.

## Balance check (sim, 30 days, 6 seeds, before → after)

- casual: unchanged (76, 75, 79, 76, 69, 59).
- engaged (the bots now take side rooms): 41, 78, 60, 76, 59, 69 → 79, 80, 79, 76, 59, 69;
  Act VI cleared 0/6 → 3/6; **the Wall (Act VII) still 0/6**.
- whale: 79 ×6 → 79 ×5, 80; fewer deaths. Nobody passes F80.

## Deferred

- The raid boss's HP bar in the battle replay starts full for the 2nd/3rd party (the
  CombatLog has no starting-HP field); the results card shows the true pool.
- Engravings as raid loot; guild co-op raids; a weekly leaderboard against rival Masters.
- Bond groups of existing heroes (only fresh ten-pulls bind); bond-specific dialogue lines.
- Side rooms don't yet have their own pixel art (they reuse the event-floor panel style).
