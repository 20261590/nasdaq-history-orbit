# Release candidate dependency and asset audit

Audit date: 2026-11-16. Scope: installed dependency licenses, static asset provenance, and debug/temp inclusion in the existing production output. Evidence is in [license-audit.json](evidence/rc/license-audit.json) and [asset-audit.json](evidence/rc/asset-audit.json). This audit changes documentation and distributable notices only.

The installed package graph has no missing license declaration or package version disagreement with `bun.lock`. The required license texts, copyright notices, Apache notices, and Public Suffix List attribution are collected in [`public/THIRD_PARTY_NOTICES.txt`](../public/THIRD_PARTY_NOTICES.txt). Keep this file with the static distribution.

**Packaging gate:** the inspected 16-file `dist/` snapshot predates the new notices and has no `THIRD_PARTY_NOTICES.txt`. The release owner must rebuild and confirm that the deployed artifact contains this notice file. This audit does not modify `dist/` or claim that this gate has already passed. No incompatible runtime package license was identified. Earth attribution is qualified by the specific provenance gaps below.

## Method and graph coverage

- Read `package.json`, the Bun JSONC lockfile, actual installed manifests, dependency edges, license/copyright/notice files, source imports, `index.html`, `vite.config.ts`, and the existing `dist/` file inventory.
- There are **26 direct declarations: 10 runtime and 16 development**.
- There are **288 installed package instances**, representing **284 unique name/version pairs**. The lockfile has **338 instance entries**, or **334 unique name/version pairs**. Its **50 uninstalled entries** are optional esbuild/Rollup binaries for other platform/CPU combinations.
- All 288 installed instance paths and versions match their lockfile entries. Both root dependency maps match the lockfile workspace maps. All 26 direct ranges accept their installed versions.
- Examined **518 declared dependency/optional/peer edges**. No resolved edge violates its declared range, and no required edge is unresolved. There are 69 absent optional edges, including optional peers and platform packages; these are recorded individually.
- The production inventory is a **conservative superset**, starting at all 10 runtime declarations and following ordinary dependencies, installed optional dependencies, and installed peers. It contains **103 instances / 100 unique name/version pairs**, with no unresolved edge. It intentionally includes Vue compilers/server renderer, TypeScript, types, and QR CLI/PNG dependencies that a browser build can omit. It is not a claim that 100 packages survive tree shaking.
- Read and hashed **298 installed license/copyright/notice files** across the full install. All production-superset instances have license files. The distributable notice preserves **106 original files** for the 100 unique package/version pairs, including supplemental ECharts, h3-js, TypeScript, and tslib notices. Unused Three.js example-font notices are inventoried but excluded from the distributable notice because those font assets are absent from the build.
- Installed package SPDX declarations: MIT 212, ISC 31, Apache-2.0 24, BSD-2-Clause 10, BSD-3-Clause 4, 0BSD 4, Python-2.0 1, BlueOak-1.0.0 1, Unlicense 1. These counts are package instances, not unique versions or all embedded component licenses.
- Production-superset declarations: MIT 69, ISC 23, Apache-2.0 3, 0BSD 4, BSD-3-Clause 2, BSD-2-Clause 1, Unlicense 1. ECharts also contains BSD-3-Clause d3 code; the Public Suffix dataset has its own MPL-2.0 provenance.

The check compares installed metadata and source files without reinstalling or fetching package archives. Lockfile archive integrity strings are retained, but installed files are not claimed to have been authenticated by a fresh archive-integrity verification. The tldts registry integrity string was separately compared with its lock entry while resolving dataset provenance.

## Actual direct versions

