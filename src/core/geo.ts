import ipaddr from 'ipaddr.js'
import { z } from 'zod'
import type { GeoLocation } from '../model'
import { inspectDns } from './dns'
import { isPublicIp } from './network'

export { isPublicIp } from './network'
export { LocationEngine } from './location-engine'
export { describeLocation } from './location-display'

/** Keep only typed, public address answers; CNAME targets are never treated as IPs. */
export function parseDns(input: unknown): readonly string[] {
  return inspectDns(input).addresses
}

const numeric = z.union([
  z.number().finite(),
  z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u).transform(Number),
]).pipe(z.number().finite())
const geoSchema = z.object({
  latitude: numeric.pipe(z.number().min(-90).max(90)),
  longitude: numeric.pipe(z.number().min(-180).max(180)),
  ip: z.string().optional(),
  country: z.string().trim().min(1),
  country_code: z.string().regex(/^[a-z]{2}$/iu),
  region: z.string().optional(),
  city: z.string().optional(),
  accuracy: numeric.pipe(z.number().nonnegative()).nullish(),
  accuracy_radius: numeric.pipe(z.number().nonnegative()).nullish(),
  accuracyRadiusKm: numeric.pipe(z.number().nonnegative()).nullish(),
  asn: z.union([z.string(), z.number().int().nonnegative()]).optional(),
  organization: z.string().optional(),
  organization_name: z.string().optional(),
})

/** GeoJS supplies no accuracy guarantee; absent radii remain explicitly unknown. */
export function parseGeo(input: unknown): GeoLocation | null {
  const parsed = geoSchema.safeParse(input)
  if (!parsed.success) return null
  const geo = parsed.data
  if (geo.ip !== undefined && !isPublicIp(geo.ip)) return null
  const rawAsn = geo.asn === undefined ? geo.organization?.match(/^AS\d+\b/u)?.[0] : String(geo.asn)
  const asn = rawAsn === undefined || /^(?:AS)?64512$/iu.test(rawAsn) ? undefined : rawAsn
  const organization = geo.organization_name ?? geo.organization
  return {
    latitude: geo.latitude, longitude: geo.longitude,
    country: geo.country, countryCode: geo.country_code.toUpperCase(),
    accuracyRadiusKm: geo.accuracy ?? geo.accuracy_radius ?? geo.accuracyRadiusKm ?? null,
    ...(geo.ip === undefined ? {} : { ip: ipaddr.parse(geo.ip).toString() }),
    ...(geo.region === undefined ? {} : { region: geo.region }),
    ...(geo.city === undefined ? {} : { city: geo.city }),
    ...(asn === undefined ? {} : { asn }),
    ...(organization === undefined ? {} : { organization }),
  }
}
