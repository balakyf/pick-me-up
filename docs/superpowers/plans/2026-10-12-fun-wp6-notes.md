# WP6 notes: reasons to return (S24 accrual, S25, S26, S27, S28)

Branch `fun/wp6-return`, on top of WP0 (`3b2ce0a`). Spec: `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3 S24-S28 and §4.7.

The package answers the second half of the owner's complaint: "when I quit, nothing makes me want to play again." Leaving now costs the player nothing. Coming back now starts with a short, warm account of what the heroes actually did while the player was away.

## What the player sees

**Absence gives instead of taking (S24, S25)**
- Probability Interference (PI) no longer decays and the account is never deleted. The canon fade and deletion stay, but only for `meta.hardcore`, which is opt-in. A save that an older build already marked `deleted` stays deleted.
- Elapsed time builds **Interference charges**: 1 per 8 real hours, up to 6. The leftover is carried, so short sessions add up. Each charge doubles the gold of one floor clear. Spending the charges is WP3's job (`consumeRested`).
- After **30+ real days** away, the lobby opens in greyscale. The words "✦ Re-interference ✦" appear, the colour floods back with a sound, and the ledger opens with Isel saying "You came back. The towers remembered you." This is cosmetic only. With reduced motion on, the effect is skipped.

**"While you were away" (S26)**
The ledger opens once per arrival. An arrival needs all of the following:
- the save was last seen on a real clock;
- the player was away 2+ real hours, or the tab was hidden that long and is shown again onto the lobby;
- the account is not a fresh Master;
- the lobby is the current view.

It contains:
- Isel's greeting (seeded, so it never flickers) and how long the player was away.
- Up to 5 vignettes from the real simulation: chronicle entries, Master and hero level-ups, and expeditions home with their actual gem haul. They are sorted by emotional weight, with variety first (one of each kind before any kind gets a second).
- A "busy" tally: meals, items forged, XP trained, floors studied, sanity mended.
- **One hero letter** in a hero's own voice. It is written from the strongest memory that hero made while the player was away, plus their job's real output (or their hobby), plus a warm closer that suits their voice. Example: "{friend} saved me the last of the stew. That is friendship, here. … Save me a spot on the next climb? — Kael". Gifts are named as the catalogue names them, in both languages.
- **Waiting for you**: the Interference charges built, the heroes' job gold (already in the purse), and today's gift (+50 ♦ plus a stamp). The gift is a single tap. It is never auto-claimed.
- **Ready**: promotions, drills and builds that finished; a summon that became affordable while they were away; Daily Dungeon attempts left.
- Every travel line is a button that goes to its place. "Isel's full letter" opens the old letter. Closing the ledger marks the letter as read, so two windows never open at once.

**Lights Out (S27)**
- A "☾ Rest for now" button appears in the lobby after the player comes back from the Tower, or after 60 minutes of play.
- It opens the "A good place to stop" card:
  - the next floor's **real scouting teaser**: the floor, its mission, an honest threat rating, and its Nemesis, named threat or headline enemy;
  - **up to 3 brewing timers**, each with its clock time and a countdown;
  - **one friendship on the edge** ("Aldo and Sene: one good evening from friends.");
  - **goal-gradient bars**: the next summon, the next boss floor, the next Master Level and the stamp card;
  - how many Interference charges are stored and when the next one builds;
  - a warm sign-off from Isel ("Go on — the tower will still be there tomorrow. So will we.");
  - a "💾 Back up your save" shortcut.
- The card never dispatches.
- **Honest tab title**: while the tab is hidden, the title changes to "Pick Me Up! · ✓ Training done (+n)" only once a timer the player started has really finished. It checks every 15 s, never cycles or flashes, never dispatches, and is restored when the tab is visible again.

**Stamp card and no offline permanent loss (S28)**
- `CLAIM_LOGIN` still pays +50 gems once per world-day, and the "Claim +50" button is kept.
- It also adds **one stamp per real day** to a card that **never resets**. The card starts at 2/10. Every 10th stamp pays +300 ♦ and one free Normal summon, and the card names the hero who answered that summon.
- The streak reset, the "You missed a day" warning and the 7th-day bonus are gone.
- The Gem Shop shows the stamp card.
- Captive clocks pause for any time spent away: a gap longer than 30 real seconds counts as away, and a hidden tab's throttled ticks count as away too. A captive is never synthesized while nobody is watching. A newly taken captive still gets the full window, counted from when the player sees it.
- A lost invasion takes at most a token 2% of the storeroom.

**A protected save (S28)**
- `navigator.storage.persist()` is requested once, right after the first summon (guarded for jsdom).
- **Backup window**:
  - export as a file download or a `PMU1:` paste code;
  - import from a file or a pasted code;
  - every import is validated through `loadState` (with migrations) before anything is written;
  - a confirm step shows what was found;
  - the replaced save is kept under `pmu.save.v1.beforeImport`.
- The window opens on the window `CustomEvent` **`pmu:backup`**, which is the contract with WP7's Menu footer. It also opens from Lights Out and from a single gentle "Back up your save? Browsers sometimes forget." nudge after F5.
- PWA: `public/manifest.webmanifest` and `public/icon.svg`, linked from `index.html` together with theme-color and a description.

## Files

Engine:
- `engine/time/time.ts`: no decay or deletion unless hardcore, `accrueRested`, and captive clocks paused by the last-seen gap.
- `engine/interference/interference.ts`: `piAfterGap` and `piZeroCrossing` take `hardcore`.
- `engine/shop/shop.ts`: the streak never resets, and the claim stamps the card.
- `engine/pvp/pvp.ts`: `resolveInvasions(state, now, prevSeen)` pauses captive clocks, and the storeroom loss is capped.
- `engine/return/rested.ts`: `accrueRested`, `restedChargeWorld`, `nextRestedChargeIn`.
- `engine/return/stamps.ts`: `realDayIndex`, `stampReady`, `stampCard`, `stampOnLogin`.
- `engine/return/away.ts`: `summarizeAway`, `awayHasNews`, `VIGNETTE_WEIGHT`.
- `engine/return/offline.ts` (new): `awayPause`, `storeroomLossPct`.

UI:
- `ui/return/ReturnLayer.tsx`
- `ui/return/WelcomeBack.tsx`
- `ui/return/LightsOut.tsx`
- `ui/return/BackupWindow.tsx`
- `ui/return/StampCard.tsx`
- `ui/return/arrival.ts`
- `ui/return/heroLetters.ts`
- `ui/return/lightsOut.ts`
- `ui/return/vignettes.ts`
- `ui/return/format.ts`
- `ui/return/tabTitle.ts`
- `ui/return/saveTransfer.ts`
- `ui/return/return.css`

Changes to existing UI files:
- `ui/metaPanels.tsx`: the stamp card in the Gem Shop, and the Hall of Magic copy.
- `ui/life/lifeWindows.tsx`: `letterReady` waits while an arrival is pending, because the ledger replaces the letter.
- `ui/i18n/frReturn.ts`: French for every new string.

Root: `index.html`, `public/manifest.webmanifest`, `public/icon.svg`.

## Tests

Engine tests:
- `engine/return/rested.test.ts`:
  - a 24 h real gap gives 3 charges, capped at 6;
  - the carry adds up short gaps;
  - a clear spends one charge and doubles the gold;
  - an epoch-0 account gets nothing;
  - determinism through the reducer.
- `engine/return/stamps.test.ts`:
  - the card is endowed (starts at 2);
  - one stamp per real day, and a second claim the same day is refused;
  - missed days never take a stamp away;
  - the 10th stamp pays the gems and a free pull;
  - nothing ever decreases;
  - it goes through the reducer.
- `engine/return/away.test.ts`:
  - empty for a no-op gap;
  - completions are listed;
  - only new chronicle entries, ≤5 vignettes sorted by weight, variety first;
  - each expedition reports its own haul;
  - level-ups and the busy tally;
  - purity and determinism over a real absence.
- `engine/time/time.test.ts`: PI unchanged after 30 days, the Hardcore fade, and charges.
- `engine/pvp/pvp.test.ts`:
  - a captive is never synthesized purely offline, end to end over 10 days;
  - the 2% storeroom cap;
  - non-hardcore never deletes and the old `deleted` flag is honoured;
  - the Hardcore fixture keeps the canon deletion.
- `engine/rift/rift.test.ts` (decay only in hardcore) and `engine/shop/shop.test.ts` (no reset; PI = 7 × perLogin stays).

UI tests:
- `ui/return/arrival.test.ts`
- `heroLetters.test.ts`: written from a fresh memory; real job numbers; gift names in English and French; a guilt-phrase guard; deterministic; French.
- `lightsOut.test.ts`: timers, edge relation, teaser, goal bars, rested outlook, sign-off, honest title.
- `saveTransfer.test.ts`: an export → import round-trip equals the original (both file and code), junk is rejected without writing, commit keeps the old save aside, older saves migrate, file name.
- `StampCard.test.ts`

`ui/return/return.smoke.test.tsx` runs the real App:
- a save last seen 10 h ago with a finished promotion opens the ledger at mount, with one TICK, a charge built, no auto-claim, a single window, a one-tap gift, and the letter marked read;
- a fresh `now:0` account gets nothing;
- an absence under 2 h gets nothing;
- 30+ days plays the grey ceremony;
- Rest for now → Lights Out → Back up;
- `pmu:backup` opens the backup window, and a bad code changes nothing;
- the paste-code restore flow;
- the honest tab title.

`app.smoke.test.tsx` is untouched and green.

## Deviations, and why

- **Charges accrue from every elapsed world-ms, not only from closed-tab time.** The cap of 6 is what makes absence count, and detecting "away" on the client is unreliable. In practice an 8-hour session also earns a charge, which is harmless and generous.
- **The definition of "live play"** for the captive pause is a gap of 30 real seconds or less (`LIVE_GAP_WORLD`), because the lobby pumps a TICK every second. A hidden tab's throttled ticks count as away. This implements the spec's "`min(gap, livePlayWindow)`".
- **`login.streak`** is kept as a count of all days ever claimed (it never resets) rather than removed, because the schema field belongs to WP0. The UI no longer shows it as a streak.
- **The card's free pull** is a real Normal summon funded like the mercy pull: gold is added and then spent, so the player's gold is unchanged. No new RNG stream; it advances the gacha stream the same way a manual pull does.
- **The ledger only opens on a real-clock save.** A `lastSeenAtWorld` before 2024-01-01 counts as "never seen on a real clock". This is how `now:0` test accounts, and saves loaded in smoke tests, are excluded. A hydrated or `load()`ed save with a real stale timestamp does get the ledger (that is the arrival).
- **The ledger replaces Isel's letter on arrival.** `letterReady` returns false while an arrival is pending, the ledger offers "Isel's full letter", and closing the ledger dispatches `READ_LETTER`.
- **Hero letters use their own first-person templates** instead of `memoryLine`. `memoryLine` is a third-person profile caption ("Day 3 · Became friends with Sene"), and the letter needed the hero's own voice. They read the same memories.
- **The 30-day grey** desaturates the lobby canvas (`body.greyed .world-canvas`). The heroes do not doze, because that would need LobbyWorld (see the requests below).

## SHARED-FILE REQUESTS (for the integration pass)

1. **`engine/tuning.ts`**:
   - add `return.offline.liveGapRealSeconds: 30`, then have `engine/return/offline.ts` read it instead of its `LIVE_GAP_WORLD` constant;
   - remove `shop.streakBonusGems`, which nothing reads any more.
2. **`ui/i18n/fr.ts`**: drop the now-dead keys `'Daily login · streak {streak}'` and `'You missed a day — your {streak}-day streak is gone.'`.
3. **`engine/types.ts`**: the comment on `meta.login.streak` should read "days the login was claimed (never resets, S28)".
4. **WP7 (Menu footer)**: a "💾 Backup" item that runs `window.dispatchEvent(new CustomEvent('pmu:backup'))`. `openBackup()` and `BACKUP_EVENT` are exported from `ui/return/ReturnLayer.tsx`.
5. **WP8 / `ui/world/LobbyWorld.tsx`** (optional polish for S25): while `document.body.classList.contains('greyed')`, draw the walkers in their sleep pose ("the heroes dozing"). The class lasts about 1.2 s.
6. **HUD "Interference ×2 (3 left)"** (S24) belongs to whichever package owns the lobby HUD (WP7) or the tower HUD (WP3/WP4). `meta.rested.charges` holds the number.
7. **Hardcore opt-in**: nothing in the UI sets `meta.hardcore` yet. A "Canon rules (Hardcore)" checkbox on new-account creation (TitleScreen, WP1/WP7) would complete S25.

## Known gaps

- There is no way to opt into Hardcore from the UI (request 7).
- The grey ceremony desaturates the canvas but does not put the heroes to sleep (request 5).
- The backup nudge and the persistence request are tracked with per-browser localStorage flags (`pmu.backup.nudged`, `pmu.persist.asked`), not in the save. This is intentional: they are about this browser.
- `navigator.clipboard` and file downloads can't be exercised in jsdom. Their fallbacks (manual copy, the "downloads are not available" note) are in place.

## Review (independent pass, 2026-10-13)

Checked against §4.0, §4.7 and S24-S28. Ownership holds: every changed file is in WP6's owned list or new under `engine/return/` / `ui/return/`. `app.smoke.test.tsx` is untouched. Every `t()` literal in the package has its French in `frReturn.ts` (scripted check over `ui/return/*`, `metaPanels.tsx`, `lifeWindows.tsx`). The engine diff is deterministic and pure (the guard test passes; no clock or random reads). Edge probes found no crash and no leaked `undefined`/`{placeholder}` in EN or FR for: an empty roster, an all-dead roster, loop floors (F38), the world's end (F90) and past the slice top (F101).

**Issues found and fixed**
1. **The ledger never closed on a new game or an import.** It compared `accountId`, but every local account has the same default id. Saves are now told apart by `accountKey` (id + seed) in `arrival.ts`, used by the ledger, the hidden-tab return and the persist trigger. Smoke test: a new game closes the old save's ledger.
2. **The grey Re-interference broke under StrictMode** (`main.tsx` wraps the app in it). Its timers were started inside `arrive` and cancelled by an unmount-only cleanup, so the dev build's mount → unmount → mount cancelled them for good: the lobby stayed grey and the ledger never opened. The ceremony is now an effect with paired setup and cleanup. A StrictMode smoke test fails on the old code and passes now.
3. **Hero letters wrote old memories up as news.** On a quiet absence the writer was picked from weeks-old memories ("I think we are friends now", "I am still learning where everything is"). Now only memories made during the absence count, plus the timeless kinds (a gift, a grave, an echo). The template choice is also seeded per hero, which gives more variety.
4. **"You have the gold for a summon" showed on every return** for any Master with 1,000 gold. It is now news only when the absence made the summon affordable, matching the spec's "a summon now affordable".
5. **The ledger could say "your next 0 floor clears pay double gold."** The line is hidden when no charge is stored.
6. **The backup window re-encoded the whole save on every clock TICK.** That cost one full serialisation per second and reset the selection of a Master copying the code by hand, which is the fallback when the clipboard is unavailable. The code is now a snapshot taken when the window opens and refreshed after a restore. Smoke test added.
7. **Importing a file put a truncated copy (2,000 chars + "…") into the paste box,** so pressing "Check this save" again always failed. A file is now checked whole and the paste box stays for codes. The file input is cleared so the same file can be picked twice.
8. **Restore safety.** "Replace my save" is disabled while the Tower view is up (§4.0.7: nothing swaps state under a climb). If `store.load()` throws after the write, the old save is put back, so "Nothing was changed" stays true.
9. **A long-hidden tab shown again onto the Tower** queued a ledger for the next lobby visit, which would then report the Master's own floors as "while you were away". Only a return onto the lobby counts now.
10. **Tests strengthened:**
    - stale-memory letters;
    - `summonAffordable`;
    - the long-hidden-tab arrival (it opens once, with one window, and does not reopen);
    - a new `tabTitle.test.tsx` proving the title hook never dispatches and never flashes (a store whose `dispatch` throws, 12 checks over 3 minutes).

**Remaining concerns**
- **The charges do nothing on this branch alone.** Spending them (`consumeRested` in `tower.ts`) is WP3's job, but the ledger and Lights Out already promise "double gold". Integration must land WP3's consumption, or the copy overpromises.
- **The free pull on a completed card has no reveal.** It happens inside `CLAIM_LOGIN`, and the player only learns the hero's name from the stamp card note. A Summon Theatre reveal (WP1) would sell it better.
- **One unexplained "1 error" in the first full `npm test` run of the review** (950/950 tests passed). It did not reproduce in 8 further full runs or 8 runs of the return and app smoke files. It may be an existing timing flake, or one in the new fake-timer tests. Watch for it in CI.
- **Real days are UTC days** (`floor(nowWorld / (24h × factor))`, as the spec says), so the stamp day turns over at UTC midnight, not the player's local midnight.
- **No visual pass was possible** (no browser in this environment). The layout was reviewed from the CSS: the "Rest for now" button sits just above the lobby help line at bottom-left, and the nudge and the Rest button hide while any window is open.

**Additional SHARED-FILE REQUESTS from the review**
8. **WP0 / `engine/account`:** `accountId` defaults to the same value for every account, so it cannot identify a save. Either give new accounts a unique id or document that (`accountId`, `seed`) is the identity. WP6 now uses `accountKey()` from `ui/return/arrival.ts`.
9. **WP3 (integration):** wire `consumeRested` into the floor clear and show the results line "Interference ×2"; until then, the S24 copy in the ledger and Lights Out overpromises.
