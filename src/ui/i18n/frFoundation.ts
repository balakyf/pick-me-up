/**
 * French for the Foundation UI lane: toasts, the summon gate, the Echo Trial, the battle's
 * two-step retreat and trial banner, the Tower's disabled-Enter line, facility labels,
 * picker tags and the strings newly wrapped in t(). Keys are the English source strings
 * exactly as passed to `t()` / `ta()` / `tn()`; placeholders must match.
 */
export const FR_FOUNDATION: Record<string, string> = {
  // ── App shell, windows, toasts ─────────────────────────────────────────────
  'Chiptune sound effects and music': 'Effets sonores et musique chiptune',
  'Language / Langue': 'Langue / Language',
  Close: 'Fermer',
  Dismiss: 'Masquer',
  'Daily login reward': 'Récompense de connexion du jour',
  'Daily reward: {loot}': 'Récompense du jour : {loot}',
  'Daily reward: {loot} · {n}-day streak': 'Récompense du jour : {loot} · série de {n} jours',
  'Monthly Package: {loot}': 'Forfait mensuel : {loot}',
  'Purchased: {loot}': 'Achat : {loot}',
  'A banquet in the Kitchen. Nobody needed it, but nobody complained.':
    'Un banquet à la Cuisine. Personne n’en avait besoin, mais personne ne s’est plaint.',
  'A banquet! 1 hero eats well: up to +{s} Sanity.': 'Un banquet ! 1 héros mange bien : jusqu’à +{s} de Santé mentale.',
  'A banquet! {n} heroes eat well: up to +{s} Sanity.': 'Un banquet ! {n} héros mangent bien : jusqu’à +{s} de Santé mentale.',
  '{name} takes the job: {job}.': '{name} prend le poste : {job}.',
  '{name} has no job now.': '{name} n’a plus de poste.',
  '{name} equips {item}.': '{name} s’équipe : {item}.',
  'an item': 'un objet',
  '{name} accepts the {gift}.': '{name} accepte le cadeau : {gift}.',
  '{name} accepts the {gift}: +{n} favor.': '{name} accepte le cadeau : {gift} (+{n} d’affinité).',
  '{name} enters the Promotion Chamber.': '{name} entre dans la Chambre de promotion.',
  '{name} rises to {n}★!': '{name} passe à {n}★ !',
  '{name} starts a drill: {skill}.': '{name} commence un exercice : {skill}.',
  '{name} finished a drill: {skill}.': '{name} a terminé un exercice : {skill}.',
  'Party set: 1 hero.': 'Équipe formée : 1 héros.',
  'Party set: {n} heroes.': 'Équipe formée : {n} héros.',
  'Work begins on the {place}.': 'Les travaux commencent : {place}.',
  'The {place} is being upgraded to Lv {n}.': 'Amélioration en cours : {place} → Niv. {n}.',
  'The {place} is now Lv {n}.': '{place} : désormais Niv. {n}.',
  'The {place} is built!': '{place} : construction terminée !',
  'The {place} reached Lv {n}.': '{place} atteint le Niv. {n}.',

  // ── Heroes in pickers, classes ─────────────────────────────────────────────
  '{star}★ Lv{level}': '{star}★ Niv.{level}',
  Untrained: 'Sans formation',
  '{cls} · by trade: {trade}': '{cls} · métier d’origine : {trade}',

  // ── Summon ─────────────────────────────────────────────────────────────────
  'A ten-pull costs {gold} Gold.': 'Une invocation ×10 coûte {gold} or.',
  'A ten-pull costs {n} gems.': 'Une invocation ×10 coûte {n} gemmes.',
  'A ten-pull needs a full crystal (10 charge); it holds {n}.': 'Une invocation ×10 exige un cristal plein (10 charges) ; il en contient {n}.',
  'The crystal is spent: charge {n}/{m}. It recharges +{k} each world-day.':
    'Le cristal est épuisé : charge {n}/{m}. Il se recharge de +{k} chaque jour du monde.',

  // ── Battle ─────────────────────────────────────────────────────────────────
  'Sound the retreat?': 'Sonner la retraite ?',
  'Click Retreat or press R again to sound it (Esc to cancel)': 'Cliquez sur Retraite ou appuyez de nouveau sur R pour la sonner (Échap pour annuler)',
  'TRIAL CLEARED': 'ÉPREUVE RÉUSSIE',
  'TRIAL ENDED': 'ÉPREUVE TERMINÉE',
  'Nobody dies here.': 'Ici, personne ne meurt.',
  '{name} is out of the trial.': '{name} quitte l’épreuve.',
  'The trial ends. Nobody dies here.': 'L’épreuve s’achève. Ici, personne ne meurt.',

  // ── The Echo Trial (the weekly trial, renamed) ─────────────────────────────
  'Echo Trial': 'Épreuve des échos',
  'Echo Trial: {rule}': 'Épreuve des échos : {rule}',
  'The Echo Trial · weekly': 'L’Épreuve des échos · hebdomadaire',
  'Open the Echo Trial': 'Ouvrir l’Épreuve des échos',
  'Enter the echo': 'Entrer dans l’écho',
  '1 attempt left': '1 tentative restante',
  'The echoes only answer heroes of 3★ or less. Old hands, prove your recruits.':
    'Les échos ne répondent qu’aux héros de 3★ ou moins. Vieux briscards, montrez ce que valent vos recrues.',
  'The echoes swallow spells. Blades, bows and fists only.': 'Les échos avalent les sorts. Lames, arcs et poings seulement.',
  'Two heroes, back to back, against everything the echoes send.': 'Deux héros, dos à dos, contre tout ce qu’envoient les échos.',
  'The tower replays its echoes for Masters past F{n}.': 'La tour rejoue ses échos pour les Maîtres au-delà de l’É{n}.',
  'It was only an echo: everyone walks back out unharmed.': 'Ce n’était qu’un écho : tout le monde en ressort indemne.',
  '· 1 chest waiting': '· 1 coffre en attente',

  // ── Tower ──────────────────────────────────────────────────────────────────
  'before you try F{n} again': 'avant de retenter l’É{n}',
  'An event floor is waiting above: choose one of its options first.': 'Un étage d’événement attend plus haut : choisissez d’abord l’une de ses options.',
  'No one in your party can fight right now. Set the Party Board (heroes in training or broken down sit out).':
    'Personne dans votre équipe ne peut combattre pour l’instant. Réglez le Tableau d’équipe (les héros à l’entraînement ou brisés restent en retrait).',
  'Go to the event ↑': 'Aller à l’événement ↑',

  // ── Facilities ─────────────────────────────────────────────────────────────
  '🔨 Build · {gold} ◆': '🔨 Construire · {gold} ◆',
  '⬆ Upgrade · {gold} ◆': '⬆ Améliorer · {gold} ◆',
  'Permanently destroy 1 hero': 'Détruire définitivement 1 héros',
  'Permanently destroy {n} heroes': 'Détruire définitivement {n} héros',
  'Forge · grade {grade} · ◆ {gold} + 1 stone': 'Forge · rang {grade} · ◆ {gold} + 1 pierre',
  'Forge · grade {grade} · ◆ {gold} + {n} stones': 'Forge · rang {grade} · ◆ {gold} + {n} pierres',
  'Forge a {item}': 'Forger : {item}',
  'Forged & free ({n})': 'Forgés et libres ({n})',

  // ── PvP ────────────────────────────────────────────────────────────────────
  'down — raiders can come': 'tombé — les pillards peuvent venir',
  'While you are away, this roster defends the lobby. Below Lv{n} a fallen defender is scarred; at Lv{n}+ they can be carried off.':
    'Pendant votre absence, cette équipe défend la salle d’attente. Sous le Niv.{n}, un défenseur vaincu garde une cicatrice ; à partir du Niv.{n}, il peut être enlevé.',

  // ── Isel's letter ──────────────────────────────────────────────────────────
  '{line} (×{n})': '{line} (×{n})',
}
