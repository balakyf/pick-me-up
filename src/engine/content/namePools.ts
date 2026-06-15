/**
 * Name pools for procedural (non-cameo) heroes. The gacha samples first + last
 * (de-duping against GameState.usedNames) to mint unique names.
 *
 * Themed to match the manhwa's fantasy register (the Townia/Taonier roster:
 * Islat, Jenna, Aaron, Dika, Ridigeon, Muden, Nihaku, Yurneth, Sirres, Versace,
 * Darkan, Valention, Kurushahr...). >=30 of each gives 30*30 = 900+ combinations,
 * comfortably more than a slice account will ever consume.
 */

export const NAME_POOLS: { first: string[]; last: string[] } = {
  first: [
    'Aren', 'Bryn', 'Caelum', 'Dorn', 'Elys', 'Faren', 'Gareth', 'Halvik',
    'Ilsa', 'Joren', 'Kaida', 'Lyra', 'Maren', 'Nessa', 'Orin', 'Pell',
    'Quill', 'Riven', 'Sora', 'Talen', 'Ulric', 'Vesna', 'Wrenn', 'Xara',
    'Yorel', 'Zarek', 'Anya', 'Bram', 'Corin', 'Dela', 'Eldric', 'Fenn',
    'Galen', 'Hesta', 'Ivo', 'Juno', 'Kestrel', 'Lio', 'Mirae', 'Nox',
  ],
  last: [
    'Adenthem', 'Brightwater', 'Cirai', 'Delcut', 'Eldengrave', 'Falkner',
    'Gastfeel', 'Halwynd', 'Ironvale', 'Jorund', 'Kessler', 'Lirenne',
    'Mournhold', 'Nighdelk', 'Oakheart', 'Pyrrhus', 'Quarryn', 'Ravenscar',
    'Solwynn', 'Thornfield', 'Ulvang', 'Varden', 'Wyrmsbane', 'Yelster',
    'Zelthane', 'Ashdown', 'Blackmere', 'Cindervale', 'Drakemoor', 'Everwynd',
    'Frostmane', 'Greywater', 'Holloway', 'Inswold', 'Ladner', 'Marrowind',
  ],
}
