/**
 * French strings for legacy (echoes, nemeses, the Memorial) (WP5, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_LEGACY: Record<string, string> = {
  // ── Memories & chronicle ───────────────────────────────────────────────────
  'Carries the echo of {name}': 'Porte l’écho de {name}',
  'Avenged {name}': 'A vengé {name}',
  '{a} now carries the echo of {b}.': '{a} porte désormais l’écho de {b}.',
  '{a} struck down {bane}. The fallen are avenged.': '{a} a abattu {bane}. Les morts sont vengés.',
  '{a} avenged a fallen friend.': '{a} a vengé un ami tombé.',
  '{a} struck down the {enemy} that killed {b}. {b} is avenged.': '{a} a abattu l’ennemi qui avait tué {b} ({enemy}). {b} est vengé.',

  // ── Engine refusals ────────────────────────────────────────────────────────
  'That echo has already been passed on.': 'Cet écho a déjà été transmis.',
  'Only the living can carry an echo.': 'Seuls les vivants peuvent porter un écho.',
  'A captive cannot take an echo.': 'Un captif ne peut pas recevoir d’écho.',
  'That hero already carries all the echoes they can.': 'Ce héros porte déjà autant d’échos qu’il le peut.',
  'That hero is not among the suggested heirs.': 'Ce héros ne fait pas partie des héritiers proposés.',
  'No one is waiting at the bell.': 'Personne n’attend à la cloche.',

  // ── The Echo and the heir ──────────────────────────────────────────────────
  'Pass on {name}’s resolve': 'Transmettre la volonté de {name}',
  'Echo of {name}': 'Écho de {name}',
  '+{pct}% {stat}': '+{pct} % {stat}',
  '{skill} +1 if known': '{skill} +1 s’il la connaît',
  '{skill} +1': '{skill} +1',
  'Choose an heir:': 'Choisissez un héritier :',
  'Choose an heir in the Memorial.': 'Choisissez un héritier au Mémorial.',
  'Pass the echo to {name}': 'Transmettre l’écho à {name}',
  '{stat} is this hero’s strength too': '{stat} est aussi la force de ce héros',
  '{n}/{max} echoes': '{n}/{max} échos',
  'No one can carry it yet. It will wait in the Memorial for a new face.':
    'Personne ne peut le porter pour l’instant. Il attendra un nouveau visage au Mémorial.',
  'An unclaimed echo waits in the Memorial. It never fades.': 'Un écho non transmis attend au Mémorial. Il ne s’efface jamais.',
  '{heir} now carries the echo of {fallen}.': '{heir} porte désormais l’écho de {fallen}.',
  'I carry {fallen} with me.': 'Je porte {fallen} avec moi.',
  'Closest friend': 'Ami le plus proche',
  'Their friend': 'Son ami',
  'Their old rival': 'Son vieux rival',
  'Fought beside them': 'A combattu à ses côtés',
  'A fellow hero': 'Un compagnon de la salle d’attente',
  'Passed on by {name}, who fell in the tower.': 'Transmis par {name}, tombé dans la tour.',

  // ── Results: what they leave behind ────────────────────────────────────────
  'What they leave behind': 'Ce qu’ils laissent derrière eux',
  'The {enemy} that struck {name} down is marked now: {bane}. It waits on floor {n}.':
    'L’ennemi qui a abattu {name} ({enemy}) est désormais marqué : {bane}. Il attend à l’étage {n}.',
  'The tower remembers: +{pct}% to every stat.': 'La tour se souvient : +{pct} % à toutes les stats.',
  'Also waiting for an heir: {names}. One at a time, or later in the Memorial.':
    'Attendent aussi un héritier : {names}. Un à la fois, ou plus tard au Mémorial.',

  // ── The bell (New Arrivals) ────────────────────────────────────────────────
  'A new face answers the bell.': 'Un nouveau visage répond à la cloche.',
  '{n} new faces wait at the bell.': '{n} nouveaux visages attendent à la cloche.',
  'A free summon, {star}★ or better.': 'Une invocation gratuite, {star}★ ou mieux.',
  'Open the door': 'Ouvrir la porte',
  '{name} answers the bell.': '{name} répond à la cloche.',
  'New faces at the bell': 'Nouveaux visages à la cloche',

  // ── Banes (Nemeses) ────────────────────────────────────────────────────────
  '{name}’s Bane': 'Le Fléau de {name}',
  Banes: 'Fléaux',
  '{enemy} · Lv{level}': '{enemy} · Niv.{level}',
  '{star}★ Lv{level}': '{star}★ Niv.{level}',
  'Struck {name} down on floor {floor}.': 'A abattu {name} à l’étage {floor}.',
  'waits on floor {n}': 'attend à l’étage {n}',
  'still at large in the tower': 'rôde toujours dans la tour',
  'Avenged at last': 'Enfin vengé',

  // ── The Memorial's plaques ─────────────────────────────────────────────────
  'Each hero who fell in the climb lends the living +{each}%, up to +{cap}%.':
    'Chaque héros tombé dans l’ascension prête +{each} % aux vivants, jusqu’à +{cap} %.',
  'No one is visiting.': 'Personne ne se recueille ici.',
  'The obelisk is full of names. Its strength can grow no further.': 'L’obélisque est couvert de noms. Sa force ne peut plus grandir.',
  'Echoes waiting for an heir': 'Échos en attente d’un héritier',
  'Echoes carried': 'Échos portés',
  'How they died': 'Sa mort',
  'struck down by the {enemy} (Lv{level})': 'tombé face à l’ennemi « {enemy} » (Niv.{level})',
  'What it taught': 'La leçon',
  'Their echo': 'Son écho',
  'carried by {name}': 'porté par {name}',
  'waiting for an heir': 'attend un héritier',
  '{family}: the scout now points out their weakness.': '{family} : l’éclaireur signale désormais leur faiblesse.',
  '{enemy} {el}: answer it with {counter}.': '{enemy} {el} : répondez-lui par {counter}.',
  Humanoids: 'Humanoïdes',
  Beasts: 'Bêtes',
  'The undead': 'Les morts-vivants',
  Dragons: 'Dragons',
  Constructs: 'Créatures artificielles',
  'Sea creatures': 'Créatures marines',
  Demons: 'Démons',
  Fragments: 'Fragments',

  // ── Speech: the echo, revenge, eulogies ────────────────────────────────────
  'I carry {fallen} with me. Every stair, every swing.': 'Je porte {fallen} avec moi. À chaque marche, à chaque coup.',
  'Sometimes my hands move the way {fallen}’s did. I let them.': 'Parfois mes mains bougent comme celles de {fallen}. Je les laisse faire.',
  '{fallen} would laugh at me for being this serious. So I laugh for them.':
    '{fallen} se moquerait de me voir si sérieux. Alors je ris à sa place.',
  'I bear {fallen}’s echo, Master. I intend to be worthy of it.': 'Je porte l’écho de {fallen}, Maître. J’entends m’en montrer digne.',
  '{fallen} paid for this strength. I will not waste it.': '{fallen} a payé cette force. Je ne la gaspillerai pas.',
  '…{fallen} is still here. Right here.': '…{fallen} est encore là. Juste ici.',
  'Got a bit of {fallen} in me now. Pity the next thing that tries me.':
    'J’ai un peu de {fallen} en moi, maintenant. Pitié pour le prochain qui me cherche.',
  'We found what took {fallen}. It will not take anyone else.': 'Nous avons trouvé ce qui a emporté {fallen}. Il n’emportera plus personne.',
  'I told {fallen} at the Memorial: it is done.': 'Je l’ai dit à {fallen}, au Mémorial : c’est fait.',
  '{fallen}, did you see that? We got it!': '{fallen}, tu as vu ça ? On l’a eu !',
  'Revenge does not bring {fallen} back. It helps. A little.': 'La vengeance ne ramène pas {fallen}. Mais ça aide. Un peu.',
  'That one was for {fallen}.': 'Celui-là, c’était pour {fallen}.',
  'It is over, {fallen}. Rest now.': 'C’est fini, {fallen}. Repose-toi.',
  'I will carry {fallen}’s name up every floor we climb.': 'Je porterai le nom de {fallen} à chaque étage que nous gravirons.',
  'Floor {floor} took {fallen}. It does not get to take what {fallen} taught us.':
    'L’étage {floor} a pris {fallen}. Il ne prendra pas ce que {fallen} nous a appris.',
  '{fallen} never backed down. Not once. Not even at the end.': '{fallen} n’a jamais reculé. Pas une fois. Pas même à la fin.',
  '{fallen} served with honour. Let the obelisk say so.': '{fallen} a servi avec honneur. Que l’obélisque en témoigne.',
  '{fallen} made the bad days lighter. I am going to try to do that now.':
    '{fallen} rendait les mauvais jours plus légers. Je vais essayer de faire pareil.',
  'I still set a place for {fallen}. I know. I know.': 'Je mets encore un couvert pour {fallen}. Je sais. Je sais.',
  'The tower took {fallen}. One day we will take something back.': 'La tour nous a pris {fallen}. Un jour, nous lui reprendrons quelque chose.',
}
