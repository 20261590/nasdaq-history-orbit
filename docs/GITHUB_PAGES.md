# History Orbit GitHub Pages 배포

이번 설정의 배포 대상은 GitHub Pages뿐입니다. 백엔드, API 프록시, 다른 호스팅 서비스는 추가하지 않습니다. 커밋·staging·push·실제 배포·GitHub 설정 변경은 수행하지 않았습니다.

## 현재 저장소 상태

2026-11-23 현재 Git 저장소의 `feature/safe-browsing` 브랜치에서 배포 준비 변경을 검증했다. 기본 브랜치 반영, push, Pages 활성화, Secret 등록과 실제 배포는 수행하지 않았다. GitHub 소유자와 최종 Pages URL을 코드에서 추정하지 않는다.

실제 저장소 정보는 Actions 실행 시 `actions/configure-pages@v5`가 Pages API에서 읽습니다. 따라서 저장소명을 나중에 정해도 코드 안의 임시 이름을 찾아 바꿀 필요가 없습니다.

## 사용자 페이지와 프로젝트 페이지

| Pages 유형 | 주소 형태 | configure-pages `base_path` | Vite에 전달되는 값 |
| --- | --- | --- | --- |
| 사용자·조직 페이지 | `https://소유자.github.io/` | 빈 문자열 | `/` |
| 프로젝트 페이지 | `https://소유자.github.io/저장소명/` | `/저장소명` | `/저장소명/` |

위 표는 유형 설명이며 실제 저장소 주소를 추정한 것이 아닙니다. 사용자·조직 페이지 저장소는 GitHub의 `소유자.github.io` 명명 규칙을 따릅니다. 실제 사이트 메타데이터를 사용하므로 Pages에서 설정한 경로가 빌드에 반영됩니다.

`vite.config.ts`는 `PAGES_BASE_PATH`를 사용하고, 설정하지 않은 로컬 개발·기존 RC 실행은 이전처럼 `./`를 사용합니다. Safe Browsing 공개 시연 빌드만 `VITE_SAFE_BROWSING_API_KEY`를 사용합니다. 이 값은 생성된 JavaScript에 포함되는 공개 키이며 비밀 자격 증명으로 취급하지 않습니다. 설정과 교체 절차는 [SAFE_BROWSING_DEPLOYMENT.md](SAFE_BROWSING_DEPLOYMENT.md)를 따릅니다.

## 자동 배포 순서

`.github/workflows/deploy.yml`은 실제 저장소의 **기본 브랜치**에 대한 push 또는 해당 브랜치의 수동 실행을 배포 대상으로 처리합니다. 브랜치명을 `main`이나 `master`로 가정하지 않습니다. PR에서는 Secret·Pages API·artifact를 사용하지 않는 별도 검증 job만 실행하며 다른 브랜치·태그에서는 배포 job을 실행하지 않습니다.

1. 소스 checkout. 인증 정보를 Git 설정에 남기지 않습니다.
2. RC에서 사용한 Bun `1.4.3` 설치.
3. GitHub Pages 사이트 메타데이터 조회.
4. `bun install --frozen-lockfile`.
5. `bun run typecheck`.
6. `bun run lint`.
7. `bun run test`.
8. Secret이 있으면 제한된 Safe Browsing 시연 키를 환경변수로 전달하고, 실제 Pages 경로로 `bun run build`. Secret이 없으면 경고 후 키 없는 앱을 빌드합니다.
9. 모든 검사가 성공한 `dist/`만 Pages artifact로 업로드.
10. build 성공 후 `github-pages` 환경에서 artifact 배포.

Build job은 `contents: read`, `pages: read`를 사용합니다. Deploy job에만 `pages: write`, `id-token: write`를 부여합니다. 별도 PAT나 저장소에 저장할 인증 파일은 필요하지 않습니다. 동시 실행은 `pages-${{ github.ref }}` 그룹으로 관리하며 진행 중인 배포는 취소하지 않습니다. 기본 브랜치의 배포 대기열을 다른 브랜치·태그의 실행이 대체하지 않습니다.

