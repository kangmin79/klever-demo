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

## 8/12 추가된 것
- **v0.5 흰 바탕** (크림·금색은 인증 카드에만) · 미로그인 시 버튼 → 바로 로그인 화면
- **사서 큐레이션 선반** — 관리자 '우리 도서관' library_sections를 앱 홈에 렌더 (손수 담은 칸만),
  큐레이션 책 터치 → 바코드/제목으로 소장 레코드 해석 → 상세(대출 버튼)까지 연결
- **관리자(bookstar.co.kr/admin)에 '민송 앱' 메뉴** — minsong_app_events 익명 로그 + 집계 RPC.
  앱 액션(로그인·대출·예약·취소) 자동 기록. 실기기 로그인 1건 실측 확인됨
- **서버 체인 E2E 통과** (PC에서 앱과 동일 호출 재현): 로그인→종이책 holding→전자책 borrow→즉시 return
- ⚠️**독후감 4편은 필수 아님** (사장님 정정) — 인증 화면·문구에 "필수" 표현 금지

## 다음 조각 (우선순위)
1. 독서인증 진행판 + CHARM 202 컬렉션 (매칭 실측: 종이 174·전자책 77) — **앱의 심장, 최우선**
2. 실기기 잔여 확인 (전자책 대출 버튼 → 교보 뷰어 열림 — 서버는 검증됨, 폰 화면만 미확인)
3. 검색 결과 "소장 없음 → 희망도서 신청" 버튼 (꼬리 수요를 관문 안으로 — 8/12 크레마 논의 부산물)
4. 표지를 우리 스토리지로 전환 (`…/object/public/covers/<ctrl>.webp`, 404→cover_url→활자)
5. 알림은 개발 빌드 단계(Expo Go는 원격 푸시 불가)
3. 표지를 우리 스토리지로 전환 (`…/object/public/covers/<ctrl>.webp` 규약, 404→cover_url→활자)
4. 사서 큐레이션 칸 / 알림은 개발 빌드 단계(Expo Go는 원격 푸시 불가)
