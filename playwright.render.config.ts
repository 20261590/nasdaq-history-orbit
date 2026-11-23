import { defineConfig } from '@playwright/test'
import main from './playwright.config'

export default defineConfig({
  ...main,
  testDir: './tests/rendering',
  reporter: [['list']],
  use: { ...main.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    command: 'bun run dev --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175/tests/rendering/benchmark.html',
    reuseExistingServer: true,
  },
})
