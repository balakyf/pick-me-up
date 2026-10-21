# WP8: Art and ambience (S10, V7–V9), build notes

> **Status:** Built · **Date:** 2026-10-12 · **Branch:** `fun/wp8-art` (based on `3b2ce0a`, the WP0 foundation)
> **Spec:** `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §2 (V7–V9), §3 S10, §4.9

The answer to "what about the art direction?" is to keep the style and make it move. Nothing about the existing look changes: every hero's idle frame is pixel-identical, and a test pins that across 86 looks.

## What the player gets

- **Battle poses for every procedural hero** (`drawHeroPose`, 24×32, facing left):
  - `windup`: the body rocks 2 px back and the weapon cocks behind the shoulder. An archer draws to the cheek instead.
  - `attack`: a lunge with the weapon extended. Swings leave a 2-px arc of fading light; thrusts (spear, daggers, bow, fists) leave speed lines.
  - `cast`: the hero rises onto their toes with eyes shut and palm or staff forward. Element-coloured glints surround the hand, and a rim of the element's light runs down the front edge.
  - `hurt`: the head snaps back further than the body, the eyes squeeze into a `<`, the arm is flung back, and strain marks appear ahead of the face.
  - `ko`: the hero slumps onto their knees with head bowed and the weapon dropped flat on the ground in front. A mage's robe pools on the ground.
  - `blink`: the idle frame with shut lids, used for the blink overlay.
- **Humanoid enemies** (goblins, soldiers, knights, lizardmen, mages, about 35 templates) use the same rig, mirrored to face the party. Their extras (goblin ears, skeleton jaw, demon horns, lizard tail) follow the head and hips.
- **Bespoke monsters** (beasts, dragons, golems, krakens, wraiths and so on) move through generic transforms:
  - wind-up: lean back and crouch;
  - attack: lean forward and stretch;
  - cast: rise and glow with an element rim light;
  - hurt: knocked back with a 55% white flash; the ink outline stays, so the shape still reads;
  - KO: flattened and drained of colour.
  - Sizes never change, so battle layout is unaffected.
- **Idle life:** each unit breathes (a 1-px bob, 0.9–1.4 s) and blinks every 2–5 s on its own phase, hashed from its id, so a party no longer bobs in lockstep. This is delivered as CSS variables plus a `LivingSprite` component.
- **Battle backdrop light pass (V8):**
  - a subtle colour grade per act (warm prairie morning, burning-city ember, swamp haze, crimson sky, violet Wailing Wall and so on);
  - a saturation ceiling, so nothing goes neon;
  - a stepped, dithered vignette that pulls the eye to the fighters.
  - It applies automatically through `drawBattleBg`.
- **Lobby ambience (V9):**
  - a time-of-day tint by the player's real local hour: night blue, dawn pink, clear morning, golden hour, dusk rose. Alpha is capped at 0.12.
  - fireflies come out with the dark (additive glow, pulsing);
  - leaves drift on a breeze by day and thin out at night.
  - There are never more than 40 particles. They are anchored in world space, so they drift past as the camera pans.
  - Under reduced motion the fireflies hold still and the leaves are dropped.
- **UI colour hierarchy (V7):**
  - The main action is gold (`--accent-cta`). This covers `.btn.cta`, `.btn.gold`, and the existing `.btn.primary.big` buttons: Results "Onward", Battle "Continue", Begin, the minigame CTAs and the recruit "Onward".
  - Purple now means secondary or selected.
  - On the title screen with a save, the gold goes to **Continue**. **New Game**, which overwrites the save, steps back to purple.
  - Red is only for danger. Dislikes, rivals and a lost tournament round use a muted rose (`--neg`).
  - There is a `.locked` dim style plus a `.lock-badge` for WP7. Locked items stay clickable.
  - Rarity tokens `--r1…--r7` and `.rarity-N` / `.rarity-text` / `.rarity-border` utilities are reserved for stars.
  - A global `prefers-reduced-motion` block, plus a `.reduce-motion` class for the in-game preference.
  - `.threat-label` now uses the loaded 600 weight instead of the missing 700.
  - Every hex literal in the ui.css body is now a `:root` token, with values unchanged. Only `#000` text shadows and the dev-gallery colours remain.
