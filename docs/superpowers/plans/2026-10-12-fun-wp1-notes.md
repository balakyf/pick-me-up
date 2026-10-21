# WP1 notes: first pull and Summon Theatre (S1, S2)

> **Status:** Built · **Date:** 2026-10-12 · **Branch:** `fun/wp1-summon` (based on `3b2ce0a`, WP0) · Spec: `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3 S1/S2, §4.2

## What the player gets

**A first pull that always lands (S1).**
- The free tutorial ×10 always has **at least one 3★** and **at least three heroes of 2★ or higher**. Most cards are still 1-2★. Over 200 seeds: 179 pulls have exactly one 3★, 18 have two, 2 have three, 1 has four. The average is 2.76 2★ per pull.
- The best 3★ **arrives knowing its class's signature skill** at Lv1 (e.g. Power Strike for a warrior). Before this, 0% of procedural 3★s had a skill and 60.5% of seeds had no 3★ at all.
- Paid pulls are unchanged. The rate tests and the mercy pull are untouched.

**Summon Theatre (S2): a pull is staged, not dumped.**
1. **The circle wakes white** and climbs the tell ladder (white → blue → gold → rainbow) up to the pull's best *shown* rarity. Each step rises in pitch, and the circle only ever climbs.
2. **Surprise, upgrade only.** When the best card is ≥3★, a deterministic ~30% of pulls (`hashString(ids) % 10 < 3`) hold the circle one tier low. Halfway through the hold of the first top-tier card (the last card, unless the pull has several; see Review), the card flashes up to its real tier and the circle follows. A tell never goes down.
3. **Cards are dealt face down and turn one at a time, in ascending rarity, best last.** Each back glows in its own tell for 250 ms (1★), 600 ms (2★), 1.5 s (3★) or 3 s (4★+). For 4★+ the music drops out during the hold.
4. **Every card is a person.** The face shows:
   - the hero's sprite, name, stars, and class (or their trade, for the classless);
   - "Before the summon: farmer · Loves honey cakes · Hobby: gardening";
   - one or two standout traits ("Fearless", "Shy", "Short fuse"…);
   - **an introduction in their own voice**, from 30 hand-written lines. Lines depend on rarity: 1★ commoners are humble, 2★ sell-swords are seasoned, 3★+ are proud. Within that, each of the 5 voices has its own lines. Example: *"Name's Brann. No sword, no class, no problem. Point me at it."*
   - for 3★+, an "Arrives knowing" block with their skills. 4★+ cards also get a foil sheen.
5. **Controls.** Click, Space or Enter advances (a face-down card turns at once). **"Skip ▸▸"** appears after the first card and goes straight to the summary; Escape does the same. A row of dealt cards along the bottom fills in as you go, with an "n / 10" counter.
6. The **summary grid** stays as the final view, now best first. A single pull is the short version: a faster ritual, one card, no Skip, then the card with stats.
- Keys are captured and swallowed while the theatre is open, and focus is moved off the ×10 button. Pressing Enter can never pull again.
- Reduced motion: the colours and the order stay, the movement goes (`prefers-reduced-motion`).

**Title screen: no dead Continue.**
- If the save failed to load, the title says *"This save could not be read. A copy was kept."*, hides Continue and keeps New Game working. "Failed to load" means useGame's `pmu.save.v1.broken` copy equals the save on disk.
- If Continue ever throws anyway, the button turns into that message (and the copy is kept) instead of doing nothing.

## Files

**Changed (owned):**
- `src/engine/gacha/gacha.ts`: the tutorial branch is now `tutorialTenPull`. New exports `tutorialMinStar` and `bestOfPull`.
- `src/engine/gacha/gacha.test.ts`
- `src/ui/screens.tsx`:
  - TitleScreen fix and `saveLooksBroken()`;
  - SummonScreen mounts `RevealSequence`, and its summary is ordered best first;
  - the old `SummonRitual` is removed.
- `src/ui/pixel/summonFx.ts`: `drawSummonCircle` accepts several tints (the rainbow circle). One tint draws exactly as before.
- `src/ui/summon/summon.css`: the theatre styles. The old ritual rules are removed; nothing else used them.
- `src/ui/i18n/frSummon.ts`: 45 strings.

**New:**
- `src/ui/summon/reveal.ts`: pure. Order, tell ladder, hold times, surprise, ritual timing.
- `src/ui/summon/intro.ts`: persona, standout traits, introduction banks.
- `src/ui/summon/RevealSequence.tsx`
- `src/ui/summon/reveal.test.ts`, `src/ui/summon/intro.test.ts`, `src/ui/summon/summon.smoke.test.tsx`, `src/ui/titleScreen.test.tsx`

`HeroCard.tsx` is unchanged.

## Tests added (35)

**`gacha.test.ts` (+10)**
- `tutorialMinStar`:
  - early pulls are untouched;
  - the 2★ deficit lift fires exactly when needed;
  - the last-pull 3★ lift;
  - TUNING defaults and overrides.
- The tutorial pull:
  - **200 seeds: ≥1 3★ with ≥1 skill and ≥3 2★+**, and more than 75% of cards are 1-2★;
  - the taught skill is `CLASS_SKILL` at Lv1, on at most one procedural hero, and the state matches;
  - the best 3★ is the one taught;
  - no extra draw (pull 0 matches a paid pull);
  - pure and deterministic;
  - a paid ×10 afterwards is identical to plain `summon()` calls and teaches no skill.

**`reveal.test.ts` (12)**
- The tell ladder and hold times.
- Ascending order with the best last, on 30 seeds.
- Stable tie-breaks.
- The tutorial 3★ that knows its skill turns last.
- The whale-bait `shownStar` is used.
- **The tell sequence never decreases** (200 seeds), and neither does the circle tell per card.
- The surprise rate is about 30% and deterministic, and never happens below 3★.
- A surprise back upgrades.
- An all-1★ pull stays white.
- Ritual timing.
- An empty pull.

**`intro.test.ts` (5)**
- Bank selection by rarity.
- Every line has French and only allowed placeholders.
- The intro line is stable per hero and in the hero's own voice.
- The persona translates.
- Standout traits.

**`summon.smoke.test.tsx` (4)**, the real App in jsdom:
- free ×10, then card 1 back, then face (a person: trade, food, hobby, intro), then Skip appears, then Space/Enter advance without re-pulling, then **Skip ▸▸ gives a summary grid of 10**;
- walking every card ends on the best 3★ "Arrives knowing" a skill, with the summary best first;
- fake timers: the ritual and holds run on their own, the theatre waits on a face card, and Escape skips;
- a single pull is one card, with no Skip or deck, then the stat card.

**`titleScreen.test.tsx` (4)**
- The `saveLooksBroken` predicate.
- Boot with a corrupt save: the message shows, there is no Continue, and New Game works.
- A Continue that throws turns into the message.
- A good save keeps Continue.

**Gates:**
- `npm run typecheck`: clean.
- `npm test`: 55 files, 922 tests, all green. WP0 had 51 / 887.
- `npm run build`: OK, with only the existing chunk-size warning.
- `app.smoke.test.tsx` is unedited and green.

## Deviations from the spec, and why

1. **The intro line comes from a dedicated bank (`summon/intro.ts`), not `speak()`.**
   - `speak()` picks its topic from the hero's *current* activity, needs and memories. For a hero who arrived this second, that can produce "Busy, Master. The work does not do itself."
   - The bank is still keyed by the same `personalityOf` voice and background.
   - The persona line reuses the existing frLife keys (`Before the summon: {trade}`, `Loves {food}`, `Hobby: {h}`), so there are no duplicates.
2. **The persona and intro show on every card, not only 1-2★.** The spec asks for them on 1-2★. The 3★+ cards get them too, plus the "Arrives knowing" skills block. A person is never less interesting for being rare.
3. **The tell ladder uses its own colours** (white `#fff6e0`, blue `#4aa3ff`, gold `#f2c75c`, rainbow), not `STAR_COLOR`, which has 3★ as blue. This follows the spec's "white, blue, gold, rainbow". After the flip, the card's stars and rarity strip still use `STAR_COLOR`.
4. **"A music change" for 4★+ is a hush.** The music stops for the hold, then the reveal and legend stings play, and the lobby theme comes back on the next click or when the theatre closes. `sound.ts` isn't WP1's (see the requests below).
5. **The best 3★ is chosen by highest true star, then base combat power, then the lowest id.** Canon 3★ cameos already know their signature skill, so when one of them is the best, nothing is added.
6. **The summary grid is ordered best first** (the theatre order reversed) instead of pull order.
7. **Escape also skips**, or advances during the ritual and on the first card.

