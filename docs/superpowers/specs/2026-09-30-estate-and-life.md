# The Estate · the Living Lobby, deeper

> **Status:** Built · **Date:** 2026-09-30 · Builds on the Living Lobby (same date) and the
> balance pass (2026-09-29). Slice: `GameState.estate` (schema v11, no migration needed —
> `defaultEstate()` fills every field and `withEstate()` completes an early v11 slice).

## Goal

The balance pass left casual bots holding ~1M idle gold, and the Living Lobby spec listed
what it had not built: trauma beyond grief, tryout duels, a favoritism tracker, gift-meaning
drift, more voices. This slice turns gold into things the heroes *live with* — decorations
they use, statues they mourn at, bounties the bench goes on — and gives the waiting room
the harder feelings the lore describes (burnout, withdrawal, envy), plus a sky: seasons and
weather that send heroes indoors and colour what they say.

## 1. Gold sinks

All costs are integers from `src/engine/estate/constants.ts` (no Math.pow).

### 1.1 Decorations (`BUY_DECOR`)

Seven decorations, five levels each; level *n* costs `base × [1, 2.2, 4.8, 10.5, 23][n−1]`.
Maxing the catalogue costs ~1.4M. Each is drawn on the campus and nudges the life sim
per 30-minute slot, per level:

| Decoration | Place (needs) | Base | Effect per level | Drawn as |
|---|---|---|---|---|
| Rugs & bunk lamps | Dormitory | 6 000 | +0.6 energy per sleep slot | rugs in the aisle, wall lamps (L2, L4) |
| Hearth & music corner | Tavern (built) | 8 000 | +1.2 social, +1 fun per tavern socialize slot; a slight pull to socialize | hearth (L1), lute and drum (L3) |
| Flower beds & benches | Garden (built) | 7 000 | +0.12 Sanity per slot in the Garden | 2 flower boxes a level on the fence, benches (L3, L5) |
| Great Hall tapestries | always | 10 000 | +0.05 Sanity per content slot (base 0.25) | one tapestry a level, gilded at L5 |
| Fountain upgrades | always | 5 000 | +1 fun, +0.5 social per wander slot; a slight pull to stroll | taller jet, side spouts, figure, sparkles, gold rim |
| Road lanterns | always | 4 000 | +0.25 guard power; +0.06 Sanity per slot for heroes awake in their night | three lantern posts a level, glowing after dusk |
| Training Yard pennants | always | 9 000 | training XP ×(1 + 0.06·level) | two pennants a level on the fence, scoreboard (L3) |

Sold in the place's panel and on the Construction Board's new **Decorate** tab.

### 1.2 Statues (`RAISE_STATUE`)

For any hero in the Memorial: `15 000 + 6 000·star² + 500·level` gold (1★ Lv10 ≈ 26k,
5★ Lv80 ≈ 205k); 12 plinths on the Memorial's hedges. The statue is the hero's own sprite
carved in marble with a faint wash of their colours. Effects: a hero at the Memorial gains
+0.25 Sanity a slot per statue (max +1); a mourner whose lost friend has a statue sheds
+0.5 grief a slot; anyone withdrawn over *that* death comes back at once.

### 1.3 The bounty board (`POST_BOUNTY`)

Tavern panel. Up to 3 bounties at once; heroes must be on the bench (not in the party, not
training, promoting, away, captive, burnt out or on another bounty). While out, the life sim
pins them `away` and the tower refuses them. They come home through `advanceTime`
(`resolveBounties`), rewards landing directly; the board keeps the last 8 reports.

| Bounty | Gold | Away | Heroes | Needs | Stones | Rank | Attr (each hero) | Rare item | XP (share of a level) |
|---|---|---|---|---|---|---|---|---|---|
| Forage the rift's edge | 4 000 | 6 wh | 1 | — | 1 | 0 | 0 | — | 0.3 |
| Patrol the outer ring | 15 000 | 12 wh | 2 | F10 | 1–3 | 0 | 0 | 5% | 0.5 |
| Salvage the fallen floors | 45 000 | 24 wh | 3 | F25 | 3–5 | 0–1 | 1 | 15% | 0.8 |
| Hunt a named beast | 120 000 | 36 wh | 3 | F45 | 5–8 | 1–2 | 2 | 35% | 1.2 |

Stones ×(1 + 0.005·highest floor). A rare item is a forge-grade piece, a grade better on a
25% roll (≤ S). Rolls: `rngFor(seed, 'bounty', id, kind)`. A first tuning (stones up to 16
and ×(1 + 0.02·floor)) let whales break the F80 Wall in the sim, hence the thin yields.

### 1.4 Paid drill refocus (`REFOCUS_DRILL`)

Training Center: switch a running drill to another skill the centre could teach this hero;
the timer keeps running. Cost `1 000 + ½ × the new drill's price`.

## 2. Trauma and rivalry

Per-hero records live in `estate.trauma` (pruned when nothing is left to remember).

- **Burnout.** Each floor fought adds 1 fatigue; it recovers 1 per world-hour. From 8
  floors in a row, each further floor rolls `(fatigue − 7) × 6% × (1 − courage/2)` (≤ 60%,
  `rngFor(seed, 'burnout', hero, attempt)`): the hero refuses deployment for 24 world-hours
  (the tower lists them as refused) and becomes a **veteran** — an Instructor's power ×1.5
  (canon Roderick). Normal sessions (3–5 floors) never reach it; a long binge does.
