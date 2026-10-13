/**
 * French strings for the Tower screen and rewards (WP4, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_TOWER: Record<string, string> = {
  // ── Event floors ───────────────────────────────────────────────────────────
  Boon: 'Faveur',

  // ── Floor kinds and Doors (S13) ────────────────────────────────────────────
  // The floor-kind names (Tutorial, Breather, Path, Elite, Cache, Boss) and 'A fair
  // fight. Standard rewards.' are the climb's own words: their French lives in WP3's
  // frClimb, and redefining them here would trip the duplicate-key guard at merge.
  Skull: 'Crâne',
  Stones: 'Pierres',
  XP: 'XP',
  'Choose the next door': 'Choisissez la prochaine porte',
  'Hits much harder. ×{m} gold, +{s} Promotion Stone and a Boon.':
    'Frappe bien plus fort. Or ×{m}, +{s} Pierre de promotion et une Faveur.',
  'An easy floor to catch your breath.': 'Un étage facile pour reprendre son souffle.',
  '+{n} Sanity for the party and a hot meal.': '+{n} de Santé mentale pour l’équipe et un repas chaud.',
  '{g} gold and +{s} Promotion Stone.': '{g} or et +{s} Pierre de promotion.',
  'The floor’s guardian waits.': 'Le gardien de l’étage attend.',
  'A gentle floor to learn the ropes.': 'Un étage tranquille pour apprendre les ficelles.',
  'No fight on this floor.': 'Pas de combat à cet étage.',
  'party ×{r}': 'équipe ×{r}',
  'No choice made? The party takes the {door}.': 'Pas de choix ? L’équipe prend la porte {door}.',
  'No door chosen: the party takes the first one.': 'Aucune porte choisie : l’équipe prend la première.',
  'The skull door hits much harder, but it pays double gold, a Promotion Stone and a Boon. Take it when your party feels strong.':
    'La porte au crâne frappe bien plus fort, mais elle paie le double d’or, une Pierre de promotion et une Faveur. Prenez-la quand votre équipe se sent forte.',
  'Got it': 'Compris',
  'The door opens.': 'La porte s’ouvre.',
  'The party rests.': 'L’équipe se repose.',
  'A cache, unguarded.': 'Une cachette, sans gardien.',
  '+{n} gold': '+{n} or',
  '+1 Promotion Stone': '+1 Pierre de promotion',
  '+{n} Promotion Stones': '+{n} Pierres de promotion',
  '+{n} Sanity': '+{n} de Santé mentale',
  '+1 meal': '+1 repas',
  '+{n} meals': '+{n} repas',

  // ── Scouting (S12) ─────────────────────────────────────────────────────────
  Safe: 'Sûr',
  'Fair fight': 'Combat équilibré',
  Risky: 'Risqué',
  Deadly: 'Mortel',
  '{name} waits here.': '{name} attend ici.',
  'Avenge the fallen for a reward.': 'Vengez les disparus et soyez récompensé.',
  'The party breaks after 1 falls.': 'L’équipe se débande après 1 perte.',
  'The party breaks after {n} fall.': 'L’équipe se débande après {n} pertes.',
  'Last Stand +{p}%: a thin roster fights harder.': 'Dernier rempart +{p} % : des rangs clairsemés se battent plus fort.',
  'The tower eases off: your roster is thin.': 'La tour relâche la pression : vos rangs sont clairsemés.',
  'Easy floors won with nobody lost play as a short highlight.':
    'Les étages faciles gagnés sans perte se jouent en un court résumé.',
  'Fight floor {n} ▸': 'Combattre l’étage {n} ▸',
  'Sweep easy floors: on': 'Balayer les étages faciles : oui',
  'Sweep easy floors: off': 'Balayer les étages faciles : non',

  // ── Boons (S14) ────────────────────────────────────────────────────────────
  'The tower rewards the bold. Choose one blessing; it lasts until the party returns to campus.':
    'La tour récompense l’audace. Choisissez une bénédiction ; elle dure jusqu’au retour de l’équipe au campus.',
  'Held this sortie ({n}/{max}):': 'Détenues pendant cette sortie ({n}/{max}) :',
  'You can hold up to {max} Boons in a sortie.': 'Vous pouvez détenir jusqu’à {max} Faveurs par sortie.',
  'Boon gained: {name}. It lasts this sortie.': 'Faveur obtenue : {name}. Elle dure toute la sortie.',
  'Choose a Boon ▸': 'Choisir une Faveur ▸',
  '✦ The tower offers a Boon before the next climb.': '✦ La tour offre une Faveur avant la prochaine ascension.',

  // ── Sorties (S15) ──────────────────────────────────────────────────────────
  Sortie: 'Sortie',
  '1 floor': '1 étage',
  '{n} floors': '{n} étages',
  'at risk': 'en jeu',
  'next clear +{p}% gold': 'prochaine victoire +{p} % d’or',
  'A rout or wipe keeps only {p}% of the purse.': 'Une débandade ou une défaite totale ne garde que {p} % de la bourse.',
  'Press on and the purse grows. A rout or wipe keeps only {p}% of it.':
    'Continuez et la bourse grossit. Une débandade ou une défaite totale n’en garde que {p} %.',
  'Leaving the tower banks it.': 'Quitter la tour l’encaisse.',
  'Return to campus (bank +{n})': 'Rentrer au campus (encaisser +{n})',
  'Purse banked: +{n} gold. The party is home.': 'Bourse encaissée : +{n} or. L’équipe est rentrée.',
  'Press on ▸': 'Continuer ▸',
  'Look around first': 'Jeter un œil d’abord',
  'Streak bonus: +{n} into the purse': 'Bonus de série : +{n} dans la bourse',
  '◆ {n} at risk': '◆ {n} en jeu',
  'Sortie over: {kept} of the ◆ {purse} purse was saved.': 'Sortie terminée : {kept} sur la bourse de ◆ {purse} ont été sauvés.',

  // ── Results: the reward cascade (S11) ──────────────────────────────────────
  ROUTED: 'DÉBANDADE',
  'the line broke, and the survivors fled home': 'la ligne a cédé, et les survivants ont fui',
  'Swept: an easy floor, nobody lost.': 'Balayé : un étage facile, personne de perdu.',
  'Watch full replay': 'Revoir tout le combat',
  'Skull door: ×{m} gold': 'Porte au crâne : or ×{m}',
  'Pent-up Interference: +{n} gold': 'Interférence accumulée : +{n} or',
  '{n} charges left': '{n} charges restantes',
  '1 charge left': '1 charge restante',
  'no charges left': 'plus aucune charge',
  'Revenge on {bane}: +{n} gold': 'Vengeance sur {bane} : +{n} or',
  'Materials won': 'Matériaux gagnés',
  '{element} stone': 'Pierre {element}',
  '{name} Lv {a}→{b}': '{name} Niv. {a}→{b}',
  '{name} grew stronger on the bench.': '{name} s’est renforcé sur le banc.',
  '{n} heroes on the bench grew stronger.': '{n} héros se sont renforcés sur le banc.',
  'Toward the next summon': 'Vers la prochaine invocation',
  'Summon now ▸': 'Invoquer ▸',
  '(banks the purse)': '(encaisse la bourse)',
  'Bank +{n} and summon ▸': 'Encaisser +{n} et invoquer ▸',
  'A summon is ready': 'Une invocation est prête',
  '{n} more gold': 'encore {n} or',
  'AVENGED!': 'VENGÉ !',
  '{bane} has fallen. {hero} can rest now.': '{bane} est tombé. {hero} peut reposer en paix.',
  '{bane} has fallen.': '{bane} est tombé.',
  'A Bane': 'Un Fléau',

  // ── "Next:" teaser ─────────────────────────────────────────────────────────
  ' or ': ' ou ',
  'Next: choose a Boon, then Floor {n}.': 'Ensuite : choisissez une Faveur, puis l’étage {n}.',
  'Next: an event floor, then Floor {n}.': 'Ensuite : un étage d’événement, puis l’étage {n}.',
  'Next: Floor {n}. Choose your door: {doors}.': 'Ensuite : étage {n}. Choisissez votre porte : {doors}.',
  'Next: Floor {n}, {mission}. A guardian floor.': 'Ensuite : étage {n}, {mission}. Un étage gardien.',
  'Next: Floor {n} · {kind}.': 'Ensuite : étage {n} · {kind}.',
  'The guardian floor is right after.': 'L’étage gardien vient juste après.',
  'Guardian floor in {n}.': 'Étage gardien dans {n}.',

  // ── "Because…" (S18) ───────────────────────────────────────────────────────
  'Because…': 'Parce que…',
  'MVP: {name} · {dmg} damage': 'MVP : {name} · {dmg} dégâts',
  'MVP: {name} · {dmg} damage · 1 kill': 'MVP : {name} · {dmg} dégâts · 1 victime',
  'MVP: {name} · {dmg} damage · {k} kills': 'MVP : {name} · {dmg} dégâts · {k} victimes',
  'Protect: {name} fell anyway, once the line around them broke.':
    'Protéger : {name} est tombé malgré tout, quand la ligne autour a cédé.',
  'Protect: no enemy touched {name} after your order.': 'Protéger : aucun ennemi n’a touché {name} après votre ordre.',
  'Protect: {name} took a single hit after your order and came home.':
    'Protéger : {name} n’a encaissé qu’un coup après votre ordre et est rentré.',
  'Protect: {name} took only {n} hits after your order and came home.':
    'Protéger : {name} n’a encaissé que {n} coups après votre ordre et est rentré.',
  'Focus: {name} held out against the whole party.': 'Cibler : {name} a tenu tête à toute l’équipe.',
  'Focus: {name} fell before it could act again.': 'Cibler : {name} est tombé avant de pouvoir agir à nouveau.',
  'Focus: {name} fell before casting a single skill.': 'Cibler : {name} est tombé avant de lancer la moindre compétence.',
  'Focus: the party brought {name} down.': 'Cibler : l’équipe a abattu {name}.',
  'Retreat: you called it, and 1 hero came home.': 'Retraite : vous l’avez ordonnée, et 1 héros est rentré.',
  'Retreat: you called it, and {n} heroes came home.': 'Retraite : vous l’avez ordonnée, et {n} héros sont rentrés.',
  'Skull door: ×{m} gold and +{n} stones.': 'Porte au crâne : or ×{m} et +{n} pierres.',
  'Skull door: ×{m} gold.': 'Porte au crâne : or ×{m}.',
  'Skull door: you chose the harder fight.': 'Porte au crâne : vous avez choisi le combat le plus rude.',
  'Breather: an easier floor after the boss.': 'Répit : un étage plus facile après le gardien.',
  'Rout: the line broke, and the party fled.': 'Débandade : la ligne a cédé, et l’équipe a fui.',
  'Rout: the party fled after 1 fell.': 'Débandade : l’équipe a fui après 1 perte.',
  'Rout: the party fled after {n} fell.': 'Débandade : l’équipe a fui après {n} pertes.',
  'Wiped out: no one broke ranks, and no one came home.': 'Anéantis : personne n’a rompu les rangs, et personne n’est rentré.',
  'Last Stand: +{p}% to every stat, because the roster is thin.':
    'Dernier rempart : +{p} % à toutes les stats, car les rangs sont clairsemés.',
  'Revenge: {bane} fell, and {hero} is avenged.': 'Vengeance : {bane} est tombé, et {hero} est vengé.',
  'Revenge: a Bane fell today.': 'Vengeance : un Fléau est tombé aujourd’hui.',
}
