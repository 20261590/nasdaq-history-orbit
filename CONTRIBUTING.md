# Contributing to History Orbit

## 개발 환경

Bun과 저장소에 고정된 lockfile을 사용한다.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run build
```

카메라나 Globe 경로를 건드린 경우 `bunx playwright test --config playwright.camera.config.ts`도 실행한다.

## 작업 위치

- 방문기록 파싱/업로드: `src/features/history`
- DNS/GeoIP: `src/features/geolocation`
- 지구본/카메라: `src/features/globe`
- 통계/비교/활동: `src/features/analytics`
- 개인정보/Safe Browsing: `src/features/security`
- 기능 조합/변환: `src/app`
- 공통 계약/유틸리티/토큰: `src/shared`
- Share 담당자 전용: `src/features/share`

다른 Feature의 내부 파일을 import하지 말고 공개 `index.ts`를 사용한다. 공통으로 보이는 코드라도 한 Feature만 사용한다면 그 Feature에 둔다.

## 브랜치와 Pull Request

브랜치 이름은 목적이 드러나게 `feature/<name>`, `fix/<name>`, `refactor/<name>`, `docs/<name>` 형식을 권장한다. 한 PR에는 한 기능 또는 한 구조 변경을 담고, 무관한 포맷 변경을 섞지 않는다.

PR 설명에는 다음을 포함한다.

- 변경한 Feature와 공개 계약
- 사용자 동작 또는 계산 결과가 달라지는지 여부
- 개인정보 및 외부 요청 영향
- 실행한 검증 명령과 결과
- 카메라, Security, Share에 미치는 영향

## 테스트와 경계

`bun run test:architecture`는 Feature 공개 진입점, shared 독립성, 계층 순환을 검사한다. 계산 로직은 같은 입력에 대한 기존 결과 단언을 유지한다. 실패를 통과시키기 위해 기존 테스트를 삭제하거나 단언을 완화하지 않는다.

외부 API 테스트는 Mock을 기본으로 하며 실제 키가 없으면 인증 성공을 주장하지 않는다. 사용자 동의 이전의 외부 요청은 항상 0건이어야 한다. API 키, 원본 URL, 토큰은 로그·오류·fixture에 넣지 않는다.

## 동결 영역

Share는 다른 팀원이 담당하며 다음 파일은 담당자와 합의하지 않고 변경하지 않는다.

- `src/features/share/index.ts`
- `src/features/share/types.ts`
- `src/features/share/SharePanel.vue`

Share는 현재 NOT IMPLEMENTED다. 연결 변경은 `src/app/adapters/share-input.ts`에서 처리하고 기존 `ShareInput` 계약을 유지한다. 카메라 비행/체류 동작, GitHub Pages base path와 배포 설정도 관련 작업이 아닌 PR에서 변경하지 않는다.

## Safe Browsing 배포

공개 데모 키 설정과 운영 제한은 `docs/SAFE_BROWSING_DEPLOYMENT.md`를 따른다. GitHub Secret은 빌드 결과의 키를 비밀로 만들지 않으므로 공개 키로 취급하고 API/referrer/할당량 제한을 적용한다. Secret이나 실제 키 문자열은 커밋하지 않는다.