## SHARED-FILE REQUESTS

1. **`src/ui/audio/sound.ts`** (WP0/WP2): add a short `'reveal'` music theme, or a sustained `'hold'` drone cue, for the 4★+ hold. The spec's "music change" would then be a real change rather than a silence. Wiring point: `RevealSequence.tsx`, the `card.tier >= 3` branch that currently calls `stopMusic()`. Not blocking.
2. **None required for function.** `App.tsx`'s `hasSave` already gets the correct behaviour through TitleScreen's own check. Optionally WP7 could hide the "Starting a new game overwrites your save." note when the save is broken, but it is still true.

## Known gaps

- **Not checked by eye:** there is no headless browser in this environment. Layout, colours and the foil sheen were verified only through tests and the build, not in a real browser. Please give the theatre a 30-second look in `npm run dev`, and check phone width too: the `max-width: 520px` rules are untested.
- **The `reveal` sfx is WP0's first-pass synth.** WP2 may refine it. The theatre calls `sfx('reveal', {star})` on each flip and on each ritual step, `sfx('legend')`/`sfx('rare')` on a surprise upgrade, and `sfx('summon')` at the start.
- **Rapid double clicks.** Two clicks within one React render can advance past a face card. That is harmless (it just moves on), but it is a known edge.
- **French grammar.** The intros put the trade and food words (which carry their articles, e.g. "les gâteaux au miel") into fixed sentences. Masculine agreement is assumed for trades ("le fermier du village").

