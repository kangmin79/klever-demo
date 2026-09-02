/* ═══════════════════════════════════════════════════════════
   설정 상수 (버전) — 9/2 리팩터링 S6: js/30-viewer.js 머리에서 옮김
   ═══════════════════════════════════════════════════════════ */
const APP_BUILD = '260902x';   // ⚠️ 배포마다 version.txt + 스크립트 ?b= 와 함께 갱신 (.githooks/pre-commit 이 자동)
// 본문 bodies_*.js 캐시 버전 — APP_BUILD와 분리. 앱을 배포해도 본문은 재다운로드 안 하도록 고정(체감 속도↑).
// ⚠️ 본문 파일(bodies_*.js)을 재생성/수정해 배포할 때'만' 이 값을 올린다. (일반 앱 배포에선 건드리지 않음)
const BODIES_VER = '260902d';   // 9/2 돈키호테 장 제목 복원 1~3단계(bodies_gb5921.js) — 3단계: 한국어 머리 8개를 Chapter N.으로 통일

/* ═══ 서버 주소·키 — 9/2 리팩터링 S7-4: js/12·13·14·15·16·60 에 흩어져 있던 것을 여기로 모음 (값 무변경) ═══
   호출은 전부 js/04-api.js(sbGet·sbGetAnon·sbWrite·sbFn·sbFnPost·sbAuth)를 거친다. 여기 상수를 직접 fetch 에 넣지 말 것. */
const COVER_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";   // Supabase anon 키(공개용 — RLS 가 지킨다)
const SB_REST="https://gkujptyfrzqrjrvovbnc.supabase.co/rest/v1";
const SB_AUTH='https://gkujptyfrzqrjrvovbnc.supabase.co/auth/v1';
const SB_PROJ="https://gkujptyfrzqrjrvovbnc.supabase.co";   // 프로젝트 뿌리(스토리지 업로드·public URL 조립) — 9/2 S8-3: admin에서 옮김
// 관리자 저장 프록시(ADMIN_SECRET 검증) — library_sections·library_programs 는 anon 쓰기 잠김(2026-08-15). 관리자 화면·게이트가 쓴다
const ADMIN_FN=SB_PROJ+"/functions/v1/admin-save";
// 학생 세션 헤더 — 로그인하면 js/16-auth-lock 이 Authorization 을 본인 토큰으로 바꿔 끼우고, 로그아웃하면 익명 키로 되돌린다
const BX_H = {apikey:COVER_ANON, Authorization:'Bearer '+COVER_ANON, 'content-type':'application/json'};
// 폰 브라우저면 교보 뷰어를 모바일용으로 발급(device=m) — PC용 뷰어가 폰에서 깨짐(8/21, 앱과 동일 수리).
// 판별식은 도서관 자체 isPC()와 동일. 창 크기가 아니라 UA 기준(좁힌 PC 창에 모바일 뷰어가 나가지 않게)
const SM_DEV=/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)?'&device=m':'';
// 서버 함수(Edge Function) 주소
const COVER_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/cover";                 // (현재 미사용)
const INFO_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/bookinfo";               // ISBN 배치 → 제목·표지·설명
const SMBEST_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-best";         // 세명대 인기·신착
const SMHOLD_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-holding";      // 종이책 라이브 소장/대출가능
const SMRESV_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-reserve";      // 찾아줘북즈 예약 (현재 미사용)
const SMEBK_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-ebook-borrow";  // 전자책 대출·반납·연장·뷰어 URL
const SMMY_FN ="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-my";            // 종이책 개인기능(대출현황/연장/예약)
const PUSHREG_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/push-register";       // 웹푸시 구독 등록/해지/시험
const US_RECOMMEND_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/recommend";  // (구) 옛 books 풀 추천 — 별이는 curate로 전환 (현재 미사용)
const US_CURATE_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/curate";        // 별이(학생) = 사서 큐레이션과 동일 코어(세명대 실소장 의미검색)
const US_BRAIN_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/library-brain";  // 별이 두뇌 = 의도 라우팅(책/운영정보/잡담) + 도서관 지식베이스 답변
const US_FIND_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-find";     // 통합검색 브리지 = 종이책 단행본·학위논문 검색(semyung_tulip search_tulip, CATTOT키→소장/예약) (현재 미사용)
const US_KEYWORD_RPC="https://gkujptyfrzqrjrvovbnc.supabase.co/rest/v1/rpc/keyword_books"; // 하이브리드 키워드(정규화 ILIKE): 벡터가 놓치는 정확 제목/저자/축약어(총균쇠·한의학) → 맨 위로 (현재 미사용)
// 논문 검색(KCI paper + 국회 nanet) 계층 제거 — 2026-07-02. 책(curate+find+keyword)만 검색.
const US_SEARCH_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/byeoli-search";  // 별이 통합검색 단일 엔진: 책 3소스(curate+find+keyword) 병렬호출+RRF 융합+측정훅을 백엔드로 일원화(화면은 렌더만)
