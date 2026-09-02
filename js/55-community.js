/* ═══════════════════════════════════════════════════════════
   커뮤니티
   ═══════════════════════════════════════════════════════════ */
function setCommunityTab(el, tab){
  document.querySelectorAll('#page-community .subtab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderCommunity(tab);
}

async function renderCommunityReviews(){
  const host=document.getElementById('communityContent');
  host.innerHTML='<div class="rv-empty">불러오는 중…</div>';
  const list=await rvFetch('select=*&hidden=eq.false&order=verified.desc,likes.desc,created_at.desc&limit=50');   // 사서가 숨긴 서평 제외(8/17)
  host.innerHTML=`<div style="font-size:12.5px;color:var(--text-light);margin-bottom:12px">
      완독·퀴즈를 통과한 학생들의 <b style="color:#1d6b48">✔ 검증된 서평</b>이 모이는 곳이에요.
      서평은 <b>내 서재 › 내 대출·예약의 빌린 책</b>에서 쓰면 여기에 자동으로 올라옵니다.</div>
    ${list.length?list.map(rvCard).join(''):'<div class="rv-empty">아직 서평이 없어요. 책을 읽고 첫 서평을 남겨보세요!</div>'}`;
}
function renderCommunity(tab){
  if(tab==='review'){ renderCommunityReviews(); return; }
  let list = COMMUNITY_POSTS[tab] || [];
  const isProgram = tab==='program';   // 독서 프로그램=모달, 나머지=아코디언(펼침)
  if(!list.length){ document.getElementById('communityContent').innerHTML='<div class="rv-empty">아직 등록된 글이 없어요.</div>'; return; }
  document.getElementById('communityContent').innerHTML = list.map((p,i)=>{
    const head=`<div class="list-card-head">
        <span class="list-card-tag ${p.urgent?'urgent':''}">${esc(p.tag)}</span>
        <span class="list-card-title">${esc(p.title)}</span>
        ${isProgram?'<span class="lc-go">›</span>':'<span class="acc-caret">▾</span>'}
      </div>
      <div class="list-card-meta">${(p.meta||[]).map(esc).join(' · ')}</div>`;
    if(isProgram) return `<div class="list-card" onclick="openCommModal('${tab}',${i})">${head}</div>`;
    return `<div class="list-card acc" onclick="toggleAcc(event,this)">${head}
      <div class="acc-body rt-view">${p.body?sanitizeHtml(p.body):'자세한 내용은 곧 업데이트됩니다.'}</div></div>`;
  }).join('');
}
function toggleAcc(e,el){ if(e&&e.target&&e.target.closest&&e.target.closest('.acc-body')) return; el.classList.toggle('open'); }
function openCommModal(tab,i){
  const p=(COMMUNITY_POSTS[tab]||[])[i]; if(!p) return;
  document.getElementById('commModalBody').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="list-card-tag ${p.urgent?'urgent':''}">${esc(p.tag||'')}</span>
      ${(p.meta||[]).length?`<span style="font-size:12.5px;color:var(--text-light)">${p.meta.map(esc).join(' · ')}</span>`:''}</div>
    <h2 style="font-size:20px;margin:0 0 12px;line-height:1.4">${esc(p.title)}</h2>
    <div class="rt-view" style="font-size:14px;line-height:1.85;color:var(--text)">${p.body?sanitizeHtml(p.body):'한 학기 동안 진행되는 독서 프로그램입니다. 참여하면 내서재에서 진행률과 점수를 확인할 수 있어요.'}</div>
    <button class="rv-writebtn" style="margin-top:20px;width:100%;justify-content:center" onclick="commJoinAlert('${esc(tab)}',${i})">참여하기 →</button>`;
  document.getElementById('commModal').classList.add('on');
}
// 제목을 onclick JS 문자열에 직접 삽입하지 않음 — 제목에 따옴표(’책제목’ 인용 관행) 있으면 버튼이 죽던 버그
function commJoinAlert(tab,i){
  const p=(COMMUNITY_POSTS[tab]||[])[i];
  alert('✅ ‘'+(p?p.title:'')+'’ 참여 신청 완료!\n내서재에서 진행률을 확인하세요.');
  closeCommModal();
}
function closeCommModal(){ document.getElementById('commModal').classList.remove('on'); }
// 커뮤니티 4개 탭 전부 — 관리자(community_posts)에서 관리 (공지도 community_posts가 소스, 구 library_notices 미사용)
async function loadCommunityPosts(){
  try{
    const r=await fetch(`${SB_REST}/community_posts?select=kind,tag,title,meta1,meta2,body&order=sort_order,created_at`,{headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok) return; const rows=await r.json(); if(!Array.isArray(rows)) return;
    const mk=k=>rows.filter(x=>x.kind===k).map(x=>({tag:x.tag||'',title:x.title,meta:[x.meta1,x.meta2].filter(Boolean),body:x.body||''}));
    ['program','event','free','notice'].forEach(k=>{ COMMUNITY_POSTS[k]=mk(k); });   // 항상 서버값으로 교체(삭제→빈탭 반영)
    const cp=document.getElementById('page-community');
    const on=document.querySelector('#page-community .subtab.active');
    if(cp&&cp.classList.contains('active')&&on){ const t=on.textContent;
      const key=t.includes('프로그램')?'program':t.includes('행사')?'event':t.includes('자유')?'free':t.includes('공지')?'notice':null;
      if(key) renderCommunity(key); }
  }catch(e){}
}
loadCommunityPosts();

