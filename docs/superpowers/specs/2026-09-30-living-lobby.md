# The Living Lobby · Quanton Life

> **Status:** In progress · **Date:** 2026-09-30 · Builds on the balance pass (2026-09-29).

## Goal

Heroes should feel like people who live in the waiting room, not sprites that pace inside
one room. Per-hero LLM agents are out of budget, so we build the classic alternative that
games like *The Sims*, *Dwarf Fortress*, *RimWorld* and *Stardew Valley* use: a
**deterministic life simulation** (needs + personality + utility AI + schedules +
relationships + memories) and a **template dialogue generator** that reads from it. The
result is "almost an agent": every hero has a stable personality, remembers what happened
to them, has friends and grudges, works a job, and says things that follow from that
state. It costs nothing to run, it is fully offline, and it replays identically from a
save.

The canon pillar this serves is **Quanton AI**: heroes act with free will while the
Master is away.

## 1. The life engine (`src/engine/life/`)

Pure and deterministic like the rest of the engine: every roll comes from
`rngFor(seed, 'life', slot, heroId)`, the wall clock only enters through `advanceTime`.

### 1.1 Personality (derived, never stored)

`personalityOf(hero, seed)` hashes the hero id into:

| Trait | 0..1 meaning |
|---|---|
| `diligence` | works long, trains unprompted, keeps the forge lit |
| `sociability` | seeks company, chats, drinks at the tavern |
| `temper` | argues, holds grudges, rivalries |
| `curiosity` | reads, studies the floors, wanders |
| `courage` | volunteers, fears the tower less (smaller sanity hits) |
| `warmth` | comforts others, mourns deeply, bonds fast |

Plus a **voice** (formal · rough · cheerful · quiet · grim), a **night owl / early bird**
flag, a **favourite food**, a **hobby**, and a **home-world background**: a former trade
(1★ canon: farmer, carpenter, baker, smith…) or a former station (2★+: mercenary, knight,
court mage…). The background gives **job aptitudes**: a 1★ who was a blacksmith back home
is a genuinely good smith. That gives weak heroes a purpose besides being synthesis fodder.

Canon cameo heroes get authored personalities, keyed by name, which override the hash.

### 1.2 Needs (stored per hero)

`energy`, `hunger`, `social`, `fun`, each 0..100. They decay per slot and are
refilled by activities. Sanity (already in the game) stays the morale stat; unmet
needs slowly drain it, and met needs slowly restore it.

### 1.3 Time slots and the day

One **slot = 30 world-minutes** (10 real minutes at the canon 3× dilation), and there
are 48 slots per world-day. The hour of day drives schedules: sleep at night (night owls
later), meals at 7/12/19, work hours 8–18 for heroes with a job, and evenings free.

### 1.4 Activities and utility AI

At each slot boundary an idle hero picks the activity with the highest utility:

```
utility(a) = needGain(a) × needWeight + traitAffinity(a) + scheduleBonus(a, hour)
           + jobBonus(a) + griefBonus(a) + jitter(rng)
```

| Activity | Place | Refills / effect |
|---|---|---|
| sleep | Dormitory | energy |
| eat | Mess Hall (Kitchen) | hunger; a Cook makes it better |
| work | the job's building | produces the job's output (§2) |
| train | Training Yard | small XP; an Instructor multiplies it |
| socialize | Tavern / Great Hall | social; builds relationships |
| hobby | Garden / Library / Bath / Yard | fun |
| read | Library (Hall of Magic) | fun; curious heroes |
| pray | Promotion Chamber | sanity, for the anxious |
| mourn | Memorial | processes grief (sanity recovers faster afterwards) |
| heal | Infirmary | sanity, for broken heroes; a Healer speeds it |
| wander | Courtyard | idle |

Heroes that are busy with a system already in the game (promotion, training drill,
expedition, captive, in the party during a fight) are pinned to that system's place.

