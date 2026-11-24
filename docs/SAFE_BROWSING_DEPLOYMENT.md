# Safe Browsing 공개 시연 키 배포

History Orbit은 비상업적 대학 팀 프로젝트의 GitHub Pages 시연을 위해 제한된 Google Safe Browsing API 키를 사용할 수 있다. 백엔드·프록시·데이터베이스는 사용하지 않는다. 이 방식은 방문자에게 별도 키 입력을 요구하지 않지만, 키 자체를 비밀로 만들지는 않는다.

## 보안 모델

GitHub Actions Secret `SAFE_BROWSING_API_KEY`는 소스와 Actions 로그에 실제 값을 적지 않도록 빌드 입력을 관리한다. 빌드 단계가 이를 `VITE_SAFE_BROWSING_API_KEY`로 전달하면 Vite가 값을 생성된 JavaScript에 포함한다. 따라서 배포 후 키는 브라우저 개발자 도구, 다운로드한 JavaScript, Google 요청 헤더에서 확인할 수 있는 **공개 시연 키**다.

HTTP referrer 제한과 API 제한은 노출된 키의 오용 범위를 줄이지만 완벽한 남용 방지는 아니다. referrer는 브라우저 밖의 클라이언트에서 위조될 수 있고, 프론트엔드 요청 제한도 변조된 클라이언트에는 강제할 수 없다. 사용량·할당량 모니터링과 신속한 키 폐기·교체가 함께 필요하다.

## Google Cloud 설정

1. 수업 시연 전용 Google Cloud 프로젝트를 만들거나 지정한다. 다른 서비스·운영 자격 증명과 분리한다.
2. **APIs & Services → Library**에서 `Safe Browsing APIs`를 활성화한다. 비상업적 사용 조건을 확인한다.
3. **APIs & Services → Credentials → Create credentials → API key**에서 시연 전용 키를 만든다.
4. 키의 **API restrictions**를 `Restrict key`로 바꾸고 `Safe Browsing API`만 허용한다.
5. **Application restrictions**를 `Websites`로 바꾸고 실제 Pages 주소만 등록한다. 예를 들어 프로젝트 페이지라면 `https://OWNER.github.io/REPOSITORY/*`, 사용자 페이지라면 `https://OWNER.github.io/*`를 사용한다. 최종 주소와 custom domain 유무를 확인해 정확한 HTTPS 패턴만 등록한다.
6. Quotas/Monitoring에서 호출량과 403·429 증가를 관찰한다. 수업 시연에 필요한 최소 할당량을 유지하고 이상 사용 경보를 구성한다.

웹사이트 제한을 저장한 직후 전파에 시간이 걸릴 수 있다. 실제 배포 원점에서 제한된 키가 작동하는지 확인하기 전에는 연동을 PASS로 보고하지 않는다.

## GitHub Actions Secret 등록

저장소 관리자 또는 권한이 있는 사용자가 직접 다음을 수행한다.

1. GitHub 저장소의 **Settings → Secrets and variables → Actions**로 이동한다.
2. **New repository secret**을 선택한다.
3. 이름을 정확히 `SAFE_BROWSING_API_KEY`로 입력하고 Google Cloud의 제한된 시연 키 값을 저장한다.
4. Secret 값을 workflow YAML, Issue, PR 본문, 로그 또는 문서에 복사하지 않는다.

`.github/workflows/deploy.yml`의 빌드 단계만 다음 매핑을 사용한다.

```yaml
env:
  VITE_SAFE_BROWSING_API_KEY: ${{ secrets.SAFE_BROWSING_API_KEY }}
```

Secret이 없으면 값은 빈 문자열이다. 기본 브랜치 배포 빌드는 계속 진행하며 결과 앱은 배포 키 미설정 안내와 선택적 개인 키 입력을 제공한다. workflow는 키 값을 출력하지 않고 미설정 여부만 warning으로 남긴다. PR은 Secret·Pages 메타데이터·배포 artifact를 사용하지 않는 별도 job에서 타입·린트·Mock 단위 테스트와 키 없는 빌드를 실행하므로 fork PR에도 공개 키가 전달되지 않는다.

## 배포와 실제 확인

1. GitHub **Settings → Pages → Source**를 `GitHub Actions`로 설정한다.
2. 검토된 변경을 기본 브랜치에 반영하면 기존 workflow가 저장소별 base path로 검사·빌드·artifact 업로드·Pages 배포를 수행한다.
3. deploy job이 제공하는 실제 HTTPS URL을 연다. URL을 추측하지 않는다.
4. 공개 합성 방문기록을 업로드하고 개인정보 점검 → Google 사이트 위험 점검으로 이동한다.
5. “시연용 배포 키 사용 가능”과 개인 키 입력 필드가 없음을 확인한다.
6. 동의 전 `safebrowsing.googleapis.com` 요청이 0건인지 확인한다. 동의 후 검사를 시작해 요청이 `v5/hashes:search`로 가며 키가 query string에 없고 4바이트 해시 접두사만 포함되는지 확인한다.
7. HTTP 200 응답, 전체 해시 대조 결과, 캐시·만료와 재검사를 확인한다. 403은 키/API/referrer 제한 문제, 429는 할당량 문제로 기록하며 위협 미발견으로 간주하지 않는다.
8. 실제 Response Headers에 CSP가 있다면 `connect-src`가 `https://safebrowsing.googleapis.com`을 허용하는지 확인한다. 일반 GitHub Pages workflow는 별도 CSP를 설치하지 않는다.

정상 제한 키의 실제 200 응답을 확인하지 않았다면 Mock 테스트가 모두 통과해도 상태는 PARTIAL이다.

## 로컬 개발

배포 키 없이 `bun run dev`를 실행하면 개인 키 fallback UI와 Mock 테스트를 사용할 수 있다. 배포 키 동작을 로컬에서 확인할 때는 Git에서 제외되는 `.env.local`에 다음 이름만 사용한다.

```dotenv
VITE_SAFE_BROWSING_API_KEY=로컬_테스트용_제한키
```

로컬 개발용 키와 공개 Pages 시연용 키를 분리하는 것을 권장한다. `.env.local`을 Git에 추가하지 말고 개발 서버를 다시 시작한 뒤 적용 여부를 확인한다.

## 키 교체와 폐기

1. Google Cloud에서 새 제한 키를 만들고 동일한 API·웹사이트 제한과 할당량 정책을 적용한다.
2. GitHub의 `SAFE_BROWSING_API_KEY` Secret 값을 새 키로 교체한다.
3. 기본 브랜치 workflow를 다시 실행해 새 JavaScript를 배포하고 실제 원점에서 검사한다.
4. 브라우저 캐시와 이전 artifact에 구 키가 남을 수 있으므로 전환 확인 후 Google Cloud에서 구 키를 비활성화하거나 삭제한다.
5. 오용이 의심되면 순서를 기다리지 말고 구 키를 즉시 폐기하고 사용량·로그를 검토한다.

공식 자료:

- https://developers.google.com/safe-browsing/
- https://developers.google.com/safe-browsing/terms
- https://docs.cloud.google.com/docs/authentication/api-keys
- https://docs.cloud.google.com/docs/authentication/api-keys-best-practices
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- https://vite.dev/guide/env-and-mode.html
