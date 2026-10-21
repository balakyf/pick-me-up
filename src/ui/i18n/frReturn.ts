/**
 * French strings for reasons to return (away summary, rested, stamps) (WP6, spec 2026-10-12).
 * Keys are the English source strings exactly as passed to `t()`; `{name}` placeholders must survive translation.
 * Never redefine a key that already lives in another FR module (i18n.test.ts guards it).
 */
export const FR_RETURN: Record<string, string> = {
  // ── While you were away (the welcome-back ledger) ──────────────────────────
  'While you were away': 'Pendant votre absence',
  'Welcome back, Master. I kept your seat warm.': 'Bon retour, Maître. Je vous ai gardé votre place au chaud.',
  'There you are! Everyone will be glad.': 'Vous voilà ! Tout le monde va être ravi.',
  'Welcome home, Master. Let me tell you what happened.': 'Bienvenue chez vous, Maître. Laissez-moi vous raconter ce qui s’est passé.',
  'You came back. The towers remembered you.': 'Vous êtes revenu. Les tours se sont souvenues de vous.',
  'You were away {time}. The waiting room kept living.': 'Vous êtes parti {time}. La salle d’attente a continué de vivre.',
  'A quiet spell. Everyone is simply glad you are back.': 'Un moment calme. Tout le monde est simplement content de vous revoir.',
  'Go to {place}': 'Aller à : {place}',
  'Waiting for you': 'Ce qui vous attend',
  Ready: 'Prêt',
  'Pent-up Interference: your next {n} floor clears pay double gold.':
    'Interférence accumulée : vos {n} prochains étages réussis rapportent le double d’or.',
  '+{n} gold from the heroes’ work — already in your purse.': '+{n} or gagnés par le travail des héros — déjà dans votre bourse.',
  'Today’s gift': 'Le cadeau du jour',
  '+{n} ♦ — thank you for coming by.': '+{n} ♦ — merci d’être passé.',
  'Stamped!': 'Tamponné !',
  'Dear Master,': 'Cher Maître,',
  stamp: 'tampon',
  'One tap, whenever you like.': 'Un seul geste, quand vous voulez.',
  '{names}: promotion complete.': '{names} : promotion terminée.',
  '{names}: drill finished.': '{names} : exercice terminé.',
  'The {place} upgrade is finished.': 'L’amélioration du lieu « {place} » est terminée.',
  'You have the gold for a summon.': 'Vous avez assez d’or pour une invocation.',
  'The Daily Dungeon has {n} attempts waiting.': 'Le Donjon quotidien vous attend avec {n} tentatives.',
  'The Daily Dungeon has an attempt waiting.': 'Le Donjon quotidien vous attend avec une tentative.',
  'Pent-up Interference: your next floor clear pays double gold.': 'Interférence accumulée : votre prochain étage réussi rapporte le double d’or.',
  'Isel’s full letter': 'La lettre complète d’Isel',
  'Back to the waiting room': 'Retour à la salle d’attente',
  'You reached Master Lv {n}.': 'Vous avez atteint le niveau de Maître {n}.',
  '{a} grew stronger: now Lv {n}.': '{a} a gagné en force : désormais Niv. {n}.',
  '{a} came home from the Ruins with {n} gems.': '{a} est de retour des Ruines avec {n} gemmes.',
  '{a} came home from the Ruins.': '{a} est de retour des Ruines.',

  // ── Time phrases ───────────────────────────────────────────────────────────
  '{n} days': '{n} jours',
  'a day': 'une journée',
  '{n} hours': '{n} heures',
  'an hour': 'une heure',
  'a little while': 'un petit moment',
  'ready now': 'prêt maintenant',
  'under a minute': 'moins d’une minute',
  '{d}d {h}h': '{d} j {h} h',
  '{h}h {m}m': '{h} h {m} min',
  '{m}m': '{m} min',

  // ── Hero letters ───────────────────────────────────────────────────────────
  '{friend} and I talked until the candles burned down. I think we are friends now.':
    '{friend} et moi avons parlé jusqu’à ce que les bougies s’éteignent. Je crois que c’est le début d’une amitié.',
  '{friend} saved me the last of the {food}. That is friendship, here.':
    '{friend} m’a gardé le reste de {food}. Ici, c’est ça, l’amitié.',
  '{rival} and I had words again. I may have started it. I may not have.':
    '{rival} et moi, on a encore eu des mots. C’est peut-être moi qui ai commencé. Ou peut-être pas.',
  '{rival} and I argued over the last of the {food}. We will make up by supper. Probably.':
    '{rival} et moi, on a eu une dispute pour le reste de {food}. On se réconciliera d’ici le souper. Sans doute.',
  'I keep thinking about floor {floor}. We were good up there, were we not?':
    'Je repense sans cesse à l’étage {floor}. On a fait du bon travail, là-haut, non ?',
  'Floor {floor} nearly had me. I am fine now. I sleep with the lamp on, that is all.':
    'L’étage {floor} a failli m’avoir. Je vais bien, maintenant. Je dors avec la lampe allumée, c’est tout.',
  'Floor {floor} sent us home. I have been practising the part where I dodge.':
    'L’étage {floor} a eu raison de nous. Je m’entraîne à la partie où j’esquive.',
  'We all walked out of floor {floor} together. I will take that over pride.':
    'De l’étage {floor}, tout le monde est revenu. Ensemble. Je préfère ça à la fierté.',
  'I sat with {fallen} at the Memorial and told them you would be back. I was right.':
    'J’ai pris place près de {fallen} au Mémorial et je lui ai dit que vous reviendriez. J’avais raison.',
  'I lit a candle for {fallen}. Someone should remember the quiet ones.':
    'J’ai allumé une bougie pour {fallen}. Il faut bien que quelqu’un se souvienne des âmes discrètes.',
  'I visited {fallen} and told them about the new floors. I think they would have liked them.':
    'J’ai rendu visite à {fallen} et je lui ai parlé des nouveaux étages. Je crois qu’ils lui auraient plu.',
  'I still have the {gift} you gave me. It lives by my bed now.':
    'J’ai toujours le {gift} que vous m’avez offert. Il vit à côté de mon lit, maintenant.',
  '{n} stars! I do not feel like a different person. Just a slightly shinier one.':
    '{n} étoiles ! Je ne me sens pas devenir quelqu’un d’autre. Juste avec un peu plus d’éclat.',
  'I finished a {item} at the Forge. Give it to someone who will use it well.':
    'J’ai terminé une pièce à la Forge : {item}. Donnez-la à quelqu’un qui saura s’en servir.',
  'They are calling me a {tier} {job} now. Me!': 'On m’appelle {job} {tier}, maintenant. Moi !',
  'I am still learning where everything is. The kitchen first, obviously.':
    'J’apprends encore où se trouve chaque chose. La cuisine d’abord, évidemment.',
  'I carry a little of {fallen} with me now. I try to fight the way they did.':
    'Je porte un peu de {fallen} en moi, maintenant. J’essaie de me battre à sa manière.',
  'We got the one who took {fallen}. I hope they saw it, wherever they are.':
    'On a eu ce qui nous a pris {fallen}. J’espère que, où que soit son âme, la nouvelle lui est parvenue.',
  'I cooked {n} meals while you were gone. I only burned one. Fine — two.':
    'J’ai cuisiné {n} repas pendant votre absence. Je n’en ai brûlé qu’un. Bon — deux.',
  'The Forge never went cold: {n} pieces, and not one cracked.':
    'La Forge ne s’est jamais éteinte : {n} pièces, et pas une seule fêlée.',
  'The garden and the stalls paid {n} gold into the purse. I counted twice.':
    'Le jardin et les étals ont rapporté {n} or à la bourse. J’ai compté deux fois.',
  'The Yard was busy — {n} XP of drills. Everyone is a little sharper.':
    'La Cour a bien travaillé — {n} XP d’exercices. Tout le monde est un peu plus affûté.',
  'I have been reading about the next floor. I think I know its trick.':
    'J’ai étudié le prochain étage. Je crois que j’ai compris son truc.',
  'I mended {n} points of frayed nerves. Nobody cried. Much.':
    'J’ai apaisé {n} points de nerfs à vif. Personne n’a pleuré. Enfin, pas trop.',
  'The seedlings came up. Something grows in this place after all.': 'Les semis ont levé. Quelque chose pousse ici, finalement.',
  'I finished a whole book. The hero lives, this time.': 'J’ai fini un livre entier. Le héros survit, cette fois.',
  'I sparred until my arms gave out. Then a little more.': 'J’ai croisé le fer jusqu’à ne plus sentir mes bras. Puis encore un peu.',
  'I learned a fourth song. You will hear it whether you like it or not.':
    'J’ai appris une quatrième chanson. Vous l’entendrez, que vous le vouliez ou non.',
  'I am up six dishes and a night watch at cards.': 'Aux cartes, j’ai gagné six vaisselles et une garde de nuit.',
  'I carved a little wooden bird. It is waiting on your chair.': 'J’ai sculpté un petit oiseau en bois. Il vous attend sur votre chaise.',
  'I named a star after you. The stubborn one that never sets.': 'J’ai donné votre nom à une étoile. La têtue qui ne se couche jamais.',
  'Save me a spot on the next climb?': 'Vous me gardez une place pour la prochaine ascension ?',
  'Come say hello! I will be the loud one.': 'Venez dire bonjour ! C’est moi qu’on entendra le plus.',
  'I kept your seat by the hearth, Master.': 'Je vous ai gardé votre place près de l’âtre, Maître.',
  'The party awaits your word, whenever you are ready.': 'L’équipe attend vos ordres, dès que vous serez prêt.',
  'Tower is still there. So are we.': 'La tour est toujours là. Nous aussi.',
  'Kept your chair warm. Do not make it weird.': 'J’ai gardé votre chaise au chaud. N’en faites pas toute une histoire.',
  'No hurry. We will be here.': 'Rien ne presse. Nous serons là.',
  'I saved you a cup of tea. It went cold. I will make another.': 'Je vous avais gardé une tasse de thé. Il a refroidi. J’en referai.',
  'Still standing. Still yours.': 'Toujours debout. Toujours à vous.',
  'The tower waits. So do I.': 'La tour attend. Moi aussi.',

  // ── Lights Out ─────────────────────────────────────────────────────────────
  'Rest for now': 'Se reposer',
  'A good place to stop: see what waits for next time': 'Un bon moment pour s’arrêter : voir ce qui attend la prochaine fois',
  'A good place to stop': 'Un bon moment pour s’arrêter',
  'Next time': 'La prochaine fois',
  'looks safe': 's’annonce sans danger',
  'looks like a fair fight': 's’annonce comme un combat équilibré',
  'looks risky': 's’annonce risqué',
  'looks deadly': 's’annonce mortel',
  '{bane} waits there.': '{bane} y attend.',
  '{enemy} waits there.': '{enemy} y attend.',
  '{bane} waits on floor {n}.': '{bane} attend à l’étage {n}.',
  'Canon rules (Hardcore)': 'Règles du canon (Hardcore)',
  'Interference fades while you are away, and six months away greys the world for good. Off by default.':
    'L’interférence s’estompe pendant votre absence, et six mois d’absence grisent le monde pour de bon. Désactivé par défaut.',
  '{enemy} ×{n} wait there.': '{enemy} ×{n} y attendent.',
  Brewing: 'En cours',
  '{a}’s promotion': 'Promotion de {a}',
  '{a} drilling {skill}': '{a} s’exerce : {skill}',
  '{a} in the Ruins': '{a} dans les Ruines',
  '{place} upgrade': 'Amélioration : {place}',
  'a new skill': 'une nouvelle compétence',
  'ready at {time} (in {left})': 'fin à {time} (dans {left})',
  'On the edge': 'Presque',
  '{a} and {b}: one good evening from friends.': '{a} et {b} : une bonne soirée de plus et ce sera l’amitié.',
  '{a} and {b}: a few good evenings from friends.': '{a} et {b} : quelques bonnes soirées et ce sera l’amitié.',
  '{a} and {b}: one good evening from inseparable.': '{a} et {b} : une bonne soirée de plus et plus rien ne les séparera.',
  '{a} and {b}: a few good evenings from inseparable.': '{a} et {b} : quelques bonnes soirées et plus rien ne les séparera.',
  'Within reach': 'À portée de main',
  'Next summon: {n} gold to go': 'Prochaine invocation : encore {n} or',
  'F{floor} boss: the very next floor': 'Boss de l’étage {floor} : dès le prochain étage',
  'F{floor} boss: {n} floors to go': 'Boss de l’étage {floor} : encore {n} étages',
  'Master Lv {level}': 'Maître Niv. {level}',
  'Stamp card {n}/{of}': 'Carte de tampons {n}/{of}',
  'Interference is full: your next {n} floor clears pay double gold.':
    'L’Interférence est au maximum : vos {n} prochains étages réussis rapportent le double d’or.',
  'While you rest, Interference builds: {n}/{max} stored, the next in {left}. Each doubles one floor’s gold.':
    'Pendant votre repos, l’Interférence s’accumule : {n}/{max} en réserve, la prochaine dans {left}. Chacune double l’or d’un étage.',
  'Rest well, Master. I will keep the lamps lit.': 'Reposez-vous bien, Maître. Je garderai les lampes allumées.',
  'Go on — the tower will still be there tomorrow. So will we.': 'Allez — la tour sera toujours là demain. Nous aussi.',
  'A good place to stop. I will tell them you said goodnight.': 'Un bon moment pour s’arrêter. Je leur dirai que vous leur avez souhaité bonne nuit.',
  'Sleep, Master. I will write down anything worth telling.': 'Dormez, Maître. Je noterai tout ce qui mérite d’être raconté.',
  'Thank you for today. Come back whenever you like — your seat stays warm.':
    'Merci pour aujourd’hui. Revenez quand vous voulez — votre place reste au chaud.',
  'Good night, Isel': 'Bonne nuit, Isel',

  // ── Honest tab title ───────────────────────────────────────────────────────
  'Promotion done': 'Promotion terminée',
  'Training done': 'Entraînement terminé',
  'Build done': 'Construction terminée',
  'Expedition home': 'Expédition rentrée',

  // ── The stamp card (daily login) ───────────────────────────────────────────
  'Daily login': 'Connexion quotidienne',
  'today’s stamp is waiting': 'le tampon du jour vous attend',
  'Stamp card: {n} of {of}': 'Carte de tampons : {n} sur {of}',
  'Card complete! +{gems} ♦ and a free summon. A fresh card begins.':
    'Carte complète ! +{gems} ♦ et une invocation offerte. Une nouvelle carte commence.',
  'Card complete! +{gems} ♦, and {name} answered the free summon. A fresh card begins.':
    'Carte complète ! +{gems} ♦, et {name} a répondu à l’invocation offerte. Une nouvelle carte commence.',
  '{n}/{of} · every {of}th stamp: +{gems} ♦ and a free summon. Missed days never cost a stamp.':
    '{n}/{of} · tous les {of} tampons : +{gems} ♦ et une invocation offerte. Un jour manqué ne coûte jamais de tampon.',
  'The world grows steadier while you play, and it keeps what it gained while you are away. Thresholds: Hall of Magic {hallOfMagic} · Crack of Time {crack}.':
    'Le monde se stabilise quand vous jouez, et il garde ce qu’il a gagné pendant votre absence. Seuils : Salle de magie {hallOfMagic} · Faille du Temps {crack}.',

  // ── Backup ─────────────────────────────────────────────────────────────────
  'Back up your save': 'Sauvegarder votre partie',
  'Back up your save? Browsers sometimes forget.': 'Faire une copie de votre partie ? Les navigateurs oublient parfois.',
  'Back up': 'Faire une copie',
  'Not now': 'Pas maintenant',
  'Your save lives only in this browser, and some browsers clear it after a week away. Keep a copy somewhere safe — you can bring it back here, or to another device.':
    'Votre partie n’existe que dans ce navigateur, et certains navigateurs l’effacent après une semaine d’absence. Gardez-en une copie en lieu sûr — vous pourrez la restaurer ici, ou sur un autre appareil.',
  'This browser has promised to keep your save.': 'Ce navigateur s’est engagé à conserver votre partie.',
  'Make a copy': 'Faire une copie',
  'Download save file': 'Télécharger le fichier de sauvegarde',
  'Copy save code': 'Copier le code de sauvegarde',
  'Save code': 'Code de sauvegarde',
  'Save file downloaded.': 'Fichier de sauvegarde téléchargé.',
  'Downloads are not available here — copy the code instead.': 'Le téléchargement n’est pas possible ici — copiez plutôt le code.',
  'Save code copied.': 'Code de sauvegarde copié.',
  'Select the code and copy it by hand.': 'Sélectionnez le code et copiez-le à la main.',
  'Restore a copy': 'Restaurer une copie',
  'Paste a save code here…': 'Collez un code de sauvegarde ici…',
  'Check this save': 'Vérifier cette sauvegarde',
  'Open a save file': 'Ouvrir un fichier de sauvegarde',
  'Found: Master Lv {ml} · floor {f} cleared · {n} heroes.': 'Trouvé : Maître Niv. {ml} · étage {f} franchi · {n} héros.',
  'This replaces the save in this browser. The current one is kept aside: you can bring it back from this window.':
    'Cela remplace la partie de ce navigateur. L’actuelle est mise de côté : vous pourrez la récupérer depuis cette fenêtre.',
  'Kept from before your last import: Master Lv {ml} · floor {f} cleared · {n} heroes.':
    'Mise de côté avant votre dernière importation : Maître Niv. {ml} · étage {f} franchi · {n} héros.',
  'Bring that save back': 'Récupérer cette partie',
  'Your save from before the import is back. The other one is kept here in its place.':
    'Votre partie d’avant l’importation est de retour. L’autre est mise de côté ici à sa place.',
  'That save is damaged and cannot be played. Nothing was changed.': 'Cette sauvegarde est endommagée et ne peut pas être jouée. Rien n’a été modifié.',
  'That save has greyed and cannot be restored.': 'Cette partie est devenue grise et ne peut pas être restaurée.',
  'Replace my save': 'Remplacer ma partie',
  'Finish the climb first: a save is restored from the waiting room.': 'Terminez d’abord l’ascension : une partie se restaure depuis la salle d’attente.',
  'Save restored. Welcome back, Master.': 'Partie restaurée. Bon retour, Maître.',
  'That save could not be read. Nothing was changed.': 'Cette sauvegarde est illisible. Rien n’a été modifié.',
  'That does not look like a save code.': 'Cela ne ressemble pas à un code de sauvegarde.',
  'Paste a save code or choose a save file first.': 'Collez d’abord un code de sauvegarde ou choisissez un fichier.',
  '✦ Re-interference ✦': '✦ Ré-interférence ✦',
}
