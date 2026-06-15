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
  // `**` with a fractional exponent is the same transcendental hazard as Math.pow.
  { pattern: /\*\*\s*[\d.]*\.\d/, label: '** with fractional exponent' },
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
})
