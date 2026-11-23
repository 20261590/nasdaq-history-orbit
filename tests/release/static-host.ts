import { createServer } from 'node:https'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { createHash } from 'node:crypto'

const temp = process.env.RC_TMP
if (!temp) throw new TypeError('RC_TMP must identify the owned release QA directory')
const root = resolve(process.cwd(), 'dist')
const mime: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
}
const policy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "connect-src 'self' https://dns.google https://get.geojs.io",
  "font-src 'self'", "worker-src 'self' blob:", "object-src 'none'",
  "base-uri 'self'", "frame-ancestors 'none'", "form-action 'none'",
].join('; ')
const server = createServer({
  key: await readFile(resolve(temp, 'key.pem')),
  cert: await readFile(resolve(temp, 'cert.pem')),
}, async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end()
      return
    }
    const url = new URL(request.url ?? '/', 'https://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/history-orbit' || pathname === '/versioned') {
      response.writeHead(308, { Location: pathname + '/' + url.search }).end()
      return
    }
    let directory = root
    if (pathname.startsWith('/history-orbit/')) pathname = pathname.slice('/history-orbit'.length)
    if (pathname.startsWith('/versioned/')) {
      const active = (await readFile(resolve(temp, 'active-version'), 'utf8')).trim()
      if (active !== 'A' && active !== 'B') throw new TypeError('Invalid QA deployment version')
      directory = resolve(temp, 'versions', active)
      pathname = pathname.slice('/versioned'.length)
    }
    const file = resolve(directory, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname))
    if (!file.startsWith(directory + sep)) { response.writeHead(403).end(); return }
    if (!(await stat(file)).isFile()) { response.writeHead(404).end(); return }
    const bytes = await readFile(file)
    const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"'
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    const headers = {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Cache-Control': cache, ETag: etag,
    }
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers).end()
      return
    }
    response.writeHead(200, headers)
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      response.writeHead(404).end()
    } else if (error instanceof URIError) {
      response.writeHead(400).end()
    } else {
      response.writeHead(500).end()
      if (error instanceof Error) process.stderr.write(`RC_STATIC_ERROR ${error.name}\n`)
      else throw error
    }
  }
})
server.listen(Number(process.env.RC_PORT ?? 5443), '127.0.0.1', () => {
  process.stdout.write(`RC_HTTPS_READY ${JSON.stringify(server.address())}\n`)
})
process.on('SIGTERM', () => { server.close(() => process.exit(0)); server.closeAllConnections() })