- **DevGallery (`?gallery`)** now shows:
  - every hero pose (labelled) next to the walk frames;
  - every enemy template in every pose;
  - a row of breathing, blinking `LivingSprite`s;
  - a live lobby-ambience preview with hour buttons.

## Files

**Changed (owned):**
- `src/ui/pixel/heroSprite.ts`: append only. The posed side view is a set of part layers plus a rig; `drawSide` is untouched. The import line gained `blit`, `CLEAR`, `rimLight` and `withAlpha`.
- `src/ui/pixel/enemySprite.ts`:
  - `humanoid(look, extra, pose)`, with extras taking part offsets;
  - `monsterPose`;
  - `drawEnemyPose` with its own bounded cache.
- `src/ui/pixel/bitmap.ts`: new functions only (`opaqueBounds`, `luma`, `chroma`, `flashWhite`, `shear`, `squash`, `rimLight`, `grade`, `capSaturation`, `vignette`). `outline` is untouched.
- `src/ui/pixel/sprites.ts`:
  - real `heroPoseUrl` and `enemyPoseUrl` bodies (cache prefixes `hp|…|pose` and `en|id|el|pose`; `idle` reuses the existing entries);
  - new `heroPoseCanvas`, `heroBlinkUrl` and `allyPoseUrl`;
  - `type ArtPose`.
- `src/ui/pixel/battleBg.ts`: `actGrade`, `BG_MAX_CHROMA`, `BG_VIGNETTE`, and `drawBattleBg(floor, {light?})`. The theme switch moved into a private `drawBattleTheme`.
- `src/ui/world/ambience.ts`: the full implementation, with the WP0 signatures unchanged.
- `src/ui/ui.css`: tokens, the hierarchy, `.locked`, rarity utilities, living-sprite rules, reduced motion and gallery styles.
- `src/ui/DevGallery.tsx`.
- `src/ui/pixel/pixel.test.ts`: append only. The new import lines are at the top.

**New:**
- `src/ui/pixel/poses.ts`: `idlePhase`, `idleStyle`, `battlePose`.
- `src/ui/pixel/LivingSprite.tsx`.
- Tests: `src/ui/pixel/poses.test.ts`, `src/ui/pixel/lightpass.test.ts`, `src/ui/pixel/LivingSprite.test.tsx`, `src/ui/world/ambience.test.ts`, `src/ui/world/ambience.jsdom.test.ts`, `src/ui/DevGallery.test.tsx`.
- This notes file.

`palette.ts` and `look.ts` needed no change, so no new RNG draws were added.

## Tests added (49)

**`pixel.test.ts` (+11):**
- The idle pose is pixel-identical to `drawHeroFrame(look,'left',0)` for 84 heroes covering every outfit, weapon, headgear, cape and trim, plus 2 Master looks.
- Every pose is 24×32, has more than 150 opaque pixels, is deterministic and differs from frame 0.
- All poses are mutually distinct.
- A blink changes at most 4 pixels, all in the eye rows.
- KO stays above row 31.
- Posing leaves looks and walk frames untouched.
- Enemies:
  - `idle` is exactly `drawEnemy`;
  - every template × pose keeps the same size, stays solid and differs from idle;
  - the cached idle bitmap is never mutated;
  - humanoids are mirrored;
  - goblin ears follow the KO head;
  - the unknown-template fallback poses.
- The existing outline, mirror, 60-busts and backdrop tests are untouched and still green.

**`lightpass.test.ts` (15):**
- Every pass is pure (the input is never mutated).
- Flash keeps the ink.
- Shear plants the feet and clamps so nothing clips.
- Squash anchors at the feet and fits.
- Rim light lights only the side facing the light.
- Grade keeps alpha and luma.
- The saturation cap works.
- Backdrops: each act's grade is at most 0.12; the light pass is on by default, `light:false` gives the raw art, chroma stays under the cap, the corners darken and the centre is kept; the result is deterministic.
- Monster poses: hurt keeps the ink, KO is flatter, idle and blink are identity.

