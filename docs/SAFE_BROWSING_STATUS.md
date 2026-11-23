# Safe Browsing v5 개발 중단 상태

Google Safe Browsing 기능 개발은 요청에 따라 중단했다. 현재 앱에는 연결하지 않았으며 Google 위험 평판 검사는 제공하지 않는다. 기존 개인정보 검사·URL 마스킹·분석 제외는 그대로 동작한다. Share는 NOT IMPLEMENTED다.

## 별도 보존 위치

`work-in-progress/safe-browsing-v5/`에 미완성 소스와 새 테스트 10개 파일을 원래 경로 구조대로 보존했다. 파일 끝의 `.txt`를 제거하면 원래 파일명이다. 이 보존본은 컴파일·번들·자동 테스트 대상이 아니며 전달용 압축에도 포함한다. 기존 서비스 파일과 테스트는 제거하지 않았다.

## 구현한 부분과 미완료

- URL 정규화, PSL 기반 표현, SHA-256 및 4바이트 접두사 코드와 공식 사례 검사가 작성되어 있다. 작업자 단독 검사 99개가 통과했으나 서비스 통합은 완료하지 않았다.
- 해시 조회 클라이언트와 세션 캐시·취소·최신성 엔진 및 단위 검사가 작성되어 있다. 작업자 단위 검사는 통과했으나 마지막 변경 이후 전체 통합·릴리스 검증은 미완료다.
- 별도 Security UI 초안과 브라우저 테스트 초안은 앱에 연결하거나 실행하지 않았다.
- 실제 Google v5 엔드포인트는 브라우저에서 접근했지만 무키 403 및 합성 잘못된 키 400 응답만 확인했다. **정상 API 키의 실제 평판 성공 응답은 검증하지 않았다.**
- API 키를 제공받거나 소스·환경변수·보존본에 저장하지 않았다. 실제 API 연동 상태는 **PARTIAL**이다.

## 다른 컴퓨터에서 재개

1. 전달 압축을 풀고 프로젝트 루트에서 `bun install --frozen-lockfile`을 실행한다.
2. 기존 앱의 `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`가 통과하는지 확인한다.
3. 보존본을 먼저 검토한 뒤 필요한 파일만 `.txt`를 제거해 원래 위치로 복사한다. 한꺼번에 기존 소스를 덮어쓰지 않는다.
4. 기존 Security 개인정보 로직과 Share 계약을 유지하면서 App → AnalysisWorkbench → SecurityPanel의 최소 데이터 연결을 설계한다.
5. 공식 v5 정규화·전체 해시 매칭·캐시 만료와 30분 경고 최신성·오류·취소·동의·키 비노출 검증을 마친다.
6. 개인 키는 완성된 로컬 화면에 직접 입력하고 메모리에서만 사용한다. 키를 빌드 설정이나 압축에 넣지 않는다. 실제 인증 성공과 CORS·배포 원점을 별도로 검증한다.
7. Mock 결과와 실제 Google 응답을 구분한 뒤 기존 브라우저·카메라 회귀 검사를 실행한다.

공식 근거:
- https://developers.google.com/safe-browsing/reference/rest/v5/hashes/search
- https://developers.google.com/safe-browsing/reference/URLs.and.Hashing
- https://developers.google.com/safe-browsing/terms

전달 압축에서는 의존성·빌드 결과·로그·임시 캐시·생성된 브라우저 증거·개인 데이터·키·환경 파일·기존 완성본 백업을 제외한다. `tests/fixtures`의 합성 테스트 입력은 개발에 필요하므로 포함한다. 기존 완성본 백업은 원래 위치에 그대로 보존한다.
