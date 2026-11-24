# History Orbit 아키텍처

History Orbit은 Vue 3 + TypeScript + Vite 기반의 정적 SPA다. 기능 코드는 `src/features`, 기능 조합은 `src/app`, 공통 계약과 무상태 유틸리티는 `src/shared`가 소유한다. 백엔드, 데이터베이스, 전역 상태 라이브러리는 사용하지 않는다.

## 디렉터리 구조

```text
src/
├── app/
│   ├── adapters/          # Feature 간 형식 변환, 전역 검증 설정
│   ├── components/        # 여러 Feature를 조합하는 화면
│   └── composables/       # 앱 실행 흐름과 화면 상태
├── features/
│   ├── history/           # 업로드, 파싱, 정규화, 중복 제거
│   ├── geolocation/       # DNS, GeoIP, 캐시, 위치 표시
│   ├── globe/             # Three.js, 궤적, 카메라, 재생
│   ├── analytics/         # 통계, 비교, 활동 분석, 차트
│   ├── security/          # 개인정보 점검, 제외 정책, Safe Browsing v5
│   └── share/             # 동결된 NOT IMPLEMENTED 계약
├── shared/
│   ├── styles/            # 디자인 토큰과 공통 UI 스타일
│   ├── types/             # Feature 경계를 통과하는 공통 데이터 계약
│   └── utils/             # 특정 Feature에 의존하지 않는 유틸리티
└── App.vue                # 공개 컴포넌트 연결과 최상위 레이아웃
```

각 Feature의 외부 진입점은 `index.ts`다. 다른 Feature나 App은 Feature 내부의 `core/`, `services/`, `components/`를 직접 import하지 않는다. Feature 내부 코드는 자기 내부 구현과 `shared`만 참조한다. `shared`는 App 또는 Feature에 의존하지 않는다.

## 의존성 방향

```text
App.vue
  -> app/composables + app/components + app/adapters
  -> feature index.ts
feature internals
  -> shared types/utils
app adapters
  -> feature index.ts + shared
shared
  -> 외부 패키지 또는 표준 API만
```

`tests/architecture-boundaries.test.ts`가 공개 진입점 우회, shared의 역방향 의존, 계층 순환을 검사한다. `bun run test:architecture`로 독립 실행할 수 있으며 전체 단위 테스트에도 포함된다.

## 데이터 흐름

```text
JSON File / Drop
  -> HistoryUploadPanel
  -> History.parseHistory
  -> Visit[] (정규화, 시간순, 중복 제거)
       ├─> Security.inspectSecurity / Safe Browsing (동의 후 해시 접두사만 외부 조회)
       ├─> Geolocation.LocationEngine (동의 후 hostname/IP 조회)
       │     └─> HostLocation[] -> Globe
       └─> Analytics (Statistics / Comparison / Activity)
             └─> App adapter -> 익명 집계 ShareInput -> frozen SharePanel
```

원본 URL은 History와 Security 경계 안에서 필요한 기간만 유지한다. Geolocation은 hostname과 공용 IP만 사용하며, Analytics는 정규화된 이벤트를 사용한다. Share 어댑터는 기존 계약이 허용하는 집계만 명시적으로 복사한다.

## 기능별 책임

- History: 파일 크기와 JSON 형식 검증, 공용 웹 방문 URL 파싱, 등록 도메인 정규화, 중복 제거, 시간순 정렬, 재생 샘플링.
- Geolocation: Google DoH, GeoJS, 공용 IP 검증, 요청 취소·동시성·캐시, 공급자 응답 검증, 위치 정밀도 표시.
- Globe: 마커·아크 계산, Three.js 수명주기, 비행 보간, 최소 2초 체류, 일시정지·재생 동기화. 리팩터링에서는 알고리즘을 변경하지 않았다.
- Analytics: 방문 통계, 사이트 순위, UTC 분포, 기간 비교, 세션·전환 분석과 차트.
- Security: 로컬 개인정보 탐지, URL 마스킹, 분석/공유 제외, Google Safe Browsing v5. Safe Browsing 엔진과 공개 배포 키 정책은 유지한다.
- Share: `index.ts`, `types.ts`, `SharePanel.vue`가 동결돼 있으며 NOT IMPLEMENTED다. App 어댑터만 기존 입력 계약을 만든다.

## Vue, CSS, TypeScript 분리

Feature 컴포넌트의 template과 이벤트 연결은 `components/*.vue`, 계산과 외부 조회는 `core/*.ts` 또는 `services/*.ts`, 기능별 레이아웃은 `<feature>.css`에 둔다. `src/style.css`는 디자인 토큰, 공통 스타일과 Feature 스타일을 순서대로 불러오는 진입점이다. Security 컴포넌트의 기존 scoped 스타일은 동작 보존을 위해 유지한다.

## 주요 설계 결정

- `useHistoryOrbit`이 화면 전체 실행 순서와 취소 가능한 작업을 조정한다. App.vue는 공개 컴포넌트 조합과 상태 전달만 담당한다.
- 공통 `Visit`, `HostLocation`, `Statistics` 계약은 `shared/types`에 둔다. 한 기능에만 필요한 비교·활동·Safe Browsing 타입은 해당 Feature에 남긴다.
- Share 변환은 `app/adapters/share-input.ts`에 둔다. Analytics나 Security가 Share 내부 계약에 직접 결합되지 않게 한다.
- 카메라, 분석, Safe Browsing 알고리즘은 파일 이동과 import 경로 정리만 수행하고 계산 의미를 바꾸지 않는다.
- GitHub Pages base path와 배포 workflow는 기존 설정을 유지한다.
