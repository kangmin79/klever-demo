# 다음 세션 — 북스타(klever_demo) 이어하기

> ⚠️ git 전 `cd klever_demo` / 한글 파일은 Edit·Write로 / 바로 배포 OK (별 repo: kangmin79/klever-demo)

## ✅ 완료(6/26) — 형태 태그(종이책/전자책/구독) 정확도 재빌드 (0f8955c)
- 멀티에이전트 검증: 라이브 best+new **28권**을 ① 4개 에이전트로 크레마 **저자+제목 정밀** 판정(비평서/동명이서/요약본 배제), ② OPAC 단행본 **저자매칭**으로 종이책 재확인.
- **11권 정정/추가**. 표시 28권 기준 종이책 13 / 구독 15. (종이책 True→False 0건 = 회귀없음, 구독 오탐 1건만 제거)
  - 오탐 제거: **작별하지 않는다** = 한강 원작 아닌 2차 해설서("끝나지 않는 기억의 애도") → 구독 해제
  - 누락 복구(false neg): **내가 돈을 벌고 있다는 착각·중드 보다 중국사·돈이 쌓이는 집** 구독 추가
  - enrich 없던 신규 6권(**살인자의 기억법** 등) 레코드 생성 + 검증 태그(살인자=종이책 추가)
- 근본수정: `enrich_semyung.mjs` **cremaCheck 저자 정밀화** — 후보 Detail og:title 정확일치 채택, 부제 startsWith는 **접미사에 저자명 있을 때만** 채택(수양대군"(김동인 장편소설)" 보존, 비평서 차단). 호출부 `cremaCheck(b.title, b.author)`.
- ⚠️ 남은 한계(설계): enrich는 빌드 시점 스냅샷이라 **라이브 목록이 매일 회전**하면 새 책이 다시 무태그(전자책만)로 뜸. → **데모 전 `enrich_semyung.mjs`+holdings 재실행** 필수(런북 유지). 향후 더 견고히 하려면 태그를 라이브 점검으로 옮기는 설계 검토.
- 검증 산출물: scratchpad `ground_truth.json`/`crema_evidence_full.txt`/`paper_scrutiny.txt`/`crema_verdicts.json`.

## ✅ 오늘(6/26) 완료·배포
- 크레마클럽 = **C(딥링크)** 확정 (524fb82). 웹리더 없음+특정책자동펼침불가 → 스킴/토큰 폐기. cremaHref→Detail새탭. 메모리 [[project_bookstar_crema_deeplink]]
- 좌측 네비 등장(중앙→좌측)+스크롤 드리프트 애니메이션
- 우리 학교 대출 랭킹: 대출횟수·지난달대비 ▲▼ 제거 (3d8d1a1)
- 표지 안전망: placeholder(준비중=위장GIF) 감지→알라딘 실표지. `scripts/build_cover_overrides.py`+`books/cover_overrides.json` (6be06d4). 용의자X·헤일메리 수정. ⚠️GIF만 신호(크기기준 금지=고래 6.4KB 실표지 오판)

자세한 맥락: docs/2026-06-26.md
