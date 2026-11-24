import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { selectSafeBrowsingApiKey } from '../../src/features/security/safe-browsing/api-key'

describe('Safe Browsing deployment key configuration', () => {
  it('prefers the deployment key and supports personal or missing fallbacks', () => {
    expect(selectSafeBrowsingApiKey(' deployed-key ', 'personal-key'))
      .toEqual({ key: 'deployed-key', source: 'deployment' })
    expect(selectSafeBrowsingApiKey(undefined, ' personal-key '))
      .toEqual({ key: 'personal-key', source: 'personal' })
    expect(selectSafeBrowsingApiKey(' ', ' '))
      .toEqual({ key: '', source: 'missing' })
  })

  it('passes only the named GitHub secret to Vite and warns when it is absent', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8')
    expect(workflow).toContain('VITE_SAFE_BROWSING_API_KEY: ${{ secrets.SAFE_BROWSING_API_KEY }}')
    expect(workflow).toContain('SAFE_BROWSING_API_KEY is not configured')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('Test with mocks and no deployment key')
    expect(workflow.match(/secrets\.SAFE_BROWSING_API_KEY/gu)).toHaveLength(1)
    expect(workflow).not.toMatch(/VITE_SAFE_BROWSING_API_KEY:\s*AIza[\w-]+/u)
  })
})
