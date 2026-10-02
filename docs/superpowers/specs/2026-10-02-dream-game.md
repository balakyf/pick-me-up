# The Dream Game · Program Plan

> **Status:** In progress · **Date:** 2026-10-02 · **Branch:** `claude/busy-einstein-ofq1o3`
> **Brief from the owner:** "improve this game like you want, go crazy, build the best version that can exist, make it your dream game."
> **Evidence:** an understand pass (5 code readers, 3 browser playtests at F1–F15, F59 and F79 using `npm run mksave` bot saves, 1 canon-gap analysis). Raw reports were kept out of the repo; this plan records the conclusions.

## Vision

Pick Me Up! is the tower where **every hero is a person and every death is a choice you made with open eyes.**

You summon a person, not a stat block: the crystal shows their past life, their voice, their born trade and the trait that makes even a 1★ baker worth keeping. You climb in short pushes and come home to a camp that remembers: heroes are tired, grieving, feuding or falling for each other, and you see it happen. Before each floor the pure, seeded engine runs the real fight many times and tells you the truth: the odds, who is likely to fall, and what would change it. Fights are short dramas you can read and steer: a tank taunts, a support shields, a mage holds her burst for the third wave; bosses arrive with a title card and their own theme, telegraph their big attacks and change phase, and your orders answer them. Every anchor floor is a story beat. When someone falls, the world goes grey, the results become a memorial, Isel speaks for them and their friends mourn for days. The arc ends in a real decision at F90, an epilogue whose credits list your fallen, and a New Cycle on a harder world.

## Pillars

1. **Every death is a choice, never an ambush.** Honest forecasts, visible morale and refusals, safety rails before permadeath, and orders that work.
2. **Heroes are people, not stat blocks.** Identity at the summon, innate traits, one hero sheet, grief and drama you can see.
3. **Fights are short dramas you can read and steer.** Real roles (heal, shield, taunt, status), enemy kits, telegraphs and boss phases, WEAK/RESIST/IMMUNE, meaningful orders.
4. **Every anchor is an event.** Briefing, boss lines, title card, boss bar, its own music, an objective HUD, a results screen that celebrates or mourns.
5. **Climb, camp, mourn, prepare.** Morale is a resource; the lobby is where you recover and bond; rewards are celebrated.
6. **The engine stays pure, deterministic and sim-validated.**

## What stays (do not regress)

The deterministic engine contract (`reduce`, `rngFor` sub-streams, gated draws, the golden combat test, the `store.revise` re-resolve seam). The hero death moment and last words. Isel's letter and the diaries. The Memorial. The summon ritual. The Party Board. The hero profile window. The lobby renderer (campus, day/night, weather, roof cut-aways, walkers). Parallax act backdrops, crit hit-stop, element sparks. The F10 falling city, the F36–40 loop, the shared-seed Wall. Raids, bond groups, Isel's Advice. The i18n architecture. The sim bots. Existing QoL (hotkeys, speeds, save export/import, backup nudge, tracker).

## Lane rules (every builder follows these)

