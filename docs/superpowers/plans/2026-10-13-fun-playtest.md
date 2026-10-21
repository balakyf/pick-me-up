# Fun-and-return overhaul — first real-browser playtest (2026-10-13)

Branch `fun/playtest`, from `a3a3f0d` (the integrated fun-and-return build). Spec: `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3.

## What I played

A real headless Chromium (Playwright, Vite dev server), screenshots at every step, console and page errors captured throughout. Screenshots are under `/tmp/claude-0/pt/shots/`; the most telling ones are copied to `/tmp/claude-0/pt/best/`.

1. **Desktop 1280×800, English, a brand-new Master.**
   - Title → Begin → Isel's welcome → "To the crystal" → free ten-pull in the Summon Theatre (every card watched, then Skip).
   - Set the party from the goal tracker's "Set a party of five" chip, then "Clear Floor 1" → Tower.
   - F1 and F2 at default speed (2×).
   - F3 through a Skull door: the tutorial Decisive Moment, then Protect, then a Boon.
   - F4 through a Cache door, F5 boss, then an event floor followed by its chained Boon.
   - F6 Breather (swept), F7 Path, Return to campus (unlock fanfare, backup nudge, Menu, goal tracker).
   - An under-levelled three-hero party through an F8 Skull door: a death Decisive Moment, "Let fate decide", two deaths with grave markers and last words, a rout, Echo bequests, Banes announced, Memorial.
   - Lights Out ("Rest for now").
   - Later, on a 10-hour return: Debug +10k, F8 to F12, including the F10 boss, a Boon and the F11 Bane fight ("AVENGED!").
   - A forced wipe of a lone hero on a thin roster, for the New Arrival bell ("Lyra Solwynn answers the bell").
2. **Absence.** I did not just edit `meta.lastSeenAtWorld`, because that also makes the floors you played just now count as "while you were away". Instead I copied the real save into a fresh browser context and installed a fake clock at **now + 10 h** (and later **now + 31 days**), then let it boot. Results: the "While you were away" ledger, a hero letter, the stamp card (claimed), the grey Re-interference, and a full climb with the clock still faked.
3. **Phone 390×844** (`isMobile`, `hasTouch`, DPR 2): title, lobby HUD and goal tracker, Isel, Summon Theatre, party, Menu, Tower and scout, battle with the orders dock, F1–F3 results with Doors, the Decisive Moment, and a 10-hour welcome-back.
4. **French** (Menu → Français): Menu, lobby tracker, Summon Theatre card, Doors, scout, results, rested-gold line, Boon picker, unlock fanfare, Lights Out, Memorial.

No page errors and no console errors anywhere. The only console noise was ten "AudioContext was not allowed to start" warnings on a reloaded save; that is fixed.

## What worked (evidence the overhaul works)

- **The Summon Theatre is the best first minute the game has had.**
  - The circle opens white and escalates (blue on one pull, gold on the phone pull), and ten beams drop in.
  - Cards flip in ascending rarity with the 3★ last. Each 1★ is a *person*: "Before the summon: miller · Loves apple pie · Hobby: cards", Curious and Hard worker tags, and a one-line voice ("Joren Halwynd. The village miller, in a tower full of monsters. Someone up there is laughing.").
  - The guaranteed 3★ arrives last with "Arrives knowing: Piercing Thrust". Skip ▸▸ is always there.
- **The goal tracker always answers "what next?"** Take your first summon, then Set a party of five, then Clear Floor 1, then Floor 8: choose your door, then "Joren's Bane waits on floor 11 — avenge the fallen". The gold "Summon now!" chip appears whenever a pull is affordable, and the bars give endowed progress (Collection 7/42, Act I 7/10).
- **Battles feel connected.** I saw:
  - wind-up and lunge poses, a white flash then a red tint, and element sparks;
  - gold damage numbers on big hits, and a "3 HITS!" / "5 HITS!" combo;
  - on-stage HP bars;
  - skill callouts ("Piercing Thrust");
  - enemies fading out on death.

  F2 took about 6 s at the default 2×. A Breather was swept in **2.4 s** ("⚡ Swept: an easy floor, nobody lost · Watch full replay").
- **The Decisive Moment is dramatic and clear.** Time desaturates and freezes, and the card offers Protect / Focus / Retreat / Let fate decide, with honest hints ("Foes avoid them while anyone else stands", "it may not fall in time"). Isel coaches the first one. After Protect, the results said "🛡 Protect: no enemy touched Islat after your order."
- **Deaths land.** The death sequence:
  - "Riven Lirenne falls!" over a greyed stage, a last-words card ("Master… keep climbing."), and a grave marker that stays on the field;
  - "The line breaks! The party retreats." (rout after 2 of 3), "ROUTED";
  - "What they leave behind" with an Echo per fallen hero, the heir picked from three portraits, and "I carry Joren with me.";
  - "☠ The Goblin that struck Joren down is marked now: Joren's Bane. It waits on floor 11.", and "The tower remembers: +1% to every stat."

  Three floors later the scout said "☠ Joren's Bane waits here", and the clear opened with "AVENGED! Joren can rest now" and +1,650 revenge gold. The Memorial ties it all together: Banes, Echoes carried, how each hero died, and what each death taught.
- **Doors make every floor a decision.** Path vs Skull, Cache ("480 gold and +1 Promotion Stone · No fight"), Rest, and a Breather after the boss. Each door shows the threat (Safe, Fair, Risky, Deadly), and they are offered right on the results card.
  - **Boons** after Elite/Boss (Second Wind, Underdog, Iron Vow…) show in the Sortie bar.
  - The **Sortie purse** grows visibly ("next clear +50% gold · ◆ 3,240 at risk") against "⌂ Return to campus (bank +3,240)".
- **Mercy works.** A lone Lv2 starter walked onto F6 and the scout read "Safe · Last Stand +20% · the tower eases off". A thin roster is not a death spiral.
- **The return is warm, never accusing.** The 10-hour ledger:
  - opens with "There you are! Everyone will be glad.";
  - lists real simulated news ("Islat and Aren have become friends", "1,364 XP trained");
  - includes a letter from Dika ("I carry a little of Joren with me now… I saved you a cup of tea. It went cold. I will make another.");
  - offers Pent-up Interference, a one-tap gift that stamps the card (2/10 → 3/10), and "Daily Dungeon has 3 attempts".

  The 31-day return greys the lobby, floods the colour back with "✦ Re-interference ✦", and Isel says "You came back. The towers remembered you." Lights Out shows the next floor's real threat, a relationship on the edge, goal bars and a warm sign-off.
- **French is essentially complete** on every new screen. Spot checks include "Rapport de reconnaissance · É8", "Interférence accumulée : +2,400 or", "Choisissez la prochaine porte", "Vœu de fer", "Le Fléau de Joren attend à l'étage 11" and "Nouveau bâtiment !". Strings fit, with no overflow.
- **The phone layout holds up.** There was no horizontal scroll on any screen. The HUD moves to a bottom bar, the dock wraps 3+2, and the Decisive card docks at the bottom.

## Issues found, and what I did

Severity: **High** = confusing flow or misleading at scale, **Med** = layout or copy that misleads, **Low** = polish.

| # | Sev | Issue | Fix |
|---|---|---|---|
| 1 | High | **Pixelify Sans's "fi"/"fl" ligatures render as an "A"** across the whole game: "Take your **Arst** summon", "party of **Ave**", "Quality **Aoor**", "Act VI — The In**A**ection", "In**A**rmary". Two of the first three screens a new player sees are affected. | `font-variant-ligatures: none` (+ `liga`/`clig` off) on body and form controls. CSS test added. ✅ |
| 2 | High | **The Party board kept a draft that only a small "Save Party" button committed.** If a new Master picked five heroes and then followed the tracker away, the party was lost and the tracker kept asking for one. | Every tap saves, and "✓ Saved" confirms it. Test added. ✅ |
| 3 | High | **Doors were below the fold on a 1280×800 results card.** You saw FLOOR CLEARED, the level-ups, Because… and a big gold "Summon now", but no next step. | Once the cascade has played, the decision block (Doors, or Press on / Return) scrolls into view. Test added. ✅ |
| 4 | High | The **tutorial Decisive Moment said "Islat is in danger!"** while Islat sat at 177/177 HP. It is the teaching moment (a heavy blow, not a death), so it read as fake. | It now says "A heavy blow is coming for Islat!"; a real death still says "…is about to fall!". FR updated, test added. ✅ |
| 5 | Med | The **31-day "Re-interference" never actually greyed the lobby.** `greyed` and the 2.4 s colour transition were added together, so it faded part-way and then came back. | Grey at once; the transition runs only on the way back; the minimap greys too. Test asserts the order. ✅ |
| 6 | Med | **The backup nudge stacked on other prompts**: on top of the unlock fanfare after a long Sortie, and on top of the grey ceremony. | The nudge waits for the lobby's windows, the Menu, the ceremony, the ledger and Lights Out. Smoke test added. ✅ |
| 7 | Med | **Phone, during onboarding:** the scene bar shows only one chip, and it was "Summon now!". A Master with a fresh party was pointed back at the crystal, not at Floor 1. | While the first steps run, the step leads and "Summon now!" follows. Smoke test added. ✅ |
| 8 | Med | **Phone Tower:** the decision zone (Sortie bar, scout title) scrolled *under* the three-row sticky scene bar. | `scroll-margin-top` 172px on ≤640px. ✅ |
| 9 | Med | **A seven-floor Sortie saved every unlock for one fanfare: 13 places at once.** That defeats the progressive campus. | The results card now says "🔓 New on campus: Kitchen, Memorial, Daily Dungeon" on the clear that earned them; the lobby fanfare still plays. Test added. ✅ |
| 10 | Med | **Scout: both named threats said "Hits the hardest on this floor."** | Only the one with the biggest blow keeps the superlative; another threat that falls through to it now says "Keeps the pressure on your line." Engine test added. ✅ |
| 11 | Med | **The mercy note said "your roster is thin"** to a Master with eleven heroes (the cap is about the strongest five being weak). | "The tower eases off: it is pitched to your strongest five." ✅ |
| 12 | Med | **Echo heirs were labelled "Fought beside them" when they were bench heroes**, and the survivor who actually fought beside the fallen was not offered. | Among equally close heroes, party members rank first, and only they get "Fought beside them"; others are "A fellow hero". Engine and UI tests added. ✅ |
| 13 | Med | **The welcome-back ledger listed one quarrel twice** ("Bram and Ridigeon…" / "Ridigeon and Bram…"). | One vignette per pair event. Engine test added. ✅ |
| 14 | Low | "1 orders" | "1 order left" / "{n} orders left" (FR too). Test added. ✅ |
| 15 | Low | The Path door said "A fair fight" above a "Deadly" threat line. | "The steady road. Standard rewards." ✅ |
| 16 | Low | "Skull door: ×2 gold and +1 stones." | Singular. Test added. ✅ |
| 17 | Low | Lights Out read "Strength in numbers.. ☠" (double full stop, and no break after "looks deadly"). | Each hook is its own sentence. ✅ |
| 18 | Low | The scout said "lose about 3 heroes an attempt" to a one-hero party. | "A party this weak may not come back at all." Test added. ✅ |
| 19 | Low | The F10 scout repeated keyword notes ("enrages after 300 ticks · too strong… · enrages after 300 ticks · too strong…"), because the anchor repeats its template's keywords. | Notes de-duplicated in the scout card (the data duplication is noted below). ✅ |
| 20 | Low | The orders dock wrapped the fifth hero alone at double width. | Equal-width grid. ✅ |
| 21 | Low | The Decisive Moment showed P / F / R / ␣ key hints on a phone. | Hidden on touch, and the layout adjusted (it broke on first try; re-verified). ✅ |
| 22 | Low | French: "Lv" in the scout list and the Memorial. | "Niv." ✅ |
| 23 | Low | Ten "AudioContext was not allowed to start" console warnings on a reloaded save. | No AudioContext before the page's first user activation. Test added. ✅ |

Every fix was re-verified in the browser with a new screenshot (the `v1-*`, `v2p-*`, `v3-*`, `v4-*`, `fix01-*` and `fix07-*` shots).

## What remains (with my recommendation)

- ~~**The Path door before the first Fight still takes two clicks**~~ **Done (`fun/polish-flow`).** "Press on ▸" now fights the next floor at once when no Door or Boon is pending and the scout adds little (no guardian, anchor or waiting Bane ahead, rated Safe or Fair); before a guardian, and after a Door, it still stops at the scout. The button's tooltip says which (EN+FR). Checked in Chromium: F1 → Press on → the F2 battle, no scout; F2 → a Door → the scout.
- **Summon intro lines repeat inside one pull.** Each tier has two lines per voice, so two quiet 2★s both said "I watch, I listen, I hit when it counts." *Recommendation:* 4–5 lines per voice per tier, or pick by pull index among same-voice heroes.
  **Done (`fun/polish-presentation`):** both. Five lines per voice per tier (EN + FR), and `introKeysForPull` gives a later same-voice hero the next unused line of their bank, so one pull never repeats a line until a bank runs out. Each hero still starts from their own stable line. Tests: `summon/intro.test.ts`.
- ~~**The tutorial Decisive Moment can trigger on a 28 %-of-HP hit.**~~ **Done (`fun/polish-flow`).** `findDangerMoment` now weighs a blow against the life the hero had left (so a hit on a hurt hero outweighs a bigger one on a fresh hero) and needs at least `DANGER_MIN_SHARE` = 0.4 of it; `decisiveTutorialDue` uses the same bar, so a scratch fight no longer spends the tutorial. A healthy party may now meet its first lesson later than F3, on its first real threat or first would-be death. *Review note:* this departs from S5's "F3 at the latest": a free-ten-pull party climbing from F1 (seeds 1, 2, 3, 7, 11, 21, 33; first Door each time) now meets it on F14–F20, and two of the seven not by F20 (before: F3 for all, on a 1–3 % scratch). Worth a designer's call: keep the bar, or lower it for the first few floors.
- ~~**The scout reads "Fair fight · Parties this strong lose about 0.5 heroes an attempt".**~~ **Done (honest scout, `9c0b044`):** the line is gone; the card reports its 8 trial runs, and Fair now means no trial lost a hero. The spec contract is that Fair floors almost never kill. *Recommendation:* re-measure with the sim; if Fair is really ≤5 % deaths, say "Usually comes back whole" for Fair.
- ~~**The F10 anchor's Lv999 Creature carries its keywords twice**~~ **Done (`fun/polish-flow`).** Confirmed: combat multiplies each `enrage` keyword, so the Lv999 hit ×25 past tick 300, not ×5 (the Black Priest's `phased` was doubled too). The anchor no longer re-lists template keywords, and `buildEnemyUnit` drops exact repeats when it merges them. The F10 tests pass unchanged.
- ~~**The same "shouting match" chronicle entry is written once per participant.**~~ **Done (`fun/polish-flow`).** The life sim wrote one entry per quarrel, not per participant; the doubles were the same pair quarrelling again in a later slot, often in the other order. A repeat now replaces the pair's older entry, and Isel's letter reads an old save's doubles as one line (the away ledger already did).
- **French details.** "tombé sous les coups de Gobelin" lacks an article; numbers use English separators ("27,120", "0.5"); and "+10 % VIT" for SPD clashes with the VIT attribute. *Recommendation:* a locale-aware number formatter in `t()`, and "VIT." → "RAP." for speed.
  **Numbers and speed done (`fun/polish-presentation`):** there is a new `fmt(n)` (`Intl.NumberFormat` for the active locale), and every `toLocaleString()` in `src/ui` now uses it. That covers the results cascade, the summon bar, the sortie purse, the scout card, the goal tracker, the ledger, the letters and the legacy screens. French now reads "27 120". `t()` also gives a fractional placeholder a decimal comma in French ("×1,5"). French SPD now reads "RAP.". The decimal readouts (job aptitude, a rival's defense ratio, the PI gauge) go through `fmt` too ("0,85"). Guard tests fail on any new `toLocaleString(`, or on a `toFixed(` outside the simulated US-dollar prices, in `src/ui`. Tests: `i18n/numbers.test.tsx`. *The missing article ("de Gobelin") is not part of this group and is still open.*
- **The New Arrival bell reveals on a plain card,** not through the Summon Theatre. *Recommendation:* route `CLAIM_RECRUIT` through `RevealSequence` for one card; it is a free 2★+ pull and deserves the ritual.
  **Done (`fun/polish-presentation`):** "Open the door" now plays the Summon Theatre for that one hero: the ritual, the glow, the person card and their line. The Theatre is portalled to `<body>`, and its clicks never reach the window behind it. Afterwards the bell keeps its "answers the bell" line. I checked it in Chromium, in French. Test: `legacy/legacy.smoke.test.tsx`.
- **"First steps" can go backwards** (3/6 → 2/6) when the Master shrinks the party below five. It is honest, but odd. *Recommendation:* latch a step once it is done.
  **Done (`fun/polish-presentation`):** the two steps that could lapse now latch: the party of five and a hero's job. The party board, "Suggest a party" and both job pickers record them in the existing `life.guide.done` before and after each change (`latching`), so the save schema is unchanged. Older saves fall back on facts that cannot be undone: a floor fought or cleared, or a job worked (`jobXp`). Tests: `life/firstSteps.test.ts`.
- **The lobby goal tracker covers part of the Great Hall on 1280×800.** *Recommendation:* fine for now; consider auto-collapsing it after onboarding.
  **Done (`fun/polish-presentation`):** once the first steps are done, the tracker folds to its header plus the one short goal. At 1280×800 its height drops from 217 px to 91 px, and the hall's interior is clear. The fold choice after onboarding is stored under its own key (`pmu.goals.collapsed.onboarded`), so reopening it is remembered and an onboarding-era "open" does not carry over. Test: `shell/goalFold.test.tsx`.

## Gates

`npm run typecheck`, `npm test` (run twice: 108 files, 1,466+ tests green) and `npm run build` all pass before the final commit.
