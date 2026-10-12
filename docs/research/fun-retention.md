# Ethical reasons to return: research for *Pick Me Up! Infinite Gacha*

**Scope:** session-ending hooks, welcome-back moments, kind appointment mechanics versus dark patterns, failure that feeds forward, character attachment, and web-only tactics for a single-player game with no server and a localStorage save. It ends with a verdict on the canon decay-and-delete rule and a ranked Top 15.

**How the sources were checked:** WebFetch could not reach any page. The sandbox's egress proxy returned `ENOTFOUND` or 403 for every domain, including gdconf.com, duolingo.com, webkit.org and chalmers.se. Every claim below comes from WebSearch result extracts of the URL cited inline. Where only a secondary source was available, the text says so.

---

## 0. Diagnosis: why nothing brings the owner back

The owner said: *"when I quit nothing makes me wanna play it again."* Five problems in the current build explain that, read against the research below:

1. **No open loop at the moment of quitting.** A session ends after an auto-battle replay and a gold number. Nothing is left unfinished, and nothing is waiting to be seen next time.
2. **Failure takes away and gives nothing back.** One floor wipes 2–5 heroes permanently, and the run slides into a death spiral. Every roguelike cited below that people return to turns death into story, unlocks or heirs.
3. **The best material is hidden.** The engine already simulates needs, jobs, relationships and memories (`stepLife` in `src/engine/time/time.ts`), yet the player is not told about any of it on return.
4. **The return systems are mostly about loss.** PI fades while the player is away. A greyed account is deleted after 540 world-days (`TUNING.lifecycle.deleteMs`). Offline invasions roll at 30% per world-day, take 10% of the storeroom on a defeat, and synthesize a captured hero after 3 world-days, which is about 1 real day at 3× dilation (`TUNING.pvp.*`). A lapsed player comes back to a list of losses.
5. **The first peak is flat.** A tutorial 10-pull of eleven 1★ heroes with F grades gives the first session a low peak. The peak-end rule (below) says that low point becomes the memory of the game.

---

## 1. Session-ending hooks: what the game should show when the player quits

