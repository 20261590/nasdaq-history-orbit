# History Orbit Design System

## 0. Research Log
Embedded sources: taste-skill restraint and Linear tonal surfaces; customized as a geographic analysis workspace. Candidates: Linear, Vercel, NASA-style data observatories. Chosen: Linear structural precision with cyan geography, rather than its branded violet.
Layout reference: https://github.com/changeroa/StyleGallery ; semantic sidebar and viewport shell principles.
The user's dark, globe-first brief supplies the visual direction; no generated mockup is required.

## 1. Atmosphere & Identity
A quiet geographic observatory. A large textured earth is the visual anchor. Warm white text, midnight surfaces and cyan routes distinguish data from controls. No decorative marketing metrics.

## 2. Color
Dark: background #080e18, panel #101a28, elevated #172436, text #ecf2fa, secondary #a5b8d0, border #2a3b50, accent #63dbd4, accent ink #062c30, warning #f5cb82, error #ff9f9f.
Light: background #edf2f7, panel #ffffff, elevated #e1eaf3, text #142338, secondary #435c76, border #c3d0df, accent #126d71, accent ink #ffffff, warning #80500c, error #a62633.
Globe canvas stays midnight for readable markers in both themes; cyan current path, amber current point, muted blue additional locations.

## 3. Typography
System sans-serif stack with Korean fallback. No remote font request.
Display 48px/1.15 weight 650; h1 32px/1.2 weight 650; h2 24px/1.3 weight 600; h3 20px/1.4; body 16px/1.6; small 14px/1.5; metadata 12px/1.5. Tabular numerals in statistics and time controls.

## 4. Spacing & Layout
4px base: 4, 8, 12, 16, 24, 32, 48, 64px. Controls minimum 44px. Radius 6px controls, 12px panels. Neutral one-pixel borders; no accent edge stripes.
Layout: analysis - globe with supporting ranking -> sidebar viewport shell (https://github.com/changeroa/StyleGallery); scroll owner: document on mobile, .insights on wide screens; anti-patterns: fixed mobile panes, unbounded canvas, multiple nested scrolling regions.
Layout: integration workspace - compare complete records and review masked findings without crowding the globe -> document stack with intrinsic comparison groups (existing project layout primitives); scroll owner: document, with explicitly labelled two-dimensional heatmap/table overflow only; anti-patterns: fixed mobile panels, nested vertical lists, rendering every record as a DOM row.
Layout: sharing - 현재는 구현 예정 상태를 알리는 native modal -> 기존 제목·닫기 행과 `.share-body`만 사용; scroll owner: .share-body; anti-patterns: 새 페이지 레이아웃, 문서가 modal 뒤로 스크롤되는 구성, PNG용 live 3D renderer.
Wide: header, globe/main with 340px insights column, timeline footer; below 1000px single column with 420px globe. Initial upload pairs explanation with live decorative earth preview; errors remain in reading order.

## 5. Components and screen briefs
Button: primary cyan, secondary neutral; same dimensions across hover, focus, disabled, pending. Input/select: tonal background, label always visible. Metrics: four-column definition list, two on mobile. Ranking: ordered rows with full-width selectable button and proportional bar. Dialog: native dialog with heading, close action, semantic inputs and bounded scrolling. Progress: native progress plus live text.
Initial primary action: JSON 선택. Priority: purpose, upload, privacy. Required: drop area, size/formats, demo, no-server statement.
Analysis primary action: 재생 after location lookup. Priority: globe, current visit, ranking. Required: consent, source label, progress/cancel/retry, periods, camera controls, timeline, all chart distributions, uncertainty.
Share primary action: 현재 없음. 헤더의 결과 공유와 개인정보 점검의 공유 전 검토는 같은 안내 modal을 연다. URL·QR·PNG·미리보기·복원은 NOT IMPLEMENTED이며, 구현할 때도 기존 modal 스타일과 레이아웃을 유지한다.
Empty/errors: clear readable error with retry or file action, no fabricated content.
Comparison primary action: 비교하기. Priorities: A/B ranges and scope, observed changes, distributions and site ranks. Required: 7/30/month/custom presets, coverage warnings, all/located country denominators, new/absent sites, neutral A/B globe-period links. Site/country choices apply; globe dates do not erase the independent A/B comparison.
Activity primary action: 세션 기준 적용. Priorities: observed events/switches/session fragments, time distributions, fragment and repeated-edge detail. Required: adjustable30minute default, hourly unique domains and switches, gap buckets, weekday/hour heatmap, session counts, dense hours, UTC late-night share. No attention, productivity, medical or network-volume claims.
Security primary action: 공유 전 검토. Priorities: inspected/detected/type counts, masked findings and filters, separately labelled analysis/share exclusions. Required: priority/caution/reference/none, safe site/day/masked preview, reversible per-order choices, pagination and unavailable state. No raw URL values, reveal mode, raw href/title, external scanner, or malicious-site diagnosis.
Integration primitives reuse existing native labelled controls, neutral borders, definition-list metrics, semantic tables/details and token colors. New panels and chart helpers use scoped styles. Lists paginate; charts retain text equivalents. Both themes and keyboard focus remain supported.
Future image export primary action: PNG 저장. Required: History Orbit, safe static globe illustration or explicitly disclosed summary fallback, UTC day-level data range, visit/site statistics, estimated country distribution and selected analysis values. Anonymous by default; names require explicit choice. Raw URL/query/title/IP/hostname/domain/exact visit times never enter the painter input.

## 6. Motion
160ms UI state changes; new panels use native controls and restrained state feedback. Existing camera policy is protected: distance-based2–10second flights, actual arrival then at least2seconds observation, shared motion clock and explicit seek/manual ownership. This integration does not change those parameters. Canvas pauses off-screen and when document is hidden.

## 7. Depth
Tonal separation and neutral borders. Glow belongs only to geographic markers and atmosphere as requested; no glow around controls.

## 8. Accessibility
Native keyboard controls, 44px targets, visible focus ring, aria-live progress/errors. Charts have text summaries. Canvas has equivalent location list and description. Both system theme and explicit dark/light control supported; default dark per brief.

## 9. Ideal state and gap ledger
New visitor chooses local JSON or demo without network transmission. Analyst explicitly consents to hostname/IP lookups, sees partial failures, navigates a faithful globe and full statistics. Share is an honest placeholder until a bounded anonymous snapshot contract and its URL, QR, PNG, preview, and restore implementations exist.
Initial ledger: Share is NOT IMPLEMENTED. Its future work must close with browser evidence of the modal, generated outputs, restore and malformed-link states at 390px and 1440px, without changing the established layout.
