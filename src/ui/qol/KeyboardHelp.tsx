import { PixelWindow } from '../kit'
import { t } from '../i18n/i18n'
import './qol.css'

/** Every keyboard shortcut in the game, grouped by where it works. */
const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: 'Anywhere (outside battles and windows)',
    keys: [
      [['T'], 'The Tower'],
      [['P'], 'Party Board'],
      [['R'], 'Hero Registry'],
      [['U', 'G'], 'Mobius Summon'],
      [['L', '⌫'], 'Back to the Lobby'],
      [['M', 'Esc'], 'Menu'],
      [['?'], 'This list'],
    ],
  },
  {
    title: 'In the Lobby',
    keys: [
      [['↑↓←→', 'WASD', 'ZQSD'], 'Walk'],
      [['E', 'Space', 'Enter'], 'Talk / use what you face'],
      [['H'], 'Where is everyone?'],
      [['B'], 'Construction: build and upgrade'],
      [['N'], 'Map'],
    ],
  },
  {
    title: 'On the Party Board',
    keys: [
      [['Tab'], 'Move between heroes and slots'],
      [['1', '–', '5'], 'Place the focused hero in that slot'],
      [['Enter', 'Space'], 'Add or remove the focused hero'],
      [['Del'], 'Take a focused slot’s hero off the board'],
    ],
  },
  {
    title: 'In battle',
    keys: [
      [['Space'], 'Pause / play'],
      [['1', '2', '3'], 'Speed 1× / 2× / 4×'],
      [['S'], 'Skip to the end'],
      [['F'], 'Focus: every hero on the foe you pick'],
      [['P'], 'Protect: foes look past the hero you pick'],
      [['U'], 'Unleash: the hero you pick acts now, all out'],
      [['G'], 'Guard: the party braces for the big blow'],
      [['H'], 'Hold: keep SP for a crowd or the boss'],
      [['X'], 'Swap: two heroes trade places'],
      [['R'], 'Retreat (press twice)'],
      [['Esc'], 'Put an order away'],
    ],
  },
  {
    title: 'Windows and dialogue',
    keys: [
      [['Esc'], 'Close the window'],
      [['Space', 'Enter', 'E'], 'Next line'],
    ],
  },
]

export function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <PixelWindow title={t('Keyboard shortcuts')} icon="⌨" onClose={onClose}>
      <div className="qol-keys">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="panel-sub">{t(g.title)}</div>
            {g.keys.map(([ks, what]) => (
              <div key={what} className="qol-key-row">
                <span className="qol-kbds">
                  {ks.map((k) => (k === '–' ? <span key={k}>–</span> : <kbd key={k}>{k}</kbd>))}
                </span>
                <span>{t(what)}</span>
              </div>
            ))}
          </section>
        ))}
        <p className="muted qol-keys-foot">{t('Battles show their keys on their buttons too.')}</p>
      </div>
    </PixelWindow>
  )
}