**Open loops (Zeigarnik).** People remember interrupted tasks better than finished ones. The original 1920s studies reported recall of unfinished tasks at about twice that of finished ones ([Wikipedia: Zeigarnik effect](https://en.wikipedia.org/wiki/Zeigarnik_effect)). Product write-ups apply this by showing *where the user left off and how close they are to done* ([UX Planet](https://uxplanet.org/the-zeigarnik-effect-in-digital-products-5bb153563f0d)). The replication record is mixed, so treat this as a heuristic. Too much tension turns into annoyance.

**Stop while you know what happens next.** Hemingway's rule was to stop "when you are going good and when you know what will happen next" ([Farnam Street](https://fs.blog/ernest-hemingway-three-tips-on-how-to-write-fiction/)). For a game, that means ending the session with the *next* thing already visible. Here, that is the next floor's scouting report.

**Peak-end.** People judge an experience mostly by its most intense moment and its last moment, and largely ignore how long it lasted. A CHI 2016 study changed the order of difficulty in otherwise identical casual games and measured how players judged them afterwards ([CHI '16, doi:10.1145/2858036.2858419](https://dx.doi.org/10.1145/2858036.2858419)). The last screen of a session therefore matters more than its length.

**Something brewing.** Animal Crossing syncs to the real clock and date, and the developers turned off cloud saves "to avoid manipulating time," which they call a founding concept of the series ([Nintendo Everything](https://nintendoeverything.com/tag/higashi-nogami/)). Adam Telfer's *Player Commitment* essay supplies the ethical rule: the player should **choose** the timer, for example planting a crop that takes 5 minutes or one that takes 4 hours, because an opt-in timer is a commitment while a forced one "just becomes an annoyance." He also argues that energy systems end sessions without creating any commitment ([mobilefreetoplay: Player Commitment](https://mobilefreetoplay.com/mobile-free-to-play-player-commitment/), [Flexible Sessions](https://mobilefreetoplay.com/mobile-session-design-flexible-sessions-2/)).

**"One more run."** Vampire Survivors' 30-minute target means most failed runs feel close to success, and gold buys permanent upgrades, so "no run ever feels wasted" ([The Conversation](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613)). The same article ties this to slot-machine near-misses. Borrow the *carry-forward*, not manufactured near-misses.

**A kind exit.** Nintendo's break prompts moved from Wii Sports' blunt tone to Super Mario 3D Land's "don't forget to take a break before you feel tired" ([Kill Screen](https://www.killscreen.com/should-more-games-tell-us-stop-playing-and-do-something-else/)). Nintendo recommends a 10–15 minute break every hour ([Nintendo support](https://en-americas-support.nintendo.com/app/answers/detail/a_id/28689/~/health-%26-safety-precautions%3A-nintendo-switch)). A game that says "good place to stop" earns trust, and players return to games they trust.

**What to build: a "Lights Out" card.** Show it when the player returns to the lobby after a floor, presses a "Rest for now" button, or after 45–60 minutes of play.
- **Next floor teaser:** the real scouting report for F(n+1): name, threat rating, and one specific hook such as "a Bone Choir: Mira's last words mentioned them". The engine is deterministic, so this can be computed now.
- **Brewing (max 3):** timers the player chose, each with a completion time: "Kitchen stew ready in 4h", "Promotion completes in 8h", "Training drill done at 21:40".
- **One relationship on the edge:** "Aldo and Sene are one shared meal from becoming friends."
- **Goal gradient:** "Collection 23/40, 2 floors to the F15 milestone chest."
- **A warm sign-off** from Isel or a hero. Never "don't leave!", never "your heroes will suffer".

---

## 2. Welcome-back moments: reward the return, never guilt it

**Offline summaries in idle games.** Clicker Heroes records damage-per-second at exit and simulates gold earned while the player was away ([Clicker Heroes blog](https://blog.clickerheroes.com/offline-progression-in-clicker-heroes/embed/)). Melvor Idle simulates up to 24 hours offline "with perfect accuracy" ([Steam discussion](https://steamcommunity.com/app/1267910/discussions/0/591762563949134719)). A Game Developer analysis says AFK Arena's idle chest stops filling at 12 hours, which nudges players toward two sessions a day, and that the chest's visuals make each session start with a collection ([Game Developer](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena)). The 12-hour figure comes from a secondary search extract. **Dark-pattern note:** idle monetization guides call the return screen a "top-converting" ad spot, offering 2×, 3× or 8× for watching ads. They describe caps as creating "the feeling of lost opportunity" ([CrazyGames docs](https://docs.crazygames.com/resources/monetizing-clicker/)). Use the cap only to bound the simulation. Don't frame it as loss, and don't gate the payout.

**Gifts left behind.** In Neko Atsume, cats visit while the app is closed and leave fish and collectible mementos ([Wikipedia](https://en.wikipedia.org/wiki/Neko_Atsume)). The developer intended a "look and enjoy" game ([Know Your Meme](https://knowyourmeme.com/memes/subcultures/neko-atsume)). The return is a small surprise, not a debt.

**Characters noticing the absence: the soft version and the punitive version.** Animal Crossing villagers know how long the player has been away, mention it, then return to their usual topics ([AV Club](https://www.avclub.com/animal-crossing-abandonment)). Weeds grow, and cockroaches appear in a house left unentered for about a week or more, more of them the longer the absence ([Nookipedia](https://nookipedia.com/wiki/Roach)). Players remember the villagers' remarks fondly ([MetaFilter: "But you're back to stay, right?"](https://metafilter.com/185548/But-youre-back-to-stay-right-At-least-for-one-more-day)). The weeds and roaches are cleanable cosmetic penalties, not permanent loss. That is about the furthest a game can push before the return turns into guilt.

**The best precedent for reframing: WoW's rested XP.** In beta, rested players earned 100% XP and tired players 50%. Players hated it. At launch Blizzard relabelled the same numbers as 200% (rested) and 100% (normal). The developers called it the "same numbers seen from the opposite point of view," and players' perception changed significantly ([warcraft.wiki.gg: Rested](https://warcraft.wiki.gg/wiki/Rested), [discussion](https://www.greaterwrong.com/posts/ujTE9FLWveYz9WTxZ/what-cost-for-irrationality/comment/5ReTMXFrLJZAHxz73)). This is the template for fixing PI (§7).

**What to build: a "While you were away" ledger.**
- Show at most **five** vignettes, sorted by emotional weight, drawn from what `stepLife` actually simulated: "Kael cooked for everyone (Sene's mood +)", "Mira and Aldo argued over the last bun", "The stew is ready", "Isel left you a letter".
- Each vignette is tappable and opens the hero in the lobby.
- Gifts sit on the Tavern table to collect, Neko Atsume style, with one tap and no gate.
- **Bound the accrual without framing it as loss:** full simulation value for 24h, tapering to a 72h ceiling. Present the result as "the heroes kept busy", never "you missed X".

---

## 3. Kind appointments versus dark patterns

**The canonical warning.** Zagal, Björk and Lewis (FDG 2013) list *playing by appointment* among their **temporal** dark patterns, along with grinding: the game decides when you must play, for example daily quests that require daily returns ([Chalmers research](https://research.chalmers.se/en/publication/177148), [deceptive.design summary](https://www.deceptive.design/articles/dark-patterns-in-the-design-of-games)). A DiGRA 2020 critique notes that the paper doesn't name its ethical framework ([White Rose eprint](https://eprints.whiterose.ac.uk/156460/1/DiGRA_2020_paper_189.pdf)). A workable test: **does the player lose something they already had if they skip it?**

**Self-Determination Theory.** Ryan, Rigby and Przybylski (2006) found that satisfying the needs for **autonomy, competence and relatedness** independently predicts enjoyment *and future play*. That work produced the PENS measure ([CSDT: PENS](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/), [ACU research bank](https://acuresearchbank.acu.edu.au/item/8q128/the-motivational-pull-of-video-games-a-self-determination-theory-approach)). The ethical takeaway is that the motive for returning should be intrinsic. Obligation undermines autonomy.

**Celia Hodent**, former Fortnite UX lead, argues the industry should move away from engagement built on fear of missing out ([Game Developer](https://gamedeveloper.com/design/former-i-fortnite-i-ux-lead-digs-into-ethical-game-design), [GDC Vault](https://gdcvault.com/play/1026774/Addressing-Ethics-Content-Responsibility-as)). In a 30-day simulation study (a student thesis), dark patterns lifted short-term retention and revenue but reduced long-term satisfaction and trust ([TU/e](https://research.tue.nl/en/publications/behavioural-design-in-video-games-ethical-legal-and-health-impact/)). Jamie Madigan's work on loss aversion explains *why* loss framing works and why it is tempting to misuse ([Game Developer](https://www.gamedeveloper.com/game-platforms/analysis-zombies-barbarians-and-loss-aversion)).

**Quantic Foundry's** 12-motivation model includes *Completion* under Achievement and *Fantasy* and *Story* under Immersion ([Quantic Foundry](https://quanticfoundry.com/2015/07/20/how-we-developed-the-gamer-motivation-profile-v2/)). A gacha game with a living lobby can serve Completion (the collection book) and Story (hero lives) without any timers at all.

**Daily seeds done well.** Wordle's "breakthrough" was one puzzle a day, which created scarcity that left people wanting more. Wardle said it is "not trying to do anything shady with your data or your eyeballs" ([Boston.com/NYT](https://www.boston.com/news/national-news/2022/01/04/he-made-wordle-for-his-partner-now-its-an-online-hit/)). Spelunky's Daily Challenge gives one attempt per day ([Spelunky wiki](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD))). A critic argues the single attempt rewards reckless risk-taking ([The Ludite](https://theludite.com/2014/06/23/spelunky-when-scoring-goes-bad/)). Slay the Spire's Daily Climb gives everyone the same seed with 3 random modifiers ([Into the Spine](https://intothespine.com/2018/03/05/slay-the-spire-daily-climb/)), and a day missed costs nothing. **For this game:** the engine is pure and deterministic, so `seed = hash(YYYY-MM-DD)` gives a **Daily Floor** that is identical for everyone with the same build. Allow **one scored attempt plus unlimited practice**, which addresses The Ludite's critique, and let the player share a Wordle-style result grid of emoji per turn. There is no streak to lose.

**Streaks with forgiveness.** Duolingo found that letting learners equip **two** Streak Freezes instead of one *raised* daily active learners by +0.38% rather than encouraging days off ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). A Streak Wager raised D7 retention by +14% ([Duolingo Making](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)). In June 2026 Duolingo ran a free event restoring lost streaks of 30+ days, acknowledging that "losing a streak is a common reason some users stop returning" ([ContentGrip](https://www.contentgrip.com/duolingo-streak-revival-campaign/)). Both figures are company-reported. **Lesson:** streaks retain, but a *broken* streak is a quit trigger. A single-player game without money is better off with a **cumulative stamp card** (days visited, never reset) than a streak at all.

**Rotating content and weekly bosses** are acceptable when nothing is permanently missable. Rotate a Market shelf or a weekly "Bastion" floor, and let anything rotated out come back later.

---

## 4. Roguelike meta-progression: turning a wipe into a reason to return

**Hades.** The story moves forward whether the player wins or loses ([GameSpot](https://gamespot.com/articles/hades-changes-what-it-means-to-be-a-roguelike/1100-6483420/)). Dialogue is a queue of lines with priorities and unlock conditions. After a death the game serves the most urgent unlocked conversation, often about the boss who just killed you ([God is a Geek](https://www.godisageek.com/2020/12/goty-2020-best-new-idea-hades-how-to-tell-a-story-in-a-roguelike/)). Kasavin says players shouldn't hit a difficulty wall with no way to see the story's end, and that the studio builds systems to prevent it ([GDC podcast](https://gdconf.com/news/roguelikes-and-narrative-design-hades-creative-director-greg-kasavin-gdc-podcast-ep-16)). One of those systems is **God Mode**: damage resistance rises after every death, up to 80% per an accessibility review ([Can I Play That](https://caniplaythat.com/2020/11/04/indie-spotlight-hades/)). Darkness, spent at the Mirror of Night, turns every run into permanent power.

**Into the Breach.** When a timeline ends, win or lose, the player sends **one pilot** forward, and that pilot keeps all skills and XP ([We Got This Covered](https://wegotthiscovered.com/gaming/into-the-breach-review/)). This is the closest analogue to a party-of-5 permadeath tower.

**Rogue Legacy.** A dead character is replaced by a chosen heir with random "genetic" traits, and gold funds a manor of permanent upgrades. The run of deaths becomes a legacy ([StrategyWiki](https://strategywiki.org/wiki/Rogue_Legacy)).

**Inscryption.** On a loss, the player builds a **Death Card** from 3 cards drawn from the dead deck, and it can turn up in later runs ([Inscryption wiki](https://inscryption.fandom.com/wiki/Deathcard)). **Dead Cells.** Blueprints delivered before death unlock permanently into the drop pool ([Dead Cells wiki](https://deadcells.wiki.gg/wiki/Blueprint)).

**Slay the Spire.** Each win unlocks the next of 20 cumulative Ascension levels ([Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire)). Mega Crit tuned the game on metrics throughout Early Access ([Game Developer](https://www.gamedeveloper.com/design/learn-i-slay-the-spire-i-s-metrics-driven-approach-to-game-balancing-at-gdc-2019)).

**Darkest Dungeon.** Stress and afflictions came from "human experience" ([PC Gamer](https://www.pcgamer.com/uk/how-darkest-dungeon-got-inspiration-from-band-of-brothers-and-aliens)). The Stagecoach delivers new recruits **every week**, so a wipe is never a dead end, and players treat level-0 recruits as the game's free resource ([Steam discussion](https://steamcommunity.com/app/262060/discussions/0/1694923613868014590)). **XCOM.** Jake Solomon: permadeath "evokes dread and a real sense of loss," which makes success sweeter ([Game Developer](https://gamedeveloper.com/design/-i-xcom-i-designer-consequences-make-success-so-much-sweeter)).

**What to build: the F13 death spiral as "The Wipe Ledger".**
1. **Bequest (Into the Breach and Inscryption).** Each fallen hero leaves an **Echo**: a skill fragment, or 10–20% of one stat, bound to a surviving hero or to the next summon the player picks. The death card with last words gains a button: "Pass on Mira's resolve → choose heir".
2. **Death advances the story (Hades).** The first death on each floor band unlocks a priority-queued lobby scene, such as Isel's reaction, a friend mourning at the Memorial, or lore about whatever killed them. The "memories" system already exists. Write a `mourning` memory for each surviving friend.
3. **Memorial as progress.** Each plaque grants a small permanent Master bonus, and the Memorial lists *what each death taught*, for example "Bone Choir: weak to Fire, revealed".
4. **Stagecoach (Darkest Dungeon).** After any wipe that leaves fewer than 5 heroes, the next Normal summon is free, or a weekly "new arrivals" trio of recruits appears.
5. **Soft floor (Hades God Mode).** Each wipe adds +5% resistance on that floor band, capped at 25–40%, shown openly as "The tower remembers your fallen." It is optional, and the scouting report states it.
6. **Checkpoint**, so a run never restarts at F1 after F13. Restart at the highest cleared multiple of 5, minus 5.

A wipe should end with a **forward card**, for example "Next time: Echo of Mira ×1, Memorial +1, free recruit", not just a death toll.

---

## 5. Character attachment as a reason to return

- **Supports.** Fire Emblem's support conversations hold "some of the game's best and funniest character moments." Permadeath stings *because* of them ([Game Informer](https://gameinformer.com/2019/07/31/fire-emblem-three-houses-builds-an-army-worth-caring-about)).
- **"Will remember that."** Telltale's line created attachment even with thin branching, because characters coloured their responses to the player ([GamesBeat](https://gamesbeat.com/the-illusion-of-player-choice-in-the-walking-dead/)). *Visible acknowledgement* of memory matters more than deep branching.
- **Reactive lines.** Hades' priority queue (§4): react to the latest run first.
- **Naming and ownership.** XCOM players rename soldiers after friends, so every loss lands ([Game Geeker](https://gamegeeker.com/dlc/xcom-enemy-unknown-elite-soldier-pack-209811)). Let players rename heroes or give them nicknames.
- **Goal gradient and endowed progress.** In Nunes & Drèze's car-wash study, cards needing 10 stamps that came with 2 pre-stamped were redeemed **34%** of the time, against **19%** for blank 8-stamp cards, and customers came back faster ([Silicon Canals](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/), [Wikipedia: Goal pursuit](https://en.wikipedia.org/wiki/Goal_pursuit)). Count the tutorial heroes toward the collection book, so it shows 11/40 rather than 0/29, and always show "N to the next milestone".

**What to build: hero letters.** Isel already writes after 2 or more hours away. Add **one hero letter per return**, written from a real `stepLife` memory: "I tried the Kitchen's new recipe. Burned it. Sene laughed. Save me a spot on the next climb? — Kael". Heroes can **miss** the player, but warmly ("I kept your seat"), never accusingly. Let the support pairs the player has unlocked appear in the "Lights Out" card as open loops.

---

## 6. Web techniques without a server

- **Tab title and favicon.** Listen for `visibilitychange` and read `document.hidden` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)). Only state true, useful facts: "✓ Stew ready · Pick Me Up!" when a timer the player chose finishes while the tab is in the background. Show a small favicon dot on completion. Never cycle or flash the title, and never write "Come back!!".
- **Notifications.** Firefox 72+ only allows the permission prompt from a user gesture ([Mozilla Hacks](https://hacks.mozilla.org/?p=33980)). web.dev recommends the "double permission" pattern: the site's own contextual dialog first, then the browser prompt ([web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)). Chrome calls auto-prompting bad practice that leads to lower grant rates ([Chrome blog](https://developer.chrome.com/blog/permissions-chip/)). Without a push server, notifications can only fire while a tab or service worker is alive. Offer them **only** as an opt-in on a timer the player set: "Ping me when the promotion finishes?"
- **Protect the save. This is the most important retention fix on the web.** Safari's ITP deletes **all script-writable storage, localStorage and IndexedDB included,** "after seven days of Safari use without user interaction on the site." Home-screen web apps keep their own counter ([WebKit](https://webkit.org/?p=10218), [Michael Tsai summary](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/)). A lapsed Safari player may come back to an *empty save*, which is the worst possible return. Mitigations:
  - Call `navigator.storage.persist()` inside a user gesture, for example right after the first summon. Chromium grants it silently to engaged or installed sites ([web.dev Persistent storage](https://web.dev/articles/persistent-storage)).
  - Make the game installable as a PWA.
  - Add **Export/Import save** as a copyable code or file, and remind the player gently once after a big milestone.
- **PWA install** also gives an app icon on the home screen. That is a passive, ethical reminder.

---

## 7. Verdict: should PI decay and 6-month deletion stay?

**The canon:** worlds live on probability interference, and an account is deleted after 6 months of inactivity, the "grey towers" (`PICK-ME-UP-GAME-BIBLE.md` line 31). **The build:** PI decays with absence, the world greys after 30 world-days, and is deleted after 540 world-days. After that the reducer refuses every command except `TICK` ("this waiting room has greyed and been deleted"). On top of that, offline invasions can take storeroom goods and synthesize a captured hero after about 1 real day.

**Verdict: soften and reframe. Keep the fiction, drop the punishment.**
- In a single-player, localStorage-only game, deleting the save is **irreversible, punishes exactly the lapsed player the game wants back, and protects nothing**: there is no server population to keep healthy. It is *playing by appointment* in its strongest form (Zagal et al.). It also works against autonomy (SDT).
- Comparable games stop at **cosmetic, reversible** consequences (Animal Crossing's weeds and roaches). Duolingo, which profits from streaks, still found that loss is a quit trigger and built free recovery.
- WoW proved that the **same numbers** feel opposite depending on framing.

**How to reframe it:**
1. **Grey is a visual state, not a deletion.** After 30+ days away, the lobby palette desaturates and the heroes "doze". On return, colour floods back in a 2–3 s animated "Re-interference" ceremony: Isel says "You came back. The towers remembered you." **The return itself is the reward.**
2. **Invert PI decay into "Pent-up Interference" (rested XP).** Absence accrues bubbles, for example 1 per 8 real hours up to 6. Each bubble doubles the gold from one floor clear, and the HUD reads "Interference: 200%". Nothing is ever lost, and coming back after a week feels good.
3. **Deletion becomes lore and NPCs.** The *Grey Tower Club* rivals (`src/engine/pvp/rivals.ts`, "Veterans of worlds that ended") already tell this story. Let them carry the canon so the player doesn't have to suffer it.
4. **If the canon must be playable, make it an opt-in "Hardcore Master" toggle at account creation.** Explain it clearly, show a visible countdown, export the save automatically first, and never turn it on silently.
5. **Offline invasions:** never resolve a *permanent* loss (synthesizing a captive, or losing more than a token amount of storeroom) while the player is away. Pause the captive clock until the player has seen the event, or close the crack automatically when they leave. Hostage drama should play out on screen, where the player can respond.

---

## Dark patterns to avoid

| Pattern | Why it's harmful | Use instead |
|---|---|---|
| Decay or deletion while away | Punishes absence; cannot be undone | Rested-style bonus and a cosmetic grey state |
| Resetting login streak | Breaking it triggers quitting | Cumulative stamp card that never resets |
| Permanent losses resolved offline (captives, invasions) | Return opens on loss | Pause until seen; resolve on screen |
| Guilt messages ("Your heroes are starving") | Confirmshaming, loss framing | Warm "kept your seat" letters |
| FOMO limited-time, never-returning content | Undermines autonomy (Hodent) | Rotations that come back |
| Energy or stamina gates | End sessions without commitment (Telfer) | Opt-in timers chosen by the player |
| Unprompted notifications | Spam and lower grant rates | Double-permission, opt-in per timer |
| "Are you sure? You'll lose…" on quit | Sunk-cost pressure | "Good place to stop" card |
| Faked near-miss reveals | Gambling psychology | Honest reveal order |

---

## Top 15 implementable techniques for a localStorage-only single-player web game (prioritized)

1. **Protect the save:** `navigator.storage.persist()` after the first summon, Export/Import save, and a PWA manifest. Safari's 7-day ITP cap can otherwise wipe a lapsed player's save ([WebKit](https://webkit.org/?p=10218), [web.dev](https://web.dev/articles/persistent-storage)).
2. **Remove deletion and invert PI decay into "Pent-up Interference"** (1 bubble per 8h, max 6, each bubble doubles one floor's gold), with a cosmetic grey state and a colour-return ceremony ([WoW rested](https://warcraft.wiki.gg/wiki/Rested)).
3. **The Wipe Ledger: bequest Echoes** from each fallen hero to a chosen heir, plus a forward card after every wipe ([Into the Breach](https://wegotthiscovered.com/gaming/into-the-breach-review/), [Inscryption](https://inscryption.fandom.com/wiki/Deathcard)).
4. **Death advances the story:** a priority-queued lobby scene plus a `mourning` memory for each friend of the fallen ([Hades](https://www.godisageek.com/2020/12/goty-2020-best-new-idea-hades-how-to-tell-a-story-in-a-roguelike/)).
5. **"Lights Out" card when a session ends:** next floor's scouting teaser, up to 3 brewing timers, one relationship on the edge, and a goal-gradient bar ([Zeigarnik](https://en.wikipedia.org/wiki/Zeigarnik_effect), [Hemingway](https://fs.blog/ernest-hemingway-three-tips-on-how-to-write-fiction/)).
6. **"While you were away" ledger:** at most 5 vignettes from `stepLife`, with gifts on the Tavern table, 24h at full value tapering to a 72h cap, and no gates ([Neko Atsume](https://en.wikipedia.org/wiki/Neko_Atsume), [AFK Arena](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena)).
7. **Hero letters on return,** written from real memories, warm and never accusing ([Telltale memory](https://gamesbeat.com/the-illusion-of-player-choice-in-the-walking-dead/)).
8. **No permanent losses while away:** pause captive and invasion clocks until the player sees them ([Zagal et al.](https://research.chalmers.se/en/publication/177148)).
9. **Opt-in brewing timers:** the player picks 1h, 4h or 8h for Kitchen, Training and Promotion, and longer means a bigger yield ([Telfer](https://mobilefreetoplay.com/mobile-free-to-play-player-commitment/)).
10. **Death-spiral floor:** a free recruit, Stagecoach style, after a wipe that leaves fewer than 5 heroes; a checkpoint at the last multiple of 5; and an optional visible resistance bonus after repeated wipes ([Darkest Dungeon](https://steamcommunity.com/app/262060/discussions/0/1694923613868014590), [Hades God Mode](https://caniplaythat.com/2020/11/04/indie-spotlight-hades/)).
11. **Daily Floor from a date seed:** one scored attempt plus unlimited practice, a shareable emoji result, and no streak ([Wordle](https://www.boston.com/news/national-news/2022/01/04/he-made-wordle-for-his-partner-now-its-an-online-hit/), [StS Daily](https://intothespine.com/2018/03/05/slay-the-spire-daily-climb/)).
12. **Replace the daily-gift streak with a cumulative stamp card** that never resets, starts 2/10 pre-stamped, and pays out on every 10th visit ([Nunes & Drèze](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/), [Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)).
13. **Collection book with endowed progress:** tutorial heroes count toward it, "N to the next milestone" is always visible, and heroes can be renamed or nicknamed ([Goal pursuit](https://en.wikipedia.org/wiki/Goal_pursuit), [XCOM](https://gamedeveloper.com/design/-i-xcom-i-designer-consequences-make-success-so-much-sweeter)).
14. **Honest tab title and favicon dot** only when a timer the player chose completes. Notifications only via double-permission opt-in ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [web.dev](https://web.dev/articles/push-notifications-permissions-ux)).
15. **A first-session peak and a kind exit:** guarantee one standout pull in the tutorial 10-pull with a staggered reveal, end on a high, and show a gentle "good place to stop" after about 60 minutes ([CHI peak-end](https://dx.doi.org/10.1145/2858036.2858419), [Nintendo](https://www.killscreen.com/should-more-games-tell-us-stop-playing-and-do-something-else/)).
