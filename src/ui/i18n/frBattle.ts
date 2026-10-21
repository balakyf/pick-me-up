/**
 * French strings for battle feel and agency (WP2, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_BATTLE: Record<string, string> = {
  // ── The Decisive Moment (S16, S5) ──────────────────────────────────────────
  'Decisive moment': 'Instant décisif',
  '{name} is about to fall!': '{name} va tomber !',
  'A heavy blow is coming for {name}!': 'Un coup terrible menace {name} !',
  '1 order left': '1 ordre restant',
  '{n} orders left': '{n} ordres restants',
  'Time stands still. Your order, Master?': 'Le temps s’arrête. Vos ordres, Maître ?',
  'Protect {name}': 'Protéger {name}',
  'Spends an order: foes avoid them while anyone else stands': 'Coûte un ordre : les ennemis l’épargnent tant qu’un autre tient debout',
  'Pull {name} back': 'Replier {name}',
  'No order spent: they sit out a few turns behind the line': 'Sans ordre : quelques tours en retrait, sans combattre',
  '{name} comes home shaken: −{n} Sanity': '{name} rentre sous le choc : −{n} de Santé mentale',
  '{name} falls in their place': '{name} tombe à sa place',
  '{n} others fall in their place': '{n} autres tombent à sa place',
  'The floor is lost': 'L’étage est perdu',
  '{name} falls': '{name} tombe',
  'Let fate decide': 'Laisser faire le destin',
  'No orders left this battle.': 'Plus d’ordres pour ce combat.',
  'No orders left this battle: only Retreat can change this.': 'Plus d’ordres pour ce combat : seule la retraite peut changer cela.',
  'The Master: “Fall back, {name}!”': 'Le Maître : « Repliez-vous, {name} ! »',
  'Saved!': 'Sauvetage !',
  'The order could not reach the field.': 'L’ordre n’a pas pu atteindre le champ de bataille.',

  // ── Orders dock, intents, pacing (S16, S17, S6, S8) ────────────────────────
  'Tap a hero to Protect · tap a foe to Focus': 'Touchez un héros pour le protéger · un ennemi pour le focaliser',
  HEAVY: 'LOURD',
  '{n} HITS!': '{n} COUPS !',
  OVERTIME: 'PROLONGATION',
  'Sweep highlights': 'Balayage : temps forts',
  'Watch full replay ▸': 'Revoir tout le combat ▸',
  'Battle effects': 'Effets de combat',
  'Screen shake': 'Tremblement de l’écran',
  'Reduce motion': 'Réduire les animations',
  off: 'coupé',

  // ── Isel on commentary (S17) ───────────────────────────────────────────────
  'A clean critical! They remember the drills.': 'Un critique net ! L’entraînement a payé.',
  'Oh, that one landed. Well struck!': 'Oh, celui-là a porté. Bien frappé !',
  'There — right where it hurts.': 'Là — exactement où ça fait mal.',
  'Master… one left standing. Choose carefully.': 'Maître… il ne reste qu’un héros debout. Choisissez bien.',
  'The line is breaking. Pull them out, or trust them?': 'La ligne cède. Les rappeler, ou leur faire confiance ?',
  'Careful. I would rather not carve another name.': 'Prudence. Je préférerais ne pas graver un autre nom.',
  '{name}… I will light a lamp at the Memorial.': '{name}… J’allumerai une lampe au Mémorial.',
  'We lost {name}. The waiting room will feel it.': 'Nous avons perdu {name}. La salle d’attente le ressentira.',
  'Rest now, {name}. You were brave.': 'Repose en paix, {name}. Quel courage.',
  'Saved! Your orders changed fate.': 'Sauvetage réussi ! Vos ordres ont changé le destin.',
  'You pulled {name} back from the edge.': 'Vous avez arraché {name} au gouffre.',
  '{name} lives — because you chose.': '{name} vit — parce que vous avez choisi.',
  'Flawless. Everyone comes home tonight.': 'Sans faute. Tout le monde rentre ce soir.',
  'Not a single scratch worth mourning. Well led.': 'Pas une égratignure à pleurer. Bien mené.',
  'All of them, safe. That is how it should be.': 'Tout le monde est sain et sauf. C’est ainsi que ça doit être.',
}
