/* ═══════════════════════════════════════════════════════════
   피드 (Ver03) — 모든 학생의 한 줄 소감 광장 (bookstar_challenge_results)
   ═══════════════════════════════════════════════════════════ */
function _bookById(id){ return (typeof BOOKS!=='undefined') ? BOOKS.find(b=>b.id===id) : null; }
function _feedAgo(iso){
  if(!iso) return '';
  try{ const d=(Date.now()-new Date(iso).getTime())/1000;
    if(d<3600) return Math.max(1,Math.floor(d/60))+'분 전';
    if(d<86400) return Math.floor(d/3600)+'시간 전';
    return Math.floor(d/86400)+'일 전';
  }catch(e){ return ''; }
}
/* ── 밀리식 피드: 추천/팔로잉 탭 + 타입 필터 + 타입별 카드 + 학생 프로필 ── */
const FEED_TYPES=[['all','전체'],['oneline','한 줄 소감'],['question','한 줄 질문'],['review','서평'],['essay','독후감'],['favorite','인생책']];   // 8/29 사장님 PDF 순서·명칭
const FEED_PASTEL=['#eef2ff','#fdeef4','#eefaf1','#fff6e9','#eef7fb','#f3eefe','#fef0ef','#eefbf6'];
const FEED_ACT={ oneline:{t:'한 줄 소감',cat:'oneline'}, review:{t:'서평',cat:'review'}, essay:{t:'독후감',cat:'essay'},
  underline:{t:'핵심 문장',cat:'highlight'}, recommend:{t:'책 추천',cat:'recommend'}, question:{t:'한 줄 질문',cat:'question'},
  impression:{t:'한 줄 소감',cat:'oneline'}, favorite:{t:'인생책',cat:'favorite'} };