### 1.5 Relationships

This is a sparse map of pairs (`"a|b"`, sorted), each with `affinity` −100..100 and
`sharedBattles`. Heroes who share a place in the same slot may interact. Warmth and
sociability pull affinity up, and temper can push it down. Thresholds give **friend**,
**close friend**, **rival** and **grudge**. Fighting and surviving a floor together adds
affinity. A friend's death gives **grief** (a larger sanity hit, and a `mourn` pull that
lasts several days). The map is capped by pruning the weakest pairs.

### 1.6 Memories and the chronicle

Each hero keeps up to 12 **memories** (`kind`, `day`, optional `other` hero, optional
`floor`, `weight`). The kinds are: floor cleared, floor lost, nearly died, friend died,
comrade died, befriended, argued, gift from the Master, promoted, forged an item,
first day, and job mastered. Weight decays over time. Memories feed the dialogue.

The account keeps a **chronicle** of notable life events (the last 120): friendships
formed, fights, items forged, meals cooked, a hero mastering a job, grief, deaths. It is
the source of the **away letter** (§5).

### 1.7 Catch-up

`advanceTime` steps life slot by slot. A long absence is capped at 7 world-days of
detailed simulation. The time before that is skipped, needs start at comfortable values,
and jobs are paid out at their average rate.

## 2. Jobs: heroes working in buildings

The Master assigns a living hero to a building job (one job per hero, a limited number
of seats per building level). A hero works during work hours when their needs allow.
Each job has a **skill** (job XP → Novice/Apprentice/Journeyman/Expert/Master) and an
**aptitude** from background + attributes + personality. Output per work slot is
`base × aptitude × skillMult × buildingLevelMult`.

| Job | Building | Output |
|---|---|---|
| **Blacksmith** | Forge (Armory) | Works through a **work order** (weapon / armor / accessory, or "best for the party"); consumes gold + Promotion Stones like a manual forge; finished items go to the inventory. High skill can produce a **masterwork** one grade above the Master-Level cap. |
| **Cook** | Kitchen | Meals: everyone's hunger refills better, faster sanity regen. |
| **Instructor** | Training Yard | Heroes training in the yard get an XP multiplier. |
| **Scholar** | Hall of Magic / Library | Probability Interference trickle, and **scouting research**: studies upcoming floors so the scouting report is sharper. |
| **Healer** | Infirmary | Faster recovery for low-sanity and grieving heroes. |
| **Gardener** | Garden | Gold from produce (a modest income) and ingredients that make meals better. |
| **Merchant** | Market stall | Sells surplus unequipped E/D gear for gold. |
| **Guard** | Watchtower / Gate | Improves defense against offline invasions. |

Liking the job matters. A hero whose aptitude and personality fit the job gets a morale
bonus, and one assigned to a job they hate slowly loses sanity (and says so).

### New buildings (and gold sinks)

