/* ═══════════════════════════════════════════════════════════
   검증 서평 (reviews) — 완독·인증 서평 공유 (마이페이지·커뮤니티·책 상세)
   ═══════════════════════════════════════════════════════════ */
const RV_FLAG={ko:'🇰🇷',en:'🇺🇸',vi:'🇻🇳',zh:'🇨🇳',ja:'🇯🇵'};
function readerName(){ try{ const s=(typeof bxStudent==='function')&&bxStudent(); if(s&&s.name) return s.name; return localStorage.getItem('bookstar_reader')||'학생'; }catch(e){ return '학생'; } }   // 8/17 데모 이름('김민서') 잔재 제거
// 공개 화면 표시 이름(8/17) — 다른 학생 눈에 보이는 자리(피드·프로필·랭킹·서평)는 실명 대신 가운데를 가린다: 강동욱→강*욱, 김민→김*, 남궁민수→남*수.
// PUB_NAME_MASK=false 로 바꾸면 전부 실명으로 되돌아간다(정책 결정 전 기본값=가림). 서평(reviews.reviewer)은 저장 자체를 가린 이름으로 한다.
const PUB_NAME_MASK=true;
function pubName(n){ n=String(n||'').trim(); if(!PUB_NAME_MASK||!n) return n||'학생'; if(n.length<=1||n==='학생'||n==='회원'||n==='익명') return n; if(n.length===2) return n[0]+'*'; return n[0]+'*'.repeat(n.length-2)+n[n.length-1]; }
function rvStars(n){ n=n||0; let s=''; for(let i=1;i<=5;i++) s+=`<span style="color:${i<=n?'#f5a623':'#d8d8d8'}">★</span>`; return s; }
function rvCover(r){
  const cb=(typeof BOOKS!=='undefined')&&BOOKS.find(x=>x.id===r.book_id);
  if(cb){ if(cb.coverSrc) return `<div class="rv-cv"><img src="${esc(cb.coverSrc)}" onerror="this.parentNode.classList.add('cls');this.parentNode.textContent='${esc((cb.title||'').slice(0,8))}'"></div>`;
    return `<div class="rv-cv cls">${esc((cb.title||r.book_title||'').slice(0,10))}</div>`; }
  const p=(typeof LIB_POOL!=='undefined')&&LIB_POOL.find(x=>x.isbn===r.book_id);
  if(p&&p.cover) return `<div class="rv-cv"><img src="${esc(hiCover(p.cover))}" onerror="this.parentNode.textContent='📖'"></div>`;
  return `<div class="rv-cv">📖</div>`;
}
function rvCard(r){
  return `<div class="rv-card">
    ${rvCover(r)}
    <div class="rv-main">
    <div class="rv-head">
      <span class="rv-who">${esc(pubName(r.reviewer))}</span>
      ${r.verified?'<span class="rv-badge">✔ 완독 인증</span>':'<span class="rv-badge rv-reading">읽는 중</span>'}
      ${r.lang&&r.lang!=='ko'?`<span class="rv-lang">${RV_FLAG[r.lang]||'🌐'} ${String(r.lang).toUpperCase()}</span>`:''}
      <span class="rv-stars">${rvStars(r.rating)}</span>
    </div>
    ${r.book_title?`<div class="rv-book">『${esc(r.book_title)}』</div>`:''}
    <div class="rv-body">${esc(r.body)}</div>
    <div class="rv-foot"><span class="rv-like" onclick="likeReview(${r.id},this)">👍 <b>${r.likes||0}</b></span></div>
    </div>
  </div>`;
}
async function rvFetch(qs){
  try{ const r=await sbGetAnon(`/reviews?${qs}`);
    if(!r.ok) return []; const d=await r.json(); return Array.isArray(d)?d:[];
  }catch(e){ return []; }
}
async function likeReview(id,elm){
  const b=elm.querySelector('b'); const n=(parseInt(b.textContent)||0)+1; b.textContent=n;
  // 실패 시 화면 숫자 롤백(DB와 영구 불일치 방지). 동시 클릭 원자성은 데모 규모상 보류(서버 RPC 필요)
  try{
    const r=await sbWrite('PATCH',`/reviews?id=eq.${id}`,{likes:n},{anon:true,prefer:'return=minimal'});
    if(!r.ok) b.textContent=n-1;
  }catch(e){ b.textContent=n-1; }
}
// 책 상세 모달 안에 서평 영역
async function renderDetailReviews(bookId,bookTitle){
  const host=document.getElementById('lcdReviews'); if(!host) return;
  const list=await rvFetch(`select=*&book_id=eq.${encodeURIComponent(bookId)}&hidden=eq.false&order=verified.desc,likes.desc,created_at.desc`);   // 숨긴 서평 제외
  const avg=list.length?(list.reduce((a,b)=>a+(b.rating||0),0)/list.length).toFixed(1):null;
  // 쓰기 버튼은 여기(책 상세) 두지 않는다(8/14 사장님) — 빌리기도 전에 서평을 쓰게 되는 위치.
  // 서평 쓰기는 '내 도서관 > 빌린 책'에서만: 대출 사실이 곧 "읽었다"의 최소 증거다.
  host.innerHTML=`<div class="rvh">
      <b>독자 서평 ${list.length}</b>${avg?`<span class="rv-stars">${rvStars(Math.round(avg))}</span><span style="font-size:12px;color:var(--text-light)">${avg}</span>`:''}</div>
    ${list.length?list.map(rvCard).join(''):'<div class="rv-empty">아직 서평이 없어요. 이 책을 빌려 읽은 학생이 내 서재(내 대출·예약)에서 남길 수 있어요.</div>'}`;
}
// 내 도서관 '빌린 책'에서 서평 쓰기 — 전자책은 바코드가 곧 책 키, 종이책은 소장목록에서 ctrl을 찾아 연결
// (ctrl을 못 찾으면 제목 키로 저장 — 내 서평·커뮤니티에는 보이고 상세 연결만 빠진다)
async function smReviewFromLoan(kind, key, title, author){
  if(kind==='ebook'&&key){ openReviewModal('sm-'+key, title); return; }
  const k=await tulipPaperKey('', title, author);
  openReviewModal(k?('sm-'+k):('t-'+(title||'책')), title);
}
// 서평 작성 모달
let rvCtx={bookId:'',bookTitle:'',rating:5};
function openReviewModal(bookId,bookTitle){
  // 서평도 본인 이름으로만(8/14) — 미로그인 등록은 '김민서/한국대학교' 데모 잔재로 저장되던 구멍
  if(!ssoIsPersonal()){ smLoginGuide('review'); return; }
  rvCtx={bookId:bookId||'',bookTitle:bookTitle||'',rating:5};
  const hasBook=!!(bookId||bookTitle);
  document.getElementById('rvmBook').textContent=hasBook&&bookTitle?`『${bookTitle}』`:'';
  const inp=document.getElementById('rvmBookInput'); inp.style.display=hasBook?'none':'block'; inp.value='';
  document.getElementById('rvmBody').value='';
  rvSetStars(5);
  document.getElementById('rvModal').classList.add('on');
}
function closeReviewModal(){ document.getElementById('rvModal').classList.remove('on'); }
function rvSetStars(n){ rvCtx.rating=n;
  document.getElementById('rvmStars').innerHTML=[1,2,3,4,5].map(i=>`<span class="${i<=n?'on':''}" onclick="rvSetStars(${i})">★</span>`).join('');
}
async function submitReview(){
  const body=document.getElementById('rvmBody').value.trim();
  if(!body){ alert('서평 내용을 입력해주세요.'); return; }
  const _chk=bxWriteCheck(body,'review',0); if(!_chk.ok){ alert(_chk.msg); return; }   // 연락처·링크·반복 글 차단(측정 설계 §4)
  const inp=document.getElementById('rvmBookInput');
  if(inp&&inp.style.display!=='none'){ rvCtx.bookTitle=inp.value.trim(); rvCtx.bookId=rvCtx.bookId||('t-'+(inp.value.trim()||'책')); }
  if(!rvCtx.bookTitle){ alert('책 제목을 입력해주세요.'); return; }
  // verified는 항상 false로 저장 — 인증 배지는 완독·퀴즈 측정이 붙는 날부터(자가신고 금지, 8/14)
  // 8/17: 학번(student_id)으로 본인 식별, reviewer 는 가린 이름으로 저장(테이블이 anon 읽기라 실명을 아예 안 남긴다). hidden 은 사서가 admin-save 로만 바꾼다.
  const row={school:'세명대학교',book_id:rvCtx.bookId,book_title:rvCtx.bookTitle,student_id:_bxSid(),reviewer:pubName(readerName()),rating:rvCtx.rating,body:body,verified:false,lang:'ko'};
  let _rvId='';
  try{ const r=await sbWrite('POST',`/reviews`,row,{anon:true,prefer:'return=representation'});
    if(!r.ok){ alert('등록 실패 ('+r.status+')'); return; }
    try{ const j=await r.json(); _rvId=(Array.isArray(j)&&j[0]&&j[0].id)?String(j[0].id):''; }catch(e){}
  }catch(e){ alert('등록 실패 — 연결 확인'); return; }
  bxEvent('activity',{sub:'review', book:bxBookByKey(rvCtx.bookId), item_title:rvCtx.bookTitle, ref_table:'reviews', ref_id:_rvId||('rv:'+_bxSid()+'|'+rvCtx.bookId), ok:body.length>=100, meta:{len:body.length, reason:(body.length<100?'min':'')}});   // 측정: 활동(상시 서평, 100자 미만은 미인정)
  closeReviewModal();
  if(document.getElementById('lcdReviews')) renderDetailReviews(rvCtx.bookId,rvCtx.bookTitle);
  if(document.getElementById('page-mypage').classList.contains('active')) renderMyReviews();
  if(document.getElementById('page-community').classList.contains('active')){ const on=document.querySelector('#page-community .subtab.active'); if(on&&on.textContent.includes('서평')) renderCommunity('review'); }
}
// 마이페이지 — 내 서평 + 친구 서평
async function renderMyReviews(){
  const me=_bxSid();
  const all=await rvFetch('select=*&hidden=eq.false&order=created_at.desc&limit=60');
  const mine=all.filter(r=>r.student_id===me), others=all.filter(r=>r.student_id!==me).slice(0,8);
  const mh=document.getElementById('myReviews'); if(mh) mh.innerHTML=mine.length?mine.map(rvCard).join(''):'<div class="rv-empty">아직 작성한 서평이 없어요. 책을 읽고 서평을 남겨보세요!</div>';
  const oh=document.getElementById('peerReviews'); if(oh) oh.innerHTML=others.length?others.map(rvCard).join(''):'<div class="rv-empty">아직 다른 학생의 서평이 없어요.</div>';
}

