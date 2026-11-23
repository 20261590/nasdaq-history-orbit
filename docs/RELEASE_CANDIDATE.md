# History Orbit Phase 3 Release Candidate

Validation date: 2026-11-16, macOS 26 / Apple M5, Bun 1.4.3, Playwright 1.65.1.

**Software RC acceptance: PASS. Independent final gate: APPROVE, MEDIUM confidence, zero blockers.** The [integrated review](evidence/rc/gate-review.md) covers the documented local software boundary. The existing three features are preserved: geographic history playback, complete-history statistics, and compressed snapshot URL/QR sharing. This is a technical static-deployment candidate; no remote host was published.

## Scope and current tree

The workspace is not a Git repository: `git status --short --branch` returned exit 128. No repository was initialized, no commit created and no remote push performed. A scoped file baseline was captured before RC edits; [source-changes.json](evidence/rc/source-changes.json) records the file comparison rather than claiming a Git diff.

The only application code change is `src/validation-config.ts` plus its first import in `src/main.ts`. All 15 initial HTTPS/CSP cases reached their feature/provider checks but failed on `script-src:eval`. Zod 4.6.7's object constructor reads the lazy eval feature probe when schemas are constructed. `z.config({ jitless: true })` must run in an earlier module; placing it in the entry body after a static App import is too late. The correction removes the violation without relaxing script CSP. [Red results](evidence/rc/playwright-results-red.json), [red messages](evidence/rc/csp-red.json), and [corrected results](evidence/rc/playwright-results.json) retain the regression.

README now describes active-state reset accurately instead of guaranteeing complete JavaScript memory erasure. Runtime dependencies, existing limits, original assets, parser/codec behavior and prior tests were preserved. New files are release QA, a synthetic Takeout fixture, license notices, and release/deployment documentation.

## Complete test results

| Check | Observed result | Evidence |
| --- | --- | --- |
| Phase 2 baseline typecheck/lint/test/build | PASS, 188 tests, build exit 0 | [baseline.txt](evidence/rc/baseline.txt) |
| Final `bun run typecheck` / `bun run lint` | PASS | [final-regression.txt](evidence/rc/final-regression.txt) |
| Final `bun run test` | 14 files / 188 tests PASS, including performance tests | Same transcript |
| Final `bun run build` | PASS, exit 0; notices included | Same transcript, [distribution manifest](evidence/rc/distribution.json) |
| `bunx playwright test --config playwright.rc.config.ts` | 15/15 PASS, 29.8 s | Same transcript, [JSON](evidence/rc/playwright-results.json) |
| `bun run test:e2e --reporter=list` | 19/19 PASS, 41.9 s | Same transcript |
| `bunx playwright test --config playwright.render.config.ts` | 5/5 PASS, 11.9 s | Same transcript |
| `bunx playwright test --config playwright.live.config.ts` | 1/1 PASS, 4.5 s | Same transcript |
| Expanded fresh root + subpath journey, all five projects; typecheck/lint | 5/5 PASS, 26.1 s | [root-restoration-regression.txt](evidence/rc/root-restoration-regression.txt) |

There are **228 distinct automated cases** in the complete suites, plus five reruns after expanding the root-restoration assertion. The JSON 15-case report precedes that final test-only assertion extension; its five affected journeys were rerun successfully in the additional transcript. Existing large-chunk build warnings are retained, not suppressed. The three/globe/chart chunks are lazy after import; the warnings are not build failures. LSP tooling was unavailable; the actual compiler and ESLint commands passed.

## Browser matrix

All projects ran their named native engine, not a user-agent substitution for Chromium. Deterministic full app journeys and real-provider probes are separate tests.

