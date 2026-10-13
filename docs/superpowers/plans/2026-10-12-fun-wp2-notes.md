# WP2 notes: battle feel and agency (S5 prompt, S6 replay, S7, S8, S9, S16, S17)

> **Status:** done, on branch `fun/wp2-battle` · **Date:** 2026-10-13 · Spec: `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3 (S5-S9, S16, S17), §4.3.
> Gates in this worktree: `npm run typecheck` clean · `npm test` 60 files / 958 tests green · `npm run build` green (only the existing chunk-size warning).

## What the player gets

**Pacing (S6)**
- Battles start at the last speed used (2× on a new browser). The speeds are 1/2/4/8×. Keys 1-4 change the speed, and the choice is saved in `prefs`.
- Each frame is held according to the event it **shows**, which fixes the old semantics where `hit` was the wind-up. An ordinary hit lands in 120-180 ms plus hitstop. Crits, kills, named skills and deaths keep full time.
- After 20 s of replay time, **OVERTIME** ramps a slower replay up to 4× over 2 s.
- `mode="highlights"` plays a Sweep reel of at most 2.5 s: the opening, the party's 3 heaviest hits, the final kill and the end. It has "Watch full replay ▸" and "Skip ▸▸" buttons. A fight in which a hero dies is never swept, and neither is the scripted tutorial fight.
- A clean tower win (with orders, nobody fell) moves on to the results after 1.2 s. Losses wait for the Master, and so do wins that cost a hero.
- On fixture fights, the median replay of F1-F14 is at most 15 s at 2×.

**Impact (S7)**
- Hitstop is `40 + 140·min(1, dmg/maxHP)` ms, +100 on a crit, at least 180 on a kill, divided by √speed. It is halved under reduced motion.
- During hitstop the attacker freezes and the victim shakes ±1 stage px.
- The victim flashes white for 60 ms, then red for 60 ms, and squashes (1.25, 0.8) before easing back over 180 ms.
- The attacker winds up: it pulls back 3 px, then lunges. Parity classes restart the animation even when the same unit acts twice in a row.
- Trauma shake follows Eiserloh: 8 px·trauma²·smooth noise, no rotation, decaying 1.5/s. Only crits, kills, hero deaths and blows worth ≥50% of max HP add trauma. The shake runs inside the zoom scale, snapped to device pixels.
- An **effects panel** (⚙ in the battle controls) holds a screen-shake slider and a reduced-motion toggle. Reduced motion defaults to the OS setting. It turns off shake, squash, flash, lunge, sparks and pulses, and shortens hitstop.

**Readability (S8)**
- Heroes have on-stage HP bars with a lagging damage trail. A bar under 25% pulses red.
- Damage numbers pop (0 → 1.4 → 1.0 in about 120 ms). A hit worth ≥25% of the target's max HP turns gold.
- A combo counter ("5 HITS!") appears from 3 hits in a row. It resets on an enemy action, a new wave or the end. The hit sound climbs the battle key's A-minor pentatonic with the combo.
- Sparks fly in the element's colour: 6 per hit, 14 per crit (with a gold accent), 16 on a foe's death. They are seeded by `hashString(seq+i)` and capped at 40 nodes.

**Death with weight (S9)**
- The blow that fells a hero gets +300 ms of slow motion and desaturates the stage.
- A distinct low `heroFall` sting plays (thud, sinking minor bell). An enemy keeps the quick `death` sound.
- The hero desaturates and tips over. Real KO poses replace the tip automatically once WP8 lands.
- A **grave marker** stays on the stage until the fight ends, and the last-words card follows.
- The hero-death hold is kept: 2600 / min(speed, 2), so 1300 ms even at 4× and 8×.

**Orders that matter (S16)**
- A **portrait dock** under the stage shows each hero's bust, HP with a trail, a gold ring when tapping will Protect them, a 🛡 badge once protected, and a "!" when a telegraphed blow is aimed at them. Tapping a portrait gives Protect at once. Tapping a foe, on stage or in the foe list, gives Focus. A re-resolve took 1-11 ms on F10-F20 fixtures.
- **The Decisive Moment.** BattleScene scans the already-known log for the first death of a party hero (not NPCs). It **pauses on the last event before the fatal tick**: the camera zooms 1.25× on the doomed hero, the stage dims, a heartbeat cue plays and a card appears. The choices are:
  - "🛡 Protect {hero}" [P]
  - "🎯 Focus {killer}" [F]
  - "🏳 Retreat" [R]
  - "Let fate decide" [Space/Esc]
- The card's copy never promises survival ("Foes avoid them while anyone else stands", "it may not fall in time"). With no orders left, the card offers only Retreat or fate.
- Every choice re-resolves through `orders.give`, so it reaches the store through TowerScreen's `store.revise`. **BattleScene never dispatches.**
- If the hero then lives, a gold **"Saved!"** callout plays at the moment they would have died, with the `saved` sting and an Isel line. `onSaved(heroId)` is called once.
- The moment **re-arms** once (cap 2) after an order re-resolves the fight, for a *different* hero who is now doomed. In a wipe, for example, the second card offers Retreat. "Let fate decide" is final.
- Skip never jumps past a choice that has not been made: it stops at the moment.

**Intents and commentary (S17)**
- Two enemy actions ahead (or from the foe's arrival), an intent tag appears over the attacker with a dashed line to the target: "⚠ HEAVY → Mira" for a blow worth ≥30% of the target's max HP, or "✦ {Skill} → Mira" for any named skill.
- Isel barks one line at a time from a small bust: on the party's first crit, a near-wipe, each hero's death, a "Saved!" and a flawless win.
  - At most one bark every 10 s of replay. A death, a "Saved!" or the coaching line may cut in after 3 s.
  - Variants are picked by hash, so the same fight always says the same thing.
- All lines go through `t()`, with French in `frBattle.ts`.

**Scripted first decision (S5, BattleScene side)**
- With `tutorialPrompt`, the first moment carries Isel's coaching line: "Your orders change fate. Try Protect." The Protect choice glows.
- If nobody would die (F3 at the latest), the moment opens before the heaviest blow on the party instead, worded "{name} is in danger!".
- `decisiveTutorialDue(state, log)` and `DECISIVE_TUTORIAL_STEP = 'decisive-tutorial'` are exported for TowerScreen (see the requests below).

**Sound (sound.ts)**
- Hits are layered: a high-passed noise transient plus a pitched body. 4 variants rotate, so the same one never plays twice in a row, with a ±80-cent detune from a counter hash (no `Math.random`). A crit adds a bright ring and an untransposed 55 Hz sub.
- New cues: a distinct `heroFall` and a `decisive` heartbeat.
- The `reveal` sting grows with the star, and a test pins this.

**Keyboard**
- The keys are:
  - Space: pause or play (at the end, continue)
  - 1-4: speed
  - S: skip
  - F and P: aim Focus or Protect
  - R: retreat
  - Esc: cancel aim, close the panel, or let fate decide
- At the Decisive Moment, P, F, R and Space choose.
- The listener runs in the capture phase on `window` and stops every key's propagation while the battle is up, so the lobby (WASD, E) and windows behind it never react. Only the battle's own keys are `preventDefault`ed, and typing in the panel's inputs is left alone.

## Files

**Owned and changed:** `src/ui/battle/BattleScene.tsx` (rewritten around the new modules), `src/ui/battle/battle.css`, `src/ui/audio/sound.ts`, `src/ui/i18n/frBattle.ts`.

**New**
- `src/ui/battle/`:
  - modules: `fx.ts`, `decisive.ts`, `intents.ts`, `narrator.ts`, `combo.ts`
  - components: `Sparks.tsx`, `OrdersDock.tsx`, `DecisiveMoment.tsx`
  - fixtures: `__fixtures__/logs.ts` (real engine logs; orders re-resolve the way TowerScreen does)
- Tests:
  - `src/ui/battle/`: `fx.test.ts` (18), `decisive.test.ts` (10), `intents.test.ts` (5), `narrator.test.ts` (6), `combo.test.ts` (3), `sparks.test.ts` (3), `battle.i18n.test.ts` (2), `BattleScene.test.tsx` (18, jsdom)
  - `src/ui/audio/sound.battle.test.ts` (6)

No file outside WP2's ownership was edited.

## Tests added (71)
- **Pure math**
  - Speeds normalise to 1/2/4/8 with a 2× fallback.
  - Hitstop is monotone in damage, has a crit bonus and a kill floor, shrinks by √speed, and is halved under reduced motion.
  - Trauma is clamped to [0, 1] and decays linearly to exactly 0. The shake offset is deterministic and scaled by the slider. Only crits, kills, deaths and half-life blows shake.
  - Frame holds: 120-180 ms per hit, full time for big moments, the hero death hold of ≥1300 ms at 4×/8×, and the 300 ms slow motion.
  - Overtime ramp.
  - Fixture logs: median F1-F14 replay ≤15 s at 2×; every reel ≤2.5 s; no reel when a hero dies.
- **Decisive and narrator**
  - `findDecisive` returns the last event before the first hero-death tick. It excludes NPCs, returns null with no death, scans from an index and skips heroes already prompted.
  - The order tick re-resolves an identical fight prefix on real wipes.
  - `findDangerMoment`, `savedCursor` and `survives`.
  - `decisiveTutorialDue`: due on a first death or on F3, and done after the guide step.
  - Intents: every big blow on the party is flagged ≥2 actions ahead on real fights.
  - The combo resets on an enemy act and on a new wave.
  - Barks are planned, rate-limited and picked by hash.
  - Sparks are seeded and capped.
  - FR coverage: every literal `t()` key in `src/ui/battle` has French, with matching placeholders and French spacing.
- **BattleScene (jsdom, real engine logs)**
  - At 8× it reaches the end and calls `onDone` once.
  - It starts at 2×, number keys set and save the speed, and Space pauses.
  - The battle owns the keyboard.
  - Clean tower wins auto-advance; costly wins wait.
  - The Decisive Moment pauses (time stops) and Protect calls `orders.give` with the right tick and hero.
  - Retreat (key R) saves the hero: "Saved!" plus `onSaved`.
  - A Protect that holds plays "Saved!" and the fight is won.
  - It re-arms once for a different hero (and offers only Retreat or fate with no orders left). "Let fate decide" is final.
  - The effects panel works.
  - Skip stops at the moment.
  - No moment without orders, while graves and the death hold stay.
  - Tutorial coaching appears in a no-death fight.
  - Portrait tap gives Protect and spends the only order.
  - Highlights: ≤2.5 s, then `onDone`; "Watch full replay" switches to the full fight.
  - Highlights are refused for a death and for the tutorial.
- **Sound**
  - Variants rotate and the detune stays within ±80 cents.
  - A hit is layered (transient + body); a crit has an untransposed sub.
  - The combo transposes.
  - `heroFall` and `decisive` are distinct from `death`.
  - Reveal grows with the star.
  - No-op without an AudioContext.

## Deviations from the spec, and why
1. **Big-hit trauma is 0.25, not 0.15.** At 8 px·trauma², 0.15 gives a 0.18 stage-px shake, which is invisible. 0.25 gives a visible 0.5 px nudge. Crit, kill and death values are as specified.
2. **The highlight reel shows the final kill, not every kill.** Wave floors have 10+ kills, and putting each one in a 2.5 s reel makes it a strobe. The spec's S6 wording ("the kill") matches.
3. **The tutorial "danger" moment.** S5 says "F3 at the latest". If nobody would die on that fight, there is no fatal tick, so the scripted moment pauses before the heaviest blow on the party and reads "{name} is in danger!". It never shows "Saved!".
4. **Re-arm semantics.** "Re-armed after a re-resolve if a different hero is now doomed (cap 2)" is implemented as: after any order re-resolves the fight, the next moment is the first death of a hero not yet offered one. "Let fate decide" does not re-arm.
5. **Auto-advance on victory** (an S11 behaviour) lives in BattleScene, because only BattleScene knows when its replay ends. It fires only for tower fights (`orders` present) won with nobody fallen.
6. **The shake slider** lives in a small ⚙ panel in the battle controls. The Menu (WP7) and `ui.css` (WP8) are not WP2's. It writes the shared `prefs`, so a later global settings screen can reuse it.
7. **Escape at the Decisive Moment means "Let fate decide".** Dismissing the card should not cost an order.

## SHARED-FILE REQUESTS (for the lead / WP4)
1. **`src/ui/TowerScreen.tsx` (WP4): wire the S5 scripted first Decisive Moment.** BattleScene can't do this itself because it must never dispatch.
   - In `fight()`, compute `const tutorial = decisiveTutorialDue(pre, result.result.log)` (import from `./battle/decisive`). Keep it in state next to `combat` and pass `tutorialPrompt={tutorial}` to the tower `<BattleScene>`.
   - In `combatDone()`, when `tutorial` was true, call `store.dispatch({ type: 'GUIDE_STEP', step: DECISIVE_TUTORIAL_STEP })`. This runs after the replay closes, so no `revise` follows it.
   - Why: without this the coaching line never shows. The Decisive Moment itself already works for every tower fight with orders.
2. **`src/ui/TowerScreen.tsx` (WP4): optional.** Pass `onSaved={(id) => …}` to feed S18's "Because…" line (for example, "Protect: Mira was pulled back from the edge"). Pass `nemesisIds` once WP3/WP5 mark nemesis units.
3. **WP4: do not add a second victory auto-advance for the battle.** BattleScene already moves a clean tower win on after `VICTORY_AUTO_MS` (1.2 s) by calling `onDone`. ResultsScreen's own auto-advance is separate.
4. **`src/ui/app.smoke.test.tsx` (WP7), a pre-existing flake to know about.** On a cold first run under load, LobbyWorld/DialogBox timeouts can fire after the jsdom environment is torn down. Vitest then prints "window is not defined" errors from `useGame.ts:17`; the tests still pass. It reproduced once out of 4 full runs, and it is not caused by WP2 (it does not mount BattleScene). The fix would be fake timers or `cleanup` in that file.

## Known gaps
- **Not checked in a real browser.** This container has no Chromium/Playwright, so the CSS (card placement on wide and narrow screens, the dock wrap at 375 px, the effects popover) is verified only by reading and by jsdom class assertions. The lead's Playwright pass (§4.10.3) should look at the first Decisive Moment on a phone width.
- **Poses are WP0 stubs** until WP8 merges. `heroPoseUrl`/`enemyPoseUrl` are already called (acting → attack/cast, hurt → hurt, KO → ko), and the CSS tip-over is used only while the KO URL equals the idle URL.
- **The tutorial prompt is dormant** until request 1 is applied.
- **`tutorialPrompt` with no `orders`** (replays, PvP) is ignored by design.

## Review (independent reviewer, 2026-10-13)

I re-read the diff against §4.0, §4.3, S5-S9, S16 and S17. I also swept real engine fights with a throwaway jsdom probe: seed 2 on F1, 2, 3, 5, 10, 15, 16, 20, 25, 30, 36-38, 40, 45, 50, 60, 75 and 90, in English and in French, choosing at every Decisive Moment. Every fight reached `onDone`, `console.error` was never called, and no raw id or `{placeholder}` leaked. No file outside WP2's ownership is edited, `src/engine` is untouched, and there is no `Math.random` or `Date.now` in the new code.

**Issues found and fixed** (each is pinned by a test that fails on the code before the fix):
1. **An order could be wasted.** Tapping the sprite of a hero who was already protected spent a second order. Only the dock checked for this, and a sprite or foe tap went straight to `protect`/`focus`. Tapping the foe already under Focus did the same. Both are now refused, and an order counts as standing from the moment it is given.
2. **The Decisive card could re-offer an order already in place.** It offered Protect for a hero already under Protect, and Focus for the foe already focused or for a killer who was down. It no longer does, and the P and F keys follow the card.
3. **Some rescues got no "Saved!".** When two moments in one fight each rescued a hero, only the second got the callout and `onSaved`; seed 2 on F36 (Protect, then Retreat) shows it. Rescues are now a list, checked against the *current* log, so a hero who is rescued and then doomed again by a later order is never called saved. Each callout renders on its own.
4. **Escorts were named by a word fragment.** Intents and the card used `firstName`, so they read "HEAVY → Princess", "→ Key" or "→ Sealed". A single `shortName` is now shared with the dock and gives "Priasis".
5. **A Space press could make the final choice by accident.** Pressing Space to pause, or holding it, just as time stopped was read as "Let fate decide". The card now ignores keys for its first 400 ms (`DECISIVE_KEY_GRACE_MS`) and ignores key auto-repeat. Clicks still work at once.
6. **Intent tags could print over each other.** A fast foe with two big blows queued got two tags on the same spot. `intentsAt` now keeps one tag per foe, showing its next blow.
7. **Isel could say something false.** She could say "one left standing" when the near-wipe was triggered by low total life, with all three heroes still up. That line is now picked only when one hero is left.
8. **"Focus Assassin" was ambiguous among three Assassins.** At the Decisive Moment the named foe is now lit and ringed on stage (`.bunit.killer`).
- Units carry `data-unit={id}` so tests can find a sprite. In jsdom the canvas sprites have no `<img>`.

**Tests:** +6, so 964 in total across 60 files. The new tests cover:
- the stage tap after a portrait tap
- escort naming plus a card that does not re-offer Protect or Focus
- two rescues
- the key grace and auto-repeat
- one tag per foe
- the honest near-wipe line

Three existing BattleScene tests now advance past the key grace before pressing P or R.

**Gates:** `npm run typecheck` is clean. `npm test` passes 60 files and 964 tests. `npm run build` passes, with only the existing chunk-size warning.

**Remaining concerns (not fixed):**
- **Not checked in a real browser.** Untested by eye are the card on a phone (it is docked at the bottom with `max-height: 62vh`, and with the coaching line it may cover the party's feet), and the 8-stage-px intent tags, which shrink to about 7 px when the stage zoom drops below 1 on phones.
- **The decisive card can open before any blow lands.** On floors far above the party, the first hero dies on tick 1, so the moment opens just after "Enemies approach!". This is correct per spec, but it feels abrupt.
- **Two moments can open back-to-back on the same frame.** This happens when a rescue dooms another hero on the same tick (seed 2, F36). It is allowed, and the cap of 2 holds.
- **Victory auto-advance ignores open panels.** It moves on after 1.2 s even if the ⚙ panel is open.
- **R retreats at once, with no confirmation.** This matches the old Retreat button.
- **Request 1 can mark the tutorial done without showing it.** If TowerScreen dispatches the guide step whenever `tutorialPrompt` was true, the coaching can be marked done without being seen. That happens when a dock order removes the danger blow, or when the doomed hero is already under Protect, so the coaching line is dropped. It is rare. A clean fix would be an `onTutorialShown` callback, but that would change the WP0 prop contract and needs a lead decision.
