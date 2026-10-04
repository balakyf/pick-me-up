/**
 * The story (lane M): pure data, keyed by act id, anchor floor and enemy template id.
 * Pillar 4 — every anchor is an event. Nothing here touches state or randomness; the UI
 * (`src/ui/story/*`) reads it, translates it with `t()` (every string has French in
 * `ui/i18n/slices/frStory.ts`) and decides when each line plays.
 *
 * CANON SOURCES (PICK-ME-UP-GAME-BIBLE.md, pick-me-up-raw-facts.json):
 *  - Taoni/Townia floor logs: F5 survive the goblins, F10 stop the city's fall + the Black
 *    Priest, F15 escort Princess Priasis (assassins, a 15-minute window), F20 the half black
 *    dragon Halgiraf (scales immune to sword/arrow/magic; ballista; "15 went, 8 returned"),
 *    F25 escape with Priasis across the desert and the cold, F30 Kurushahr the Truth Seeker
 *    and the 300 m Ancient Stone Statue, F35 the blue jewel and the water dragon Kthat
 *    (worshipped as a god), F36–40 the war loop where Priasis fights and dies near its end,
 *    F40 Valention of Iron Blood with Rodvick (strength) and Lazenca (speed), F41 Versace of
 *    Silver Lightning (the Order's last executive), F42 Darkan of Destruction (3rd guard
 *    division), F45 deliver the key, F50 protect the object and destroy the Egg (Taonier's
 *    first hundred-party mission), F70 the inflection, F80 the Wailing Wall (the Fragment
 *    Series for every Master; only the top five passed) and Pryos Al Ragna, Taonier's
 *    highest leader, a 7★ who turned half-monster.
 *  - The secret: clearing F90 unconditionally destroys the world; heroes are real people;
 *    Tell is the goddess behind Möbius; El Cid, Dorado's Master, first to clear F80, walked
 *    into his own game with the Book of Reverse Heaven; the Golden Bloodline (Al Ragna).
 *  - Isel is the fairy who keeps each world's waiting room and relays to the Master.
 *
 * AUTHORED (not canon, kept consistent with it): the Herald of the End and Tell's floors
 * (lanes F/G), the Saint, the Inquisitor and the Matriarch, Priasis's letters, Pryos as
 * her kinsman (both Al Ragna; the canon names them both royals of Taonier), and who the
 * F45 key is for. The hidden objectives' lore (`hidden.ts`) is kept true: Priasis remembers
 * a sky with two suns; the statue kept something inside; the Fragments are the weakest of
 * what waits past ninety.
 *
 * Lines are JRPG text-box length. Placeholders: `{name}` (a hero) and `{n}` (a number) only
 * where the UI fills them.
 */

import type { FillerMissionKind } from './missions'

// ── Act cards ───────────────────────────────────────────────────────────────

export interface ActStory {
  /** The act's name on its card (the act's title without its numeral). */
  name: string
  /** One line under the name. */
  epigraph: string
  /** Isel's word as the Master arrives. */
  isel: string
}

/** One per act in `ACTS`, keyed by act id. */
export const ACT_STORY: Record<string, ActStory> = {
  prairie: {
    name: 'The Prairie',
    epigraph: 'Every Master starts on grass. Every hero here was someone else last week.',
    isel: 'Goblins first, Master. Learn their faces. The tower is already learning yours.',
  },
  ruins: {
    name: 'The Ruins',
    epigraph: 'A fallen kingdom, a princess with assassins at her back, and a dragon on the roof.',
    isel: 'From here the floors have names in them. Some of those names will ask for help.',
  },
  swamp: {
    name: 'The Swamp',
    epigraph: 'Reeds, sand and cold, and a statue that was old when the tower was young.',
    isel: 'Keep Priasis alive, keep your feet dry, and do not trust anything made of stone.',
  },
  coast: {
    name: 'The Drowned Coast',
    epigraph: 'Here they worshipped a dragon. The dragon was listening.',
    isel: 'The people of this coast prayed to the thing you have come to rob. Mind your manners.',
  },
  order: {
    name: "The Order's War",
    epigraph: 'A war that was lost before you arrived, and a loop that will not let you leave.',
    isel: 'Floors thirty-six to forty turn in a circle. Break the gate, or they start again.',
  },
  inflection: {
    name: 'The Inflection',
    epigraph: 'Floor seventy. The curve bends here, and the rankings thin out.',
    isel: 'From here every floor is worse than the last, by more than you expect. Count your heroes.',
  },
  wall: {
    name: 'The Wailing Wall',
    epigraph: 'The same Wall for every Master in every world. Only five ever climbed it.',
    isel: 'The living are not supposed to survive this. Prove the wiki wrong, Master.',
  },
  void: {
    name: 'The Unfinished Floors',
    epigraph: 'Past the ninetieth floor, no one finished building the tower.',
    isel: 'I do not know what is up there, Master. Neither did the people who made it.',
  },
}

// ── Anchor briefings ────────────────────────────────────────────────────────

/** Who speaks a line in battle. */
export type StorySpeaker = 'isel' | 'priasis' | 'keyBearer' | 'narrator'