/* ── 학기 결산 공유카드 + 독서 데이터 차트 ── */
let _myRead=null;
function myReadBooks(){
  if(_myRead) return _myRead;
  // 실데이터만: 읽기 기록(완독율·독서시간)이 있는 책 — 데모 패딩(장르 섞어 14권 채우기) 제거 (8/15 가짜숫자 정리)
  const r=BOOKS.filter(b=>{ const c=_chalRead(b.id); return (b.progress>0) || !!(c && ((c.read_pct||0)>0 || (c.read_sec||0)>0)); });
  _myRead=r; return r;
}
async function myAvgRating(){
  const list=await rvFetch(`select=rating&student_id=eq.${encodeURIComponent(_bxSid())}&hidden=eq.false`);
  if(!list.length) return 0;   // 서평 없으면 0 → 표시부에서 '-' 처리 (가짜 4.3 금지)
  return list.reduce((a,b)=>a+(b.rating||0),0)/list.length;
}
async function renderSummaryCard(){
  const host=document.getElementById('summaryCard'); if(!host) return;
  // 전부 실데이터 — 가짜 폴백(14.5h·streak 7·정답률 86%) 제거 (8/15). 완독=완독율 90% 이상(인증 기준과 동일)
  const done=BOOKS.filter(b=>{const c=_chalRead(b.id); return !!(c&&(c.read_pct||0)>=90);}).length;
  const avg=await myAvgRating();
  const hours=(readerStats.readingTime&&readerStats.readingTime.total)?(readerStats.readingTime.total/60):0;
  const streak=(readerStats.streak&&readerStats.streak.count)||0;
  host.dataset.books=done; host.dataset.avg=avg?avg.toFixed(1):'-'; host.dataset.hours=hours.toFixed(1); host.dataset.streak=streak;
  host.innerHTML=`
    <div class="ss-kicker">✦ 2026-1학기 독서 결산</div>
    <div class="ss-name">${esc(readerName())} 님</div>
    <div class="ss-period">세명대학교 학술정보원 · bookstar</div>
    <div class="ss-grid">
      <div class="ss-cell"><div class="ss-num">${done}<span class="u">권</span></div><div class="ss-lbl">완독</div></div>
      <div class="ss-cell"><div class="ss-num">${avg?avg.toFixed(1):'-'}</div><div class="ss-lbl">평균 별점</div></div>
      <div class="ss-cell"><div class="ss-num">${streak}<span class="u">일</span></div><div class="ss-lbl">연속 독서</div></div>
      <div class="ss-cell"><div class="ss-num">${hours.toFixed(1)}<span class="u">h</span></div><div class="ss-lbl">독서 시간</div></div>
    </div>
    <div class="ss-foot"><div class="ss-brand">book<span>star</span></div>
      <button class="ss-share" onclick="shareSummary()">📤 결산 이미지 공유</button></div>`;
}
function roundRect(x,X,Y,w,h,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); }
function shareSummary(){
  const d=(document.getElementById('summaryCard')||{}).dataset||{};
  const W=1080,H=1350,c=document.createElement('canvas'); c.width=W;c.height=H; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,'#1e2a4a');g.addColorStop(.55,'#2d3a5e');g.addColorStop(1,'#3b2f6e');
  x.fillStyle=g; x.fillRect(0,0,W,H); x.textAlign='center';
  x.fillStyle='#c9b88a'; x.font='bold 34px Georgia'; x.fillText('✦ 2026-1학기 독서 결산', W/2, 175);
  x.fillStyle='#fff'; x.font='bold 76px sans-serif'; x.fillText(readerName()+' 님', W/2, 285);
  x.fillStyle='#c4ccdd'; x.font='30px sans-serif'; x.fillText('세명대학교 학술정보원 · bookstar', W/2, 345);
  const cells=[[(d.books||'0')+'권','완독'],[d.avg||'-','평균 별점'],[(d.streak||'0')+'일','연속 독서'],[(d.hours||'0.0')+'h','독서 시간']];
  const cw=480,ch=230,gap=40,sx=(W-cw*2-gap)/2,sy=455;
  cells.forEach((cell,i)=>{ const col=i%2,row=(i/2)|0,cx=sx+col*(cw+gap),cy=sy+row*(ch+gap);
    roundRect(x,cx,cy,cw,ch,24); x.fillStyle='rgba(255,255,255,.09)'; x.fill();
    x.fillStyle='#fff'; x.font='bold 88px Georgia'; x.fillText(cell[0], cx+cw/2, cy+125);
    x.fillStyle='#c4ccdd'; x.font='32px sans-serif'; x.fillText(cell[1], cx+cw/2, cy+185); });
  x.fillStyle='#fff'; x.font='bold 46px Georgia'; x.fillText('bookstar', W/2, H-115);
  x.fillStyle='#c9b88a'; x.font='28px sans-serif'; x.fillText('읽은 만큼 증명되는 독서 — 북스타', W/2, H-65);
  c.toBlob(async(blob)=>{
    try{ const file=new File([blob],'bookstar-결산.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:'내 독서 결산'}); return; }
    }catch(e){}
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='bookstar-결산.png'; document.body.appendChild(a); a.click(); a.remove();
  },'image/png');
}
function renderReadChart(){
  const host=document.getElementById('readChart'); if(!host) return;
  const set=myReadBooks(), total=set.length||1;
  const tally=(key)=>{const m={};set.forEach(b=>{const k=b[key]||'기타';m[k]=(m[k]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6);};
  const lm={}; set.forEach(b=>{const k=b.locale==='foreign'?'영어(원문)':'한국어';lm[k]=(lm[k]||0)+1;});
  const langs=Object.entries(lm).sort((a,b)=>b[1]-a[1]);
  const bars=(arr,color)=>arr.map(([k,v])=>`<div class="rc-row"><div class="rc-k" title="${esc(k)}">${esc(k)}</div><div class="rc-bar"><div class="rc-fill" style="width:${Math.round(v/total*100)}%;background:${color}"></div></div><div class="rc-v">${v}</div></div>`).join('');
  host.innerHTML=`<div class="rc-col"><div class="rc-h">장르</div>${bars(tally('category'),'#6366f1')}</div>
    <div class="rc-col"><div class="rc-h">시대</div>${bars(tally('period'),'#0ea5a4')}</div>
    <div class="rc-col"><div class="rc-h">언어</div>${bars(langs,'#b8902f')}</div>`;
}

/* ── 올해의 ○○ (슈퍼래티브) ── */
async function renderSuperlatives(){
  const host=document.getElementById('superlatives'); if(!host) return;
  const set=myReadBooks();
  const top=(key)=>{const m={};set.forEach(b=>{const k=b[key];if(k)m[k]=(m[k]||0)+1;});const e=Object.entries(m).sort((a,b)=>b[1]-a[1])[0];return e?e[0]:'-';};
  let fav=(set[0]&&(set[0].title))||'-';
  try{ const mine=await rvFetch(`select=book_title,rating&student_id=eq.${encodeURIComponent(_bxSid())}&hidden=eq.false&order=rating.desc,created_at.desc&limit=1`); if(mine&&mine[0]&&mine[0].book_title) fav=mine[0].book_title; }catch(e){}
  const cards=[['완독',set.length+'권'],['올해의 작가',top('author')],['최다 장르',top('category')],['최애 책',fav]];
  host.innerHTML='<div class="supl">'+cards.map(c=>`<div class="supl-c"><div class="supl-k">${esc(c[0])}</div><div class="supl-v">${esc(c[1])}</div></div>`).join('')+'</div>';
}
/* ── 독서 스트릭 캘린더(잔디) ── */
function _dk(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderStreakCal(){
  const host=document.getElementById('streakCal'); if(!host) return;
  const real=(readerStats.readingTime&&readerStats.readingTime.days)||{};
  const minsOf=k=>real[k]||0;   // 실데이터만 — 가짜 잔디(시드 난수) 제거 (8/15)
  const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today); start.setDate(start.getDate()-7*16+1); start.setDate(start.getDate()-start.getDay());
  const weeks=[]; let cur=[]; let active=0;
  for(let d=new Date(start); d<=today; d.setDate(d.getDate()+1)){
    const k=_dk(d), mins=minsOf(k); if(mins>0)active++;
    const lvl=mins===0?0:mins<16?1:mins<41?2:mins<81?3:4;
    cur.push({lvl,mins,k});
    if(d.getDay()===6){ weeks.push(cur); cur=[]; }
  }
  if(cur.length) weeks.push(cur);
  let cs=0; for(let d=new Date(today);;d.setDate(d.getDate()-1)){ if(minsOf(_dk(d))>0)cs++; else break; }
  const grid=weeks.map(w=>`<div class="sc-week">${[0,1,2,3,4,5,6].map(di=>{const c=w[di];return c?`<div class="sc-day ${c.lvl?'l'+c.lvl:''}" title="${c.k}${c.mins?(' · '+c.mins+'분'):''}"></div>`:'<div class="sc-day" style="visibility:hidden"></div>';}).join('')}</div>`).join('');
  host.innerHTML=`<div class="sc-grid">${grid}</div>
    <div class="sc-legend">적음 <span class="sc-day"></span><span class="sc-day l1"></span><span class="sc-day l2"></span><span class="sc-day l3"></span><span class="sc-day l4"></span> 많음</div>`;
  const note=document.getElementById('streakNote'); if(note) note.textContent=`🔥 현재 ${cs}일 연속 · 최근 16주 ${active}일 독서`;
}