| Project | Browser engine | WebGL2 globe | File import | Real DNS + GeoIP readable CORS | Root/subpath compressed restore | HTTPS/CSP/cache |
| --- | --- | --- | --- | --- | --- | --- |
| chromium | Chromium 159.0.8154.6 | PASS | PASS | PASS | PASS | PASS |
| firefox | Firefox 159.0 | PASS | PASS | PASS | PASS | PASS |
| webkit | Playwright WebKit 27.2 | PASS | PASS | PASS | PASS | PASS |
| mobile-chromium | Native Chromium, 390×844, DPR 3, touch/mobile emulation | PASS | PASS | PASS | PASS | PASS |
| mobile-webkit | Native WebKit, 390×844, DPR 3, touch/mobile emulation | PASS | PASS | PASS | PASS | PASS |

Per-project `journey-*.json`, `providers-*.json`, `cache-*.json`, `journey-security-*.json`, and analysis/share/root-restored/restored PNGs are under [evidence/rc](evidence/rc/). Actual renderer strings were Chromium “ANGLE Metal Renderer: Apple M5”, Firefox “Apple M1, or similar” (masked browser string), and WebKit “Apple GPU”. The SwiftShader permission flag does not prove use of SwiftShader.

This is not branded Safari application verification. No physical iPhone, Android device, real mobile GPU, mobile file-picker hardware integration, cellular network, or physical camera scan was tested.

## User journeys and data accuracy

No private history was available or used. `tests/fixtures/takeout-rc.json` follows the supported `Browser History` / string `time_usec` contract with six synthetic visits; the generic input also covers ISO and Unix-ms timestamps. This is a deidentified supported-format fixture, not a claim to have tested every Chrome Takeout version or every browser exporter.

The five-engine flow uploads before consenting, confirms six visits / three sites, starts DNS/GeoIP, retains one unresolved site, renders two located markers, plays and pauses the timeline, produces a compressed link/QR, decodes its actual PNG, and restores a fresh tab at both root and subpath without provider requests. The statistics retain unknown-site visits. Unit and adjacent E2E cases cover the full-record statistics, capped rendering, skipped chronology, v1 compatibility and location uncertainty.

The main session additionally used an owned Omowright Chromium profile on the production HTTPS output: upload → real Google/GeoJS consent and query → 2/3 hosts located, one NXDOMAIN unresolved → six visits and three sites retained → actual WebGL globe → site detail → light/dark and mobile views → share → fresh-tab restore. [manual-live.json](evidence/rc/manual-live.json) records the eight hostname/IP-only provider URLs. [manual-live-snapshot.txt](evidence/rc/manual-live-snapshot.txt) preserves the displayed estimate/accuracy warnings; [manual-qa.json](evidence/rc/manual-qa.json) records final restoration and layout observations.

The observed live sites resolved to current Japan/Tokyo estimates, not an asserted Korean or historical physical server. Country/city/radius remain provider estimates; >25 km or absent radius lowers the primary display to country, and district/administrative truth remains unverified. Current provider answers can change. The separate live probes read A, AAAA, public IPv4 GeoJS and IPv6 GeoJS responses under the release CSP in all five profiles.

## QR practicality

No limit changed. Short self-contained compressed links remain the preference; no backend short-link service was introduced.

| URL characters | Correction | Symbol modules | Native PNG | Exact PNG decode + URL restore |
| --- | --- | --- | --- | --- |
| 273 | H | 85×85 | 372 px | PASS |
| 500 | H | 113×113 | 484 px | PASS |
| 1,000 | H | 161×161 | 676 px | PASS |
| 2,000 | M | 169×169 | 708 px | PASS |
| 2,800 | L | 173×173 | 724 px | PASS |

Evidence: [qr-boundaries.json](evidence/rc/qr-boundaries.json). Each PNG uses four native pixels per module including an eight-module total quiet-zone allowance. Exact URL tiers use harmless query padding of 0/7/4/28/24 characters respectively; those cases are transport-length tests, not an assertion that every compressed dataset naturally has those lengths.

The selector chooses the strongest correction that fits, H → Q → M → L. At 2,800 characters the displayed image at 384 px has about 2.12 pixels per module including quiet zone, and less at a narrow phone width. A lossless native PNG decoding successfully does not prove reliable camera scanning after display scaling or printing. Prefer shorter links and original PNG downloads; verify actual camera/distance/print use before publishing a physical QR. The 2,800-character transport ceiling remains practical as an upper bound, not a recommended dense printed QR target.