export interface AnchorStory {
  /** The floor's story title ('The Falling City'). */
  title: string
  /** Who is up there. */
  who: string
  /** Why it matters. */
  why: string
  /** Isel's word before the Master enters. */
  isel: string
  /** A line as the fight begins (an escort, or Isel through the crystal), on the first action. */
  opening?: { speaker: StorySpeaker; line: string }
  /** What the results say after a clear (under the boss's name). */
  aftermath: string
  /** Lane O: a line as wave n (0-based; the first spawn is 1) comes onto the field — the
   *  siege's stages. */
  waves?: Readonly<Record<number, { speaker: StorySpeaker; line: string }>>
}

/** One per anchor in `ANCHORS`, keyed by floor. */
export const ANCHOR_STORY: Record<number, AnchorStory> = {
  5: {
    title: 'The Goblin Tide',
    who: 'Goblins, more than anyone can count, and wolves running with them.',
    why: 'Survive the horde. Nobody is asking you to win, only to still be standing.',
    isel: 'Hold the line until the drums stop, Master. Then bring them home.',
    opening: { speaker: 'isel', line: 'The drums have started. Hold, and do not chase them.' },
    aftermath: 'The drums stop. The prairie is quiet, and your heroes are still standing.',
  },
  10: {
    title: 'The Falling City',
    who: 'The Black Priest, and something in the third wave that must never wake.',
    why: 'The city falls tonight unless the Priest falls first. Do not fight the thing he calls.',
    isel: 'Level 999, Master. It is not a typo. Kill the Priest, and finish before it opens its eyes.',
    aftermath: 'The Priest is dead. The city still burns, but it stands.',
  },
  15: {
    title: 'The Princess in the Ruins',
    who: 'Princess Priasis Al Ragna of Taonier, with assassins one step behind her.',
    why: 'Fifteen minutes. Keep her breathing until then and she walks out of the ruins.',
    isel: 'If she falls, the floor fails. And her blood is worth more than the tower lets on.',
    opening: { speaker: 'priasis', line: 'Fifteen minutes, then. Try not to die for me. I hate owing people.' },
    aftermath: 'Priasis walks out of the ruins on her own feet. She looks back at you once.',
  },
  20: {
    title: 'The Half Black Dragon',
    who: 'Halgiraf, the half black dragon. Swords, arrows and spells slide off his scales.',
    why: 'In the old logs it took three parties and a ballista. Fifteen went up. Eight came home.',
    isel: 'Break his scales with the ballista, then strike the heart. When he takes to the air, brace.',
    aftermath: 'Halgiraf falls out of the sky, and the ruins go silent under him.',
  },
  25: {
    title: 'Across the Sands',
    who: 'Lizardmen in the dunes and their chief at the pass, and Priasis, hunted again.',
    why: 'Get her across the desert. Reaching the far side is the only victory that counts.',
    isel: 'Run, Master. Do not stop to win. Priasis has to reach the cold.',
    opening: { speaker: 'priasis', line: 'You again. Good. The lizards want my head, and I would like to keep it.' },
    aftermath: 'Out of the sand and into the cold. Priasis is safe, for now.',
  },
  30: {
    title: 'The Ancient Statue',
    who: 'Kurushahr the Truth Seeker, his golems, and the Ancient Stone Statue, three hundred metres tall.',
    why: 'The statue was built to keep something inside. Break its cores, then break it.',
    isel: 'Kurushahr knows things about this tower that nobody should. Do not let him talk for long.',
    aftermath: 'The statue cracks open. Whatever it held is gone, or loose.',
  },
  35: {
    title: 'The Water God’s Jewel',
    who: 'Kthat, the water dragon this coast worshipped as a god, and the guardian of the blue jewel.',
    why: 'Take the jewel and the floor is yours. Fell the god first, if you dare.',
    isel: 'They prayed to that dragon for a thousand years. It will not die quietly.',
    aftermath: 'The blue jewel is yours. The sea has gone very still.',
  },
  40: {
    title: 'Iron Blood at the Gate',
    who: 'Valention of Iron Blood, Commander of the Order, with Rodvick and Lazenca at his side.',
    why: 'The gate of the loop. Fail here and the waiting room falls back to floor thirty-one.',
    isel: 'Priasis rode into this war with the vanguard. Break the gate, Master. For her too.',
    aftermath: 'The gate breaks and the loop is over. Not everyone who fought in it is coming home.',
  },
  41: {
    title: 'Silver Lightning',
    who: 'Versace of Silver Lightning, the Order’s last executive, fleeing with what is left of his men.',
    why: 'He is fast and the clock is short. Catch him before he is gone.',
    isel: 'Do not chase his shadow. Cut down his soldiers and he has nowhere left to run.',
    aftermath: 'Silver Lightning, grounded. The Order has no executives left.',
  },
  42: {
    title: 'The Third Division',
    who: 'Darkan of Destruction, commander of the Order’s third guard division.',
    why: 'His knights hold the stair, and he breaks armour like bread.',
    isel: 'Keep your shields fresh, Master. Darkan goes for whoever wears the most steel.',
    aftermath: 'Darkan falls, and the third division scatters down the stairs.',
  },
  45: {
    title: 'The Key',
    who: 'A bearer with a key, and the Order’s marksmen who want it back.',
    why: 'Get the key to the one who waits on the other side. Carry the bearer if you must.',
    isel: 'Nobody will tell me what the key opens, Master. That frightens me more than the marksmen.',
    opening: { speaker: 'keyBearer', line: 'Stay close. If I drop this, nobody gets to pick it up again.' },
    aftermath: 'The key changes hands. Somewhere above you, a lock turns.',
  },
  50: {
    title: 'The Egg',
    who: 'The Egg, and the brood it keeps hatching.',
    why: 'Shield the Sealed Object, a piece of the world’s core, and destroy the Egg that feeds on it.',
    isel: 'In Taonier this took a hundred parties. You have one. Make it enough.',
    opening: { speaker: 'isel', line: 'It is feeding on the core, Master. Every second it lives, the world gets smaller.' },
    aftermath: 'The shell is broken. The core is safe, what is left of it.',
  },
  55: {
    title: 'The Purge',
    who: 'The Order’s Inquisitor, with three waves of zealots in front of him.',
    why: 'Hold all three waves. The Inquisitor comes with the last.',
    isel: 'They call it a purge. They mean us: everyone the crystal ever called.',
    aftermath: 'The Inquisitor’s fires go out. The purge has run out of priests.',
  },
  60: {
    title: 'The Fallen Ranker',
    who: 'El Cid. Once the Master of Dorado, the first to clear floor eighty. Now he guards a floor.',
    why: 'He carried the Book of Reverse Heaven into his own game. Beat him and it is yours.',
    isel: 'He was the best of you, Master, and he is holding back. When he stops, be ready.',
    aftermath: 'El Cid kneels. The Book of Reverse Heaven falls at your heroes’ feet.',
  },
  65: {
    title: 'The Saint’s Crusade',
    who: 'The Order’s Saint and the last of its crusade.',
    why: 'Survive. Her light mends everything you cut, so outlast it.',
    isel: 'Do not race her healing, Master. Hold on until the hymn runs out.',
    aftermath: 'The hymn ends. The Order’s war is finally, truly over.',
  },
  70: {
    title: 'Mother of Monsters',
    who: 'The Chimera Matriarch: three heads, and a brood to answer each one.',
    why: 'Floor seventy. The curve bends here, and most Rankers stop climbing.',
    isel: 'Past this floor the tower stops being fair. It was never kind.',
    aftermath: 'The Matriarch falls. Above you, the curve keeps rising.',
  },
  75: {
    title: 'The Long Night',
    who: 'Chimeras, wraiths and dark knights in four waves, with no commander at all.',
    why: 'Hold the ground through all four. Nothing here has a name. All of it can kill.',
    isel: 'Five floors to the Wall, Master. Bring them home tonight, and let them rest.',
    aftermath: 'Four waves broken. Ahead, the Wall is waiting.',
  },
  80: {
    title: 'The Wailing Wall',
    who: 'The Fragment Series, the same for every Master, and behind them Pryos Al Ragna.',
    why: 'Taonier’s highest leader turned half-monster to hold this Wall. Only five Rankers ever passed.',
    isel: 'Pryos is of Priasis’s house, Master. He knows what happened in the loop, and he will say so.',
    aftermath: 'Pryos Al Ragna falls standing. The Wall has a hole in it the shape of your party.',
    // Lane O: the Siege of the Wailing Wall, stage by stage (the fourth is Pryos's own: his
    // title card and his entrance line).
    opening: { speaker: 'isel', line: 'The siege begins. Keep the ram moving, Master: if it breaks, so does the siege.' },
    waves: {
      1: { speaker: 'narrator', line: 'Stage two: the gate opens, and its knights come out to meet the ram.' },
      2: { speaker: 'narrator', line: 'Stage three: the gate gives. The wardens hold the breach with everything they are.' },
    },
  },
  85: {
    title: 'The Wall Given Legs',
    who: 'The Fragment Colossus: the Wall itself, risen to walk.',
    why: 'The ballista again. Crack its plating first, then give it everything.',
    isel: 'The Fragments are the weakest of what waits past ninety. Remember that, and climb anyway.',
    aftermath: 'The Colossus crumbles. Five floors are left before the end.',
  },
  90: {
    title: 'The World’s End',
    who: 'The Herald of the End, who comes to announce the last floor.',
    why: 'Clearing this floor ends the world beneath the tower. Everyone on its surface dies.',
    isel: 'The game never told you, Master. I am telling you now. Choose with your eyes open.',
    aftermath: 'The world beneath the tower is gone. The climb goes on into floors no one finished.',
  },
  95: {
    title: 'The Unfinished',
    who: 'Void spawn and a broken colossus, on a floor no one finished building.',
    why: 'Survive. The floor itself is not sure it exists.',
    isel: 'Hold on to each other, Master. Out here nothing else is solid.',
    aftermath: 'The floor holds, barely. Five more to the top.',
  },
  100: {
    title: 'The Architect',
    who: 'Tell, the goddess behind the tower, who wrote every floor you have climbed.',
    why: 'She made the game and its law. She will call back every anchor you ever beat.',
    isel: 'I was made to keep your waiting room, Master, not to see this. Go and end it.',
    aftermath: 'Tell falls. The pen that wrote the tower lies still.',
  },
}

