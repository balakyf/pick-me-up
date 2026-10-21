import { describe, expect, it } from 'vitest'
import { FR_MODULES } from './fr'

/**
 * Heroes carry no gender in the engine, so French that describes a hero must not agree
 * in the masculine ("{b} est vengé", "{name}, tombé dans la tour", "je suis prêt").
 * The fix is always a construction that does not agree ("La mort de {b} est vengée",
 * "{name} a gagné en force", "je l’attends de pied ferme"), never "prêt·e".
 *
 * This guard is a heuristic: it looks for a hero placeholder (or a hero speaking in the
 * first person) followed closely by a copula and a word with a masculine ending. Monsters,
 * Banes ({bane}, {enemy}), objects, places and the Master (addressed as "vous") are
 * grammatically fine and are not matched. Isel speaks of herself in the feminine.
 */

/** Placeholders that stand for a hero somewhere in the game. */
const HERO = ['name', 'hero', 'who', 'a', 'b', 'heir', 'fallen', 'friend', 'rival', 'names', 'list']
const PH = `\\{(?:${HERO.join('|')})\\}`

/** Feminine nouns in -é that are not agreements ("une amitié", "sa captivité"). Extend when needed. */
const FEMININE_NOUNS =
  'amitié|moitié|pitié|santé|volonté|fierté|vérité|cité|clé|beauté|bonté|liberté|loyauté|nouveauté|' +
  '\\p{L}*(?:alité|ivité|bilité|osité|idité|unité|ciété|acité|inité|anité|ernité|ilité|urité|orité|iété|ficulté|esté)'

/** A word with a masculine agreement: past participles in -é(s) and common hero adjectives. */
const MASC =
  `(?:(?!(?:${FEMININE_NOUNS})s?(?![\\p{L}]))\\p{L}*(?:é|és)|(?<!(?:la|sa|une|ma|ta|leur|votre|notre) )morts?|` +
  'prêts?|heureux|seuls?|revenus?|partis?|venus?|sortis?|perdus?|assis|pris|mis|' +
  'contents?|fiers?|bons?|différents?|sérieux|doués?|lents?|amis|captifs?|prisonniers?|promus?|forts?|brillants?|' +
  'excités?|occupés?|fatigués?|blessés?|épuisés?|sauvés?|vengés?|tombés?|présents?|inquiets?|vivants?|sûrs?|déçus?|' +
  'gentils?|faits?|meilleurs?|premiers?|derniers?)(?![\\p{L}’\'])'

/** Being / becoming verbs that make the next adjective agree with their subject. */
const COPULA =
  '(?:est|était|sera|serait|reste|restera|semble|devient|devrait être|a été|avait été|s’est|se sent|' +
  'sont|étaient|seront|se sont|sont devenus|ont été|se croit|se croyait|rentre|revient)'

const RULES: { why: string; re: RegExp }[] = [
  // "{b} est vengé", "{a} s’est renforcé", "{a} et {b} sont devenus amis", "{name} est encore blessé".
  { why: 'hero placeholder + copula + masculine word', re: new RegExp(`${PH}(?:\\s+et\\s+${PH})?\\s+(?:n’|ne\\s+)?${COPULA}\\s+(?:[\\p{L}’]+\\s+){0,2}?${MASC}`, 'iu') },
  // "Transmis par {name}, tombé dans la tour" — a participle in apposition to the hero.
  { why: 'hero placeholder + apposed masculine participle', re: new RegExp(`${PH},\\s+(?:\\p{L}*(?:é|és)|revenus?|partis?|venus?|morts?|prêts?|présents?|seuls?)(?![\\p{L}’'])`, 'iu') },
  // A hero describing themself: "je suis prêt", "j’étais trop excité", "Je me suis entraîné".
  {
    why: 'hero speaking of themself in the masculine',
    re: new RegExp(
      `(?:^|[^\\p{L}])(?:je (?:ne )?suis|j’étais|je n’étais|je (?:ne )?serai|je (?:ne )?serais|je (?:ne )?me sens|je reste|je deviens|je me suis|tu es|tu étais|tu as été|on était|on s’est|nous sommes)\\s+(?:pas\\s+)?(?:[\\p{L}’]+\\s+){0,2}?${MASC}`,
      'iu',
    ),
  },
  // "Vous m’avez trouvé", "On ne m’avait jamais invoqué", "Ils m’ont enfermé" — a hero as a preceding object.
  // Only a direct object agrees, so the participle must end the clause (or lead into a
  // complement) and must not be a verb that takes "à" (manquer, parler, plaire…):
  // "{friend} m’a gardé le reste" and "Ça m’avait manqué" are fine.
  {
    why: 'hero as preceding object (m’/t’) + masculine participle',
    re: new RegExp(
      `(?:^|[^\\p{L}])[mt]’(?:a|as|avait|avez|ont|avaient)\\s+(?:jamais\\s+|déjà\\s+|pas\\s+)?(?!(?:manqué|parlé|plu|répondu|souri|menti|écrit|dit|demandé)(?![\\p{L}]))${MASC}` +
        `(?=\\s*[.,;:!?…]|\\s+(?:dans|à|au|aux|pour|par|ici|moins|plus|comme|avec|sans|en)(?![\\p{L}]))`,
      'iu',
    ),
  },
]

