import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

/**
 * Lint-style guard: no runtime import cycles in the app (src/ui, src/engine and the
 * edges between them).
 *
 * A cycle between modules works only while each side touches the other at render
 * time; the first top-level use (a const built from an import, a class extending one)
 * becomes a "cannot access before initialization" crash that depends on which module
 * the bundler happens to evaluate first. The facilityPanels <-> legacy/MemorialPanel
 * cycle was one; UpgradeControl now lives in its own module.
 *
 * Only runtime edges count: `import type …`, `export type … from` and imports whose
 * every specifier is `type X` are erased by the compiler, and dynamic `import()` is
 * lazy by construction. Test files are not part of the app and are skipped. Imports are
 * read with the TypeScript parser, not a regex, so no layout of the source can hide one.
 */

const SRC = resolve(__dirname, '..')
const ROOTS = [join(SRC, 'ui'), join(SRC, 'engine')]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return null
}

/** Module specifiers this source imports (or re-exports) at runtime, in order. */
export function runtimeImports(source: string, fileName = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const specs: string[] = []
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause
      if (c?.isTypeOnly) continue // import type { … }
      const named = c?.namedBindings
      // import { type A, type B } (no default): erased too.
      if (c && !c.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)) continue
      specs.push(st.moduleSpecifier.text) // includes side-effect imports: `import './x.css'`
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (st.isTypeOnly) continue // export type { … } from
      const ex = st.exportClause
      if (ex && ts.isNamedExports(ex) && ex.elements.length > 0 && ex.elements.every((e) => e.isTypeOnly)) continue
      specs.push(st.moduleSpecifier.text)
    }
  }
  return specs
}

/** Strongly connected components with more than one module (or a self-import): the cycles. */
function cycles(files: string[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const f of files) {
    const deps = runtimeImports(readFileSync(f, 'utf8'), f)
      .map((s) => resolveImport(f, s))
      .filter((p): p is string => p !== null && ROOTS.some((r) => p.startsWith(r)) && /\.(ts|tsx)$/.test(p))
    graph.set(f, deps)
  }
  // Tarjan's SCC.
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const on = new Set<string>()
  const out: string[][] = []
  const visit = (v: string) => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    on.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (on.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        on.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) out.push(comp.map((p) => relative(SRC, p)).sort())
    }
  }
  for (const f of graph.keys()) if (!idx.has(f)) visit(f)
  return out
}

describe('app import graph (src/ui + src/engine)', () => {
  it('reads runtime edges only', () => {
    expect(runtimeImports("import { A } from './a'\nimport type { B } from './b'\nimport { type C } from './c'")).toEqual(['./a'])
    expect(runtimeImports("export { X } from './x'\nexport type { Y } from './y'\nimport './z.css'")).toEqual(['./x', './z.css'])
    expect(runtimeImports("import D, { type E } from './d'\n// import { F } from './f'\n/* import { G } from './g' */")).toEqual(['./d'])
    // A type alias with braces right before a re-export (no quote or semicolon between)
    // used to swallow the re-export under a regex reader.
    expect(runtimeImports("export type T = { a: number }\nexport { H } from './h'")).toEqual(['./h'])
    // Prose and dynamic imports are not edges.
    expect(runtimeImports("const s = `import { I } from './i'`\nconst L = () => import('./l')")).toEqual([])
  })

  it('has no import cycles', () => {
    const files = ROOTS.flatMap(sourceFiles)
    expect(files.length).toBeGreaterThan(150) // the walk really sees the app
    expect(cycles(files)).toEqual([])
  })

  it('keeps UpgradeControl out of the facilityPanels <-> MemorialPanel loop', () => {
    const memorial = readFileSync(join(SRC, 'ui/legacy/MemorialPanel.tsx'), 'utf8')
    expect(runtimeImports(memorial)).not.toContain('../facilityPanels')
  })
})
