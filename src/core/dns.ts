import ipaddr from 'ipaddr.js'
import { z } from 'zod'
import { isPublicIp, publicHostname } from './network'

const dnsSchema = z.object({
  Status: z.number().int().nonnegative(),
  TC: z.boolean().optional(),
  Answer: z.array(z.object({
    name: z.string(),
    type: z.number().int(),
    data: z.string(),
  })).max(256).optional(),
})

export interface DnsResult {
  readonly addresses: readonly string[]
  readonly error?: string
}

/** Safe diagnostics contain DNS codes and categories, never queried history data. */
export function inspectDns(input: unknown): DnsResult {
  const parsed = dnsSchema.safeParse(input)
  if (!parsed.success) return { addresses: [], error: 'Malformed DNS response' }
  if (parsed.data.Status !== 0) return { addresses: [], error: `DNS status ${parsed.data.Status}` }
  if (parsed.data.TC) return { addresses: [], error: 'Truncated DNS response' }
  const addresses = new Set<string>()
  for (const answer of parsed.data.Answer ?? []) {
    if (!publicHostname(answer.name)) continue
    switch (answer.type) {
      case 1:
        if (ipaddr.IPv4.isValidFourPartDecimal(answer.data) && isPublicIp(answer.data)) {
          addresses.add(ipaddr.parse(answer.data).toString())
        }
        break
      case 28:
        if (ipaddr.IPv6.isValid(answer.data) && isPublicIp(answer.data)) {
          addresses.add(ipaddr.parse(answer.data).toString())
        }
        break
      case 5:
        if (!publicHostname(answer.data)) return { addresses: [], error: 'Invalid DNS CNAME target' }
        break
      default:
        break
    }
  }
  const ordered = [...addresses].sort((a, b) => {
    const left = ipaddr.parse(a).toByteArray()
    const right = ipaddr.parse(b).toByteArray()
    // IPv4 first, then numeric address order. RR rotation must not select a different location.
    return left.length - right.length
      || left.reduce((difference, byte, index) => difference || byte - right[index], 0)
  })
  return addresses.size ? { addresses: ordered }
    : { addresses: [], error: 'No public DNS address answers' }
}
