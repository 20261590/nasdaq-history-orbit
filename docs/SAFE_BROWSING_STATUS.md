# Google Safe Browsing v5 구현 상태

검증일: 2026-11-23. 현재 연동 상태는 **PARTIAL**이다. `hashes.search` 기반 기능과 Mock 검증은 완료했지만 정상 Google API 키가 없어 실제 인증 성공 및 실제 위협 응답은 확인하지 않았다. 앱은 인증 성공을 주장하지 않는다.

## 공식 문서 및 실제 엔드포인트 확인

- `GET https://safebrowsing.googleapis.com/v5/hashes:search`에 4바이트 SHA-256 접두사를 보내고, 응답의 32바이트 전체 해시와 로컬 전체 해시가 정확히 같은 경우에만 위협으로 표시한다.
- 요청당 접두사는 공식 권고에 따라 30개 이하로 배치한다. 응답의 `cacheDuration`을 접두사별 양성·음성 결과 모두에 적용한다.
- 알 수 없는 위협 유형 또는 위협 속성이 있는 `FullHashDetail` 전체를 무시한다. `CANARY`, `FRAME_ONLY`, `THREAT_ATTRIBUTE_UNSPECIFIED`도 일반 URL 위협 경고에 사용하지 않는다.
- Google 약관의 최신성 조건 때문에 Google 확인 후 30분 또는 서버 캐시 만료 중 빠른 시점에 결과를 `STALE`로 전환한다. 자동 외부 재조회는 하지 않는다.
- 실제 무키 요청은 HTTP 403이었다. 합성 HTTPS 원점의 실제 GET 응답과 `X-Goog-Api-Key` OPTIONS 프리플라이트에서 해당 원점의 `Access-Control-Allow-Origin`을 확인했다. 정상 키가 없으므로 인증 성공은 미검증이다.
- GitHub Pages의 정적 HTTPS 페이지에서 브라우저 직접 호출 가능한 구조다. 백엔드·프록시는 추가하지 않았고 기존 Pages workflow의 빌드 환경변수만 확장했다. 실제 Pages 저장소 설정과 배포는 변경하거나 실행하지 않았다.

공식 근거:

- https://developers.google.com/safe-browsing/reference/rest/v5/hashes/search
- https://developers.google.com/safe-browsing/reference/URLs.and.Hashing
- https://developers.google.com/safe-browsing/terms
- https://docs.cloud.google.com/docs/authentication/api-keys
- https://docs.cloud.google.com/docs/authentication/api-keys-best-practices

## 활성 구현

- 배포 키가 있으면 별도 키 입력 없이, 없으면 선택적 개인 키 입력 후 사용할 수 있다. 두 경우 모두 외부 조회에 명시적으로 동의한 뒤에만 요청한다.
- GitHub Actions Secret이 설정된 Pages 빌드는 제한된 시연 키를 `VITE_SAFE_BROWSING_API_KEY`로 주입한다. 이 값은 배포 JavaScript에 포함되는 공개 키이며 Secret이 배포 후에도 값을 숨긴다고 주장하지 않는다. Google 요청에는 URL query가 아닌 `X-Goog-Api-Key` 헤더를 사용한다.
- 배포 키가 없으면 명확한 미설정 안내와 선택적 개인 키 입력을 제공한다. 개인 키는 컴포넌트 메모리에만 유지한다. 어느 방식도 키를 URL·로그·Web Storage·IndexedDB·쿠키에 기록하지 않는다.
- 공개 시연 키는 Safe Browsing API와 실제 GitHub Pages HTTPS 원점으로 제한하고 사용량을 감시해야 한다. HTTP referrer 제한과 프론트엔드 요청 제한은 완벽한 남용 방지가 아니다.
- 분석 제외 전 개인정보 검사는 기존 로컬 기능으로 유지한다. 외부 위협 평판은 분석 제외 후 유효 URL을 대상으로 하는 별도 패널이다.
- URL 중복 제거, 공식 정규화·표현 생성, SHA-256, 4바이트 접두사 조회, 전체 해시 비교, 세션 캐시, 취소, 요청 제한, 재검사, 진행률과 상태별 건수를 제공한다.
- 원본 URL은 화면에 표시하지 않고 기존 마스킹 DTO만 사용한다. Google에는 전체 URL이나 전체 해시가 아니라 4바이트 접두사만 전송한다.
- 상태는 `KNOWN_THREAT`, `NO_KNOWN_THREAT`, `NOT_CHECKED`, `CHECK_FAILED`, `STALE`로 분리한다. “알려진 위협 미발견”을 사이트 안전 판정으로 표현하지 않는다.
- Share 계약·파일은 변경하지 않았고 Share는 계속 `NOT IMPLEMENTED`다. 위치, 통계, 활동 분석, 3D 지구본, 카메라, GitHub Pages 설정은 변경하지 않았다.

## 보존본 재사용과 변경

`work-in-progress/safe-browsing-v5/`의 10개 `.txt` 파일은 참조 자료로 그대로 보존했다. URL 정규화·해싱, transport/parser, 세션 엔진, UI 초안, 단위/E2E 초안을 검토한 뒤 활성 경로로 재사용했다. 공식 권고에 맞춰 엔진 배치를 100개에서 30개로 낮추고, 기존 App → AnalysisWorkbench → SecurityPanel 데이터 흐름에 분석 제외 후 방문기록만 최소 연결했다.

## 검증 결과

- TypeScript, ESLint, 프로덕션 빌드: PASS
- Vitest: 22개 파일, 411개 PASS
- 기본 Playwright E2E: 17개 PASS. 배포 키 Safe Browsing 4개 시나리오 포함
- 키 미설정 fallback Playwright E2E: 1개 PASS
- 카메라 전용 Playwright 회귀: 19개 PASS
- 동의 전 외부 요청 0건, 정확한 전체 해시 매칭, 접두사 충돌 오탐 방지, 403/429/네트워크/잘못된 응답 분류, 양성·음성 캐시, 만료·재검사, 취소·요청 상한을 검증했다.
- Mock 응답은 테스트에서만 사용했다. 실제 Google 검증은 CORS와 인증 실패 응답까지만 수행했다.

## 남은 문제

정상 제한 키로 허용된 GitHub Pages 원점에서 실제 200 응답과 알려진 테스트 위협의 전체 해시 일치를 확인해야 최종 연동을 PASS로 올릴 수 있다. Secret 등록과 실제 배포는 저장소 관리자가 수행해야 한다. 상세 절차와 공개 키 위험은 [SAFE_BROWSING_DEPLOYMENT.md](SAFE_BROWSING_DEPLOYMENT.md)에 기록했다.
