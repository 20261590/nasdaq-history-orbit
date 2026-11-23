import { defineConfig, devices } from '@playwright/test'

const phone = devices['iPhone 14']
const mobile = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true,
}
export default defineConfig({
  testDir: './tests/release',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/rc/playwright-results.json' }]],
  use: {
    baseURL: process.env.RC_ORIGIN ?? 'https://127.0.0.1:5443',
    ignoreHTTPSErrors: true,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', channel: 'chromium', ...mobile, userAgent: devices['Pixel 7'].userAgent, launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    { name: 'mobile-webkit', use: { browserName: 'webkit', ...mobile, userAgent: phone.userAgent } },
  ],
})
