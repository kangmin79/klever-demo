/* ═══ 서버 호출 창구 (S7, 2026-09-02) ═══
   지금까지 94곳이 각자 URL·키·헤더를 조립해 fetch 했다. 여기로 모은다.
   1회차: semyung-ebook-borrow(SMEBK_FN) 10곳만 sbFn 으로 — 응답 처리(.json()·분기)는 호출부에 그대로 둔다(동작 동일).
   2회차: REST GET(`{headers:BX_H}`) 19곳 → sbGet.
   3회차: 익명 키 GET 16곳 → sbGetAnon · REST 쓰기(POST/PATCH/DELETE) 25곳 → sbWrite.
   4회차(마지막): 서버 함수 GET 3 → sbFn · 서버 함수 POST 7(bookinfo·curate·library-brain·byeoli-search·push-register 3) → sbFnPost
     · Auth 3(refresh·verify·logout) → sbAuth · 본문 로더 2 → sbGetAnon. URL·anon 키 상수는 전부 js/00-config.js 로.
   이제 supabase 로 가는 fetch 는 이 파일에만 있다(예외: js/90·91 위젯 IIFE 는 자기 상수를 따로 갖고 있음 — 그대로 둠). 공통 에러 처리는 S9.
   ※ sbGet(BX_H) 과 sbGetAnon 을 합치지 않은 이유: 로그인하면 16-auth-lock 이 BX_H.Authorization 을 본인 토큰으로 바꾼다.
     공개 표(장서·프로그램·서평·팝업)를 익명 키로 읽던 곳을 BX_H 로 바꾸면 RLS 역할이 anon→authenticated 로 달라진다 — 동작 변경.
   ※ 상수는 js/00-config.js, smHeaders 는 js/16-auth-lock.js — 전부 함수 안에서만 읽으므로 로드 순서 무관.  */

// REST 표 읽기(GET, 익명 키+BX_H 헤더) — path 는 '/표이름?select=…' 처럼 SB_REST 뒤에 그대로 붙는 문자열. Response 그대로 반환.
//   sbGet('/bookstar_writings?student_id=eq.'+encodeURIComponent(id)+'&select=*')
function sbGet(path){
  return fetch(SB_REST+path,{headers:BX_H});
}

// REST 표 읽기(GET, 항상 익명 키) — 공개 표(semyung_tulip·library_programs·library_sections·reviews·minsong_popups 등).
//   로그인 뒤에도 본인 토큰을 쓰지 않는다(위 ※). Response 그대로 반환.
//   sbGetAnon('/semyung_tulip?select=ctrl&kind=eq.paper&isbn=eq.'+clean+'&limit=1')
function sbGetAnon(path){
  return fetch(SB_REST+path,{headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
}

// REST 표 쓰기(POST/PATCH/DELETE) — 기본은 학생 세션 헤더(BX_H: 로그인 뒤 본인 토큰). body 는 객체(JSON 직렬화), 없으면 생략(DELETE).
//   sbWrite('POST','/bookstar_mybooks?on_conflict=student_id,book_id', row, {prefer:'resolution=merge-duplicates,return=minimal'})
//   opts.prefer    : PostgREST Prefer 헤더(업서트 방식·응답 형태). 없으면 안 붙임
//   opts.keepalive : 탭 종료 직전 발사(pagehide) — 브라우저가 페이지를 닫아도 요청을 끝까지 보냄
//   opts.anon      : 익명 키로(서평·별이 검색 로그처럼 로그인과 무관한 표) — content-type 은 붙임
function sbWrite(method, path, body, opts){
  const o=opts||{};
  const headers=o.anon ? {apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON,'content-type':'application/json'} : {...BX_H};
  if(o.prefer) headers.Prefer=o.prefer;
  const init={method,headers};
  if(body!==undefined) init.body=JSON.stringify(body);
  if(o.keepalive) init.keepalive=true;
  return fetch(SB_REST+path,init);
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

// 서버 함수 POST(JSON 본문) — Response 그대로. 기본 헤더 = smHeaders()+content-type(푸시 등록처럼 본인 토큰으로 가는 호출).
//   sbFnPost(INFO_FN, {isbns:batch}, {anon:true})
//   opts.anon   : 항상 익명 키(bookinfo·curate·library-brain·byeoli-search — 로그인과 무관한 호출)
//   opts.signal : AbortSignal(별이 검색 30s 타임아웃). 없으면 안 붙임
function sbFnPost(url, body, opts){
  const o=opts||{};
  const headers=o.anon ? {apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON,'content-type':'application/json'}
                       : Object.assign({'content-type':'application/json'},smHeaders());
  const init={method:'POST',headers,body:JSON.stringify(body)};
  if(o.signal) init.signal=o.signal;
  return fetch(url,init);
}

// Supabase Auth(/auth/v1) POST — path 는 '/token?grant_type=refresh_token' 처럼 SB_AUTH 뒤에 붙는 문자열. Response 그대로.
//   sbAuth('/verify', {type:'magiclink', token_hash})          → apikey + content-type + JSON 본문
//   sbAuth('/logout', undefined, {token:at, keepalive:true})   → apikey + 본인 토큰, 본문 없음
//   opts.token     : 본인 access token 을 Authorization 으로(로그아웃)
//   opts.keepalive : 탭 닫혀도 전송
function sbAuth(path, body, opts){
  const o=opts||{};
  const headers={apikey:COVER_ANON};
  if(o.token) headers.Authorization='Bearer '+o.token;
  const init={method:'POST',headers};
  if(body!==undefined){ headers['content-type']='application/json'; init.body=JSON.stringify(body); }
  if(o.keepalive) init.keepalive=true;
  return fetch(SB_AUTH+path,init);
}