## 사용자가 활성화할 절차

1. 사용할 실제 GitHub 저장소와 기본 브랜치를 확인합니다. 현재 작업은 remote·기본 브랜치·저장소 설정을 변경하지 않았습니다.
2. GitHub **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다. 계정·저장소의 Pages 사용 자격과 Actions 사용 허용 정책도 확인합니다.
3. 사용자가 검토·승인한 뒤 기본 브랜치로 commit/push합니다. 이후 기본 브랜치 push마다 검증과 배포가 자동 실행됩니다.
4. 이미 push한 뒤 Pages를 활성화했다면 첫 실행이 메타데이터 조회에서 실패했을 수 있습니다. **Actions → Deploy History Orbit to GitHub Pages → Run workflow**에서 기본 브랜치를 선택하거나 실패한 실행을 재실행합니다.
5. 성공한 deploy job의 `github-pages` 환경 URL을 실제 배포 주소로 사용합니다. 저장소명을 가정해 주소를 조합하지 않습니다.

Pages가 비활성 상태면 configure-pages가 실패하도록 둡니다. 자동 활성화용 PAT나 관리자 권한을 추가하지 않습니다. 환경 보호 규칙에 승인자가 설정되어 있다면 해당 GitHub 승인을 거쳐야 합니다.

## 로컬 검증과 한계

`docs/evidence/pages/`에 로컬 검사 결과와 정적 경로·브라우저 증거를 보존합니다. `/__pages_qa__/`는 프로젝트 경로 동작을 검증하는 **로컬 전용 합성 접두사**이며 실제 저장소명이나 배포 주소가 아닙니다.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
PAGES_BASE_PATH=/__pages_qa__/ bun run build
PAGES_BASE_PATH=/__pages_qa__/ bun run preview --port 5176 --strictPort
```

검증 항목은 페이지 진입, JS/CSS·지구 미리보기·3D 텍스처 경로, 지원 fixture 입력, 명시적 MOCK 위치, 실제 WebGL 지구본, 압축 공유 링크의 하위 경로 유지와 새 탭 무조회 복원입니다. 원본 JSON을 Git에 넣거나 실제 방문기록으로 외부 API를 호출할 필요가 없습니다.

이 검사는 GitHub Actions runner, Pages API 권한, artifact 업로드·원격 배포를 실행한 증거가 아닙니다. 실제 GitHub 실행은 저장소를 연결하고 Pages를 활성화한 뒤 확인해야 합니다.

## 실제 배포 후 점검

실제 주소를 브라우저에서 연 뒤 아래 순서로 확인합니다.

1. 주소가 HTTPS이고 인증서 오류·혼합 콘텐츠가 없는지 확인합니다. 사용자 페이지는 `/`, 프로젝트 페이지는 실제 `/저장소명/`에서 진입합니다.
2. 개발자 도구 Network에서 entry JS, 동적 globe/chart chunk, `earth-preview.webp`, `earth.webp`, `THIRD_PARTY_NOTICES.txt`가 올바른 하위 경로로 HTTP 200인지 확인합니다.
3. 공개 비식별 fixture를 선택하고 6회·3사이트를 확인합니다. 동의 전에는 DNS·GeoJS 요청이 없어야 합니다.
4. 실제 위치 공급자에 동의한 뒤 Google DNS A/AAAA 및 GeoJS 공용 IPv4/IPv6 조회가 CORS 오류 없이 읽히는지 확인합니다. 위치 미확인 항목을 통계에서 빼거나 MOCK으로 자동 대체하지 않아야 합니다.
5. Safe Browsing 시연 키를 등록했다면 Security 화면에 “시연용 배포 키 사용 가능”이 표시되고 개인 키 입력이 없는지 확인합니다. 동의 전 Google 요청 0건과 동의 후 `hashes.search` 응답을 별도로 확인합니다.
6. 짧은 익명 공유 URL을 만들고 새 탭·별도 브라우저에서 직접 열거나 새로고침합니다. 주소에 실제 프로젝트 경로와 `#v=2&d=...`가 유지되고, 같은 요약으로 복원되며 DNS·GeoJS 재조회가 없어야 합니다.
7. document의 **실제 Response Headers**에서 CSP, HTTPS 관련 정책을 확인합니다. Console에서 CSP 위반을 확인합니다. 아래 Console 호출은 입력 데이터 없이 공개 주소만 사용합니다.

