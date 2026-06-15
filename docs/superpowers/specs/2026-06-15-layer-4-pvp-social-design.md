# Pick Me Up! — Layer 4: PvP & Social Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-15
> **Scope:** The competitive/social capstone — PvP invasions, the kidnap-chain, sector matchmaking, tournaments, guilds, server wars, and the consolidated permadeath + account-lifecycle model.
> **Depends on:** Layer 0 (combat sim, CP), Layer 1 (synthesis = the permadeath route), Layer 2 (raid bosses, tournament formats), Layer 3 (Crack-of-Time unlock, Probability Interference, predatory layer).
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md`. **Stance:** playability-first; hard canon anchors inviolable.

Layer 4 is the smallest, most self-contained layer. It resolves the **last open question (Q4)** and the final gaps (PvP rules, sector matchmaking, lifecycle), reusing systems already built below rather than inventing new permadeath or power sources.

---

## Design decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| PvP vs permadeath (Open Q4) | **Kidnap-chain — no direct permakill** | PvP defeat never permakills; the only PvP permadeath route is capture → captor *synthesis* (Layer 1). Honors the canon Lv40 protection line + "kidnapped, enslaved or synthesized"; keeps one coherent permadeath model |

---

## 1. PvP Access & the Invasion Model

**Opt-in via the canon gate.** PvP unlocks with the **Crack of Time & Space** (Master Lv20, Layer 3 §B3), requiring the canon prerequisites: a **4★ Magician-class hero + Airship**, materials, and research level.

**Core tradeoff (canon):** opening the dimensional rift grants Gem/Ruins income and inter-lobby hero dispatch — **but exposes the base to invasions.** Opening it is the player's choice; kept shut → no rift rewards, no raid risk. PvP is a deliberate risk/reward step, never forced.

**Offline defense (canon autonomous heroes):** raids while offline are resolved by your **preset defense parties** auto-battling via the Layer 0 sim, backed by lobby defenses — storeroom guards, traps, **evacuation routes**, the dimensional gate.

**Anti-grief grace:** after a successful defense or a loss, a base gains a short **protection shield** (no re-raid) to prevent farming.

---

## 2. Invasion Resolution & the Kidnap-Chain

A raid dispatches up to **3 parties / 15 heroes** (canon server-war scale) into the target lobby; defender auto-parties + lobby defenses resist.

**Spoils (canon):**
```
storerooms        → Gold + materials
defeated defenders → KIDNAP (captured, NOT killed)
```

**The kidnap-chain (Open Q4 resolved):**

| Defender level | On defeat | On capture |
|---|---|---|
| **Below Lv40** (Hero Protection, canon) | **penalty only** — permanent stat/skill drop | protected: auto-returned; **cannot be synthesized** |
| **Lv40+** (full stakes) | may be captured | captor may **ransom-hold or synthesize → permadeath** (Layer 1 §4) |

The **Lv40 boundary** (Layer 3 §B3) is exactly the line above which the kidnap→synthesis permadeath chain is possible. Below it, PvP never permanently removes a hero.

**Recovering a captured hero (Lv40+):**

| Path | Mechanic |
|---|---|
| Ransom | pay Gems/Gold to return the hero |
| Counter-raid | invade the captor's lobby and free them before synthesis (canon "defend with parties and counter-raid") |
| Clock | captured hero remains held until ransomed, rescued, or synthesized — synthesis is the only permanent outcome |

All PvP permadeath routes through one existing system (Layer 1 synthesis); kidnapping is tense-but-recoverable, not an instant loss.

---

## 3. Sector Matchmaking (closes Gap 16)

```
sector = bucket of 100 Masters at similar TOWER PROGRESS (canon "sectors of 100")
reassigned every 10 floors cleared (canon — "balances low vs high levels")
```

You're continuously re-bucketed with floor-band peers: no farming by far-ahead Masters, no preying on beginners. **CP (Layer 0 §4.1)** is the fine-grain balancer within a sector.

| Scope | Who | Channel |
|---|---|---|
| In-sector | your ~100 peers | invasions, local ranking, tournament brackets |
| Cross-sector | beyond your bucket | only via guilds & server wars (§4) |
| Server-wide | everyone | the global **player rank** overlay (canon ranks 1–5 = the floor-80 tier, a class above all) |

The server-wide rank sits atop sectors — the prestige ladder (canon "only 5 cleared past floor 80"); sectors are the day-to-day matchmaking unit.

---

## 4. Tournaments, Guilds & Server Wars

**Tournaments (Layer 2 §5.4 deferral resolved):** the named formats — Battle Royale, Party Raid, Team Game, Pair Game, Deathmatch — run as **bracketed events within sector/CP band**. Ranking-scored (Gems, materials, prestige). Below-Lv40 protection and no-direct-permakill (§2) apply, so they're competitive, not roster-destroying.

**Guilds (canon social unit):** player groups for shared content + cross-sector reach.
- Guild raids (co-op raid bosses — a Book-of-Reverse-Heaven source, Layer 2).
- Guild storehouse / mutual aid.
- **Whale guilds** (canon 단결회/카이저 — PKers spending millions): modeled as **endgame antagonist guilds**. Their power comes from the Layer 3 §D3 predatory layer → brittle high-Sanity-cost rosters (§C1), beatable by well-bonded F2P play. Reinforces the source's thesis.

**Server wars (canon Niflheim 130-0):** large-scale **guild-vs-guild / server-vs-server** PvP — the rankers' arena. Scheduled mass-army events at the canon 20,000-hero / 427-airship scale; records drive server prestige and the global ladder (§3).

---

## 5. Permadeath Edge Cases & Account Lifecycle (closes Open Q4 + Gap 24)

### 5.1 Every permadeath source, consolidated (whole-game master table)

| # | Source | Permanent? | Scope | Rule |
|---|---|---|---|---|
| 1 | Tower death | ✅ | any hero | Layer 2 §5.5 (`encounterContext = TOWER`) |
| 2 | Synthesis | ✅ | sacrificed hero | Layer 1 §4 |
| 3 | PvP kidnap → captor synthesis | ✅ | **Lv40+ only** | §2 — routes through #2 |
| — | PvP defeat below Lv40 | ❌ | penalty only | permanent stat/skill drop; hero recoverable |
| — | PvP capture below Lv40 | ❌ | protected | auto-returned; cannot be synthesized |

**No revival, ever** (canon); no Intervention Point spend can undo death (Layer 3 §D2). Three permadeath sources total — all specified below Layer 4; this layer only adds the conditional PvP route and confirms the Lv40 line.

### 5.2 Account lifecycle (canon)

```
one account per Master · rerolling impossible (canon)
active play → Probability Interference sustained (Layer 3 §D1)
inactivity  → PI decays
PI zero, sustained 6 months → waiting room greys → account/lobby DELETED (canon "gray towers")
```
Account deletion is the only whole-roster erasure — purely an inactivity consequence, tied to the existing PI meter.

### 5.3 Win / lose terminus (floor 90/100)

| Floor | State | Outcome |
|---|---|---|
| **90** | world-destruction gate | naive "clear" triggers the canon omnicide — a **lose/bad-end branch** (that world ends). Intended path = the **subversion** (break/refuse the win condition): a boss-arc + narrative decision. |
| **100** | true summit | defeating the Tell-tier final boss = **WIN** (save the world / return to Earth — canon goal). |
| post-100 | endgame | account persists; **Transcendent** content (the 7★ absorption endgame, Layer 0 §3.2). |

F90 is a fork the player can fail; F100 is the win-state. Both are narrative terminal states atop the Layer 2 tower — Layer 4 defines what *winning*, *losing the world*, and *losing the account* mean.

---

## 6. Interface (what Layer 4 reads & writes)

| Direction | With | Detail |
|---|---|---|
| Reads | Layer 0 | combat sim & CP (matchmaking, raid resolution) |
| Reads | Layer 1 | synthesis (the kidnap-chain permadeath route); party structure (≤3 parties) |
| Reads | Layer 2 | tournament formats; raid bosses; tower win-state floors |
| Reads | Layer 3 | Crack-of-Time unlock (Lv20); Probability Interference (lifecycle); predatory layer (whale guilds) |
| Writes | Layer 1 | captured-hero state (held/ransom/rescue) |
| Writes | Layer 3 | ransom Gem/Gold flows; PvP/tournament reward amounts |

Layer 4 introduces **no new permadeath source and no new power source** — it composes systems already defined below. That self-containment is by design.

---

## 7. Open canon notes folded in

- **Open Q4** → kidnap-chain (§2, §5.1): below-Lv40 penalty (canon) + Lv40+ capture→synthesis as the sole PvP permadeath route.
- "Crack of Time exposes base to invasions" → opt-in PvP gate (§1).
- "Raiders kidnap heroes, later enslaved or synthesized" → §2 kidnap-chain.
- "Sectors of 100, change every 10 floors" → §3.
- "Whale guild 단결회/카이저 PKers" → §4 antagonist guilds.
- "Server wars (Niflheim 130-0)" → §4.
- "6-month inactivity deletion / gray towers" → §5.2 via PI decay.
- "Floor 90 destroys the world / floor 100 goal" → §5.3 terminus.