/** Entries spoken by Isel (feminine in canon) or about the Master: fine as written. */
const EXEMPT_KEYS = new Set<string>([])

function offenders(dict: Record<string, string>): string[] {
  const out: string[] = []
  for (const [en, fr] of Object.entries(dict)) {
    if (EXEMPT_KEYS.has(en)) continue
    for (const { why, re } of RULES) {
      const m = re.exec(fr)
      if (m) out.push(`${JSON.stringify(en)} → ${JSON.stringify(fr)} [${why}: "${m[0].trim()}"]`)
    }
  }
  return out
}

describe('French hero wording does not assume a gender', () => {
  it('catches the patterns it is meant to catch', () => {
    const bad = {
      a: '{b} est vengé.',
      b: '{a} s’est renforcé : désormais Niv. {n}.',
      c: '{a} et {b} sont devenus amis.',
      d: 'Transmis par {name}, tombé dans la tour.',
      e: '{name} ! J’espère que cette tour est prête pour moi, parce que moi, je suis prêt pour elle.',
      f: 'Oh ! Salut ! Je voulais apporter {food}, mais j’étais trop excité.',
      g: '{name} ! Ne vous en faites pas, Maître — le plus dur est fait. Vous m’avez trouvé.',
      h: 'Bonjour ! On ne m’avait jamais invoqué.',
      i: '{fallen} devrait être ici. {fallen} devrait être assis juste là.',
      j: 'Revenge: {hero} est vengé.',
      k: '{name} est prêt.',
      l: '{name}, présent ! J’apprends vite.',
      m: 'Je ne suis pas fait pour ça.',
      n: '{rival} se croit meilleur à la lame.',
      o: '{name} rentre épuisé.',
      p: 'Je me sens vivant.',
      q: '{name} est inquiet.',
    }
    expect(offenders(bad)).toHaveLength(Object.keys(bad).length)
  })

  it('leaves monsters, objects, the Master and Isel alone', () => {
    const fine = {
      a: 'Vengeance : {bane} est tombé, et la mort de {hero} est vengée.',
      b: '{enemy} · le Fléau est tombé.',
      c: 'Vous êtes revenu. Les tours se sont souvenues de vous.',
      d: 'Dès que vous serez prêt.',
      e: 'Je suis Isel — je tiens cette salle d’attente en ordre.',
      f: '{name} a gagné en force sur le banc.',
      g: '{a} est de retour des Ruines.',
      h: '{friend} m’a sauvé la peau plus d’une fois.',
      i: 'Faveur obtenue : {name}. Elle dure toute la sortie.',
      j: '{name} : immunisé — {what}',
    }
    expect(offenders(fine)).toEqual([])
  })

  it('no French module agrees a hero in the masculine', () => {
    const all = Object.entries(FR_MODULES).flatMap(([mod, dict]) => offenders(dict).map((o) => `${mod}: ${o}`))
    expect(all).toEqual([])
  })

  it('labels that describe one hero (tags, tiers, statuses, plaques) carry no masculine agreement', () => {
    // These have no placeholder, so the rules above cannot see them: list them by key.
    const HERO_LABELS = [
      // Standout traits (summon/intro.ts TRAIT_WORDS)
      'Hard worker', 'Easygoing', 'Life of the party', 'Shy', 'Short fuse', 'Calm', 'Curious', 'Set in their ways',
      'Fearless', 'Careful', 'Warm-hearted', 'Guarded',
      // Favor tiers (TUNING.favor.tierNames), shown as "♥ <tier>" on the hero card
      'Wary', 'Neutral', 'Warm', 'Devoted', 'Bonded',
      // Hero card, profile and status lines
      '☠ Fallen', '(Wary and broken — win back their trust)', 'away in the Ruins', 'blessed', 'Away on an expedition',
      'Held captive', 'Beaten back on floor {floor}', 'Argued with {name}', 'Promoted to {n}★',
      // Battle and results callouts about one hero
      'Saved!', 'AVENGED!', 'Avenged at last',
      // The heir's bond to the fallen, the Memorial's plaque
      'Closest friend', 'Their friend', 'Their old rival', 'A fellow hero', 'How they died',
      'struck down by the {enemy} (Lv{level})', 'never ransomed', 'fell on floor {n}', 'mourned by {names}',
      'lost to the Synthesis Chamber',
      // A refusal about one hero, and the brewing line that follows "{a} in the Ruins"
      'A captive cannot take an echo.', 'ready at {time} (in {left})',
    ]
    // Labels are mostly bare adjectives, so also catch masculine adjective endings
    // ("Curieux", "Travailleur", "Méfiant", "Prudent", "Routinier", "Craintif"), but not nouns in -ment.
    const ADJ = '(?!\\p{L}*ment(?![\\p{L}]))\\p{L}+(?:eux|eur|ant|ent|ier|if)(?![\\p{L}’\'])'
    const word = new RegExp(`(?:^|[^\\p{L}’'])(?:${MASC}|${ADJ})`, 'iu')
    const missing = HERO_LABELS.filter((k) => !Object.values(FR_MODULES).some((d) => k in d))
    expect(missing).toEqual([])
    const bad = HERO_LABELS.map((k) => [k, Object.values(FR_MODULES).find((d) => k in d)![k]!] as const).filter(([, fr]) => word.test(fr))
    expect(bad).toEqual([])
  })
})
