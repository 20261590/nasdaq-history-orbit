export type SafeBrowsingApiKeySource = 'deployment' | 'personal' | 'missing'

export interface SafeBrowsingApiKeySelection {
  readonly key: string
  readonly source: SafeBrowsingApiKeySource
}

export function selectSafeBrowsingApiKey(
  deploymentKey: string | undefined,
  personalKey: string,
): SafeBrowsingApiKeySelection {
  const deployment = deploymentKey?.trim() ?? ''
  if (deployment) return { key: deployment, source: 'deployment' }
  const personal = personalKey.trim()
  return personal ? { key: personal, source: 'personal' } : { key: '', source: 'missing' }
}

/** Vite replaces this value at build time. A non-empty value is public in the generated JavaScript. */
export const deploymentSafeBrowsingApiKey =
  selectSafeBrowsingApiKey(import.meta.env.VITE_SAFE_BROWSING_API_KEY, '').key
