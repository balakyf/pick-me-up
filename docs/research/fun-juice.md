# Moment-to-moment fun and game feel ("juice") for Pick Me Up! Infinite Gacha

**Sources.** This session's egress policy only reached GitHub, so I read the *Juice it or lose it* demo source (grapefrukt/juicy-breakout) directly. Every other source is cited from search-engine excerpts of the linked page. Where a number comes from a single secondary source, I mark it **(heuristic)**.

**How this maps to the playtest:**
- **Finding 1, the first summon.** The deflation comes from the result itself and from how it is shown. The game skips the colour tell, the one-by-one reveal and the escalation.
- **Findings 3 and 4, the climb.** Floors 1-12 are long passive replays with no decisions in them. They give no visible growth and no telegraphed danger, so the F13 wipe lands as unfair.
- **Finding 6, death.** Permadeath has a memorial and last words. But death gives nothing back to the player, and nothing in the world remembers it, so it turns into a death spiral instead of a story.
- **Finding 7, static art.** The art is static and the existing juice is limited to crits. Most hits get no flash, squash, anticipation, layered sound or pitch escalation.

---

## 1. The juice classics, with numbers

**Juice it or lose it (Martin Jonasson & Petri Purho, GDC Europe 2012).** Talk: https://www.youtube.com/watch?v=Fy0aCDmgnxg. Coverage: https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-.

Their thesis is "maximum output for minimum input": things that "wobble, squirt, bounce around, and make little cute noises." The demo source is public at https://github.com/grapefrukt/juicy-breakout (`Settings.as`, `Freezer.as`, `Shaker.as`, `Main.as`), and it gives real values:
- **Tween-in on spawn.** Duration 0.7 s by default, with selectable Penner easing equations. Y, rotation and scale can each be tweened.
- **Freeze ("sleep").** A time-scale multiplier, not a hard pause. Duration slider 0-320 ms, speed multiplier 0-1, and separate fade-in and fade-out ramps of 0-160 ms each. Game speed is multiplied every frame, so the global tweens slow too (`GTween.timeScaleAll`).
- **Screen shake.** Directional, not random: the impulse is `-ballVelocity × power` (power 0.5), fed into a damped spring with drag 0.1 and elasticity 0.1. The camera recoils away from the impact and wobbles back.
- **Rising pitch on combos.** Each block hit plays the *next* sound in a sequence (`playSoundId("ball-block", counter)`). The counter resets after 60 frames (~1 s) without a hit.
- **Personality.** The paddle has eyes that follow the ball, and a smile. Also included: jelly blocks, ball stretch along velocity, trails, block shatter and particles.
- **Reading list in the repo.** Robert Penner's easing functions, the 12 principles of animation, and Swink's game-feel.com.

**The Art of Screenshake (Jan Willem Nijman, Vlambeer, INDIGO 2013).** Talk: https://www.youtube.com/watch?v=AJdEqssNZ-U. Step-by-step recreation: https://dkliao.itch.io/the-art-of-screenshake-recreation/devlog/451576/quick-breakdown-of-all-the-effects.

The talk layers effects onto a dull shooter in this order:
- animation
- muzzle flash
- impact effects
- enemy knockback
- **permanence** (corpses and casings stay on the floor)
- camera lerp
- screenshake
- player knockback
- **hit pause ("sleep")**
- weapon recoil
- random enemy explosions

Nuclear Throne's pistol, as described in Nijman's Rock Paper Shotgun interview and summarised at https://infovore.org/?p=5275: the camera kicks back **6 px** toward the aim direction, **+4** is added to a shake value that "degenerates quickly", the gun sprite kicks back **2** and snaps back, and the bullet moves 16 px per frame.

