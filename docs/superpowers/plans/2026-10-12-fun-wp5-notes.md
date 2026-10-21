# WP5 — Legacy: Echo bequest, Nemesis records, New Arrivals and the Memorial (notes)

> **Branch:** `fun/wp5-legacy`, based on `3b2ce0a` (WP0). **Spec:** `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3 S21, S22 (records), S23 and §4.6.
> **Gates:** `npm run typecheck` clean · `npm test` 54 files / 932 tests green (WP0 baseline 51 / 887) · `npm run build` OK (only the existing chunk-size warning).

## What the player gets

The goal: a death should leave something behind, and give the player a reason to come back.

1. **An Echo from every hero who climbed.** When a hero falls, the results screen shows *What they leave behind*:
   - "✦ Pass on Mira’s resolve", with the gift ("Echo of Mira · +10% P.ATK · Power Strike +1 if known");
   - up to 3 heirs, closest friend first, each with their bust, their bond to the fallen ("Closest friend", "Their friend", "Fought beside them"), what *they* would receive, a ★ when the stat is also their own strength, and how many echoes they already carry (n/3);
   - one tap passes it on. The card becomes the heir’s vow: "Kael now carries the echo of Mira." / “I carry Mira with me.”
   - A wipe can leave five Echoes, so the results card shows one at a time ("Also waiting for an heir: Sene, Aldo. One at a time, or later in the Memorial."). Unclaimed Echoes wait in the Memorial and never expire.
   - The heir gets a permanent +10% to the fallen’s best stat (in every fight, the scout and PvP, through `buildCombatUnit`), plus +1 level to the fallen’s signature skill when the heir knows it. They gain the memory "Carries the echo of Mira", talk about it in the lobby ("I carry Mira with me. Every stair, every swing."), and Isel’s letter reports it.
2. **The killer is remembered.** The grave records who struck the blow. A rank-and-file killer becomes **"Mira’s Bane"**, waiting 3-7 floors up (never on an anchor, the F36-40 loop or the world’s end). The results card says: "☠ The Knight that struck Mira down is marked now: Mira’s Bane. It waits on floor 16." When WP3’s revenant is defeated, every friend of the fallen and every hero who fought it remembers ("Avenged Mira"), friends’ grief eases, they say so ("That one was for Mira."), and the chronicle writes "Kael struck down the Knight that killed Mira. Mira is avenged."
3. **A new face answers the bell.** A death that leaves fewer than 5 living heroes earns a New Arrival token (max 2). "🔔 A new face answers the bell. A free summon, 2★ or better. [Open the door]" on the results card and in the Memorial; the newcomer is introduced in place ("Ines Varga answers the bell." with bust, stars and class). Gold is untouched.
4. **A Memorial that teaches.** The Memorial now shows, in order:
   - the obelisk line: "🕯 The tower remembers: +2% to every stat. Each name on the obelisk lends the living +0.5%, up to +5%.";
   - *Echoes waiting for an heir* (bequest cards);
   - *New faces at the bell*;
   - *Banes*: "Mira’s Bane — Knight · Lv14 · Struck Mira down on floor 12 · waits on floor 16" (or "still at large in the tower", or "✓ Avenged at last");
   - *Echoes carried*: each heir with their Echo badges;
   - the graves, each a plaque: cause and service (as before), **How they died** ("struck down by the Knight (Lv14)"), **What it taught** ("Humanoids: the scout now points out their weakness. Knight ⛰️: answer it with 🍃."), **Their echo** ("carried by Kael" / "waiting for an heir"), a **eulogy** from their closest living friend in that friend’s voice, and their last words.
5. **French** for every new string.

## Files

**Engine (new)**
- `src/engine/legacy/echo.ts`: leaf module used by `unit.ts`: `echoesOf`, `echoPct`, `echoSkills`, `plaquePct`, `legacyPct`, `legacyExtraPct`, `ECHO_STATS`, `roundPct`.
- `src/engine/legacy/records.ts`: pure builders for `lifeReact` and shared rules: `killingBlow`, `fallenKiller`, `killerOf`, `MemorialRecord`/`FallenKiller`, `templateByName`, `isRoamingTemplate`, `isRevengeFloor`, `revengeFloorFor`, `revenantName`, `nemesisFor`, `waitingNemeses`, `leavesEcho`, `bestEchoStat`, `signatureSkillId`, `canInherit`, `rankHeirs`, `pendingEchoFor`, `heirOptions`, `fragmentTakes`, `counterElement`, `familyLearned`, `livingCount`.
- `src/engine/legacy/legacy.test.ts` (31 tests).

**Engine (changed, owned)**
- `src/engine/legacy/legacy.ts`: `bequeathEcho` + `bequeathRefusal`, `claimRecruit` + `claimRecruitWithHero` + `recruitRefusal`; re-exports echo/records. WP0 signatures unchanged (`legacyPct`, `echoPct` moved to `echo.ts`, same signatures, re-exported).
- `src/engine/life/react.ts`: deaths block (Echo, killer on the grave, Nemesis, lesson, bell), revenge block, clones `echoes`.
- `src/engine/unit/unit.ts`: `buildCombatUnit` applies the hero’s Echoes (stat pct + skill fragments). A hero without Echoes is byte-identical (tested).
- `src/engine/life/life.test.ts`: 2 tests appended.

**UI (new)**
- `src/ui/legacy/BequestCard.tsx` (+ `heirOf`), `RecruitBell.tsx`, `EchoList.tsx`, `legacyText.ts`, `legacy.css`.
- Tests: `src/ui/legacy/legacyText.test.ts` (6), `src/ui/legacy/legacy.smoke.test.tsx` (6, jsdom: results bequest flow, Memorial from the real App menu, the bell, the empty lawn, French).

**UI (changed, owned)**
- `src/ui/legacy/LegacySlot.tsx`, `src/ui/legacy/MemorialPanel.tsx` (`GraveList` kept with every string WP0’s test asserts; `BaneList` exported), `src/ui/life/speech.ts` (`MEMORY.inherited`, `MEMORY.avenged`, new `eulogy()`, richer `'revenge'` chronicle line), `src/ui/i18n/frLegacy.ts`.

**Changed outside the owned list (one file, see Deviations):** `src/engine/store/wp0Commands.test.ts`.

## Rules and numbers (all from `TUNING.legacy` unless noted)

- Echo: `echoPct` 0.10 of the fallen’s **best relative stat** = the stat their build leans into most versus a balanced hero with the same attribute total (flat HP/SPD terms removed so all six compete fairly; ties: P.ATK, M.ATK, HP, P.DEF, M.DEF, SPD). Skill fragment = the fallen’s highest-level skill (`skillEcho`); +1 level applies while the heir knows that skill (also if they learn it later); the skill module clamps at the grade cap.
- Heirs: `heirCandidates` 3, sorted by affinity to the fallen, then level, then id; alive, not captive, under `echoMaxPerHeir` 3. `heirOptions` refills from the next closest living heroes when a suggested heir dies, is captured or fills up, so an Echo never strands (a newcomer can inherit after a full wipe).
- Nemesis: killer = actor of the last `hit` on the hero before its `death` event in `FloorResult.result.log` (`lifeReact` receives the FloorResult on `ATTEMPT_FLOOR`). Template found by display name (the log carries no template id). Only templates from an act’s filler pool become Banes. `revengeFloor` = died + `nextInt(rngFor(seed,'nemesis',heroId), 3, 7)`, sliding to the next valid floor in the window (wrapping), else the first valid floor after it; valid = ≥3, not a multiple of 5, not in `ANCHORS`, not in the loop (36-40), below `worldEndFloor`. `maxActive` 3 waiting; one killer unit names only its first victim per battle. Id: `nem_<heroId>`.
- Revenge (on `FloorResult.nemesisDefeated`, once per Nemesis): status → `'avenged'` (also set here defensively; idempotent with WP3), friends of the fallen get `'avenged'` (weight 75) and −30 grief; other survivors who fought get `'avenged'` (weight 50); chronicle `'revenge'` with `heroIds` = survivors and `detail` = the Nemesis **id**.
- New Arrivals: a command in which a hero died (cause battle or captor) leaving fewer than `rosterBelow` 5 living, free heroes adds 1 token, capped at `maxTokens` 2. `CLAIM_RECRUIT` = `summon(state, {minStar: 2})`, funded and charged like the mercy pull (gold unchanged).
- Plaques: `legacyPct = min(capPct 0.05, graves × pctPerPlaque 0.005)`.
- Lessons: the killer template’s family, sorted and unique.

## Deviations from the spec, and why

1. **Echo = stat *and* fragment, not stat *or* fragment.** S21 says "+10% of their best stat, or a fragment of their highest-level skill as +1 skill level if the heir knows it". I give the stat always and add the fragment as a bonus when the heir knows the skill. Reason: with "or", picking an heir who knows the skill would *trade* +10% for +1 level, a choice the player cannot evaluate; with "and", knowing the skill is a visible, strictly positive match ("Power Strike +1" on that heir’s button), which makes the heir choice a clear, readable decision. Power is small: procedural heroes below 4★ have no skills, and the cap of 3 echoes per heir holds.
2. **Only heroes who climbed leave an Echo.** A hero who dies in battle always does; one lost to synthesis or a captor does only if they ever fought a floor (`bestFloor ≥ 1`). Without this, pulling 1★ fodder and synthesising it would mint +10% Echoes for gold. §4.6 says synthesis and captor deaths "create echoes"; they still do, for veterans.
3. **Tokens only after a death.** S23 says "after any battle that leaves fewer than 5 living heroes". Read literally, a small roster would earn a free 2★ pull on every win. I grant the token when a death leaves the roster below 5 (as §4.6 places it, in the deaths block), and never for synthesis (a deliberate sacrifice).
4. **Anchor bosses do not become Banes** (e.g. the F10 Lv999 Creature, Halgiraf). Their floor already is the rematch, and injecting a boss template on a normal floor ×1.25 would be a cliff. The grave still names them, and the lesson still counts.
5. **`'revenge'` chronicle `detail` is the Nemesis id**, not the Bane’s name (WP0’s comment). The name is English and untranslatable once stored; `chronicleLine` looks the id up and renders "Kael struck down the Knight that killed Mira. Mira is avenged." in either language. It still falls back to WP0’s two lines for a plain name or none.
6. **The killer lives on the grave as an optional extension field** (`MemorialRecord = FallenRecord & { killer? }`, written by `lifeReact`, read with `killerOf`). `FallenRecord` is in the shared `types.ts`; the extension type-checks without touching it, old saves simply have no killer. See request 1.
7. **`wp0Commands.test.ts` edited** (not in my owned list): its BEQUEATH_ECHO and CLAIM_RECRUIT cases asserted the WP0 stubs throw "not built yet", which building the package necessarily breaks. I changed only those two cases to assert the commands reach `bequeathEcho:` / `claimRecruit:` (refusals). WP3 will need the same change for CHOOSE_DOOR (a separate line).
8. **`echoPct` is applied inside `buildCombatUnit`**, as S21 says. `legacyExtraPct(state)` (new, plaques only) is what WP3 should pass as `extraPct`. Passing `echoPct(hero)` as well would double-count; this is documented on both functions.

## SHARED-FILE REQUESTS (for the lead’s integration pass)

1. **`src/engine/types.ts`**: add `killer?: { templateId: string; name: string; element: Element; level: number; family?: string }` to `FallenRecord` (optional; no migration). Then `MemorialRecord`/`FallenKiller` in `engine/legacy/records.ts` can alias it. Why: "How they died / What it taught" needs the killer per grave.
2. **`src/engine/types.ts` + `src/engine/combat/combat.ts` (WP3)**: add `templateId?: string` to `CombatUnitInit`, filled from the unit’s template. The killer is currently matched by display name (`templateByName`), which works for every current template (names are unique) but breaks if an enemy is ever renamed on the field. `fallenKiller` already recognises a revenant by `revenantName`.
3. **`src/ui/life/lifeWindows.tsx` (WP6)**: in `HeroProfile`, mount `<EchoList hero={hero} />` (from `ui/legacy/EchoList.tsx`) under the profile header, so the heir’s "✦ Echo of Mira · +10% P.ATK" badge shows on their profile (S21 "a permanent, visible Echo of Mira on their profile"). Today it shows in the Memorial’s *Echoes carried* list and as the "Carries the echo of Mira" memory on the profile.
4. **`src/ui/HeroCard.tsx` (WP1)**, optional: the same `<EchoList hero={hero} />` under the skill list.
5. **WP3 (`tower.ts`)**: name the injected revenant with `revenantName(nemesis)` from `engine/legacy` so a Bane that kills again is recognised; pass `legacyExtraPct(state)` (not `echoPct`) as `extraPct`; inject a waiting Nemesis on the first eligible floor **≥** `revengeFloor` (not only `===`), or a Bane whose floor the player skipped past would wait forever and hold one of the 3 `maxActive` slots. Lessons: `familyLearned(state, family)` and `counterElement(el)` are exported for the scout.
6. **WP7 (`ui/shell/goals.ts`)**: the goal tracker can read `life.legacy.recruitTokens` ("🔔 A new face waits at the bell → Memorial") and `life.legacy.pending` ("Pass on Mira’s echo → Memorial"). S23 says the token is "claimed from the Memorial or the goal tracker"; the claim UI is `<RecruitBell state store/>`.
7. **WP6 (Lights Out / WelcomeBack)**: a waiting Bane is a natural teaser: `waitingNemeses(state)` + `baneName(n)` (UI, translated) → "Mira’s Bane waits on floor 16."
8. **WP4 (results)**: the "Avenged!" banner is yours (S22). `baneName(n)` in `ui/legacy/legacyText.ts` gives the translated name. LegacySlot dispatches BEQUEATH_ECHO / CLAIM_RECRUIT from the results card (after the battle, so `store.revise` is no longer in play); if the results screen ever coexists with a live `BattleScene` that can still give orders, gate the slot until playback ends.
9. **FR, any owner (FR_UI)**: the element labels `Fire`, `Water`, `Wind`, `Earth`, `Light`, `Dark`, `Physical` (`ELEMENT_VIS[*].label`, already passed through `t()` by TowerScreen) have no French. I avoided them (glyphs only) rather than define them in `frLegacy` and collide with whoever adds them.

## Known gaps

- No browser was available in this container, so the new screens were verified with jsdom smoke tests only (structure, text, clicks, French), not by eye. `legacy.css` uses only the shared tokens and the existing pixel-window idiom; the results slot is capped at 46vh and scrolls, so the Onward button stays reachable after a full wipe.
- Display CP (`cpOf` in `ui/bits.tsx`) does not include Echoes or plaques; combat, scout and PvP do.
- The revenant itself (injection, ×1.25, red nameplate, reward, "Avenged!" banner, scout line) is WP3/WP4/WP2 work; this package records it and reacts to `FloorResult.nemesisDefeated`. Until WP3 lands, Banes wait forever (they are shown, and capped at 3).
- The "What it taught" line promises that the scout points out the family’s weakness; that reading of `life.legacy.lessons` is WP3’s (S23). The counter-element hint next to it is true today.
- Balance: Echo +10% ×3 per heir and plaques +5% are first-pass TUNING values; the lead’s balance pass should look at them with Last Stand.

## Review (independent reviewer, 2026-10-13)

Reviewed the full diff `3b2ce0a...fun/wp5-legacy` against §4.0, §4.6, S21, S22 and S23 and the WP0 contract sheet. I wrote throwaway probes and then deleted them: an i18n extractor over every `t('…')` and string table in the package, real wipes on F23, F37 (loop), F41, F60, F88 and F89, revenge floors at the loop and the world's end, the best-stat spread over 295 heroes, and jsdom renders of the results card and the Memorial in English and French.

**Verified (no change needed)**
- Every acceptance item in §4.6 has an implementation and a test: one pending Echo per death with heirs sorted by affinity, exactly +10% on `buildCombatUnit`, the per-heir cap, Nemesis floors in [died+3, died+7] that skip anchors, the loop and F≥90, recruit tokens capped at 2 with a free pull of 2★ or better, the plaque cap, purity under deep-freeze, determinism, and `store.test` `core()`.
- Determinism: randomness uses only the new `'nemesis'` stream, with one draw per fallen hero. Lessons are stored sorted and `pct` is rounded. The guard test is green.
- Edge cases behave. A full wipe offers the one living hero, or nobody, and then the newcomer the bell brings. A F88 or F89 death leaves no Nemesis but still teaches its lesson. A F37 death haunts F41 or later. A hero lost to a captor or to synthesis gets no Nemesis. NPC escorts and hero-side actors never count as killers. Skill fragments above the grade cap are clamped by `skillMultAt` and `hpCostAt`.
- i18n: every new string has French with the same placeholders. Every enemy in the roaming pools, every skill name, family label and stat label has French too.
- Smoke hygiene (§4.0.7): nothing opens on its own and nothing dispatches on its own. The new buttons ("Open the door", the heir buttons, the carrier links) contain none of the reserved words, and they only appear after a death or in the Memorial. On the results card, dispatching happens after playback, so `revise` is no longer in play.
- Best-stat spread over 295 heroes: P.ATK 104, SPD 74, HP 64, M.ATK 27, P.DEF 15, M.DEF 11. Echoes vary, so they don't feel like a flat +10% P.ATK.

**Issues found and fixed** (commit `fix(legacy): review fixes — …`)
1. **The obelisk bonus could be bought with gold.** `legacyPct` counted every grave, including 1★ fodder fed to synthesis. Ten Normal pulls and one synthesis gave the full +5% to every stat, and "the tower remembers" stopped meaning anything. A grave now earns a plaque only if the hero fell in the climb, or was a veteran (`bestFloor ≥ 1`) sacrificed to synthesis. This is the same rule as `leavesEcho`. New exports `earnsPlaque(rec)` and `plaqueCount(state)`; `legacyPct(state)` keeps its WP0 signature. The obelisk line now reads "Each hero who fell in the climb lends the living +0.5%, up to +5%." and stays silent until a plaque counts. Tested. *Deviation from S23's literal "read from `life.memorial.length`"*: to restore the literal reading, make `plaqueCount` return `memorial.length`.
2. **French showed English decimals** ("+2.5 %"). New `pctNum()` in `legacyText.ts` gives "2,5" in French. It is used on the results line and the obelisk line. Tested.
3. **"No one is visiting." had no French.** It is the Memorial's HereNow empty line, in a WP5-owned panel. Added to `frLegacy` as "Personne ne se recueille ici."
4. **The Memorial's bequest cards each said "An unclaimed echo waits in the Memorial."** That line is useless once you are in the Memorial, and after a wipe it was repeated five times. `BequestCard` takes `inMemorial`, and the Memorial passes it. Tested in the smoke file.
5. **Echo badges used `white-space: nowrap`.** In French, three Echoes with skill fragments ran past a narrow profile or Memorial panel. They now wrap.

**Remaining concerns (not fixed; for the lead)**
- **Ownership:** `src/engine/store/wp0Commands.test.ts` is outside §4.6's owned list. I kept the implementer's edit (two cases now assert the commands reach `bequeathEcho:` / `claimRecruit:` refusals) because the gates cannot pass without it: the WP0 test asserts the stubs throw "not built yet". It is recorded as SHARED-FILE REQUEST 10 below. WP3 needs the same change for CHOOSE_DOOR on a separate line, which should merge cleanly.
- **Plaques are not applied in combat yet.** No caller passes `legacyExtraPct(state)` until WP3's `tower.ts` does, but the results card and the Memorial already announce "+X% to every stat". The lead should confirm this lands in integration (request 5).
- **Revenant naming is English in the engine.** `revenantName()` returns "Mira's Bane" (straight apostrophe), and WP3 will put that string on the unit. The battle UI will show it untranslated unless WP2/WP4 render a Nemesis unit through `baneName()` (UI, translated). Request 11.
- **French elision:** "Écho de Islat" and "Le Fléau de Aaron" should be "d’Islat" and "d’Aaron". This is cosmetic. The `t()` placeholder rules leave no clean fix inside the package.
- **Two Banes can share a floor.** In a wipe probe, Islat's and Jenna's Banes both waited on F26. That is legal, but WP3 should expect more than one revenant per floor, or the lead could spread them.
- **A killer that died later in the same battle still becomes a Bane** (for example, the floor was won after the death). This follows S22 as written, but the lead may want a Bane to come only from a killer that survived the battle.
- **The recruit claim spends the Master's pending `nudge`.** `summon` consumes it. That is harmless (it helps the free pull) but may surprise players.
- Display CP (`cpOf`) still leaves out Echoes and plaques; combat, the scout and PvP include them.

**SHARED-FILE REQUESTS added by the review**
10. **`src/engine/store/wp0Commands.test.ts` (lead, or WP0's owner):** keep the WP5 edit to the BEQUEATH_ECHO and CLAIM_RECRUIT cases. Do the same for CHOOSE_DOOR when WP3 lands.
11. **WP2/WP4 (battle nameplate):** when a unit is a Nemesis (`BattleScene` `nemesisIds`), render its name with `baneName(n)` from `ui/legacy/legacyText.ts` rather than `unit.name`, so French shows "Le Fléau de Mira".

**Gates after review:** `npm run typecheck` clean · `npm test` 54 files / 933 tests green · `npm run build` OK (only the existing chunk-size warning).
