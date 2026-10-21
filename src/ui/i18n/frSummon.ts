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
  'Hard worker': 'Infatigable',
  Easygoing: 'Facile à vivre',
  'Life of the party': 'Boute-en-train',
  Shy: 'Timide',
  'Short fuse': 'Soupe au lait',
  Calm: 'Calme',
  Curious: 'Avide de découvertes',
  'Set in their ways': 'Fidèle à ses habitudes',
  Fearless: 'Intrépide',
  Careful: 'Sur ses gardes',
  'Warm-hearted': 'Au grand cœur',
  Guarded: 'Sur la réserve',

  // ── Introductions: 1★ (summon/intro.ts INTRO_LINES.humble) ────────────────
  'Hello! I’m {name}! I’ve never been summoned before. Will there be {food}? I’d fight a goblin for {food}.':
    'Bonjour ! Moi, c’est {name} ! C’est ma toute première invocation. Vous avez {food} ? Je combattrais un gobelin pour {food}.',
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
    '{name}. J’ai déjà touché moins pour affronter pire. Elle est où, cette tour ?',
  '{Trade}. Name’s {name}. Don’t make me regret this.': '{Trade}. Moi, c’est {name}. Ne me le faites pas regretter.',
  '{name}. I watch, I listen, I hit when it counts.': '{name}. J’observe, j’écoute, je frappe quand ça compte.',
  '…{name}. I keep my blade clean and my mouth shut.': '…{name}. Je garde ma lame propre et ma bouche fermée.',
  '{name}. I’ve buried friends before. I’d rather not here.': '{name}. J’ai déjà enterré des amis. J’aimerais éviter ici.',
  '{name}. Every job ends one way or another. Let’s make this one end well.':
    '{name}. Chaque contrat finit d’une façon ou d’une autre. Faisons que celui-ci finisse bien.',

  // ── Introductions: 3★+ (INTRO_LINES.proud) ────────────────────────────────
  '{name}, and yes, I’m as good as I look. Let’s climb!': '{name}, et oui, j’ai tout le talent que vous imaginez. Grimpons !',
  '{name}! A real tower? With real monsters? Oh, this is wonderful.':
    '{name} ! Une vraie tour ? Avec de vrais monstres ? Oh, c’est merveilleux.',
  'I am {name}. My blade and my oath are yours, Master.': 'Je suis {name}. Ma lame et mon serment sont à vous, Maître.',
  '{Trade} {name}, answering your call. Let us not waste it.': '{Trade} {name}, à votre appel. Ne le gaspillons pas.',
  '{name}. You got lucky, Master. Try to keep up.': '{name}. Vous avez eu de la chance, Maître. Tâchez de suivre.',
  '{name}. Show me the strongest thing in that tower.': '{name}. Montrez-moi ce qu’il y a de plus fort dans cette tour.',
  '{name}. Let the tower learn my name.': '{name}. Que la tour apprenne mon nom.',
  '…{name}. Where do you need me?': '…{name}. Où avez-vous besoin de moi ?',
  '{name}. Towers like this eat heroes. Not this one.': '{name}. Les tours comme celle-ci dévorent les héros. Pas moi.',
  '{name}. I came a long way to die somewhere. It won’t be floor one.':
    '{name}. J’ai fait un long chemin pour mourir quelque part. Ce ne sera pas au premier étage.',

  // ── Introductions, more lines so one pull never repeats itself ─────────────
  // 1★
  '{name}! Is that the tower? It’s so tall! I’ve only ever climbed trees.':
    '{name} ! C’est ça, la tour ? Elle est si haute ! Moi, je n’ai jamais grimpé qu’aux arbres.',
  'Oh! Hi! I’m {name}. I meant to bring {food}, but I was too excited.':
    'Oh ! Salut ! Moi, c’est {name}. Je voulais apporter {food}, mais dans l’excitation, j’ai oublié.',
  '{name}, reporting! I don’t know which end of a sword is which, but I learn fast!':
    '{name}, me voilà ! Je ne sais pas par quel bout on tient une épée, mais j’apprends vite !',
  'I am {name}, Master. I have no great deeds to my name. Not yet.':
    'Je suis {name}, Maître. Je n’ai encore accompli aucun haut fait. Pas encore.',
  'Forgive my plain manners, Master. {name}. I will learn the rest.':
    'Pardonnez mes manières simples, Maître. {name}. J’apprendrai le reste.',
  '{name}, Master. I know little of battle, but I know how to work until the work is done.':
    '{name}, Maître. Je connais peu la guerre, mais je sais travailler jusqu’à ce que le travail soit fait.',
  '{name}. I’m no hero. But I don’t run, either.': '{name}. J’ai rien d’une légende. Mais je fuis pas non plus.',
  'Oi. {name}. Somebody said there’d be {food}. Was that a lie?':
    'Hé. {name}. On m’a dit qu’il y aurait {food}. C’était un mensonge ?',
  '{name}. These hands were made for work. Fighting’s just work with more yelling.':
    '{name}. Ces mains-là sont faites pour le travail. Se battre, c’est du travail avec plus de cris.',
  '{name}… sorry. I’m not used to so many people looking at me.':
    '{name}… pardon. Je n’ai pas l’habitude qu’on me regarde autant.',
  '…I’m {name}. I like {hobby}. I don’t think that helps here.':
    '…Je suis {name}. J’aime {hobby}. Je ne crois pas que ça serve, ici.',
  '{name}. I’ll stand at the back. Unless you need me at the front.':
    '{name}. Je resterai derrière. Sauf si vous avez besoin de moi devant.',
  '{name}. Nobody sings about people like me. Fine. I’ll just stay alive.':
    '{name}. Personne ne chante les gens comme moi. Soit. Je me contenterai de rester en vie.',
  '{name}. I had a quiet life. I suppose that was too much to ask.':
    '{name}. J’avais une vie tranquille. C’était sans doute trop demander.',
  '{name}. If I fall, tell them I didn’t run.': '{name}. Si je tombe, dites-leur que je n’ai pas fui.',
  // 2★
  '{name}, at your service! I’ve seen a few towers. This one looks fun.':
    '{name}, à votre service ! J’ai vu quelques tours. Celle-ci a l’air amusante.',
  '{name}! I fight better after {food}. Just so you know.': '{name} ! Je me bats mieux après {food}. C’est dit.',
  'Oh, a summons! {name}, ready when you are. What are we hitting?':
    'Oh, une invocation ! {name}, quand vous voulez. On tape sur quoi ?',
  '{name}, Master. My gear is in order and my word is good.': '{name}, Maître. Mon équipement est en ordre et ma parole est sûre.',
  '{name}. I ask only for clear orders and a fair share.': '{name}. Je ne demande que des ordres clairs et une part honnête.',
  '{name}, reporting for duty. Show me where the line is, and I will hold it.':
    '{name}, au rapport. Montrez-moi la ligne, et je la tiendrai.',
  '{name}. Coin first, questions later. Actually, skip the questions.':
    '{name}. L’argent d’abord, les questions après. En fait, oubliez les questions.',
  '{name}. I’ve had worse bosses. Probably.': '{name}. J’ai eu de pires patrons. Sûrement.',
  'Name’s {name}. I don’t do speeches. I do results.': 'Moi, c’est {name}. Je fais pas de discours. Je fais des résultats.',
  '{name}. Point. I’ll handle it.': '{name}. Montrez du doigt. Je m’en occupe.',
  '…{name}. I don’t talk much. My work does.': '…{name}. Je parle peu. Mon travail parle pour moi.',
  '{name}. When it’s quiet, I like {hobby}. It’s rarely quiet.':
    '{name}. Quand c’est calme, j’aime {hobby}. C’est rarement calme.',
  '{name}. I’ve seen how these climbs end. I’m still here.': '{name}. J’ai vu comment finissent ces ascensions. Je suis toujours là.',
  '{name}. Keep the healers close and the graves few.': '{name}. Gardez les soigneurs près de vous et les tombes peu nombreuses.',
  '{name}. I stopped counting my scars. Let’s not start on yours.':
    '{name}. J’ai arrêté de compter mes cicatrices. Ne commençons pas les vôtres.',
  // 3★+
  '{name}! Don’t worry, Master — the hard part’s over. You found me.':
    '{name} ! Ne vous en faites pas, Maître — le plus dur est fait. Vous avez mis la main sur moi.',
  '{name}, here at last! Let’s give the bards something to sing about.':
    '{name}, enfin là ! Donnons aux bardes de quoi chanter.',
  '{name}! I hope that tower is ready for me, because I am ready for it.':
    '{name} ! J’espère que cette tour est prête pour moi, parce que moi, je l’attends de pied ferme.',
  '{name}. Many have called. Few were answered. You were, Master.':
    '{name}. Beaucoup ont appelé. Peu ont eu de réponse. Vous, si, Maître.',
  'My name is {name}, and it has been spoken in grander halls than this. Let us add this tower to the tale.':
    'Je m’appelle {name}, et ce nom a résonné dans des salles plus grandes que celle-ci. Ajoutons cette tour au récit.',
  '{name}, at your command. Choose the hardest floor; I will meet it.':
    '{name}, à vos ordres. Choisissez l’étage le plus dur ; je l’affronterai.',
  '{name}. Don’t get used to winning this easily. Actually, do.':
    '{name}. Ne vous habituez pas à gagner aussi facilement. En fait, si.',
  '{name}. Strongest in the room. Next question.': '{name}. La plus grande force de la salle. Question suivante.',
  '{name}. I hope there’s something in that tower worth my time.':
    '{name}. J’espère qu’il y a dans cette tour quelque chose qui vaut mon temps.',
  '{name}. I don’t miss.': '{name}. Je ne rate jamais.',
  '…{name}. The tower will be quieter when I’m done.': '…{name}. La tour sera plus calme quand j’en aurai fini.',
  '{name}. Say the word, and it’s done.': '{name}. Un mot de vous, et c’est fait.',
  '{name}. Death has chased me for years. It can follow me up the stairs.':
    '{name}. La mort me poursuit depuis des années. Elle peut bien me suivre dans l’escalier.',
  '{name}. I have outlived every tower I climbed. Let’s keep it that way.':
    '{name}. J’ai survécu à chaque tour que j’ai gravie. Continuons ainsi.',
  '{name}. Whatever waits at the top, I have seen worse.': '{name}. Quoi qui attende au sommet, j’ai vu pire.',
}
