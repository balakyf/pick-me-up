# Core loop, FTUE and pacing: research for the "not fun" diagnosis

Scope: the core loop, first-time user experience (FTUE), difficulty and pacing, goals, and agency in auto-battle for *Pick Me Up! Infinite Gacha* (recreation). Juice and retention have their own reports (`research-juice.md`, `research-retention.md`). This one covers them only where they affect the loop.

> Source note: in this sandbox, WebFetch could resolve only `developer.apple.com`. Every other citation was checked through search-result extracts of the linked page. Numbers that come from fan wikis are marked "(wiki)".

---

## 0. One-paragraph diagnosis

In MDA terms, the game has many **mechanics** but produces two bad **dynamics**:

1. Floors 1-12 have no decisions, because party power is 2-3x the floor budget.
2. After that comes a positive-feedback death spiral: a wipe leaves fewer heroes, which leads to more wipes.

The **aesthetic** the player actually gets is *watching*, not *challenge*, *discovery* or *fantasy*. Around that core sit 24 menu destinations, all built as content arcs. None of them is a repeatable loop the player learns to master. The first summon fails as a reward (eleven 1★ heroes). Absence is punished (Probability Interference decay, account deletion) rather than rewarded. Each finding below maps to a published technique.

---

## 1. Diagnosing "not fun"

**The 30 seconds of fun.** Jaime Griesemer says Halo's core encounter had to be nailed first: "if you don't nail that 30 seconds, you're not gonna have a great game." He also says the quote is usually misread. The full idea was to *vary* that 30 seconds across enemies, weapons, vehicles and terrain, not to repeat it unchanged ([Engadget interview](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html)).

- Here, the 30-second unit is one floor: press Enter, then watch 15-60 s of replay. Neither part contains a decision.
- The fun has to be rebuilt **at the floor level** before any meta system can matter.

