# 다음 세션 — 북스타(klever_demo) 이어하기

> ⚠️ git 전 `cd klever_demo` / 한글 파일은 Edit·Write로 / 바로 배포 OK (별 repo: kangmin79/klever-demo)
> ⚠️ 클레버 수집·매칭 스크립트는 `~/Desktop/클레버/scripts/`에 있고 **git 아님**(PC에만). 키=`~/Desktop/클레버/api_keys.md`(SUPABASE_PAT, 도서관계정 03251/000000s!/외부이용자)

## 📌 현재 상태 — 세명대 도서 "전수 DB" 양쪽 완비 (Supabase 검증완료)
| 테이블 | 권수 | 채움률 | 수집 스크립트(클레버) |
|---|---|---|---|
| `semyung_paper` (종이책) | **34,158** | title/author 100%, pub_year 99.5%, 상태 98%, **ISBN13 70%(24,029)** | `harvest_semyung_paper.mjs` + `backfill_paper_isbn.mjs` |
| `semyung_books` (전자책) | **20,074** | title/author/provider 100%, **ISBN13 75%(14,984)** | (6/12 수집, ⚠️비표준 ISBN 516건) |
| `book_pool` (국중 인기) | 9,887 | sm_paper 5,231 / sm_ebook **1,705** | `harvest`·`holdings`·`ebook_live`_book_pool.mjs |

- ISBN이 없는 책(종이 30%·옛책)은 ISBN 자체가 원래 없음 → 100% 불가, 제목+저자 매칭으로 보완. ISBN은 OPAC 목록 JS `callThumbnail(...,'{isbn}',...)`에서 추출(상세 안 열고).

## ✅ 6/26 완료
1. **형태 태그(종이/전자/구독) 정확도 재빌드** (klever_demo 0f8955c) — 멀티에이전트 검증. 작별하지않는다=비평서 구독오탐 제거, 내가돈을=구독 누락복구. `enrich_semyung.mjs` cremaCheck 저자정밀화. 라이브 목록(app.html `fmtTags`) 배지에 반영됨.
2. **book_pool 전자책 매칭 검증·정정** (클레버, 1,799→1,705) — ⓐ저자 미검증 동명이서 오탐(종의기원=정유정인데 다윈 등) → searchList writer 저자 기각 ⓑ **brcd 정규식 `\d+` 버그**(원본부터) → `480D…` 영숫자 brcd 책 누락 → `'([^']+)'`. 검증: true표본 잔존오탐0/false인기150 오제거0. 종이책 sm_paper는 표본100 오탐0(정상).
3. **세명대 종이책 전수 수집** semyung_paper 34,158 + ISBN 70% 백필.

## ⚖️ 열려있는 결정/다음 후보 (사장님 지시 대기)
- **구독(크레마) 플래그**: 깔끔한 벌크 소스 **없음** 확정. 방법B(크레마 카탈로그 덤프)=YES24 별도로그인 막힘 / OPAC=전자책 117권뿐+크레마마커 없음(`/relation/crema`는 전 레코드 공통버튼) / 전자도서관=구분필드 없음. → 유일한 길=공개 크레마검색 권당(무로그인). **표시 대상(book_pool 큐레이션+인기/신착 ≈수천권)에만 채우는 게 현실적.** 보류 상태.
- **book_pool 매칭을 로컬 조인으로 재정비**: 지금은 책마다 라이브 OPAC/전자도서관 검색 → semyung_paper/semyung_books 로컬 조인(제목+저자/ISBN)으로 교체하면 라이브 검색 졸업(brcd버그·변동 면역). 종이·전자만, 구독은 크레마검색 유지.
- **semyung_books 비표준 ISBN 516건 정리** (선택, 소).
- **semyung_books 최신화** (6/12 스냅샷이라 신간 누락).

## 핵심 사실(왜 ISBN으로 못 묶나 등)
- 같은 책도 판형마다 ISBN 다름 + OPAC ISBN검색 0건 + 전자도서관 detail ISBN 없음 → **제목+저자 매칭**이 정답.
- 세명대 통합검색(lib.semyung)의 전자책/크레마 책은 실시간 아니라 **미리 적재된 카탈로그 레코드**. 단 전자책은 117권만 카탈로그됨(본체는 전자도서관 20,074).
- 구매/구독 구분은 도서관 데이터 어디에도 없음. 학생 경험상 둘 다 동일("빌려읽기").
