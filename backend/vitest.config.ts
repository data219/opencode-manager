import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    alias: {
      'bun:sqlite': fileURLToPath(new URL('./test/helpers/bun-sqlite-shim.ts', import.meta.url)),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    env: {
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_PATH: ':memory:',
      AUTH_SECRET: 'test-secret-for-encryption',
      WORKSPACE_PATH: '/tmp/test-workspace',
    },
  },
})
