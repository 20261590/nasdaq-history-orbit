# History Orbit Phase 2 검증

검증일: 2026-11-16. macOS arm64, Bun 1.4.3, Chromium 159, 실제 WebGL renderer는 **ANGLE Metal / Apple M5**입니다.

핵심 기능의 회귀 및 정확성·성능·QR 경계 검사는 PASS입니다. 실물 스마트폰 카메라 촬영, 실제 모바일 GPU, 다른 브라우저 및 저속망의 배포 성능은 PARTIAL입니다. 아래 결과는 실제로 실행한 범위만 뜻하며 물리 서버 소재지나 카메라 인식률을 보장하지 않습니다.

최초 독립 리뷰 `evidence/phase2/gate-review.md`는 처리 상한의 누락 이벤트 연결 문제 B1을 발견해 REJECT했습니다. 수정 후 독립 재검토 `evidence/phase2/gate-review-b1.md`는 **APPROVE, 남은 blocker 없음**을 확인했습니다. 재검토자는 원래 실패를 직접 재현하고 관련 단위 51개, 타입·린트·빌드, 데스크톱·모바일의 실제 100,001건 업로드를 검증했습니다. 최초 리뷰에서 승인한 나머지 기준과 합쳐 Phase 2 소프트웨어 수락 검토를 완료했습니다. 최종 리소스 정리는 `evidence/phase2/cleanup.json`에 기록합니다.

## 기존 보고와 구현의 일치

1차 보고의 업로드·사이트 집계·지구본·익명 공유 기본 흐름은 재현되었습니다. 그러나 다음 세부 정확성은 당시 테스트가 충분하지 않았고 Phase 2에서 실제로 재현해 수정했습니다.

| 발견 | 수정 및 증거 |
| --- | --- |
| 큰 문자열 `time_usec`를 Number로 먼저 바꾸면 밀리초가 반올림됨 | 정수 부분을 BigInt로 나눈 뒤 변환. ISO 문자를 microseconds 필드로 받거나 안전하지 않은 숫자를 받는 경우도 거부. `core-audit.json` |
| 제외된 이벤트를 지운 뒤 순서를 재번호화해 실제로 연속하지 않은 방문을 연결 | 시각이 있는 제외 이벤트의 순서 슬롯 유지. 시각 자체를 배치할 수 없으면 전체 연결 추론 중단, 통계·위치 유지 및 UI 안내 |
| 100,000건 상한 밖의 미검사 이벤트가 보존된 방문 사이에 있어도 연결 | 독립 리뷰 B1로 발견. 상한을 넘는 입력은 처음부터 연속성 미확인으로 처리하며 꼬리를 읽지 않는 기존 계약 유지. `cap-red.txt`, `cap-green.txt`, `cap-manual.json/png` |
| epoch 0의 정상 방문 기간이 대시로 표시됨 | 0과 데이터 없음을 구분. 기준 빌드의 실제 오류 캡처 `epoch-before.txt/png`, 최종 E2E로 교정 확인 |
| DNS 응답 순열에 따라 대표 IP가 달라짐 | 주소 값으로 정렬해 결정적으로 선택, A/AAAA 모두 유지 |
| 한 사이트의 여러 hostname 위치를 합쳐 공유하고 모든 방문을 같은 위치로 복원 | v2에서 방문→익명 호스트 인덱스 보존. 한국·미국·미확인 호스트를 구별. `share-audit.json` |
| 공급자 `city: Jongno-gu`를 도시 수준으로 표현 | 공급자 도시 원문은 미검증 상세로 유지, 주 표시는 Seoul 지역 추정으로 제한. 한글 `종로구/중구/면목동`도 동일 처리 |
| 유효한 소수 반경과 `St. John's`, `Côte d’Ivoire`가 공유 스키마에서 거부됨 | 반경의 유한 실수와 일반 구두점 허용. `share-location-red.txt`에서 3개 실패 후 최종 3개 통과 |
| async 지구본을 첫 화면에서 즉시 mount하여 실제 지연 로딩이 아님 | 초기 정적 포스터, 분석 시 3D·차트 로딩. 브라우저 resource 목록으로 확인 |
| GPU 결과 파일에 SwiftShader를 고정 문자열로 기록 | 실제 컨텍스트 조회 결과 Apple M5임을 확인. 새 성능 파일은 렌더러를 직접 조회 |

