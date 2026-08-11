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
- 전부 실데이터(semyung_tulip 32만 + Edge Fn, anon 읽기 전용)

## 다음 조각 (우선순위)
1. 대출·예약 버튼 실행 배선 (조회는 됨 — semyung-my 신청 액션 + semyung-ebook-borrow)
2. 독서인증 진행판 (CHARM 202 컬렉션 — 매칭 실측: 종이 174·전자책 77)
3. 표지를 우리 스토리지로 전환 (`…/object/public/covers/<ctrl>.webp` 규약, 404→cover_url→활자)
4. 사서 큐레이션 칸 / 알림은 개발 빌드 단계(Expo Go는 원격 푸시 불가)
