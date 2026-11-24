import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalizeUrl } from '../../src/features/security/safe-browsing/canonicalize'
import { hashUrl, urlExpressions } from '../../src/features/security/safe-browsing/protocol'
import { SafeBrowsingError } from '../../src/features/security/safe-browsing/types'

// Official v4 normalization vectors also apply to v5 (the suffix rules do not).
const normalizationVectors = [
  ['http://host/%25%32%35', 'http://host/%25'],
  ['http://host/%25%32%35%25%32%35', 'http://host/%25%25'],
  ['http://host/%2525252525252525', 'http://host/%25'],
  ['http://host/asdf%25%32%35asd', 'http://host/asdf%25asd'],
  ['http://host/%%%25%32%35asd%%', 'http://host/%25%25%25asd%25%25'],
  ['http://www.google.com/', 'http://www.google.com/'],
  ['http://%31%36%38%2e%31%38%38%2e%39%39%2e%32%36/%2E%73%65%63%75%72%65/%77%77%77%2E%65%62%61%79%2E%63%6F%6D/', 'http://168.188.99.26/.secure/www.ebay.com/'],
  ['http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/', 'http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/'],
  ['http://host%23.com/%257Ea%2521b%2540c%2523d%2524e%25f%255E00%252611%252A22%252833%252944_55%252B', 'http://host%23.com/~a!b@c%23d$e%25f^00&11*22(33)44_55+'],
  ['http://3279880203/blah', 'http://195.127.0.11/blah'],
  ['http://www.google.com/blah/..', 'http://www.google.com/'],
  ['www.google.com/', 'http://www.google.com/'],
  ['www.google.com', 'http://www.google.com/'],
  ['http://www.evil.com/blah#frag', 'http://www.evil.com/blah'],
  ['http://www.GOOgle.com/', 'http://www.google.com/'],
  ['http://www.google.com.../', 'http://www.google.com/'],
  ['http://www.google.com/foo\tbar\rbaz\n2', 'http://www.google.com/foobarbaz2'],
  ['http://www.google.com/q?', 'http://www.google.com/q?'],
  ['http://www.google.com/q?r?', 'http://www.google.com/q?r?'],
  ['http://www.google.com/q?r?s', 'http://www.google.com/q?r?s'],
  ['http://evil.com/foo#bar#baz', 'http://evil.com/foo'],
  ['http://evil.com/foo;', 'http://evil.com/foo;'],
  ['http://evil.com/foo?bar;', 'http://evil.com/foo?bar;'],
  ['http://\x01\x80.com/', 'http://%01%80.com/'],
  ['http://notrailingslash.com', 'http://notrailingslash.com/'],
  ['http://www.gotaport.com:1234/', 'http://www.gotaport.com/'],
  ['  http://www.google.com/  ', 'http://www.google.com/'],
  ['http:// leadingspace.com/', 'http://%20leadingspace.com/'],
  ['http://%20leadingspace.com/', 'http://%20leadingspace.com/'],
  ['%20leadingspace.com/', 'http://%20leadingspace.com/'],
  ['https://www.securesite.com/', 'https://www.securesite.com/'],
  ['http://host.com/ab%23cd', 'http://host.com/ab%23cd'],
  ['http://host.com//twoslashes?more//slashes', 'http://host.com/twoslashes?more//slashes'],
] as const