1차 원본 증거와 원래 검증 문서는 `docs/evidence/phase1/`에 보존했습니다. Phase 2의 근거는 `docs/evidence/phase2/`입니다. 검사 실패와 수정 전 red 증거도 삭제하지 않았습니다.

## 실행한 품질 게이트

```sh
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:e2e
bunx playwright test --config playwright.render.config.ts
bunx playwright test --config playwright.live.config.ts
```

| 검사 | 결과 |
| --- | --- |
| TypeScript | PASS, 오류 0 |
| ESLint | PASS, 오류·경고 0 |
| Vitest | **14개 파일 / 188개 PASS** |
| 기본·데스크톱/모바일·QR 경계·legacy·오류 E2E | **19개 PASS**, 최종 약 38초 |
| 실제 렌더 부하·컨텍스트 해제·저성능 모드 | **5개 PASS** |
| 실제 DNS/GeoJS 앱 흐름 | **1개 PASS** |
| 프로덕션 빌드 | PASS |

최종 B1 수정의 타입·린트·188개 단위·프로덕션 빌드·19개 E2E·실제 공급자 결과는 `cap-green.txt`에 있습니다. 그 전의 전체 검증과 실패 이력은 `quality.txt`, `browser-gates.txt`, `final-ui.txt`에 보존했습니다. 각 파일은 `docs/evidence/phase2/` 아래에 있습니다. B1 수정은 시계열 연속성의 초기 상태와 관련 안내만 바꿨으며 QR·GeoIP 표시·GPU 렌더러는 변경하지 않았습니다.

### 독립 리뷰 B1의 재현과 수정

100,001건 파일의 마지막 이벤트 시각을 첫 두 방문 사이에 두면, 종전에는 첫 두 방문이 연속 순서를 받아 지원되지 않는 아크 1개를 그렸습니다. `cap-red.txt`에서 상한 초과 사례만 실패하고 정확히 100,000건인 대조 사례는 통과했습니다.

`chronologyKnown`의 초기값을 `rows.length <= LIMIT`로 바꿔 검사하지 않은 꼬리를 연속성의 근거로 사용하지 않게 했습니다. 기존 throwing getter 테스트를 그대로 유지해 꼬리를 읽지 않는지 확인했습니다. 수정 후 정확한 상한 안의 연결은 유지하고 초과한 파일의 아크는 생략합니다.

실제 프로덕션 UI 및 메인 에이전트의 omowright 재현에서 6,238,956바이트 파일을 업로드해 **유효 방문 100,000건, 마커 2개, 지원되지 않는 아크 0개**를 확인했습니다. 통계와 위치는 유지되며 외부 조회 대신 명시적으로 MOCK을 선택했습니다. 증거는 `cap-ui.json/png`, `cap-manual.json/png`입니다.

첫 E2E 실행은 `defaultBrowserType`을 describe 내부 context 옵션으로 넣은 설정 오류로 테스트 시작 전에 실패했습니다. worker 옵션을 제외하고 viewport/DPR/touch/userAgent를 명시해 Chromium 모바일 검증을 실행했습니다. 테스트를 제거하거나 성공 기준을 낮추지 않았습니다.

## GeoIP 및 한국 상세 신뢰도

실제 Chromium fetch는 공개 IP만 사용했습니다. `geo-probe.json`에 응답 body/status/읽을 수 있는 헤더/시간을 남겼습니다.