| Package | Declared range | Installed | SPDX | Role |
| --- | --- | --- | --- | --- |
| echarts | ^6.0.0 | 6.1.0 | Apache-2.0 | Runtime |
| fflate | ^0.8.2 | 0.8.3 | MIT | Runtime |
| ipaddr.js | ^2.2.0 | 2.5.0 | MIT | Runtime |
| ky | ^1.14.0 | 1.14.3 | MIT | Runtime |
| qrcode | ^1.5.4 | 1.5.4 | MIT | Runtime |
| three | ^0.181.0 | 0.181.2 | MIT | Runtime |
| three-globe | ^2.44.0 | 2.45.6 | MIT | Runtime |
| tldts | ^7.0.19 | 7.5.4 | MIT | Runtime |
| vue | ^3.5.22 | 3.5.45 | MIT | Runtime |
| zod | ^4.1.12 | 4.6.7 | MIT | Runtime |
| @eslint/js | ^9.39.0 | 9.39.5 | MIT | Development |
| @playwright/test | ^1.56.1 | 1.65.1 | Apache-2.0 | Development |
| @types/node | ^24.10.0 | 24.19.2 | MIT | Development |
| @types/qrcode | ^1.5.6 | 1.5.6 | MIT | Development |
| @types/three | ^0.181.0 | 0.181.0 | MIT | Development |
| @vitejs/plugin-vue | ^6.0.1 | 6.0.11 | MIT | Development |
| eslint | ^9.39.0 | 9.39.5 | MIT | Development |
| eslint-plugin-vue | ^10.5.1 | 10.12.1 | MIT | Development |
| globals | ^14.0.0 | 14.0.0 | MIT | Development |
| jsqr | ^1.4.0 | 1.4.0 | Apache-2.0 | Development |
| typescript | ~5.9.3 | 5.9.3 | Apache-2.0 | Development; also optional Vue peer in superset |
| typescript-eslint | ^8.46.3 | 8.72.2 | MIT | Development |
| vite | ^7.2.2 | 7.3.8 | MIT | Development |
| vitest | ^3.2.4 | 3.2.7 | MIT | Development |
| vue-eslint-parser | ^10.2.0 | 10.4.2 | MIT | Development |
| vue-tsc | ^3.1.3 | 3.3.14 | MIT | Development |

## License obligations and concrete gaps

MIT, ISC, BSD, Apache, and 0BSD text/copyright obligations are preserved in the distributable notice. It includes ECharts `NOTICE` and `licenses/LICENSE-d3`, h3-js `NOTICE`, tslib `CopyrightNotice.txt`, and TypeScript `ThirdPartyNoticeText.txt`. Apache text is included in full. No dependency source was edited in this audit.