// ── Filler floors (lane P) ──────────────────────────────────────────────────

/**
 * The floors between the anchors: a one-line briefing per act and mission (the war room
 * shows it over the objective), a few lines of flavour to pick from, and Isel's word through
 * the crystal as some of those fights begin. The UI picks a line per floor from the account
 * seed, so every Master's stair reads a little differently.
 */
export interface FillerStory {
  /** A briefing line by mission (the kinds in the act's mission table). */
  missions: Readonly<Partial<Record<FillerMissionKind, string>>>
  /** Flavour: what the party finds on the stair. */
  lines: readonly string[]
  /** Isel through the crystal as a fight begins (not every floor). */
  events: readonly string[]
}

/** One per act with a mission table, keyed by act id. */
export const FILLER_STORY: Record<string, FillerStory> = {
  prairie: {
    missions: {
      subjugation: 'Goblins and wolves on the stair. Clear them out and keep climbing.',
      survival: 'A goblin warband is coming up the stair. Hold until it breaks on you.',
      hunt: 'A raider chief drives the goblins. Drop him and the rest scatter.',
    },
    lines: [
      'The grass grows right up the steps here. Something has been grazing on it.',
      'Wolf tracks, goblin tracks, and one set of boots that stops halfway.',
      'A burnt fence post marks where a farm used to be. The tower kept the fence.',
    ],
    events: ['They are only goblins, Master. That is how it always starts.', 'Watch the front line. The wolves always go for it first.'],
  },
  ruins: {
    missions: {
      subjugation: 'Skeletons and soldiers of a fallen kingdom still hold this hall.',
      survival: 'Assassins in the dark. Keep your backs together until the bell.',
      escort: 'A refugee is hiding in the rubble. Walk them out; the soldiers want no witnesses.',
      hunt: 'A captain of the dead kingdom gives the orders here. Cut him down.',
    },
    lines: [
      'A throne room with no throne. The banners are still hanging.',
      'Someone scratched a tally of days into the wall. It stops at forty.',
      'The bells here ring on their own. Nobody alive pulls the ropes.',
    ],
    events: ['Somebody is still hiding up here, Master. Listen.', 'These soldiers are still guarding a king who died a long time ago.'],
  },
  swamp: {
    missions: {
      subjugation: 'Lizardmen in the reeds, and something heavy moving under the water.',
      survival: 'The reeds are full of eyes. Hold out until they lose interest.',
      escape: 'The floor is sinking into the mire. Reach the far side before it swallows you.',
      hunt: 'A lizard war-chief with a painted crest leads this pack. Take the crest.',
      escort: 'A refugee lost in the reeds. Get them across before the shamans find them.',
    },
    lines: [
      'Green water to the knee, and warm. Nothing in a tower should be warm.',
      'Half a cart sticks out of the mud. Priasis’s escort came this way.',
      'The stone underfoot is carved. It used to be a road.',
    ],
    events: ['Keep moving, Master. The ground here does not like to be stood on.', 'Their shamans spit poison. Do not let it settle.'],
  },
  coast: {
    missions: {
      subjugation: 'Mermen on the rocks, and sharks in every pool.',
      seizure: 'Someone carries a sea-chest of temple gold. Take it and the floor opens behind it.',
      escort: 'A pearl diver is cornered on the reef. Bring them back to shore.',
    },
    lines: [
      'Offerings to the water god wash up on every step: coins, shells, a child’s shoe.',
      'The tide comes in through the windows of this floor.',
      'A shrine to Kthat, freshly painted. Somebody still believes.',
    ],
    events: ['The temple gold is cursed, Master. Take it anyway.', 'Mind the water. Things in it are listening.'],
  },
  order: {
    missions: {
      subjugation: 'An Order company holds this landing. Break it.',
      survival: 'The Order is throwing everything at this floor. Outlast it.',
      defense: 'The Order is storming this landing. Hold the waves and the stair is yours.',
      hunt: 'An Order officer leads this company. Fell the officer and the rest break.',
      escape: 'The Order has fired the hall behind you. Get out before the roof comes down.',
      escort: 'A deserter wants out of the Order. Their old comrades want them dead first.',
    },
    lines: [
      'Order banners, burnt at the edges. Someone fought here before you.',
      'A field hospital, abandoned in a hurry. The kettles are still warm.',
      'Marching songs carry up the stairwell from a floor you already cleared.',
    ],
    events: ['The Order fights in ranks, Master. Break the officer and the ranks follow.', 'Priasis rode through here. I can feel it.'],
  },
  inflection: {
    missions: {
      subjugation: 'Wraiths and dark knights, and no reason to any of it.',
      survival: 'Chimeras without end. Nothing here can be cleared, only outlasted.',
      defense: 'They come in waves from the floor above. Hold, and hold again.',
      hunt: 'One chimera leads this brood. Kill it and the others lose their nerve.',
      escape: 'The floor is coming apart. Run for the far stair.',
    },
    lines: [
      'The walls breathe here. Slowly, but they breathe.',
      'Names of other Masters’ heroes, carved and crossed out, cover a whole wall.',
      'The light comes from nowhere and casts no shadows.',
    ],
    events: ['Count your heroes, Master. Every floor now.', 'This is where most Rankers stopped. Do not stop.'],
  },
}