**`poses.test.ts` (7):**
- The phase is pure, within its ranges and starts mid-cycle.
- A party of 5 is desynchronised.
- The CSS variables are correct.
- `battlePose` priority holds, and every returned pose has art.
- The rig directions are right.

**`ambience.test.ts` (12) and `ambience.jsdom.test.ts` (1):**
- Tint shape, alpha cap and midnight wrap.
- The night curve, with the world clock leading.
- Particle budget of 40 or fewer, fireflies only at night, no leaves under reduced motion.
- Particles are deterministic, stay in the field, move over time, freeze when still, and are world-anchored.
- The render draws the tint, then additive fireflies, and restores the context.
- A clear morning draws no tint.
- `drawAmbience` is a no-op in node and in jsdom.

**`LivingSprite.test.tsx` (2):** the phase variables and blink overlay are present; `still` removes them.

**`DevGallery.test.tsx` (1):** every hero pose and every enemy × pose is shown, along with 10 living sprites.

## Deviations from the spec, and why

1. **"Append `drawHeroPose` … built on `drawSide`" while heroSprite.ts is append-only.**
   - Reusing `drawSide`'s parts without editing it means re-laying its geometry out as part layers in the appended section.
   - The duplication is pinned by the idle-identity test. If anyone ever edits `drawSide`, that test fails until the layers match again.
   - The lead may later collapse `drawSide` onto the layers, which is safe because of that same test.
2. **Two extra art poses.** `windup` (S7's anticipation) and `blink` (idle life) were added as `ArtPose = Pose | 'windup' | 'blink'`. The WP0 `Pose` type is unchanged. `heroPoseUrl` and `enemyPoseUrl` now accept the superset, so existing call sites still typecheck.
3. **`humanoid(pose)`.**
   - The roughly 35 registry closures take no arguments, so `drawEnemyPose` sets a module-level `posing` around one synchronous draw, and `humanoid` defaults its new `pose` parameter to it.
   - Extras now receive `{hx, hy, bx, by}` offsets.
   - For posed frames, extras get their own outline ring. This keeps the weapon trail, which is light rather than an object, from being outlined.
4. **Gold CTA.**
   - Rather than wait on four packages to add a `cta` class, the existing `.btn.primary.big` buttons became the gold CTA, since on every screen they are the main action.
   - The title screen gets an explicit exception so the destructive New Game is never the gold one.
   - `.btn.primary` without `.big` (tabs, toggles, Tower "Enter") stays purple, so the Tower screen needs the request below.
5. **"Rarity colours only for rarity."**
   - The UI chrome gold (`--gold #f2c75c`) is the same hue as the 5★ `STAR_COLOR`. Changing the chrome gold would restyle every title and heading, and `bits.tsx` is a shared file, so I left both.
   - The CTA fill (`#c8962a`) is distinct from both.
   - Rarity tokens are reserved for stars from now on.
6. **Fireflies follow the world's visible darkness first** (the lobby's existing world-clock lighting), with the player's real night at half weight. The tint follows the real local hour as specified. Fireflies over a sunlit world-day would look wrong.
7. **The backdrop light pass is on by default inside `drawBattleBg`.** BattleScene's cache key is unchanged, so the pass shows up with no WP2 change. `drawBattleBg(f, {light:false})` returns the raw art.
8. **No FR module.** WP8 adds no player-facing strings. The DevGallery labels are dev-only, like the existing `'classless'` caption there.

## SHARED-FILE / cross-package requests

