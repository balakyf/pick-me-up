# Pick Me Up! — Pixel-Art Direction (Visual Overhaul) Design

> **Status:** Approved direction · **Date:** 2026-09-29
> **Scope:** replace the web-dashboard presentation (cards, pills, emoji glyphs, text combat log)
> with a **16-bit SNES-style pixel-art game**: real characters, a walkable top-down lobby, and an
> animated JRPG battle scene. **Presentation only** — the engine (`src/engine/`) is untouched and
> stays pure/deterministic.

## Decisions (locked with the user)

| Decision | Choice | Why |
|---|---|---|
| Asset source | **Generated in code** | Every summoned hero gets a unique sprite derived from its identity — the visual form of canon *Mobius Summon: no duplicates*. No asset pipeline, no licensing. |
| Presentation | **Top-down** world (Pokémon / Stardew style) | The Master walks the Lobby, talks to heroes, uses facilities in place. Battles cut to a separate side-view scene (classic JRPG convention; the sim is an auto-battler). |
| Pixel style | **16-bit SNES** | ~24×32 character sprites, rich ramped palettes, dark-fantasy tone (FF6 / Chrono Trigger). |
| Delivery | **Vertical slice first** | Foundation + sprite generator + walkable lobby + battle scene, validated before extending. |

## 1. Architecture

```
src/engine/        (unchanged — pure rules)
src/ui/pixel/      pure pixel core: bitmap ops, palette ramps, seeded look → sprite generators
                   (heroes, enemies, tiles/furniture). Pure data (Uint32 RGBA), unit-tested in node.
src/ui/pixel/render.ts   the ONLY browser bridge: bitmap → canvas / dataURL (cached; no-op in jsdom)
src/ui/world/      top-down Lobby: tilemap data, BFS pathing (pure, tested) + LobbyWorld canvas scene
src/ui/battle/     BattleScene: replays the engine CombatLog as animation
```

**Rule:** sprite generation is **pure and deterministic** (hash of hero `id`+`name`, never
`Math.random`), so a hero looks identical on every load and in every screen. Cosmetic motion
(wandering in the lobby, idle bobbing) may use `Math.random` — no game state rides on it
(same stance as the Visual Lobby spec §"Ambient life").

## 2. Pixel grid & scaling

- Tiles **16×16**; character frames **24×32**; busts (dialog/card portraits) **32×32**.
- Scenes render at a **logical 384×216** and scale by the largest **integer** factor that fits
  (non-integer only below 1×), with `image-rendering: pixelated` everywhere.
- One curated palette (`palette.ts`): 3-step ramps (shadow/base/light) per material + one
  universal dark outline, auto-applied by an outline pass (SNES "sel-out"-lite).

## 3. Character generator (the "Mobius Summon look")

`lookForHero(hero)` → `HeroLook` (skin/hair ramps, hair style, eyes, outfit, headgear,
weapon, cape, trim, element accent). Canon mapped to visuals:

| Canon fact | Visual rule |
|---|---|
| 1★ are ordinary people | peasant tunic/apron, no weapon |
| 2★ mercenaries, hunters | leather vest, small blade/club |
| 3★+ may hold a class | class kit: warrior (plate+sword+shield), spearman (helm+spear), thief (hood/bandana+daggers), archer (cloak+bow), mage (robe+hat/hood+staff) |
| 4★ exclusive weapon + imprint | cape |
| 5★ world-renowned | cape + gold trim + circlet |
| element | accent colour on trim, gem, eyes glint |
| `portraitToken` (cameo colour) | primary cloth colour |

Output: 4 directions (down/up/left; right = mirror) × 3 walk frames, plus a 32×32 bust.
Enemies (goblin, wolf, harpy, skeleton, soldier, ogre, dark disciple, dire beast, black priest,
Lv999 creature) have authored side-view generators.

## 4. The Lobby (top-down, walkable)

- Authored tilemap: a Great Hall (Mobius summoning circle, roster lectern, party board, the
  **Tower gate**) ringed by rooms — Kitchen, Tactical Center, Promotion Chamber, Synthesis
  Chamber, Armory, Daily-Dungeon portal.
- **Controls:** arrows / WASD / ZQSD to walk, Space/Enter/E to interact, Esc to close; click/tap
  anywhere to path there (BFS); click an object or hero to walk up and interact.
- **Heroes live there:** each living hero wanders inside the room given by the existing
  `roomFor` rule (low Sanity → Kitchen, at cap → Promotion Chamber, in party → Tactical Center,
  else the Hall), with emote bubbles (… low Sanity, ! at cap). Talking opens a dialog box with
  the hero's bust and a state-driven line.
- **Facilities open in place:** interacting opens an RPG window hosting the existing facility
  panel (Banquet, Promotion, Upgrade, Synthesis, Armory, Daily). Rules unchanged.
- HUD: Master Lv/XP, gold, gems, a Menu (Lobby/Tower/Summon/Party/Roster/New game) and a
  "places" list (accessibility + mobile: tap a place → auto-walk + open).

## 5. Battle scene

Side-view stage: enemies left (facing right), party right (facing left) arranged by line
(front/mid/back). The engine `CombatLog` is replayed event-by-event with per-kind durations:
attacker lunge, target flash + shake, floating damage (crit = large gold, MISS), panic
sweat-drop, death fade, wave-spawn slide-in. FF-style windows: action caption on top, party
status (name / HP gauge) below; pause, speed 1–4×, skip.

## 6. UI kit

Pixel font (Pixelify Sans, bundled via `@fontsource`), dark-indigo RPG windows with a stepped
gold-trim border, pixel buttons with a ▶ cursor on hover/focus, chunky gauges. All other screens
(Title, Summon, Tower, Party, Roster, Results) adopt the kit and use sprites/busts instead of
initials.

## 7. Testing

- Pure core: bitmap ops, determinism (same hero ⇒ identical pixels), distinctness (different
  heroes ⇒ different sprites), frame dimensions, outline pass; tilemap walkability + BFS.
- Smoke: the App still boots, lobby facility panels reachable through the places list.
- Visual checks by screenshot (Playwright) — a `?gallery=1` dev view renders a sprite sheet.

## Deferred (next slices)

Summon ritual animation, tower exterior/floor map, per-floor battle backdrops beyond the first
bands, hero autonomy (liveliness 3), sound, French localisation.
