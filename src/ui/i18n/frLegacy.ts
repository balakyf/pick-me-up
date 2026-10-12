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
}