## Review (independent reviewer, 2026-10-12)

**Verdict:** ship with concerns. The engine side (S1) is correct, deterministic and pure. The theatre (S2) meets every §4.2 behaviour. The issues below are fixed on this branch.

**Checked, no change needed**
- **Ownership.** Every changed file is in §4.2's Owned list or is new under `ui/summon/`. `ui/titleScreen.test.tsx` is also a new file. No shared file was touched.
- **Determinism.** Nothing in `src/engine` uses Math.random or Date. The theatre's randomness comes only from `hashString`.
- **S1 edge cases.**
  - 3★+ heroes always get a class from `rollClass`.
  - The canon 3★ cameos all have a class and their signature skill.
  - `meta.nudge` and pity still apply before the lift.
  - The mercy pull and paid pulls are untouched.
  - The taught skill lives in `skills` (OwnedHero has no `skillIds`), so nothing recomputes it away.
- **i18n.** A throwaway script took every literal `t('…')` in `RevealSequence.tsx`, `intro.ts`, `reveal.ts` and `screens.tsx`, plus every intro line, trait word, food and hobby. All of them have French with identical placeholders.
- **Smoke hygiene (§4.0.7).** The theatre adds no buttons before the real ones. Its "Click, Space or Enter…" hint is a `span`, not a button. `app.smoke.test.tsx` is unedited and green.
- **Escape.** The theatre's Escape listener sits on window in the capture phase and calls `stopPropagation`, which stops the bubble-phase listeners in `kit.tsx` and LobbyWorld.
- **Overlay.** The summon screen is a `Scene`, not a `PixelWindow`, so no transformed ancestor traps the fixed overlay.
- **4★+ hush.** App's capture-phase click listener calls `playMusic('lobby')` on every click. The silence therefore lasts until the player's next click (normally the flip) or until the theatre closes. That is a reasonable "music change" until sound.ts has a real cue.

