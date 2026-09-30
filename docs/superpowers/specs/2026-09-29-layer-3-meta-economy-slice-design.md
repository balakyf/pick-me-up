# Layer 3 — Meta-Economy Slice · Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layer:** Layer 3 (`2026-06-15-layer-3-meta-economy-design.md`).
> **Already built by earlier slices:** Gold/Gems, Daily Dungeons, facility upgrades, Master Level,
> Sanity, Banquets, the gem-based Advanced pool (pulled forward by the Layer 1 completion slice).
> **This slice builds the rest:** Favorability + gifts (§C1), minigames (§C2), Probability
> Interference (§D1), Intervention Points (§D2), the predatory layer (§D3, money simulated) and the
> **Crack of Time & Space** unlock at Master Lv 20 with its Ruins gem faucet (§A1, bible).

## Canon anchors (inviolable)

- Heroes are real people. **Favorability** is tracked and affects responsiveness; **repetitive
  gifts lower it**; gifts and banquets raise it.
- Intervention Points grow as a hero's rank and bond with the Master deepen. **Nothing revives
  the dead.**
- "More content unlocks as floors are cleared, via probability interference." A world without a
  player risks vanishing.
- **Crack of Time and Space unlocks at Master Lv 20+.** It needs a 4★ magician and a large
  investment, and it gives access to the Ruins, which yield gems.
- Monthly package: **150 gems + 10,000 gold per day for 30 days**. Whales, compulsion and
  whale-bait star inflation (Sirris). Money here is **simulated**: this layer models the
  source's satire and never takes a real payment.

## 1. Favorability (§C1)

`OwnedHero.favor` 0–100, starts at 35 (Neutral). Tiers: Wary ≤20 · Neutral ≤40 · Warm ≤60 ·
Devoted ≤80 · Bonded.

| Effect | Rule |
|---|---|
| Combat | Wary ×0.95 stats **and ignores the focus directive** · Warm ×1.03 · Devoted ×1.06 · Bonded ×1.10 |
| Rises | +1 for each surviving hero on a floor clear · +2 to everyone from a Banquet · gifts |
| Falls | −5 to each witness when an ally permadies or is synthesized |
| Rebellion | Wary **and** Sanity < 30: a seeded chance (by how low both are) that the hero refuses to deploy |

**Gifts** (`GIVE_GIFT`): six categories. Each hero has a seeded **liked** category (×2) and
**disliked** one (−3 flat). Giving the **same gift in a row** decays it
(×0.5 each repeat), and from the third repeat it turns **negative**. Gold gifts are small;
gem gifts are high-rank and swing more.

## 2. Probability Interference — passive, account-wide (§D1)

`meta.pi` rises with floor clears (+2, first clear +5), the daily login (+10) and the **Hall of
Magic** (a new facility: +PI per world-hour by level). The player never spends it. After 6
world-days without any command, PI decays 5% per idle world-day (the world fading; the
account-deletion rule belongs to Layer 4). **PI thresholds unlock content:** Hall of Magic build
(PI 30) · Crack of Time (PI 200).

## 3. Intervention Points — active, per-hero (§D2)

`OwnedHero.ip` grows by +1 per promotion and +2 the first time the hero reaches Devoted and again
at Bonded (`bondTier` remembers the highest tier reached). Only a **Devoted+** hero can spend its
IP (`INTERVENE`):

| Intervention | IP | Effect |
|---|---|---|
| Reveal a hidden objective | 1 | the next unfound hidden objective shows its hint |
| Peek at a weakness | 1 | the current floor's boss keywords and elements are shown |
| Nudge probability | 3 | the next Normal summon rolls its star twice and keeps the better |
| Guarantee an action | 3 | the hero's first strike in its next tower battle lands ×2 (`opener`) |

## 4. Minigames (§C2)

One interface: `performance` 0–1 from the UI, or the Master's tracked skill when the minigame is
skipped (auto-resolve). Playing raises the skill (+0.02 per play, capped at 0.9).

- **Blacksmithing** = equipment grade-up (§A3). `UPGRADE_EQUIPMENT { itemId, performance? }`
  costs gold and stones. Success odds are E→D 90% · D→C 75% · C→B 60% · B→A 40% · A→S 25%
  · S→SS 12% · SS→SSS 5%, scaled by ×(0.7 + 0.6 × performance). A seeded roll decides; a failure
  consumes the materials but **not the item**.
- **Ballista** (canon F20: the tower ballista breaks Halgiraf's scales). On floors whose anchor
  declares `minigame: 'ballista'` (F20, F35, F85), `ATTEMPT_FLOOR { ballista? }` opens the
  battle with the boss already wounded: up to 30% of its HP, by performance.

## 5. The predatory layer (§D3, money simulated)

- **Gem packages** at simulated prices; `meta.wallet.spentUsd` totals what the Master "spent".
- **Monthly package**: +150 gems and +10,000 gold on each world-day it is claimed, for 30 days.
- **Daily login**: +50 gems. The streak builds a 7th-day bonus and **resets if a world-day is
  missed** (FOMO).
- **Today only**: one discounted package rotates each world-day.
- **Frustration deal**: after a long dry streak (the Advanced 4★ pity ≥ 20) a "you're so close!"
  bundle is offered.
- **Whale-bait inflation** (Sirris): after a dry Advanced streak, a 3★ pull may be *shown* as 4★
  (`displayStar`). The engine always uses the true star, and the lie is revealed ("the goddess
  lies") at Master Lv 25 or when the hero hits its true level cap.

## 6. Crack of Time & Space (Master Lv 20)

`OPEN_CRACK` needs Master Lv 20, PI 200, a living **4★+ mage** (the canon magician), 50,000 gold
and 40 Promotion Stones (the canon "tons of materials"). Once open:
**Ruins expeditions** (`DISPATCH_RUINS { heroIds }`, 1–3 heroes) take 4 world-hours; the heroes are
away (they can't deploy, train or promote). They return with gems that scale with the team's CP,
and sometimes a rare stone. Opening the rift also exposes the lobby to invasions, which is Layer 4.

## 7. Data (schema v7 → v8)

```
OwnedHero += favor, bondTier, ip, gift: { last, streak }, displayStar?, blessed, expedition
MetaState += pi, lastActiveWorldDay, login: { lastDay, streak }, monthly, wallet, skill,
             crackOpen, revealedHidden, peekedFloors, nudge
FacilityId += 'hallOfMagic'
Command += GIVE_GIFT · INTERVENE · UPGRADE_EQUIPMENT · BUY_PACKAGE · CLAIM_LOGIN · CLAIM_MONTHLY
           · OPEN_CRACK · DISPATCH_RUINS;  ATTEMPT_FLOOR += ballista?
```

## 8. Testing

Favor tiers and combat multipliers · Wary ignores focus · gifts (liked/disliked/repeat decay) ·
rebellion only when Wary and broken · PI accrual, decay and unlocks · IP accrual and each
intervention (no revive path exists) · the grade-up odds ladder, performance scaling and
failure keeping the item · ballista pre-damage · packages, monthly, login streak reset,
frustration deal, whale-bait reveal · crack gates and expeditions · migration v7→v8 · UI smoke
tests.