| 공개 IP | 실제 응답 | 표시 정책 |
| --- | --- | --- |
| 223.130.200.104 | South Korea, 200 km, 도시·지역 없음 | 국가 추정 |
| 168.126.63.1 | Seoul / Jongno-gu, 5 km | Seoul 지역 추정, Jongno-gu 원문 미검증 |
| 8.8.8.8 | United States, 1,000 km | 국가 추정 |
| 2001:4860:4860::8888 | United States, 1,000 km | 국가 추정 |
| 1.1.1.1 | 위도·경도 nil, 국가 없음 | 미확인, 좌표 생성 없음 |

반경 미제공 또는 25 km 초과 시 국가까지만 주 표시합니다. 작은 반경의 공급자 도시·지역도 추정이며, 25 km는 **UI 정책**이지 행정 경계 검증 기준이 아닙니다. 5 km 반경도 여러 구를 포함할 수 있습니다. 공개 행정 GeoJSON을 대입하지 않았고 실제 시·군·구 서버 소재지로 판정하지 않습니다.

A/AAAA의 모든 유효 공용 IP와 국가를 보존합니다. CDN/Anycast 때문에 한국 사이트의 현재 대표 IP가 다른 국가에 표시될 수 있으며, 방문 당시 실제 접속 IP나 패킷 이동 경로를 복원한 것이 아닙니다.

## 로딩과 번들

실제 초기 resource 목록의 수정 전·후 비교:

| 항목 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| 첫 화면이 요구하는 JS | 약 2.585 MB | 약 0.367 MB |
| 초기 지구 이미지 | JPEG 1,461,877 B + WebGL | 정적 WebP 32,810 B |
| 분석용 지구 텍스처 | JPEG 1,461,877 B | 같은 해상도 WebP 703,258 B |
| 가장 큰 3D 관련 chunk | 약 1.729 MB | Three.js 약 1.213 MB |

초기 필수 JS는 약 86% 줄었습니다. 지구본 라이브러리 전체 코드가 그만큼 줄었다는 뜻은 아닙니다. 3D 의존성은 분석을 시작할 때 다운로드하고, 차트도 그때 로드합니다. 전체 Three.js는 여전히 크며 Vite의 500 KB chunk 경고를 숨기지 않았습니다.

수동 chunk 분리의 첫 시도는 공용 CommonJS helper를 globe chunk에 넣어 3D가 다시 초기 진입점으로 끌려왔습니다. `onlyExplicitManualChunks`로 원인을 바로잡은 뒤 resource 목록에 3D·차트가 없고 초기 canvas 수가 0임을 확인했습니다. Three.js 설치는 하나였으며 중복 의존성을 제거해 얻은 결과라고 보고하지 않습니다.

증거: `baseline-assets.json`, `baseline-network.json`, `loading-network.json`, `final-assets.json`, `baseline-initial.png`, `lazy-initial.png`. 로컬 byte 측정이며 저속 모바일 회선의 시간 개선 수치로 일반화하지 않습니다.

## 실제 GPU와 렌더 제한

실제 기존 컨텍스트가 `ANGLE Metal Renderer: Apple M5`를 반환했습니다. `--enable-unsafe-swiftshader`는 소프트웨어 사용을 강제하는 옵션이 아니므로 1차 SwiftShader 고정 표기는 근거가 부족했습니다.

실제 `OrbitGlobe`에 합성 지리 데이터를 주입한 별도 Vite QA 화면에서 측정:

| 마커 그룹 | 아크 | 평균 프레임 간격 | P95 |
| ---: | ---: | ---: | ---: |
| 1,500 | 200 | 16.61 ms | 16.80 ms |
| 1,500 | 400 | 16.60 ms | 16.70 ms |
| 1,500 | 800 | 16.56 ms | 16.70 ms |