1. **Setup.** You work in a git worktree. First run `ln -s /home/user/pick-me-up/node_modules node_modules` in it (git ignores the link). Never `git add -A` blindly; stage your own files.
2. **Engine purity.** `src/engine` stays pure and deterministic: no `Math.random`, `Date.now`, `new Date`, `performance.now`, transcendental `Math.*`, or fractional/variable `**` (use integer tables or multiply loops). `src/engine/__guards/determinism.test.ts` enforces this.
3. **Randomness.** All rolls go through `rngFor(seed, '<new-stream-name>', …)` or a threaded `Rng`. A new combat roll is **gated** on a positive chance so battles without the feature replay bit-identically. Change golden values (`combat.test.ts` golden block, `gacha.test.ts` pins) only on purpose and say why in the commit and in your lane notes.
4. **Commands.** State changes go through `reduce(state, Command)`: append to the `Command` union (never reorder), add a `reduceCore` case (exhaustive `never` check), usually a `*WithResult` helper for the UI, and teach the sim bots if it is a lever. Refusals throw `Error('fnName: reason')`.
5. **Orders.** Any interactive battle feature must keep `reduce(state, cmd)` identical to `attemptFloorWithResult(pre, …, orders)`.
6. **Numbers** live in `src/engine/tuning.ts` or a module tuning file. Add new blocks; only the balance lane retunes shared values.
7. **No schema bump** unless your lane says so. Prefer optional fields read through a defaulting reader (the `lifeOf`/`challengeOf`/`estateOf` pattern) or data derived from identity (`personalityOf`, `look`). Never mutate `hero.name`.
8. **Events.** Every `CombatEvent` kind needs a presentation duration. Route new kinds through a captions module like `src/ui/battle/synergyCaptions.ts` (`depthSnap` + `DEPTH_DURATION`) so `BattleScene`'s exhaustive record stays small.
9. **Strings.** Every user-facing string goes through `t('English', {vars})`. French goes in **your own** `src/ui/i18n/slices/fr<Feature>.ts` (`export default { … } satisfies Record<string, string>`); `fr.ts` merges every slice automatically, so never edit `fr.ts`. Placeholders must match; no empty entries. Content names (skills, enemies, traits, story) need French too.
10. **UI is presentation.** Logic goes in pure `.ts` helpers with unit tests. jsdom tests start with `// @vitest-environment jsdom`. Respect reduced motion. New overlays use `.overlay`, `.battle` or `[role=dialog]` so hotkeys stand aside.
11. **CSS.** New rules go in your own CSS file (`battle.css`, `tower.css`, …). Do not append to `ui.css` (later rules there silently override earlier ones).
12. **Pixel art** is generated as deterministic Bitmaps (`bitmap.ts`, `palette.ts`, `outline`, seeded via `ui/pixel/rand.ts`). Only `render.ts` touches canvas; its caches never evict, so never put animation state in cache keys. Every enemy template needs a drawer and every act a backdrop (`pixel.test.ts`).
13. **Sim.** Teach every new lever to the bots (`src/sim/sim.ts`, small helpers, one-line `LEVERS` edits). Run `npm run sim -- 30 3` when you change the engine and compare against the previous numbers. `npm run mksave -- <casual|engaged|whale> <days>` makes a save for browser checks.
14. **Done means:** `npm run typecheck` clean, `npx vitest run` fully green, a browser check of your feature (run your own `npx vite --port <yourPort> --strictPort --host 127.0.0.1` from your worktree, drive it with Playwright from `/opt/node22/lib/node_modules/playwright/index.mjs` and `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, look at the screenshots, then kill the server) at 1280×800 and 390×844, notes in `docs/superpowers/specs/2026-10-02-lane-<id>.md` (what you built, decisions, sim numbers, what is left), and your work committed on your worktree branch.

## Lanes

Two lanes run at a time (in separate worktrees) and merge before the next wave. **Ownership** means the lane may restructure that file freely; other lanes running at the same time keep their edits there to small hooks.

| Wave | Lane | Owns |
|---|---|---|
| 1 | **A · Foundation UI** (splits, readability, UI bug sweep, toasts) | `ui.css`, `screens.tsx`→splits, `facilityPanels.tsx`→`facilities/*`, `BattleScene.tsx`→extraction, `App.tsx`, summon UI |
| 1 | **B · Foundation engine** (deploy rails, gear on death, banquet, persistence, ML curve, true CP, small engine bugs) | `tower.ts` deploy, `store.ts`, `scout.ts` CP, `equipment.ts`, `kitchen.ts`, `master.ts`, `pvp.ts` |
| 2 | **C · War room** (simulated forecast, safety UI, tower screen restructure, order fixes, replay-on-reload) | `scout/`, `TowerScreen.tsx`, `tower/*` UI, battle order bar |
| 2 | **D · Combat brain** (smart AI, AoE monopoly, immunity, enemy casters, hit effectiveness, mission events) | `combat.ts`, `unit.ts`, `content/skills.ts`, `skills/`, golden test |
| 3 | **E · Battle readability** (WEAK/RESIST/IMMUNE, AoE beats, popups, banners, SP/turn order, objective HUD, phone battle) | `ui/battle/*` |
| 3 | **F · Skills & roles** (heal, shield, buffs, DoT, stun, taunt, multi-hit, statuses, re-authored kits) | `combat.ts`, `content/skills.ts`, `skills/` |
| 4 | **G · Enemy kits & boss phases, orders 2.0** | `combat.ts`, `enemyTemplates.ts`, `anchors.ts` kits, `tactical/` |
| 4 | **H · Audio & settings** (sequencer, soundtrack per act/boss/scene, sfx timbres, settings window, accessibility) | `ui/audio/*`, `ui/qol/Settings.tsx`, `ui/motion.ts` |
| 5 | **I · Boss presentation & battle bodies** (intros, boss bar, big boss sprites, poses, skill VFX, backdrops) | `ui/pixel/heroSprite.ts`, `enemySprite.ts`, `battleBg.ts`, `ui/battle/*` |
| 5 | **J · Heroes are people** (innate traits, summon reveal 2.0, promotion ceremony with choices) | `content/traits.ts`, `gacha/`, `promotion/`, `ui/summon/*` |
| 6 | **K · Results, memorial & transitions** (results ceremony, battle stats, memorial band, recovery reframed, scene transitions, reward juice, title diorama) | `ui/results/*`, `ui/transition/*`, `events/` |
| 6 | **L · Living lobby & morale** (gazette, incidents, grief, camp summary, morale pips and recovery) | `life/`, `time.ts`, `ui/world/*`, `ui/life/*` |
| 7 | **M · Story** (anchor briefings, boss lines, act cards, Priasis arc, Isel's eulogy, F90 Herald) | `content/story.ts`, `ui/story/*` |
| 7 | **N · Hero sheet, picker & gear** | `ui/hero/*`, `ui/facilities/*`, `equipment/` |
| 8 | **O · Endgame** (Wall siege, F81–89, F90 consequences, Echoes, epilogue and credits, New Cycle) | `tower.ts` endgame, `challenge/echo.ts`, `ui/ending/*` |
| 8 | **P · Missions & the teaching curve** | `tower.ts` filler, `content/acts.ts`, `ui/qol/coach.ts` |
| 9 | **Q · Late systems & lobby art** (PvP on stage, guild raids, lobby architecture, big-screen layouts) | `pvp/`, `ui/pvpPanels.tsx`, `ui/pixel/estateArt.ts`, `campusProps.ts` |
| 9 | **R · Balance pass 3** (sim-driven retune of everything) | `tuning.ts`, `sim/` |

Each lane's detailed brief lives in its workflow prompt; its notes file records what shipped.
