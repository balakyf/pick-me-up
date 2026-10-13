/**
 * French strings for the first pull and the Summon Theatre (WP1, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_SUMMON: Record<string, string> = {
  // ── Title: an unreadable save ─────────────────────────────────────────────
  'This save could not be read. A copy was kept.': 'Cette sauvegarde est illisible. Une copie a été conservée.',
  'This save could not be read, and no copy could be kept (the browser’s storage is full or blocked). Download it before starting over.':
    'Cette sauvegarde est illisible, et aucune copie n’a pu être conservée (le stockage du navigateur est plein ou bloqué). Téléchargez-la avant de recommencer.',
  'Download the unreadable save': 'Télécharger la sauvegarde illisible',
  'A new game permanently replaces the unreadable save.': 'Une nouvelle partie remplace définitivement la sauvegarde illisible.',
  'Keep it': 'La garder',
  'Start over anyway': 'Recommencer quand même',

  // ── Summon Theatre ────────────────────────────────────────────────────────
  'Click, Space or Enter to continue': 'Clic, Espace ou Entrée pour continuer',
  'Arrives knowing': 'Arrive en sachant',

  // ── Standout traits (summon/intro.ts TRAIT_WORDS) ─────────────────────────
  'Hard worker': 'Travailleur',
  Easygoing: 'Insouciant',
  'Life of the party': 'Boute-en-train',
  Shy: 'Timide',
  'Short fuse': 'Soupe au lait',
  Calm: 'Posé',
  Curious: 'Curieux',
  'Set in their ways': 'Routinier',
  Fearless: 'Intrépide',
  Careful: 'Prudent',
  'Warm-hearted': 'Chaleureux',
  Guarded: 'Réservé',

  // ── Introductions: 1★ (summon/intro.ts INTRO_LINES.humble) ────────────────
  'Hello! I’m {name}! I’ve never been summoned before. Will there be {food}? I’d fight a goblin for {food}.':
    'Bonjour ! Moi, c’est {name} ! On ne m’avait jamais invoqué. Vous avez {food} ? Je combattrais un gobelin pour {food}.',
  '{name}, at your service! I can’t fight yet, but I can learn. Probably!':
    '{name}, à votre service ! Je ne sais pas encore me battre, mais j’apprendrai. Sans doute !',
  '{name}, Master. I was only the village {trade}, but I will not shame you.':
    '{name}, Maître. Je n’étais que le {trade} du village, mais je ne vous ferai pas honte.',
  'Back home my evenings were for {hobby}, not swords. Still — {name}, at your service.':
    'Chez moi, mes soirées, c’était {hobby}, pas les armes. Pourtant — {name}, à votre service.',
  '{name}. Village {trade}. Don’t look at me like that — I’ve chased off wolves with a stick.':
    '{name}, {trade} au village. Me regardez pas comme ça — j’ai déjà chassé des loups avec un bâton.',
  'Name’s {name}. No sword, no class, no problem. Point me at it.':
    'Moi, c’est {name}. Pas d’épée, pas de classe, pas de problème. Montrez-moi la cible.',
  '…{name}. I’ll try not to be a burden.': '…{name}. J’essaierai de ne pas être un fardeau.',
  'I’m {name}. I don’t know what I can do here. But I’ll stay.':
    'Je suis {name}. Je ne sais pas ce que je peux faire ici. Mais je reste.',
  '{name}. The village {trade}, in a tower full of monsters. Someone up there is laughing.':
    '{name}. Le {trade} du village, dans une tour pleine de monstres. Quelqu’un, là-haut, doit bien rire.',
  '{name}. I know how this story usually ends for people like me. Let’s write a different one.':
    '{name}. Je sais comment finit d’habitude cette histoire pour les gens comme moi. Écrivons-en une autre.',

  // ── Introductions: 2★ (INTRO_LINES.seasoned) ──────────────────────────────
  '{name}! {Trade} by trade, optimist by nature. Where do we start?':
    '{name} ! {Trade} de métier, optimiste de nature. On commence par où ?',
  'Hi! {name}. Pay me in {food} and I’m yours for life.': 'Salut ! {name}. Payez-moi avec {food} et je suis à vous pour la vie.',
  '{name}. {Trade} by trade. I have stood in worse places than this, Master.':
    '{name}. {Trade} de métier. J’ai connu pire endroit que celui-ci, Maître.',
  'I served before, Master. I can serve again. {name}, at your command.':
    'J’ai déjà servi, Maître. Je peux servir encore. {name}, à vos ordres.',
  '{name}. I’ve been paid less to fight worse. Where’s the tower?':
    '{name}. On m’a déjà payé moins pour affronter pire. Elle est où, cette tour ?',
  '{Trade}. Name’s {name}. Don’t make me regret this.': '{Trade}. Moi, c’est {name}. Ne me le faites pas regretter.',
  '{name}. I watch, I listen, I hit when it counts.': '{name}. J’observe, j’écoute, je frappe quand ça compte.',
  '…{name}. I keep my blade clean and my mouth shut.': '…{name}. Je garde ma lame propre et ma bouche fermée.',
  '{name}. I’ve buried friends before. I’d rather not here.': '{name}. J’ai déjà enterré des amis. J’aimerais éviter ici.',
  '{name}. Every job ends one way or another. Let’s make this one end well.':
    '{name}. Chaque contrat finit d’une façon ou d’une autre. Faisons que celui-ci finisse bien.',

  // ── Introductions: 3★+ (INTRO_LINES.proud) ────────────────────────────────
  '{name}, and yes, I’m as good as I look. Let’s climb!': '{name}, et oui, je suis aussi doué que j’en ai l’air. Grimpons !',
  '{name}! A real tower? With real monsters? Oh, this is wonderful.':
    '{name} ! Une vraie tour ? Avec de vrais monstres ? Oh, c’est merveilleux.',
  'I am {name}. My blade and my oath are yours, Master.': 'Je suis {name}. Ma lame et mon serment sont à vous, Maître.',
  '{Trade} {name}, answering your call. Let us not waste it.': '{Trade} {name}, à votre appel. Ne le gaspillons pas.',
  '{name}. You got lucky, Master. Try to keep up.': '{name}. Vous avez eu de la chance, Maître. Tâchez de suivre.',
  '{name}. Show me the strongest thing in that tower.': '{name}. Montrez-moi ce qu’il y a de plus fort dans cette tour.',
  '{name}. Let the tower learn my name.': '{name}. Que la tour apprenne mon nom.',
  '…{name}. Where do you need me?': '…{name}. Où avez-vous besoin de moi ?',
  '{name}. Towers like this eat heroes. Not this one.': '{name}. Les tours comme celle-ci dévorent les héros. Pas celui-ci.',
  '{name}. I came a long way to die somewhere. It won’t be floor one.':
    '{name}. J’ai fait un long chemin pour mourir quelque part. Ce ne sera pas au premier étage.',
}