모두 이 M5 환경의 vsync 근처입니다. 400개가 하드웨어 한계라는 증거는 없으며, 800 재생 이벤트/400 전체 아크는 여러 기기에 대한 보수적 표시 예산으로 유지했습니다. 인접 방문 쌍을 샘플링해 경로를 줄이되 전체 통계는 줄이지 않습니다. 저성능 모바일의 동일 FPS를 보장하지 않습니다.

WebGL 컨텍스트 손실과 canvas 제거를 직접 검사해 unmount 정리를 확인했습니다. GPU 메모리 MB를 계측하거나 모든 드라이버의 메모리 해제를 보장한 결과는 아닙니다.

4코어 이하/데이터 절약 환경은 낮은 DPR·기하 분할로 시작합니다. 실제 2코어 override/DPR2 context에서 DPR1 canvas와 마커 1,500/아크 400 유지가 확인되었습니다. 지속적인 느린 프레임 신호에 대한 자동 전환도 검사했습니다. 이 전환 검사는 **합성 rAF timestamp**를 쓴 결정 로직 검증이며 실기기 성능 수치로 계산하지 않았습니다.

증거: `renderer.json`, `render-200.json`, `render-400.json`, `render-800.json`, `browser-gates.txt`, `reduced-quality.json/png`.

## QR 길이별 검증

자연 생성 데이터는 278/498/1,001/1,977/2,781자의 유효 공유 URL이었습니다. 정확한 경계는 동일 fragment를 localhost에서 열고 짧은 비민감 query padding을 추가했습니다. 이 padding은 압축 효과로 계산하지 않았습니다.

| 실제 URL 길이 | 추가 query 문자 | 오류 정정 | QR 모듈 | PNG | 원본 PNG 디코딩 | 모바일 복원 |
| ---: | ---: | --- | --- | ---: | --- | --- |
| 273 | 0 | H | 85 × 85 | 372px | PASS | PASS |
| 500 | 7 | H | 113 × 113 | 484px | PASS | PASS |
| 1,000 | 4 | H | 161 × 161 | 676px | PASS | PASS |
| 2,000 | 28 | M | 169 × 169 | 708px | PASS | PASS |
| 2,800 | 24 | L | 173 × 173 | 724px | PASS | PASS |

다섯 단계 모두 압축 데이터를 복원하고 실제 PNG를 브라우저 canvas로 읽어 jsQR의 결과가 원래 URL과 일치하는지 확인했습니다. 모바일 프로필에서 각 URL을 열어 원래 집계와 마커를 복원했고 공급자 요청은 0건이었습니다.

PNG는 여백을 포함해 모듈당 4px이며 UI는 최대 384px, 좁은 화면에서는 가용 폭에 맞춥니다. 긴 QR에 밀도 경고와 PNG 원본·URL 복사 안내를 표시합니다. 확대된 QR 때문에 복사 버튼이 아래로 밀린 문제는 조작 버튼을 QR 위로 옮겨 수정했습니다. 데스크톱과 모바일에서 버튼 전체가 뷰포트에 들어오는지도 검사했습니다.

실물 카메라로 촬영하지 않았으므로 실제 스캔 성공은 **PARTIAL**입니다. 원본 PNG의 디코딩 성공이 CSS로 축소된 화면, 인쇄물, 반사·초점·조명 조건에서의 인식률을 보장하지는 않습니다.

원자료: `qr-matrix.json`, `qr-boundaries.json`, `qr-boundary-*.json`, `qr-restored-*.png`. 새 v2는 원래 hostname 문자열 없이 호스트별 위치·미확인 상태를 유지합니다. 이전 v1의 hostname 정보는 없으므로 상세 전환을 복구했다고 주장하지 않으며 통계·위치는 유지합니다.

## 사용자 흐름과 메인 에이전트 QA

desktop 1440 및 iPhone 14 profile(390px, DPR3, touch)의 Chromium에서 다음을 실제로 실행했습니다.

