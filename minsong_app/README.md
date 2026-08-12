# 민송도서관 네이티브 앱 (Expo/React Native) — 소스 백업

⚠️ **실행 폴더는 여기가 아니라 `c:\tmp\minsong_app`** (Metro가 한글 경로에서 침묵 실패하는 문제를
피하려고 c:\tmp에 둠). 이 폴더는 git 백업본 — App.js 고치면 양쪽을 맞출 것.

## 실행 (개발 미리보기)
```powershell
cd c:\tmp\minsong_app
npx expo start          # Metro 서버 시작
```
폰(같은 와이파이)에서 Expo Go 앱 → Scan QR (`c:\tmp\minsong_qr.html` 브라우저로 열면 브랜드 QR).
큰 개편 후엔 폰에서 Expo Go 완전 종료 → 재스캔.

- **SDK 54 고정** — 사장님 폰 Expo Go 지원 상한. 업그레이드 금지(57은 "Project is incompatible")
- c:\tmp가 비었으면: 이 3파일 복사 → `npm install` → `npx expo install expo-linear-gradient expo-font react-native-safe-area-context` → `npm i @expo-google-fonts/noto-serif-kr`

## 상태 (2026-08-11)
- 디자인: **밀리 구조 + 북스타 온기** (크림 바탕·잉크 글자·금색 포인트, 웹 참나루와 한 가족)
- 홈: 떠 있는 상단 검색 · 인증 미션카드(4칸 세그먼트) · 내 도서관 요약 · 오늘의 추천 ·
  우리 학교 대출 랭킹(실데이터·변동배지) · 전자책/신착/고전 선반 · 판형 배지([전자책][종이책][구독])
- 찾기: semyung-find + 전체/종이책/전자책 필터 · 상세: 표지·줄거리·전자책 실시간 재고
- **내 서재: 포털 로그인 실배선 완료** (sso-login 검증 체인, 비번 미저장) → 이름·대출/연체/예약
  카운트·빌린 책·기다리는 책 실데이터. 테스트 계정 book/semyung7002
- **상세에서 대출·예약 실행 배선 완료 (8/11)** — 전부 학생 본인 명의(personal 필수, 폴백 없음):
  전자책=semyung-ebook-borrow borrow→교보 뷰어 Linking / 종이책=semyung-my holding→
  대출가능이면 pickup(찾아줘북즈)·대출중이면 reserve(반납예약), 성공 후 취소 버튼
  (request_no는 pickups 현황에서 제어번호 일치 건으로 되찾음 — 웹 app.html과 같은 체인).
  종이책 소장 배지=semyung-holding(reckey=CATTOT+ctrl, anon이라 로그인 전에도 보임)
- 전부 실데이터(semyung_tulip 32만 + Edge Fn, anon 읽기 전용)

## 8/12 오후 — 인증 탭 = CHARM 202권 컬렉션 + 진행판 (앱의 심장, v0.6)
- **DB `charm_books` 202행** (RLS anon SELECT) — 도서관 CHARM인증도서 페이지(/webcontent/info/24)에서
  수집. 전 권 도서관 제어번호(CATTOT) 보유 · tulip 직결 195 · **전자책 판형 72권**(ebook_ctrl) · 표지 195.
  영역 1~4(50/50/50/52)는 이미지 접두어(dbook/aBook/bBook/cBook)로 확정 — **공식 영역명은 페이지에 없어
  추측하지 않고 번호로만** 표기. 미직결 7권도 제어번호로 소장조회·예약은 동작(우리 미러에만 없는 것)
- 인증 탭: 미션카드(제출함 N/4) → 4단계 안내(제출은 포털 CHARM 비전설계로 안내) → 202권 목록
  (칩: 전체/내가 고른 N/전자책/1~4영역). 책갈피로 담기 → 담긴 책은 [읽을 책|다 읽음|제출함] 상태 칩.
  전자책 있는 책은 상세를 전자책 레코드로 열어 바로 대출·읽기
- 진행은 **AsyncStorage(이 폰에만)** — 정본은 포털 CHARM, 우리는 기록·안내만. 홈 미션카드와 연동
- 새 패키지 **@react-native-async-storage/async-storage** (expo install) — c:\tmp 재설치 시 포함할 것
- 로그 이벤트 charm_pick / charm_done 화이트리스트 추가(minsong_app_events RLS)
- ⚠️문구에 "필수" 금지 유지 — "졸업 요건입니다" 표현도 제거함

## 8/12 추가된 것
- **v0.5 흰 바탕** (크림·금색은 인증 카드에만) · 미로그인 시 버튼 → 바로 로그인 화면
- **사서 큐레이션 선반** — 관리자 '우리 도서관' library_sections를 앱 홈에 렌더 (손수 담은 칸만),
  큐레이션 책 터치 → 바코드/제목으로 소장 레코드 해석 → 상세(대출 버튼)까지 연결
- **관리자(bookstar.co.kr/admin)에 '민송 앱' 메뉴** — minsong_app_events 익명 로그 + 집계 RPC.
  앱 액션(로그인·대출·예약·취소) 자동 기록. 실기기 로그인 1건 실측 확인됨
- **서버 체인 E2E 통과** (PC에서 앱과 동일 호출 재현): 로그인→종이책 holding→전자책 borrow→즉시 return
- ⚠️**독후감 4편은 필수 아님** (사장님 정정) — 인증 화면·문구에 "필수" 표현 금지

## 8/12 저녁 — 사서 팝업 (관리자 발행 → 앱·웹 공용)
- **DB `minsong_popups`** (RLS: 읽기 공개, 쓰기는 target/channel/길이 화이트리스트) — 제목·내용·
  대상(전체/로그인/연체/인증 시작 전)·채널(앱/웹/둘다)·기간·on/off
- 관리자: **웹/앱 모드 스위치**(상단, 앱 모드=금색) + 앱 관리 구역에 '팝업 관리' 메뉴
- 앱: 시작 시 조건 평가(연체=semyung-my info, 인증=charm 진행판 로드 후) → 가운데 모달,
  확인하면 seen_popups(AsyncStorage)에 기록되어 다시 안 뜸
- 웹(app.html): 같은 테이블 channel=web/both를 읽어 동일 팝업(localStorage ms_seen_popups).
  연체·인증 조건은 앱 전용 — 웹에선 건너뜀
- 개인 지정 없음(익명 설계 유지) — **대상은 조건으로만** 겨냥

## 다음 조각 (우선순위)
1. 실기기 확인 — 인증 탭(202권·진행판) 폰 실물 + 전자책 대출 버튼 → 교보 뷰어 열림
2. 검색 결과 "소장 없음 → 희망도서 신청" 버튼 (꼬리 수요를 관문 안으로 — 8/12 크레마 논의 부산물)
3. 표지를 우리 스토리지로 전환 (`…/object/public/covers/<ctrl>.webp`, 404→cover_url→활자)
4. 알림은 개발 빌드 단계(Expo Go는 원격 푸시 불가)