**Public Suffix List:** tldts and tldts-core declare MIT, but tldts acknowledges the Mozilla/Public Suffix dataset. The dataset header expressly identifies MPL-2.0. The npm metadata for tldts 7.5.4 identifies source commit [`c5d091d6a146dfc88322a7037a08dcd55672dcea`](https://github.com/remusao/tldts/tree/c5d091d6a146dfc88322a7037a08dcd55672dcea); its `publicsuffix` gitlink pins [`dfe55f3548d0fe51c04b8d2903507a01fdec57ad`](https://github.com/publicsuffix/list/tree/dfe55f3548d0fe51c04b8d2903507a01fdec57ad). The installed trie matches that tldts source after ignoring whitespace and its source-map URL comment. The notice retains MPL-2.0 in full, the dataset header, and public links to the pinned dataset and generated-trie Source Code Form. This addresses the separate dataset conservatively without assigning MPL to the entire application.

Nine development-only packages have no separate license-named file in their installed directories:

| Package/version | Actual evidence and remaining gap |
| --- | --- |
| @esbuild/darwin-arm64 0.28.2 | Manifest says MIT; no separate license text. |
| @rollup/rollup-darwin-arm64 4.68.3 | Manifest says MIT; no separate license text. |
| @humanfs/types 0.15.0 | Manifest says Apache-2.0; no separate license text. |
| boolbase 1.0.0 | Manifest says ISC; no separate license text. |
| esrecurse 4.3.0 | Manifest says BSD-2-Clause; complete BSD text is present in the `esrecurse.js` header. |
| imurmurhash 0.1.4 | Manifest says MIT; source identifies authors but has no complete permission text. |
| keyv 4.5.4 | Manifest says MIT; no separate license text. |
| natural-compare 1.4.0 | Manifest says MIT; README supplies a copyright and a linked MIT text, not the full local text. |
| stackback 0.0.2 | Manifest says MIT; `formatstack.js` retains V8 BSD-3-Clause text, but a complete primary MIT text is absent. |

These are install/source-redistribution evidence gaps, not observed application asset leaks. None is in the runtime superset. The application release distributes `dist/`, not `node_modules`; a separate distribution of the development toolchain would need to retain/resolve its own texts. Python-2.0/GPL-compatibility discussion in argparse, Unlicense wording allowing commercial and noncommercial use in robust-predicates, and generic LGPL legal boilerplate in development VS Code notices are not treated as evidence that the application is GPL/LGPL licensed.

## Static assets and provenance

| Asset | Dimensions | Bytes | Usage |
| --- | --- | --- | --- |
| public/earth.jpg | 4096 x 2048 JPEG | 1,461,877 | Original retained texture; copied into dist but not referenced by application source. |
| public/earth.webp | 4096 x 2048 WebP | 703,258 | Derived globe texture used by `src/components/OrbitGlobe.vue`. |
| public/earth-preview.webp | 684 x 640 WebP | 32,810 | Rendered landing-page preview used by `src/App.vue`. |

The original JPEG is byte-identical to the [three-globe example image at commit 01b3eccb5dffe347b6d03251e35d201ba8ec06e5](https://raw.githubusercontent.com/vasturiano/three-globe/01b3eccb5dffe347b6d03251e35d201ba8ec06e5/example/img/earth-blue-marble.jpg), introduced on 2019-03-29. SHA-256: `228deba2e4b600146bdcb6cfa359b8ead6aacc2b1c13550a29cd82824cfa1c01`. All three public images exactly match their counterparts in the inspected `dist/`. Individual hashes and dimensions are in the asset evidence.

The [official NASA Blue Marble collection](https://science.nasa.gov/earth/earth-observatory/collections/blue-marble/) and [2002 Blue Marble description](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) establish a reasonable image-family source. The latter says its imagery is freely available to educators, scientists, museums, and the public, and credits NASA Goddard Space Flight Center, Reto Stöckli, and Robert Simmon, with additional data contributors. These are family-level credits; no exact NASA product/file match for the three-globe JPEG was established.

[NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) generally permit factual educational/informational imagery use with NASA acknowledgment and without implied endorsement. They distinguish protected identifiers and third-party copyrighted content; they do not justify a blanket claim that all NASA imagery is public domain. The distributable notice credits the image source, states the conversions/render are application work, avoids endorsement claims, and preserves the original repository MIT text for any repository contribution.

**Specific evidence gaps:** no NASA product identifier or original image-specific credit chain was established for the public repository image, and no original conversion/render recipe or reproducible derivation receipt for either WebP was established in the inspected evidence. The upstream JPEG byte match is proven; the NASA family mapping and the two stated derivations remain qualified provenance. This is not an identified conflicting copyright claim or evidence of prohibited use. A release requiring asset-by-asset legal clearance must close that product/credit chain or replace the imagery with a documented NASA source; this audit does not invent that clearance.

## Debug and temporary shipping surface

The inspected production snapshot has 16 files: one HTML entry, 11 JavaScript chunks, one CSS file, and the three public images. It contains no maps, hidden files, test/benchmark HTML, fixtures, documentation/evidence, Playwright reports, node_modules, logs, temporary files, or backup files. Searches for the named QA hooks/fixtures, benchmark title/path, Vite development client, source-map URLs, evidence paths, and development-server origins found no matches in its text assets. Third-party diagnostic strings are not classified as application debug endpoints.

`index.html` enters through `src/main.ts`; the production config declares no additional HTML entry or copy plugin. `tests/rendering/benchmark.html` enters through its own test-only module and is not a production input. The 420-visit generator in `src/core/demo.ts` is intentionally imported by `src/App.vue` for the user-facing synthetic MOCK demonstration. Its synthetic URLs/coordinates are not uploaded history or a debug leak. Test IDs and third-party WebGL diagnostics are likewise not sufficient evidence of a shipping debug surface.

Existing tests, rendering harnesses, `docs/evidence`, `playwright-report`, and `test-results` remain intentional workspace QA material. Their absence from the inspected distribution, rather than their presence in the workspace, determines this result. Deploy only the generated distribution; serving the workspace root would change the audited boundary.

This lane used in-memory Bun/standard-library file reads, hashes, image metadata, and public HTTP reads. It started no command, browser, server, package install, or package-manager operation; allocated no temporary/cache directory; wrote no fetched data outside the four scoped deliverables; and deleted no existing file. The cleanup receipt is embedded in both evidence artifacts. The coordinator's reported baseline of 188 units plus typecheck/lint/build is not rerun or reclassified as an independently observed result here.