let _feedTab='rec', _feedType='all', _feedItems=[];
let _myFollows=new Set(), _likeCount={}, _myLikes=new Set();
// 학생 이름·이모지 서버 캐시 — BX_STUDENTS는 빈 폴백 배열이라(5850) 피드·프로필 이름이 전부 '학생'으로 나오던 버그 수리
let _bxNameMap=null;
async function _bxNames(){
  if(_bxNameMap) return _bxNameMap;
  const m={};
  try{ const r=await sbGet(`/bookstar_students_public?select=id,name,emoji`);   // 8/29 공개용 뷰(이름 가림) — 본체 표는 본인 행만
    if(r.ok){ const a=await r.json(); if(Array.isArray(a)) a.forEach(x=>{ m[x.id]={name:x.name||'학생', emoji:x.emoji||'🙂'}; }); } }catch(e){}
  _bxNameMap=m;
  return m;
}
async function loadFeedSocial(){
  const me=_bxSid();
  _myFollows=new Set(); _likeCount={}; _myLikes=new Set();
  try{ const r=await sbGet(`/bookstar_follows?follower_id=eq.${encodeURIComponent(me)}&select=following_id`);
    if(r.ok){ const a=await r.json(); if(Array.isArray(a)) a.forEach(x=>_myFollows.add(x.following_id)); } }catch(e){}
  try{ const r=await sbGet(`/bookstar_likes?select=liker_id,item_key`);
    if(r.ok){ const a=await r.json(); if(Array.isArray(a)) a.forEach(x=>{ _likeCount[x.item_key]=(_likeCount[x.item_key]||0)+1; if(x.liker_id===me) _myLikes.add(x.item_key); }); } }catch(e){}
}
async function feedLike(btn,key){
  const me=_bxSid(); const liked=_myLikes.has(key);
  // 낙관 업데이트 + 서버 거절(RLS 등)·네트워크 실패 시 원복 — 화면만 성공한 척 남는 가짜성공 방지
  const apply=(on)=>{ if(on){ _myLikes.add(key); _likeCount[key]=(_likeCount[key]||0)+1; }
    else { _myLikes.delete(key); _likeCount[key]=Math.max(0,(_likeCount[key]||1)-1); }
    btn.classList.toggle('liked',on); const c=btn.querySelector('.fl-c'); if(c) c.textContent=_likeCount[key]||0; };
  apply(!liked);
  try{ const r = liked
      ? await sbWrite('DELETE',`/bookstar_likes?liker_id=eq.${encodeURIComponent(me)}&item_key=eq.${encodeURIComponent(key)}`)
      : await sbWrite('POST',`/bookstar_likes`,{liker_id:me,item_key:key},{prefer:'resolution=ignore-duplicates,return=minimal'});
    if(!r.ok) apply(liked);
  }catch(e){ apply(liked); }
}
async function feedFollow(btn,sid){
  const me=_bxSid(); if(me===sid) return;
  const on=_myFollows.has(sid);
  const paint=()=>{ document.querySelectorAll('.fc-follow[data-sid="'+sid+'"]').forEach(b=>{ const f=_myFollows.has(sid); b.classList.toggle('on',f); b.textContent=f?'팔로잉':'팔로우'; }); };
  if(on) _myFollows.delete(sid); else _myFollows.add(sid);
  paint();
  const revert=()=>{ if(on) _myFollows.add(sid); else _myFollows.delete(sid); paint(); };
  try{ const r = on
      ? await sbWrite('DELETE',`/bookstar_follows?follower_id=eq.${encodeURIComponent(me)}&following_id=eq.${encodeURIComponent(sid)}`)
      : await sbWrite('POST',`/bookstar_follows`,{follower_id:me,following_id:sid},{prefer:'resolution=ignore-duplicates,return=minimal'});
    if(!r.ok) revert();
  }catch(e){ revert(); }
}
function setFeedTab(t){ _feedTab=t; renderFeed(); }
function setFeedType(t){ _feedType=t; renderFeed(); }
// 정렬(최신순)은 지키되, 같은 학생이 연속으로 안 나오게 골고루 섞기
function _feedSpread(sorted){
  const pool=sorted.slice(), out=[]; let last=null;
  while(pool.length){
    let idx=pool.findIndex(x=>x.sid!==last);
    if(idx<0) idx=0;            // 남은 게 전부 같은 학생이면 그냥 진행
    out.push(pool[idx]); last=pool[idx].sid; pool.splice(idx,1);
  }
  return out;
}
function feedCard(it,i){
  const s=(_bxNameMap&&_bxNameMap[it.sid]) || BX_STUDENTS.find(z=>z.id===it.sid) || {name:'학생', emoji:'🙂'};
  const b=(typeof _anyBook==='function'?_anyBook(it.book_id):null)||_bookById(it.book_id);   // 8/30 도서관 책도 제목·표지
  const isCls=/^(gb|kr)-/.test(String(it.book_id||''));
  const title=b?cleanT(b.title||''):(it.book_id||'');
  const author=b?(b.author||''):'';
  const cvImg=(b&&b.coverSrc)?`<img src="${esc(b.coverSrc)}" loading="lazy" onerror="this.style.display='none';this.parentNode.textContent='📕'">`:'📕';
  const def=FEED_ACT[it.act]||{t:'기록',cat:'oneline'};
  const meta=[def.t, _feedAgo(it.time), it.meta].filter(Boolean).join(' · ');
  const likeKey=it.sid+'|'+it.book_id+'|'+it.act+'|'+String(it.time||'').slice(0,16);
  const liked=_myLikes.has(likeKey);
  const lc=_likeCount[likeKey]||0;
  const bk=!b?'':(isCls?` onclick="openDetail('${esc(String(b.id))}')"`:` onclick="libDetail('${esc(String(it.book_id))}')"`);
  const pastel=FEED_PASTEL[i%FEED_PASTEL.length];
  const long=(it.act==='essay')||(it.text||'').length>120;
  const isMe=(it.sid===_bxSid());
  const following=_myFollows.has(it.sid);
  const followBtn = isMe ? '' :    /* 8/30 사장님: '내 글' 배지 삭제 — 이름 아래 종류 표시로 충분 */`<button class="fc-follow${following?' on':''}" data-sid="${esc(it.sid)}" onclick="event.stopPropagation();feedFollow(this,'${esc(it.sid)}')">${following?'팔로잉':'팔로우'}</button>`;
  let content;
  if(it.act==='underline') content=`<div class="fc-quote hl" style="background:${pastel}"><span class="qm">“</span>${esc(it.text)}<span class="qm">”</span></div>`;
  else if(long) content=`<div class="fc-body">${esc(it.text)}</div><button class="fc-more" onclick="event.stopPropagation();const b=this.previousElementSibling;b.classList.toggle('open');this.textContent=b.classList.contains('open')?'접기':'더보기'">더보기</button>`;   /* 8/30 서평·독후감 잘림 → 더보기 */
  else content=`<div class="fc-quote" style="background:${pastel}">${esc(it.text)}</div>`;
  return `<div class="fc${isMe?' mine':''}">
    <div class="fc-top">
      <div class="fc-ava" onclick="openStudentProfile('${esc(it.sid)}')">${esc(s.emoji||'🙂')}</div>
      <div class="fc-id" onclick="openStudentProfile('${esc(it.sid)}')"><div class="fc-nm">${esc(isMe?s.name:pubName(s.name))}</div><div class="fc-mt">${esc(meta)||'방금'}</div></div>
      ${followBtn}
    </div>
    ${content}
    <div class="fc-bookrow"${bk}>
      <div class="fc-cv">${cvImg}</div>
      <div class="fc-bi"><div class="fc-bt">${esc(title)}</div><div class="fc-ba">${esc(author)}</div></div>
    </div>
    <div class="fc-acts">
      <button class="fc-act${liked?' liked':''}" onclick="feedLike(this,'${esc(likeKey)}')">♥ <span class="fl-c">${lc}</span></button>
      <button class="fc-act"${bk}>책 보기</button>   <!-- 8/30 사장님: 이모티콘 삭제 -->
    </div>
  </div>`;
}
async function loadFeedItems(){
  const items=[];
  try{
    const r=await sbGet(`/bookstar_writings?select=student_id,book_id,activity,text,hidden,created_at&is_public=eq.true&order=created_at.desc&limit=200`);
    const rows=await r.json();
    (Array.isArray(rows)?rows:[]).forEach(x=>{ if(x.hidden||!(x.text||'').trim())return;
      items.push({sid:x.student_id,book_id:x.book_id,act:x.activity,text:x.text,time:x.created_at,meta:''}); });
  }catch(e){}
  try{
    const r=await sbGet(`/bookstar_challenge_results?select=student_id,book_id,impression,score,quiz_ok,quiz_total,updated_at&order=updated_at.desc&limit=120`);
    const rows=await r.json();
    (Array.isArray(rows)?rows:[]).forEach(x=>{ if(!(x.impression||'').trim())return;
      const m=[]; if(x.quiz_total)m.push(`퀴즈 ${x.quiz_ok||0}/${x.quiz_total}`); if(x.score)m.push(`${x.score}점`);
      items.push({sid:x.student_id,book_id:x.book_id,act:'impression',text:x.impression,time:x.updated_at,meta:m.join(' · ')}); });
  }catch(e){}
  // 인생책 — 글(bookstar_writings)이 아니라 학생 프로필의 별도 통로(favorite_book_id·favorite_reason). 시각은 프로필 생성 시각뿐이라 그것을 씀
  try{
    const r=await sbGet(`/bookstar_students_public?select=id,favorite_book_id,favorite_reason,created_at&favorite_book_id=not.is.null&favorite_book_id=neq.&order=created_at.desc&limit=200`);
    const rows=await r.json();
    (Array.isArray(rows)?rows:[]).forEach(x=>{ if(!x.favorite_book_id)return;
      items.push({sid:x.id,book_id:x.favorite_book_id,act:'favorite',text:(x.favorite_reason||'').trim()||'인생책으로 골랐어요',time:x.created_at,meta:''}); });
  }catch(e){}
  try{ await bxResolveBooks(items.map(x=>x.book_id)); }catch(e){}   // 8/30 도서관 책 제목·표지
  _feedItems=items;
}
async function renderFeed(){
  const box=document.getElementById('feedBody'); if(!box) return;
  if(!_feedItems.length){
    box.innerHTML=_feedHead()+'<div class="feed-empty">피드를 불러오는 중…</div>';
    await Promise.all([loadFeedItems(), loadFeedSocial(), _bxNames()]);
  } else if(!renderFeed._rf){
    // 캐시 즉시 표시 + 뒤에서 최신분 갱신(글 남기고 바로 피드 와도 반영) — 내용이 달라졌을 때만 다시 그림
    renderFeed._rf=Promise.all([loadFeedItems(), loadFeedSocial()]).then(()=>{
      renderFeed._rf=null;
      if(_feedSig()!==renderFeed._sig && document.getElementById('feedBody')) _feedPaint();
    }).catch(()=>{ renderFeed._rf=null; });
  }
  _feedPaint();
}
function _feedSig(){ return _feedItems.length+'|'+String(_feedItems[0]&&_feedItems[0].time||''); }
function _feedHead(){
  return `<div class="feed-tabs">
      <button class="feed-tab ${_feedTab==='rec'?'on':''}" onclick="setFeedTab('rec')">추천</button>
      <button class="feed-tab ${_feedTab==='follow'?'on':''}" onclick="setFeedTab('follow')">팔로잉</button>
    </div>
    <div class="feed-chips">${FEED_TYPES.map(t=>`<button class="feed-chip ${_feedType===t[0]?'on':''}" onclick="setFeedType('${t[0]}')">${t[1]}</button>`).join('')}</div>`;
}
function _feedPaint(){
  const box=document.getElementById('feedBody'); if(!box) return;
  renderFeed._sig=_feedSig();
  const head=_feedHead();
  let list=_feedItems.slice();
  if(_feedTab==='follow') list=list.filter(x=>_myFollows.has(x.sid));
  if(_feedType!=='all') list=list.filter(x=>(FEED_ACT[x.act]||{}).cat===_feedType);
  list.sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));   // 8/29: 우수작 우선 정렬 삭제 → 최신순만
  list=_feedSpread(list);   // 같은 학생 연속 방지(여러 친구 골고루)
  if(!list.length){
    box.innerHTML=head+(_feedTab==='follow'
      ? `<div class="feed-empty">아직 팔로우한 친구의 글이 없어요.<br>추천 탭에서 친구 이름을 누르고 <b>팔로우</b> 해보세요.</div>`
      : (_feedType==='favorite'
        ? `<div class="feed-empty">아직 인생책을 고른 친구가 없어요.<br>내 서재에서 <b>인생책</b>을 골라 보세요.</div>`
        : `<div class="feed-empty">아직 이 유형의 글이 없어요.<br>챌린지에서 글을 남기면 여기에 모여요.</div>`));
    return;
  }
  box.innerHTML=head+`<div class="feed-grid">${list.map((x,i)=>feedCard(x,i)).join('')}</div>`;
  _feedTrimMore(box);
}
/* 5줄 안에 다 들어간 글은 '더보기'를 숨김 — 눌러도 변화가 없어 혼란 (8/30) */
function _feedTrimMore(box){
  requestAnimationFrame(()=>{
    box.querySelectorAll('.fc-more').forEach(btn=>{
      const b=btn.previousElementSibling;
      if(b && b.classList.contains('fc-body') && b.scrollHeight<=b.clientHeight+1) btn.style.display='none';
    });
  });
}
/* ── 학생 프로필(도서 이력) 모달 — 이름 클릭 시 ── */
function closeStudentProfile(){ const ov=document.getElementById('bxProfileOv'); if(ov) ov.classList.remove('on'); document.body.style.overflow=''; }
async function profileFollow(btn,sid){
  const me=_bxSid(); if(me===sid) return;
  const on=_myFollows.has(sid);
  // feedFollow와 동일: 낙관 업데이트 + 실패 시 원복
  if(on)_myFollows.delete(sid); else _myFollows.add(sid);
  btn.classList.toggle('on',!on); btn.textContent=!on?'팔로잉':'팔로우';
  const fc=document.getElementById('bxpFollowers'); if(fc){ fc.textContent=Math.max(0,(parseInt(fc.textContent,10)||0)+(on?-1:1)); }
  const revert=()=>{ if(on)_myFollows.add(sid); else _myFollows.delete(sid);
    btn.classList.toggle('on',on); btn.textContent=on?'팔로잉':'팔로우';
    const f2=document.getElementById('bxpFollowers'); if(f2){ f2.textContent=Math.max(0,(parseInt(f2.textContent,10)||0)+(on?1:-1)); } };
  try{ const r = on
      ? await sbWrite('DELETE',`/bookstar_follows?follower_id=eq.${encodeURIComponent(me)}&following_id=eq.${encodeURIComponent(sid)}`)
      : await sbWrite('POST',`/bookstar_follows`,{follower_id:me,following_id:sid},{prefer:'resolution=ignore-duplicates,return=minimal'});
    if(!r.ok) revert();
  }catch(e){ revert(); }
}
async function openStudentProfile(sid){
  const s=(await _bxNames())[sid] || BX_STUDENTS.find(z=>z.id===sid) || {name:'학생', emoji:'🙂'};
  let ov=document.getElementById('bxProfileOv');
  if(!ov){ ov=document.createElement('div'); ov.id='bxProfileOv'; ov.className='bxp-ov'; ov.onclick=e=>{ if(e.target===ov) closeStudentProfile(); }; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="bxp"><div class="bxp-hd"><span class="bxp-x" onclick="closeStudentProfile()">×</span><div class="bxp-av">${esc(s.emoji||'🙂')}</div><div class="bxp-nm">${esc(sid===_bxSid()?s.name:pubName(s.name))}</div><div class="bxp-gr">불러오는 중…</div></div><div class="bxp-body"><div class="feed-empty">불러오는 중…</div></div></div>`;
  ov.classList.add('on'); document.body.style.overflow='hidden';
  // stale 가드: 최신 호출만 렌더 (기존: A 프로필 늦은 응답이 B 모달을 통째로 덮어쓰던 레이스)
  const token = (openStudentProfile._t = {});
  let writings=[], results=[], enroll=[];
  const me=_bxSid();
  let followers=0, followingN=0, iFollow=_myFollows.has(sid);
  const _gj = async (path, fn) => { try{ const r=await sbGet(path); if(r.ok) fn(await r.json()); }catch(e){} };
  // 독립 5요청 병렬 (8/29 별 포인트 폐지 — totals 요청 삭제)
  await Promise.all([
    _gj(`/bookstar_writings?student_id=eq.${encodeURIComponent(sid)}${sid===me?'':'&is_public=eq.true&hidden=eq.false'}&select=*&order=created_at.desc`, a=>{ writings=a; }),   // 8/29 남의 '나만 보기' 글 노출 수리
    _gj(`/bookstar_challenge_results?student_id=eq.${encodeURIComponent(sid)}&select=book_id,impression,score,quiz_ok,quiz_total,updated_at`, a=>{ results=a; }),
    _gj(`/bookstar_challenge_enroll?student_id=eq.${encodeURIComponent(sid)}&select=challenge_id,status`, a=>{ enroll=a; }),
    _gj(`/bookstar_follows?following_id=eq.${encodeURIComponent(sid)}&select=follower_id`, a=>{ if(Array.isArray(a)){ followers=a.length; iFollow=a.some(x=>x.follower_id===me); } }),
    _gj(`/bookstar_follows?follower_id=eq.${encodeURIComponent(sid)}&select=following_id`, a=>{ if(Array.isArray(a)) followingN=a.length; }),
  ]);
  if(openStudentProfile._t !== token) return;   // 그 사이 다른 프로필을 열었으면 이 응답은 폐기
  writings=Array.isArray(writings)?writings.filter(w=>!w.hidden):[];
  results=Array.isArray(results)?results:[]; enroll=Array.isArray(enroll)?enroll:[];
  const done=enroll.filter(e=>e.status==='done').length;
  let qok=0,qt=0; results.forEach(r=>{ qok+=(r.quiz_ok||0); qt+=(r.quiz_total||0); });
  const rate=qt?Math.round(qok/qt*100):0;
  const byBook={};
  results.forEach(r=>{ if(!r.book_id||!(r.impression||'').trim())return; (byBook[r.book_id]=byBook[r.book_id]||[]).push({act:'impression',text:r.impression}); });
  writings.forEach(w=>{ if(!w.book_id)return; (byBook[w.book_id]=byBook[w.book_id]||[]).push({act:w.activity,text:w.text}); });
  const books=Object.keys(byBook);
  try{ await bxResolveBooks(books); }catch(e){}   // 8/30 도서관 책 제목·표지
  if(openStudentProfile._t !== token) return;
  const rowsHtml=books.length ? books.map(bid=>{
    const b=(typeof _anyBook==='function'?_anyBook(bid):null)||_bookById(bid); const acts=byBook[bid];
    const cv=(b&&b.coverSrc)?`<img src="${esc(b.coverSrc)}" onerror="this.style.display='none';this.parentNode.textContent='📕'">`:'📕';
    const tags=[...new Set(acts.map(a=>(FEED_ACT[a.act]||{t:''}).t).filter(Boolean))].join(' · ');
    const txt=acts.map(a=>'“'+esc(a.text)+'”').join('<br>');
    return `<div class="bxp-row"><div class="bxp-cv">${cv}</div><div class="bxp-ri"><div class="bxp-rt">${esc(b?b.title:bid)}</div><div class="bxp-rb">${esc(tags)}</div><div class="bxp-rx">${txt}</div></div></div>`;
  }).join('') : `<div class="feed-empty">아직 남긴 글이 없어요.</div>`;
  ov.querySelector('.bxp').innerHTML=`
    <div class="bxp-hd"><span class="bxp-x" onclick="closeStudentProfile()">×</span>
      <div class="bxp-av">${esc(s.emoji||'🙂')}</div><div class="bxp-nm">${esc(me===sid?s.name:pubName(s.name))}</div>
      <div class="bxp-gr">세명대학교 학술정보원</div>
      <div class="bxp-fl"><span>팔로워 <b id="bxpFollowers">${followers}</b></span><span>팔로잉 <b>${followingN}</b></span></div>
      ${me===sid?'':`<button class="bxp-followbtn${iFollow?' on':''}" onclick="profileFollow(this,'${esc(sid)}')">${iFollow?'팔로잉':'팔로우'}</button>`}</div>
    <div class="bxp-stats">
      <div class="bxp-st"><div class="v">${done}</div><div class="l">챌린지 완주</div></div>
      <div class="bxp-st"><div class="v">${qt?rate+'%':'—'}</div><div class="l">퀴즈 정답률</div></div>
      <div class="bxp-st"><div class="v">${writings.length}</div><div class="l">남긴 글</div></div></div>
    <div class="bxp-sec">📚 읽고 기록한 책 (${books.length})</div>
    <div class="bxp-body">${rowsHtml}</div>`;
}

function toggleTheme(){
  // 라이트 → 세피아 → 다크 → 라이트 순환
  const order = ['light','sepia','dark'];
  const i = order.indexOf(readerPrefs.theme);
  readerTheme(order[(i+1) % order.length]);
  return;
  // (이하 레거시 흔적 — 의도적으로 도달 X)
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  document.getElementById('themeBtn').innerHTML = ic(isDark ? 'sun' : 'moon', 'icon icon-sm');
  localStorage.setItem('klever-theme', isDark ? 'dark' : 'light');
}

