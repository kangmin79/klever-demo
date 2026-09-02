/* ====== 발행물 로드 (8/14 데모 숫자 전면 제거 → 8/17 옛 통계 코드 삭제, 통계는 파일 끝 '통계·관리 5화면' 구역) ======
   PPT 예시 기반 가짜 프로그램·접속·클릭 수치는 진단서의 "실측만" 원칙과 정면 충돌이라 걷어냈다.
   이제 이 화면의 모든 숫자는 서버 발행물·실측 로그에서만 나오고, 없으면 빈 상태로 정직하게 보인다. */
let PROGRAMS=[];   // 서버(library_programs) 발행물만 — loadServerPrograms가 채운다
// 서버(library_programs)의 실제 발행물을 불러와 데모 앞에 합침
async function loadServerPrograms(){
  try{
    const r=await sbGetAnon(`/library_programs?select=*&order=sort_order.asc.nullslast,created_at.desc`);
    if(!r.ok)return;
    const rows=await r.json(); if(!Array.isArray(rows))return;
    const mapped=rows.map(x=>({id:x.id,type:x.type,title:x.title,status:x.status,from:x.start_date||'',to:x.end_date||'',
      loc:x.location?[x.location]:[],intro:x.intro||'',
      mission:x.mission||undefined,books:(x.books||[]).map(b=>({t:b.title,a:b.author,isbn:b.isbn,cover:b.cover,note:b.note||''}))}));
    PROGRAMS=mapped;   // 데모 병합 제거(8/14) — 발행한 것만 보인다
    if(el('pg-writings').style.display!=='none'&&typeof renderWritings==='function'&&WRITINGS.length)renderWritings();   // 도서명(bookTitleOf) 보강용 재렌더
  }catch(e){}
}
/* 이용자별·도서별·월별 데모 표 제거(8/14) — 정식 오픈 후 실집계로 채운다 */
let NOTICES=[];        // 서버(library_notices)만 — loadNotices가 채운다