1. **WP2: `battle/BattleScene.tsx` and `battle/battle.css`** (wiring S10; none of this is done because I don't own those files):
   - Sprites:
     - heroes: `heroPoseUrl(heroSrc(u), battlePose({acting, casting: <skill act>, hurt, dead, windingUp: <S7 anticipation beat>}))`;
     - enemies: `enemyPoseUrl(u.name, u.element, pose)`;
     - NPC allies: `allyPoseUrl(u.name, pose)`.
     - This replaces the current `heroFrameUrl(…, acting ? 1 : 0)`.
   - Idle life:
     - on the `.bsprite` wrapper, set `style={idleStyle(u.id)}`;
     - in battle.css: `.bunit:not(.ko) .bsprite { animation: idleBreath var(--idle-period, 1s) steps(1, end) var(--idle-delay, 0s) infinite; }` (the `idleBreath` keyframes live in ui.css; `steps(1, end)` gives a crisp rest/up pair, whereas the current `idle 1s steps(2)` adds a half-pixel in-between frame). Set `--idle-px: 3` on the wrapper if the bob should be one art pixel at the 3× battle scale;
     - for blinks, render `LivingSprite` (or the `.blink-stack` markup) with `blinkSrc={heroBlinkUrl(hero)}` while the pose is `idle`.
   - KO: with the `ko` pose, drop `.bunit.hero.ko .bsprite { transform: rotate(-90deg) … }`, because the slump is already drawn. Keep the greyscale (S9).
2. **WP7: `App.tsx`:** toggle `document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion)` from `usePrefs()`. ui.css already covers the OS setting through the media query.
3. **WP4: `TowerScreen.tsx`:** add `cta` to the "Enter" button (`btn primary cta`). It is the main action of the Tower screen but isn't `.big`, so it stays purple until then.
4. **WP7 (menu gating):** use `.locked` on locked menu items and `<span className="lock-badge">` for the "F5" / "ML3" hint.
5. **Owner of `world/LobbyWorld.tsx` (sparring, about l.810):** `heroPoseCanvas(src, 'attack' | 'hurt')` would make sparring pairs actually trade blows. This is optional.
6. **Lead, `bits.tsx`:** `STAR_COLOR` and the new `--r1…--r7` tokens hold the same values. Keep them in sync if either changes.
7. **WP6 (V9 "lobby desaturates while greyed"):** this belongs to the return layer and is not done here. `capSaturation`/`grade` in bitmap.ts are available for any bitmap work, but a CSS `filter: saturate()` on the canvas is the cheapest route.
8. **WP1, `screens.tsx` Summon screen (added in review):** the ×1 and ×10 pulls are both `btn gold big`, which puts two gold CTAs on one screen (V7 wants one). Make ×10 the CTA (`btn cta big`) and drop ×1 to `btn big` (purple). When ×10 is unaffordable, it may be better to move `cta` to ×1.
9. **WP2, `battle/battle.css` (V8 additive sparks; added in review):** the S10/V8 "additive spark layer (`'lighter'`)" lives in battle.css or BattleScene. WP8 covers only the backdrop grade and vignette, so nobody has built the sparks yet. Use `mix-blend-mode: plus-lighter` (or `screen`) on the hit-spark element.
10. **`world/LobbyWorld.tsx` owner (optional; added in review):** skip `drawAmbience` while the player is `inside` a building, so leaves don't drift through interiors. Passing nothing new is fine; just don't call it.

## Known gaps

- **No in-browser check.** There is no headless browser in this environment. I checked the art by rendering contact sheets to PNG from the real generators (hero poses × 14 looks, every enemy × 6 poses, backdrops before and after) and reviewing them. The CSS (gold CTA, locked, living sprites) has not been seen in a browser.
- **Nothing moves in battle until WP2 wires the URLs and variables.** The art, the cache and the helpers are ready, and the backdrop light pass is already live.
- **Single frames, not animations.** Each pose is one frame (the trail is baked into the attack frame). That is enough for the WP2 replay cadence; a two-frame strike would need a new `ArtPose`.
- **Bespoke monsters use transforms, not redraws.** A dragon's attack is a lean and a stretch, not a new jaw position.
- **Cast on non-casters** (a sword raised before the face, with glints) reads as a focus or skill pose rather than spellcasting. That is by design, since every class has skills.

## Review (independent reviewer, 2026-10-13)

**Verdict: ship with concerns.**
- Every §4.9 behaviour and acceptance item is implemented and tested.
- There are no engine changes and no new `t()` strings, so no FR module is needed (the extraction check found 0 strings).
- Every edited file is on the owned list, plus new files. `pixel.test.ts` and `heroSprite.ts` only gained appended code and import lines; `outline` and `drawSide` are untouched.

**What was probed:**
- **Hero poses:** 600 generated heroes, plus a Master, Priasis and the Key Bearer, all draw every pose with more than 150 opaque pixels. Every one of them has a blink that actually changes pixels.
- **Enemy poses:** every `KNOWN_ENEMIES` template and the unknown fallback, in all 7 elements and all 7 poses, keep their idle size.
- **Idle phase:** the idle period is always 900–1400 ms, with 35 distinct periods across 50 ids.
- **Backdrops:** `drawBattleBg` handles floors 0, −1, 36, 40, 90, 91, 100, 101 and 999 (tournament and loop floors).
- **Backdrop cache:** BattleScene's `bbg|p` cache key for F1–9 is safe, because F1–9 share a single grade.

**Fixed:**
1. **Breathing smeared pixels.**
   - Problem: `.idle-life` used `steps(2)` over a `0 → −1px → 0` keyframe, which renders a −0.5 px in-between frame.
   - Fix: it now uses `steps(1, end)` with an explicit `0%` keyframe, which gives a crisp two-frame rest/up breath.
   - Also corrected the WP2 request, which copied the same `steps(2)` pattern.
2. **The `.locked` class collided with two existing uses.**
   - **Tower floors ahead (`.floor.locked`):** the class had added a 70% greyscale, which washed out the red **WORLD'S END** danger badge on F90 before the player reaches it. It also added a hover brightening on non-interactive divs.
   - **Shut facility panels (`.lobby-portal.locked`):** the class dimmed the panel's only content, the "Unlocks at Master Lv N" text, to 55%.
   - Fix: the generic rule now excludes both. The hover lift applies only to `button`, `a` and `[role=button]`.
3. **Idle-cache guard.** `drawEnemy` now pins `posing = 'idle'` around its draw, so the shared idle cache can never hold a posed frame, even if a drawer someday reaches `drawEnemy` mid-pose. A test covers this (`lightpass.test.ts`, run on a fresh module instance).
4. **New `src/ui/uiCss.test.ts` (7 tests).** It pins the V7 work that previously had no test:
   - the hierarchy tokens exist;
   - no stray hex literals outside `:root` (the `#000` shadows and the dev gallery are exempt);
   - the gold CTA versus the purple primary;
   - `.locked` dims but never sets `pointer-events: none`;
   - no unloaded 700 weight;
   - both reduced-motion paths;
   - the crisp breath step.

**Remaining concerns (not blocking):**
- **The CSS is still unseen in a browser:** the gold CTA, the title-screen override, the living sprites and the global reduced-motion block. The reduced-motion block also cuts every other package's animations to 0.001 ms with a single iteration. That is spec-mandated, but WP1 and WP2 should check that their reveal sequences still end in a visible state under reduced motion. Animations with `forwards` or `both` fill do.
- **Fireflies by day.** The player's own night adds half weight to the firefly count (deviation 6). A late-night player in a world-daytime lobby gets about 12 pale fireflies over a sunlit lawn. They are faint because of the additive blend, but the lead may prefer to zero them while the world is light.
- **Gold CTA covers screens WP8 doesn't own.** The `.btn.primary.big` → gold rule applies everywhere. Today each screen has one such button, but any package that adds a second `primary big` button gets a second gold one.
- **Two gold buttons on the Summon screen.** The Summon screen still shows two gold buttons (request 8).
- **`sprites.ts` additions.** sprites.ts gained three small exports (`heroPoseCanvas`, `heroBlinkUrl`, `allyPoseUrl`) and `type ArtPose`, beyond "the bodies of the pose functions". They are additive and sit in the pose section, so they shouldn't conflict, but the lead should know about them at merge.

**Gates after the review:** `npm run typecheck` is clean. `npm test` passes: 58 files and 944 tests (936 before the review). `npm run build` succeeds.
