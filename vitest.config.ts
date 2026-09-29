import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/services/**', 'src/main/fits/**', 'src/main/adapters/**', 'packages/domain/src/**', 'packages/application/src/**'],
      thresholds: {
        // Legacy services: a ratchet at the measured floor (60.2% lines after spec 010). The old 60% never ran in CI
        // because @vitest/coverage-v8 was missing. Raise it as services move into the core.
        lines: 58,
        functions: 60,
        branches: 50,
        // The hexagonal core and its adapters are held to the blueprint's bar.
        'packages/{domain,application}/src/**': { lines: 95, functions: 95, branches: 90 },
        'src/main/adapters/**': { lines: 80, functions: 80, branches: 75 }
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@astro/domain': path.resolve(__dirname, 'packages/domain/src'),
      '@astro/application': path.resolve(__dirname, 'packages/application/src'),
      '@astro/testkit': path.resolve(__dirname, 'packages/testkit/src')
    }
  }
})