const additionalVectors = [
  ['https://user:secret@..EXAMPLE...com.:8443/a/./b/../c//?x=/../a//b#gone', 'https://example.com/a/c/?x=/../a//b'],
  ['http://bücher.de/café/雪', 'http://xn--bcher-kva.de/caf%C3%A9/%E9%9B%AA'],
  ['http://%62%C3%BCcher.de/%FF%C0%AF%80', 'http://xn--bcher-kva.de/%FF%C0%AF%80'],
  ['http://host%E9%FF.com/%C3%A9', 'http://host%E9%FF.com/%C3%A9'],
  ['http://ＥＸＡＭＰＬＥ。ＣＯＭ。/', 'http://example.com/'],
  ['http://user%253asecret%2540HOST%253a80%252fa%253fq=1', 'http://host/a?q=1'],
  ['http://host/a%252fb%252f..%252fc%253fq=one%2523two#removed%2F..', 'http://host/a/c?q=one%23two'],
  ['http://host/%00%09%0a%0D%20%7f%ff%23%25', 'http://host/%00%09%0A%0D%20%7F%FF%23%25'],
  ['http://host/a%3Fb/../c//?q=/./../#gone', 'http://host/a?b/../c//?q=/./../'],
  ['http://host/a/%2E%2e', 'http://host/'],
  ['http://host/../../a/../b/.', 'http://host/b/'],
  ['http://0xC3.0177.0.013/blah', 'http://195.127.0.11/blah'],
  ['http://0303.0177.013/', 'http://195.127.0.11/'],
  ['http://0xc37f000b/', 'http://195.127.0.11/'],
  ['http://195.8323083/', 'http://195.127.0.11/'],
  ['http://[2001:0DB8:0000::1]:443/a', 'http://[2001:db8::1]/a'],
  ['http://[2001:0:0:1:0:0:0:1]/', 'http://[2001:0:0:1::1]/'],
  ['http://[2001:0:0:1:0:0:1:1]/', 'http://[2001::1:0:0:1:1]/'],
  ['http://[::ffff:1.2.3.4]/1/', 'http://1.2.3.4/1/'],
  ['http://[0:0:0:0:0:ffff:0102:0304]/', 'http://1.2.3.4/'],
  ['http://[64:ff9b::1.2.3.4]/', 'http://1.2.3.4/'],
  ['http://[0064:ff9b:0:0:0:0:0102:0304]/', 'http://1.2.3.4/'],
  ['http://[64:ff9b:1::102:304]/', 'http://[64:ff9b:1::102:304]/'],
] as const

const expressionVectors = [
  {
    raw: 'http://a.b.com/1/2.html?param=1',
    hosts: ['a.b.com', 'b.com'],
    paths: ['/1/2.html?param=1', '/1/2.html', '/', '/1/'],
  },
  {
    raw: 'http://a.b.c.d.e.f.com/1.html',
    hosts: ['a.b.c.d.e.f.com', 'f.com', 'e.f.com', 'd.e.f.com', 'c.d.e.f.com'],
    paths: ['/1.html', '/'],
  },
  { raw: 'http://1.2.3.4/1/', hosts: ['1.2.3.4'], paths: ['/1/', '/'] },
  { raw: 'http://example.co.uk/1', hosts: ['example.co.uk'], paths: ['/1', '/'] },
  {
    raw: 'https://u:p@a.b.c.d.e.f.example.co.uk:443/1/2/3/4/5.html?',
    hosts: ['a.b.c.d.e.f.example.co.uk', 'example.co.uk', 'f.example.co.uk', 'e.f.example.co.uk', 'd.e.f.example.co.uk'],
    paths: ['/1/2/3/4/5.html?', '/1/2/3/4/5.html', '/', '/1/', '/1/2/', '/1/2/3/'],
  },
  {
    raw: 'http://a.b.c.d.e.f.tenant.blogspot.com/1',
    hosts: ['a.b.c.d.e.f.tenant.blogspot.com', 'tenant.blogspot.com', 'f.tenant.blogspot.com', 'e.f.tenant.blogspot.com', 'd.e.f.tenant.blogspot.com'],
    paths: ['/1', '/'],
  },
  {
    raw: 'https://a.b.spark-public.s3.amazonaws.com/a/',
    hosts: ['a.b.spark-public.s3.amazonaws.com', 'spark-public.s3.amazonaws.com', 'b.spark-public.s3.amazonaws.com'],
    paths: ['/a/', '/'],
  },
  { raw: 'http://localhost/?', hosts: ['localhost'], paths: ['/?', '/'] },
  { raw: 'http://co.uk/', hosts: ['co.uk'], paths: ['/'] },
  { raw: 'http://a.b.example.com/a/b/', hosts: ['a.b.example.com', 'example.com', 'b.example.com'], paths: ['/a/b/', '/', '/a/'] },
  { raw: 'http://[2001:db8::1]/1/', hosts: ['[2001:db8::1]'], paths: ['/1/', '/'] },
  { raw: 'http://[::ffff:1.2.3.4]/1/', hosts: ['1.2.3.4'], paths: ['/1/', '/'] },
  { raw: 'http://[64:ff9b::1.2.3.4]/1/', hosts: ['1.2.3.4'], paths: ['/1/', '/'] },
  { raw: 'http://１２７。０。０。１/1/', hosts: ['127.0.0.1'], paths: ['/1/', '/'] },
  { raw: 'http://host/a%23b?x=%ff%25#gone', hosts: ['host'], paths: ['/a%23b?x=%FF%25', '/a%23b', '/'] },
] as const