```js
await Promise.all([
  'https://dns.google/resolve?name=example.com&type=A&edns_client_subnet=0.0.0.0%2F0',
  'https://dns.google/resolve?name=example.com&type=AAAA&edns_client_subnet=0.0.0.0%2F0',
  'https://get.geojs.io/v1/ip/geo/8.8.8.8.json',
  'https://get.geojs.io/v1/ip/geo/2001%3A4860%3A4860%3A%3A8888.json',
].map(async url => {
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12000),
  })
  return { url, status: response.status, body: await response.json() }
}))
```

4개 응답이 HTTP 200이며 JSON이 읽혀야 합니다. 실패하면 HTTP·CORS·CSP·네트워크 오류를 구별해 기록합니다. 이 호출을 로컬에서 성공시킨 것만으로 배포 주소의 CORS를 PASS로 보고하지 않습니다.

### GitHub Pages의 CSP·헤더 범위

일반 GitHub Pages는 저장소의 `_headers` 파일로 임의 HTTP 헤더를 설정하는 기능을 제공하지 않습니다. 이전 RC 로컬 호스트의 CSP·X-Frame-Options·캐시 헤더를 Pages가 그대로 제공한다고 주장하지 않습니다.

이번에는 CSP meta 태그나 응용 기능을 새로 추가하지 않았습니다. 실제 CSP가 없다면 “미설정”으로 기록합니다. 존재한다면 `script-src`의 eval 허용 없이 동작하는지, `connect-src`가 `https://dns.google`, `https://get.geojs.io`, `https://safebrowsing.googleapis.com`을 허용하는지 확인합니다. `frame-ancestors`는 meta 태그로 대체할 수 없습니다. 이 차이는 GitHub Pages 운영 제약이며 다른 호스팅이나 프록시를 도입해 우회하지 않습니다.

브라우저 캐시와 실제 버전 갱신 역시 Pages 응답에서 확인합니다. 새 배포 후 새 HTML이 새 해시 chunk를 읽는지 점검하되, 기존 로컬 RC 호스트의 캐시 정책을 적용된 것으로 보고하지 않습니다.

## Git 포함 전 개인정보 점검

현재 작업 폴더는 Git 저장소다. 실제 키·로컬 `.env`·개인 방문기록이 추적되지 않았는지 사용자가 commit 전에 다음을 다시 확인해야 합니다.

```sh
git status --short
git diff --cached --name-only
git ls-files
```

원본 방문기록은 프로젝트 밖에 보관하고 `.env`, 토큰·키·인증 파일, `private-data/`, `local-data/`, `uploads/`, `Takeout/`를 추가하지 마세요. `.gitignore`는 흔한 로컬 파일을 제외하지만 이미 추적한 파일이나 다른 이름의 개인 파일까지 제거하지 않습니다. 과거 commit에 인증 정보가 있었다면 ignore 추가로 해결되지 않습니다.

`tests/fixtures/`의 공개 합성 fixture는 CI 테스트에 필요하므로 유지합니다. Pages artifact에는 `dist/`만 들어가며 원본 방문기록·테스트 fixture·문서 증거·작업 폴더·`node_modules`는 업로드하지 않습니다.

## 공식 근거

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [configure-pages outputs](https://github.com/actions/configure-pages/blob/v5/action.yml)
- [Vite GitHub Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages)
- [Bun setup action](https://github.com/oven-sh/setup-bun)
