/**
 * French strings for the shell: focus, unlocks and clarity (WP7, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_SHELL: Record<string, string> = {
  // ── Menu: the progressive campus ──────────────────────────────────────────
  Now: 'Maintenant',
  Campus: 'Campus',
  'Next unlock': 'Prochaine ouverture',
  Later: 'Plus tard',
  'Backup…': 'Sauvegarde…',
  'Export or import your save': 'Exporter ou importer votre sauvegarde',
  'Clear Floor {n}': 'Franchissez l’étage {n}',
  'Reach Master Lv {n}': 'Atteignez Maître Niv. {n}',
  'or when a hero falls': 'ou à la chute d’un héros',
  'or when a hero grieves': 'ou quand un héros porte le deuil',
  'or when a hero reaches the level cap': 'ou quand un héros atteint son niveau max',
  'or when the Crack opens': 'ou à l’ouverture de la Faille',
  'Preview · {reason}': 'Aperçu · {reason}',
  'Not open yet, Master, but look around all you like.': 'Pas encore ouvert, Maître, mais regardez tant que vous voulez.',

  // ── The unlock fanfare ────────────────────────────────────────────────────
  'New facility!': 'Nouveau bâtiment !',
  'A place to remember': 'Un lieu pour se souvenir',
  'Also open:': 'Ouvre aussi :',
  'Show me': 'Montre-moi',
  'A new place is open on campus, Master.': 'Un nouveau lieu ouvre sur le campus, Maître.',
  'The Kitchen is yours. A cook feeds everyone better, and a good meal mends frayed nerves.':
    'La Cuisine est à vous. Un cuisinier nourrit mieux tout le monde, et un bon repas apaise les nerfs à vif.',
  'The Memorial is open. Every hero who falls gets a grave there, and the living will visit.':
    'Le Mémorial est ouvert. Chaque héros tombé y a sa tombe, et les vivants viendront les voir.',
  'The Daily Dungeon has opened: a new rift every world-day, full of stones for promotions.':
    'Le Donjon quotidien s’est ouvert : une nouvelle faille chaque jour du monde, pleine de pierres de promotion.',
  'The Tactical Center is open. Sharpen your Focus and Overlook orders there.':
    'Le Centre tactique est ouvert. Affûtez-y vos ordres de focalisation et de surveillance.',
  'The Dormitory is open. Every hero with a bed of their own sleeps better.':
    'Le Dortoir est ouvert. Tout héros qui a son propre lit dort mieux.',
  'The Tavern is open. Heroes who drink together become friends… or rivals.':
    'La Taverne est ouverte. Les héros qui boivent ensemble deviennent amis… ou rivaux.',
  'The Training Center is open. Drills sharpen a hero’s skills while they wait.':
    'Le Centre d’entraînement est ouvert. Les exercices affûtent les compétences d’un héros pendant qu’il attend.',
  'The Garden is open. A gardener grows food for the Kitchen and a little gold.':
    'Le Jardin est ouvert. Un jardinier fait pousser de quoi nourrir la Cuisine, et un peu d’or.',
  'The Forge is lit. A smith turns stones and gold into weapons and armour.':
    'La Forge est allumée. Un forgeron change pierres et or en armes et armures.',
  'The Infirmary is open. A healer mends broken nerves and heavy grief faster.':
    'L’Infirmerie est ouverte. Un soigneur répare plus vite les nerfs brisés et les deuils lourds.',
  'The Market is open. Merchants sell the campus’s surplus to other worlds.':
    'Le Marché est ouvert. Les marchands vendent les surplus du campus à d’autres mondes.',
  'The Promotion Chamber is open. A hero at their cap can be raised a star higher.':
    'La Chambre de promotion est ouverte. Un héros au plafond peut y gagner une étoile.',
  'The Synthesis Chamber is open. Heroes go in… and something stronger comes out.':
    'La Chambre de synthèse est ouverte. Des héros y entrent… et quelque chose de plus fort en sort.',
  'My Gem Shop is open, Master. Look, do not touch… unless you want to.':
    'Ma Boutique de gemmes est ouverte, Maître. On regarde, on ne touche pas… sauf si vous le voulez.',
  'The Library is open. Scholars study the floors ahead and reveal their weaknesses.':
    'La Bibliothèque est ouverte. Les érudits étudient les étages à venir et révèlent leurs faiblesses.',
  'The Transfer Station is open. A skill can leave one hero and settle in another.':
    'La Station de transfert est ouverte. Une compétence peut quitter un héros pour s’installer chez un autre.',
  'The Watchtower is open. Guards there see invaders coming.':
    'La Tour de guet est ouverte. Les gardes y voient venir les envahisseurs.',
  'The Guild Hall is open. Other Masters, other wars. Choose your friends well.':
    'La Salle de guilde est ouverte. D’autres Maîtres, d’autres guerres. Choisissez bien vos amis.',
  'The Hall of Magic is open. It measures this world’s Probability Interference.':
    'La Salle de magie est ouverte. On y mesure l’Interférence probabiliste de ce monde.',
  'The Crack of Time has opened. Beyond it: the Ruins, and other Masters’ worlds.':
    'La Faille du Temps s’est ouverte. Au-delà : les Ruines, et les mondes d’autres Maîtres.',

  // ── The goal tracker ──────────────────────────────────────────────────────
  'Next up': 'À suivre',
  'Next goals': 'Prochains objectifs',
  'Summon now!': 'Invoquez !',
  'You can afford one hero': 'De quoi payer un héros',
  'You can afford {n} heroes': 'De quoi payer {n} héros',
  'Free summon!': 'Invocation offerte !',
  'The crystal owes you ten heroes': 'Le cristal vous doit dix héros',
  'Floor {n} · looks safe': 'Étage {n} · sans danger',
  'Floor {n} · a fair fight': 'Étage {n} · combat équilibré',
  'Floor {n} · risky': 'Étage {n} · risqué',
  'Floor {n} · deadly': 'Étage {n} · mortel',
  'Floor {n}: an event awaits': 'Étage {n} : un événement vous attend',
  'Floor {n}: choose your door': 'Étage {n} : choisissez votre porte',
  'The top of the tower': 'Le sommet de la tour',
  'Reward: a boss, then a bonus room': 'Récompense : un boss, puis une salle bonus',
  'Reward: double ◆ gold, stones and a boon': 'Récompense : ◆ or doublé, pierres et une faveur',
  'Reward: double ◆ gold and stones (boons full)': 'Récompense : ◆ or doublé et pierres (faveurs au complet)',
  'Reward: ◆ gold and Master XP': 'Récompense : ◆ or et XP de Maître',
  'Reward: ◆ gold': 'Récompense : ◆ or',
  'A rest: the party recovers Sanity': 'Une halte : le groupe récupère sa santé mentale',
  'A cache: ◆ gold and stones': 'Une cache : ◆ or et pierres',
  'Pent-up Interference: ◆ ×2 ({n} left)': 'Interférence accumulée : ◆ ×2 (encore {n})',
  '{name} waits here': '{name} attend ici',
  'Summon new heroes': 'Invoquez de nouveaux héros',
  'Every hero has fallen. The crystal can call more.': 'Tous les héros sont tombés. Le cristal peut en appeler d’autres.',
  'Set your party': 'Formez votre groupe',
  'Pick who climbs at the party board.': 'Choisissez qui grimpe, au tableau du groupe.',
  'Everyone in the party is busy right now.': 'Tout le groupe est occupé pour l’instant.',
  'Your party needs rest': 'Votre groupe a besoin de repos',
  'No one climbs at 0 Sanity. A meal in the Kitchen helps.': 'Personne ne grimpe à 0 de santé mentale. Un repas en Cuisine aide.',
  '{place} opens at Floor {n}': '{place} ouvre à l’étage {n}',
  '{place} opens at Master Lv {n}': '{place} ouvre à Maître Niv. {n}',
  'Also: {places}': 'Aussi : {places}',
  'Boss on the next floor': 'Boss à l’étage suivant',
  'Boss in {n} floors': 'Boss dans {n} étages',
  'Next summon': 'Prochaine invocation',
  'A new face answers the bell': 'Un nouveau visage répond à l’appel',
  '{bane} waits on floor {n}': '{bane} attend à l’étage {n}',
  'Leave the Tower?': 'Quitter la Tour ?',
  'Return to campus and bank +{purse}?': 'Rentrer au campus et mettre +{purse} en banque ?',
  'The Sortie ends: its Boons fade and the next climb starts a new streak.':
    'La sortie s’achève : ses faveurs s’effacent et la prochaine ascension repart de zéro.',
  'Bank it': 'Encaisser',
  Stay: 'Rester',
  'A free summon waits at the Memorial': 'Une invocation gratuite vous attend au Mémorial',
  '{name}’s echo waits for an heir': 'L’écho de {name} attend un héritier',
  'Choose who carries it, at the Memorial': 'Choisissez qui le portera, au Mémorial',
  '{name} is promoted in {time}': 'Promotion de {name} dans {time}',
  '{name}’s drill ends in {time}': 'L’exercice de {name} finit dans {time}',
  '{name} is back from the Ruins in {time}': '{name} revient des Ruines dans {time}',
  '{place} is built in {time}': '{place} est construit dans {time}',
  'Collection {n}/{max}': 'Collection {n}/{max}',
  '{name}: “Promote me!”': '{name} : « Promouvez-moi ! »',
  'At the level cap. The Promotion Chamber can raise them a star.':
    'Au niveau max. La Chambre de promotion peut lui donner une étoile.',
  '{name} is grieving: visit the Memorial': '{name} porte le deuil : passez au Mémorial',
  'Assign {name} to the {place}': 'Affectez {name} : {place}',
  'They would like the work.': 'Ce travail lui plairait.',

  // ── Isel ──────────────────────────────────────────────────────────────────
  'Clear Floor {n} and I will open the {place} for you.': 'Franchissez l’étage {n} et je vous ouvrirai ce lieu : {place}.',
  'Your orders change fate. Try Protect.': 'Vos ordres changent le destin. Essayez Protéger.',
  'Two doors, Master. The plain one is the steady road. The skull door hides an elite: a harder fight, but double gold, stones and a boon.':
    'Deux portes, Maître. La simple est la voie sûre. Celle au crâne cache une élite : un combat plus dur, mais l’or doublé, des pierres et une faveur.',
}
