import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Production chunking. One 900 kB bundle made Vite warn (> 500 kB) and meant
 * any one-line UI change re-downloaded the whole game. Split along the
 * architecture instead of raising the limit:
 *   - `vendor`: react, react-dom, scheduler, @fontsource (changes on upgrades only)
 *   - `engine`: the pure deterministic engine incl. content (src/engine)
 *   - `i18n`: the EN/FR string tables and translator (src/ui/i18n)
 *   - `art`: the code-generated pixel art (src/ui/pixel) and the lobby map
 *   - the rest of the UI stays in the entry chunk (src/ui, src/main.tsx)
 * The chunks import one way only (entry -> art/i18n -> engine/vendor), no loops.
 * The dev sprite gallery (?gallery) is lazy-loaded from App.tsx, so it is its
 * own small chunk a player never downloads. Every chunk is statically imported
 * by the entry (apart from the gallery), so this changes caching, not behaviour.
 */
function chunkFor(id: string): string | undefined {
  const path = id.replace(/\\/g, '/')
  if (path.includes('/node_modules/')) return 'vendor'
  if (path.includes('/src/engine/')) return 'engine'
  if (path.includes('/src/ui/i18n/')) return 'i18n'
  if (path.includes('/src/ui/pixel/') || path.endsWith('/src/ui/world/lobbyMap.ts')) return 'art'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: chunkFor,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
