import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Determinism guard: the engine must contain NO source of nondeterminism.
 * Banned everywhere in src/engine (outside tests):
 *   - Math.random, Date.now, new Date(), performance.now, crypto.getRandomValues
 *   - transcendental Math.* (pow/exp/log/sin/cos/...) — IEEE-754 does not mandate
 *     bit-identical results across JS engines, which would break replay.
 *
 * The single allowed entropy point (the bootstrap seed source) lives OUTSIDE the
 * engine. Any legitimate exception must be added to ALLOW with a justification.
 */

const engineDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /\bMath\.random\b/, label: 'Math.random' },
  { pattern: /\bDate\.now\b/, label: 'Date.now' },
  { pattern: /\bnew Date\b/, label: 'new Date()' },
  { pattern: /\bperformance\.now\b/, label: 'performance.now' },
  { pattern: /\bcrypto\.getRandomValues\b/, label: 'crypto.getRandomValues' },
  { pattern: /\bMath\.pow\b/, label: 'Math.pow' },
  { pattern: /\bMath\.exp\b/, label: 'Math.exp' },
  { pattern: /\bMath\.log\b/, label: 'Math.log' },
  { pattern: /\bMath\.sin\b/, label: 'Math.sin' },
  { pattern: /\bMath\.cos\b/, label: 'Math.cos' },
  { pattern: /\bMath\.tan\b/, label: 'Math.tan' },
  // The rest of the transcendental family (`\bMath\.log\b` does not match Math.log2).
  { pattern: /\bMath\.(?:log2|log10|log1p|expm1|a?sinh?|a?cosh?|a?tanh?|atan2|hypot|cbrt)\b/, label: 'transcendental Math.*' },
  // `**` with a fractional exponent is the same transcendental hazard as Math.pow.
  { pattern: /\*\*\s*[\d.]*\.\d/, label: '** with fractional exponent' },
  // …and so is `**` with a NON-LITERAL exponent (`level ** M.xpExp` slipped past the rule
  // above for months): a variable may hold a fraction, and even integer powers are only
  // approximated by the spec. Use an integer table or a multiply loop. Only a plain
  // integer literal exponent (`x ** 2`) is allowed.
  { pattern: /\*\*=?\s*(?![\s\d])/, label: '** with a non-literal exponent' },
]

/** The guard's own patterns, tried on known-good and known-bad snippets. */
const GOOD_SNIPPETS = ['const a = x ** 2', 'const b = 2 ** 10', 'n ** 3 + 1', '/** a doc comment */ const c = 1', 'Math.sqrt(x) + Math.sign(y) + Math.floor(z)']
const BAD_SNIPPETS = [
  'Math.round(M.xpCoeff * level ** M.xpExp)',
  'F.costGrowth ** level',
  'x ** (a + b)',
  'x **= y',
  'x ** -1',
  'x ** 0.5',
  'x ** .5',
  'Math.pow(x, 2)',
  'Math.log2(n)',
  'Math.atan2(y, x)',
  'Math.hypot(a, b)',
]

/** Files explicitly allowed to use a listed construct, with the reason. */
const ALLOW: Record<string, string[]> = {
  // none yet — the engine is fully integer/lookup-based.
}

/** Strip block + line comments so a banned token mentioned in a docstring (e.g.
 *  "no Math.random") is not a false positive. Heuristic, not a full parser. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue
      out.push(full)
    }
  }
  return out
}

describe('engine determinism guard', () => {
  it('contains no banned nondeterministic constructs', () => {
    const violations: string[] = []
    for (const file of tsFiles(engineDir)) {
      const rel = file.slice(engineDir.length + 1)
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const { pattern, label } of BANNED) {
        if (pattern.test(src) && !ALLOW[rel]?.includes(label)) {
          violations.push(`${rel}: ${label}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('its patterns catch fractional and non-literal powers but allow integer literals', () => {
    const flagged = (snippet: string) => BANNED.filter(({ pattern }) => pattern.test(stripComments(snippet))).map((b) => b.label)
    for (const s of GOOD_SNIPPETS) expect(flagged(s), s).toEqual([])
    for (const s of BAD_SNIPPETS) expect(flagged(s).length, s).toBeGreaterThan(0)
  })
})
