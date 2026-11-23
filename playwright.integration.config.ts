import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/integration',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5181',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run build && bun tests/integration/serve.mjs',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    { name: 'firefox-desktop', testMatch: /(?:flow|image-lifecycle)\.spec\.ts/u, use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 }, colorScheme: 'light' } },
    { name: 'webkit-mobile', testMatch: /(?:flow|image-lifecycle)\.spec\.ts/u, use: { ...devices['iPhone 14'], browserName: 'webkit', colorScheme: 'light' } },
    { name: 'chromium-mobile', testMatch: /(?:flow|image-lifecycle)\.spec\.ts/u, use: { ...devices['Pixel 7'], browserName: 'chromium', colorScheme: 'dark', launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
  ],
})
