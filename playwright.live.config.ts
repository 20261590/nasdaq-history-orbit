import { defineConfig } from '@playwright/test'
import main from './playwright.config'

export default defineConfig({
  ...main,
  testDir: './tests/live',
  timeout: 120_000,
  reporter: [['list']],
})
