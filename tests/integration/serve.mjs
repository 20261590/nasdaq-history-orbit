import { file, serve } from 'bun'
import { join } from 'node:path'

// Test-only static hosting of the ordinary build, with a Pages-style mount.
const dist = join(import.meta.dirname, '../../dist')
const routes = {}
for (const base of ['', '/__integration_qa__']) {
  routes[`${base}/`] = new globalThis.Response(file(join(dist, 'index.html')))
  routes[`${base}/assets/*`] = { dir: join(dist, 'assets') }
  for (const asset of ['earth.webp', 'earth-preview.webp', 'THIRD_PARTY_NOTICES.txt']) {
    routes[`${base}/${asset}`] = new globalThis.Response(file(join(dist, asset)))
  }
}
serve({ hostname: '127.0.0.1', port: 5181, routes })
