# Pick Me Up! Infinite Gacha: making it fun, and making players come back

> **Status:** Built (see §6 "As built") · **Date:** 2026-10-12, built 2026-10-16 · Builds on the Living Lobby (2026-09-30) and the balance pass (2026-09-29). Answers the owner: "it is not fun, and when I quit nothing makes me wanna play it again" and "what about we change the art direction?"
> **Inputs:** docs/research/fun-juice.md, fun-retention.md, fun-loop.md, fun-art.md, plus four internal codebase maps (engine, shell, presentation, conventions; not committed — their line refs are pinned to `63c30a4`), my playtest findings, and spot checks of `/home/user/pick-me-up` at `63c30a4`.
> **Baseline:** `npm run typecheck` passes. `npm test` gives 40 files and 842 tests, all green.

**The verdict in one line:** the game has plenty of systems. What it lacks is a fun 30-second loop, and it has three things that actively work against the player:
- a flat first peak (the tutorial pull);
- a climb with no decisions, followed by a cliff that wipes the party for nothing in return;
- return systems built on loss.

The fix: rebuild the floor-level loop around **visible, player-chosen risk**, make every loss **pay something forward**, make every return **give something**, and spend art effort on **motion and feedback, not a new style**.

---

## 1. Diagnosis: seven root causes

Each cause lists the playtest evidence, where it sits in the code, and the research that explains it. "→" marks the fix in §3.

### RC1. The first peak is flat, and peak-end makes it the game's first memory
- **Evidence.**
  - The free 10-pull has no 3★ in **60.5% of 200 seeds**. 8 of the 200 seeds pull only 1★, and seed 1 pulls eleven 1★ (map-engine §a).
  - Procedural heroes below 4★ always get `skillIds: []` (`gacha.ts:439`). 1★ heroes are classless (`gacha.ts:111-112`).
  - All 10 cards land at once in a grid (`screens.tsx:179-186`, `setRevealed` at `:240-243`).
  - An all-1★ ritual is grey from start to finish (`STAR_COLOR[1] #9aa3bd`, `bits.tsx:28-36`), and 1★ and 3★ play the same sting (`screens.tsx:84-128`).
