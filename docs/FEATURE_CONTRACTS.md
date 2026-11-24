# Feature 공개 계약

모든 소비자는 아래 공개 진입점만 import한다. 내부 경로가 필요해 보이면 먼저 공개 API 변경을 협의하고 계약 테스트를 추가한다.

## 공통 계약

`src/shared/types/index.ts`:

- `Visit`: History가 만든 정규화 방문 이벤트. 원본 URL, hostname, 등록 도메인, UTC timestamp, 원본 순서가 포함된다.
- `GeoLocation`, `HostLocation`, `LookupProgress`: 위치 조회와 Globe 사이 계약.
- `Statistics`, `SiteStat`, `Distribution`: Analytics가 App에 돌려주는 집계.

`src/shared/utils/network.ts`는 공용 hostname, 등록 도메인과 공용 IP 판정만 제공하며 Feature 상태를 소유하지 않는다.

## History

진입점: `src/features/history/index.ts`

- 입력: 사용자가 선택한 JSON에서 파싱한 `unknown`.
- 출력: `ParseResult`와 `Visit[]`.
- 공개 API: `parseHistory`, `filterVisits`, `sampleTimeline`, `createDemoHistory`, `HistoryUploadPanel`.
- Geolocation, Analytics, Security는 History 내부 파서를 호출하지 않고 App이 전달한 `Visit[]`만 받는다.

## Geolocation

진입점: `src/features/geolocation/index.ts`

- 입력: `Visit[]` 또는 그 hostname 집합과 사용자 동의 상태.
- 출력: `HostLocation[]`, `LookupProgress`.
- 공개 API: `LocationEngine`, `parseDns`, `parseGeo`, `describeLocation`, `createMockHosts`, `GeolocationPanel`.
- 외부 요청은 App 흐름에서 사용자가 동의하고 실행을 선택한 뒤에만 시작한다.

## Globe

진입점: `src/features/globe/index.ts`

- 입력: 위치가 결합된 사이트/방문 데이터, `CameraCommand`.
- 출력: `Marker[]`, `OrbitArc[]`, `MotionStatus` 이벤트.
- 공개 API: `OrbitGlobe`, `makeMarkers`, `makeArcs`, `playbackGroup`, 카메라와 모션 타입/함수.
- 비행 시간, 목적지 체류, pause/resume 의미는 호환성 계약이다.

## Analytics

진입점: `src/features/analytics/index.ts`

- 입력: 정규화된 분석 대상 이벤트와 선택적 위치 결과.
- 출력: `Statistics`, `ComparisonReport`, `ActivityReport`.
- 공개 API: 통계/비교/활동 계산 함수와 차트 컴포넌트, 관련 타입.
- 원본 이벤트의 `order`를 다시 번호 매기지 않는다. 샘플 데이터로 전체 통계를 계산하지 않는다.

## Security

진입점: `src/features/security/index.ts`

- 입력: History의 `Visit[]`.
- 출력: `SecurityReport`, 분석 제외/공유 제외 집합, Safe Browsing 평판 상태.
- 공개 API: `inspectSecurity`, `useExclusions`, `SecurityPanel`과 제외/보고 타입.
- Safe Browsing 내부의 정규화·SHA-256·4바이트 접두사·전체 해시 대조는 Security 내부 계약이다. 실인증 미검증 상태를 PASS로 승격하지 않는다.

## App 통합과 Share

`src/app/composables/useHistoryOrbit.ts`가 History → Security/Geolocation/Analytics → Globe 순서를 조정한다. `AnalysisWorkbench`는 Analytics와 Security 공개 컴포넌트를 조합한다.

`src/app/adapters/share-input.ts`만 기존 Share 입력으로 변환한다. App → Share에는 익명화된 집계만 전달하며 원본 URL, hostname, IP, 제목, 토큰, 개별 방문 시각은 전달하지 않는다.

다음 파일은 다른 팀원의 작업 범위이며 이번 아키텍처 작업에서 수정하지 않는다.

- `src/features/share/index.ts`
- `src/features/share/types.ts`
- `src/features/share/SharePanel.vue`

Share는 NOT IMPLEMENTED 상태다. 계약 변경이 필요하면 `docs/SHARE_HANDOFF.md`와 소비자 테스트를 근거로 별도 PR에서 합의한다.

## 계약 변경 절차

1. 소비 Feature와 영향받는 App adapter를 식별한다.
2. 공개 `index.ts`와 타입만 최소 변경한다.
3. 기존 계산 결과를 고정하는 단위/통합 테스트를 먼저 갱신한다.
4. `bun run test:architecture`로 내부 경로 참조와 순환을 확인한다.
5. Security, Share, 카메라 계약에 영향이 있으면 각 담당자 리뷰를 요청한다.
