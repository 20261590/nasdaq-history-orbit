# History Orbit static deployment

2026-11-16 RC. The application requires a static file host and browser access to Google DNS and GeoJS. It has no application backend, serverless function, API proxy, uploaded-history endpoint, or server-side short-link store. No remote deployment was performed. A hosting account, destination and authority to publish were not supplied.

The current deployment configuration targets **GitHub Pages only**. Follow [GITHUB_PAGES.md](GITHUB_PAGES.md) for the Actions workflow, repository-derived base path, activation and destination checks. The local RC header policy below is reference evidence, not a claim about headers supplied by GitHub Pages.

## Build and publish

1. Use the frozen workspace's `bun.lock` with `bun install --frozen-lockfile`. Run `bun run typecheck`, `bun run lint`, `bun run test`, then `bun run build`.
2. Publish **the contents of `dist/` only**. Do not publish the workspace, `node_modules`, tests, evidence, local TLS keys, or QA version builds.
3. Keep `index.html`, all hashed `assets/`, `earth.webp`, `earth-preview.webp`, the retained `earth.jpg`, and `THIRD_PARTY_NOTICES.txt`. The notices and qualified image provenance are documented in [DEPENDENCIES.md](DEPENDENCIES.md).
4. Serve the directory root as `index.html`. The Pages workflow passes its actual `base_path` to Vite as `PAGES_BASE_PATH`; root sites build with `/`, project sites with `/repository/`. Without that environment variable, local/RC builds retain the previous relative `./` behavior.
5. Enable HTTPS with a publicly valid certificate and normal certificate verification. HTTP-to-HTTPS redirects must preserve the URL fragment in browser navigation. No rewrite endpoint is needed for `#v=2&d=...` or legacy v1 links.
6. On GitHub Pages, inspect the actual response policy using [GITHUB_PAGES.md](GITHUB_PAGES.md). The RC policy below is not automatically installed by this workflow. Perform the user checklist in [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md) on the actual destination.

GitHub Pages' ordinary repository configuration does not provide the same arbitrary HTTP header policy as the tested local RC host. Serving files there is not proof of the CSP/security-header configuration below. This task does not introduce another hosting service or a proxy to change that limitation.

## Tested response headers

The local RC test host applied this policy to document and static responses. It is an HTTP header value, not JavaScript, and is not installed on GitHub Pages by the deployment workflow:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://dns.google https://get.geojs.io; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

`unsafe-inline` is limited to styles because Vue/ECharts and positioning use dynamic styling. Scripts do not need `unsafe-inline` or `unsafe-eval`. The application configures Zod's `jitless` mode before constructing application schemas; even its caught eval feature probe otherwise emits a CSP violation.

Only `dns.google` and `get.geojs.io` are allowed external connections. Keep those exact HTTPS endpoints accessible. Provider availability, rate limits, data and CORS policy remain external dependencies. A provider failure must retain valid visits/statistics and show unresolved sites. Do not hide failure by substituting MOCK data.

Do not infer the presence of these headers from an HTML meta tag. `frame-ancestors` and `X-Frame-Options`, for example, need the response configuration. HSTS policy belongs to the actual HTTPS/domain operator and was not applied to an unidentified domain in this task.

## Cache and version updates

- `index.html` and unhashed files, including textures and notices: `Cache-Control: no-cache`, with an ETag or Last-Modified validator. `no-cache` permits storage but requires revalidation before reuse.
- Content-hashed files under `assets/`: `Cache-Control: public, max-age=31536000, immutable`.
- Publish new assets before switching/replacing HTML, or use an atomic deployment. Retain assets needed by open old tabs when the host supports version retention. Do not overwrite an old hashed name with different bytes.
- There is no service worker to update or unregister.

The RC host proved image ETag `304` revalidation and a real A-to-B Vite deployment change in every native/emulated project: the cached browser reloaded revalidated HTML, loaded a new hashed entry, and executed the new version. Those two builds inject a **test-only** version marker and live outside the release `dist/`. They must not be published.

## Privacy at the hosting boundary

The original file, URL path/query and title stay in the browser. Google receives hostnames with EDNS client-subnet suppression; GeoJS receives the queried public IP. Each external service also observes the requester's connection IP. Consent precedes those requests.

The snapshot is in the URL fragment, which is not part of the HTTP request. A link holder can decode it. Anonymous mode still exposes period, aggregate patterns, country/city and coordinates; it is not a guarantee against identification. Browser history, copied links and saved QR PNGs can retain that shared information. There is no server-side revocation.

The application adds no tracking script, cookie/local-storage history store or remote database. Check the actual hosting account for optional injected analytics before enabling it. `New analysis` resets active UI/data state; garbage-collection timing and complete memory erasure are not guaranteed. Closing the tab ends the application session.

## Reproduce the local release matrix

The QA static host is a local test tool, not a production backend. It serves only GET/HEAD static files from the release build plus two controlled QA build copies. It binds `127.0.0.1`, uses a temporary self-signed certificate and never changes OS/browser trust stores.

In terminal A, from the project:

```sh
export RC_TMP="$(mktemp -d "${TMPDIR:-/tmp}/history-orbit-rc.XXXXXX")"
export TMPDIR="$RC_TMP"
export PLAYWRIGHT_BROWSERS_PATH="$RC_TMP/browsers"
export NODE_COMPILE_CACHE="$RC_TMP/node-cache"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$RC_TMP/bun-cache"
bunx playwright install chromium firefox webkit
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "$RC_TMP/key.pem" -out "$RC_TMP/cert.pem" \
  -config tests/release/tls.example.cnf
bun run build
bun tests/release/build-versions.ts
printf '%s\n' "$RC_TMP"
bun tests/release/static-host.ts
```

Keep terminal A running. In terminal B set `RC_TMP` to the exact directory printed by terminal A, set `PLAYWRIGHT_BROWSERS_PATH="$RC_TMP/browsers"`, and run:

```sh
bunx playwright test --config playwright.rc.config.ts
```

Port defaults to 5443; if changing it, set `RC_PORT` for the host and matching `RC_ORIGIN` for the test runner. All five projects ignore certificate errors **only for this local QA context**. The independent local transport probe used `curl --cacert "$RC_TMP/cert.pem"` successfully. Neither action proves a public certificate, deployed hostname, production CDN, or real mobile hardware.

When finished, close the test browsers, stop terminal A with Ctrl-C, verify that its port is closed, and remove only the temporary directory just created. Preserve `docs/evidence/rc/` if keeping the results. Never remove another session's browser profile or caches.