/** A filler floor that is a story beat or a lesson's first floor: its own briefing line. */
export const FILLER_FLOOR_STORY: Record<number, { title?: string; line: string }> = {
  6: { line: 'One goblin is bigger than the rest, and it swings like it means it. Watch for the wind-up.' },
  8: { line: 'Goblin raiders, and the chief who leads them. Mark him and the others scatter.' },
  12: { line: 'A refugee from the ruined city, and soldiers who would rather leave no one to tell.' },
  13: { line: 'Soldiers with heavy shields. A bash from one leaves a hero seeing stars.' },
  47: {
    title: 'The Vault of Al Ragna',
    line: 'The lock the key turned: Priasis’s vault, and the Order already inside it. Take back the seal.',
  },
}

// ── Boss lines ──────────────────────────────────────────────────────────────

export interface BossLines {
  /** 'speaks': the boss's own words, under its name. 'narrated': a beast or a thing; the
   *  box tells what it does, in italics. */
  voice: 'speaks' | 'narrated'
  /** As it first steps onto the field (its title card). */
  entrance: string
  /** As it winds up a big move, by the charged skill's id (the first few times, then quiet). */
  telegraph?: Readonly<Record<string, string>>
  /** As it changes phase, by phase number (1 = its first change). Only where lane G's own
   *  phase line is narration: the phase card already carries the boss's spoken words. */
  phases?: Readonly<Record<number, string>>
  /** As it falls (its finisher). */
  defeat: string
  /** Over a party that lost to it (a wipe, a failed objective, a retreat, the clock). */
  victory?: string
}

