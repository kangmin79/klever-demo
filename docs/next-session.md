# 다음 세션 — 북스타(klever_demo) 이어하기

> ⚠️ git 전 `cd klever_demo` / 한글 파일은 Edit·Write로(PS Set-Content 깨짐) / 바로 배포 OK

## ⭐ 다음 주 관장님 미팅 전 필수
1. **GitHub Actions 자동 갱신 켜기**: github.com/kangmin79/klever-demo → Settings → Secrets and variables → Actions → New secret → `SUPABASE_SERVICE_ROLE` = (클레버/api_keys.md의 `SERVICE_ROLE=` 값) → Actions 탭 "세명대 신착 갱신" Run workflow 1회.
   - ❌ 실패(US IP 차단)면 PC에서 직접: `python scripts/build_semyung_new.py` + `build_semyung_new_paper.py` + `build_semyung_loan_rank.py`
2. 미팅 직전 앱(bookstar.co.kr/app.html → 우리 도서관)에서 줄들 최신·정상인지 눈 확인

## 보류(사용자가 "잠시후 다시 얘기")
- **전자책 제공처 표시**: 어디서 공급받았나(YES24/교보)는 `semyung_books.provider`에 이미 있음(YES24 10,926 / 교보 9,148, 북큐브 없음). 신착 전자책 112권은 전부 교보. 구매vs구독 구분은 불가. → 카드 태그로 달지 / 장서구성 통계 한 줄로 보여줄지 / 그냥 둘지 미정.

## 다음에 할 만한 것
- 사서가 신착/랭킹 "표시 권수" 정하는 관리자 UI
- 전자책 순위 "지난달 대비 변동"은 매일 스냅샷 누적해야 가능(현재 미적용, 사용자 "순위만으로 확정")

## 현재 우리 도서관 화면 순서 (6/25 완성, 전부 라이브 배포됨)
1. 우리 학교 대출 랭킹 — 종이책 실대출(횟수 + 지난달 대비 변동 ▲빨강/▼파랑)
2. 세명대 인기 전자책 — 전자도서관 순위(횟수 비공개)
3. 세명대 종이책 신착 — 입고순 / 4. 세명대 전자책 신착 — 발행일순
5. 6월 추천 도서 — 사서 큐레이션
+ 종이책 모달: 라이브 "지금 대출 가능 + 자료실 위치 + 청구기호"

자세한 맥락: docs/2026-06-25.md, 메모리 project_bookstar_semyung_new
