/* ====== 챌린지 만들기 (카테고리 목록형 — 우리도서관 꾸미기와 동일 패턴) ====== */
// 8/29 리뷰 F6: 불러오기 실패가 빈 화면으로 보여 사서가 다시 만들고 저장 → 옛 행 삭제는 건너뛰어 학생 앱에 중복 발행. 실패면 표시하고 저장을 막는다.
let CHAL_LOAD_FAILED=false;
async function loadChallenges(){
  try{
    const r=await sbGetAnon(`/library_programs?select=*&order=sort_order.asc.nullslast,created_at.desc`);
    if(!r.ok){CHAL_LOAD_FAILED=true;renderChallenges();return;}
    const rows=await r.json(); if(!Array.isArray(rows)){CHAL_LOAD_FAILED=true;renderChallenges();return;}
    CHAL_LOAD_FAILED=false;
    CHALLENGES=rows.filter(x=>(x.type||'').includes('챌린지')).map(x=>({
      id:x.id,type:x.type,title:x.title,detail:x.intro||'',from:x.start_date||'',to:x.end_date||'',featured:!!x.featured,
      style:x.style||'row',
      mission:chalMissClean(x.mission,x.type),
      books:(x.books||[]).map(b=>({id:b.id||'',isbn:b.isbn,title:b.title,author:b.author,cover:b.cover,note:b.note||''}))}));
    ORIG_CHAL_IDS=CHALLENGES.map(c=>c.id).filter(Boolean);
    if(el('pg-make').style.display!=='none')renderChallenges();
  }catch(e){CHAL_LOAD_FAILED=true;renderChallenges();}
}