/** Keyed by enemy template id (every key is a BOSS_INTRO template; asserted in tests). */
export const BOSS_LINES: Record<string, BossLines> = {
  black_priest: {
    voice: 'speaks',
    entrance: 'The city prays to its gods. I pray to what comes after them.',
    telegraph: { e_black_rite: 'Rise, child. Rise, and eat.' },
    defeat: 'Too late… it has already… heard…',
    victory: 'Another city. Another fall. Kneel.',
  },
  lv999_creature: {
    voice: 'narrated',
    entrance: 'Something vast breathes in the dark. Its eyes are still closed.',
    defeat: 'The thing that could not die lies still.',
    victory: 'It closes its eyes again. It never noticed you were there.',
  },
  halgiraf: {
    voice: 'speaks',
    entrance: 'More summoned things. The last fifteen tasted of iron.',
    telegraph: { e_dragon_breath: 'Breathe in, little ones. It is the last air you get.', e_sky_dive: 'Nothing hides from the sky.' },
    phases: { 1: 'The sky is mine. Come up and take it, worms!' },
    defeat: 'My scales… are older… than your world…',
    victory: 'Fifteen came last time. Bring more.',
  },
  lizard_chief: {
    voice: 'speaks',
    entrance: 'Soft-skins in my reeds! Bring me the princess, alive!',
    telegraph: { e_crushing_leap: 'Hssss! Crush them flat!' },
    defeat: 'The reeds… will remember me…',
    victory: 'Drag them into the mud.',
  },
  kurushahr: {
    voice: 'speaks',
    entrance: 'Summoned ones. Do you know what you really are? I do.',
    telegraph: { e_arcane_storm: 'Truth hurts. Let me show you how much.' },
    defeat: 'So close… to the last truth…',
    victory: 'Data. You were all very useful data.',
  },
  stone_statue: {
    voice: 'narrated',
    entrance: 'The statue’s eyes open. They glow the colour of a dying sun.',
    telegraph: { e_titan_fist: 'The ground shudders. A fist of stone blots out the light.' },
    defeat: 'Stone splits, and from inside comes a sound like breathing.',
    victory: 'The statue closes its eyes. It has kept its secret.',
  },
  kthat: {
    voice: 'speaks',
    entrance: 'Pilgrims came to me with gifts. You come with blades.',
    telegraph: { e_tidal_wave: 'The sea is mine to raise. Drown, little thieves.' },
    phases: { 1: 'I was a god before your tower had a floor!' },
    defeat: 'Without me… the coast… has no one…',
    victory: 'Go back to your crystal. The sea keeps what it takes.',
  },
  jewel_guardian: {
    voice: 'narrated',
    entrance: 'A guardian of blue glass turns its head. The jewel pulses in its chest.',
    defeat: 'The glass shatters. The blue jewel rolls free.',
  },
  kraken: {
    voice: 'narrated',
    entrance: 'Something enormous moves under the water, and the deck tilts.',
    defeat: 'The Kraken sinks back into the dark.',
  },
  rodvick: {
    voice: 'speaks',
    entrance: 'Heathens! I will judge you with my own hands.',
    telegraph: { e_crushing_blow: 'Hold still. Judgement is heavy.' },
    defeat: 'Commander… forgive me…',
  },
  lazenca: {
    voice: 'speaks',
    entrance: 'Talk quickly. I interrogate faster than you die.',
    defeat: 'Too slow… today…',
  },
  valention: {
    voice: 'speaks',
    entrance: 'The Order does not bleed. The Order is iron.',
    telegraph: { e_iron_verdict: 'Hear it? The iron in my blood is singing!' },
    defeat: 'Iron… rusts… after all…',
    victory: 'The loop turns again. You will come back to me.',
  },
  versace: {
    voice: 'speaks',
    entrance: 'Catch Silver Lightning? Please. Don’t make me laugh.',
    defeat: 'The last executive… how embarrassing…',
    victory: 'Too slow. Everyone is always too slow.',
  },
  darkan: {
    voice: 'speaks',
    entrance: 'Third division! Destroy everything that is still standing!',
    telegraph: { e_destruction: 'Armour is only a shell. I will crack it.' },
    defeat: 'Destruction… destroyed… ha…',
    victory: 'Rubble. All of it.',
  },
  the_egg: {
    voice: 'narrated',
    entrance: 'The Egg pulses. Something inside it is listening to you.',
    defeat: 'The shell splits open, and the screaming stops.',
    victory: 'The Egg feeds. The core goes dark.',
  },
  order_inquisitor: {
    voice: 'speaks',
    entrance: 'Summoned ones. Heathens out of a crystal. You will burn clean.',
    defeat: 'The fire… was supposed to be… clean…',
    victory: 'Purged.',
  },
  el_cid: {
    voice: 'speaks',
    entrance: 'I was a Master once, like you. Let me show you how it ends.',
    telegraph: { e_sword_rain: 'Watch closely. This is a Ranker’s blade.' },
    defeat: 'Take the book… and don’t make… my mistake…',
    victory: 'You climbed well. Not well enough. I know the feeling.',
  },
  order_saint: {
    voice: 'speaks',
    entrance: 'Be healed, children. And then be judged.',
    defeat: 'My light… is going home…',
    victory: 'Rest now. The light forgives you.',
  },
  chimera_matriarch: {
    voice: 'narrated',
    entrance: 'Three heads turn as one. The whole brood goes quiet.',
    telegraph: { e_inferno: 'All three heads draw breath. The air begins to burn.' },
    defeat: 'The Matriarch’s three heads fall silent, one after another.',
    victory: 'The brood feeds tonight.',
  },
  pryos: {
    voice: 'speaks',
    entrance: 'You carried Priasis out of the fire. Then her war took her. Now you come for me.',
    telegraph: { e_dark_dominion: 'Taonier’s blade, one last time!' },
    defeat: 'Priasis… I held the Wall… as long as I could…',
    victory: 'Go home. Tell Taonier its Wall still stands.',
  },
  fragment_colossus: {
    voice: 'narrated',
    entrance: 'The Wall stands up. It has been waiting for you.',
    telegraph: { e_colossal_slam: 'The Colossus raises an arm the size of a tower floor.' },
    defeat: 'The Colossus comes apart into a thousand fragments.',
    victory: 'The Wall lies down again, exactly where it was.',
  },
  herald_of_end: {
    voice: 'speaks',
    entrance: 'I am only the messenger. The message is: it ends.',
    telegraph: { e_end_of_days: 'Listen. This is the last word of your world.' },
    defeat: 'You won. Remember that you chose to.',
    victory: 'The end can wait. It always arrives.',
  },
  // Lane O: Tell's echoes, called back by her drafts — the anchors the Master already beat.
  echo_halgiraf: {
    voice: 'narrated',
    entrance: 'Black wings unfold again, pale as a page: the dragon you killed, remembered.',
    telegraph: { e_dragon_breath: 'The echo draws a breath it no longer needs.' },
    defeat: 'The echo of the dragon tears like wet paper.',
  },
  echo_el_cid: {
    voice: 'speaks',
    entrance: 'I walked into my own game once. She wrote me back out of it.',
    telegraph: { e_sword_rain: 'Look up. It rains swords in every draft.' },
    defeat: 'Tell her… I am done being a draft.',
  },
  echo_valention: {
    voice: 'speaks',
    entrance: 'Iron Blood, rewritten. It still remembers your blades.',
    defeat: 'Iron… forgets…',
  },
  echo_pryos: {
    voice: 'speaks',
    entrance: 'She wrote me back to hold one more wall. I am sorry, Master.',
    defeat: 'Priasis… I am coming home.',
  },
  echo_herald: {
    voice: 'speaks',
    entrance: 'I announced the end once. She would like me to do it again.',
    defeat: 'Twice ended. Twice remembered.',
  },
  tell: {
    voice: 'speaks',
    entrance: 'Welcome to the last page, Master. I wrote the others too.',
    telegraph: { e_final_draft: 'Hold still. I am going to rewrite you.' },
    defeat: 'Without me… who keeps… the hundred million worlds…?',
    victory: 'Back to the first floor. I will write you a new world.',
  },
}