- **Research.**
  - The genre standard is a guaranteed early win: Genshin, Honkai: Star Rail and Arknights beginner banners ([Genshin wiki](https://genshin-impact.fandom.com/wiki/Wish), [PCGamesN](https://www.pcgamesn.com/honkai-star-rail/warps)).
  - Peak-end: players judge a session by its peak and its last moment ([CHI '16](https://dx.doi.org/10.1145/2858036.2858419)).
  - The reveal grammar is colour before identity (WuWa and HSR, [hostedgg](https://hostedgg.com/blog/gacha-pull-reveal-color-culture)).
- → S1, S2.

### RC2. The 30-second loop has no decisions in it
- **Evidence.**
  - A floor is: press Enter, then watch 15-60 s.
  - Floors 1-12 rate "Safe" because party-to-budget is **2.2-3.3**. `earlyBudgetBoost=4` shrinks as f grows and cancels the 1.06^f growth (`tower.ts:82-96`, `tuning.ts:136-140`). The ratio only drifts from about 2.7 to 2.0 by F14.
  - A fresh account gets **1** order per battle (`tower.ts:476-478`). The orders are 13-px buttons at the far end of the control bar with only a `title=` tooltip (`BattleScene.tsx:517-546`).
  - Nothing ever prompts the player to use them.
- **Research.**
  - "A game is a series of interesting decisions" ([Meier](https://gamedeveloper.com/design/video-sid-meier-explores-interesting-decisions-in-gameplay)). Here: about 0 per floor.
  - Trivial patterns get "iconified" and bore the player ([Koster](https://www.raphkoster.com/wp-content/uploads/2026/07/Austin-Game-Conference-2003-Keynote-Theory-of-Fun.pdf)).
  - Nail the 30 seconds and *vary* it ([Griesemer](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html)).
  - In auto-battlers all agency is between fights ([TFT](https://www.pockettactics.com/teamfight-tactics-design)).
  - Without difficulty, the systems never engage ([Solomon](https://gamebanshee.com/kx4fy)).
- → S12-S18.

### RC3. Difficulty is a cliff, and the scout misreports it, so permadeath feels arbitrary
- **Evidence.**
  - Anchor floors at F20 and below are authored and **not scaled** (`tower.ts:271-287`, early return at `:278`).
  - F15 is a 10-unit Escort whose real ratio is **0.53-1.05**, while the scout shows 1.2-2.3, "safe" or "fair".
  - The scout divides party CP by `floorPower`, not by the CP of the encounter it has already built. Its hero CP also leaves out sanity, favor, gear and passives (`scout.ts:49-51`, `100-103`, versus `unit.ts:124-145`).
  - With a lucky 3★ seed, the climb instead stays trivially safe through F21+.
- **Research.**
  - "A single additional enemy turns a battle from a fun challenge to completely impossible" ([Subset](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)).
  - Use a sawtooth, not a ramp ([Fractal curves](https://www.gamedeveloper.com/design/doing-difficulty-right-fractal-curves)).
  - Telegraphed intent makes a loss feel *caused* ([Slay the Spire](https://pcgamer.com/best-design-2019-slay-the-spire), [Into the Breach](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)).
- → S12, S13.

### RC4. Failure is total and gives nothing back, so one bad floor starts a death spiral
- **Evidence.**
  - Combat runs until every hero is dead (`combat.ts:421-434`). Bot runs: **22 of 24 losses were 5/5 deaths**. In 8 of 10 realistic seeds the whole roster died between F15 and F25 **with 31k-97k gold unspent**.
  - The mercy pull needs gold < 3,000 *and* zero heroes alive (`gacha.ts:527-530`).
  - The recovery "reinforcement" is one 70/25/5 pull, so usually a 1★ (`events.ts:261-267`).
  - The Memorial has **no mechanical effect** (`life.ts:287-288`).
- **Research.**
  - Permadeath plus attrition is a positive feedback loop and needs a catch-up loop ([feedback loops](https://computerscience.chemeketa.edu/cis125greader/MechanicsDynamics/FeedbackLoops.html)). XCOM EW's rule is that the fewer soldiers you have, the stronger the protection ([GameBanshee](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html)).
  - Death should advance something: Hades ([Kasavin](https://inlander.com/culture/hades-writer-greg-kasavin-on-how-he-made-video-game-deaths-drive-a-feel-good-story-22725237)), Into the Breach ([one pilot carries over](https://wegotthiscovered.com/gaming/into-the-breach-review/)), Inscryption ([Death Card](https://inscryption.fandom.com/wiki/Deathcard)), and Shadow of Mordor's Nemesis system ([GDC](https://gdconf.com/news/attend-gdc-2018-behind-scenes-look-shadow-wars-nemesis-system)).
- → S19-S23.

### RC5. Dead time and feedback that means nothing
- **Evidence.**
  - Replays run 10-20 s on normal floors and 31-75 s on wave floors at 1x. Every battle starts at 1x and the speed choice is not saved (`BattleScene.tsx:255`).
  - The stage shakes on **66.9% of hits** in F1-8 (`:306-311`), so shaking means nothing. Hitstop is a flat +140 ms on crits only, with no visual freeze (`:263-264`).
  - Every hit plays the same pitch. A goblin dying and a hero's permadeath play the same sound (`sound.ts:125-127`, `BattleScene.tsx:250`).
  - Results are static: no count-up, no materials, no level-ups, and two clicks per floor (`screens.tsx:388-502`).
  - Shake translates outside `scale(zoom)`, so it is under a pixel at zoom 3-4 (`BattleScene.tsx:340-341`).
- **Research.**
  - Juice is maximum output for minimum input ([Juice it or lose it](https://www.youtube.com/watch?v=Fy0aCDmgnxg), [source](https://github.com/grapefrukt/juicy-breakout)).
  - Scale hitstop to how much the hit matters ([Sakurai](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/)).
  - Trauma-based shake ([Eiserloh](https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math)).
  - **Feedback tied to the player's success raises enjoyment; plain amplification lowers it** ([Kao et al., CHI '24](https://spiral.imperial.ac.uk/entities/publication/253c32f5-d124-4a23-88b5-9aaaf114608d)).
  - Fights of about 10-20 s, with overtime that compresses the tail ([TFT](https://www.breakflip.com/actualites/107484.html), [Backpack Battles](https://en.wikipedia.org/wiki/Backpack_Battles)).
- → S6-S11.

### RC6. Too much on screen at once, and no visible goal
- **Evidence.**
  - All **24** Menu destinations render and are clickable from minute one (`App.tsx:82-135`, `go()` at `:207-215`, `LobbyWorld.tsx:142-167`).
  - `FirstSteps` disappears after 6 steps and leaves no pointer (`FirstSteps.tsx:62-68`).
  - Bots die with 31k-97k gold unspent: nothing says "you can summon now".
  - The Master-Level gates already form a disclosure schedule (ML2 about F2, ML3 F7, ML4 F17), but the menu ignores it (map-shell §a).
- **Research.**
  - Teach the core loop first and defer side systems ([Apple](https://developer.apple.com/app-store/onboarding-for-games/)).
  - Gate features progressively: Clash Royale, AFK Arena, Genshin ([Unity FTUE](https://unity.com/how-to/10-first-time-user-experience-tips-games)).
  - Working memory holds about 4 chunks ([Hodent](https://gamedeveloper.com/design/video-inside-the-ux-of-onboarding-and-player-engagement)).
  - Goal gradient: people speed up as a goal gets close ([Kivetz](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)).
- → S3, S4.

### RC7. Coming back is a list of losses
- **Evidence.**
  - PI decays about 14% per real day after 2 real days (`interference.ts:38-43`).
  - Account deletion is **decided on the return command** (`time.ts:110-121`). The returning player is the one who finds the world wiped.
  - The login streak resets on any missed *world*-day. A world-day is 8 real hours, so 3 resets per real day are possible (`shop.ts:74-87`, `daily.ts:40`).
  - Offline invasions can synthesize a captive after about 1 real day (`pvp.ts:301-311`).
  - Isel's letter carries nothing to collect (`lifeWindows.tsx:338-398`).
  - Nothing happens at session end: no title change, no `visibilitychange`, no teaser (map-shell §d).
  - Safari's ITP can wipe localStorage after 7 days without interaction.
- **Research.**
  - *Playing by appointment* is a temporal dark pattern ([Zagal et al.](https://research.chalmers.se/en/publication/177148)).
  - Self-determination theory: autonomy predicts future play, obligation does not ([PENS](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/)).
  - Reframing loss as bonus: WoW's rested XP ([wiki](https://warcraft.wiki.gg/wiki/Rested)).
  - A broken streak is a quit trigger ([Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)).
  - Leave an open loop at session end ([Zeigarnik](https://en.wikipedia.org/wiki/Zeigarnik_effect), [Hemingway](https://fs.blog/ernest-hemingway-three-tips-on-how-to-write-fiction/)).
  - Gifts left while you were away ([Neko Atsume](https://en.wikipedia.org/wiki/Neko_Atsume)).
  - Safari ITP ([WebKit](https://webkit.org/?p=10218)).
- → S24-S28.

---

## 2. Art-direction verdict: **partial refresh. Keep the style and make it move.**

**Answer to the owner's question ("what about we change the art direction?"):** no, not wholesale. It is an understandable instinct, but it would cost 6-12+ weeks and fix none of the seven root causes above.

**Why not wholesale:**
1. **Art drives acquisition. The loop drives retention.**
   - Slay the Spire shipped with art its own creator called bad ([PCGamesN](https://www.pcgamesn.com/slay-the-spire-2/art-direction)).
   - Vampire Survivors used about £1,100 of assets and reached 27M+ players ([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)).
   - Artifact's two-year rebuild did not bring players back ([CGM](https://www.cgmagonline.com/news/artifact-2-0-cancelled/)).
   - The owner's complaints ("not fun", "no reason to return") are loop complaints.
2. **The current look is good and fits the tone.** The code-generated pixel art is cohesive, and chibi heroes who die permanently work like Cult of the Lamb's "cute lens on a dark world" ([Nintendo Life](https://www.nintendolife.com/features/its-a-bit-more-evil-than-animal-crossing-behind-the-cutesy-cult-sim-everyones-talking-about)). The weakness is that the cute side is **static** and the dark side passes **too fast to feel**.
3. **A restyle is expensive and risky.**
   - About 3,800 generator lines plus about 700 CSS lines would be redone.
   - The 24×32 frame size is baked into BattleScene layout, the lobby grid and `pixel.test.ts`.
   - It would break the "everything is code, no assets" principle (`render.ts:1-6`).
   - Octopath's team found a restyle that overshoots "lost the appeal of pixel art" ([Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/)).
4. **The part-based generator is a strength.** `heroSprite.ts` draws arms, weapons and legs as separate parts. That works like Dead Cells' 3D-to-pixel pipeline: we can generate wind-up, strike, hurt and KO poses for *every* procedural hero at once ([Dead Cells](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)).

**Visual work that is worth doing,** scoped at about 2-3 weeks and all of it part of the catalog. Kao's CHI '24 result is the budget rule: **put juice on outcomes the player caused or lost**, not on every hit.

| # | Visual work | Where | Catalog |
|---|---|---|---|
| V1 | Staged summon: escalating colour tell, cards one at a time in ascending rarity, distinct stings | screens.tsx, summonFx.ts | S2 |
| V2 | Procedural poses (attack / cast / hurt / KO) from parts, plus idle breathing and blinks with a per-unit phase | heroSprite.ts, enemySprite.ts, bitmap.ts | S10 |
| V3 | Graded hitstop, white flash, squash and stretch, anticipation lunge, trauma shake scaled to zoom, reduced-motion support | BattleScene, battle.css | S7 |
| V4 | Readability for decisions: on-stage hero HP with a lagging damage trail, intent icons, a "Saved!" callout | BattleScene | S8, S16, S17 |
| V5 | Weight on death: 300 ms slow-motion, desaturation, a grave marker that stays on the stage, a distinct sting | BattleScene, sound.ts | S9 |
| V6 | Reward cascade: coins fly to the counter, the counter ticks up, a "next summon" bar fills | ResultsScreen | S11 |
| V7 | UI colour hierarchy: one gold accent for the main action per screen; rarity colours only for rarity; red only for danger; locked items dimmed | ui.css | S3, S10 |
| V8 | A cheap light layer: additive sparks (`'lighter'`), vignette, colour grade per act, saturation capped | battleBg.ts, battle.css | S10 (P2) |
| V9 | Lobby time-of-day tint and ambient particles; the lobby desaturates while greyed and colour floods back on return | world/ambience.ts, return layer | S10, S25 |

**Not doing:** a new palette or resolution, painted assets, a CRT filter (could be an optional toggle later), or a 3D/HD-2D look.

---

## 3. Design pillars and the solution catalog (28 changes)

**The target aesthetics (MDA)** are *Challenge* (the tower), *Fantasy* (the cast), *Discovery* (pulls and floors) and *Fellowship with the cast* (the lobby). Every change below serves at least one of them.

**Notation:**
- **Priority:** P0 is required for the "fun" milestone, P1 is strongly recommended, P2 is nice to have.
- **Effort:** S is under 1 day, M is 1-3 days, L is more than 3 days.
- **Layer:** Engine (pure, deterministic) or UI.
- **Owner:** the work package from §4.

### Pillar 1: The first 10 minutes

**S1. A guaranteed first pull that stays honest.** P0 · S · Engine · WP1
- **Player sees:** the free 10-pull always contains **at least one 3★ with a class and its signature skill**, and **at least three heroes of 2★ or higher**. The underdog flavour stays: most cards are still 1-2★.
- **Why:** beginner banners are the genre's strongest convention ([research-loop §2](https://genshin-impact.fandom.com/wiki/Wish)), and peak-end decides the first memory ([CHI '16](https://dx.doi.org/10.1145/2858036.2858419)).
- **Code:** `gacha.ts:539-546`.
  - Replace the recursion with an explicit 10-pull loop that calls `summon(cur, { minStar })` from WP0.
  - `minStar` is set by deficit: pull i gets `minStar: 2` when the 2★+ count so far plus the pulls left is still short of 3, and pull 9 gets `minStar: 3` if no 3★ has appeared yet.
  - It lifts the *same* star draw, the way pity does (`gacha.ts:623-628`), so no new draws are taken.
  - Post-process **only in the tutorial branch**: give the best 3★ `CLASS_SKILL[heroClass]` (`content/skills.ts:437-443`) at Lv1.
- **TUNING:** `ftue.tutorialMinTopStar=3`, `ftue.tutorialMin2Plus=3`, `ftue.tutorialSignatureSkill=true`.
- **Tests:**
  - `gacha.test.ts:614-623` must stay green (free once, gold unchanged, flag set, second throws).
  - `gacha.test.ts:422-431` (procedural heroes have `skills=[]`) stays green because it goes through `summon()`.
  - New: 200 seeds give ≥1 3★ with ≥1 skill and ≥3 2★+.

**S2. Summon Theatre.** P0 · M · UI · WP1
- **Player sees:**
  1. The circle opens **white** and **escalates** through blue, gold and rainbow up to the pull's best `shownStar`. Upgrades only, never a downgrade.
  2. The cards are dealt face down and flip **one at a time in ascending rarity, best last**. The hold is about 250 ms for 1★, 600 ms for 2★, 1.5 s for 3★, and 3 s for 4★+ with a music change.
  3. Each 1★ flips to a **person, not a stat line**: background, favourite food, hobby (`personalityOf`, `life/personality.ts:108`), and a one-line intro (`speak()`, `speech.ts:453`).
  4. Click, Space or Enter advances. "Skip ▸▸" appears after the first card and jumps to the existing summary grid.
- **Why:** colour arrives before identity, and escalation stretches the gap between them ([WuWa/HSR](https://samurai-gamers.com/wuthering-waves/wuwa-wish-rarity-indicator-guide/), [Hearthstone flip](https://hearthstone.wiki.gg/wiki/Card_Pack)). Upgrade-only tells, never a fake-out downgrade ([research-juice §2](https://gamewith.net/69656)).
- **Code:**
  - `screens.tsx`: SummonRitual at `:84-128`; the reveal at `:179-186` and `:240-243` becomes a `RevealSequence` (new `ui/summon/RevealSequence.tsx`).
  - Keep `shownStar` (whale-bait display) everywhere.
  - `sfx('reveal', {star})` comes from WP0 and is refined by WP2.
  - Foil sheen on 4★+ cards in `summon.css`.
  - Presentation randomness comes from `hashString(hero.id)`, never `Math.random`.
- **Tests:** keep the smoke strings "Summon ×10", "Advanced pool" and "Not enough gems" (`app.smoke.test.tsx:211-222`).

**S3. Progressive campus: 4 doors now, the rest earned with a fanfare.** P0 · M · UI · WP7
- **Player sees:**
  - The Menu shows a **"Now"** group of big tiles: Tower Gate, Mobius Summon, Party, Roster.
  - Then **one "Next unlock"** tile with progress, e.g. "Kitchen: clear Floor 1 (0/1)".
  - Then a dimmed **"Later"** grid with a padlock and an unlock condition on each item.
  - Crossing a threshold plays a full-screen **"New facility!"** card: Isel gives one sentence, a single "Show me" action walks the Master to the building, and `sfx('unlock')` plays.
  - In the walkable lobby, locked buildings show a boarded sign. Walking in opens the panel with a "Preview, opens at Floor N" ribbon.
- **Schedule** (`TUNING.unlocks`, the first of the floor or event that comes first):

  | Unlocks at | Facilities |
  |---|---|
  | F1 | Kitchen, Memorial (or at the first death), Daily Dungeon |
  | F2 | Tactical Center, Dormitory, Tavern |
  | F3 | Training Center, Garden |
  | F5 | Forge, Infirmary (or at the first grief/wound), Market |
  | F7 | Promotion Chamber (or when any hero reaches the level cap), Synthesis |
  | F8 | Gem Shop |
  | F10 | Library, Transfer Station, Watchtower |
  | F15 | Guild Hall |
  | F20 | Hall of Magic |
  | ML20 | Crack of Time (existing rule) |

- **Why:** progressive disclosure ([Clash Royale](https://gamedeveloper.com/design/breaking-down-supercell-s-next-hit-clash-royale), [AFK Arena](https://theriagames.com/?p=63795), [Unity](https://unity.com/how-to/10-first-time-user-experience-tips-games)). Introduce each system at the moment it becomes useful ([Hodent](https://gamedeveloper.com/design/video-inside-the-ux-of-onboarding-and-player-engagement)).
- **Code:**
  - New `ui/shell/unlocks.ts` with a pure `placeAccess(state, place) → {open, reason, unlockAt}`.
  - `GameMenu` (`App.tsx:82-135`).
  - `interact()` and `travel()` (`LobbyWorld.tsx:493-511`, `982-997`), `lockedRooms()` (`:317-334`), and the E-prompt `labelFor` (`:523-527`).
  - The "seen" set goes in `life.unlocks` and is written with the `SEE_UNLOCK` command.
- **Hard rule:** locked items stay `button.menu-item` and still open their panel (as a preview). This keeps **all 13 fresh-account smoke tests green** (`app.smoke.test.tsx:79-333`) without editing them. **Never remove props** (`world.test.ts:67-74`).

**S4. A goal stack that is always on screen.** P0 · M · UI · WP7
- **Player sees** a compact tracker in the lobby HUD and the Scene bar with three lines and three bars:
  - **Short:** "Floor 7: Fair · reward ◆ stones".
  - **Medium:** "Next summon 2,100/3,000", which becomes a gold **"Summon now!"** chip when affordable; or "Boss in 2 floors"; or "Kitchen opens at F3".
  - **Long:** "Act I: The Prairie 7/10 · Collection 14/40".
  - Bars are seeded with endowed progress: tutorial heroes count toward the collection.
  - Clicking a line travels there. `FirstSteps` keeps running inside it until onboarding is complete.
  - Hero requests come from state: `xp.atCap` gives "Promote me", grief gives "Visit the Memorial", a liked job left unassigned gives "Assign Kael to the Forge".
- **Why:** goal gradient ([Kivetz](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)), endowed progress ([Nunes & Drèze](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/)), Hades puts the reward on every door ([Prima](https://primagames.com/tips/hades-door-symbols-guide-boons-artifacts)). It also fixes "31k-97k gold unspent".
- **Code:**
  - New `ui/shell/goals.ts` with a pure `nextGoals(state, nowWorld)`, and `ui/shell/GoalTracker.tsx`.
  - It replaces the `<FirstSteps>` slot (`LobbyWorld.tsx:1064`) and is added to `Scene` (`App.tsx:51-80`).
  - Inputs: `scoutFloor`, `ANCHORS`, `actForFloor`, `TUNING.gacha.normalCostGold`, and `completesAtWorld` timers.
- **Pitfall:** no tracker button text may contain "Enter", "Advanced", "Treasure", "Claim +50", "Banquet", "Summon ×10" or "Menu" (the smoke `clickButton` clicks the *first* match). Use "Summon now!" carefully: it must not contain "Summon ×10". It doesn't.

**S5. Scripted first decisions in the first sessions.** P1 · S · UI · WP2 (prompt) and WP7 (copy)
- **Player sees:**
  - On the first battle in which a hero would die (or F3 at the latest), the **Decisive Moment** (S16) is forced on with Isel's coaching line: "Your orders change fate. Try Protect."
  - The first time two Doors are offered (S13), Isel explains the skull door once.
- **Why:** people learn by doing, in context ([Hodent](https://gamedeveloper.com/design/video-inside-the-ux-of-onboarding-and-player-engagement)).
- **Code:** a `GUIDE_STEP 'decisive-tutorial'` flag in the existing `life.guide.done` (no schema change). A prop on BattleScene, `tutorialPrompt?: boolean`.

### Pillar 2: Feel and juice

**S6. Pacing: 2x by default, Sweep, and compressed dull events.** P0 · S · UI · WP2 (replay) and WP4 (Sweep decision)
- **Player sees:**
  - Battles start at the **last-used speed (2x by default)**. Speeds are 1/2/4/**8**.
  - Normal hits run 120-180 ms. Crits, kills, skills and deaths keep full time.
  - After 20 s of replay time, "Overtime" ramps the replay to 4x (TFT).
  - **Breather or "Safe" floors that are won with no deaths resolve as a 2-s "Sweep" highlight** (top 3 hits, the kill, the loot) straight into results. A "Watch full replay" link is offered.
  - **A fight in which any hero dies is never swept.**
  - Target: median normal-floor replay **≤ 15 s** at default speed.
- **Why:** [TFT overtime](https://www.breakflip.com/actualites/107484.html), [Arknights Auto Deploy](https://arknights.wiki.gg/wiki/Auto_Deploy), Griesemer's 30 seconds.
- **Code:**
  - `BattleScene.tsx:31` (SPEEDS), `:255` (initial speed from `prefs`), `:258-269` (scheduler). Fix the DURATION semantics at `:33`: to hold hits longer, raise `act`, not `hit`.
  - The `mode: 'full'|'highlights'` prop is a WP0 contract.
  - WP4's `TowerScreen.fight` (`:365-366`) chooses `'highlights'` when the report kind is breather (or threat is safe), `prefs.autoSweep` is on, the floor was cleared and `fallenHeroIds.length===0`.
- **State:** none. `ui/prefs.ts` (localStorage `pmu.prefs`, wrapped in try/catch).

**S7. Impact kit: hits that feel connected.** P0 · M · UI · WP2
- **Player sees:**
  - **Hitstop scaled by damage** on every meaningful hit: `40 + 140·min(1, dmg/maxHP)` ms, +100 on a crit, at least 180 on a kill, divided by √speed. The attacker freezes while the victim shakes ±1 stage-px.
  - A **white flash** for 60 ms, then a red tint for 60 ms.
  - **Squash** of the victim (1.25, 0.8), easing back over 180 ms. **Anticipation**: the attacker pulls back 3 px over 100 ms, then lunges.
  - **Trauma shake**: +0.15 per hit, +0.35 per crit, +0.5 per kill or hero death, offset `8px·trauma²·noise`, decay 1.5/s, no rotation, **scaled by zoom**.
  - Shake fires only on crits, kills and ≥50% maxHP hits, not on 66.9% of hits as today.
  - Respects `prefers-reduced-motion` and a shake slider.
- **Why:** [Sakurai](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/), [SSB hitlag](https://www.ssbwiki.com/Hitlag), [Eiserloh trauma](https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math), [juicy-breakout freeze ramps](https://github.com/grapefrukt/juicy-breakout).
- **Code:**
  - `BattleScene.tsx:263-266`, `:305-311`, `:340-341` (move the shake inside the scale, or multiply by `--zoom`).
  - Restart animations by alternating `shake-a`/`shake-b` by `seq` parity, or by keying the sprite wrapper on `seq`.
  - New `battle/fx.ts` (pure timing math, unit-tested) and `battle/battle.css` (extracted by WP0).

**S8. Readability that serves decisions.** P1 · M · UI · WP2
- **Player sees:**
  - **On-stage hero HP bars** with a lagging damage trail (heroes have none today, `BattleScene.tsx:384`).
  - A red pulse under 25% HP.
  - Damage numbers that pop (0 → 1.4 → 1.0 in 120 ms) and turn **gold when the hit is ≥25% of max HP** (the Diablo colour highlight).
  - A **combo counter** ("5 HITS!"): the hero side already acts a median of 5 times in a row.
  - Element-coloured sparks (about 6 per hit, 14 per crit) with offsets seeded by `hashString(seq+i)`.
- **Why:** [Diablo numbers](https://us.diablo3.com/blog/19996041), [The Bazaar readable cause](https://mobalytics.gg/the-bazaar/guides/keywords-and-terms).
- **Code:** `Snap.combo` (`BattleScene.tsx:19-29`), the frame builder (`:137-231`), popups (`:394-406`).

**S9. Death with weight, and permanence on the stage.** P0 · S · UI · WP2
- **Player sees:** when a **hero** falls:
  - 300 ms of slow motion, the sprite desaturates, and a **unique low sting** plays (no longer the goblin death sound).
  - A **grave marker stays on the stage** until the fight ends.
  - The existing last-words card follows.
  - Enemy deaths stay quick.
- **Why:** [Vlambeer permanence](https://victorweidar.wordpress.com/2016/10/06/the-art-of-screenshake/), [XCOM](https://gamedeveloper.com/design/-i-xcom-i-designer-consequences-make-success-so-much-sweeter).
- **Code:** `BattleScene.tsx:250`, `:266`, `:421-431`. `sfx('heroFall')` (WP0 stub).

**S10. Living sprites: procedural poses and idle life.** P1 · M · UI (pixel) · WP8, consumed by WP2
- **Player sees:**
  - Battle units **wind up, strike with a 2-px weapon trail, recoil when hurt, and slump on KO**.
  - Every unit breathes (1-px bob) and blinks every 2-5 s, with a per-unit phase offset (today every unit bobs in sync).
  - Bespoke monsters lean (shear), squash and flash white.
  - P2 (V8): an additive spark layer, a vignette and a colour grade per act.
  - P2 (V9): a time-of-day tint in the lobby, plus fireflies and leaves.
- **Why:** [slynyrd idle](https://slynyrd.com/blog/2018/8/19/pixelblog-8-intro-to-animation), [slynyrd melee](https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks), [Spine-style part motion](https://en.esotericsoftware.com/spine-in-depth).
- **Code:**
  - Append `drawHeroPose(L, pose)` to `heroSprite.ts`, built on `drawSide` (`:500-703`). **Do not widen `WalkFrame`.**
  - New cache prefix `hp|${lookKey}|${pose}` in `sprites.ts`. `humanoid()` gets a pose parameter in `enemySprite.ts`.
  - New *functions* in `bitmap.ts` (`flashWhite`, `shear`, `rimLight`, `grade`). **Never change `outline`.**
  - `battleBg.ts` grade pass.
  - WP0 provides stubbed `heroPoseUrl`/`enemyPoseUrl` so WP2 can wire them in parallel.
- **Tests:** `pixel.test.ts` checks that frames are exactly 24×32 with more than 150 opaque pixels, that left and right mirror, that 60 busts are distinct, that 14 backdrops differ, and that outline uses INK. Append new `look.ts` RNG draws *at the end* only.

**S11. Reward cascade.** P0 · M · UI · WP4
- **Player sees:**
  - VICTORY auto-advances after 1.2 s, so a floor takes one click instead of two.
  - Gold and XP **count up** with rising-pitch coin ticks while coins fly from the defeated enemies to the header counter.
  - New rows: **"▲ Mira Lv 6→7"** with bust and level-up sting, and **materials won** (not shown today).
  - Kind and Door bonuses, the Sortie purse (S15) and Pent-up Interference (S24) as separate visible lines.
  - A **"Next summon" bar** with a "Summon now!" call to action, and a **"Next:" teaser** for the next floor.
- **Why:** Vampire Survivors' chest fanfare ([AV Club](https://avclub.com/vampire-survivors-is-an-addictive-castlevania-parody-1848883748)), Balatro-style counting ([analysis](https://blakecrosley.com/guides/design/balatro)), success-dependent feedback ([Kao '24](https://spiral.imperial.ac.uk/entities/publication/253c32f5-d124-4a23-88b5-9aaaf114608d)).
- **Code:**
  - `ui/ResultsScreen.tsx`, extracted from `screens.tsx:388-502` by WP0.
  - TowerScreen keeps `preLevels` next to `pending` (`TowerScreen.tsx:324,365`) and passes them in.
  - A navigation callback `onGo(view)` is threaded from App into TowerScreen (WP0 adds the optional prop).

### Pillar 3: Tension and choice in the climb

**S12. An honest scout with named threats.** P0 · S · Engine and UI · WP3 (engine), WP4 (card)
- **Player sees:**
  - The threat rating is computed from the **real encounter**: Σ `buildCombatUnit(h,…,inventory).cp` over Σ `enc.waves[].units[].cp`, excluding looming units.
  - It lists the **1-2 named threats** with the reason: "Bone Choir ×3: heals each other", "Ogre opens with Cleave on your front row (~180)".
  - It shows the floor **Kind**, the rout threshold and any Last Stand or mercy notes.
  - **Contract: a floor scouted Safe or Fair should essentially never kill.**
- **Why:** threat honesty ([Slay the Spire intents](https://pcgamer.com/best-design-2019-slay-the-spire), [Into the Breach](https://rpgcodex.net/content.php?id=10843)).
- **Code:** `scout.ts:49-51`, `72`, `100-103`; new `ScoutReport` fields from WP0. Opening-move threats come from the highest-power skill in each enemy's `skills`.
- **Tests:** `scout.test.ts:16-31` (the threat bands stay; the report shape gains fields). New sim metric: over 20 seeds × F1-25, **0** deaths on floors scouted Safe, and Fair floors with deaths **≤ 5%**.

**S13. A sawtooth climb with Doors: player-chosen risk on every floor.** P0 · L · Engine (WP3) and UI (WP4)
- **Player sees:** from F3, after every clear, **two Doors** for the next floor, each with a kind icon and a **reward icon** (Hades).

  | Door | Fight | Reward |
  |---|---|---|
  | **Path** | about 1.0× budget, "Fair" | Standard rewards. |
  | **Skull (Elite)** | about 1.45× budget | ×2 gold, a guaranteed Promotion Stone, and a **Boon** (S14). |
  | **Breather** | about 0.6× budget, Sweep-eligible | Offered right after a boss. |
  | **Rest** | No fight | +30 Sanity to the party and a cooked meal. Offered before a boss with chance `doors.restBeforeBoss`. |
  | **Cache** | No fight | Gold and stones. Chance `doors.treasureChance`. |

  - Every 5th floor stays the authored **Boss** anchor, now **scaled to budget at F20 and below too**, with clamps.
  - **Director as a mercy cap only:** `budget = min(staticBudget(f, kind), rosterCp × mercyBand(kind))`, where `rosterCp` is the top 5 fightable heroes by unit CP. **It never raises difficulty for a strong player.** Strong players opt into Skull doors for better loot instead (active DDA). Weak or shrunken rosters automatically get relief (XCOM's rule).
  - Budget steps between consecutive Path floors are capped at +12%.
  - F1-F2 stay tutorial floors, unchanged. **The lone Islat Han must still clear F1.**
- **Why:**
  - Flow through active DDA ([Jenova Chen/flOw](https://en.wikipedia.org/wiki/Flow_(video_game))).
  - Sawtooth ([fractal curves](https://www.gamedeveloper.com/design/doing-difficulty-right-fractal-curves)).
  - Door reward icons ([Hades](https://primagames.com/tips/hades-door-symbols-guide-boons-artifacts)).
  - Elites trade risk for relics ([Slay the Spire](https://metabot.gg/en/slay-the-spire-2/guides/when-to-fight-elites)).
  - Pacing director ([L4D](https://modl.ai/?p=1984)).
  - Cliff caps ([Subset](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)).
- **Code:**
  - New `engine/climb/kinds.ts`: `floorKindBase(f)`, `floorBudget(state, f, kind)`, `staticBudget`, `mercyBand`.
  - New `engine/climb/doors.ts`: `rollDoors(state, nextFloor)` on stream `rngFor(seed,'doors',floor)`, and `chooseDoor`.
  - Use `floorBudget` in `buildFillerEncounter` (`tower.ts:318`), the anchor scaling (`tower.ts:271-287`, drop the `floor<=20` early return in favour of the clamp), `sanityDrain` (`tower.ts:569`), the scout (`scout.ts:101`) and the sim (`sim.ts:425,496`).
  - **`floorPower` stays monotone.**
  - Doors are rolled in `playFloor` step 6c on a clear and stored in `tower.doors`.
  - `CHOOSE_DOOR` sets `tower.kind`.
  - **`ATTEMPT_FLOOR` with no choice made defaults to `doors[0]`** (always Path or Breather), so bots, tests and old flows keep working.
  - Rest and Cache doors resolve on `CHOOSE_DOOR` with no battle. They advance the floor and set `highestCleared` (no softlock), but give no Master XP, PI or floor gold beyond their own reward.
- **State:** `tower.kind: FloorKind`, `tower.doors: Door[] | null`.
- **TUNING:** `climb.kindMult`, `climb.mercyBand`, `climb.maxStepPct`, `climb.directorFromFloor=3`, `climb.doors.*`, `climb.reward.*`, plus re-tuned `tower.earlyBudgetBoost` so a median post-tutorial roster sees Path ratios of 1.2-1.5 on F3-F14.
- **Tests (must update, WP3):**
  - `tower.test.ts:306-345`: the filler fits `floorBudget`, not `floorPower`, for F3-F9.
  - `tower.test.ts:388-400`: F5 has 6 units, unless the clamp changes the count. Keep the count and scale with `powerMult`.
  - `act2.test.ts:65-118` (F15/F20).
  - `fullClimb.test.ts:184-200`: F25 bonus options; "filler first clear opens nothing" becomes "opens Doors, not an event".
  - Keep green: `loop.test.ts:72-83` (lone starter clears F1), `sim.test.ts:13-20` (F5+ in 4 days).

**S14. Boons: pick 1 of 3 after an Elite or a Boss.** P1 · M · Engine (WP3) and UI (WP4)
- **Player sees:** a three-card choice after an Elite or Boss clear. The effects last for the current **Sortie** (S15) and are shown as small icons in the party window.
- **Starting set of 12:**

  | Boon | Effect |
  |---|---|
  | Iron Vow | A Protected hero takes 20% less damage. |
  | Hunter's Mark | The Focus target takes 15% more damage. |
  | Second Wind | The first hero to drop below 25% HP heals 30%, once per battle. |
  | Quartermaster | +1 order per battle. |
  | War Chest | +25% gold. |
  | Scholar's Lamp | +25% XP. |
  | Shieldwall | Warriors get +10% pDef/mDef. |
  | Volley | Archers get +10% spd. |
  | Arcane Tide | Mages get +10% mAtk. |
  | Sanctuary | Healers' heals +15%. |
  | Underdog | 1-2★ heroes get +12% all stats. |
  | Calm Mind | Sanity drain −40%. |

- **Why:** [Hades boons](https://www.tomsguide.com/uk/features/hades-exclusive-interview-supergiant), [TFT Armory agency](https://www.riotgames.com/en/news/dev-teamfight-tactics-reckoning-learnings).
- **Code:**
  - Add `'boon'` to `TowerEventKind`. Open the event at `tower.ts:647-654` with three ids from `rngFor(seed,'boon',floor)`. Resolve it in the `events.ts` switch (`:226-280`) with `RESOLVE_EVENT`.
  - Apply stat boons as **pre-battle unit transforms** in `tower.ts:500-521`; `+orders` in `ordersAllowed`; reward multipliers in step 4.
  - Second Wind is a `KeywordTag` handled in `combat.ts`.
  - The bot (`sim.ts:254-262`) already falls back to `ev.options[0]`.
- **State:** `tower.sortie.boons: BoonId[]`. **TUNING:** `climb.boons.offer=3`, `climb.boons.max=4`, and per-boon values in `climb.boonValues`.
- **Tests:** an Elite clear opens a boon event; resolving it adds the boon; the boon modifies the unit stats; the boon clears when the sortie ends.

**S15. Sorties: press on, or bank it.** P1 · M · Engine (WP3) and UI (WP4)
- **Player sees:**
  - A **Sortie** starts with the first floor attempted from campus.
  - Each consecutive clear adds a **streak bonus** (+10% of that floor's gold per floor in the streak, capped at +50%) to a visible **Purse**.
  - The results screen asks **"Press on ▸"** (Sanity still drains; boons are kept) or **"Return to campus (bank +X)"**.
  - A **rout or wipe** banks only 50% of the purse and ends the sortie.
  - Base floor gold is still awarded immediately, so the purse is only the *at-risk bonus*.
  - Leaving the Tower view with an active sortie asks for confirmation and banks it.
- **Why:** push-your-luck ([Loop Hero retreat 100/60/30%](https://www.gfinityesports.com/article/loop-hero-death-what-happens-when-you-die)).
- **Code:**
  - New `engine/climb/sortie.ts`: `sortieAfterFloor` is called in `playFloor` step 6; `returnToCampus` handles the `RETURN_TO_CAMPUS` command.
  - Base gold math (`tower.ts:558-560`) is untouched, so `tower.test.ts:458-476` stays green.
- **State:** `tower.sortie: Sortie | null`. **TUNING:** `climb.sortie.streakPctPerFloor=0.1`, `streakCap=0.5`, `keepOnRout=0.5`.

**S16. Orders that matter: the portrait dock and the Decisive Moment.** P0 · M · UI · WP2
- **Player sees:**
  - The orders move from tiny text buttons to a **portrait dock** under the stage: each hero shows HP, a ring and their order state. Tap a portrait to Protect; tap an enemy to Focus. Tap response is under 100 ms.
  - **The Decisive Moment:** the whole log is known before playback, so BattleScene scans ahead for the first hero `death`. It **pauses just before the fatal tick**, zooms in, and offers:
    - "🛡 Protect {hero}"
    - "🎯 Focus {killer}" (the actor of the last hit on that hero)
    - "🏳 Retreat"
    - "Let fate decide"
  - Each choice re-resolves the fight through the existing `orders.give` and `store.revise` path (`BattleScene.tsx:317-328`, `TowerScreen.tsx:369-384`).
  - If the hero then lives, a **"Saved!"** callout with a sting plays. That is success-dependent juice.
  - When `ordersLeft===0`, only Retreat or fate is offered.
- **Why:** "tough choices, not touch execution" ([TFT](https://www.pockettactics.com/teamfight-tactics-design)), AFK Arena portrait ultimates ([guide](https://www.bluestacks.com/blog/app-reviews/game-plays-itself-review-guide-en.html)), [Kao '24](https://spiral.imperial.ac.uk/entities/publication/253c32f5-d124-4a23-88b5-9aaaf114608d).
- **Code:** new `battle/OrdersDock.tsx` and `battle/decisive.ts` (a pure `findDecisive(log, heroIds) → {cursorIndex, heroId, killerId} | null`, unit-tested), plus `battle/DecisiveMoment.tsx`.
- **Pitfalls:**
  - **Never dispatch anything** (no TICK) while in Tower view, or `revise` throws (`store.ts:445`, `scout.test.ts:85-94`).
  - The copy must not promise survival: Protect only works "while anyone else stands".
  - One prompt per battle, re-armed after a re-resolve if a *different* hero is now doomed (cap 2).

**S17. Telegraphed intents and Isel on commentary.** P1 · M · UI · WP2
- **Player sees:**
  - Before a big blow (≥30% of the target's max HP, or any skill), an **intent icon and a target line** appear over the enemy 2 actions ahead: "HEAVY → Mira". This is computed by looking ahead in the known log.
  - Isel adds **one-line barks** at most once per 10 s: on the first crit, a near-wipe, a Saved!, a hero's death, and a flawless clear.
- **Why:** [Slay the Spire intents](https://pcgamer.com/best-design-2019-slay-the-spire), [Darkest Dungeon narrator](https://gamegeeker.com/games/darkest-dungeon-262060/review?market=GB).
- **Code:** new `battle/intents.ts` (pure, tested), `battle/narrator.ts` (lines go through `t()`, with FR in `frBattle.ts`).

**S18. Results that explain why.** P1 · S · UI · WP4
- **Player sees** an MVP plus a "Because…" line that ties the outcome to a choice:
  - "Protect: Kael absorbed 3 hits"
  - "Focus: the Shaman fell before casting"
  - "Skull door: +2 stones"
  - "Rout: the party fled after 2 fell"
- **Why:** causality ([research-loop §5](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)).
- **Code:** a pure `explainFloor(result, orders)` in `ui/tower/explain.ts`, built from the `FloorResult` and the orders given.

### Pillar 4: Failure feeds forward

**S19. Rout: the party breaks before it is wiped.** P0 · S · Engine · WP3
- **Player sees:** when the battle is being lost, **after N heroes fall the survivors flee**: "The line breaks! The party retreats." Outcome `retreat`, nothing is won, and the survivors live.
  - N = 2 on Path and Elite floors, 1 on Breather floors, 3 on Boss floors.
  - "Being lost" means the current HP of the living heroes is below the current HP of the living, non-looming enemies in the active wave.
  - A party of N or fewer heroes can still be wiped (and the scout says so).
- **Why:** 22 of 24 losses were total. This is the single strongest anti-spiral lever (map-engine finding #1). See also [XCOM mercy](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html).
- **Code:**
  - `Encounter.routAfterDeaths?` (WP0) is set only by the tower's `buildEncounter`, so dailies, PvP and tests that build encounters by hand are unaffected.
  - The check goes in `evaluateState` (`combat.ts:421-434`), *after* the win check.
  - Downstream already handles retreat: `tower.ts:556`, `react.ts:128` (the "retreated" memory).
- **Tests:**
  - `tower.test.ts:505-569` stay green: a lone hero is under the threshold.
  - `act2.test.ts:156` expects `'wipe'`: check whether that encounter came from `buildEncounter`. If so, assert `'wipe' | 'retreat'` or use a sub-threshold party.
  - `combat.test.ts:360,424` stay green: they build encounters by hand.
  - New: a 5-hero party on a deadly floor loses at most N heroes; `res.outcome==='retreat'`.

**S20. Last Stand: protection that grows as the roster shrinks.** P1 · S · Engine · WP3
- **Player sees:** with 3 or fewer living, fightable heroes on the roster, the party fights with **+10%/+15%/+20% all stats** (for 3/2/1 heroes), shown openly: "The tower remembers your fallen: Last Stand +15%". Combined with the director's mercy cap (S13), the median player recovers from losing 2 of 5 heroes within 3 floors.
- **Why:** [XCOM EW](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html), [Hades God Mode](https://caniplaythat.com/2021/08/11/hades-god-mode-explained-by-supergiant-games).
- **Code:** a unit transform in `tower.ts:500-521`, plus `ScoutReport.lastStandPct`. **TUNING:** `climb.lastStand.rosterAtMost=3`, `climb.lastStand.pctByCount={3:0.10,2:0.15,1:0.20}`.

**S21. Echo bequest: the fallen pass something on.** P0 · M · Engine and UI · WP5
- **Player sees:**
  - After a battle with deaths, each fallen hero leaves an **Echo**: +10% of their best stat, or a fragment of their highest-level skill as +1 skill level if the heir knows it.
  - The results screen (through the Legacy slot) and the Memorial show **"Pass on Mira's resolve → choose heir"**, with up to 3 suggested heirs (closest friends first).
  - The heir gets a permanent, visible "Echo of Mira" on their profile and a memory ("I carry Mira with me").
  - Up to 3 Echoes per heir. Unclaimed Echoes wait in the Memorial and never expire.
- **Why:** [Into the Breach](https://wegotthiscovered.com/gaming/into-the-breach-review/), [Inscryption](https://inscryption.fandom.com/wiki/Deathcard), [Rogue Legacy](https://strategywiki.org/wiki/Rogue_Legacy). Attachment comes from the bond (Fire Emblem supports).
- **Code:**
  - `lifeReact` deaths block (`react.ts:77-116`) pushes a `PendingEcho`. Candidates are the living heroes sorted by affinity.
  - New `engine/legacy/legacy.ts`: `bequeathEcho` for the `BEQUEATH_ECHO` command.
  - `unit.ts:124-135` adds `hero.life?.echoes` into `pct`. The scout (S12) picks this up automatically because it uses `buildCombatUnit`.
  - The new MemoryKind `'inherited'` and the chronicle line `'bequest'` are added by WP0.
- **State:** `life.legacy.pending: PendingEcho[]`, `HeroLife.echoes?: Echo[]`. **TUNING:** `legacy.echoPct=0.10`, `legacy.echoMaxPerHeir=3`, `legacy.skillEcho=true`.
- **Pitfalls:**
  - Write only under `life` and `hero.life` (the store.test `core()` trap).
  - Extend the `HeroLife` clone sites (`react.ts:57`, `life.ts:412-414`) for the nested `echoes` array.
  - `lifeReact` is bypassed by tests that call `playFloor` directly, which is fine.

**S22. Nemesis: the killer remembers, and so do you.** P1 · M · Engine (WP5 records, WP3 injects) and UI (WP4, WP2)
- **Player sees:**
  - The enemy that dealt the killing blow becomes **"Mira's Bane"**. Its name is in the Memorial, and it returns on a later non-anchor floor (3-7 floors on) as a **named, ×1.25 revenant** with a red nameplate.
  - The scout announces it: "Mira's Bane waits here."
  - Defeating it pays **revenge gold and a stone**, gives friends of the fallen the `'avenged'` memory, writes a chronicle line, and plays a short "Avenged!" banner.
- **Why:** the Nemesis system ([GDC](https://gdconf.com/news/attend-gdc-2018-behind-scenes-look-shadow-wars-nemesis-system)).
- **Code:**
  - The killer is the `actorId` of the last `hit` on the hero before their `death` event (`types.ts:920,930`). Record `targetTag` (the template id), name, element and level.
  - WP5 creates `Nemesis` records in `lifeReact`, with `revengeFloor` from `rngFor(seed,'nemesis',heroId)`.
  - WP3's `buildEncounter` appends the revenant on `revengeFloor` with `buildEnemyUnit(template, level, {powerMult})` and name `"{hero}'s Bane"`. On a clear it sets `status:'avenged'` (under `life`) and adds `FloorResult.nemesisDefeated`.
  - If the template is unknown, skip it.
- **TUNING:** `legacy.nemesis.revengeAfter=[3,7]`, `powerMult=1.25`, `maxActive=3`, `rewardGoldPerFloor=150`.

**S23. New arrivals, and a Memorial that teaches.** P1 · S · Engine and UI · WP5
- **Player sees:**
  - After any battle that leaves fewer than 5 living heroes, a **New Arrival token** (max 2): "A new face answers the bell." It gives a free Normal pull with **minStar 2**, claimed from the Memorial or the goal tracker.
  - The Memorial lists **"What each death taught"**: the killer's family weakness is revealed in the scout from then on.
  - Each plaque adds **+0.5% all stats, capped at +5%**: "The tower remembers."
- **Why:** [Darkest Dungeon Stagecoach](https://steamcommunity.com/app/262060/discussions/0/1694923613868014590), [XCOM memorial](https://temp.ufopaedia.org/Memorial_(EU2012)).
- **Code:**
  - `CLAIM_RECRUIT` goes to `legacy.ts`, which calls `summon(state, {minStar:2})` (WP0) for free.
  - `lessons` feed `ScoutReport.studied`-style weakness hints (WP3 reads `life.legacy.lessons`).
  - The plaque bonus is in `unit.ts` (WP5), read from `life.memorial.length`. `buildCombatUnit` needs it passed in: WP0 adds an optional `extraPct?` parameter, and `tower.ts` (WP3) passes `legacyPct(state)` from `legacy.ts` (a WP0 stub returning 0).
- **TUNING:** `legacy.recruit.rosterBelow=5`, `legacy.recruit.minStar=2`, `legacy.recruit.maxTokens=2`, `legacy.memorial.pctPerPlaque=0.005`, `legacy.memorial.capPct=0.05`.
- **Tests:** `events.test.ts:51-61` (recovery reinforcement) is unchanged. The recovery event stays as it is.

### Pillar 5: Reasons to return

**S24. Pent-up Interference: absence gives instead of taking.** P0 · M · Engine · WP6 (accrual), WP3 (consumption)
- **Player sees:**
  - PI **never decays** (except in Hardcore, S25).
  - While away the Master builds up **Interference charges**: 1 per 8 real hours, max 6.
  - Each charge **doubles the gold of one floor clear**, consumed on clear and shown in the HUD as "Interference ×2 (3 left)" and as a results line.
- **Why:** WoW reframed the same numbers as rested XP ([wiki](https://warcraft.wiki.gg/wiki/Rested)). Idle accumulation ([AFK Arena](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena)).
- **Code:**
  - WP6: `interference.ts:38-43` (`piAfterGap` returns `pi` when `!hardcore`), and `time.ts:102-103` (accrue charges from the gap in `advanceTime`, stored as `meta.rested`).
  - WP3: `tower.ts` step 4 calls the pure `consumeRested(meta, goldAwarded)` from WP0's `engine/return/rested.ts`.
- **State:** `meta.rested: {charges, carryWorld}`. **TUNING:** `return.rested.perRealHours=8`, `maxCharges=6`, `goldMult=2`.
- **Tests (WP6 updates):** `rift.test.ts:58-62` (decay now only in hardcore), `time.test.ts`. New: a 24 h real gap gives 3 charges; a clear consumes 1 and doubles gold; determinism.

**S25. No deletion by default; greying is cosmetic, and the return is a ceremony.** P0 · S · Engine and UI · WP6
- **Player sees:**
  - The account is **never deleted** unless `meta.hardcore` (canon rules, opt-in) is set.
  - After 30+ real days away, the lobby opens **desaturated**, with the heroes dozing. A 2-3 s **"Re-interference"** plays: colour floods back and Isel says "You came back. The towers remembered you."
  - The canon "grey towers" lives on in lore and in the Grey Tower Club rivals (`pvp/rivals.ts`).
- **Why:** deletion punishes exactly the lapsed player and protects nothing in a single-player game ([Zagal](https://research.chalmers.se/en/publication/177148), [Animal Crossing's cosmetic weeds](https://nookipedia.com/wiki/Roach)).
- **Code:**
  - `time.ts:110-121`: assign `deleted` only when `meta.hardcore`.
  - **`meta.deleted===true` is still honoured.** The smoke test at `:335-349` keeps passing unedited.
  - Grey detection is a UI diff of `nowReal` against the stale `meta.lastSeenAtWorld/3`. A `body.greyed` class plus `return.css` handles the canvas filter.
- **Tests:** `pvp.test.ts:237-251` sets `meta.hardcore=true` in its fixture (WP6). `sim.ts:213,528-533` is unaffected.

**S26. "While you were away": a welcome-back ledger and hero letters.** P0 · M · UI (plus a pure engine summarizer) · WP6
- **Player sees,** once per arrival when the player has been away 2 real hours or more and it is not a fresh Master: a window with
  - up to **5 vignettes** sorted by emotional weight, drawn from what `stepLife` actually simulated (new chronicle entries, tally, completions, level-ups);
  - a **Collect** row: the daily login stamp, Interference charges gained, gardener and merchant gold;
  - a **Ready** row: promotions done, drills done, builds done, a summon now affordable, free Daily attempts;
  - **one hero letter** written from a real memory ("I burned the stew. Sene laughed. Save me a spot on the next climb? — Kael").
  - Every line is tappable and travels there. The tone is warm and never accusing ("I kept your seat").
- **Why:** [Neko Atsume](https://en.wikipedia.org/wiki/Neko_Atsume), [Animal Crossing villagers](https://www.avclub.com/animal-crossing-abandonment), [Telltale "will remember that"](https://gamesbeat.com/the-illusion-of-player-choice-in-the-walking-dead/).
- **Code:**
  - New `engine/return/away.ts`: a pure `summarizeAway(before, after) → AwaySummary` that diffs heroes, facilities, gold, chronicle `at > before.meta.lastSeenAtWorld`, tally and pvp log.
  - New `ui/return/ReturnLayer.tsx`, mounted App-level by WP0. On **first mount with a non-null hydrated state**, it snapshots `before`, dispatches one TICK with `Date.now()`, and renders `WelcomeBack.tsx`.
  - `heroLetters.ts` reuses `memoryLine` (`lifeWindows.tsx:74-97`).
- **Pitfalls:**
  - Must not open for `now:0` test accounts or after `load()` (the smoke `closeWindow` grabs the first `.pwin-close`).
  - Must not fire while in Tower view (`revise`).
  - Must not auto-claim the login (`app.smoke.test.tsx:254-265`).

**S27. Lights Out: a good place to stop.** P0 · M · UI · WP6
- **Player sees:** a "☾ Rest for now" button in the lobby HUD, shown when the player returns from the tower or after 60 minutes of play. It opens a card with:
  - the **next floor's real scouting teaser** (name, threat, one named threat or Nemesis: "Mira's Bane waits on F14");
  - **up to 3 brewing timers** with their completion times;
  - **one relationship on the edge** ("Aldo and Sene: one shared meal from friends");
  - **the goal-gradient bars** from S4;
  - a **warm sign-off** from Isel. Never "don't leave".
- **Also: an honest tab title.** While the tab is hidden, the title reads "Pick Me Up! · ✓ Training done", and only when a timer the player chose has finished. It never cycles or flashes, and it is computed **without dispatching**.
- **Why:** [Zeigarnik](https://en.wikipedia.org/wiki/Zeigarnik_effect), [Hemingway](https://fs.blog/ernest-hemingway-three-tips-on-how-to-write-fiction/), [Nintendo's break prompts](https://www.killscreen.com/should-more-games-tell-us-stop-playing-and-do-something-else/), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- **Code:** `ui/return/LightsOut.tsx` and `ui/return/tabTitle.ts` (a `visibilitychange` listener), both inside ReturnLayer.

**S28. A stamp card instead of a streak, no permanent losses while away, and a protected save.** P0/P1 · M · Engine and UI · WP6
- **Stamp card (P1):**
  - `CLAIM_LOGIN` keeps "+50 gems" (the smoke test needs `Claim +50`) and adds **one stamp per real day**. The card **never resets**, starts pre-stamped at 2/10, and every 10th stamp pays +300 gems and a Normal pull ticket.
  - The streak reset is removed, the "You missed a day" warning goes, and the 7th-day streak bonus becomes the card bonus.
  - Code: `shop.ts:70-87`, `metaPanels.tsx:221-231`. State: `meta.stamps: {count, lastRealDay}`. TUNING: `return.stamps.perCard=10`, `endowed=2`, `cardGems=300`.
  - Tests: `shop.test.ts:36-44` (PI = 7×perLogin stays), `store.test.ts:865`.
- **No offline permanent loss (P1):** captive deadlines and captive synthesis are **paused while the player is away** (the clock only runs while the session is live), and storeroom theft is capped at a token 2%. In `pvp.ts:301-311`, `resolveInvasions` takes the `lastSeen` gap and pauses.
- **Protected save (P0):**
  - `navigator.storage.persist()` is requested right after the first summon (a user gesture).
  - **Export/Import save** goes in the Menu footer (a file download plus a paste code).
  - One gentle "Back up your save?" nudge after F5.
  - A PWA `manifest.webmanifest` and an SVG icon go in `public/` and are linked from `index.html`.
- **Why:** [Duolingo streak lessons](https://blog.duolingo.com/how-duolingo-streak-builds-habit), [endowed progress](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/), [WebKit ITP](https://webkit.org/?p=10218), [web.dev persistent storage](https://web.dev/articles/persistent-storage).
- **Code:** `ui/return/saveTransfer.ts` (uses `saveState`/`loadState` and `'pmu.save.v1'`). The import validates through `loadState` before it writes anything.

### Summary table

| ID | Change | Pri | Effort | Layer | WP |
|---|---|---|---|---|---|
| S1 | Guaranteed first pull | P0 | S | E | 1 |
| S2 | Summon Theatre | P0 | M | UI | 1 |
| S3 | Progressive campus | P0 | M | UI | 7 |
| S4 | Goal stack tracker | P0 | M | UI | 7 |
| S5 | Scripted first decisions | P1 | S | UI | 2, 7 |
| S6 | Pacing, 2x default, Sweep | P0 | S | UI | 2, 4 |
| S7 | Impact kit | P0 | M | UI | 2 |
| S8 | Readability, combo, sparks | P1 | M | UI | 2 |
| S9 | Death weight | P0 | S | UI | 2 |
| S10 | Living sprites and light | P1/P2 | M | UI | 8 |
| S11 | Reward cascade | P0 | M | UI | 4 |
| S12 | Honest scout | P0 | S | E+UI | 3, 4 |
| S13 | Sawtooth and Doors | P0 | L | E+UI | 3, 4 |
| S14 | Boons | P1 | M | E+UI | 3, 4 |
| S15 | Sorties | P1 | M | E+UI | 3, 4 |
| S16 | Orders dock and Decisive Moment | P0 | M | UI | 2 |
| S17 | Intents and narrator | P1 | M | UI | 2 |
| S18 | "Because…" results | P1 | S | UI | 4 |
| S19 | Rout | P0 | S | E | 3 |
| S20 | Last Stand | P1 | S | E | 3 |
| S21 | Echo bequest | P0 | M | E+UI | 5 |
| S22 | Nemesis | P1 | M | E+UI | 5, 3 |
| S23 | New arrivals and Memorial lessons | P1 | S | E+UI | 5 |
| S24 | Pent-up Interference | P0 | M | E | 6, 3 |
| S25 | No deletion, cosmetic grey | P0 | S | E+UI | 6 |
| S26 | Welcome-back ledger | P0 | M | E+UI | 6 |
| S27 | Lights Out and tab title | P0 | M | UI | 6 |
| S28 | Stamps, offline safety, save | P0/P1 | M | E+UI | 6 |

**Success metrics.** WP3 measures these with the sim; the lead re-measures them after integration.

| Metric | Today | Target |
|---|---|---|
| Meaningful decisions per floor, from F3 | 0 | ≥1 |
| First pull with a 3★ that has a skill | 39.5% / 0% | 100% |
| Median normal-floor replay at default speed | 10-20 s at 1x | ≤15 s |
| Deaths on floors scouted Safe | ~0 (ratios were 2-3) | 0 |
| Deaths on floors scouted Fair | n/a | ≤5% of attempts |
| Losses that are 5/5 deaths | 22 of 24 | ≤10% |
| Recovery from 3/5 to clearing 3 more floors (median) | n/a | yes |
| Return screen with ≥1 positive item after ≥8 h away | 0 | 100% |

---

## 4. Work packages for parallel implementation

### 4.0 Ground rules (all packages)

1. **Sequencing:**
   - **WP0 Foundation merges first** and leaves the tree green.
   - **WP1-WP8 then run in parallel** with **disjoint file ownership**. A package may *read* any file but *edits only its owned files* and the new files it creates.
   - After all of them land, a short lead-run **integration and balance pass** follows (§4.10).
2. **Shared files are touched only by WP0:** `engine/types.ts`, `engine/tuning.ts`, `engine/account/account.ts`, `engine/store/store.ts`, `ui/i18n/fr.ts`, `ui/i18n/i18n.ts`, `ui/useGame.ts`, `ui/bits.tsx`, `ui/kit.tsx`, `engine/life/life.ts`. If a feature package needs a change in one of them, it **records the request** in its PR notes, and the lead applies it in the integration pass. A package must never block on that change: code against the WP0 contract.
3. **Stub-first contracts.**
   - WP0 creates every new engine module file with **typed signatures**. Stubs are no-op or identity, or they throw `new Error('<fn>: not built yet')` for commands.
   - WP0 wires every new Command into `reduceCore`.
   - WP0 adds optional props to the components where cross-package mounts happen, and mounts the slot components.
   - Feature packages fill in the bodies. **Signatures may not change** without a lead decision.
4. **Determinism:**
   - Nothing in `src/engine` may use `Math.random`, `Date.now`, `new Date`, `Math.pow/exp/log/sin/cos/tan` or a literal fractional `**` (`__guards/determinism.test.ts:18-33`).
   - New randomness gets a **new stream name**: `'gacha-tutorial'`, `'doors'`, `'boon'`, `'nemesis'`. **Never insert a draw into an existing stream.**
   - Persist set-like fields as sorted arrays. Round persisted floats.
   - Pure modules return fresh objects (`store.test.ts:256-298` deep-freezes inputs).
5. **i18n:**
   - Every new player-facing string goes through `t()`, and its French goes **only** in the package's own FR module, pre-registered by WP0: `frSummon.ts` (WP1), `frBattle.ts` (WP2), `frClimb.ts` (WP3), `frTower.ts` (WP4), `frLegacy.ts` (WP5), `frReturn.ts` (WP6), `frShell.ts` (WP7).
   - Placeholders must match **exactly** (`i18n.test.ts:98-105`). Keys match byte for byte, including `’`. French uses a space before `? ! :`.
   - **Do not redefine a key that already exists** in FR_UI, FR_LIFE or FR_CONTENT; reuse it. WP0's new guard test fails on duplicate keys across modules.
   - Engine refusal strings get their French in the owning package's FR module.
6. **CSS:**
   - `ui.css` is owned by **WP8** only.
   - WP0 moves the battle block (`ui.css:397-479`, `664-687`) to `ui/battle/battle.css` (WP2), the summon and reveal block (`:328-339`, `556-575`) to `ui/summon/summon.css` (WP1), and the results overlay rules (`:365-375`) to `ui/results.css` (WP4).
   - Every other package creates its own `.css` and imports it from a TSX it owns.
   - Shared tokens (`:root` variables) are read-only for everyone except WP8.
7. **Smoke-test hygiene** (`app.smoke.test.tsx` is owned by WP7; other packages add *new* smoke files):
   - Never auto-open a `PixelWindow` for a fresh `now:0` account or right after `load()`.
   - Never add a button earlier in DOM order whose text contains `Menu`, `Enter`, `Advanced`, `Treasure`, `Claim +50`, `Honey Cake`, `Captives`, `Français`, `English`, `Banquet` or `Summon ×10`.
   - Never auto-claim the login.
   - Never dispatch while the Tower view is mounted (orders use `revise`).
   - Keep every panel string the smoke tests assert.
8. **The command for "done":** `npm run typecheck && npm test && npm run build` all green. 
9. Any change to the floor pipeline must keep `reduce` (`store.ts:123-128`) and `attemptFloorWithResult` (`store.ts:324-333`) equivalent. Both already call `playFloor` and `lifeReact`, so put logic *inside* those, not in store.ts.

### 4.1 WP0: Foundation (schema v11, contracts, stubs, mechanical splits)

**Goal:** after this package, every feature package can work in parallel without touching a shared file.

**Owned files (exclusive during WP0):**
- Engine: `engine/types.ts`, `engine/tuning.ts`, `engine/account/account.ts` and its test, `engine/store/store.ts`, `engine/life/life.ts` (defaults only), `engine/gacha/gacha.ts` (the `minStar` option only), `engine/scout/scout.ts` (types only), `engine/unit/unit.ts` (the `extraPct` parameter only).
- UI: `ui/i18n/fr.ts`, `ui/i18n/i18n.test.ts`, `ui/useGame.ts`, `ui/App.tsx` (mounts only), `ui/screens.tsx` (extraction only), `ui/facilityPanels.tsx` (extraction only), `ui/ui.css` (split only), `ui/audio/sound.ts` (new sfx names), `ui/pixel/sprites.ts` (pose stubs), `ui/world/LobbyWorld.tsx` (ambience call only), `ui/battle/BattleScene.tsx` and `ui/TowerScreen.tsx` (optional props only), `ui/life/lifeWindows.tsx` and `ui/life/speech.ts` (exhaustive cases for the new kinds).
- Test fixtures: `gacha/gacha.test.ts:33-75` and `tower/tower.test.ts:~110-164` (the full GameState fixtures), and any `OwnedHero` fixtures if required fields are added (none are planned).

**New types** (`types.ts`):
```ts
export type FloorKind = 'tutorial' | 'breather' | 'path' | 'elite' | 'rest' | 'cache' | 'boss'
export type DoorReward = 'gold' | 'stones' | 'boon' | 'sanity' | 'xp'
export interface Door { kind: FloorKind; reward: DoorReward }
export type BoonId = string
export interface Sortie { startFloor: number; floors: number; purse: number; boons: BoonId[] }
export type EchoStat = keyof Pick<DerivedStats, 'maxHP' | 'pAtk' | 'mAtk' | 'pDef' | 'mDef' | 'spd'>
export interface Echo { fromHeroId: HeroId; fromName: string; stat: EchoStat; pct: number; skillId?: string; at: number }
export interface PendingEcho { fallenId: HeroId; fallenName: string; floor: number; stat: EchoStat; pct: number; skillId?: string; candidates: HeroId[] }
export interface Nemesis { id: string; templateId: string; name: string; element: Element; level: number;
  heroId: HeroId; heroName: string; diedFloor: number; revengeFloor: number; status: 'waiting' | 'avenged' }
export interface LegacyState { pending: PendingEcho[]; nemeses: Nemesis[]; recruitTokens: number; lessons: string[] }
// MetaState +=
  rested: { charges: number; carryWorld: number }
  hardcore: boolean
  stamps: { count: number; lastRealDay: number }
// TowerState +=
  kind: FloorKind            // kind of currentFloor (default from floorKindBase)
  doors: Door[] | null       // offered for currentFloor; null = no choice pending
  sortie: Sortie | null
// LifeState +=
  legacy: LegacyState
  unlocks: string[]          // PlaceIds whose unlock fanfare has been seen (sorted)
// HeroLife += echoes?: Echo[]     (optional; read with ?? [])
// OwnedHero += nickname?: string  (optional; reserved, unused this round)
// TowerEventKind += 'boon'
// MemoryKind += 'inherited' | 'avenged';   ChronicleKind += 'bequest' | 'revenge'
// Encounter += routAfterDeaths?: number; kind?: FloorKind
// FloorResult += kind?: FloorKind; routed?: boolean; lastStandPct?: number; sortieBonus?: number;
//                restedBonus?: number; nemesisDefeated?: string[]; doors?: Door[] | null
// Command +=
  | { type: 'CHOOSE_DOOR'; index: number }
  | { type: 'RETURN_TO_CAMPUS' }
  | { type: 'BEQUEATH_ECHO'; fallenId: HeroId; heirId: HeroId }
  | { type: 'CLAIM_RECRUIT' }
  | { type: 'SEE_UNLOCK'; place: string }
```
In `scout.ts`, `ScoutReport` gains `kind: FloorKind`, `threats: { name: string; why: string }[]`, `rout: number | null`, `lastStandPct: number`, `mercyCapped: boolean` and `nemesis: string | null`. WP0 fills these with neutral defaults (`'path'`, `[]`, `null`, `0`, `false`, `null`).

**TUNING** (new sections placed before `account:`, each key with a JSDoc and the "First-pass" tag): `ftue`, `climb` (`kindMult`, `mercyBand`, `maxStepPct`, `directorFromFloor`, `doors`, `reward`, `rout`, `lastStand`, `boons`, `boonValues`, `sortie`), `legacy` (`echoPct`, `echoMaxPerHeir`, `skillEcho`, `nemesis`, `recruit`, `memorial`), `return` (`rested`, `welcome`, `stamps`, `offline`), `unlocks` (the schedule from S3: `Record<PlaceId, {floor?: number; masterLevel?: number; event?: string}>`). `account.schemaVersion: 11`. Every value is as given in §3.

**Migration:**
- `migrateV10toV11` in `account.ts`. It is idempotent and merges with `??`. Defaults:
  - `meta.rested = {charges: 0, carryWorld: 0}`
  - `meta.hardcore = false`
  - `meta.stamps = {count: 2, lastRealDay: -1}`
  - `tower.kind = 'path'`, `tower.doors = null`, `tower.sortie = null`
  - `life.legacy = {pending: [], nemeses: [], recruitTokens: 0, lessons: []}`
  - `life.unlocks` = every place already open for this save, so veterans see no fanfare storm
- `createAccount` uses the same defaults, except `unlocks: []`.
- `defaultLifeState` gains `legacy` and `unlocks`.
- `account.test.ts:605` becomes `TUNING.account.schemaVersion`. Add a v10→v11 test.

**Stubs (new files; owners in brackets):**
- `engine/climb/kinds.ts` [WP3]: `floorKindBase(f)` (implemented: `f<=2→'tutorial'`, `f%5===0→'boss'`, else `'path'`), `floorBudget(state,f,kind)` (initially returns `floorPower(f, worldMultFor(state))`), `mercyBand(kind)`.
- `engine/climb/doors.ts` [WP3]: `rollDoors`, which returns `null`, and `chooseDoor`, which throws "not built yet".
- `engine/climb/boons.ts` [WP3]: `boonOffer`, `applyBoonsToUnits` (identity), `BOONS` (empty).
- `engine/climb/sortie.ts` [WP3]: `sortieAfterFloor` (identity) and `returnToCampus` (identity).
- `engine/legacy/legacy.ts` [WP5]: `bequeathEcho` (throws), `claimRecruit` (throws), `legacyPct(state)` (returns 0), `echoPct(hero)` (returns `{}`).
- `engine/return/rested.ts` [WP6]: `consumeRested(meta, gold) → {meta, bonus}`, **fully implemented by WP0** because it is tiny and shared by WP3 and WP6, and `accrueRested(meta, gapWorld)` (identity).
- `engine/return/away.ts` [WP6]: `summarizeAway` (returns an empty summary).
- `engine/return/stamps.ts` [WP6]: `stampOnLogin` (identity).

Each module has an `index.ts` barrel. `store.ts` gets cases for the five new commands.

**Shared engine helpers WP0 implements fully:**
1. `summon(state, opts?: { minStar?: Star })`: lift the star right after `rollStar`, mirroring pity. The default path is byte-identical. Test: the same seed with no opts gives an identical result; `minStar:3` always gives ≥3★.
2. `buildCombatUnit(hero, line, registry, inventory, extraPct?)`: an optional extra percentage map merged into `pct`. Default `{}`, byte-identical.

**UI mechanical splits** (move code verbatim; behaviour unchanged; smoke tests must stay green):
- `ResultsScreen` and `skillProgressLine` go from `screens.tsx:373-502` to `ui/ResultsScreen.tsx`, re-exported from `screens.tsx` for compatibility. ResultsScreen mounts `<LegacySlot state store result />` from a new stub `ui/legacy/LegacySlot.tsx` that returns `null`.
- The Memorial panel body (`facilityPanels.tsx:1146-1153` and its helpers) goes to `ui/legacy/MemorialPanel.tsx`.
- The CSS splits listed in §4.0.6.
- `App.tsx` mounts `<ReturnLayer state store view onGo />` from a new stub `ui/return/ReturnLayer.tsx` that returns `null`. TowerScreen gets an optional `onGo` prop.
- `LobbyWorld.tsx`'s draw loop calls `drawAmbience(ctx, {nowReal, view, zoom})` from a new stub `ui/world/ambience.ts` (no-op).
- `BattleScene` props gain optional `mode?: 'full' | 'highlights'`, `tutorialPrompt?: boolean`, `onSaved?: (heroId) => void` and `nemesisIds?: string[]`. They are accepted and ignored.
- `sound.ts`: `sfx(name, opts?: { semis?: number; star?: number })`, plus simple synths for the new names `reveal`, `coin`, `heroFall`, `unlock`, `boon`, `door`, `stamp`, `saved`.
- `sprites.ts`: `heroPoseUrl(hero, pose)` and `enemyPoseUrl(id, element, pose)` with `pose: 'idle' | 'attack' | 'cast' | 'hurt' | 'ko'`. The stubs return the existing frame-0/1 URLs.
- New `ui/prefs.ts`, fully implemented: `getPrefs/setPrefs` for `{battleSpeed: 2, autoSweep: true, shake: 1, reducedMotion: matchMedia(...)}` in localStorage `pmu.prefs`, with try/catch.
- `useGame.ts`: wrap `load()` in try/catch. On failure, copy the raw save to `pmu.save.v1.broken`, start at the title, and keep the error in the console.
- `lifeWindows.tsx` `memoryLine`: English for `'inherited'` ("Carries the echo of {name}") and `'avenged'` ("Avenged {name}"). `speech.ts` `chronicleLine` gets `'bequest'` and `'revenge'`.
- FR modules: create the 7 empty modules and spread them in `fr.ts` **before** `FR_UI`. Seed `frLegacy.ts` with the four strings above. Add the duplicate-key guard to `i18n.test.ts`.

**Acceptance tests (new):**
- v10→v11 migration: fields default; idempotent on a v11 save; a v9 save goes through the whole chain.
- `summon` `minStar`: the no-opts path is identical; `minStar` holds.
- `buildCombatUnit` with an empty `extraPct` is identical.
- Every new Command reaches its stub: the throwing stubs throw "not built yet"; `RETURN_TO_CAMPUS` and `SEE_UNLOCK` are identity. `SEE_UNLOCK` is implemented fully (sorted dedupe into `life.unlocks`) because it is trivial.
- The i18n duplicate-key guard.
- Determinism guard green.

**Must stay green:** all 842 tests. The smoke suite unchanged. `npm run build`.

**Pitfalls:**
- A throwing migration bricks boot. The `useGame` try/catch is mandatory.
- `life.unlocks` backfill for veterans must use the same predicate as WP7's `placeAccess`. Put a minimal `isPlaceOpen(state, place)` in `engine/unlocks.ts`, reading `TUNING.unlocks`, owned by WP0 and then frozen. WP7's UI wraps it.
- The `TowerState` fixture literals in `tower.test.ts` and `gacha.test.ts` must gain the new required fields.

### 4.2 WP1: First pull and Summon Theatre (S1, S2)

- **Owned:** `engine/gacha/gacha.ts` (after WP0), `engine/gacha/gacha.test.ts`, `ui/screens.tsx` (SummonScreen, SummonRitual, TitleScreen, Roster, Party), `ui/HeroCard.tsx`, `ui/pixel/summonFx.ts`, `ui/summon/summon.css`, `ui/i18n/frSummon.ts`.
- **New:** `ui/summon/RevealSequence.tsx`, `ui/summon/reveal.ts` (pure ordering, hold times and tell colours), `ui/summon/reveal.test.ts`, `ui/summon/summon.smoke.test.tsx`.
- **Behaviours:**
  - The S1 guarantee is in the tutorial branch only, with the deficit-based `minStar` lift and the signature skill on the best 3★.
  - The S2 sequence:
    - an escalating tell up to the best `shownStar`;
    - upgrade-only "surprise" (when the best card is ≥3★, a deterministic `hashString(ids)%10<3` starts the tell one tier lower and *upgrades* it on the last card);
    - ascending order, best last;
    - hold times by star;
    - personality and intro line for 1-2★;
    - Space, Enter or click to advance; "Skip ▸▸" after the first card;
    - the summary grid stays as the final view.
  - Single pulls use a short version of the sequence (one card).
- **Acceptance:**
  - Over 200 seeds the tutorial pull has ≥1 3★ with ≥1 skill and ≥3 2★+.
  - Rates are unchanged for non-tutorial pulls (`gacha.test.ts:106-122,432-449` green).
  - `reveal.ts` orders by `shownStar` ascending, uses stable tie-breaks, and its tell sequence never decreases.
  - A smoke test: a fresh account opens Mobius Summon, presses the free ×10, advances the cards, then skips to the summary; the grid shows 10 cards.
- **Keep green:** `gacha.test.ts:422-431`, `:596-623`; `app.smoke.test.tsx:137-150`, `:211-222`; `life.test.ts:226-230` (12 arrivals for 12 pulls).
- **Pitfalls:**
  - Don't change `summon()`'s draw order.
  - The tutorial post-process skill must go through `lifeReact` arrivals unchanged.
  - Use `shownStar` everywhere it is displayed.
  - Nothing in the sequence may contain the strings "Summon ×10" or "Advanced" before the real buttons.

### 4.3 WP2: Battle feel and agency (S5 prompt, S6 replay, S7, S8, S9, S16, S17)

- **Owned:** `ui/battle/BattleScene.tsx`, `ui/battle/battle.css`, `ui/audio/sound.ts`, `ui/i18n/frBattle.ts`.
- **New:** `ui/battle/fx.ts` (hitstop, trauma, pacing math), `decisive.ts`, `intents.ts`, `narrator.ts`, `combo.ts`, `OrdersDock.tsx`, `DecisiveMoment.tsx`, `Sparks.tsx`, and `*.test.ts` for each pure module.
- **Behaviours:** as in S6-S9, S16 and S17.
  - Speed comes from `prefs`; SPEEDS are [1,2,4,8].
  - `mode='highlights'` plays only the top 3 hits, the kills and the end, in about 2 s.
  - Wire `heroPoseUrl`/`enemyPoseUrl`: acting gives attack or cast, hurt gives hurt, a KO gives ko. **Fall back** gracefully to the stub frames.
  - Keyboard shortcuts: Space pauses, 1/2/3/4 set speed, S skips, F/P/R give Focus/Protect/Retreat, with no conflicts with lobby keys.
  - Reduced motion turns off shake and squash and shortens hitstop.
  - Layered WebAudio hits: a transient plus a body, ±80 cents detune, 3-4 rotating variants, combo pitch on the pentatonic scale of the battle key, and a distinct `heroFall` sting.
- **Acceptance:**
  - `findDecisive` returns the last index before the first hero death tick, or null when none dies; NPC deaths are excluded.
  - `intents` flags every big hit at least 2 actions ahead.
  - Hitstop is monotone in damage, has a kill floor, and shrinks with speed.
  - The trauma value decays to 0 and is clamped to [0,1].
  - The combo counter resets on an enemy act.
  - Highlights mode is ≤2.5 s at 1x for every fixture log.
  - A jsdom render of BattleScene with a fixture log at 8x reaches the end and calls `onDone`, and shows a decisive card when it is enabled.
- **Keep green:** everything. No existing test mounts BattleScene.
- **Pitfalls:**
  - **Never dispatch** from BattleScene. Orders go only through the `orders.give` prop.
  - The death hold of 1300 ms at ≥2x stays (`:266`).
  - Restart CSS animations by parity classes.
  - Sparks are seeded by `hashString`, not `Math.random`.
  - Keep the DOM node count ≤40 for sparks.

### 4.4 WP3: Climb engine (S12 engine, S13, S14, S15, S19, S20, S22 injection, S23 lessons read, S24 consumption)

- **Owned:** `engine/tower/tower.ts`, `engine/combat/combat.ts`, `engine/scout/scout.ts` (bodies), `engine/events/events.ts`, `engine/content/anchors.ts`, `engine/climb/*`, `src/sim/sim.ts`, and the tests `tower.test.ts` (non-fixture parts), `fullClimb.test.ts`, `act2.test.ts`, `scout.test.ts`, `events.test.ts`, `combat.test.ts`, `__integration/loop.test.ts`, `sim/sim.test.ts`. FR: `ui/i18n/frClimb.ts` (engine refusals, boon names and descriptions, door names).
- **New:** `engine/climb/*.test.ts`, `src/sim/metrics.test.ts` (the success metrics, ≤20 seeds, kept under 10 s).
- **Behaviours:**
  - **S13:**
    - `floorBudget` combines the static re-tune, the kind multiplier, the mercy cap and the step cap.
    - Doors are rolled on a clear (F≥2, for the next floor ≥3), with `doors[0]` always Path or Breather.
    - `ATTEMPT_FLOOR` without `CHOOSE_DOOR` uses `doors[0]`.
    - Rest and Cache doors resolve on choose.
    - Anchors at F20 and below are scaled with the clamp.
  - **S19:** routing in `evaluateState`, controlled by `Encounter.routAfterDeaths`.
  - **S20:** a Last Stand transform.
  - **S14:** the boon event and its effects. Second Wind is a keyword.
  - **S15:** sortie bookkeeping and `RETURN_TO_CAMPUS`. Rout or wipe banks `keepOnRout`.
  - **S12:** the honest ratio and named threats.
  - **S22:** inject a Nemesis on its `revengeFloor`; mark it avenged; set `nemesisDefeated`.
  - **S23:** lessons reveal weakness in the scout.
  - **S24:** `consumeRested` on a clear.
  - `legacyPct(state)` is passed as `extraPct` to `buildCombatUnit`.
  - The sim bots: choose the Skull door when ratio ≥1.6, otherwise `doors[0]`; take the first boon; return to campus when average Sanity is below 45; claim recruit tokens.
- **Acceptance:**
  - Over 20 seeds the bots climb with **0** deaths on floors scouted Safe and **≤5%** of Fair-floor attempts with deaths.
  - **≤10%** of losses are full wipes.
  - From F3 every first clear offers 2 doors.
  - Path budget steps are ≤ +12%.
  - F1-F2 are unchanged and the lone Islat Han clears F1.
  - Rout outcome on a losing 5-hero fight with ≥2 deaths.
  - `routAfterDeaths` is undefined for dailies and PvP.
  - Boons apply and expire.
  - Purse math; rout keeps 50%.
  - A Nemesis spawns, then is avenged once.
  - The rested charge doubles gold exactly once.
  - Determinism: running twice gives `toEqual`.
  - The `store.test` delegation tests stay green.
- **Update (expected):** `tower.test.ts:306-345` (fit against `floorBudget`), `:388-400` if needed; `fullClimb.test.ts:184-200`; `act2.test.ts:65-118,156`; `scout.test.ts:16-24` (report shape).
- **Keep green:** `loop.test.ts:72-83,194-205`; `sim.test.ts:13-20`; `tower.test.ts:198-221` (`floorPower` monotone and closed form), `:458-476`, `:548-569`, `:797-824`; `events.test.ts:16-61`.
- **Pitfalls:**
  - New RNG streams only (`'doors'`, `'boon'`).
  - Keep `floorPower` monotone.
  - Writes to `life.legacy.nemeses` from `playFloor` must create fresh objects.
  - Any test that plays consecutive floors with `playFloor` must not be blocked by Doors. That is why Doors **never block**, only boon events block, and boon events open only after Elite or Boss clears. Check `loop.test`'s event resolver handles `'boon'` through `options[0]`.
  - The F36-40 loop and the F90 world-end must keep working with kinds (anchors stay `'boss'`).

### 4.5 WP4: Tower UI and rewards (S6 Sweep, S11, S12 card, S13/S14/S15 UI, S18, S22 banner)

- **Owned:** `ui/TowerScreen.tsx` (after WP0), `ui/ResultsScreen.tsx`, `ui/results.css`, `ui/i18n/frTower.ts`.
- **New:** `ui/tower/DoorPicker.tsx`, `BoonPicker.tsx`, `SortieBar.tsx`, `ScoutCard.tsx` (refactored from `ScoutPanel` `:250-304`), `explain.ts` and its test, `useCountUp.ts`, `CoinBurst.tsx`, `tower.css`, `ui/tower/tower.smoke.test.tsx`.
- **Behaviours:**
  - The Door picker sits on the Tower screen when `tower.doors` is set. Each door shows its kind icon, reward icon and a one-line scout preview, and dispatches `CHOOSE_DOOR`. Isel explains the skull door the first time (`GUIDE_STEP 'doors'`).
  - The Boon picker uses the existing `EventPanel` pattern.
  - The Sortie bar shows the purse, streak, boons and a "Return to campus" button. "◀ Lobby" with an active sortie asks to confirm, then dispatches `RETURN_TO_CAMPUS`.
  - The Sweep decision (S6) is passed to BattleScene through `mode`.
  - The ResultsScreen cascade (S11): count-up, coins, level-ups from `preLevels`, materials, a "Next summon" bar with `onGo('summon')`, a "Next:" teaser.
  - "Because…" lines (S18). An "Avenged!" banner.
  - Auto-advance from victory.
  - Press on versus Return.
- **Acceptance:**
  - `explainFloor` returns the Protect, Focus, Door and Rout reasons for fixture results.
  - A smoke test: load a save at F6 with doors pending, choose the Skull door, and the scout shows "Elite".
  - Results show materials and a level-up row for a fixture `FloorResult`.
  - The count-up reaches the exact value.
- **Keep green:** `app.smoke.test.tsx:226-252`. The **first** button containing `Enter` must still be disabled while an event is open. Door buttons must **not** contain "Enter" or "Treasure", and the Cache door is labelled "Cache".
- **Pitfalls:**
  - **No dispatch between the attempt and the orders** (`revise`). Choosing a door happens *before* Enter.
  - The level-up diff must use the pre-state captured in `fight()`.
  - Keep the FR strings for the existing event titles.

### 4.6 WP5: Legacy (S21, S22 records, S23)

- **Owned:** `engine/life/react.ts`, `engine/unit/unit.ts` (bodies), `engine/legacy/*`, `engine/life/life.test.ts` (append only), `ui/life/speech.ts` (eulogy and inherited lines), `ui/legacy/*` (LegacySlot, MemorialPanel), `ui/i18n/frLegacy.ts`.
- **New:** `ui/legacy/BequestCard.tsx`, `ui/legacy/legacy.css`, `engine/legacy/legacy.test.ts`, `ui/legacy/legacy.smoke.test.tsx`.
- **Behaviours:**
  - `lifeReact` deaths block:
    - push a `PendingEcho` (stat = the fallen hero's highest relative stat; `skillId` = their highest-level skill when `skillEcho`);
    - create a `Nemesis` from the killer (the last `hit` actor) when the death came from a tower floor (`FloorResult` present) and fewer than `maxActive` are waiting;
    - add `recruitTokens` (capped) when fewer than `rosterBelow` living heroes remain;
    - record `lessons` (the killer's family).
  - On `FloorResult.nemesisDefeated`: friends of the fallen get the `'avenged'` memory and a `'revenge'` chronicle entry.
  - `BEQUEATH_ECHO` validates that the heir is alive, a candidate and under the cap, then writes `hero.life.echoes` and the `'inherited'` memory.
  - `CLAIM_RECRUIT` spends a token and calls `summon(state,{minStar:2})` for free (fund and charge the gold, like the mercy pull does).
  - `echoPct(hero)` and `legacyPct(state)` (plaque bonus) are used by `unit.ts` and WP3.
  - UI: LegacySlot shows the bequest card in results; the Memorial panel gets plaques with "How they died", "What it taught", Echo assignment, the recruit claim and the Nemesis list.
- **Acceptance:**
  - A death creates exactly one pending echo, with candidates sorted by affinity.
  - Bequeathing applies the stat to `buildCombatUnit`'s output: exactly +10% of that stat.
  - The echo cap is enforced.
  - A Nemesis is created with a valid `revengeFloor` in [died+3, died+7] that skips anchors.
  - The recruit token is capped at 2, and the claim yields ≥2★ at no cost.
  - The plaque bonus is capped at 5%.
  - Purity (deep-freeze) and determinism.
  - The `store.test` `core()` delegation stays green.
- **Keep green:** `life.test.ts` (all), `store.test.ts`, `events.test.ts:51-61`, the Memorial copy in smoke (none asserted beyond place opening).
- **Pitfalls:**
  - Write only under `life` and `hero.life`.
  - Clone the nested `echoes` at `react.ts:57`. Ask the lead to mirror the clone in `life.ts:412-414` during integration, or avoid it by never mutating.
  - Death causes other than a floor (captor, synthesis) create echoes but **no** nemesis.

### 4.7 WP6: Reasons to return (S24 accrual, S25, S26, S27, S28)

- **Owned:** `engine/time/time.ts`, `engine/interference/interference.ts`, `engine/shop/shop.ts`, `engine/pvp/pvp.ts`, `engine/return/*`, `ui/metaPanels.tsx`, `ui/life/lifeWindows.tsx` (Letter and WelcomeBack body; WP0's `memoryLine` cases stay), `ui/return/*`, `index.html`, `public/manifest.webmanifest`, `public/icon.svg`, `ui/i18n/frReturn.ts`, and the tests `time.test.ts`, `pvp.test.ts`, `rift.test.ts`, `shop.test.ts`.
- **New:** `ui/return/WelcomeBack.tsx`, `LightsOut.tsx`, `heroLetters.ts`, `tabTitle.ts`, `saveTransfer.ts`, `return.css`, `engine/return/*.test.ts`, `ui/return/return.smoke.test.tsx`.
- **Behaviours:**
  - **S24:** accrue charges from the `advanceTime` gap; no decay unless `hardcore`.
  - **S25:** deletion only when `hardcore`; the grey ceremony.
  - **S26:** `summarizeAway`; WelcomeBack once per arrival (gated as described).
  - **S27:** the Lights Out button and card; the honest tab title through `visibilitychange`, with no dispatch.
  - **S28:**
    - the stamp card in `CLAIM_LOGIN` (+50 gems kept; a stamp per *real* day = `floor(nowWorld / (24h·worldTimeFactor))`), with no reset;
    - offline pause in `resolveInvasions` (the captive clock advances only by `min(gap, livePlayWindow)`);
    - `storage.persist()` after the first summon;
    - export and import in the ReturnLayer menu ("Backup"), plus the PWA manifest.
- **Acceptance:**
  - PI unchanged after a 30-day gap (non-hardcore); hardcore keeps the old decay and deletion (`pvp.test` updated).
  - Charges: a 24 h real gap gives 3, capped at 6.
  - `summarizeAway` lists completions and new chronicle entries, ≤5 vignettes sorted by weight, empty for a no-op gap.
  - Stamps: a claim on a new real day adds one; claiming twice in one day is refused; the 10th stamp pays the bonus; nothing ever decreases.
  - A captive is never synthesized purely offline.
  - An export/import round-trip equals the original state.
  - A smoke test: a save with `lastSeenAtWorld` 10 real hours before "now", with something completed, shows WelcomeBack at mount; a fresh `now:0` account does **not**.
- **Keep green:** `app.smoke.test.tsx:119-135` (the clock pump; WelcomeBack must not block the TICK), `:254-265` ("Claim +50", gems +50), `:335-349` (greyed); `store.test.ts:865`; `shop.test.ts:36-44`; `sim.test.ts`.
- **Pitfalls:**
  - Hydration does not run `advanceTime` (`store.ts:472-477`). Snapshot *before* the first TICK.
  - A WelcomeBack TICK must not happen while the Tower view is mounted (and on arrival the app opens in the lobby, so it is fine).
  - Never auto-claim.
  - The tab-title code must not dispatch.
  - `storage.persist` and `matchMedia` must be guarded for jsdom.

### 4.8 WP7: Shell, focus and clarity (S3, S4, S5 copy)

- **Owned:** `ui/App.tsx` (after WP0), `ui/world/LobbyWorld.tsx` (after WP0), `ui/world/lines.ts`, `ui/life/FirstSteps.tsx`, `ui/facilityPanels.tsx` (after WP0), `ui/app.smoke.test.tsx`, `ui/world/world.test.ts`, `ui/i18n/frShell.ts`.
- **New:** `ui/shell/unlocks.ts` (a UI wrapper around WP0's `engine/unlocks.ts`), `goals.ts` and its test, `GoalTracker.tsx`, `UnlockBanner.tsx`, `shell.css`.
- **Behaviours:**
  - The S3 menu groups (Now / Next / Later), the locked preview ribbon, lobby locks (boarded sign, Isel line, E-prompt "🔒"), and the unlock fanfare (banner + `sfx('unlock')` + `SEE_UNLOCK`). The fanfare fires only for places that are *newly* open and not in `life.unlocks`.
  - The S4 GoalTracker in the lobby HUD and the Scene bar, with hero requests derived from state.
  - The Menu footer gains "Backup…", which opens WP6's export through an `onGo('backup')` callback provided by ReturnLayer. **Contract:** ReturnLayer listens for a `pmu:backup` CustomEvent dispatched on `window`, so there is no shared code.
- **Acceptance:**
  - `goals.ts` returns short, medium and long goals for fresh, F6 and F20 fixtures.
  - "Summon now!" appears when gold ≥ cost.
  - `placeAccess` matches `TUNING.unlocks`.
  - The fanfare fires once per place.
  - All existing smoke tests pass **unchanged**, plus new ones: a fresh account Menu shows 4 "Now" items; clearing F1 (seeded save) shows the Kitchen fanfare once.
- **Keep green:** `world.test.ts` (all; `iselLines(fresh)` output is unchanged), `app.smoke.test.tsx` (all).
- **Pitfalls:**
  - Locked items **remain** `button.menu-item` and still open their panel.
  - "Menu" stays the first button with that text.
  - The tracker in the Scene bar must not include "Enter" and must not dispatch in the Tower view.
  - The fanfare must not show for `now:0` fresh accounts at mount: it is triggered only by a *change* in the open set during the session, or on arrival for saves whose `life.unlocks` is missing an open place (veterans are backfilled by WP0).

### 4.9 WP8: Art and ambience (S10, V7-V9)

- **Owned:** `ui/pixel/heroSprite.ts` (append only), `enemySprite.ts`, `bitmap.ts` (new functions only), `sprites.ts` (bodies of the pose functions), `battleBg.ts`, `palette.ts` (additive), `look.ts` (append-only draws), `ui/ui.css` (the remainder after the splits), `ui/DevGallery.tsx`, `ui/world/ambience.ts`, `ui/pixel/pixel.test.ts` (append only).
- **New:** `ui/pixel/poses.ts` and its test.
- **Behaviours:**
  - `drawHeroPose` for attack (body 2 px back on the wind-up frame, arm and weapon extended with a 2-px trail), cast, hurt (lean back, eyes closed) and ko.
  - Poses for humanoid enemies through `humanoid(pose)`.
  - Bespoke monsters through generic `shear`, `squash` and `flashWhite`.
  - The cache prefix `hp|…|pose`.
  - Idle breathing and blinks with a per-unit phase, delivered as CSS variables WP2 can read: `--idle-delay` from `hashString(id)`.
  - P2: the `grade()` act pass and a vignette layer in `battleBg`.
  - The lobby `drawAmbience`: a time-of-day tint by real local hour, fireflies at night, drifting leaves, capped at 40 particles.
  - ui.css: consolidate hex literals into tokens; one gold `--accent-cta`; rarity colours used only for rarity; `--danger` red only for danger; `.locked` dim style for WP7; a global `@media (prefers-reduced-motion)` block; fix the missing 700 weight (`.threat-label`, `ui.css:691`) by using 600.
- **Acceptance:**
  - Pose frames are 24×32 with more than 150 opaque pixels and differ from frame 0.
  - Left and right still mirror; 60 busts still distinct; backdrops still differ.
  - The `outline` test is untouched.
  - DevGallery shows every pose.
  - The ambience no-ops under jsdom.
- **Keep green:** `pixel.test.ts` and `world.test.ts` ("the art renders").
- **Pitfalls:**
  - **Never insert RNG draws** before existing ones in `look.ts`. Every existing hero's look must stay identical.
  - Don't widen `WalkFrame`.
  - Avoid per-frame dynamic cache keys (the cache is unbounded).
  - Keep saturation capped (the Octopath warning).

### 4.10 Integration and balance pass (lead, after WP1-WP8)

1. Merge in the order WP3 → WP5 → WP6 → WP1 → WP4 → WP2 → WP7 → WP8. Resolve the recorded requests for shared files.
2. Re-run the scratchpad measurement scripts (`measure.ts`, `climb2.ts`, `losses.ts`, `replayTime.ts`) and the new `sim/metrics.test.ts`. Tune only `TUNING.climb.*` and `tower.earlyBudgetBoost` until the §3 metrics hold.
3. A Playwright run of the first 15 minutes: title → summon theatre → F1-F5 → first Door → first Decisive Moment → Lights Out → reload with the clock advanced 10 h → WelcomeBack. Check the French locale.
4. Update `docs/superpowers/specs/2026-10-12-fun-and-return.md` with an "As built" section.

---

## 5. Risks, and what we deliberately did not do

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Balance churn.** The director, kinds and rout interact, and numbers drift from what the tests pin. | Mercy cap only (never upward). Kind multipliers in TUNING. A sim metrics test as the guard rail. F1-F2 frozen. A single lead-owned balance pass. |
| **Parallel merge conflicts.** | WP0 does every shared edit and mechanical split first. Ownership is disjoint. Contracts are stubs with fixed signatures. Change requests for shared files go through the lead. |
| **Migration bricks a save** (`useGame` loads at module init). | An idempotent v11 migration with `??` merges, a try/catch in `useGame` with a broken-save backup, and a v9→v11 chain test. |
| **`store.revise` invalidated** by any new dispatch in the Tower view, which silently drops orders. | Hard rule: no TICK, WelcomeBack, unlock or tab-title dispatch while the Tower view is mounted. The Door choice is made before Enter. |
| **Smoke-test fragility** (first-match button text, first `.pwin-close`). | The forbidden-text list (§4.0.7), no auto-windows for `now:0` or after `load()`, locked items kept clickable. |
| **Too much juice** (Kao 2020: extreme juice underperforms medium). | Shake only on crits, kills and big hits; hitstop scaled; a shake slider and reduced motion; the big effects saved for player-caused outcomes (Saved!, Avenged!, a 5★ pull). |
| **Doors add a click per floor.** | `ATTEMPT_FLOOR` defaults to `doors[0]`, so pressing Enter still works. The picker is inline on the Tower screen, not a modal. |
| **Softening canon** (deletion, decay). | The grey towers live on as lore, rivals and an opt-in `meta.hardcore` (engine-ready). Permadeath **stays**, which is the core canon. We only stop *total* wipes and make deaths matter. |
| **Echo and Last Stand power creep.** | Caps: 3 echoes per heir, plaques at 5%, Last Stand only with 3 or fewer heroes. All in TUNING. |
| **Nemesis on loop floors (F36-40) or the world-end floor** | Revenge floors skip anchors and the loop range. A Nemesis whose floor is passed by a rollback simply waits. |
| **Safari ITP wipes a save anyway.** | Export/import plus a gentle nudge after F5. `persist()` is best-effort. |

### What we deliberately did not do

- **A wholesale art-direction change** (§2). Weeks of work, zero effect on the root causes, real regression risk.
- **Branching Slay-the-Spire maps.** Doors give one choice per floor at a fraction of the cost. A full act map is a later step if Doors prove out.
- **Replacing permadeath** with a "wounded" state on normal floors. It is canon-defining. Rout, Last Stand, the mercy cap and Echoes fix the spiral without removing the stakes. A "Gentle" mode toggle is a possible later accessibility option.
- **Isel's Rewind / Divine Pulse.** The Decisive Moment already gives a fair way to change fate in the moment, and a rewind after commit would need a revise-after-dispatch path.
- **A beginner banner, more gem income, or any monetization change.** Money stays simulated. The fix for the first pull is a guarantee, not a sale.
- **Daily Floor with a shareable grid, weekly bosses, rotating shops.** Good but not essential. They risk appointment mechanics, and the Daily Dungeon already exists.
- **Push notifications.** No server. The honest tab title is enough. An opt-in, per-timer Notification API could come later.
- **Opt-in brewing timers** (choose 1h/4h/8h for the Kitchen and Training). The existing promotion, training and build timers already feed Lights Out.
- **Hero renaming and nicknames.** A field is reserved (`OwnedHero.nickname?`). It needs Roster UI work and is deferred to keep WP1 small.
- **A new music system** (boss and low-HP variants). Only the stings and hit layers change this round.
- **Touching PvP, guilds, synthesis or equipment design.** They are gated later by S3 and otherwise left alone. Fewer systems in front of the player is part of the fix.
- **Gaming the smoke tests.** Locked places stay real, usable panels in preview. Hiding them outright would need rewriting 13 smoke tests for little gain. That can be revisited once the unlock flow has been playtested.

---

## 6. As built (2026-10-16)

All 28 changes shipped on `claude/amazing-shannon-682s6p`, built as planned: WP0 first, then WP1–WP8 in parallel worktrees, each followed by an independent review. After that came integration, a real-browser playtest, a five-lens adversarial review (21 confirmed findings, all fixed), a polish pass and a tension-tuning pass. `npm run typecheck`, `npm test` and `npm run build` are green: 129 files and 1,616 tests, up from 40 and 842.

### What changed from the plan

- **The scout fights the floor instead of comparing CP (S12).** The CP ratio could not be made honest: mitigation scales with the attacker's level, and CP underprices speed. Fresh Lv1 recruits lost a hero on 31 of 32 floors scouted Safe, and F41 (Versace) read Risky while killing three heroes every time.
  - `scoutFloor` now runs 8 trial fights of the real attempt on its own hash-seeded streams, and never touches game RNG or state.
  - The bands come from the trial outcomes: Safe means 8 of 8 won, nobody fell and nobody dropped below 25% HP; Fair means at least 6 of 8 won with no deaths.
  - Trials are memoized by their exact battle inputs, so the lobby clock does not re-simulate.
  - The card reports the trials themselves, e.g. "In 8 trial runs: won 7 · lost a hero in 1".
- **The Decisive Moment (S16) offers only real choices, each with a stated cost.** "Focus the killer" saved nobody in 57 deadly fights, so it left the card; Focus stays on the dock. The card now offers:
  - Protect: spends an order.
  - Pull {name} back: a new `withdraw` order; the hero comes home shaken, −20 Sanity.
  - Retreat: the floor is lost.
  - Let fate decide: {name} falls.

  Before Protect or Pull back is offered, a dry run (`BattleOrders.preview`) checks that it saves the hero. "Saved!" plays only if the hero is alive when the fight ends.
- **The director (S13) has three additions:**
  - A single deployability predicate, `isFightable`, used by the battle, the director, the scout, the dailies and the UI. Heroes mid-promotion used to be exploitable: the director left them out while they still fought.
  - A level-aware roster figure through F25, which stops one boss death from spiralling.
  - Per-boss `anchorFeel`, because one band could not make every authored boss a peak.
- **The bosses rout after 2 deaths, not 3 (S19).** This means fewer permadeaths per lost boss fight.
- **Tension was retuned once the honest scout showed the truth.** The planned mercy bands (all below 1) capped every floor under the roster's own strength: F1–F24 bosses were 100% Safe and the Decisive Moment almost never fired. Skull doors and bosses were retuned, and `src/sim/feel.test.ts` now guards the result for a naive player and a typical player. Details: `docs/superpowers/plans/2026-10-16-fun-tension-tuning.md`.
- **Two smaller departures:**
  - Sweep never applies to the tutorial floors, guardian floors or revenge fights.
  - Summoning mid-Sortie is an explicit "Bank +X and summon ▸" button rather than a leave-confirm dialog.
- **The playtest's fixes:**
  - Pixelify Sans drew "fi"/"fl" as "A", so new players read "Take your Arst summon"; ligatures are now off.
  - The Party board saves itself.
  - The next decision on the results card is scrolled into view.
  - The 31-day grey return really greys the lobby.
  - Unlocks are named as they open, not saved up for one fanfare.

### Success metrics: before → target → as built

| Metric | Before | Target | As built |
|---|---|---|---|
| Meaningful decisions per floor from F3 | 0 | ≥ 1 | 2 Doors on every first clear. The Decisive Moment fires in 19–31% of early boss fights and about half of Skull fights. |
| First pull has a 3★ that knows a skill | 39.5% have a 3★, 0% have the skill | 100% | 200 of 200 seeds |
| Floor replay at default speed | 10–20 s (at 1×) | ≤ 15 s | about 6 s at 2×; Safe floors are swept in about 2.4 s |
| Deaths on floors scouted Safe | ratings were cosmetic (fresh rosters: 31 of 32) | 0 | 0 in every probe (thousands of fights) |
| Fair floors that cost a hero | n/a | ≤ 5% | about 1.4–2.9% |
| Losses that are full wipes | 22 of 24 | ≤ 10% | about 0.3%; 88–96% of losses are routs with ≤ 2 dead |
| Early bosses (F5, F10) as peaks | 0% at risk (all Safe) | a real peak | 30–50% of first tries put a hero at risk; Protect saves ≥ 75% |
| First Decisive lesson (Isel's coaching) | F3, on a 1–3% scratch | on a real threat | F5 or F10, the first boss |
| A welcome-back screen with ≥ 1 positive item after ≥ 8 h away | none | 100% | 100% |
| Bot progress over 14 days (8 seeds, median) | casual F40, engaged F84.5 | about the same | casual F49.5, engaged F83, with fewer deaths (65 vs 74 and 146 vs 186) |

### Where the evidence lives

- **Each package:** `docs/superpowers/plans/2026-10-12-fun-wp{1..8}-notes.md`, with what was built, the deviations and a review section.
- **The playtest:** `docs/superpowers/plans/2026-10-13-fun-playtest.md`, a real headless Chromium run on desktop, phone, French and a 10-hour / 31-day return.
- **The tuning:** `docs/superpowers/plans/2026-10-16-fun-tension-tuning.md`.
- **The research:** `docs/research/fun-{juice,retention,loop,art}.md`.

### Still open

- **F41 (Versace) is still the hardest early wall.** It is now honestly scouted Deadly. Making it fairer needs a tempo-aware CP or a lighter roster, which is a balance call.
- **Act I Path floors (F3–F9) read Safe** for a player who never takes the Skull door. The early tension comes from the F5 and F10 bosses and the Skull offered on every floor.
- **A few losses still cost 3 or more heroes.** A stricter rout rule turns about 10% of wins into retreats.
- **French hero wording no longer assumes the masculine** (fixed). Heroes have no gender in the engine, so 136 French entries were rephrased to not agree with the hero ("La mort de {b} est vengée", "{a} a gagné en force", "je l’attends de pied ferme"), and trait and favor-tier tags became epicene or nouns ("Calme", "Dévouement"). `frGender.test.ts` guards this: it flags 71 entries in the pre-fix files and 0 now. Still masculine: job and tier nouns ("fermier", "Apprenti", in "{job} {tier}") and generic role nouns ("un héritier", "un cuisinier"). Fixing those needs either a gender field or a rename of every job to a form without gender.
- **Technical leftovers:** the build warns about a chunk over 500 kB, and `facilityPanels.tsx` and `legacy/MemorialPanel.tsx` import each other (only inside functions, so harmless for now).
- **Phone layout:** the one-time "Back up your save?" nudge overlaps the goal tracker until it is dismissed.
