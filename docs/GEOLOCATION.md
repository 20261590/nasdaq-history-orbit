# DNS와 IP 위치

## 공급자

- Google DNS over HTTPS: `https://dns.google/resolve`
- GeoJS: `https://get.geojs.io/v1/ip/geo/{ip}.json`

브라우저가 HTTPS로 직접 호출합니다. 원본 방문기록 URL을 fetch하지 않습니다. DNS에는 정규화한 hostname과 A/AAAA 타입만 보내고, 경로·검색어·fragment·사용자 인증정보는 보내지 않습니다. `edns_client_subnet=0.0.0.0/0`으로 권한 DNS에 이용자 서브넷 정보가 전달되지 않게 요청합니다.

공급자 직접 호출은 공급자가 요청자의 접속 IP를 볼 수 있다는 뜻입니다. UI에서 이를 설명하고 조회 전 명시적 동의를 요구합니다. MOCK 공급자는 별도로 선택하고 표시하며 실제 API 실패 시 자동 대체하지 않습니다.

## 실제 브라우저 실증

`docs/evidence/api-probe.json`은 2026-11-16에 실제 Chromium 159 페이지 `http://127.0.0.1:5173`에서 수행한 fetch 결과입니다. Node 요청 결과로 CORS를 추정하지 않았습니다.

| 시나리오 | 실제 결과 |
| --- | --- |
| example.com A | HTTP 200, DNS Status 0, 복수 IPv4, CORS 읽기 성공 |
| example.com AAAA | HTTP 200, DNS Status 0, 복수 IPv6, CORS 읽기 성공 |
| www.github.com A | CNAME(type 5)와 최종 A(type 1), CORS 읽기 성공 |
| 존재하지 않는 .invalid | HTTP 200, DNS Status 3(NXDOMAIN) |
| www.wikipedia.org | CNAME와 A, 다수 hostname 실증 |
| GeoJS 8.8.8.8 | HTTP 200, 문자열 좌표, 국가, ASN, 조직, 정확도 1,000 km |
| GeoJS 2001:4860:4860::8888 | HTTP 200, IPv6, 유효 좌표 |
| GeoJS 다중 IP | 배열 응답. 1.1.1.1은 좌표 `"nil"` 및 국가 누락 |
| 잘못된 GeoJS 입력 | CORS 읽기 가능한 HTTP 404 |

각 응답의 시각·URL·status·브라우저가 접근 가능한 헤더·body·소요시간을 증거 파일에 저장했습니다. HTTP CORS 허용 헤더 자체는 브라우저가 노출하지 않을 수 있습니다. 교차 origin body를 실제로 읽었다는 결과가 CORS 증거입니다. 실증 소요시간은 158–978 ms였으며 성능 SLA가 아닙니다.

## 실패와 정확도

HTTP 성공이어도 `"nil"` 좌표, 범위 밖 값, 필수 필드 누락은 위치 성공이 아닙니다. 빈 위치를 도시 중심이나 임의 좌표로 대체하지 않습니다. 정확도 반경이 없으면 `null`/미제공으로 보존합니다.

네트워크/CORS로 fetch가 거부되면 브라우저는 둘을 동일한 TypeError로 노출할 수 있습니다. 코드에서 원인을 확정하지 않고 네트워크/CORS 범주로 보고합니다. DNS 상태, HTTP 오류, 타임아웃, 공급자 제한, 잘못된 응답은 가능한 범위에서 구분합니다. 무한 재시도를 하지 않습니다.

방문 시각의 실제 접속 IP는 원본 JSON에 없으므로 재구성할 수 없습니다. 현재 DNS와 현재 GeoIP 결과만 보여 줍니다. CDN·클라우드·Anycast의 논리적 서비스 위치를 실제 물리 서버 위치로 단정하지 않습니다.

다중 IP별 유효 결과를 보존하고 첫 번째 유효 결과를 재생의 대표 위치로 사용합니다. 사이트 국가별 분포는 복수 국가에 중복 포함될 수 있어 합이 고유 사이트 수보다 클 수 있습니다.

## 한국 상세

대한민국 확대 카메라와 공급자가 제공한 국가·시도·도시, 정확도 반경을 표시합니다. 좌표가 행정 경계 안에 있다는 이유로 서버의 구를 추정하지 않습니다. 구 단위를 추정하는 GeoJSON은 사용하지 않습니다. 정밀도가 낮거나 반경이 크면 상세 위치를 불확실하게 읽어야 합니다.

### Phase 2 표시 정책

`describeLocation()`은 원본 GeoJS 결과를 변경하지 않고 표시 단계만 정합니다. 정확도 반경이 없거나 **25 km를 초과하면 국가까지만** 표시합니다. 25 km 이하에서 공급자가 제공한 도시·지역명은 `(추정)`으로 표시하고, 한국의 `-gu/-gun/-dong/-eup/-myeon` 및 `구/군/동/읍/면` 명칭은 도시로 승격하지 않습니다. 공급자 원문과 반경은 상세에 `(미검증)`으로 남깁니다.

25 km는 보수적인 UI 기준입니다. 실제 시·도나 구 경계를 확인하는 지리적 기준이 아니며, 반경 5 km라도 여러 구에 걸칠 수 있습니다. 행정 경계 자료와 교차 검증하지 않았으므로 어느 사례도 실제 구 소재 서버로 확정하지 않습니다. 국가도 GeoIP 추정입니다.

2026-11-16 추가 Chromium 직접 조회:

| 공개 IP | 공급자 응답 | 표시 |
| --- | --- | --- |
| 223.130.200.104 | KR, 반경 200 km, city/region 없음 | South Korea (추정) |
| 168.126.63.1 | Seoul / Jongno-gu, 반경 5 km | South Korea · Seoul (추정), Jongno-gu는 미검증 원문 |
| 8.8.8.8 및 Google IPv6 | US, 반경 1,000 km | United States (추정) |
| 1.1.1.1 | 좌표 nil, 국가 미제공 | 위치 미확인 |

원본은 `docs/evidence/phase2/geo-probe.json`입니다. 좌표를 한국 행정구역 폴리곤에 대입하거나 어떤 구의 물리 서버로 확인한 결과가 아닙니다.

### 대표 IP와 복수 국가

A와 AAAA를 모두 조회합니다. 응답 레코드의 나열 순서에 따라 대표 위치가 바뀌지 않도록 IP를 정규화하고 주소 값으로 정렬합니다. A 그룹 후 AAAA 그룹에서 첫 번째 유효 GeoIP 결과를 대표로 사용하며, 조회 실패 IP는 건너뜁니다. 복수 IP별 위치는 보존하므로 한 hostname이 여러 국가에 나타날 수 있습니다. 이 선택은 방문 당시 접속 IP를 의미하지 않습니다.

CDN/Anycast 주소의 좌표나 국가를 물리 서버의 소재지로 단정하지 않습니다. 한국 지역별 수치도 공급자 지역명별 집계이며 검증된 행정구역별 서버 수가 아닙니다.

## 참고

- https://developers.google.com/speed/public-dns/docs/doh/json
- https://www.geojs.io/docs/v1/endpoints/geo/