## Deployment readiness and remaining risks

- Production `dist/` is static, works at `/` and `/history-orbit/`, and supports direct fragments and folder redirects. [DEPLOYMENT.md](DEPLOYMENT.md) specifies HTTPS, response headers, provider permissions, atomic updates and cache policy.
- A local self-signed TLS certificate was used only for QA. Browser contexts ignored that certificate error; curl explicitly trusted that certificate. No OS trust settings changed. Public hostname/certificate/CDN behavior is still the operator's destination check.
- CSP passed without script `unsafe-eval` or inline scripts. Style `unsafe-inline` and blob workers/images are included in the tested policy. HTML/unhashed assets revalidate; hashed assets are immutable. All five engines executed new hashed code after a controlled A→B deployment switch.
- [DEPENDENCIES.md](DEPENDENCIES.md) records 288 installed instances, lock/version agreement and a conservative runtime superset of 103 instances / 100 unique versions. No incompatible runtime license was identified. The distribution includes 106 retained third-party license/notice texts plus Public Suffix MPL attribution/source links.
- Nine development-only separate-license-file gaps and the exact NASA product/credit chain / original WebP recipe gaps remain documented. The original JPEG is byte-identical to the pinned upstream file; blanket asset legal clearance is not claimed. No existing imagery was arbitrarily replaced.
- GeoIP/DNS accuracy, availability, rate limits and CORS can change outside the application. Large snapshots and old/low-memory mobile GPUs still need real-device checks. The existing rendering caps and fallback remain.
- There is no persistent short-link store or revocation. Shared fragments/PNGs can expose aggregate patterns and locations even with domains excluded. README and deployment instructions disclose this.
- The independent gate noted two nonblocking evidence limits: the journey's final CSP array belongs to its last document and is not a complete log of all earlier/restored documents; its canvas-count assertion alone is weaker than the separately recorded WebGL renderer and screenshots. The provider/cache cases supply their own CSP observations. No actual CSP failure or missing globe was identified.

## User-operated release checklist

1. Open the actual HTTPS destination at root and subpath; confirm no certificate warning, mixed content, blocked script/style or CSP report.
2. Upload `tests/fixtures/takeout-rc.json`: expect six visits, three sites and no automatic provider call before consent. Then test a local supported export of your own without uploading it to another service.
3. Consent to live lookup, inspect successful and unresolved sites, current-location/uncertainty notices and the retained six-visit total. Compare UTC weekdays/hours with the fixture.
4. Rotate/zoom the globe, select sites, play/pause and seek the timeline. Repeat on actual Android and iPhone/Safari with their real file pickers and GPUs.
5. Generate a short anonymous share, review disclosed fields, decode/download its original PNG, open the link in a separate browser and directly under the hosted subpath. Expect the same snapshot without DNS/GeoIP requery.
6. Scan short and long displayed/printed PNGs with physical cameras at intended sizes/distances. Treat the 2,800-character L-level case as a dense upper-bound case, not camera certification.
7. Verify real response headers, HTML/texture validators and immutable hashed assets; deploy a second version and confirm a normally cached browser loads the new HTML/script while old open tabs can still load their chunks.
8. Confirm `THIRD_PARTY_NOTICES.txt` is publicly served, review the qualified imagery credits, check optional host analytics, and publish only `dist/`. Keep the original previous deployment available for the host's normal rollback process.

## Owned-resource cleanup

After the gate finished reading the baseline, the parent removed its temporary RC directory, certificate/private key, downloaded native engines/profiles, A/B builds, baseline copy and task caches. The directory absence was read back. Owned browser/server processes and ports 5173/5175/5443 had already been verified closed. Project dependencies, existing source/tests/assets and persistent evidence were retained. See [cleanup.json](evidence/rc/cleanup.json), [process-cleanup.json](evidence/rc/process-cleanup.json) and the [saved journal](evidence/rc/ultrawork-notepad.md). All 49 task items are complete.