These are new facilities that use the existing upgrade system (gold + world-time build
timer): **Dormitory** (bed capacity; heroes over capacity sleep in the hall and lose
morale), **Tavern**, **Infirmary**, **Garden**, **Memorial**, **Forge** (the Armory's
work seats), **Library** (the Hall of Magic's reading room) and **Watchtower**. This
addresses the balance pass's open item: casual bots hold ~1M unused gold.

## 3. The campus lobby

The waiting room grows from a 39×19 hall into a **campus** of roughly 80×56 tiles:
a Great Hall in the centre (summon crystal, Isel, the Tower Gate, the shop) and
freestanding buildings around a courtyard with paths, grass, trees, a well and
a fountain.

- **Buildings have roofs.** From outside you see the roof. When the Master steps
  inside, the roof lifts and shows the interior (a cutaway). Heroes walk in and out
  through doors, so they visibly *enter buildings*.
- **Day and night** follow the world clock: a dusk tint, a night blue, lit windows, and
  torches that glow.
- **Heroes are driven by the life engine.** Each hero walks to the building of their
  current activity and then does it: hammering at the anvil, stirring the pot, sparring,
  sleeping in their own bed, raising a mug in the tavern, or standing at a grave.
  Micro-motion inside the activity stays cosmetic.
- **Generated speech.** Talking to a hero runs the dialogue generator, and pairs who
  socialize show generated bubbles.
- **Hero tracker + minimap.** A list of every hero and what they are doing ("Aileen —
  forging a C-grade blade at the Forge"), with click-to-find. A minimap shows hero dots.

## 4. The dialogue generator ("almost an agent")

This is a grammar of templates (Tracery-style). `speak(hero, context)`:

1. collects candidate **topics** with a salience score: the current activity, the most
   pressing need, the strongest recent memory, the best friend or worst rival, the job,
   Master favor, the tower (next floor, last result), grief, and a home-world story;
2. picks by salience and a seeded jitter (so the same moment reads the same, but
   tomorrow reads differently);
3. renders a template for that topic in the hero's **voice**, filling slots (friend
   names, floors, foods, trades, item names).

Pair conversations pick a **shared** topic (a floor both survived, a dead mutual
friend,
a rivalry) and alternate lines. The same generator writes **last words** (§5), diary
lines for the away letter, and job remarks.

## 5. Permadeath that lands

- **Death moment** (battle): on a hero death the replay slows, the hero's bust flashes
  with their generated last words, and the fallen stay greyed.
- **Memorial**: a building on the campus with a grave for each fallen hero. The
  Memorial panel lists name, stars, days served, best floor, cause, and last words.
  Friends of the dead go there to mourn.
- **Away letter**: when the Master returns after at least 2 real hours, Isel hands over
  a letter that summarizes the chronicle (invasions, items forged, friendships, fights,
  griefs, jobs mastered, timers finished) with a few diary lines in the heroes' own
  voices.

## 6. Battle clarity and agency

- **Scouting report** on the floor card: the enemy roster (elements, immunities,
  keywords like `looming`), the mission type, and a **threat gauge** from party CP ÷
  floor budget. A Scholar's research and the existing peek intervention sharpen it.
- **Mid-battle orders**: combat takes a list of `orders` applied at a tick (`retreat`,
  `focus <enemy>`, `protect <ally>`). Combat is deterministic, so re-resolving with an
  order reproduces the fight exactly up to that tick. The store keeps the pre-battle
  state in memory and **revises** the last attempt (`store.revise`). **Retreat** ends the
  fight: survivors live, no rewards, a small sanity hit. Orders are limited per battle by
  the Tactical Center level.
- **Suggest party**: counter-picks the floor's immunities and elements, fills the
  lines sensibly, and skips broken and exhausted heroes.
- **Juice**: hit-stop on crits and ultimates, a heavier shake, a skill-cast banner with a
  zoom, and HP bars in the enemy panel.

## 7. Summons, onboarding, pacing

- A **Normal ×10** summon. The reveal teases the best star with the beam colour
  before the cards flip.
- **Onboarding**: the canon **tutorial 10-pull** (free, once), then a Isel-guided
  "First steps" checklist (pull → party → F1 → talk to a hero → assign a job).
- **Whale pacing**: the Mobius crystal holds a limited charge of Advanced pulls per
  world-day.

## 8. Save schema

v10 adds `OwnedHero.life` (needs, job, jobXp, activity, memories, grief) and
`GameState.life` (slot clock, relations, chronicle, memorial, forge order, onboarding,
letter bookkeeping), plus the new facility keys. Migration fills defaults.

## 9. Verification

- Unit tests per life sub-module (personality stability, need decay, utility choice,
  relationship thresholds, memory cap, catch-up equivalence: one long advance equals
  many short ones within the detailed window).
- The determinism guard stays green.
- `npm run sim` re-run: jobs and the new buildings must not break pacing.