- **Withdrawal.** A close friend's death (affinity ≥ 60) withdraws a survivor with chance
  `0.35 + 0.4·warmth − 0.3·courage` (5–90%); so does Sanity under 20 for 72 world-hours.
  A withdrawn hero is pushed off socializing (−1.5 utility), speaks only terse lines and
  fights at ×0.92 stats. Comfort brings them back at 4: the Master's first talk each
  world-day +1 (`TALK_TO_HERO`, dispatched when the Master talks to a hero), a gift +2,
  time +1 a world-day, a statue for the friend they lost — at once.
- **Tryout duels (`HOST_DUEL`).** Training Center, 3 a world-day. The Master pays a purse
  (`1 000 + 40 × both levels`). The bout is a real 1v1 `runBattle` (B on the enemy side,
  no permadeath), seeded by the account's duel count so the UI replays exactly the bout
  the reducer resolved (it TICKs first, then computes `duelBattle` on the same state).
  Both earn 10% of a level of XP (+10% the winner) and lose 3 Sanity. Rivals (affinity ≤
  −30) come out **respectful** (+15) or **bitter** (−10) by warmth vs temper and a roll;
  others spar **friendly** (+5), or a hot-tempered loser turns bitter. Replayed in a small
  duel window (two sprites, HP bars, damage pops; reduced-motion jumps to the end).
- **Favoritism.** Attention marks: a talk 1 (once a day), a gift 2, a floor fought 0.5, a
  duel 0.5; window 3 world-days (one real day). The favourite is the living hero with the
  most, at least 6. Once a world-day, heroes with no attention at all, settled 3+ days, with
  envy (`temper·0.6 + sociability·0.4`) ≥ 0.55 turn **jealous** of the favourite: −1 favor
  a day (never below 20) and −2 affinity to the favourite. Profile and letter say so.
- **Gift meaning drift.** Derived, not stored: a dead friend's favourite gift category
  (weight 2) and a living close friend's (weight 1) come to mean something (three at
  most). A meaningful gift earns +30%·weight favor — and a dead friend's favourite beats a
  dislike (`½ × gift favor × weight` instead of the dislike's loss).

## 3. More voices

`src/ui/life/speechEstate.ts` adds topics to the generator: weather (by kind and voice,
weight 10–38 with the weather), the season, withdrawal (terse; it *replaces* every other
topic), comfort, burnout, the veteran, jealousy, being the favourite, statues, decorations
where the hero stands, bounty and duel memories (by result and mood), bond groups, what a
gift has come to mean. New pair exchanges: weather, duel aftermath, jealousy, bond groups.
The existing banks got more lines per voice (work, reading, needs, the tower, friends,
homes, pairs, grief, last words). About 200 new lines, all translated to French (`frEstate.ts`).

## 4. Seasons and weather

`src/engine/estate/weather.ts`, pure: a season lasts 7 world-days (a 28-day year); each
world-day has four 6-hour blocks, each drawn from the season's odds (snow only in winter,
rain never) with 45% persistence from the block before, hashed from (seed, day, block).
Outdoor places (yard, garden, courtyard, memorial, market) take a utility penalty in the
life sim — storm 1, rain 0.6, snow 0.3, fog 0.1 — so heroes crowd indoors when it rains.

Drawn by `src/ui/world/estateLayer.ts`: season tint, spring blossom (trees, ground,
falling petals), autumn leaves, winter snow on roofs and lawns; rain streaks with puddle
shimmer, lightning flashes in storms, snowfall, drifting fog banks, fireflies near the
garden on summer nights, lantern glow after dusk. The HUD clock shows
"🍂 Autumn · 🌧 Rain". `prefers-reduced-motion` freezes particles and drops the flashes.

## 5. Sim (30 days, `npm run sim -- 30 2`; 5 seeds in brackets)

Bots now spend surplus above a reserve (casual 150k, engaged 200k, whale 300k): a statue
for the most-mourned fallen hero, up to two decoration upgrades a session, bounties for
the weakest free bench heroes; they talk to anyone withdrawn and skip burnt-out heroes.

| Profile | Floors before → after | Idle gold before → after |
|---|---|---|
| casual | 76, 75 → 69, 76 (median of 5: 76 → 75) | 857k, 873k → 158k, 157k (5 seeds avg ~870k → ~165k) |
| engaged | 41, 78 → 59, 69 (median of 5: 60 → 69) | 3k, 544k → 91k, 129k |
| whale | 79, 79 → 79, 79 (5 seeds: 79×5 → 79×4, 81) | 2.18M, 2.25M → 304k, 305k |

The Wall holds (one whale seed of five reaches F81 on day 29).

## Deferred

- Duels and bounties are not in the away letter's tally chips (they appear as chronicle
  lines). Bounty heroes are not blocked from Ruins expeditions or drills by those systems.
- Decorations don't unlock by Master Level; the tavern hearth doesn't warm the dormitory.
- Weather does not touch combat (a rain floor), crops, or the market.
- Statues cap at 12 plinths; a thirteenth fallen hero can only be remembered on the obelisk.
