import { defineConfig } from '@playwright/test'
import main from './playwright.config'

export default defineConfig({
  ...main,
  testMatch: 'security-no-deployment-key.spec.ts',
  testIgnore: [],
  reporter: [['list']],
  use: { ...main.use, baseURL: 'http://127.0.0.1:5174' },
  webServer: {
    command: 'bun run dev --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    env: { VITE_SAFE_BROWSING_API_KEY: '' },
  },
})