**Steve Swink, *Game Feel* (2009).** Swink defines game feel as "real-time control of virtual objects in a simulated space, with interactions emphasised by polish". "Real-time" here means a response loop under ~100 ms (https://lizengland.com/blog/review-game-feel-by-steve-swink/). Pichlmair & Johansen's survey of 200+ sources sorts game-feel work into **physicality, amplification and support** (https://arxiv.org/pdf/2011.09201). In a watch-only auto-battle, the levers you have left are *amplification* (juice) and *support* (readability and telegraphs). The <100 ms rule still applies to every button: order taps, the summon tap and the speed toggle.

**Hitstop / hit-pause**
- **Sakurai (Smash).** Both fighters freeze for the same duration, and more damage means longer hitstop. Values are also tuned per attack: Marth's sword tip gets more than the blade (https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/).
- **Smash mechanics.** The attacker freezes on the contact frame while the victim freezes on its first flinch frame and *shakes*. Duration scales with damage and is capped at **30 frames (500 ms)**. Electric hits get ×1.5 (https://www.ssbwiki.com/Hitlag).
- **Street Fighter V, as one game's data.** Light, medium and heavy hits get **8, 12 and 16 frames** of hit/block stop (https://game.capcom.com/cfn/sfv/column/131545?lang=en).
- **General guidance (heuristic).** 50-100 ms on a heavy hit "feels like it connected with real force". Shorter is imperceptible, and longer reads as lag (https://www.wayline.io/learn/game-feel/1, https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/).

**Screen shake with decay (Squirrel Eiserloh, "Juicing Your Cameras With Math", GDC 2016).** Talk: https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math.
- **Trauma model.** Events add to `trauma ∈ [0,1]`, and shake = trauma² (or ³), because linear shake "doesn't feel punchy".
- **Noise, not random jumps.** Offsets come from smooth noise, so the shake is continuous.
- **Reference values.** Bevy's implementation decays trauma at **0.5/s** (full trauma clears in 2 s) and allows up to 10° rotation (https://bevy.org/examples/camera/2d-screen-shake/). The npm `screen-shake` package defaults to maxAngle 10 and maxOffset 30 px (https://www.npmjs.com/package/screen-shake). The Godot recipe recommends a power of 2-3 (https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/).
- **For a ~320-480 px pixel-art stage,** I'd use a max offset of 6-10 px. Use **no rotation** on pixel art, because rotated pixels shimmer.

**Flash-on-hit, squash and stretch, anticipation, damage numbers**
- **Flash.** A white-flash frame is the cheapest "you hit it" signal. Pair it with a sound, because players call a lone white flash "jarring" (https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/).
- **Anticipation (telegraph).** This is the animation principle that prepares the viewer for the action (https://wavemotioncannon.com/2017/05/02/animation-principles-anticipations/). Rule of thumb: **2-4 frames** for small actions and **12-24 frames** for major moments, and a bigger anticipation lets the strike itself be faster (heuristic, https://playbooks.com/skills/dylantarre/animation-principles/anticipation-mastery).
- **Damage numbers.** Blizzard deliberately shows full figures because "the full figure feels more rewarding". When numbers got hard to read, they added a **colour highlight for the biggest hits** above a threshold rather than shrinking the numbers (https://us.diablo3.com/blog/19996041, https://blizzardwatch.com/2016/01/25/diablo-damage-numbers-changed/).

**Sound**
- **Layering.** Build a hit from three parts: a *transient* (sharp attack), a *body* and a short *tail*, plus a sub layer for weight. "A strong body with no transient feels muffled; a transient with no body feels thin and toy-like", and fast action needs short tails (https://violetrecording.com/how-to-make-impact-sounds/).
- **Variation.** Randomise pitch by about ±5% per play and never repeat a variant back-to-back (https://bugnet.io/blog/how-to-implement-footstep-variation-to-avoid-repetition).
- **Rising pitch.** Peggle plays each peg hit as the next note *up the scale of the current music key*, so escalation always sounds consonant (https://blog.audiokinetic.com/en/peggle-blast-peg-hits-and-the-music-system).

**Reward fanfare.** Vampire Survivors' developer drew on his slot-machine background for the chest opening: the game pauses, a jaunty tune plays and colours shoot out, with a chance of 3 or 5 rewards at once (https://en.wikipedia.org/wiki/Vampire_Survivors, https://avclub.com/vampire-survivors-is-an-addictive-castlevania-parody-1848883748). Cheap fanfare on a reward is one of the highest-value juice moments there is.

---

## 2. Gacha summon presentation

**The colour grammar.** Low rarity reads cool and muted, mid rarity warmer, and top rarity gold, rainbow or a blinding light. The colour arrives **before** the identity, and the animation exists to stretch that gap. Players react before the character appears (https://hostedgg.com/blog/gacha-pull-reveal-color-culture). Concrete implementations:
- **Wuthering Waves.** The animation colour equals the *highest* rarity in the pull (blue 3★, purple 4★, gold 5★), and it is fixed and never changes mid-animation (https://samurai-gamers.com/wuthering-waves/wuwa-wish-rarity-indicator-guide/). Genshin uses the same tri-colour convention.
- **Honkai: Star Rail.** 4★ results get a purple animation. A 5★ gets a subtle rainbow shimmer on the ticket **and the music changes** (https://www.ginx.tv/en/4-star-5-star-warp-animation-differences).
- **Arknights.** Light comes out of the bag to show the rarity inside. Endfield's lever glows red when a 6★ is guaranteed (https://gamewith.net/arknights/article/show/14989, https://gamewith.net/akendfield/72597).
- **Uma Musume.** Uses several stacked tells: a rainbow gate guarantees a 3★, and a **silver gate can still upgrade when it opens**. A director appearing with a "So Intense!" fan, an ornate door, and sparkling text above the gate are each separate 3★ tells (https://gamewith.net/69656).
- **Sword of Convallaria.** The tarot card border **upgrades to rainbow** mid-reveal to guarantee a Legendary (https://gamewith.net/sword-of-convallaria/69027).

**Why it works.** The pull becomes a short story with a beat structure: a tell (hope), staged escalation (suspense), then the reveal. Upgrade tells add a second, positive surprise. The reveal length also scales with rarity: commons get short, simple sequences and rare results get the full cinematic.

**One thing to avoid.** Many gacha games briefly show a valuable item before landing on a worse one, a "near miss" that encourages another pull (https://en.wikipedia.org/wiki/Gacha_game). With no real money involved, the ethical risk is small. Even so, use **upgrades only** (silver → gold → rainbow) and never a fake-out downgrade: a downgrade *adds* to the deflation the playtest found.

**Guarantees and pity.** Multi-pulls and banners carry floors and pity: Arknights has a 2% base 6★ rate with soft pity after 50 pulls (GameWith above), and Blue Archive lets you pick a 3★ after 200 pulls (https://www.pockettactics.com/blue-archive/banner). For our tutorial 10-pull, the fix is a **guaranteed 3★ in the free pull**, plus at least one hero with a class and a skill. An eleven-1★ first impression should be impossible.

---

## 3. Making auto-battle watching engaging, and the win feel earned

**Skill moves to preparation, and combat is the verdict.** Auto-battlers "stripped skill expression from combat and moved it entirely to preparation". The fight "validates or punishes your thinking" (https://summerengine.com/templates/strategy/auto-battler/auto-battler). The genre is defined as combat that unfolds "without the player's direct input" (https://dl.digra.org/index.php/dl/article/download/2805/2789/2848). The known failure case is a loop of "buy, place, watch" with no visible link between decisions and outcome (https://adantede.itch.io/lordsworn/devlog/870992/designing-combat-i-how-bazaar). That is exactly our F1-F12.

**Short fights, and accelerate the tail**
- **Backpack Battles.** Fights last about **10-20 s**, and items trigger on visible per-item intervals and from adjacency (https://en.wikipedia.org/wiki/Backpack_Battles).
- **TFT overtime.** After **30 s** of combat, overtime speeds everything up: +300% attack speed and +200% ability damage for 15 s (https://www.breakflip.com/actualites/107484.html). The point is that a long fight is boring, so the game compresses it.
- **For us,** a 15-60 s replay at 1x is roughly 2-3× too long. Target **8-20 s** at the default speed.

**Readable cause and effect**
- **The Bazaar.** Every item shows a cooldown that visibly charges, and Haste, Slow and Freeze visibly change those bars (https://mobalytics.gg/the-bazaar/guides/keywords-and-terms). That lets you *watch your build work*.
- **Super Auto Pets.** Offers a replay so you can study why you lost (https://www.twoaveragegamers.com/heres-why-super-auto-pets-is-the-perfect-game-for-new-parents).

**One meaningful in-fight button**
- **AFK Arena.** Each hero's ultimate meter fills as they attack, and you **tap the portrait** to fire it. Guides tell you to switch Auto off on hard fights so you can time ultimates yourself, and to max battle speed on easy ones (https://www.bluestacks.com/blog/app-reviews/game-plays-itself-review-guide-en.html, https://www.levelwinner.com/afk-arena-expert-guide-how-to-advance-through-stages-as-fast-as-possible/).
- **For us,** the existing focus/protect/retreat orders should be **big portrait buttons with a charging ring**, not small text buttons.

**Telegraph danger so the decision is real.** Slay the Spire's praised design rests on transparent enemy intents, which "stack some certainty" into each turn (https://pcgamer.com/best-design-2019-slay-the-spire). Show "Ogre winds up a HEAVY BLOW → Mira, 2 turns". Then *Protect* and *Retreat* become meaningful, and a death becomes the player's call instead of a coin flip.

**A commentator gives the replay a voice.** Darkest Dungeon's narrator murmurs approval on a crit, says something "fatalist and withering" when the party teeters, and gives a "bespoke eulogy" when a hero dies (https://gamegeeker.com/games/darkest-dungeon-262060/review?market=GB, https://pcgamer.com/whats-your-favorite-line-of-dialogue-in-a-game). Its stress system shows **resolve tests at 100 stress** as an Affliction or a Virtue. That is a mid-fight dramatic beat the player watches for (https://www.pcgamer.com/uk/how-darkest-dungeon-got-inspiration-from-band-of-brothers-and-aliens). Isel is the obvious narrator here.

**Mastery and shared drama.** TFT's three pillars are mastery, playful competition and discovery (https://teamfighttactics.leagueoflegends.com/en-gb/news/dev/dev-design-pillars-of-tft). Our climb needs *discovery*, through synergies and event floors, and *mastery*, through orders that clearly matter. Raw time-on-screen supplies neither.

---

## 4. "Numbers go up": incremental design

- **Pecorella, "The Math of Idle Games".** Costs grow exponentially while production grows linearly or polynomially. The canonical example is AdVenture Capitalist's Lemonade Stand: cost × **1.07** per purchase, base cost 4, base production 1.67/s. Exponential cost always eventually overtakes, which creates the walls that prestige and multiplier unlocks break through (https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i). Part III covers prestige as "a huge boost that gives a sense of power and progress" (https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii). The GDC Europe 2016 slides are at https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507.
- **Small, frequent milestones.** Incremental games lean on achievements as "small, frequent rewards" (https://en.wikipedia.org/wiki/Incremental_game). Cookie Clicker turns achievements into **milk colours**, and kitten upgrades scale production by achievement count. Collecting *is* power (https://en.wikipedia.org/wiki/Cookie_Clicker).
- **Melvor Idle.** Players report that mastery pools unlock bonuses at **10/25/50/95%** checkpoints: legible thresholds you can see coming (community, https://steamcommunity.com/app/1267910/discussions/0/3325366198389413054).
- **For us:**
  - **Gold count-up.** Gold should count up with coin particles flying into the counter. Today +300 at F1 against a 3,000-gold pull means about 10 floors per pull, so show a **"next pull" progress bar** that fills on every floor.
  - **Party power vs. floor budget.** Show it as one bar that visibly grows.
  - **Progressive menu.** Unlock the 24 menu destinations as milestones, one every 1-3 floors with a fanfare. Pecorella-style plateaus should be broken by an *unlock*, not by grinding.

---

## 5. Permadeath emotional hooks

- **XCOM.** Jake Solomon: death must be "as irrevocable as the real thing" to have meaning. Attachment comes from **customisation and nicknames** and from player stories like "the sniper who always makes the clutch shot" (https://gamebanshee.com/wh8r, https://gamebanshee.com/9kaq).
  - **Memorial.** Lists name, rank, nickname, mission and date. Enemy Within added a **"How They Died: Weapon (Alien)"** column (https://temp.ufopaedia.org/Memorial_(EU2012)).
  - **Plaques fill in.** Plaques start greyed out and fill with a picture as soldiers die, and the wall "gets larger and larger" (https://www.gamingnexus.com/FullNews/Memorial-app-lets-you-honor-your-fallen-XCOM-Enemy-Unknown-soldiers/Item28611.aspx).
- **Darkest Dungeon.** The Graveyard logs name, level, class and circumstances of death, with **headstone variants by importance**. A town event, *From Beyond*, brings three fallen heroes back into play (https://darkestdungeon.wiki.gg/wiki/Graveyard). The design principle is "Heroes are human".
- **Fire Emblem.** Intelligent Systems removed a revival option because permanent loss "creates a stronger bond" (https://cubed3.com/news/14357/1/iwata-talks-fire-emblem-perma-death.html). The team also argued over Casual mode, admitting permadeath scares players off (https://www.engadget.com/2013-04-03-intelligent-systems-divided-over-fire-emblem-awakenings-casual.html). That argues for an optional "Casual" toggle.
- **Nemesis (Shadow of Mordor / War).** Enemies remember and grow from encounters, aiming to "maximise players' positive and negative emotions" (https://gdconf.com/news/attend-gdc-2018-behind-scenes-look-shadow-wars-nemesis-system, https://gamesbeat.com/shadow-of-mordors-nemesis-system-draws-from-burnout-football-and-an-architecture-book/). Applied here: **the floor monster that killed your hero gets that hero's name in its title, and gets stronger.** Killing it later is a revenge beat with a bonus reward.
- **Legacy and inheritance.**
  - **Rogue Legacy.** Gold flows into a manor of permanent upgrades, and each heir has traits (https://strategywiki.org/wiki/Rogue_Legacy).
  - **Wildermyth.** Heroes can be promoted into a Legacy pool and recruited again (https://gamingonlinux.com/2020/06/papercraft-styled-tactical-rpg-wildermyth-adds-legacy-campaigns).
  - **Hades.** Kasavin designed death to "take the sting out of failure" by tying every death to story progress (https://inlander.com/culture/hades-writer-greg-kasavin-on-how-he-made-video-game-deaths-drive-a-feel-good-story-22725237).
  - **For us,** every permadeath should **pay something forward**: a memento item, a stat inheritance to a bonded hero, or a Memorial shard toward a guaranteed pull. That replaces the F13 death spiral with a "rebuild stronger" arc.

---

## Top 15 implementable techniques for a canvas-sprite + DOM + WebAudio web game

Ordered by impact on "not fun / no reason to return" per hour of work.

1. **Rig the first summon, then stage it.**
   - **Guarantee.** At least one 3★, plus at least one hero with a class and a skill, in the free tutorial 10-pull.
   - **Staging.** Before the reveal, glow in the colour of the pull's *highest* rarity (1★ grey-blue, 2★ purple, 3★ gold, 4-5★ rainbow), the WuWa/HSR grammar.
   - **Reveal.** Then flip cards **one at a time in ascending rarity** on tap: about 250 ms for 1★, 600 ms for 2★, 1.5 s for 3★, and 3 s for 5★ with a music change and confetti.
   - **Controls.** Skip-all appears after the first card.
   - Fixes finding 1.
2. **Upgrade tells only.** A 30% chance that a silver tell **upgrades** to gold mid-reveal when the pull contains a 3★+ (Uma Musume/Convallaria style). Never show a fake-out downgrade.
3. **Default the replay to 2x and compress the dull events.** Normal hits take 120-180 ms, while crits, kills, skills and deaths keep full time plus hitstop. Target 8-20 s per floor. Add TFT-style "overtime": after 20 s, ramp to 4x. On floors rated Safe, offer **"Sweep"**: resolve instantly into a 2 s highlight reel and the loot screen.
4. **Hitstop on every meaningful hit, scaled by damage.**
   - **Duration.** `hitstop = clamp(40 + 120·(dmg/targetMaxHP), 40, 200) ms`, with crits +80 ms and a kill at least 180 ms.
   - **Who moves.** Freeze the attacker. Shake the victim ±2 px at 30 Hz during the freeze (Smash).
   - **Ramps.** Use juicy-breakout-style ramps (40 ms in, 60 ms out) instead of a hard stop.
5. **A trauma-based screen shake that replaces ad-hoc shakes.**
   - **Trauma per event.** +0.15 hit, +0.35 crit, +0.5 kill or hero death. Clamp to 1.
   - **Motion.** Offset = 8 px × trauma² × smooth noise. Decay 1.5/s. No rotation on pixel art.
   - **Direction.** Add a directional 3-6 px **kick along the attack vector** (Nuclear Throne).
   - **Accessibility.** Respect `prefers-reduced-motion` and add a settings slider.
6. **Hit flash and squash on canvas.**
   - **Flash.** Draw the victim sprite once more with `globalCompositeOperation='source-atop'` filled white for 60 ms (2 frames at 30 fps), then red-tinted for 60 ms.
   - **Squash.** Scale the victim to (1.25, 0.8) and ease back over 180 ms with `easeOutBack`. Scale the attacker to (0.85, 1.15) on the lunge.
   - These are pure transforms, so the 2-frame sprites gain life with no new art.
7. **Anticipation, then the strike.** The attacker pulls back 3-4 px over 100 ms, then lunges 10-16 px in 60 ms. Big skills get a 400-600 ms wind-up with a charge glow and a name banner (12-24 frames, heuristic). The bigger the anticipation, the faster the strike can be.
8. **Damage-number pops.**
   - **Pop.** Scale 0 → 1.4 → 1.0 in 120 ms, rise 24 px over 700 ms with `easeOutCubic`, and fade over the last 200 ms. Use Pixelify Sans with a 1-px dark outline.
   - **Crits.** 1.5× size, gold, and a "!".
   - **Big-hit highlight.** Apply a Diablo-style colour once damage passes 25% of the target's max HP.
   - **Stacking.** Stack offsets so numbers never overlap.
9. **WebAudio hit stack with variation.**
   - **Layers.** Transient: a 15 ms noise burst through a highpass. Body: a 60-120 ms square or triangle with a pitch drop. Crit sub layer: a 55 Hz sine dropping to 35 Hz over 150 ms.
   - **Variation.** Per hit, set `detune` randomly in ±80 cents (about ±5%), rotate 3-4 variants, and never repeat the last one.
10. **Rising pitch on combos and streaks.** Step up the **pentatonic scale of the current BGM key** (Peggle) for consecutive hits by the same hero, or consecutive kills, inside a 1 s window, and reset after a gap (juicy breakout's 60-frame rule). Use the same idea for gold count-up ticks and summon-card flips.
11. **Big portrait order buttons with a charging ring** (AFK Arena). Each hero's portrait shows HP, a skill-energy ring and the order state. A tap gives 150 ms of hitstop, a portrait zoom and a voice blip. Keep tap response under 100 ms (Swink).
12. **Enemy intents telegraphed in battle and in scouting** (Slay the Spire). An icon and target line over the enemy shows "HEAVY in 2", so Protect and Retreat become real choices. The scouting report names the 1-2 specific threats instead of a bare rating. Pair this with retuning floors 1-12 so a few of them are "Risky" rather than all "Safe".
13. **Reward fanfare plus visible progress.** After a win, coins burst from the defeated enemies and fly on bezier curves into the gold counter, which counts up with rising-pitch ticks. A **"next summon" bar** fills on every floor. Every 3-5 floors, a milestone unlocks a new menu destination with a chest-style jingle (Vampire Survivors and Pecorella milestones). This also tames the 24-item menu.
14. **Make death matter: a memorial, a nemesis and a legacy.**
    - **Memorial.** Records "How they died: [skill] ([monster], F13)", with the headstone styled by rarity and level (XCOM EW, Darkest Dungeon).
    - **Nemesis.** The killer becomes "Mira's Bane": a named, buffed revenant on a later floor, and killing it gives a revenge reward (Nemesis system).
    - **Legacy.** Each death grants a memento or inheritance and Memorial shards toward a guaranteed pull, so the F13 wipe feeds a comeback (Rogue Legacy, Hades).
15. **Isel as live narrator, plus "permanence" on the battlefield.**
    - **Narrator.** One-line barks on a first crit, a near-wipe, a death and a clutch Protect, about 1 per 10 s at most (Darkest Dungeon).
    - **Permanence.** Leave fallen enemy husks, scorch marks and dropped coins on the field until the fight ends (Nijman).
    - **Idle life.** Give the 2-frame sprites procedural idle life: a 1.0 ↔ 1.03 y-scale breath on a 1.2 s period, a hop on victory, and heads that turn toward whoever was just hit (the paddle eyes in *Juice it or lose it*).
