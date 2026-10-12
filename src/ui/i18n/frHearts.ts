/**
 * French strings for the lobby's hearts: trauma, the Master's talk, favoritism, gift
 * collections and tryouts. Keys are the English source strings exactly as passed to `t()`.
 */
export const FR_HEARTS: Record<string, string> = {
  // ── Profile, tracker, results ──────────────────────────────────────────────
  Withdrawn: 'Renfermé',
  'Burnt out': 'À bout',
  'Shut away from everyone. Will not fight until a friend — or you — brings them back.':
    'Coupé de tous. Refuse de combattre tant qu’un ami — ou vous — ne l’aura pas ramené.',
  'Too many brushes with death. Will not fight until rested — or offered a post off the front line.':
    'Trop de fois au bord de la mort. Refuse de combattre tant qu’il n’est pas reposé — ou qu’on ne lui offre pas un poste loin du front.',
  'Talk them round ({n}%)': 'Lui parler ({n} %)',
  'Offer an instructor’s post': 'Offrir un poste d’instructeur',
  'They listened, but they are not ready. Try again tomorrow.': 'Il vous a écouté, mais il n’est pas prêt. Réessayez demain.',
  'On their shelf': 'Sur son étagère',
  'The others have noticed: the Master only looks at {name}. Those below Devoted grow resentful each day.':
    'Les autres l’ont remarqué : le Maître n’a d’yeux que pour {name}. Ceux en dessous de Dévoué en conçoivent chaque jour plus de rancœur.',
  'The lobby thinks {name} is your favourite.': 'La salle d’attente pense que {name} est votre favori.',
  '★ collects ×{n}': '★ collectionne ×{n}',
  Tryout: 'Épreuve de sélection',
  'Real weapons in the Yard, nobody dies. The winner holds the seat; the loser loses {n} Sanity and gains a rival.':
    'De vraies armes dans la cour, personne ne meurt. Le vainqueur garde la place ; le perdant perd {n} de Santé mentale et gagne un rival.',
  'Challenge {name}': 'Défier {name}',
  Duel: 'Duel',
  '{a} beat {b} and took the seat!': '{a} a battu {b} et pris sa place !',
  '{a} held the seat against {b}.': '{a} a gardé sa place face à {b}.',
  '(Withdrawn — talk to them in their Profile)': '(Renfermé — parlez-lui depuis son Profil)',
  '(Burnt out — let them rest, or offer them a post)': '(À bout — laissez-le se reposer, ou offrez-lui un poste)',

  // ── Refusals ───────────────────────────────────────────────────────────────
  'no such living hero': 'aucun héros vivant de ce nom',
  'they are not troubled': 'il ne va pas mal',
  'you already talked today': 'vous lui avez déjà parlé aujourd’hui',
  'only the burnt-out are offered a staff role': 'seuls les héros à bout se voient offrir un poste',
  'the Training Center is not built': 'le Centre d’entraînement n’est pas construit',
  'every instructor seat is taken': 'tous les postes d’instructeur sont pris',
  'a hero cannot duel themself': 'un héros ne peut pas se battre contre lui-même',
  'both heroes must be home, rested and willing': 'les deux héros doivent être présents, reposés et volontaires',
  'the challenger already holds a seat': 'le challenger a déjà une place',
  'that hero holds no party seat': 'ce héros n’a pas de place dans l’équipe',
  'one duel a day': 'un duel par jour',

  // ── Memories ───────────────────────────────────────────────────────────────
  'Withdrew after {name} died': 'S’est renfermé après la mort de {name}',
  'Withdrew from everyone': 'S’est coupé de tous',
  '{name} talked them back': '{name} l’a ramené parmi les vivants',
  'Came round after the Master’s talk': 'S’est repris après une discussion avec le Maître',
  'Found their feet again': 'A retrouvé pied',
  'Laid down arms to teach': 'A déposé les armes pour enseigner',
  'Began a collection of {gift}s': 'A commencé une collection de « {gift} »',
  'Beat {name} in a tryout': 'A battu {name} lors d’une épreuve de sélection',
  'Lost a tryout to {name}': 'A perdu une épreuve de sélection contre {name}',
  'Resented the Master’s favour for {name}': 'A mal vécu la préférence du Maître pour {name}',

  // ── Isel's letter ──────────────────────────────────────────────────────────
  '{a} has shut themselves away since {b} died.': '{a} s’est enfermé depuis la mort de {b}.',
  '{a} has shut themselves away after what happened on the floor.': '{a} s’est enfermé après ce qui s’est passé à l’étage.',
  '{a} is burnt out and asks not to climb.': '{a} est à bout et demande à ne plus grimper.',
  '{a} put down their weapon and took up teaching in the Yard.': '{a} a posé son arme et enseigne désormais dans la cour.',
  '{b} talked {a} back to the living.': '{b} a ramené {a} parmi les vivants.',
  '{a} came round after your talk.': '{a} s’est repris après votre discussion.',
  '{a} is themselves again.': '{a} est redevenu lui-même.',
  'The lobby whispers that {a} is your favourite.': 'On murmure dans la salle d’attente que {a} est votre favori.',
  '{a} has started collecting your {gift}s.': '{a} a commencé à collectionner vos « {gift} ».',
  '{a} beat {b} in a tryout and took the seat.': '{a} a battu {b} lors d’une épreuve et pris sa place.',
  '{a} saw off {b}’s challenge in a tryout.': '{a} a repoussé le défi de {b} lors d’une épreuve.',

  // ── Speech ─────────────────────────────────────────────────────────────────
  'I am back, Master. Mostly. Thank you for waiting.': 'Je suis de retour, Maître. Presque. Merci d’avoir attendu.',
  'Some days are still heavy. Today is not one of them.': 'Certains jours pèsent encore. Aujourd’hui n’en fait pas partie.',
  'Guess who is back on their feet!': 'Devinez qui est de nouveau sur pied !',
  'I came back from the dark. It will still be there. So will I.': 'Je suis revenu des ténèbres. Elles seront toujours là. Moi aussi.',
  'I teach now. I tell them everything the tower taught me, so it does not have to teach them.':
    'J’enseigne maintenant. Je leur dis tout ce que la tour m’a appris, pour qu’elle n’ait pas à le leur apprendre.',
  'I will not climb again. But they will climb better for me.': 'Je ne grimperai plus. Mais ils grimperont mieux grâce à moi.',
  'Feet apart! — See, Master? I am useful yet.': 'Écartez les pieds ! — Vous voyez, Maître ? Je sers encore à quelque chose.',
  'I have {n} of the {gift} now. Do not laugh. I have a shelf.': 'J’ai {n} « {gift} » maintenant. Ne riez pas. J’ai une étagère.',
  'The first {gift} annoyed me. Now I would fight anyone who touched them.':
    'Le premier « {gift} » m’a agacé. Aujourd’hui, je me battrais contre quiconque y toucherait.',
  'Another {gift}?! Master, the shelf is going to collapse!': 'Encore un « {gift} » ?! Maître, l’étagère va s’effondrer !',
  'I confess the {gift}s have grown on me, Master.': 'J’avoue que les « {gift} » ont fini par me plaire, Maître.',
  'I beat {rival} in the yard. Fair and square. The seat is mine.': 'J’ai battu {rival} dans la cour. À la loyale. La place est à moi.',
  '{rival} fought well. I fought better.': '{rival} s’est bien battu. Je me suis mieux battu.',
  '{rival} wanted my seat. {rival} can have the bruise instead.': '{rival} voulait ma place. {rival} aura le bleu à la place.',
  '{rival} beat me in the tryout. Next time I will be ready.': '{rival} m’a battu lors de l’épreuve. La prochaine fois, je serai prêt.',
  'I lost the duel to {rival}. My pride hurts more than my ribs.': 'J’ai perdu le duel contre {rival}. Ma fierté a plus mal que mes côtes.',
  '{rival} got lucky. Tell them I said so.': '{rival} a eu de la chance. Dites-le-lui de ma part.',
  '…{rival} was better. Today.': '…{rival} était meilleur. Aujourd’hui.',
  'The Master only looks at {rival}. The rest of us might as well be furniture.':
    'Le Maître n’a d’yeux que pour {rival}. Nous autres, nous pourrions aussi bien être des meubles.',
  'Another present for {rival}, I hear. How nice for {rival}.': 'Encore un cadeau pour {rival}, à ce qu’on dit. Comme c’est gentil pour {rival}.',
  '{rival}, {rival}, always {rival}.': '{rival}, {rival}, toujours {rival}.',
  'Please… not now, Master. I cannot.': 'S’il vous plaît… pas maintenant, Maître. Je ne peux pas.',
  'I just want to stay in here a while longer.': 'Je veux juste rester ici encore un peu.',
  'Every time I close my eyes I am back on the stairs.': 'Chaque fois que je ferme les yeux, je suis de retour dans l’escalier.',
  'Go away. I mean it.': 'Allez-vous-en. Je suis sérieux.',
  'I will be fine. I will. Just… not yet.': 'Ça ira. Vraiment. Juste… pas encore.',
  'I have nothing left, Master. Find someone else for the floors.': 'Je n’ai plus rien, Maître. Trouvez quelqu’un d’autre pour les étages.',
  'I keep thinking I should just… stop. Teach, maybe. Anything but climb.':
    'Je n’arrête pas de me dire que je devrais… arrêter. Enseigner, peut-être. Tout sauf grimper.',
  'My hands shake when I pick up my weapon now.': 'Mes mains tremblent quand je prends mon arme, maintenant.',
  'How many more floors before it is my turn? Do not answer.': 'Combien d’étages encore avant que ce soit mon tour ? Ne répondez pas.',
  'Master, I must ask to be released from the front line.': 'Maître, je dois vous demander d’être relevé de la première ligne.',
  'The Master only looks at {fav}. We all see it.': 'Le Maître n’a d’yeux que pour {fav}. Nous le voyons tous.',
  'Gifts, drills, all of it — for {fav}. Must be nice.': 'Les cadeaux, les entraînements, tout — pour {fav}. Ça doit être agréable.',
  '{fav} again? Ha! I am not jealous. Much.': 'Encore {fav} ? Ha ! Je ne suis pas jaloux. Pas trop.',
  'It is not my place to say, Master — but the others notice how you favour {fav}.':
    'Ce n’est pas à moi de le dire, Maître — mais les autres voient bien votre préférence pour {fav}.',
  'Thank you, Master, truly — but the others are starting to look at me strangely.':
    'Merci, Maître, sincèrement — mais les autres commencent à me regarder bizarrement.',
  'They whisper that I am your favourite. Am I?': 'On murmure que je suis votre favori. C’est vrai ?',
  'Everyone is glaring at me. Your fault, Master.': 'Tout le monde me fusille du regard. C’est votre faute, Maître.',
}