**Issues found and fixed**
1. **A surprise could be spoiled, and its upgrade landed too late.**
   - The problem: in a surprise pull with two or more top-tier cards (about 3% of tutorial pulls, more on paid ×10s), the first top-tier back glowed gold under a blue circle before the "surprise", and the upgrade only came on the last card.
   - The fix: the surprise now springs on the **first** card of the final tier (`plan.surpriseAt`, `isSurpriseCard`). That is still the last card whenever the pull has a single best card. `circleTellAt(plan, index, upgraded)` keeps the circle monotonic across back → upgrade → face for every card.
   - Tests:
     - a step-by-step walk over 200 seeds: the circle and the backs never step down, and no back glows above the circle before the surprise;
     - a hand-built pull with two 3★s.
2. **Clipped cards on short or phone screens.**
   - The problem: the overlay was `overflow: hidden` and centred, and the footer was absolutely positioned. A 3★ card (about 480 px), plus the deck and footer, was cut off top and bottom on viewports under about 600 px. The footer row also overflowed at 375 px.
   - The fix:
     - The overlay now scrolls (`overflow-y: auto`).
     - A `.theatre-main` wrapper centres with auto margins: centred when it fits, top-aligned when it does not.
     - The footer is fixed and wraps, sits on a fade, and the bottom padding keeps it clear of the card.
     - The keyboard hint is hidden at ≤520 px.
3. **The game's own reduced-motion preference was ignored.** Only the OS media query was honoured. The theatre now reads `usePrefs().reducedMotion` and adds `.reduced`, which drops the same animations. A smoke test covers it, including toggling it mid-theatre.
4. **Intro lines that did not fit the hero.**
   - 1★ cameos with grand pasts could say "I was only the village knight" or "Village mercenary". The village lines are now spoken only by the 13 village trades (`introBank`), and a test covers it.
   - "Is there dumplings?" is now "Will there be {food}?".
   - "My hands were made for {hobby}, not swords" ("made for cards") is now "Back home my evenings were for {hobby}, not swords".
   - The French follows both changes.
5. **A smoke test passed for the wrong reason.**
   - The problem: "runs on its own" advanced the clock in one 4000 ms `act`. React runs effects only at the end of an act, so the hold timer started late, and the test's "still face down at 4 s" relied on that artefact.
   - The fix: it now ticks in 50 ms steps and asserts:
     - the ritual's exact climb (`tell-0 → … → peak`);
     - the deal at `ritualMs`;
     - the turn after that card's own `holdMs`;
     - that the theatre then waits.
6. **The "no extra draws" test only checked pull 0.** A new test replays all ten pulls from the same intermediate states over 60 seeds. It asserts that:
   - `pullCount` advances by exactly 10;
   - every un-lifted pull is the same hero a plain `summon()` gives;
   - a lifted pull only raises the star;
   - the lift does bite on some seeds.

**Remaining concerns**
- **Not looked at by eye.** There is still no headless browser here, so the layout fix (item 2) was reasoned through, not seen. Check the theatre in `npm run dev` at desktop size, at 375×667, and at a short landscape height.
- **French grammar.** Trades are assumed masculine, and food words carry their article. This is cosmetic.
- **Pull order.** `SummonScreen` recovers the pulled heroes by diffing `Object.keys(state.heroes)`, as the old code did. The result is deterministic but is not guaranteed to be pull order. It only affects tie-breaks and the surprise hash.
- **Double clicks.** The "two clicks within one render" gap noted above does not happen in React 18. Clicks and keydowns are discrete events that flush synchronously, so each press re-renders before the next one.

**SHARED-FILE REQUESTS:** unchanged from the list above (sound.ts hold cue, not blocking; optional WP7 note).

**Gates after the review:** `npm run typecheck` is clean. `npm test` passes 55 files / 927 tests. `npm run build` succeeds, with only the existing chunk-size warning.
