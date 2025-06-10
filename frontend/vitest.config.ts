import viteConfig from './vite.config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  ...viteConfig,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
