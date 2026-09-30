/**
 * French for the tower challenges: bond groups, side rooms, raids, the weekly Crack of
 * Time trial and the tower's look. Keys are the English source strings exactly as passed
 * to `t()`; `{name}` placeholders survive translation.
 */
export const FR_CHALLENGE: Record<string, string> = {
  // ── Bonds ──────────────────────────────────────────────────────────────────
  'the Twin {noun}': 'les {noun} jumelles',
  'the {adj} {noun}': '{noun} {adj}',
  'Summoned together ({n}). Fighting side by side: +{a}% per extra member, +{full}% as a full set.':
    'Invoqués ensemble ({n}). Côte à côte : +{a} % par membre en plus, +{full} % au complet.',
  'Summoned together. They fight better side by side — and grieve harder.':
    'Invoqués ensemble. Ils se battent mieux côte à côte — et pleurent plus fort leurs morts.',
  Bond: 'Lien',

  // ── Side rooms ─────────────────────────────────────────────────────────────
  'Treasure Vault': 'Chambre au trésor',
  'Cursed Shrine': 'Autel maudit',
  'Lost Hero': 'Héros égaré',
  'Wandering Merchant': 'Marchand errant',
  'Training Grounds': 'Terrain d’entraînement',
  Mimic: 'Mimique',
  'A side door': 'Une porte dérobée',
  'found after F{n} · optional': 'trouvée après l’É{n} · facultative',
  'A vault the tower forgot: {g} gold and {s} Promotion Stones.':
    'Une chambre forte oubliée par la tour : {g} or et {s} pierres de promotion.',
  'Every fit hero in your party pays {s} Sanity. On the next floor you attempt, they fight at +{p}% stats.':
    'Chaque héros apte de l’équipe paie {s} de Santé mentale. Au prochain étage tenté, ils combattent à +{p} % de stats.',
  'A lone hero from a party that never came back. They will join you (a free Normal-pool hero).':
    'Un héros seul, rescapé d’une équipe jamais revenue. Il vous rejoint (un héros Normal gratuit).',
  'A merchant who climbs the tower selling to Masters. Each ware once, for gold.':
    'Un marchand qui gravit la tour pour vendre aux Maîtres. Chaque article une fois, contre de l’or.',
  'An old drill yard. Every fit hero in your party earns {xp} XP.':
    'Une vieille cour d’exercice. Chaque héros apte de l’équipe gagne {xp} XP.',
  'A chest that breathes. Fight it for gold, stones and gear — it is still the tower: the fallen stay fallen.':
    'Un coffre qui respire. Combattez-le pour de l’or, des pierres et de l’équipement — c’est toujours la tour : les morts restent morts.',
  'Take it': 'Prendre',
  Accept: 'Accepter',
  'Fight ⚔': 'Combattre ⚔',
  '{grade}-grade weapon': 'Arme de rang {grade}',
  '{grade}-grade armor': 'Armure de rang {grade}',
  '{grade}-grade accessory': 'Accessoire de rang {grade}',
  'Party Sanity {n}': 'Santé mentale de l’équipe {n}',
  '+{n} XP to the party': '+{n} XP pour l’équipe',
  '{n} fell to the Mimic.': '{n} sont tombés face à la Mimique.',
  'Watch the fight': 'Revoir le combat',
  'The side door closes behind you.': 'La porte dérobée se referme derrière vous.',
  'A vault the tower forgot. Coins and stones, still warm.': 'Une chambre forte oubliée. Des pièces et des pierres, encore tièdes.',
  'The shrine drinks their nerve. On the next floor, they fight like something else.':
    'L’autel boit leur courage. Au prochain étage, ils se battront comme autre chose.',
  'A hero from a party that never came back. They ask to join yours.': 'Un héros d’une équipe jamais revenue. Il demande à rejoindre la vôtre.',
  'An old drill yard, its dummies still standing. The party trains until dusk.':
    'Une vieille cour d’exercice, ses mannequins encore debout. L’équipe s’entraîne jusqu’au crépuscule.',
  'The merchant wraps it in oilcloth. "Anything else?"': 'Le marchand l’emballe dans une toile cirée. « Autre chose ? »',
  'The chest had teeth. Inside the teeth: treasure.': 'Le coffre avait des dents. Derrière les dents : un trésor.',
  'The chest snaps shut and scuttles off into the dark.': 'Le coffre claque et détale dans le noir.',
  '🪨 Stones': '🪨 Pierres',
  '📄 Page of Reverse Heaven': '📄 Page du Ciel inversé',
  '{el} Attribute Stone': 'Pierre d’attribut {el}',

  // ── Raids ──────────────────────────────────────────────────────────────────
  Raids: 'Raids',
  '(clear F{n})': '(terminer l’É{n})',
  '· {n} chests waiting': '· {n} coffres en attente',
  '· chests taken this week': '· coffres pris cette semaine',
  'Clear F{n} to open its raid.': 'Terminez l’É{n} pour ouvrir son raid.',
  'HP pool {hp} — shared by every party. Its scales shrug off {p}% of every blow until the ballista breaks them.':
    'Réserve de PV {hp} — partagée par toutes les équipes. Ses écailles absorbent {p} % de chaque coup jusqu’à ce que la baliste les brise.',
  "This week's chest waits: gems, stones, rank material — and maybe a page of the Book of Reverse Heaven.":
    'Le coffre de la semaine attend : gemmes, pierres, matériau de rang — et peut-être une page du Livre du Ciel inversé.',
  "This week's chest is already taken. The raid still teaches (XP), but pays nothing more until next week.":
    'Le coffre de la semaine est déjà pris. Le raid enseigne toujours (XP), mais ne paie plus rien avant la semaine prochaine.',
  'Permadeath. Parties fight one after another; a party falls back after {n} ticks, but whoever falls in the raid is gone for good.':
    'Mort définitive. Les équipes combattent l’une après l’autre ; une équipe se replie après {n} tours, mais qui tombe pendant le raid est perdu à jamais.',
  'Party {n}': 'Équipe {n}',
  'Ballista crew': 'Servants de la baliste',
  'pick heroes below': 'choisissez des héros ci-dessous',
  empty: 'vide',
  Clear: 'Vider',
  Back: 'Retour',
  'The scales stay broken for {n} ticks at the start of each party’s fight':
    'Les écailles restent brisées {n} tours au début du combat de chaque équipe',
  "the Goddess' altar is held": 'l’autel de la Déesse est tenu',
  'ballista skill {p}%': 'adresse à la baliste {p} %',
  'Auto-fill': 'Remplir',
  'Raid (auto-aim)': 'Raid (visée auto)',
  'The crew fires at the Master’s tracked skill.': 'Les servants tirent selon l’adresse du Maître.',
  'Aim the ballista & raid': 'Viser à la baliste et lancer le raid',
  'Loose the bolt as the sight crosses the heart. A true shot breaks the scales for longer.':
    'Lâchez le carreau quand le viseur croise le cœur. Un tir juste brise les écailles plus longtemps.',
  'RAID CLEARED': 'RAID RÉUSSI',
  'THE BOSS STANDS': 'LE BOSS TIENT BON',
  'HP pool {hp}': 'Réserve de PV {hp}',
  'scales broken {n} ticks a party': 'écailles brisées {n} tours par équipe',
  'Watch this battle': 'Revoir ce combat',
  'all came home': 'tous sont revenus',
  "This week's chest was already taken.": 'Le coffre de la semaine était déjà pris.',
  '+{n} XP to every survivor': '+{n} XP pour chaque survivant',
  'Five pages bind themselves into a Book of Reverse Heaven!': 'Cinq pages se relient en un Livre du Ciel inversé !',
  '{n} heroes did not come back from the raid.': '{n} héros ne sont pas revenus du raid.',
  'Back to the raid table': 'Retour à la table des raids',
  'No raid waits on that floor.': 'Aucun raid n’attend à cet étage.',
  'Send at least one party.': 'Envoyez au moins une équipe.',
  'At most 3 parties.': 'Trois équipes au plus.',
  'A party holds at most 5 heroes.': 'Une équipe compte cinq héros au plus.',
  'The ballista takes at most 3 crew.': 'La baliste accepte trois servants au plus.',
  'A hero can only be in one place.': 'Un héros ne peut être qu’à un seul endroit.',
  'Everyone sent must be fit to fight.': 'Tous ceux qu’on envoie doivent être aptes au combat.',

  // ── The weekly trial ───────────────────────────────────────────────────────
  'Weekly trial': 'Épreuve hebdomadaire',
  'Crack of Time · weekly trial': 'Faille du Temps · épreuve hebdomadaire',
  'Weekly trial: {rule}': 'Épreuve hebdomadaire : {rule}',
  '{n} attempts left': '{n} tentatives restantes',
  'Open the weekly trial': 'Ouvrir l’épreuve hebdomadaire',
  '3★ and below': '3★ et moins',
  '{el} heroes only': 'Héros {el} uniquement',
  'Two heroes': 'Deux héros',
  'Enemies ×{m} HP': 'Ennemis ×{m} PV',
  'No mages': 'Pas de mages',
  'The Crack only lets through heroes of 3★ or less. Old hands, prove your recruits.':
    'La Faille ne laisse passer que les héros de 3★ ou moins. Vieux briscards, montrez vos recrues.',
  'Only heroes of one element may enter. The rest of the roster watches.':
    'Seuls les héros d’un élément peuvent entrer. Le reste de l’effectif regarde.',
  'Two heroes, back to back, against everything the Crack sends.': 'Deux héros, dos à dos, contre tout ce qu’envoie la Faille.',
  'The echoes come back thicker than they were. Every enemy has half again its HP.':
    'Les échos reviennent plus épais qu’avant. Chaque ennemi a moitié plus de PV.',
  'The Crack swallows spells. Blades, bows and fists only.': 'La Faille avale les sorts. Lames, arcs et poings seulement.',
  'The Crack replays its trials for Masters past F{n}.': 'La Faille rejoue ses épreuves pour les Maîtres au-delà de l’É{n}.',
  '{n} waves': '{n} vagues',
  'A new best this week!': 'Nouveau record cette semaine !',
  'Best this week: {n} waves': 'Record de la semaine : {n} vagues',
  'No new threshold reached this time.': 'Aucun nouveau palier atteint cette fois.',
  'It was only an echo: everyone walks back out of the Crack unharmed.':
    'Ce n’était qu’un écho : tout le monde ressort de la Faille indemne.',
  'Watch again': 'Revoir',
  'This week': 'Cette semaine',
  'A gauntlet of {n} escalating waves. Score = waves cleared.': 'Une épreuve de {n} vagues croissantes. Score = vagues vaincues.',
  'A simulation: no permadeath, no Sanity lost.': 'Une simulation : ni mort définitive, ni Santé mentale perdue.',
  'Attempts left': 'Tentatives restantes',
  Best: 'Record',
  'Your team': 'Votre équipe',
  'No hero of yours meets this week’s rule.': 'Aucun de vos héros ne remplit la règle de la semaine.',
  'Strongest team': 'Équipe la plus forte',
  'Enter the Crack': 'Entrer dans la Faille',
  'No attempts left this week.': 'Plus de tentatives cette semaine.',
  'Pick at least one hero.': 'Choisissez au moins un héros.',
  'This week allows 2 heroes.': 'Cette semaine n’autorise que 2 héros.',
  'A hero can only enter once.': 'Un héros ne peut entrer qu’une fois.',
  'Everyone must be alive and at home.': 'Tous doivent être vivants et présents.',
  "Someone doesn't meet this week's rule.": 'Quelqu’un ne remplit pas la règle de la semaine.',
  'The trial opens once F10 is cleared.': 'L’épreuve s’ouvre une fois l’É10 terminé.',

  // ── The tower's look ───────────────────────────────────────────────────────
  'Above the ninetieth floor, nothing lives.': 'Au-dessus du quatre-vingt-dixième étage, plus rien ne vit.',
  'The Wailing Wall splits the stone.': 'Le Mur des Lamentations fend la pierre.',
  'Cracks spread as the Wall draws near.': 'Les fissures s’étendent à l’approche du Mur.',
}

/** The generated bond-name words (looked up by BondBadge, not through t()). French nouns
 *  carry their article and adjectives read as a complement: "la Bande de la Rafale". */
export const FR_BOND_WORDS: Record<string, string> = {
  Twin: 'jumelles',
  Stars: 'Étoiles',
  Blades: 'Lames',
  Flames: 'Flammes',
  Moons: 'Lunes',
  Shadows: 'Ombres',
  Roses: 'Roses',
  Trio: 'le Trio',
  Triad: 'la Triade',
  Four: 'les Quatre',
  Wardens: 'les Gardiens',
  Band: 'la Bande',
  Company: 'la Compagnie',
  Brigade: 'la Brigade',
  Gale: 'de la Rafale',
  Storm: 'de l’Orage',
  Ember: 'de la Braise',
  Crimson: 'Pourpre',
  Tide: 'de la Marée',
  Frost: 'du Givre',
  Iron: 'de Fer',
  Thorn: 'de l’Épine',
  Dawn: 'de l’Aube',
  Golden: 'd’Or',
  Ashen: 'de Cendre',
  Moonless: 'Sans-Lune',
  Silver: 'd’Argent',
}