// ── The Priasis arc ─────────────────────────────────────────────────────────

/**
 * Priasis Al Ragna through the climb: a thread of beats unlocked by the highest floor
 * cleared. Each beat may carry a letter (Priasis's own, or Isel's when Priasis can no
 * longer write) and a line Isel says in the lobby. Canon: the F15 escort, the F25 escape
 * into the cold, the F36–40 war loop where she fights and dies near its end; Pryos Al Ragna
 * at the Wall; the Golden Bloodline. Ordered by `after`.
 */
export interface PriasisBeat {
  id: string
  /** Unlocked once this floor is cleared. */
  after: number
  /** Only after the world ended / was spared at F90 (lane O may add more). */
  when?: 'ended' | 'saved'
  letter?: { from: 'priasis' | 'isel'; lines: readonly string[] }
  /** Isel's line in the lobby while this is the latest beat. */
  lobby: string
}

export const PRIASIS_ARC: readonly PriasisBeat[] = [
  {
    id: 'ruins',
    after: 15,
    letter: {
      from: 'priasis',
      lines: [
        'They tell me a princess should write a proper thank-you. This is it.',
        'One more thing. I remember a sky with two suns. Does anyone in your waiting room?',
      ],
    },
    lobby: 'A letter came from Priasis. The Al Ragna seal is on it. I have never seen one before.',
  },
  {
    id: 'dragon',
    after: 20,
    letter: {
      from: 'priasis',
      lines: ['I watched the black wings fall from the palace roof. The whole city cheered.', 'Nobody knew the names of the ones who did it. Send me their names. All of them.'],
    },
    lobby: 'Priasis wants the names of your heroes, Master. The living and the fallen.',
  },
  {
    id: 'sands',
    after: 25,
    letter: {
      from: 'priasis',
      lines: ['Out of the sand and into the cold. My kinsman Pryos holds the north now.', 'He would not like it that summoned strangers saved an Al Ragna twice.'],
    },
    lobby: 'Twice now you have carried an Al Ragna out of the fire. Taonier will remember.',
  },
  {
    id: 'statue',
    after: 30,
    letter: {
      from: 'priasis',
      lines: ['The statue was keeping something, wasn’t it? I dreamt of the two suns again.', 'This time I wore a crown of gold. It was not mine.'],
    },
    lobby: 'Priasis dreams of a golden crown. In this tower, dreams are usually memories in disguise.',
  },
  {
    id: 'war',
    after: 35,
    letter: {
      from: 'priasis',
      lines: ['The Order marches on what is left of us. I ride with the vanguard at dawn.', 'Climb fast, Master. The war is in your floors now.'],
    },
    lobby: 'Priasis has gone to war. The loop on floors thirty-six to forty is her war, Master.',
  },
  {
    id: 'fallen',
    after: 40,
    letter: {
      from: 'isel',
      lines: [
        'Master, Priasis Al Ragna fell at the end of the loop, holding a gate open for you.',
        'They found this on her: “If you are reading this, the gate is broken. Good. Do not visit my grave. Climb.”',
      ],
    },
    lobby: 'I keep her last letter in the ledger, Master, between the names of our own fallen.',
  },
  {
    id: 'key',
    after: 45,
    lobby: 'The key went to the one who waited. I asked whose it was. They said: it was hers.',
  },
  // Lane P · the key's payoff: the lock it turned was Priasis's vault (F47), and inside it
  // she had left a letter for whoever carried her key.
  {
    id: 'vault',
    after: 47,
    letter: {
      from: 'priasis',
      lines: [
        'If my key found you, then I am gone, and you are the one who carried it. Good.',
        'The crown in the vault was never ours. Neither was the sky with two suns.',
        'We came down from a world that ended, Master. Do not let yours.',
      ],
    },
    lobby: 'Her vault held a crown, a map of a sky with two suns, and a letter for you. The Al Ragna remembered a world that ended.',
  },
  {
    id: 'wall',
    after: 79,
    lobby: 'Pryos Al Ragna holds the Wall, Master. He is Priasis’s kin, and he knows how she died.',
  },
  {
    id: 'pryos',
    after: 80,
    letter: {
      from: 'isel',
      lines: ['The house of Al Ragna has no one left in the tower now. Only its blood.', 'And blood, Master, is not always where you left it.'],
    },
    lobby: 'The Golden Bloodline made Taonier out of four worlds. I wonder where it ran to.',
  },
  {
    id: 'herald',
    after: 89,
    lobby: 'Priasis remembered two suns. Pryos held a Wall. I think they both knew what this tower is for.',
  },
  {
    id: 'ended',
    after: 90,
    when: 'ended',
    letter: { from: 'isel', lines: ['There is no one left to write to, Master.', 'I read her letters anyway. Someone should.'] },
    lobby: 'The world is gone, and Priasis’s letters are all that is left of it in this room.',
  },
  {
    id: 'saved',
    after: 90,
    when: 'saved',
    letter: { from: 'isel', lines: ['The world is still there, Master. Somewhere in it is a grave with her name on it.', 'I would like to think someone brings flowers.'] },
    lobby: 'Taonier is still breathing. Priasis held a gate for that. So did you.',
  },
  // Lane O: past the summit, by the world's fate.
  {
    id: 'summit_ended',
    after: 100,
    when: 'ended',
    lobby: 'Tell is gone, and so is the world. Her pen is still on the floor up there, Master.',
  },
  {
    id: 'summit_saved',
    after: 100,
    when: 'saved',
    lobby: 'The summit is yours, and the world is still there. I sent Priasis’s people the names. All of them.',
  },
]

