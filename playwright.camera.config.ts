import { defineConfig } from '@playwright/test'
import main from './playwright.config'

export default defineConfig({
  ...main,
  testDir: './tests/camera',
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/motion/browser-tests.json' }]],
  use: { ...main.use, baseURL: 'http://127.0.0.1:5178' },
  webServer: {
    command: 'bun run dev --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178/tests/camera/index.html',
    reuseExistingServer: true,
  },
})