describe('Safe Browsing v5 canonicalization', () => {
  it.each(normalizationVectors)('normalizes official vector %s', (raw, expected) => {
    expect(canonicalizeUrl(raw).url).toBe(expected)
  })

  it.each(additionalVectors)('normalizes v5 and byte-boundary vector %s', (raw, expected) => {
    expect(canonicalizeUrl(raw).url).toBe(expected)
  })

  it('returns canonical components with an empty query distinct from absent query', () => {
    expect(canonicalizeUrl('HTTPS://user:secret@[::ffff:1.2.3.4]:443/a//b?')).toEqual({
      url: 'https://1.2.3.4/a/b?', host: '1.2.3.4', path: '/a/b', query: '', isIp: true,
    })
  })

  it('returns a domain and absent query after discarding a fragment', () => {
    expect(canonicalizeUrl('http://EXAMPLE.com/path#?secret')).toEqual({
      url: 'http://example.com/path', host: 'example.com', path: '/path', query: null, isIp: false,
    })
  })

  it.each(['', 'http://', 'https://user:secret@/x', 'ftp://secret.example/x',
    'http://[bad]/', 'http://[::1', 'http://[fe80::1%25eth0]/', 'http://host:secret/', 'http://host:65536/'])(
    'rejects invalid URL without exposing its input: %s', (raw) => {
      expect(() => canonicalizeUrl(raw)).toThrowError(new SafeBrowsingError('INVALID_URL'))
    },
  )
})
describe('Safe Browsing v5 expressions and SHA256 protocol', () => {
  it.each(expressionVectors)('generates the complete expression set for $raw', ({ raw, hosts, paths }) => {
    const expected = hosts.flatMap((host) => paths.map((path) => host + path))
    expect([...urlExpressions(raw)].sort()).toEqual([...expected].sort())
  })

  it('checks the independent SHA256 oracle against FIPS 180-2 example B1', async () => {
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(createHash('sha256').update('abc').digest('hex')).toBe(expected)
    const web = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'))
    expect(Buffer.from(web).toString('hex')).toBe(expected)
  })

  it.each(expressionVectors)('hashes every full expression with a four-byte base64 prefix for $raw', async ({ raw, hosts, paths }) => {
    const expected = hosts.flatMap((host) => paths.map((path) => {
      const digest = createHash('sha256').update(host + path, 'utf8').digest()
      return { fullHash: digest.toString('base64'), prefix: digest.subarray(0, 4).toString('base64') }
    }))
    const hashes = await hashUrl(raw)
    expect([...hashes].sort((a, b) => a.fullHash.localeCompare(b.fullHash)))
      .toEqual(expected.sort((a, b) => a.fullHash.localeCompare(b.fullHash)))
  })

  it('propagates only the redacted invalid URL error through hashing', async () => {
    await expect(hashUrl('https://user:secret@/private')).rejects.toEqual(new SafeBrowsingError('INVALID_URL'))
  })
})
