/**
 * French strings for the climb engine (floor kinds, doors, boons, sorties) (WP3, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_CLIMB: Record<string, string> = {
  // ── Floor kinds (FLOOR_KIND_LABEL) and Doors (DOOR_LABEL, DOOR_BLURB) ──────────
  Tutorial: 'Initiation',
  Breather: 'Répit',
  Path: 'Sentier',
  Elite: 'Élite',
  'Rest stop': 'Halte',
  Cache: 'Cache',
  Boss: 'Boss',
  'Skull door': 'Porte au crâne',
  'A training floor.': 'Un étage d’entraînement.',
  'A fair fight. Standard rewards.': 'Un combat équilibré. Récompenses habituelles.',
  'A lighter fight to catch your breath.': 'Un combat plus léger pour reprendre son souffle.',
  'A much harder fight: double gold, a Promotion Stone and a Boon.':
    'Un combat bien plus rude : or doublé, une Pierre de promotion et une Faveur.',
  'The floor’s guardian.': 'Le gardien de l’étage.',
  'No fight. The party rests (+Sanity) and cooks a meal.': 'Pas de combat. Le groupe se repose (+Santé mentale) et cuisine un repas.',
  'No fight. A cache of gold and stones.': 'Pas de combat. Une cache d’or et de pierres.',

  // ── Door refusals (chooseDoor) ─────────────────────────────────────────────────
  'Resolve the event floor first.': 'Réglez d’abord l’étage événement.',
  'No doors are open on this floor.': 'Aucune porte n’est ouverte à cet étage.',
  'There is no such door.': 'Cette porte n’existe pas.',

  // ── Boons (BOONS) ──────────────────────────────────────────────────────────────
  'Iron Vow': 'Vœu de fer',
  'A Protected hero takes 20% less damage.': 'Un héros protégé subit 20 % de dégâts en moins.',
  'Hunter’s Mark': 'Marque du chasseur',
  'The Focus target takes 15% more damage.': 'La cible désignée subit 15 % de dégâts en plus.',
  'Second Wind': 'Second souffle',
  'The first hero to drop below 25% HP heals 30%, once a battle.':
    'Le premier héros qui passe sous 25 % de PV en récupère 30 %, une fois par combat.',
  Quartermaster: 'Intendant',
  '+1 order per battle.': '+1 ordre par combat.',
  'War Chest': 'Trésor de guerre',
  '+25% floor gold.': '+25 % d’or par étage.',
  'Scholar’s Lamp': 'Lampe du savant',
  '+25% floor XP.': '+25 % d’EXP par étage.',
  Shieldwall: 'Mur de boucliers',
  'Warriors get +10% physical and magic defence.': 'Les guerriers gagnent +10 % de défense physique et magique.',
  Volley: 'Volée',
  'Archers get +10% speed.': 'Les archers gagnent +10 % de vitesse.',
  'Arcane Tide': 'Marée arcanique',
  'Mages get +10% magic attack.': 'Les mages gagnent +10 % d’attaque magique.',
  Sanctuary: 'Sanctuaire',
  'Back-line heroes get +15% max HP.': 'Les héros de l’arrière-garde gagnent +15 % de PV max.',
  Underdog: 'Outsider',
  '1-2★ heroes get +12% to every stat.': 'Les héros 1-2★ gagnent +12 % à toutes leurs stats.',
  'Calm Mind': 'Esprit serein',
  'Floors drain 40% less Sanity.': 'Les étages drainent 40 % de Santé mentale en moins.',
  'The tower grants a boon for this sortie.': 'La tour accorde une faveur pour cette sortie.',

  // ── Battle notes (combat.ts) ───────────────────────────────────────────────────
  'The line breaks! The party retreats.': 'La ligne cède ! Le groupe bat en retraite.',
  'Second Wind!': 'Second souffle !',

  // ── Scout: why a named threat matters (THREAT_REASONS) ─────────────────────────
  'It remembers the hero it killed.': 'Il se souvient du héros qu’il a tué.',
  'Too strong to fight: finish before it wakes.': 'Trop fort pour être combattu : finissez avant son réveil.',
  'Heals itself with every blow.': 'Se soigne à chaque coup.',
  'Shrugs off the first hits.': 'Encaisse les premiers coups sans broncher.',
  'Grows far deadlier if the fight drags on.': 'Devient bien plus mortel si le combat s’éternise.',
  'Deadlier when wounded.': 'Plus mortel une fois blessé.',
  'Its first strike lands hard.': 'Son premier coup frappe fort.',
  'Untouchable while its guards stand.': 'Intouchable tant que ses gardes tiennent debout.',
  'Immune to physical blows.': 'Insensible aux coups physiques.',
  'Immune to magic.': 'Insensible à la magie.',
  'Hard to hurt with one kind of attack.': 'Difficile à blesser avec un type d’attaque.',
  'Armoured: takes less damage.': 'Cuirassé : subit moins de dégâts.',
  'Picks off your weakest hero.': 'S’en prend à votre héros le plus faible.',
  'Goes after your strongest hero.': 'Traque votre héros le plus fort.',
  'Strength in numbers.': 'La force du nombre.',
  'Hits the hardest on this floor.': 'Frappe le plus fort de l’étage.',
  'Keeps the pressure on your line.': 'Maintient la pression sur votre ligne.',
  'Very fast: acts far more often than its strength suggests.':
    'Très rapide : agit bien plus souvent que sa force ne le laisse croire.',
}
