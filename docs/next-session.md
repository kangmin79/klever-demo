# 다음 세션 — 북스타(klever_demo) 이어하기

> ⚠️ git 전 `cd klever_demo` / 한글 파일은 Edit·Write로 / 바로 배포 OK (별 repo: kangmin79/klever-demo)

## ⭐ 지금 이어서 할 일 — 형태 태그(종이책/전자책/구독) 정확도 재빌드
- 문제: "세명대 인기 전자책" 등 목록의 **종이책/전자책/구독 태그가 일부 부정확**. 잘못 붙은 건 못 찾았고, **"있어야 하는데 빠진" 케이스**가 문제.
- 태그 출처 = `books/semyung_enrich.json`(brcd 키, `enrich_semyung.mjs`가 빌드). 렌더 = `fmtTags()` [app.html:4483]. 전자책=`b.lib`, 종이책=`en.paper`, 구독=`en.crema`.
- 근본원인: 라이브 베스트(전자도서관, 매일 변동)에 **enrich에 없는 책**이 섞여 태그 누락. 예: **살인자의 기억법** = enrich 무 → 전자책만 뜸.
- 확정된 오류: **"내가 돈을 벌고 있다는 착각" = 실제 크레마 구독인데 태그 누락**.
- ⚠️ 검증 함정: ① 크레마 제목검색은 **동명 비평서 오탐**("김영하 살인자의 기억법과…"≠소설본편) → **저자/제목 정밀매칭 필수**. ② 종이책 OPAC `search/tot/result?st=KWRD&q=`는 아무 CATTOT나 잡혀 **오탐** → **자료유형 실파싱** 필요(세션쿠키 필요, 302).
- 할 일: enrich를 **라이브 베스트 전체**에 대해 재빌드 + 위 정밀검증 적용 → 누락/오류 일괄 해소.

## ✅ 오늘(6/26) 완료·배포
- 크레마클럽 = **C(딥링크)** 확정 (524fb82). 웹리더 없음+특정책자동펼침불가 → 스킴/토큰 폐기. cremaHref→Detail새탭. 메모리 [[project_bookstar_crema_deeplink]]
- 좌측 네비 등장(중앙→좌측)+스크롤 드리프트 애니메이션
- 우리 학교 대출 랭킹: 대출횟수·지난달대비 ▲▼ 제거 (3d8d1a1)
- 표지 안전망: placeholder(준비중=위장GIF) 감지→알라딘 실표지. `scripts/build_cover_overrides.py`+`books/cover_overrides.json` (6be06d4). 용의자X·헤일메리 수정. ⚠️GIF만 신호(크기기준 금지=고래 6.4KB 실표지 오판)

자세한 맥락: docs/2026-06-26.md
