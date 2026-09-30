# Layer 1 Completion — Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layer:** Layer 1 (Hero Progression).
> **Closes the Layer 1 deferrals** left by the Skills, Equipment, Synthesis and Training slices:
> Engravings (§5.4), conditional/achievement/promotion skills (§2.1–2.2), the Transfer Station
> (§2.4 "crafted at the Transfer Station"), the Book of Reverse Heaven (§3.4/§5.5), and the two
> Synthesis follow-ups (grade-aware copy odds, a player-chosen rescue).
> Pulls one Layer 3 item forward: the **gem-based Advanced summon pool** (§1.1), because Normal
> tops out at 3★ and engravings are a 4★+ identity layer. Without it nothing could carry one.

## Canon anchors (inviolable)

- 4★ arrives with *intermediate skills + an exclusive weapon + an engraving*; 5★ with *advanced
  skills + an imprint + a private weapon* (bible rarity table). Gacha ceiling stays **5★**.
- Engravings are graded up to **S** and can be **evolved (각인 진화)**. True Black Dragon's Blood:
  A = brief invincibility, S = +20% defenses + invincibility. **2% acquire rate.**
- Skills unlock on level/floor conditions (Throwing Defense Lv11 · Siman Lv15 on F15 ·
  Incident Lv29). **Dragon Slayer** comes from killing Halgiraf and **cannot be trained**.
- Max Pain Tolerance evolves into **Battle Speed**; Sword-Shield Technique → **Intermediate
  Sword Technique**. The Transfer Station is the lobby's "skill transfer" facility.
- 6★→7★ needs the **Book of Reverse Heaven**, a raid-boss drop. A 7★ synthesizes at a much
  higher efficiency (η 0.25+).

## Decisions

| Question | Choice | Why |
|---|---|---|
| "2% engraving" vs "4★+ carry an engraving" | Every 4★+ **summon** carries one. The 2% is the odds of the legendary True Black Dragon's Blood among them. A hero **promoted** into 4★+ has a 30% chance to awaken one. | It matches both the bible's rarity table and its 2% figure. Summoned 4★ heroes are already rare, so 2% on top would make engravings practically unseen. |
| Engraving evolution | Each promotion of an engraved hero raises its grade by one step (C→B→A→S). | Promotion is already the "raise, don't roll" engine. |
| Passive skills | `SkillDef.passive`: a passive is never cast. It becomes keywords/stat bonuses at unit build and gains 1 use-XP per battle survived. | Most of the canon trained list is passive (Pain Tolerance, Insight, Flame Resistance, Throwing Defense). |
| Transfer Station | A new facility (ML4). It offers **Transfer** (move a skill between two living heroes; the donor forgets it) and **Fuse** (craft a merge one level early, or run a manual-only evolution). Both are instant and paid in gold. | This is what canon calls "skill transfer". It gives players a way to bring merge inputs together on one hero, which auto-merge alone can't do. |
| Book source | F20 Halgiraf **first clear** drops one Book (the only raid boss in the climbable tower). | Canon's El Cid drop is far beyond the slice. One book per account keeps 7★ as rare as canon intends. |
| 7★ absorption past Lv150 | Deferred. 7★ gets η = 0.25 now. | Needs a per-hero cap-bonus field, which belongs with the late-game tower. |

## 1. Advanced pool (gems)

- 150 ♦ per pull, 1,350 ♦ for a 10-pull. Rates 3★ 80 / 4★ 18 / 5★ 2.
- Rising Quality Floor: the 30th pull without a 4★+ is lifted to 4★+, and the 90th without a
  5★ is lifted to 5★. Its own counters and its own RNG stream (`gacha-adv`), so Normal pulls stay
  byte-identical.
- A 4★/5★ summon gets: the class skill + 1 (4★) / 2 (5★) random learnable skills, a bound
  **exclusive weapon** (B grade at 4★, A grade at 5★; element matches the hero; only that hero
  can equip it), and an engraving.
