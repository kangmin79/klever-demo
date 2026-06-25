# 다음 세션 — 북스타(klever_demo) 이어하기

> ⚠️ git 전 `cd klever_demo` / 한글 파일은 Edit·Write로 / 바로 배포 OK
> 계정(도서관장 제공) = 클레버/api_keys.md #7: lib ID `03251` / PW `000000s!`(외부이용자) · 전자도서관 동일계정(AES로그인) · service_role·SUPABASE_PAT도 api_keys.md

## ⭐ 지금 이어서 할 일 — 구독(크레마) 자동로그인 실험 (진행중)
- 6/25 세명대 도서관 **3종 연동**을 북스타 안에서 구현: ✅종이책 예약 + ✅구매 전자책 대출/읽기 + ⏳구독(크레마).
- **크레마만 미완**: 버튼 "크레마클럽에서 읽기" → 새탭에서 세명대 도서관 자동로그인(03251) + `retUrl=/relation/crema`로 기관세션 확립 시도(커밋 3d7be92, app.html `smCremaOpen`).
- **마지막 테스트 결과**: 사용자 브라우저에서 **로그인 페이지가 뜸**. 사용자가 다른 PC 세션 로그아웃 후 재시도 예정(03251 단일세션 충돌 의심).
- **재시도 시 확인할 것**: 뜬 게 ①세명대 도서관 로그인이면 → 자동로그인 폼이 안먹은 것(폼 필드 id/password 맞음, loginType 불필요 확인됨) / ②YES24·크레마 로그인이면 → 게이트웨이가 브라우저에서도 세션 안주는 한계.
- 성공기준: 크레마가 **로그인 상태**로 열림(가입페이지 X). 성공하면 → 책별 진입으로 다듬기. 계속 가입/로그인페이지면 → **크레마 접고** 종이책+구매책으로 데모 확정 추천.
- ⚠️ 크레마 근본제약: 기관IP/EZproxy(libproxy) 기반이라 self-contained 토큰화 불가. curl 서버테스트로는 항상 raw로 bounce(검증은 실브라우저만).

## ✅ 완성된 것 (전부 라이브)
- **종이책**: 대출가능→찾아줘북즈 예약 / 대출중→반납예약(순번). Edge Fn `semyung-reserve`(action reserve|list|cancel|hold|holdlist|unhold). 확인시트(규칙) + 인앱 취소. 외부OPAC버튼 숨김(일원화). 소장현황 보존서고 제외(4/4).
- **구매 전자책**(교보+YES24 ~8,900권): 대출→교보 DRM뷰어 바로읽기. Edge Fn `semyung-ebook-borrow`(action borrow|return|status, AES로그인 재현 key=freedom AES-128-ECB, viewerUrl 토큰 단독실행). app.html `lcBorrow`→`smEbookBorrowOpen`.
- ⚠️ 구매책 제약: 동시이용 ~5권+14일점유, 단일계정 → 데모전용. "읽기"마다 실대출됨. 계정 비우기는 myBorrowList.ink loanSrmb 개별 return(blind returnAll 금지 — 남의대출 존재).

## 미팅 전 필수(별건)
- GitHub Actions secret `SUPABASE_SERVICE_ROLE` 등록(자동 신착갱신). 실패시 PC폴백 `python scripts/build_semyung_new.py`+`_paper.py`+`_loan_rank.py`(6/25 폴백 검증됨).

자세한 맥락: docs/2026-06-25.md, 메모리 [[project_bookstar_semyung_reserve]] [[project_bookstar_ebook_borrow]]
