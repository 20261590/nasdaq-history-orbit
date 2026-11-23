import type { Page } from '@playwright/test'

export async function observeReleasePage(page: Page): Promise<readonly string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.defineProperty(window, '__rcCsp', { value: violations })
    document.addEventListener('securitypolicyviolation', event => {
      violations.push(`${event.effectiveDirective}:${event.blockedURI}`)
    })
  })
  return errors
}
