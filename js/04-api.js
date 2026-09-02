/* ═══ 서버 호출 창구 (S7, 2026-09-02) ═══
   지금까지 94곳이 각자 URL·키·헤더를 조립해 fetch 했다. 여기로 모은다.
   1회차: semyung-ebook-borrow(SMEBK_FN) 10곳만 sbFn 으로 — 응답 처리(.json()·분기)는 호출부에 그대로 둔다(동작 동일).
   2회차: REST GET(`{headers:BX_H}`) 19곳 → sbGet.  남은 것: 익명 헤더 직접 조립한 GET · REST 쓰기(POST/PATCH/DELETE) · 서버 함수 POST · Auth
   → 다음 회차에 패턴 1종씩. URL·anon 키를 00-config 로 옮기는 것도 그때. 공통 에러 처리는 S9.
   ※ SMEBK_FN·SM_DEV(15-events)·COVER_ANON(12-nav)·SB_REST(13-covers)·BX_H(14-student-id)·smHeaders(16-auth-lock)는
     함수 안에서만 읽으므로 로드 순서 무관.  */

// REST 표 읽기(GET, 익명 키+BX_H 헤더) — path 는 '/표이름?select=…' 처럼 SB_REST 뒤에 그대로 붙는 문자열. Response 그대로 반환.
//   sbGet('/bookstar_writings?student_id=eq.'+encodeURIComponent(id)+'&select=*')
function sbGet(path){
  return fetch(SB_REST+path,{headers:BX_H});
}

// 서버 함수 GET 호출 — Response 를 그대로 돌려준다(호출부가 r.json() 함).
//   sbFn(SMEBK_FN, {action:'return', loanSrmb, brcd})            → ?action=return&loanSrmb=…&brcd=…  (값은 encodeURIComponent, 순서 유지)
//   opts.dev  : 폰이면 '&device=m' 덧붙임(SM_DEV) — 교보 뷰어 모바일 발급
//   opts.anon : 개인 토큰이 있어도 익명 키로(재고 조회처럼 로그인과 무관한 호출)
function sbFn(url, query, opts){
  let q='';
  for(const k in (query||{})) q+=(q?'&':'?')+k+'='+encodeURIComponent(query[k]);
  if(opts&&opts.dev) q+=SM_DEV;
  const headers=(opts&&opts.anon) ? {apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON} : smHeaders();
  return fetch(url+q,{headers});
}