| 시나리오 | 관찰 결과 | 증거 |
| --- | --- | --- |
| 첫 접속 | 포스터 표시, 초기 canvas 0 | `lazy-initial.png`, `loading-network.json` |
| 깨진 JSON→정상 JSON | 오류 표시 후 6방문/3사이트 복구 | `journey-desktop/mobile.png`, `final-ui.txt` |
| 조회 동의·진행 | 동의 전 요청0/비활성, 진행률·취소 표시 | `journey-*.json`, `manual-live-progress.png` |
| 지구본·순위·방문 패턴 | 마커·선택·드래그·휠·모바일 touch, 통계 유지 | `journey-*.png`, `manual-live-globe.png` |
| 타임라인 | 재생/일시정지/탐색, 미확인 이벤트 양쪽 아크0 | `journey-*.json` |
| 기간 오류 경계 | epoch0 정상 표시, 빈 기간0회, 불명 시각은 연결 생략 안내 | `epoch-before.*`, `final-ui.txt` |
| 공유 | 익명 미리보기/좌표 공개 안내/QR/다운로드 | `manual-share-final.png` |
| 새 탭 | 집계·호스트 위치·미확인 간격 복원, provider 요청0 | `restored-desktop/mobile.png`, `manual-restored-mobile.png` |
| WebGL 없음 | 안내·통계·공유 유지 | 기존 테스트 유지, `final-ui.txt` |

메인 에이전트는 omowright에서 실제 fixture 파일을 업로드하고 동의·실제 조회·선택·드래그·확대·재생·공유·모바일 새 탭 복원을 직접 실행했습니다. 자동화 wire fixture 결과와 실제 공급자 결과를 구분했습니다. 라이브 공급자 결과는 시간에 따라 바뀔 수 있습니다.

## 수정 경로

전체 SHA 비교 목록은 `changes.json`, 실제 소스 차이는 `source-changes.patch`입니다.

- 코어: `src/features/history/core/history.ts`, `src/features/geolocation/services/dns.ts`, `src/features/geolocation/core/geo.ts`, `src/features/geolocation/core/location-display.ts`.
- 공유: `src/share/codec.ts`, 신규 `wire.ts`, `qr.ts`.
- 화면·렌더: `src/App.vue`, `style.css`, `components/OrbitGlobe.vue`, `vite.config.ts`.
- 에셋: `public/earth-preview.webp`, `public/earth.webp`. 원래 JPEG는 보존.
- 회귀: core/share/precision/QR 단위 테스트, `tests/e2e/phase2.spec.ts`, `qr-boundaries.spec.ts`, renderer metadata 보정, `tests/rendering/*`, `playwright.render.config.ts`.
- 문서: README, ARCHITECTURE, GEOLOCATION, SHARING, VERIFICATION.

## 직접 확인이 남은 항목

- 실물 휴대전화 카메라, 인쇄물·다른 화면에서의 QR 스캔.
- 실제 모바일 GPU·저사양 Android·Safari/Firefox의 그래픽·제스처·권한 차이.
- 배포 호스팅의 HTTPS, 캐시, 저속 네트워크 및 실제 사용자의 clipboard 권한.
- 실제 시·군·구 경계와 물리 서버 위치. 현재 공급자 정보로 확인 불가능합니다.
- VRAM MB 단위 잔류 계측, 장시간 운영. 컨텍스트 해제 검사는 통과했습니다.

1차 보조 frontend-detect 도구는 renderer 자체 SyntaxError로 실패했습니다. 이 결과를 애플리케이션 PASS나 Lighthouse 점수로 바꾸지 않았습니다. 이번 필수 5개 명령과 실제 브라우저 검증은 해당 도구에 의존하지 않습니다.

별도 backend/DB/auth/proxy/analytics를 추가하지 않았습니다. 원본 방문기록은 로컬에만 남고 외부 조회는 동의 후 hostname·공용 IP만 전송합니다. OMO gateway 설정은 변경하지 않았고 프로젝트 커밋은 만들지 않았습니다.
