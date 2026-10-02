/**
 * French for battle readability (lane E): the objective HUD, the turn order, the wave
 * banners, the one-time elements hint, HP costs over a caster and the SP tooltip.
 */
export default {
  '−{n} HP': '−{n} PV',
  'SP {sp}/{max}': 'PM {sp}/{max}',
  Mission: 'Mission',
  'Wave {n}/{total}': 'Vague {n}/{total}',
  'Defeat every foe': 'Vaincre tous les ennemis',
  'Defeat every foe — {n} waves': 'Vaincre tous les ennemis — {n} vagues',
  'Survive until the bell': 'Tenir jusqu’à la cloche',
  'Hold off 1 wave': 'Repousser 1 vague',
  'Hold off {n} waves': 'Repousser {n} vagues',
  'Defeat {name}': 'Vaincre {name}',
  'the target': 'la cible',
  'Take the prize from {name}': 'Prendre le butin de {name}',
  'its bearer': 'son porteur',
  'Keep {name} alive': 'Garder {name} en vie',
  'the escort': 'l’escorte',
  'Escape — reach the exit': 'Évasion — atteindre la sortie',
  'Until the bell': 'Jusqu’à la cloche',
  'The deadline': 'Le temps imparti',
  'The horde is spent': 'La horde est épuisée',
  '{steps} of {distance} steps to the exit': '{steps} pas sur {distance} vers la sortie',
  'Objective target': 'Cible de la mission',
  'Turn order': 'Ordre des tours',
  Next: 'Ensuite',
  WAVE: 'VAGUE',
  'WAVE {n}/{total} CLEARED': 'VAGUE {n}/{total} REPOUSSÉE',
  'That blow struck a weakness: {mult} damage.': 'Ce coup a frappé une faiblesse : dégâts {mult}.',
  'Each beats the next. The other way round, a blow is resisted ({mult}).':
    'Chacun l’emporte sur le suivant. Dans l’autre sens, le coup est encaissé ({mult}).',
  'Got it': 'Compris',
} satisfies Record<string, string>