- Two authored 4★ cameos: **Anasis** (True Black Dragon's Blood, A) and **Kishasha** (Beast
  King's Heir, B).

## 2. Engravings

`OwnedHero.engraving: { id; grade: 'C'|'B'|'A'|'S' } | null`. The effects are keyword tags
(Layer 0 §2.6) plus optional % stat bonuses, resolved at unit build:

| Engraving | Effect (C → S) |
|---|---|
| True Black Dragon's Blood (2%) | `aegis`: negates the first 1/1/2/3 hits taken; S also gets +20% P.DEF/M.DEF |
| Beast King's Heir | `frenzy`: ×1.2/1.3/1.45/1.6 damage while below 50% HP |
| Sword Saint's Mark | `opener`: the first action deals ×1.5/1.8/2.2/2.6 |
| Blood Pact | `lifesteal`: heals 8/12/18/25% of damage dealt |
| Iron Oath | `guard`: −8/12/16/22% damage taken |

An engraving also adds CP (C 20 · B 40 · A 70 · S 110).

## 3. Keyword system completion (combat)

New tags: `aegis`, `frenzy`, `opener`, `lifesteal`, `bane {family}`, `guard {reduction, vs?}`.
The tags that already existed but did nothing are now wired: `immune {damageType}` (0 damage)
and `vulnerable {element}` (×1.5 from that element). None of them draws RNG. New log events:
`guard` (an aegis charge absorbed a hit) and `heal`. Enemy templates gain an optional `family`
(`dragon`, `undead`, `beast`, `humanoid`) for `bane`.

## 4. Skills

- **Passives:** Pain Tolerance (E; guard), Throwing Defense (E; guard vs archers/mages), Insight
  (D; +crit), Flame Resistance (E; guard vs fire), Battle Speed (C; +SPD), Dragon Slayer
  (B; bane vs dragons), Guardian's Oath (C; guard).
- **Conditional unlocks** (`SKILL_UNLOCKS`, checked after combat and after a promotion):
  Throwing Defense at hero Lv11, Siman (C, active) at Lv15 once F15 is cleared, Incident
  (B, active AoE) at Lv29.
- **Achievements** (`ACHIEVEMENTS`, checked after a win): Dragon Slayer (defeat Halgiraf),
  Guardian's Oath (win the F15 escort). Both are bound: they can't be trained or transferred.
- **Promotion skills** favour the hero's class skill first, then draw from the learnable pool.
- New `SkillProgress` kinds: `unlock` and `achievement`, shown on the results screen.

## 5. Transfer Station (facility `transferStation`, ML4)

| Action | Rule | Cost |
|---|---|---|
| Transfer | Donor → recipient. The donor forgets the skill; the recipient gets it at `level − 1` (the full level from station Lv5). Merges resolve. Grade ceiling by station level: 1→D, 3→C, 5→B, 7→A. Achievement skills are bound. | `drillGold[grade] × 3` |
| Fuse (merge) | A merge recipe whose inputs are both at ≥ `minLevel − 1`, one level earlier than auto-merge. | `drillGold[result grade] × 2` |
| Fuse (evolve) | Manual-only: max Pain Tolerance → Battle Speed; max Sword-Shield Technique → Intermediate Sword Technique (B). | same |

Heroes that are dead, promoting or training can't use the station.

## 6. Book of Reverse Heaven

`promotion.maxStar = 7`. The 6★→7★ promotion costs `{ bookOfReverseHeaven: 1 }` (no stones)
and takes 12 world-hours. F20's first clear drops one Book. A 7★ survivor transfers at η = 0.25.

## 7. Synthesis follow-ups

- Skill copy picks one missing skill, then rolls that skill's grade odds
  (F/E .35 · D .30 · C .25 · B .18 · A .10 · S .06 · U .03). The preview lists each
  candidate's odds.
- Salvage `rescue` can be chosen: `{ kind: 'skill', skillId }` or `{ kind: 'grade', attr }`.
  When omitted, the previous automatic rule applies.

## 8. Data (schema v5 → v6)

```
OwnedHero.engraving: HeroEngraving | null                      // null on migration
GachaState += advPity4, advPity5, advPullCount                  // 0 on migration
GameState.facilities.transferStation: FacilityState             // unbuilt on migration
EquipmentItem.exclusiveTo?: HeroId                              // optional, no migration
```

## 9. Commands

```
| { type: 'SUMMON'; pool?: 'normal' | 'advanced'; count?: 1 | 10 }
| { type: 'TRANSFER_SKILL'; donorId: HeroId; recipientId: HeroId; skillId: string }
| { type: 'FUSE_SKILL'; heroId: HeroId; result: string }
| { type: 'SYNTHESIZE'; …; rescue?: RescueChoice }
```

## 10. Testing

gacha (advanced rates, both pity floors, kit, bound weapon, Normal stream unchanged) ·
engravings (roll weights, evolution, unit keywords) · combat (each new keyword, immune/
vulnerable, no extra RNG draws) · skills (passives, unlocks, achievements, class promotion
draw) · transfer station (transfer, fuse, evolve, refusals) · promotion (7★ with a Book) ·
tower (F20 first-clear Book) · synthesis (grade odds, chosen rescue) · account (v6 fresh and
v5→v6) · store (new commands) · UI smoke (Summon tabs, Transfer Station window).
