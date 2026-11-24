# Feature 리팩터링 변경 추적

이 문서는 커밋하지 않은 Safe Browsing 작업과 Feature Architecture 작업을 이후 별도 커밋/PR로 나눌 때의 경계를 기록한다.

## 보존 기준

- 작업 브랜치: `refactor/feature-architecture`
- 원본 보존 stash: `stash@{0}`
- stash object: `3306a353914091803b6dcc6c55041bc45eec5db4`
- stash 메시지: `safe-browsing-before-feature-architecture`
- stash는 apply만 했으며 삭제하지 않았다.

## 리팩터링 전 Safe Browsing 변경

추적 파일:

- `.github/workflows/deploy.yml`
- `docs/GITHUB_PAGES.md`
- `docs/SAFE_BROWSING_STATUS.md`
- `package.json`
- `playwright.config.ts`
- `src/App.vue`
- `src/components/AnalysisWorkbench.vue`
- `src/components/SecurityPanel.vue`

리팩터링 전 untracked 파일:

- `docs/SAFE_BROWSING_DEPLOYMENT.md`
- `playwright.no-safe-browsing-key.config.ts`
- `src/features/security/ThreatPanel.vue`
- `src/features/security/safe-browsing/*`
- `src/vite-env.d.ts`
- `tests/e2e/security-no-deployment-key.spec.ts`
- `tests/e2e/security-reputation.spec.ts`
- `tests/security/*`

## Architecture 변경

- 기존 `src/core`, 루트 카메라/지구본 파일과 `src/components`의 기능 파일을 `src/features/*`로 이동했다.
- 공통 타입과 네트워크 유틸리티를 `src/shared`로 이동했다.
- 기능 조합, Share 변환, Zod 설정을 `src/app`으로 이동했다.
- `src/style.css`를 aggregator로 줄이고 공통/기능 CSS를 분리했다.
- 테스트 import를 공개 `index.ts` 계약으로 변경하고 아키텍처 경계 테스트를 추가했다.
- `docs/ARCHITECTURE.md`, `docs/FEATURE_CONTRACTS.md`, `CONTRIBUTING.md`를 현행 구조에 맞췄다.

## 겹치는 파일

다음 파일은 Safe Browsing 변경과 구조 이동이 모두 포함되어 경로만으로 두 작업을 나눌 수 없다.

- `src/App.vue` → 실행 로직은 `src/app/composables/useHistoryOrbit.ts`로 이동
- `src/components/AnalysisWorkbench.vue` → `src/app/components/AnalysisWorkbench.vue`
- `src/components/SecurityPanel.vue` → `src/features/security/components/SecurityPanel.vue`
- `src/features/security/ThreatPanel.vue` → `src/features/security/components/ThreatPanel.vue`
- `package.json` → Safe Browsing E2E script와 architecture script가 함께 존재

분리 시에는 보존 stash를 Safe Browsing 기준으로 사용하고, 해당 기준 위에 이 리팩터링의 이동/경로 변경을 적용해야 한다. 현재 작업에서는 commit, stash drop, push를 수행하지 않았다.

## 동결 확인

다음 Share 파일은 리팩터링 전후 SHA-256이 동일하다.

- `src/features/share/index.ts`: `8b934a1183fe39f2fdb1248f9fdc024b4623860d3a60a2df656031768d290a6f`
- `src/features/share/types.ts`: `64112359c65c38c535900bc6ecabf4a78a65b4b9344314d5725b8625427101a5`
- `src/features/share/SharePanel.vue`: `f72145703543714eff8511a1cca81e5ad374e04fe11467485f14f2c64c7655e2`