// ── The F90 Herald ──────────────────────────────────────────────────────────

/**
 * The ninetieth floor's choice, framed. The mechanics (clear it and the world ends; know
 * enough truths and Subvert strips the Herald's aegis and spares the world) are the
 * tower's; these are the words around them. Lane O builds the consequences, the epilogue
 * and the credits on top (see the lane M notes for the hooks).
 */
export const HERALD = {
  /** The Herald's word to the Master before the choice. */
  herald: 'Clear me, and your world ends. That is not a threat, Master. It is the rules.',
  /** What clearing means. */
  clear: 'Clear it: the floor is yours, and everyone on the world below dies.',
  /** What refusing means, when the Master knows enough. */
  subvert: 'Subvert: refuse the win condition. The Herald loses its aegis, and the world lives.',
  /** When the Master does not know enough truths. */
  unknowing: 'Without the truths, there is only one way through this floor.',
  /** After the choice. */
  ended: 'The world beneath the tower is gone. Isel closes the ledger of the living.',
  saved: 'You refused. The Herald falls, and the world below goes on breathing.',
} as const

// ── Lane O · the endgame ────────────────────────────────────────────────────

/**
 * The floors behind the Wall (F81–89, lane O's `endgame/wall.ts`), briefed like anchors:
 * the same shape as ANCHOR_STORY. F85 is an anchor and lives there.
 */
