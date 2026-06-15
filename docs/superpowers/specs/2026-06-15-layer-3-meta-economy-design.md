# Pick Me Up! — Layer 3: Meta & Economy Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-15
> **Scope:** The meta loop and economy — currencies, materials, daily dungeons, lobby/facility upgrades, master leveling, hero state (favorability/sanity), minigames, the two intervention systems (Open Q6), and the predatory monetization layer.
> **Depends on:** Layer 0 (stats/state axes), Layer 1 (gacha/promotion/synthesis sinks), Layer 2 (floor rewards, daily-dungeon content, shop hooks).
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md`. **Stance:** playability-first; hard canon anchors inviolable.

Layer 3 is the connective tissue: it pays down every reward/cost/material deferral from Layers 1–2 and adds the systems that pace long-term play. It defers only **PvP/social resolution** and **win/lose + account-deletion edge cases** to Layer 4.

---

## Design decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Monetization stance | **Model the predatory layer** (real-money packages, whale advantages, compulsion mechanics; money simulated) | truest to the source's dark satire of gacha |
| Open Q6 (intervention) | **Two separate systems** — Probability Interference (passive, account-wide) + Intervention Points (active, per-hero) | matches the bible's own hypothesis; clean passive/active split |

---

## A. Currencies & Material Economy

### A1. Currencies

| Currency | Type | Earned from | Spent on |
|---|---|---|---|
| **Gold** | soft | floor clears, missions, Daily Dungeons, selling loot | Normal summons (3k/pull), facility upgrades, crafting, basic shop |
| **Gems** | premium | Ruins (Rank-8 sector+), anchor first-clears, hidden objectives, achievements, ranking, daily login — **and real money** (§D3) | Advanced summons (150/pull), high-rank gifts, cadet fee (500), Ruins exchange, pay-to-skip |

### A2. Income formulas (closes the Layer 2 reward-amount deferral)

```
floorGold(f) = 100 × f × worldMult            # first clear ×3
floorXP(f)   = tuned so ~3–4 at-tier floor clears = one level on the Layer 0 curve
gemDrip      = anchor first-clear 10–50 · hidden objective 5–20 · daily login 50 · Ruins (sector 8+) streamed
```
The Gem drip is deliberately thin — the lever the predatory layer (§D3) pushes against.

### A3. Material economy (closes Layer 1 §3.2 / §5.3 sourcing & recipes)

**Types:** Promotion Stones · Attribute Stones (Fire/Water/Earth/Wind/Light/Dark, element-matched) · Upgrade Stones (Lesser→Intermediate→Greater) · Soul Stones (Lesser→Greater) · Rank Promotion Materials.

**Sourcing:**

| Source | Yields |
|---|---|
| Daily Dungeons (primary, §B1) | Attribute Stones, Promotion Materials, Upgrade Stones (low rate on elites) |
| Tower drops | Gold, equipment loot, occasional stones |
| Synthesis (Layer 1 §4.2) | Lesser Soul Stones |
| Crafting | combines lower mats into higher |

**Crafting recipes (seeded with canon, extensible):**

| Output | Recipe |
|---|---|
| Intermediate Upgrade Stone | Lesser Upgrade Stone + Lesser Soul Stone (canon) |
| Greater Upgrade Stone | 2× Intermediate + Greater Soul Stone |
| Element Stone (next tier) | 3× same-element lower + Gold |
| Equipment grade-up | base item + matching mats + Gold, success-rate roll |

Grade-up success ladder: E→D 90% … A→S 25% … SS→SSS 5%. **Failure consumes mats but not the base item** (forgiving).

---

## B. Daily Dungeons, Lobby Upgrades & Master Leveling

### B1. Daily Dungeons (closes Gap 17)

Type by day of week (canon); difficulty tiers gated by Master level + tower progress; **3 free attempts/day** (more via Gems — §D3); rare mats low-drop on elites (canon).

| Day | Dungeon | Primary yield |
|---|---|---|
| Mon | Gold Vault | Gold (bulk) |
| Tue | Elemental Trial (element rotates weekly) | Attribute Stones |
| Wed | Promotion Grounds | Promotion Stones + Rank Promotion Materials |
| Thu | Proving Hall | hero XP |
| Fri | Soulforge | Upgrade + Soul Stones |
| Sat | Armory Depths | equipment loot |
| Sun | Convergence (wildcard) | reduced rates of all |

Primary faucet feeding the §A3 material sinks.

### B2. Lobby & Facility Upgrade Trees (closes Gap 14)

Every facility levelable **1→25** (canon endgame Lv18–22). Generic model:
```
upgradeCost(L) = Gold(base × 1.5^L) + tier materials
buildTime(L)   = scales with L, in WORLD-time (canon 1 Earth day = 3 world days);
                 finishes offline; instant-finish via Gems (§D3)