**Fun is learning; mastered or trivial patterns are boring.** In his 2003 keynote, Raph Koster says that once we grasp a pattern we "iconify it" and get bored. Games also go dull when they are "too trivial" ([keynote PDF](https://www.raphkoster.com/wp-content/uploads/2026/07/Austin-Game-Conference-2003-Keynote-Theory-of-Fun.pdf), [Shortform summary](https://www.shortform.com/summary/a-theory-of-fun-for-game-design-summary-raph-koster)). Twelve floors rated "Safe" are trivial by definition.

**Loops vs arcs.** Daniel Cook separates **loops** from **arcs**:
- A loop is repeated and builds skill: expectation, action, system response, updated mental model.
- An arc is content that is consumed once and does not repeat.

([Lost Garden, "Loops and Arcs"](https://lostgarden.com/2012/04/30/loops-and-arcs)). The game's 24 buildings are mostly arcs or upkeep chores bolted onto a loop that has no learning in it. Healthy designs are a "loop-arc sandwich": a stable core loop with arcs that pace it ([Mechanics of Magic](https://mechanicsofmagic.com/?p=55553)).

**MDA.** Designers build Mechanics, which produce Dynamics, which the player feels as Aesthetics. Players experience the chain in reverse, starting from the aesthetics ([Hunicke, LeBlanc, Zubek 2004](https://users.cs.northwestern.edu/~hunicke/MDA.pdf)).
- Pick the target aesthetics first. Reasonable picks here: *Challenge* (tower), *Fantasy* (the hero cast), *Discovery* (the pulls).
- Then cut or defer any mechanic that does not feed them.
- Permadeath plus attrition is a textbook **positive feedback loop**: success breeds success and loss breeds loss. The standard counter is a negative or catch-up loop, the "rubber-band" ([Chemeketa reader: feedback loops](https://computerscience.chemeketa.edu/cis125greader/MechanicsDynamics/FeedbackLoops.html), [Systems & Us](https://systemsandus.com/2015/01/04/the-feedback-loops-in-games-what-makes-monopoly-world-of-warcraft-and-mario-kart-so-much-fun/)).

**A game is a series of interesting decisions.** Sid Meier's GDC 2012 talk revisits his 1989 line and covers how to make decisions more interesting ([Game Developer video](https://gamedeveloper.com/design/video-sid-meier-explores-interesting-decisions-in-gameplay), [reader notes](https://computerscience.chemeketa.edu/cis125greader/Choice/BossBattle.html)). A useful metric is **meaningful decisions per floor**. Right now it is about 0 on F1-12.

**Find the fun before building features.** Mark Cerny's Method front-loads risk into preproduction. Its goal is a prototype that proves the core is fun before production scales it up ([Mobile Free to Play, "Why Games Fail: Pre-Production"](https://mobilefreetoplay.com/?p=557), [Cerny Method slides](https://www.slideshare.net/slideshow/the-cerny-method/71184108)). A 37k-line game with 24 systems and an unfun floor loop is a feature-creep outcome. The fix is to subtract and gate, not to add a 25th system.

---

## 2. FTUE and onboarding

**Time to first fun.**
- Apple's onboarding guide:
  - Start onboarding at launch.
  - **Teach the core loop first.** Its example is "fighting monsters, earning gold, and buying equipment."
  - Teach one step at a time.
  - Let players play unguided early.
  - **Defer daily challenges, tournaments and leaderboards until after onboarding** ([Apple Developer: Onboarding for Games](https://developer.apple.com/app-store/onboarding-for-games/)).
- Industry guidance: reach core gameplay within about 60 s. If the "this is fun" moment takes more than about 90 s, many users never start a second session (vendor claim, directional only) ([Playio](https://blog.playio.co/mobile-game-onboarding-retention); [PocketGamer.biz FTUE](https://www.pocketgamer.biz/first-impressions-count-creating-the-ultimate-first-time-user-experience)).

**Progressive disclosure, with real gating examples.**
- *Clash Royale*:
  - Onboarding is five short tutorials, each adding one mechanic ([Apple](https://developer.apple.com/app-store/onboarding-for-games/)).
  - Clans and the shop are locked behind arena levels, so "there is always something new" to aim for ([Game Developer breakdown](https://gamedeveloper.com/design/breaking-down-supercell-s-next-hit-clash-royale)).
- *AFK Arena*: the Ranhorn hub opens at the end of the tutorial. After that, King's Tower opens at stage 2-12, the Library at 2-16, the Guild at 2-20 and the Twisted Realm at 12-40 (wiki, [AFK Arena wiki](https://afk-arena.fandom.com/wiki/File:Spring_Esperia.png), [guide](https://theriagames.com/?p=63795)).
- *Genshin Impact*: Commissions open at AR12, Co-op at AR16, Spiral Abyss at AR20 and housing at AR28 ([Prima](https://primagames.com/gaming/genshin-impact-adventure-ranks-adventurers-guild-and-handbook-guide), [TYN](https://tynmagazine.com/genshin-impact-what-is-adventure-rank/)).
- Unity's FTUE guide: "Unlocking new features should also be a gradual process. Prioritize engagement with the core loop before inviting players to explore other areas," and use breadcrumbs ([Unity: 10 FTUE tips](https://unity.com/how-to/10-first-time-user-experience-tips-games)).
- Tying unlocks to progression milestones builds anticipation and makes sure the current mechanics are understood first ([Udonis](https://blog.udonis.co/mobile-marketing/mobile-games/progression-systems)).

→ **24 destinations at minute one is the opposite of every reference above.**

**Cognitive load (Celia Hodent).**
- Memory is fallible and attention is limited. Players "can hardly pay attention to tutorial text while busy with combat" ([Hodent, Interaction 19 slides](https://interaction19.ixda.org/download/talk-the-ux-of-fortnite-celia-hodent.pdf)).
- People learn best **by doing, in a context that makes sense** ([GDC: "UX of Onboarding and Player Engagement"](https://gamedeveloper.com/design/video-inside-the-ux-of-onboarding-and-player-engagement)).
- Working memory holds about 4 chunks ([Wbcom summary of CLT](https://wbcomdesigns.com/cognitive-load-theory-onboarding/)).

So: introduce each building at the moment it becomes useful, with one sentence and one forced action. Example: unlock the Infirmary the first time a hero is wounded.

**Guaranteed early wins: beginner banners are an industry standard.**

| Game | Beginner banner |
|---|---|
| *Genshin Impact* | 20 discounted wishes (8 fates per 10). Guaranteed 4★ Noelle in the first 10, plus another 4★+ ([Genshin wiki](https://genshin-impact.fandom.com/wiki/Wish)). |
| *Honkai: Star Rail* | Departure Warp: 50 pulls, 20% off. **Guaranteed 5★ within 50**, and 4★+ in every 10 ([PCGamesN](https://www.pcgamesn.com/honkai-star-rail/warps)). |
| *Arknights* | New-player banner: 21 pulls with a guaranteed 6★ and 5★ ([BlueStacks guide](https://www.bluestacks.com/blog/game-guides/arknights/ak-tips-tricks-en.html)). |
| *Arknights: Endfield* | 5★ every 10 pulls, 6★ by pull 40 ([Mobalytics](https://mobalytics.gg/arknights-endfield/profile/mattjestic-multigaming/guides/gatcha-rates)). |

A first 10-pull of eleven classless 1★ heroes with "No skills yet" breaks the strongest convention in the genre.

**Order and ending matter (peak-end).** Gutwin et al. (CHI 2016) reordered difficulty in otherwise identical games. The reordering changed players' retrospective judgments, and willingness to replay tracked that memory ([CHI paper](https://www.cs.mcgill.ca/~jeromew/data/COMP766/CHI2016/p5608-gutwin.pdf)). For the summon:
- Reveal cards one at a time, in ascending rarity.
- Put the best card last.
- Never show all 10 at once.

---

## 3. Flow and pacing

**Flow channel.** Jenova Chen's thesis keeps players between anxiety and boredom. His key move is *active* dynamic difficulty adjustment (DDA): the game lets the player pick their own challenge. In *flOw*, players dive between planes at will and choose what to eat ([Wikipedia: flOw](https://en.wikipedia.org/wiki/Flow_(video_game)), [USC](https://games.usc.edu/?p=1120)). For this game, that means **player-chosen risk** on each floor (safe lane vs elite lane) rather than a single fixed curve.

**Sawtooth, not ramp.**
- "After a player reaches a new level of competence, they should be allowed some time to enjoy that feeling of power... you may even consider having the difficulty dip down" ([Game Developer: Fractal Curves](https://www.gamedeveloper.com/design/doing-difficulty-right-fractal-curves)).
- A monotonic ramp exhausts players, and stacking novelty on top of a peak produces spikes ([Bugnet](https://bugnet.io/blog/difficulty-curves-how-to-get-them-right)).
- *Where's My Water?* eases off at the start of each new level set ([Revert to Saved](https://reverttosaved.com/2012/08/02/bashing-your-head-against-the-difficulty-wall/)).
- Shape for this game: build-up floors, then a boss, then a rest or reward floor, then a slightly lower restart.

**Pacing directors.** Left 4 Dead's AI Director tracks each player's stress. It builds pressure, peaks, then backs off to give respite ([modl.ai](https://modl.ai/?p=1984); [Shacknews/Evolve](https://shacknews.com/article/82787/how-evolve-assures-action-peaks-and-valleys)). The floor budget generator should do the same: read party power and HP, then target a *band*, not a fixed number.

**Cliffs come from granularity.** Subset Games: "a single additional enemy turns a battle from 'a fun challenge' to 'completely impossible'" ([Game Developer, Road to the IGF: Into the Breach](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)). The F13/F15 wipe is exactly this. The budget jumps across a threshold, and the scouting rating does not warn that the floor is lethal.

**Mercy and catch-up mechanics in permadeath games.**
- *XCOM: Enemy Within* has a bad-streak breaker. On Easy "it's very hard to actually lose soldiers, and **the fewer soldiers you have the stronger this effect becomes**" ([GameBanshee](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html)).
- *XCOM 2* adds hidden aim assist by difficulty tier ([UFOpaedia](https://ufopaedia.org/Difficulty_(XCOM2))).
- *Hades* God Mode starts at 20% damage resistance and adds 2% per death, capped at 80%. It exists to "reduce the sting of failure" ([Can I Play That](https://caniplaythat.com/2021/08/11/hades-god-mode-explained-by-supergiant-games)).
- *Fire Emblem: Three Houses* pairs Classic permadeath with **Divine Pulse**, a limited number of turn rewinds per battle ([RPG Site](https://rpgsite.net/feature/8771-fire-emblem-three-houses-difficulty-advice-casual-or-classic-and-normal-or-hard), [Kotaku](https://kotaku.com/fire-emblem-three-houses-is-definitely-going-to-make-m-1835465770)).

→ Keep permadeath, but make it **rare, telegraphed, and harder to trigger when the roster is small**.

**Difficulty must exist for systems to engage.** Jake Solomon raised *XCOM 2*'s difficulty late in development because, without pressure, "many design systems didn't engage" ([GameBanshee](https://gamebanshee.com/kx4fy)). Floors 1-12 make Party, Orders, Scouting, Training and Forge irrelevant.

**Reward cadence and the goal gradient.**
- Kivetz et al. (2006): café customers bought about 20% more often as they neared the free coffee.
- A 12-stamp card with **2 stamps pre-filled** was completed faster than a 10-stamp card, even though both needed 10 purchases. Perceived progress drives acceleration ([Columbia paper](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf), [summary](https://business.columbia.edu/insights/chazen-global-insights/goal-gradient-hypothesis-resurrected-purchase-acceleration)).
- Faster acceleration toward the *first* reward also predicted faster re-engagement.
- Apply: show visible bars toward the next pull, the next boss and the next unlock, and seed them with a head start.

---

## 4. Goals and direction

**A goal stack, always visible.**
- **Short:** this floor's reward. Hades puts a reward icon on every door, so "you always choose your reward before you fight for it" ([Prima](https://primagames.com/tips/hades-door-symbols-guide-boons-artifacts)).
- **Medium:** next boss in N floors, next pull at X/3,000 gold, next building unlocks at F-n.
- **Long:** F100, the codex, story chapters.

**Next-unlock teasers.** Clash Royale's arena ladder always shows what is coming next ([Game Developer](https://gamedeveloper.com/design/breaking-down-supercell-s-next-hit-clash-royale)). Show locked buildings as silhouettes labelled "Unlocks at Floor 5".

**Notification badges.** Use a dot for "something new" and reserve it for actionable items. Overused badges lose meaning and cause apathy ([SetProduct](https://www.setproduct.com/blog/notifications-ui-design)).

**Self-organized dailies.** AFK Arena's daily quests award 10-20 points per core-loop action, with chest thresholds. Players choose which tasks to do, which eases repetition ([Game Developer: Flexible session design in AFK Arena](https://gamedeveloper.com/design/flexible-time-session-design-in-afk-arena)). Every daily should feed the tower loop.

**Return pull (loop-relevant only).**
- Absence in AFK Arena *accumulates* loot ([Common Sense Media](https://www.commonsensemedia.org/app-reviews/afk-arena)). Here it *decays* PI and threatens deletion.
- Apple recommends daily rewards that "reinforce core objectives" and tell the player to come back tomorrow (Toon Blast) ([Apple](https://developer.apple.com/app-store/onboarding-for-games/)).
- Welcome-back events trigger after about 2 weeks away (Pokémon UNITE, Honkai: Star Rail) ([GameRefinery](https://www.gamerefinery.com/four-ways-how-mobile-games-re-engage-lapsed-players/), [esports.gg](https://esports.gg/news/honkai-star-rail/honkai-star-rail-returner-event-july-2023)).
- End sessions while desire is still rising ([CHI 2016](https://dx.doi.org/10.1145/2858036.2858419)). Leave an open goal as the hook, such as a teased boss or a half-filled bar. That this brings players back is a hypothesis, not a measured result.

---

## 5. Agency in auto-battle

**Decisions, not execution.** TFT's lead designer: "tough choices, not touch execution." Riot capped units on the field and added merges so that choices dominate ([Pocket Tactics](https://www.pockettactics.com/teamfight-tactics-design)). Riot's postmortem: the Armory item choice gave "a ton of agency," at some cost to game-to-game variety, and they kept it ([Riot dev blog](https://www.riotgames.com/en/news/dev-teamfight-tactics-reckoning-learnings)). In an auto-battler, **all agency lives between fights**: draft, formation, route and orders.

**Telegraph intent so the outcome feels caused.** In *Into the Breach*, every enemy attack is shown in advance, so "the game starts to feel like a puzzle" ([Game Developer](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-), [RPG Codex](https://rpgcodex.net/content.php?id=10843)). For a scouting report:
- Show *specific* enemy intents, for example "Ogre opens with Cleave on the front row (≈ 180)."
- Let the player respond with formation and orders **before** the replay starts.
- During the replay, add a callout when the response pays off, for example "Protect: Kael absorbed Cleave."

**Push-your-luck retreat.** *Loop Hero*'s hero auto-fights. The player decides when to leave:
- Retreat at camp keeps **100%** of resources.
- Retreat mid-loop keeps **60%**.
- Death keeps **30%**.

([Gfinity](https://www.gfinityesports.com/article/loop-hero-death-what-happens-when-you-die), [Lenovo](https://gaming.lenovo.com/news/post/some-people-are-obsessed-with-loop-hero-and-i-sort-of-get-why-hk1Q56zec8qxvAe)). Here, the choice after each floor would be "bank and return" or "press on", with gold banked partly on a wipe.

**Visible risk/reward choices.**
- In Hades, a skull icon on a door means a harder room with better rewards ([Prima](https://primagames.com/tips/hades-door-symbols-guide-boons-artifacts)).
- In *Slay the Spire*, elites trade HP for relics: "some relics are worth 30 HP" ([Metabot](https://metabot.gg/en/slay-the-spire-2/guides/when-to-fight-elites)).
- *FTL*: each jump lets the rebels advance, and a beacon they have taken gives little reward ([Wikipedia](https://en.wikipedia.org/wiki/FTL:_Faster_Than_Light)).

**Automate what is solved.** Arknights' Auto Deploy unlocks once a stage is cleared with 3 stars, then replays the recorded run ([Arknights wiki](https://arknights.wiki.gg/wiki/Auto_Deploy)). Equivalent here: a "Safe" floor resolves as a 2-second summary card, and the full replay is reserved for floors with real stakes.

---

## 6. Roguelike run structure

**Branching map.** *Slay the Spire* (wiki):
- 17 floors per act, up to 6 nodes per row.
- 7 node types: monster, elite, rest, unknown, treasure, merchant, boss.
- No elites or rests on the earliest floors.
- Elite, merchant and rest nodes cannot be adjacent.
- A treasure floor sits mid-act and a rest site sits before the boss ([StS wiki: Map Generation](https://slaythespire.wiki.gg/wiki/Map_Generation), [KosGames](https://kosgames.com/slay-the-spire-map-generation-guide-26769/), [STS2 guide](https://sts2.untapped.gg/guides/how-to-make-the-best-map-choices-in-slay-the-spire-2)).

**Boons and relics that change play.**
- Kasavin: roguelike difficulty "is more a means to an end"; the point is that each run is different. He credits *Slay the Spire*'s choice-driven variety ([Tom's Guide](https://www.tomsguide.com/uk/features/hades-exclusive-interview-supergiant)).
- In *Hades*, each boon door belongs to one god with a distinct emblem. Clearing it offers one of several boons ([Prima](https://primagames.com/tips/hades-door-symbols-guide-boons-artifacts)).
- In *Slay the Spire*, uncommon relics come mostly from elites and rare relics from bosses ([KeenGamer](https://www.keengamer.com/articles/guides/slay-the-spire-2-relics-tier-list/)).
- Apply: offer "pick 1 of 3" run blessings after elites and bosses, keyed to classes and orders so they create synergy. Example: "Protect also reflects 20%."

**Death as progress.** In *Hades*, dying advances the story, and Kasavin wanted the post-death beat to be "almost something to look forward to" ([Inlander](https://inlander.com/culture/hades-writer-greg-kasavin-on-how-he-made-video-game-deaths-drive-a-feel-good-story-22725237), [Critical Video Game Studies](https://criticalvideogamestudies.com/what-roguelikes-roguelites-teach-us-about-failure/)). The game already has a Memorial, death cards and last words. Make a death *produce* something too: a keepsake, a story beat from Isel, or a permanent small bonus.

---

## (a) Diagnostic checklist (apply to the build)

1. **Decisions per floor.** Does the player make at least 1 meaningful choice per floor (route, formation, order, retreat)? Currently 0 on F1-12.
2. **First-fun time.** Is the first moment of agency or delight under 60 s from launch? Is the first battle win under 3 min?
3. **First pull.** Does the tutorial pull *always* include at least one 4★+ hero with a class and a skill? Are the cards revealed one at a time, best last?
4. **Visible surface.** Are 6 or fewer destinations visible in the first session, with each later unlock tied to a milestone and announced with fanfare?
5. **Threat honesty.** Over 1,000 seeds, does any floor rated "Safe" or "Fair" ever kill a hero? The target is 0%.
6. **Win-rate band.** Do normal floors win at about 85-95%, elites at about 60-75%, and bosses on first try at about 50-70%, all with deaths rare?
7. **Cliff test.** Is the floor-to-floor budget jump capped (for example ≤12%)? Does no single floor move the threat rating up two steps?
8. **Spiral test.** After losing 2 of 5 heroes, can the median player recover within 3 floors?
9. **Mercy scaling.** Does protection get *stronger* as the roster shrinks (the XCOM rule)?
10. **Replay length.** Is the median normal-floor replay ≤15 s at the default speed? Do "Safe" floors auto-resolve?
11. **Goal stack.** Are a short, a medium and a long goal on screen at all times, each with a progress bar?
12. **Causality.** Does at least 1 callout per battle tie an outcome to a player choice?
13. **Return.** Does time away *give* something (letter, gifts, accumulated loot) rather than only take something away?
14. **Session end.** When the player quits, is something visibly half-done and teased for next time?
15. **Feature audit.** Does each of the 24 buildings feed the tower loop? If not, cut it or defer it past F20.

## (b) Top 12 changes, prioritized by impact

1. **Rig the first summon** (Genshin, HSR, Arknights). Make the tutorial 10-pull guarantee:
   - one 5★ (or a choice of 3 featured 5★);
   - two 3-4★;
   - every hero with a class, a skill and a non-F grade.

   Reveal one card at a time in ascending rarity, with a long build-up on the last card. Add a beginner banner: 20 Advanced pulls at 20% off with a 5★ guaranteed by pull 20.
2. **Collapse the Menu to 5 hubs at start**: Tower, Summon, Party, Lobby, and a Letter/Quests hub. Unlock the other 19 by floor milestones (F3, F5, F8, F10, F15, F20…) or on first need. Show each with a full-screen "New facility" card plus a one-action tutorial. Show locked items as "Unlocks at F-n" teasers (Clash Royale, AFK Arena, Unity, Hodent).
3. **Re-tune floors as a sawtooth with a director**:
   - Budget is a function of current party power, within a band of about 0.75-0.9x on normal floors (the party is stronger), about 1.0x on elites and about 1.05x on bosses.
   - Boss every 5 floors, followed by a rest or reward floor.
   - Cap floor-to-floor jumps.
   - Remove "Safe" ratings after F2.

   (Fractal curves, L4D Director, *Into the Breach*.)
4. **Break the death spiral** (XCOM EW, Hades God Mode, FE Divine Pulse):
   - On normal floors a lethal blow sets a hero to "Critically wounded" (Infirmary, out N floors). Permadeath happens only on elite or boss floors, or floors rated Deadly, that the player chose to enter.
   - With ≤3 heroes alive, apply a scaling "Last Stand" buff.
   - Give 1 "Isel's Rewind" per run to replay a lost floor.
   - Offer a free 3★ recruit when the roster is below 5.
5. **Branching floor map per 10-floor act.** Use 2-3 lanes, with node types Battle / Elite (skull) / Event / Rest / Shop / Treasure / Boss and a reward icon on each node (StS, Hades doors). This is the main new decision per floor.
6. **Pre-battle "intent" step.** Scouting shows specific enemy opening moves and targets (*Into the Breach*). The player adjusts formation and pre-sets orders, then watches. Keep in-battle orders, but make the pre-battle choice the main decision.
7. **Make outcomes feel caused.** Add replay callouts that tie results to choices, e.g. "Protect order: Kael blocked 3 hits", "Focus on the Shaman: it died before casting." End-of-floor MVP and decision recap (TFT's agency principle).
8. **Run blessings (pick 1 of 3).** Offer one after each elite, boss and some events. Key them to classes, orders and synergies, and clear them on run end or retreat (Hades boons, StS relics).
9. **Cut dead time.** Default to 2x speed. Auto-resolve floors the party clearly outclasses into a 2-3 s summary card, and play full replays only for elites, bosses and close fights. Target a 10-20 s median replay (Arknights Auto Deploy, Griesemer).
10. **Persistent goal-stack HUD.** Show:
    - next pull (gold bar, seeded with a head start);
    - next boss in N floors;
    - next unlock;
    - 3 AFK Arena-style daily point quests that all feed the tower (Kivetz goal-gradient, Clash Royale).
11. **Push-your-luck banking.** After each floor, the player chooses "Return to campus" (keep 100% of floor loot plus a streak bonus) or "Press on". On a wipe or forced retreat, keep 50-60% (Loop Hero). This turns the climb into repeated risk decisions instead of autopilot.
12. **Make absence and death give something.**
    - Replace Probability Interference decay and the deletion threat (keep it as flavour, never enforce) with accumulation: idle loot capped at 12-24 h, Isel's letter carrying gifts plus a teaser of the next boss or event, and a welcome-back pack after ≥3 days.
    - A fallen hero leaves a keepsake or Memorial bonus and a story beat (Hades death-as-progress, AFK Arena idle loot, Apple daily rewards).
