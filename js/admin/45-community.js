/* ====== 커뮤니티 관리 (도서관 행사 + 자유 게시판 = community_posts) ====== */
const COMM_TABS=[['program','독서 프로그램'],['event','도서관 행사'],['free','자유 게시판'],['notice','공지사항'],['review','서평 (신고·삭제)']];
const COMM_TAGS={program:['진행중','필수','곧 시작','완료'],event:['행사','강연','전시','모임'],free:['질문','추천','토론','자유'],notice:['공지','업데이트','안내','긴급']};
const COMM_META={program:['참여 현황','기간(D-day)'],event:['기간','장소'],free:['작성자','날짜·댓글'],notice:['날짜','비고']};
let commKind='program', COMM_POSTS=[];
async function loadCommPosts(){
  try{
    const r=await fetch(`${SB_REST}/community_posts?select=*&order=kind,sort_order,created_at`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    if(!r.ok)return; const rows=await r.json(); if(Array.isArray(rows)) COMM_POSTS=rows;
    if(el('pg-comm').style.display!=='none')renderComm();
  }catch(e){}
}
function setCommKind(k){ if(_commEditId)cancelCommEdit(); commKind=k;renderComm();}
function renderComm(){
  el('commTabs').innerHTML=COMM_TABS.map(t=>`<button class="tab ${t[0]===commKind?'on':''}" onclick="setCommKind('${t[0]}')">${t[1]}</button>`).join('');
  el('cmListTitle').textContent=(COMM_TABS.find(t=>t[0]===commKind)||[])[1]||'게시된 글';
  if(commKind==='review'){ el('commForm').style.display='none'; renderCommReviews(); return; }
  el('commForm').style.display='';
  el('cmTag').innerHTML=(COMM_TAGS[commKind]||[]).map(t=>`<option>${t}</option>`).join('');
  const ml=COMM_META[commKind]||['',''];
  el('cmM1L').textContent=ml[0]; el('cmM2L').textContent=ml[1];
  const list=COMM_POSTS.filter(p=>p.kind===commKind);
  el('commList').innerHTML=list.map(p=>`<div class="notice-i"><div class="nx">
    <h4><span class="gtag chal" style="margin-right:6px">${esc(p.tag||'')}</span>${esc(p.title)}</h4>
    <div class="nm">${esc(p.meta1||'')}${p.meta2?' · '+esc(p.meta2):''}</div>
    ${p.body?`<div class="rt-view">${sanitizeHtml(p.body)}</div>`:''}</div>
    <div style="display:flex;flex-direction:column;gap:6px;align-self:flex-start">
      <button class="btn-ghost" onclick="editCommPost(${p.id})">수정</button>
      <button class="btn-ghost" style="color:var(--bad);border-color:#e7c9c4" onclick="delCommPost(${p.id})">삭제</button>
    </div></div>`).join('')
    ||'<div class="pv-empty">아직 게시글이 없어요.</div>';
}
// 서평 모더레이션 — reviews 테이블 목록 + 삭제
let COMM_REVIEWS=[];
async function renderCommReviews(){
  el('commList').innerHTML='<div class="pv-empty">서평을 불러오는 중…</div>';
  try{
    const r=await fetch(`${SB_REST}/reviews?select=*&order=created_at.desc&limit=100`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    COMM_REVIEWS=r.ok?await r.json():[];
  }catch(e){COMM_REVIEWS=[];}
  el('commList').innerHTML=(COMM_REVIEWS||[]).map(p=>`<div class="notice-i"><div class="nx">
    <h4><span class="gtag ${p.verified?'cur':'chal'}" style="margin-right:6px">${p.verified?'✔ 완독':'읽는 중'}</span>${esc(p.reviewer)} · <span style="color:var(--accent)">★${p.rating}</span> <span style="color:var(--light);font-weight:600">『${esc(p.book_title||p.book_id)}』</span>${p.lang&&p.lang!=='ko'?` <span style="font-size:11px">[${esc(String(p.lang).toUpperCase())}]</span>`:''}</h4>
    <p>${esc(p.body)}</p>
    <div class="nm">👍 ${p.likes||0} · ${(p.created_at||'').slice(0,10)}</div></div>
    <button class="btn-ghost" style="color:var(--bad);border-color:#e7c9c4;align-self:flex-start" onclick="delReview(${p.id})">삭제</button></div>`).join('')
    ||'<div class="pv-empty">아직 등록된 서평이 없어요.</div>';
}
async function delReview(id){
  if(!confirm('이 서평을 삭제할까요? (부적절 신고 처리)'))return;
  try{ await adminSave({op:'reviews_delete',id}); }catch(e){}
  renderCommReviews(); toast('서평을 삭제했어요');
}
let _commEditId=null;
function editCommPost(id){
  const p=COMM_POSTS.find(x=>x.id===id); if(!p)return;
  _commEditId=id;
  if(el('cmTag')) el('cmTag').value=p.tag||'';   // 분류 옵션은 현재 탭 기준이라 일치
  el('cmTitle').value=p.title||''; el('cmM1').value=p.meta1||''; el('cmM2').value=p.meta2||''; rtSet('cmBodyRich',p.body||'');
  el('cmSubmit').textContent='수정 저장 →'; el('cmCancel').style.display='';
  el('commForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelCommEdit(){
  _commEditId=null;
  el('cmTitle').value='';el('cmM1').value='';el('cmM2').value='';rtSet('cmBodyRich','');
  if(el('cmSubmit'))el('cmSubmit').textContent='게시 →'; if(el('cmCancel'))el('cmCancel').style.display='none';
}
async function saveCommPost(){
  const title=el('cmTitle').value.trim(); if(!title){toast('제목을 입력해주세요');return;}
  const row={kind:commKind,tag:el('cmTag').value,title,meta1:el('cmM1').value.trim(),meta2:el('cmM2').value.trim(),body:rtEmpty('cmBodyRich')?'':rtGet('cmBodyRich')};
  const editing=_commEditId;
  try{
    let r;
    if(editing){
      r=await adminSave({op:'comm_patch',id:editing,row});
    }else{
      r=await adminSave({op:'comm_insert',row:Object.assign({school:'한국대학교'},row)});
    }
    if(!r.ok){toast((editing?'수정':'게시')+' 실패 ('+r.status+')');return;}
  }catch(e){toast((editing?'수정':'게시')+' 실패 — 연결 확인');return;}
  cancelCommEdit();
  await loadCommPosts(); toast(editing?'수정됐어요 — 학생 앱에 반영됩니다':'게시됐어요 — 학생 앱 커뮤니티에 노출됩니다');
}
async function delCommPost(id){
  if(!confirm('이 글을 삭제할까요?'))return;
  try{ await adminSave({op:'comm_delete',id}); }catch(e){}
  await loadCommPosts(); toast('삭제했어요');
}