prerequisite   = Master level gate + Probability-Interference unlock (§D1)
```

| Facility | Effect scaling with level |
|---|---|
| Restaurant/Kitchen | Sanity/Morale regen rate |
| Training Center | skill-refine speed; max trainable skill grade |
| Smithy | craftable grade ceiling; grade-up success % |
| Synthesis Chamber | reduces Sanity loss/synthesis; raises η cap slightly |
| Promotion Chamber | reduces promotion material cost |
| Hall of Magic | Probability-Interference generation rate (§D1) |
| Tactical Center | strength of Master focus/overlook |
| Waiting-room floors | roster capacity (canon Niflheim 13-floor scaling) |

### B3. Master Account Leveling (closes Gap 23)

Track **separate from hero levels**.
```
masterXP from : floor clears, daily-dungeon completion, achievements, first-clears
masterCap     : 100
masterCurve   : masterXpToNext(L) = round(60 × L^1.8)   # gentler than heroes
```

| Master Lv | Unlocks |
|---|---|
| 1–9 | core loop, Normal summon, basic facilities |
| 10 | Advanced summon, Daily Dungeon tier 2 |
| **20** | **Crack of Time & Space / Dimensional Rifts** (canon) → PvP (Layer 4), Ruins/Gem income, cadet recruitment |
| 30 | sub-master, Tactical Center, 2nd party slot |
| 40 | 3rd party slot (raid anchors), **PvP permadeath boundary** (Layer 4, Open Q4) |
| 50+ | high-tier facilities, Hall of Magic, advanced minigames |

Master level sequences *which systems exist yet* — the meta-layer's master gate.

---

## C. Hero State & Minigames

### C1. Hero State — Favorability (closes Gap 11) + Sanity/Morale (from Layer 1)

Both 0–100 (Layer 0 §1.4). Together they encode the canon truth that heroes are real people with free will.

**Favorability tiers:**

| Tier | Range | Effect |
|---|---|---|
| Wary | 0–20 | sluggish obedience; ignores focus/overlook |
| Neutral | 21–40 | baseline |
| Warm | 41–60 | small combat buff; minor dialogue |
| Devoted | 61–80 | personal quest / hidden skill; +bond-synergy |
| Bonded | 81–100 | max buff; volunteers for risk; may send notes to Master (canon Loki/Han account) |

**Gift economy (closes canon "repetitive gifts lower favorability"):**
```
matched-preference gift → +large
neutral gift            → +small
SAME gift repeated      → diminishing → eventually NEGATIVE (canon)
high-rank gifts         → cost Gems / high-value mats, bigger swing
banquets/treats         → small roster-wide morale + favor
```

**Sanity/Morale (makes the Layer 1 synthesis cost bite):**
```
drops:    synthesis (−15 survivor, −5 roster), bonded-ally permadeath, harsh treatment, brutal floors
restores: Restaurant regen, Rest event floors, banquets, victories
low-Sanity: panic chance (vs WIL/status-res), perf penalty, refusal to act
Sanity 0:  breakdown → rebellion risk
```

**Obedience model (canon fear-vs-favor):** drive heroes by **favor** (sustainable) or **fear/punishment** (canon — discard disobedient via synthesis). Low Favorability + low Sanity → rising rebellion probability. Favor-only (protagonist) is the stable path; whale/fear is high-output but brittle. This axis is reused by §D3.

### C2. Minigames (closes Gap 10)

The Master's **active-skill layer** (canon; ignoring them risks the "incompetent Master" label). One interface:
```
Minigame {
  trigger        : mission-event | facility-action
  skillInput     : timing / aim / rhythm / routing
  outputModifier : performance → multiplier on linked outcome
  autoResolve    : value if not played (= Master's tracked skill)
}
masterSkill[minigame] rises with play → lifts the auto-resolve floor
```

| Category | Examples | Performance affects |
|---|---|---|
| Mission minigames | Ballista aiming (canon F20), escort routing, survival positioning | that action's damage/success |
| Lobby minigames (13, incl. blacksmithing) | Blacksmithing (= equipment grade-up game), cooking, gathering, research | facility yield / success-rate |

Framework + two concrete examples (Blacksmithing, Ballista); the rest are *content* in this interface. **Every minigame is optional** — auto-resolve lets a hands-off Master still play, less optimally (canon).

---

## D. Intervention Systems & the Predatory Layer

### D1. Probability Interference — passive, account-wide (Open Q6, system 1)

```
rises with: logins, floor clears, time-in-world, Hall-of-Magic rate (§B2)
NEVER spent by the player — a world-stability + unlock meter
```
- **World sustenance** (canon "without a player a world vanishes") → PI stalls/decays on inactivity → hook for the canon 6-month-inactivity deletion (gray towers). *Exact timing = Layer 4 (Open Q4).*
- **Content unlocks** (canon "more content unlocks via probability interference") → PI thresholds gate lobby floors/facilities/features alongside Master level.

### D2. Intervention Points — active, per-hero (Open Q6, system 2)

```
accrues per hero as rank/bond deepens (promotion + Favorability milestones — canon)
higher-rank heroes pool more
spent via a hero-Intervention menu unlocked at high bond (the hero's own agency)
```

| Intervention | Cost | Effect |
|---|---|---|
| Reveal hidden objective | low | pre-shows a Layer 2 §5.3 hidden objective |
| Peek enemy weakness | low | reveals a boss keyword/element counter |
| Forge a system message | mid | deception (PvP utility → Layer 4) |
| Nudge probability | high | one favorable reroll (summon-quality / drop) |
| Guarantee an action | high | force a crit / guaranteed proc this turn |

**Hard rule:** no intervention revives a dead hero or undoes Tower permadeath. IP mitigates risk, never erases the stake — Layer 0/2 anchor intact.

### D3. The Predatory Layer (modeled per the chosen stance)

> **Design note:** this models the source's **satire** of predatory gacha. "Money" is simulated; these systems reproduce the fiction's critique, not monetize a real player.

**Real-money Gem purchases (simulated):** Gem packages at price points; canon Monthly Package = 150 gems + 10,000 gold/day × 30 = 4,500 gems + 300k gold.

**Whale advantages:**
- Pay-to-skip: instant facility builds (§B2), Daily-Dungeon refills (§B1), promotion-material bundles.
- Gem-gated Advanced pool = the only 4★–5★ path (Layer 1 §1.1).
- **Whale-bait star inflation ON** (Layer 1 §1.6 `displayStar > trueStar`) as a spending driver.
- Whale guilds (canon 단결회/카이저) → endgame PvP threat (Layer 4).

**Compulsion mechanics (canon "compulsion magic"):**

| Mechanic | Modeled as |
|---|---|
| FOMO | limited-time packages, resettable login streaks |
| Frustration-avoidance | after a bad streak, surface a "deal" + inflate a hero's apparent value (canon Sirris) |
| Near-miss | quality-floor pity shown as "so close!" (Layer 1 §1.3) |
| Engagement lock-in | leaving makes the game "feel finicky" — a satisfaction modifier (canon) |

The whale/fear path buys raw power on brittle low-Sanity rosters; the F2P/favor path (protagonist) is slower but stable. **The monetization satire and the hero-treatment satire are the same mechanical axis (§C1)** — the source's whole point.

---

## E. Economy Flow Summary (faucets → sinks)

| Faucet | Feeds | Sink |
|---|---|---|
| Floor clears | Gold, hero XP | Normal summons, facility upgrades |
| Daily Dungeons | materials, mat-XP | Promotion, crafting |
| Ruins / anchors / achievements | Gems | Advanced summons, gifts, pay-to-skip |
| Synthesis | Soul Stones | crafting (Upgrade Stones) |
| Real money (§D3) | Gems (bulk) | everything, accelerated |

Balance target: a F2P Master progresses **steadily but slowly**; the predatory layer compresses time, never unlocks unique power — so fairness holds while the satire lands.

---

## F. Interface (what Layer 3 reads & writes)

| Direction | With | Detail |
|---|---|---|
| Reads | Layer 0 | Sanity/Favorability axes; stat effects of buffs |
| Reads | Layer 1 | gacha/promotion/synthesis costs & sinks; whale-bait flag |
| Reads | Layer 2 | floor/mission reward hooks; Daily-Dungeon & Merchant content; raid drops |
| Writes | Layer 1 | material supply for Promotion/crafting; facility effects on synthesis/training |
| Writes | Layer 2 | reward *amounts* now defined (§A2) |
| Writes (deferred) | Layer 4 | Crack-of-Time PvP unlock (Lv20), whale-guild threats, account-deletion timing, PvP permadeath boundary (Open Q4) |

---

## G. Open canon notes folded in

- Open Q6 → **two** systems: Probability Interference (passive, §D1) + Intervention Points (active, §D2).
- "Repetitive gifts lower favorability" → diminishing-returns gift economy (§C1).
- "Master plays minigames; can be called incompetent" → optional minigames with auto-resolve (§C2).
- "Ruins yield Gems from sector 8" → Gem faucet (§A1).
- "Compulsion magic / whales / monthly package" → §D3 (modeled as satire, money simulated).
- "Time dilation 1 Earth day = 3 world days" → world-time build/recovery timers (§B2).
- 6-month inactivity deletion → flagged via PI decay (§D1); exact rule = Layer 4.