export const POST_WALL_STORY: Record<number, AnchorStory> = {
  81: {
    title: 'The Breach Road',
    who: 'Fragment shards pouring back through the hole you made.',
    why: 'The breach is closing behind you. Cross before it seals.',
    isel: 'Do not stop to fight what you can outrun, Master.',
    opening: { speaker: 'isel', line: 'Run. The Wall is healing itself behind you.' },
    aftermath: 'Through. The breach seals behind the last of you.',
  },
  82: {
    title: 'The Shard Archive',
    who: 'The archive’s keeper, and the fragments that file its memories.',
    why: 'The keeper holds a shard of the world’s record. Take it from them.',
    isel: 'Every world that fell here left a page, Master. Ours is somewhere on these shelves.',
    opening: { speaker: 'narrator', line: 'The archive hums with a hundred million worlds, filed and forgotten.' },
    aftermath: 'The shard is yours. In it, a sky with two suns.',
  },
  83: {
    title: 'The Hollow Garrison',
    who: 'Two watches of the Fragment Series, in a garrison with no one to guard.',
    why: 'Hold the hall until the bell. They will not stop coming.',
    isel: 'Nobody built this garrison, Master. It grew. Hold it anyway.',
    aftermath: 'The bell rings in an empty hall. The garrison forgets you were here.',
  },
  84: {
    title: 'The Wardens’ Vigil',
    who: 'The vigil’s captain, behind a guard of its own.',
    why: 'Break the guard, then the captain. The vigil watches the stair to ninety.',
    isel: 'They are not guarding the stair from you, Master. They are guarding it for something.',
    aftermath: 'The vigil ends. The stair beyond it climbs toward ninety.',
  },
  86: {
    title: 'Taonier’s Last Banner',
    who: 'The Al Ragna standard, left on the field by the Wall’s last defenders.',
    why: 'Keep the banner standing. If it falls, the Fragments take it.',
    isel: 'Pryos’s people planted that, Master. Priasis’s people. Do not let them take it.',
    opening: { speaker: 'narrator', line: 'A golden banner still stands in the ruin, its bearers long gone.' },
    aftermath: 'The banner stands. Someone will carry it home, if there is still a home.',
  },
  87: {
    title: 'The Echoing Hall',
    who: 'The Fragment Series in three waves, each an echo of the last.',
    why: 'Hold through all three. The hall remembers every party that died in it.',
    isel: 'Do not answer if it calls you by name, Master.',
    aftermath: 'Three echoes, three silences. The hall is quiet now.',
  },
  88: {
    title: 'The Door of Ninety',
    who: 'The last of the Fragment Series, in two waves before the door.',
    why: 'Clear the door. On the other side, the Herald is waiting.',
    isel: 'One more floor, Master, and then I have to tell you something.',
    aftermath: 'The door stands open. Beyond it, one floor, and then the end.',
  },
  89: {
    title: 'The Antechamber',
    who: 'Fragments in the antechamber of the ninetieth floor.',
    why: 'The last floor before the end. Lose no one, and the tower tells you its last truth.',
    isel: 'Bring them all through this one, Master. All of them.',
    aftermath: 'The antechamber is empty. The ninetieth floor is above you.',
  },
}

/** Act VIII's card again, once the world's fate is sealed (on the first floor past ninety). */
export const ACT_STORY_AFTER: Record<'ended' | 'saved', ActStory> = {
  ended: {
    name: 'The Unfinished Floors',
    epigraph: 'The world beneath the tower is gone. The floors above it were never finished.',
    isel: 'There is no one left below to save, Master. Climb for the ones who climbed with you.',
  },
  saved: {
    name: 'The Unfinished Floors',
    epigraph: 'The world below still breathes. Above it, floors that no one finished.',
    isel: 'They will never know what you refused for them, Master. I will.',
  },
}

/** One still of the epilogue: an act's backdrop and a line over it. */
export interface EpilogueStill {
  /** The act whose backdrop it stands on (an ACTS id). */
  id: string
  line: string
}

/**
 * The epilogue after the F90 decision (lane O's `ui/ending`): stills over the acts'
 * backdrops, Isel's last word, then the credits that list the fallen.
 */
export const EPILOGUE: Record<'ended' | 'saved', { title: string; stills: readonly EpilogueStill[]; isel: string }> = {
  ended: {
    title: 'The World’s End',
    stills: [
      { id: 'prairie', line: 'It began on grass, with goblins, and a hero who was someone else last week.' },
      { id: 'ruins', line: 'A princess was carried out of a burning city. A dragon fell from a roof.' },
      { id: 'order', line: 'A war turned in a circle until someone broke the gate. Priasis held it open.' },
      { id: 'wall', line: 'The Wall took what it always takes. The ones who came through did not come through whole.' },
      { id: 'void', line: 'On the ninetieth floor the Master cleared the floor, and the world beneath it ended.' },
    ],
    isel: 'I closed the ledger of the living today, Master. I kept the other one open. Read it with me.',
  },
  saved: {
    title: 'The World Spared',
    stills: [
      { id: 'prairie', line: 'It began on grass, with goblins, and a hero who was someone else last week.' },
      { id: 'ruins', line: 'A princess was carried out of a burning city. A dragon fell from a roof.' },
      { id: 'order', line: 'A war turned in a circle until someone broke the gate. Priasis held it open.' },
      { id: 'wall', line: 'The Wall took what it always takes. The ones who came through did not come through whole.' },
      { id: 'void', line: 'On the ninetieth floor the Master refused. The Herald fell, and the world went on breathing.' },
    ],
    isel: 'They will never know your name down there, Master. I wrote it in the ledger anyway, beside theirs.',
  },
}
