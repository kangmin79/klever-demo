/* ═══════════════════════════════════════════════════════════
   네비게이션
   ═══════════════════════════════════════════════════════════ */
let _navPage='ourlib';   // 현재 페이지(사이드바 라벨 재렌더용)

// ── 뒤로가기 = 앱 안 네비게이션 (SPA 히스토리 통합) ──
// 화면 전환마다 브라우저 히스토리에 발자국을 남겨서, 안드로이드 뒤로가기가
// "앱 이탈"이 아니라 "이전 화면/열린 것 닫기"로 동작하게 한다.
let _histNav=false;   // popstate로 인한 nav 재진입 가드
function _histPush(page){
  if(_histNav) return;
  const st={bs:1,page,cl:(page==='collection'?_clTab:undefined)};
  try{
    if(!history.state||!history.state.bs) history.replaceState(st,'','#'+page);
    else if(history.state.page!==page||history.state.cl!==st.cl) history.pushState(st,'','#'+page);
  }catch(e){}
}
// 8/29 뒤로가기 수리: 전면 오버레이(책 뷰어·상세·별이·프로필·인용카드)가 열릴 때 히스토리에 발자국(ov)을 하나 남긴다.
//   전엔 발자국이 없어서, 로그인 직후처럼 뒤로 갈 기록이 없는 상태에서 책을 열고 안드로이드 뒤로가기를 누르면 앱이 통째로 닫혔다.
//   × 버튼으로 닫으면 그 발자국을 되감아(history.back) 뒤로가기 한 번이 남지 않게 한다.
let _ovDepth=0, _ovClosing=false;
function _ovWatch(el, cls){
  if(!el || el._ovWatched) return; el._ovWatched=true;
  let was=el.classList.contains(cls);
  new MutationObserver(()=>{
    const now=el.classList.contains(cls); if(now===was) return; was=now;
    if(now){ try{ history.pushState({bs:1,page:_navPage,cl:(_navPage==='collection'?_clTab:undefined),ov:1},'','#'+_navPage); _ovDepth++; }catch(e){} }
    else{ try{ if(history.state&&history.state.ov&&_ovDepth>0){ _ovDepth--; _ovClosing=true; history.back(); } }catch(e){} }
  }).observe(el,{attributes:true,attributeFilter:['class']});
}
function _ovWatchAll(){
  _ovWatch(document.getElementById('qcOverlay'),'open');
  _ovWatch(document.getElementById('viewerOverlay'),'open');
  _ovWatch(document.getElementById('lcDetail'),'on');
  _ovWatch(document.getElementById('hwcPanel'),'on');
  _ovWatch(document.getElementById('bxProfileOv'),'on');   // 프로필 창은 처음 열 때 만들어진다 — 아래 body 감시가 다시 부른다
}
window.addEventListener('DOMContentLoaded',()=>{ _ovWatchAll(); try{ new MutationObserver(()=>{ if(document.getElementById('bxProfileOv')&&!document.getElementById('bxProfileOv')._ovWatched) _ovWatchAll(); }).observe(document.body,{childList:true}); }catch(e){} });
window.addEventListener('popstate', e=>{
  if(_ovClosing){ _ovClosing=false; return; }   // × 로 닫으며 우리가 되감은 발자국 — 화면 전환 아님
  // 전면 오버레이가 열려 있으면 그것부터 닫는 게 뒤로가기의 기대 동작. 발자국(ov)이 있었으면 그걸 소비하고, 없었으면(옛 경로) 현재 화면 발자국 복원
  const _repush=()=>{ if(_ovDepth>0){ _ovDepth--; return; } try{history.pushState({bs:1,page:_navPage,cl:(_navPage==='collection'?_clTab:undefined)},'','#'+_navPage);}catch(_){} };
  const qc=document.getElementById('qcOverlay');
  if(qc&&qc.classList.contains('open')){ _repush(); try{closeQuoteCard();}catch(_){} return; }   // 인용카드가 뷰어보다 위 — 먼저 닫기
  const vo=document.getElementById('viewerOverlay');
  if(vo&&vo.classList.contains('open')){ _repush(); try{closeViewer();}catch(_){} return; }
  const lc=document.getElementById('lcDetail');
  if(lc&&lc.classList.contains('on')){ _repush(); try{closeLc();}catch(_){} return; }
  const pf=document.getElementById('bxProfileOv');
  if(pf&&pf.classList.contains('on')){ _repush(); try{closeStudentProfile();}catch(_){} return; }
  const hp=document.getElementById('hwcPanel');
  if(hp&&hp.classList.contains('on')&&typeof hwcToggle==='function'){ _repush(); try{hwcToggle();}catch(_){} return; }   // 8/29: 열림 판정을 실제 클래스(.on)로 — display 검사라 영원히 false 였다
  const st=e.state;
  if(st&&st.bs){
    _histNav=true;
    try{ if(st.page==='collection'&&st.cl)_clTab=st.cl; nav(st.page||'ourlib'); }finally{ _histNav=false; }
  }
  // st.bs 없으면(우리 발자국 이전) 브라우저 기본 동작 = 사이트 이탈
});

function nav(page){
  if(page==='mylib') page='mypage';   // 8/21 사장님 요청: 내 도서관 + 내서재 합침 — 옛 링크는 내서재로
  _navPage=page;
  _histPush(page);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.gnb-item').forEach(i=>i.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  // 고전 컬렉션은 GNB에 세계고전/International 두 항목(data-cl) — 현재 권역 쪽에 밑줄
  const gnb = page==='collection'
    ? document.querySelector(`.gnb-item[data-page="collection"][data-cl="${(typeof _clTab!=='undefined'&&_clTab==='modern')?'modern':'foreign'}"]`)
    : document.querySelector(`.gnb-item[data-page="${page}"]`);
  if(gnb){ gnb.classList.add('active'); try{ gnb.scrollIntoView({block:'nearest',inline:'center'}); }catch(e){} }
  document.querySelector('.main').scrollTop = 0;

  // 홈 제외하고 좌측 사이드바 표시 — 8/14 사장님 지시: 로그인 전에는 아예 없음(본문 여백도 안 남김)
  const _navLoggedIn = !!bxStudent();
  document.body.classList.toggle('with-sidenav', page !== 'home' && _navLoggedIn);
  renderSideNav(page);
  if(page !== 'home' && _navLoggedIn) playSideNavEntrance();   // 첫 등장: 화면 중앙 → 좌측 도킹(최초 1회)

  if(page === 'ourlib') {
    setTimeout(()=>renderLibCuration(), 30);
    if(SEMYUNG_BEST_LIVE===null) loadSemyungBest();   // 세명대 대출 베스트 라이브 로드(최초 1회)
    renderMyLibStatus();   // 빌린 책·기다리는 책 — 도서관 실시간, 개인연동 학생만
  }
  if(page === 'curation') {
    setTimeout(()=>loadChalCards(), 30);
  }
  if(page === 'mychal') {
    // 자동 참여 챌린지가 독서 챌린지 탭을 안 거쳐도 들어오도록, 목록이 비어 있으면 먼저 로드
    setTimeout(async()=>{ if(!CHAL_PUB.length){ try{ await loadChalCards(); }catch(e){} } renderChalGroup(); }, 30);
  }
  if(page === 'collection') {
    setTimeout(()=>renderClassicShelves(), 30);   // 탭+책줄+탭별 사서큐레이션 일괄 렌더
  }
  if(page === 'international') {
    setTimeout(()=>renderAreaCuration('intlCuration','International'), 30);
  }
  if(page === 'mypage') {
    setTimeout(()=>{ renderMyLibStatus(); renderActivityGroup(); renderChalGroup(); renderMyProfileTop(); renderMyHero(); renderReadingRhythm(); renderChalScore(); renderMyShelf(); renderMyWritings(); renderMyImpressions(); renderBadges(); renderMyBooks(); renderMyReviews(); renderSummaryCard(); renderSuperlatives(); renderStreakCal(); renderReadChart(); }, 50);
  }
  if(page === 'search') {
    setTimeout(()=>{ const i=document.getElementById('usSearchInput'); if(i) i.focus(); }, 50);
    if(SEMYUNG_BEST_LIVE===null) loadSemyungBest();   // 검색 직행 시에도 도서관 라이브 풀 로드(기존엔 ourlib 진입 시에만)
  }
  if(page === 'feed') {
    _feedItems=[];   // 방문할 때마다 최신 글 다시 로드
    setTimeout(renderFeed, 30);
  }
  if(page === 'dashboard') {
    setTimeout(renderDashboard, 30);
  }
}

/* ── 사서가 만든 챌린지 카드 (독서 챌린지 페이지 · library_programs) ── */
let CHAL_PUB=[];
function ddayText(to){ if(!to) return ''; const end=new Date(to+'T23:59:59'); const now=new Date();
  const d=Math.ceil((end-now)/86400000); if(isNaN(d)) return ''; return d<0?'종료':d===0?'D-day':'D-'+d; }
// 사서가 챌린지 발행 시 표지 URL을 빠뜨려도, 책 id가 gb-*면 표지 파일에서 자동 보강
// 표지는 앱과 같은 저장소에 실려 다닌다 — 절대주소로 박으면 도메인이 바뀌는 순간 747장이 통째로 깨진다.
// (8/13 semyung.bookstar.co.kr 분리 준비: bookstar.co.kr 하드코딩 → 상대경로)
function _gbCover(b){ if(b&&b.cover) return b.cover; const id=(b&&b.id)||''; return /^gb-/.test(id)?('/covers/'+id+'.webp'):''; }
// 발행 프로그램(library_programs 진행중) 60초 공유 캐시 — 우리도서관/챌린지 탭이 같은 쿼리를 각자 재fetch하던 것 통합
let _progCache=null, _progCacheTs=0, _progCacheP=null;
async function fetchProgramsCached(){
  if(_progCache && Date.now()-_progCacheTs<60000) return _progCache;
  if(_progCacheP) return _progCacheP;
  _progCacheP=(async()=>{
    try{
      const r=await sbGetAnon(`/library_programs?select=*&status=neq.${encodeURIComponent('종료')}&order=sort_order.asc.nullslast,created_at.desc`);   // 8/29: 사서가 관리자에서 정한 순서(sort_order)대로
      if(r.ok){ const rows=await r.json(); if(Array.isArray(rows)){
        // status 컬럼은 관리자 저장 시점의 스냅샷이라 시작일이 와도 '예정'에 머문다(자동 갱신 없음).
        // 날짜가 유일한 진실 — 오늘이 기간 안인 것만 노출(시작일에 자동 등장, 종료일 지나면 자동 퇴장).
        // toISOString()은 UTC라 저녁에 하루 밀린다 — 로컬 날짜로 조립(신호등 UTC 사고와 동일 계열).
        const d=new Date(), t=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        _progCache=rows.filter(x=>(!x.start_date||x.start_date<=t)&&(!x.end_date||t<=x.end_date));
        _progCacheTs=Date.now(); } }
    }catch(e){}
    finally{ _progCacheP=null; }
    return _progCache;
  })();
  return _progCacheP;
}
// 8/29 독서 챌린지 안내 카드 — 사서가 관리자 '독서 챌린지'에서 만든 글 전용 칸(library_sections area='독서챌린지')
let CHAL_NOTICES=[];
async function loadChalNotices(){
  try{ CHAL_NOTICES=(await loadAreaSections('독서챌린지')).filter(s=>s.style==='notice'); }
  catch(e){ CHAL_NOTICES=[]; }
}
async function loadChalCards(){
  // 8/31: 챌린지 미리보기는 부모(관리자)가 보낸 편집 중 내용만 그린다 — 서버 발행본이 덮어쓰면 저장 전 모습이 안 보인다.
  //   (PREVIEW/PV_T는 아래쪽에서 선언돼 아직 못 읽을 수 있어 주소에서 직접 본다)
  try{ const q=new URLSearchParams(location.search);
    if(q.get('preview')==='1' && (q.get('area')||'')==='독서챌린지') return; }catch(e){}
  renderChalCards();
  try{ await loadChalNotices(); renderChalCards(); }catch(e){}   // 안내는 챌린지보다 먼저 떠도 된다(챌린지 조회를 기다리지 않음)
  try{
    const rows=await fetchProgramsCached(); if(!Array.isArray(rows)) return;
    CHAL_PUB=rows.filter(x=>(x.type||'').includes('챌린지')).map(x=>({
      id:x.id,type:x.type,title:x.title,intro:x.intro||'',from:x.start_date||'',to:x.end_date||'',featured:!!x.featured,
      style:x.style||'row',
      mission:x.mission||null,books:(x.books||[]).map(b=>Object.assign({id:b.id||'',t:b.title,a:b.author||'',cover:_gbCover(b),isbn:b.isbn,
        tags:(!b.isbn&&/^(gb|kr)-/.test(b.id||''))?['cls']:undefined},_keepForm(b)))}));
    await chalResolveFormats();
    const _fi=CHAL_PUB.findIndex(c=>c.featured); if(_fi>0) CHAL_PUB.unshift(CHAL_PUB.splice(_fi,1)[0]);   // 사서가 지정한 '이달의 챌린지'(featured)를 맨 앞으로 → 히어로. 미지정이면 최신순 그대로
    try{ chalAutoJoinAll(); }catch(e){}   // 8/21: '신청 없이 자동 참여' 챌린지는 여기서 조용히 참여
    renderChalCards();
  }catch(e){}
}
// 챌린지 책 판형(8/21): 관리자가 담은 책이 맨 ISBN13이면 판형 정보가 없다 → 장서(semyung_tulip)에서 isbn→kind 를 한 번에 조회해 tags 로.
//   'sm-' ISBN은 fmtTags 의 기존 폴백(sm-CATTOT=종이책 / 그 외 sm-=전자책)이 처리하고, 고전(gb-/kr-)은 위에서 'cls'.
//   같은 ISBN이 종이책·전자책 둘 다 있으면 둘 다 붙는다. 장서에 없으면(신청만 받은 책) 태그 없음 — 추측해서 붙이지 않는다.
// 관리자가 저장한 소장 표식(tags·_pp·lib·_sm…)을 앱 책 객체로 옮긴다 — 8/22: 이걸 버려서 소장 책 71권이 "우리 도서관에서 찾기"(외부책)로 보였다
const _FORM_KEYS=['tags','_pp','lib','_sm','paperStatus','crema','cremaUrl'];
function _keepForm(b){ const o={}; if(b) for(const k of _FORM_KEYS) if(b[k]!==undefined) o[k]=b[k]; return o; }
// 챌린지 책 소장 표식 안전망(8/22 확장): 맨 ISBN인데 표식이 없으면 장서에서 종이(ctrl→CATTOT)·전자책(viewer_url) 링크까지 채운다.
//   장서에 없으면 그 책은 챌린지 카드에서 뺀다(미소장은 선반에 못 올린다 — 관리자 저장 관문 fillHeld와 같은 규칙, 옛 데이터 대비 2중 방어)
async function chalResolveFormats(){
  const want=new Set();
  CHAL_PUB.forEach(c=>(c.books||[]).forEach(b=>{ if((!b.tags||(!b._pp&&!b.lib)) && /^\d{10,13}$/.test(String(b.isbn||''))) want.add(String(b.isbn)); }));
  if(!want.size) return;
  const byIsbn={};
  const arr=[...want];
  for(let i=0;i<arr.length;i+=100){
    try{
      const r=await sbGet(`/semyung_tulip?select=isbn,kind,ctrl,viewer_url&isbn=in.(${arr.slice(i,i+100).map(x=>'"'+x+'"').join(',')})&limit=400`);
      if(!r.ok) continue;
      for(const row of await r.json()){ (byIsbn[row.isbn]=byIsbn[row.isbn]||[]).push(row); }
    }catch(e){}
  }
  CHAL_PUB.forEach(c=>{
    const keep=[];
    (c.books||[]).forEach(b=>{
      const isbn=String(b.isbn||''); if(!want.has(isbn)){ keep.push(b); return; }
      const hits=byIsbn[isbn]||[];
      if(!hits.length){ if(!b._pp&&!b.lib){ console.warn('[챌린지] 세명대 미소장 책 숨김:', b.t, isbn); return; } keep.push(b); return; }
      const tags=new Set(b.tags||[]);
      for(const h of hits){ if(h.kind==='paper'&&h.ctrl){ b._pp=b._pp||('https://lib.semyung.ac.kr/search/detail/CATTOT'+h.ctrl); tags.add('paper'); } if(h.kind==='ebook'&&h.viewer_url){ b.lib=b.lib||h.viewer_url; b._sm=true; tags.add('ebook'); } }
      if(tags.size) b.tags=[...tags];
      keep.push(b);
    });
    c.books=keep;
  });
}
/* ── 챌린지 미션 정의 (admin CH_MISSIONS 미러) — 8/29 별 포인트 폐지(배점 없음) ── */
const CH_MISSIONS=[
  {k:'quiz',     t:'퀴즈 풀기',     icon:'🎯', kind:'quiz'},
  {k:'oneline',  t:'한 줄 소감',    icon:'✍️', kind:'write', min:5,   ph:'책을 읽고 느낀 점을 한 줄로 남겨 보세요.'},
  {k:'question', t:'한 줄 질문',    icon:'❓', kind:'write', min:5,   ph:'책에 대해 떠오른 질문을 적어 보세요.'},
  {k:'review',   t:'서평 쓰기',     icon:'📝', kind:'write', min:300, ph:'책에 대한 평을 300자 이상으로 적어 보세요. (주제·인상 깊은 장면·추천 이유 등)'},
  {k:'essay',    t:'독후감 쓰기',   icon:'📜', kind:'write', min:800, ph:'읽고 난 내 생각을 800자 이상으로 적어 보세요. (마음에 남은 대목·그때 든 생각·내 경험과의 연결)'},   // 8/21 사장님 요청
];
/* Ver10 2종 체제(2026-07-04) + 레거시 5종 명칭(옛 발행 챌린지 호환) */
const CH_QMAP={'작품 이해':'01','인문 성찰':'02','고전 이해':'01','작가 의도':'02','인문학':'03','나의 삶':'04','사회(관계)':'05'};
const CH_SCHOOL='hankuk';
// 미션 객체 정규화(구버전 review→oneline / question 호환, 고전챌린지 quiz 강제)
function appChalMission(c){
  const m=(c&&c.mission)||{};
  const o={reward:'draw',   // 8/29 별 포인트 폐지 — 시상은 추첨형만
    quiz:(c&&c.type==='고전챌린지')?true:!!m.quiz, quizN:10,   /* 퀴즈 문항 수 = 10개 고정 */
    quizType:m.quizType||'', quizLevel:m.quizLevel||'', autoJoin:!!m.autoJoin};   // autoJoin(8/21): 신청 없이 자동 참여
  CH_MISSIONS.forEach(x=>{ if(x.k==='quiz')return;
    o[x.k]=(m[x.k]!==undefined)?!!m[x.k]:(x.k==='oneline'?!!m.review:(x.k==='question'?!!m.question:false)); });
  return o;
}
function chalActiveMissions(m){ if(!m) return []; return CH_MISSIONS.filter(x=> !x.soon && (x.k==='quiz'?m.quiz:m[x.k])); }
function chalMissionPlain(m){ if(!m) return '-'; const mm=(m.reward!==undefined)?m:appChalMission({mission:m});
  const o=chalActiveMissions(mm).map(x=> x.k==='quiz'?'퀴즈 10문항':x.t);
  return o.join(' · ')||'-'; }
// 현재 책이 속한(참여 중) 챌린지 찾기 (id 우선, 없으면 isbn·제목 폴백)
function _chalTitleKey(t){ return String(t||'').replace(/\s+/g,'').toLowerCase(); }
function chalForBook(book){
  const b = (typeof book==='object'&&book) ? book : (typeof BOOKS!=='undefined'&&BOOKS.find(x=>x.id===book)) || {id:book};
  if(!b||(!b.id&&!b.isbn&&!b.title)) return null;
  const tk=_chalTitleKey(b.title);
  try{ for(const c of joinedChals()){
    if((c.books||[]).some(x=>
      (b.id && String(x.id)===String(b.id)) ||
      (b.isbn && x.isbn && String(x.isbn)===String(b.isbn)) ||
      (tk && _chalTitleKey(x.t||x.title)===tk)
    )) return c;
  } }catch(e){}
  return null; }
// 날짜 → "6/12" (월/일)
function fmtMD(d){ if(!d) return ''; const p=String(d).split('-'); return p.length>=3?(+p[1])+'/'+(+p[2]):''; }
// 챌린지 부제 텍스트(권수 · 미션 · 기간) — D-day 제외(플레인)
function chalSub(c){
  const m=chalMissionPlain(c.mission);
  const period=[fmtMD(c.from),fmtMD(c.to)].filter(Boolean).join(' ~ ');
  const parts=[(c.books||[]).length+'권'];
  if(m&&m!=='-') parts.push(m);
  if(period) parts.push(period);
  return parts.join(' · ');
}
// 부제 HTML(D-day를 포인트 컬러 span으로) — esc 하지 말고 그대로 삽입(내용 통제됨)
function chalSubHTML(c){
  const dd=ddayText(c.to);
  return esc(chalSub(c)) + (dd?' · <span class="chal-dday">'+esc(dd)+'</span>':'');
}
// 이미 참여한 챌린지인지
function chalIsJoined(c){ try{ return joinedChals().some(x=>String(x.id)===String(c.id)); }catch(e){ return false; } }
// 참여/진행 버튼(참여 전: 참여하기 → / 참여 후: 진행 중 → 내서재로)
function chalJoinBtn(c,cls){
  const j=chalIsJoined(c), id=esc(String(c.id));
  // 8/21 사장님 요청: '신청 없이 자동 참여' 챌린지는 참여하기 버튼 없이 '자동 참여'로 표시(누르면 마이 챌린지)
  if(chalIsAuto(c)) return `<button class="${cls} joined" onclick="nav('mychal')">자동 참여 · 진행 중 →</button>`;
  return j
    ? `<button class="${cls} joined" onclick="nav('mychal')">진행 중 →</button>`
    : `<button class="${cls}" onclick="chalJoin('${id}')">참여하기 →</button>`;
}
function chalIsAuto(c){ return !!(c&&c.mission&&c.mission.autoJoin); }
// 자동 참여 챌린지: 로그인 학생이 독서 챌린지 목록을 볼 때 조용히 참여 처리(알림·이동 없음)
function chalAutoJoinAll(){
  if(!bxStudent()) return false;
  let changed=false;
  (CHAL_PUB||[]).forEach(c=>{ if(chalIsAuto(c)&&!chalIsJoined(c)){ chalJoin(String(c.id),{silent:true}); changed=true; } });
  return changed;
}
// alert() 대체 — 브라우저 주소("semyung.bookstar.co.kr 내용:")가 붙지 않는 앱 안 알림창(8/21)
function bsNotice(title, lines, onOk){
  const body=(lines||[]).map(l=>`<div style="font-size:13.5px;color:var(--text-sub);line-height:1.6">${l}</div>`).join('');
  _bmModal(`<h3>${title}</h3><div style="margin:10px 0 4px">${body}</div><div class="bm-mact"><button class="bm-btn fill" id="bsNoticeOk">확인</button></div>`);
  const b=document.getElementById('bsNoticeOk'); if(b) b.onclick=()=>{ bmCloseModal(); if(onOk) onOk(); };
}
// 히어로(우리 도서관 shelf-hero 재사용) — 대표 챌린지 1개를 크게
function chalHero(c){
  const b=(c.books||[])[0]||{t:c.title};
  const face=b.cover
    ? `<div class="book-cover has-img"><img src="${esc(hiCover(b.cover))}" alt="" decoding="async" data-t="${esc(cleanT(b.t||c.title||''))}" data-a="${esc(String(b.a||''))}" onerror="ncSwap(this)"></div>`
    : `<div class="book-cover">${ncCover(b.t?b:{t:c.title})}</div>`;
  const m=chalMissionPlain(c.mission);
  const join=(chalIsJoined(c)||chalIsAuto(c))?`nav('mychal')`:`chalJoin('${esc(String(c.id))}')`;
  return `<div class="shelf-hero"><div class="sh-grid">
    <div class="sh-left">
      <div class="sh-kicker">✦ 이달의 챌린지</div>
      <div class="sh-title">${esc(c.title)}</div>
      <div class="sh-sub">${chalSubHTML(c)}</div>
      <div class="sh-quote">“${esc(c.intro||'사서가 운영하는 독서 챌린지예요.')}”<span> — 우리 학교 사서</span></div>
      ${m&&m!=='-'?`<div class="sh-meta"><span>${esc(m)}</span></div>`:''}
      ${chalJoinBtn(c,'sh-btn')}
    </div>
    <div class="sh-stage">
      <div class="sh-side">독서 챌린지</div>
      <div class="sh-shadow"></div>
      <div class="book3d" onclick="${join}">${face}</div>
      <div class="shelf"></div>
    </div>
  </div></div>`;
}
// 종류 배지(고전 컬렉션 / 소장자료)
function chalTypeBadge(c){
  const isC=c.type==='고전챌린지';
  return `<span class="chal-type${isC?' classic':''}">${isC?'고전 컬렉션':'소장자료'}</span>`;
}
// 챌린지 행 헤더(좌: 종류·제목·부제 / 우: 참여하기)
function chalRowHead(c){
  // 8/31: chal-head 는 "이건 진짜 챌린지 제목줄" 표시 — 스타일 렌더러가 만드는 빈 제목줄만 CSS로 감추기 위해 구분한다
  return `<div class="ml-head chal-head"><div>`
    + `<div style="margin-bottom:7px">${chalTypeBadge(c)}</div>`
    + `<div class="ml-h-t">${esc(c.title)}</div><div class="ml-h-s">${chalSubHTML(c)}</div></div>`
    + chalJoinBtn(c,'chal-join') + `</div>`;
}
// 캐러셀용 책 카드(우리 도서관 ml-bk 재사용)
function chalBookCard(b,c){
  const click=b.isbn?`libDetail('${esc(b.isbn)}')`:`chalJoin('${esc(String(c.id))}')`;
  // 8/21 사용자 지적: 챌린지 책에만 종이책·전자책 태그가 없었다 — 다른 선반(mlRow)과 같이 저자 줄 + fmtTags. 맨 ISBN13 책은 loadChalCards가 장서를 조회해 tags를 채운다
  return `<div class="ml-bk" onclick="${click}">${mlcv('ml-bk-cv',b)}<div class="ml-bk-t">${esc(cleanT(b.t||''))}</div>${b.a?`<div class="ml-bk-a">${esc(b.a)}</div>`:''}${fmtTags(b)}</div>`;
}
/* 8/30: 챌린지 담긴 책을 사서가 고른 스타일로. 큐레이션과 같은 렌더러를 그대로 쓰되
   제목줄(mlHead)은 chalRowHead가 이미 그리므로 빈 값으로 넘기고 CSS(.cl-shelf .ml-head:not(.chal-head))로 감춘다. */
function chalStyleBody(st, books, c){
  const plain=()=>mlCarousel(`<div class="ml-hrow">${books.map(b=>chalBookCard(b,c)).join('')}</div>`);
  const F={ grid:mlGrid, mag:mlMag, grad:mlGrad, ai:mlAI, banner:mlBanner, new:mlNew, quote:mlQuote, swipe:mlSwipe, coll:mlColl };
  const f=F[st];
  if(!f) return plain();
  // 어떤 스타일이 이 책들과 안 맞아 실패해도 칸이 통째로 비지 않게 — 기본 모양으로 되돌린다
  try{ const h=f('', '', books); return h||plain(); }catch(e){ return plain(); }
}
function renderChalCards(){
  const g=document.getElementById('chalLive'); if(!g) return;
  // 8/29 안내 카드 — 사서가 순서 바꾸기에서 정한 자리(chal_pos = 앞에 오는 챌린지 수)에 끼워 넣는다. 없으면 맨 위. 챌린지가 아직 없어도 안내는 보인다.
  //   자리의 기준 = 화면 순서(이달의 챌린지가 맨 위) — 관리자 순서 바꾸기 창과 같은 기준.
  // 히어로는 사서가 '이달의 챌린지'(featured)로 지정한 경우에만 노출. 자동 생성 안 함(=중복/자동 히어로 방지).
  const heroC=CHAL_PUB.find(c=>c.featured)||null;
  const listC=heroC?CHAL_PUB.filter(c=>c!==heroC):CHAL_PUB;   // 히어로로 뜬 챌린지는 아래 목록에서 제외(중복 방지)
  const D=heroC?[heroC,...listC]:listC;
  const ntBefore={}; let ntTail='';
  (CHAL_NOTICES||[]).forEach(s=>{ const n=D.length; const p=Math.min(Math.max(s.chal_pos==null?0:+s.chal_pos,0),n);
    if(p>=n) ntTail+=mlNotice(s.title,s.subtitle); else { const k=String(D[p].id); ntBefore[k]=(ntBefore[k]||'')+mlNotice(s.title,s.subtitle); } });
  const ntFor=c=>ntBefore[String(c.id)]||'';
  if(!CHAL_PUB.length){
    g.innerHTML=`<div class="ml">${ntTail}<div class="chal-empty">진행 중인 챌린지가 아직 없어요.<br>사서가 챌린지를 발행하면 여기에 나타납니다.</div></div>`; return; }
  // 8/31: 자리 0 안내는 '진행 중인 챌린지' 머리글보다 **위**에 와야 한다.
  //   사서가 맨 앞에 둔 인사말인데 머리글을 먼저 찍는 바람에 그 아래로 밀려 있었다.
  //   '이달의 챌린지'가 있을 땐 그 앞에 붙어 안 보이던 문제 — 이달의 챌린지가 없어지자 드러났다.
  let out=heroC?(ntFor(heroC)+chalHero(heroC)):(listC.length?ntFor(listC[0]):'');
  out+=`<div><div class="chal-live-head">진행 중인 챌린지 <span class="chal-live-tag">우리 학교 사서 운영</span></div>`
    + listC.map((c,idx)=>{
        const books=(c.books||[]);
        // 8/30 사장님 요청: 사서가 고른 스타일대로. 기본(row)은 지금까지의 챌린지 전용 카드를 그대로 쓴다
        const row=books.length
          ? ((c.style||'row')==='row'
              ? mlCarousel(`<div class="ml-hrow">${books.map(b=>chalBookCard(b,c)).join('')}</div>`)
              : chalStyleBody(c.style, books, c))
          : '';
        const desc=c.intro?`<div class="chal-row-desc">${esc(c.intro)}</div>`:'';
        const nt=(!heroC&&idx===0)?'':ntFor(c);   // 위로 올린 자리 0 안내를 여기서 또 찍지 않게
        return nt+`<div class="cl-shelf" data-origin="challenge" data-origin-id="${esc(String(c.id))}">${chalRowHead(c)}${desc}${row}</div>`;
      }).join('')
    + ntTail + `</div>`;
  g.innerHTML=`<div class="ml">${out}</div>`;
  try{ bindDragScroll('#chalLive .ml-hrow'); }catch(e){}
}
// 참여 목록 키를 계정별로 분리 (기존: 전역 키 → 계정 전환 시 참여 상태 혼입. 퀴즈기록 _chalKey와 동일 패턴)
function _joinedKey(){ return 'bookstar-joined-chals-' + _bxSid(); }
function joinedChals(){            // 참여 중인 챌린지 배열 (구버전 전역키/단일키 자동 이전)
  try{
    const arr = JSON.parse(localStorage.getItem(_joinedKey())||'null');
    if(Array.isArray(arr)) return arr;
    // 구 전역 키 → 현재 계정 키로 1회 이전(전역 키는 남겨두지 않음 — 다음 계정에 재이전 방지)
    const g = JSON.parse(localStorage.getItem('bookstar-joined-chals')||'null');
    if(Array.isArray(g)){ localStorage.setItem(_joinedKey(), JSON.stringify(g)); localStorage.removeItem('bookstar-joined-chals'); return g; }
    const old = JSON.parse(localStorage.getItem('bookstar-joined-chal')||'null');
    if(old){ const a=[old]; localStorage.setItem(_joinedKey(), JSON.stringify(a)); return a; }
  }catch(e){}
  return [];
}
function _saveJoinedChals(a){ try{ localStorage.setItem(_joinedKey(), JSON.stringify(a)); }catch(e){} }
function chalJoin(id,opt){
  opt=opt||{};
  const c=CHAL_PUB.find(x=>String(x.id)===String(id)); if(!c) return;
  const arr=joinedChals();
  if(arr.some(x=>String(x.id)===String(c.id))){
    if(opt.silent) return;
    bsNotice('이미 참여 중인 챌린지예요',['마이 챌린지에서 진행하세요.'],()=>nav('mychal')); return;
  }
  arr.push({ id:c.id, type:c.type||'', title:c.title, to:c.to||'', mission:c.mission||null,
    books:(c.books||[]).map(b=>({id:b.id||'', t:b.t, cover:b.cover||'', isbn:b.isbn||''})), joinedAt:Date.now() });
  _saveJoinedChals(arr);
  // 서버 참여 기록(로그인 시) — 관리자 대시보드 '참여' 집계. 완주(done)는 덮지 않음. (8/29 별 포인트 폐지 — 참가 별 지급 삭제)
  const _stu=bxStudent();
  if(_stu){
    sbWrite('POST',`/bookstar_challenge_enroll?on_conflict=student_id,challenge_id`,
      {student_id:_stu.id, challenge_id:String(c.id), status:'joined'},
      {prefer:'resolution=ignore-duplicates,return=minimal'}).catch(()=>{});
  }
  if(opt.silent) return;
  // 8/21 사장님 요청: 브라우저 alert(주소 표기) 제거 · "여러 챌린지를 동시에…" 문구 삭제
  bsNotice(`‘${esc(c.title)}’ 챌린지 참여 완료!`,
    [`· 담긴 책 ${(c.books||[]).length}권이 마이 챌린지에 들어갔어요.`, `· 미션: ${esc(chalMissionPlain(c.mission))}`],
    ()=>nav('mychal'));
}
function chalQuit(cid){
  const arr=joinedChals(); const c=arr.find(x=>String(x.id)===String(cid)); if(!c) return;
  if(!confirm(`‘${c.title}’ 참여를 그만둘까요?\n(책별 퀴즈·소감 기록은 지워지지 않아요)`)) return;
  _saveJoinedChals(arr.filter(x=>String(x.id)!==String(cid)));
  renderQuestMap();
}

let LC_PUB=[];
let LC_SEL={};  // ci → 펼친 책으로 보여줄 책 인덱스(기본 0)
const COVER_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/cover";
const INFO_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/bookinfo";
const SMBEST_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-best";
const SMHOLD_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-holding";
// 종이책 모달: 라이브 소장/대출가능 현황 (semyung-holding Edge Fn, reckey=CATTOT...)
async function loadHolding(reckey, elId){
  const el=document.getElementById(elId||'lcdHolding'); if(!el) return;
  const pw = el.classList.contains('pw-hold')?' pw-hold':'';   // 펼침 박스면 여백 클래스 유지
  try{
    const r=await fetch(SMHOLD_FN+'?reckey='+encodeURIComponent(reckey),{headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    const d=await r.json();
    if(!d||!d.ok||!d.total){ el.style.display='none'; return; }
    const avail=d.available>0;
    const c=(d.copies||[]).find(x=>x.status==='대출가능')||(d.copies||[])[0]||{};
    const loc=esc(c.location||''), call=esc(c.callNum||'');
    let backDate='';
    if(!avail){ const ds=(d.copies||[]).map(x=>x.returnDate).filter(Boolean).sort(); backDate=ds[0]||''; }
    const where=(loc||call)?`<div class="lh-where">${loc?`<b>위치</b> ${loc}`:''}${call?`${loc?' · ':''}<b>청구기호</b> ${call}`:''}</div>`:'';
    // 대출가능=찾아줘북즈(서가 픽업, 예약은 도서관 정책상 불가) / 전권 대출중=예약(반납되면 문자 안내) — 둘 다 북스타 안에서
    const resv=avail
      ? `<div class="lh-resv" id="lhResv" onclick="smConfirm('${esc(reckey)}')">찾아줘북즈 신청하기 · 서가에서 찾아 2층 안내데스크에 보관해 드려요</div>`
      : `<div class="lh-resv" id="lhResv" onclick="smHoldConfirm('${esc(reckey)}')">예약하기 · 반납되면 문자로 알려드리고 2층 안내데스크에 보관해 드려요</div>`;
    el.className='lcd-holding '+(avail?'ok':'out')+pw;
    // 표기 통일(8/14 사장님): 어디서든 '지금 대출 가능 · n/m권' 한 방식 — 1권짜리도 1/1권으로 동일하게
    el.innerHTML = (avail
      ? `<div class="lh-line"><span class="lh-dot ok"></span><b>지금 대출 가능</b> · ${d.available}/${d.total}권</div>`
      : `<div class="lh-line"><span class="lh-dot out"></span><b>대출 중</b> · 0/${d.total}권${backDate?` · 반납예정 ${esc(backDate)}`:''}</div>`) + where + resv;
    markMyHolding(reckey, d);   // 내가 이미 신청·예약한 책이면 버튼을 '취소하기' 상태로 교체
  }catch(e){
    // 조회 실패 시에만 최소 폴백(막다른 길 방지) — 도서관 상세로 직접 확인
    el.className='lcd-holding out'+pw;
    el.innerHTML='<div class="lh-line"><span class="lh-dot out"></span>소장 정보를 잠시 불러오지 못했어요</div>'
      +'<div class="lh-where"><a href="https://lib.semyung.ac.kr/search/detail/'+esc(reckey)+'" target="_blank" rel="noopener" style="color:var(--accent,#6366f1);text-decoration:underline;font-weight:600">도서관에서 직접 확인하기</a></div>';
  }
}
// ── 내가 기다리는 책(찾아줘북즈+예약) 캐시 — 소장 박스가 '이미 신청한 책'을 알아보게 한다 ──
// 8/14 사장님 리포트 "신청 후에 취소가 안 되는 것 같아"의 수리: 신청 직후 그 화면에서만 취소가 보이고,
// 모달을 닫으면 취소로 가는 길이 사라졌다. 이제 소장 박스가 매번 내 신청 여부를 확인해 취소 버튼을 상시 노출.
let _myWaitCache=null, _myWaitTs=0;
async function myWaiting(force){
  if(!ssoIsPersonal()) return {picks:[],resv:[]};
  const now=Date.now();
  if(!force && _myWaitCache && now-_myWaitTs<30000) return _myWaitCache;
  const [pk,rv]=await Promise.all([smMy('pickups'),smMy('reservations')]);
  // 찾아줘북즈 이력은 취소·수령 건도 남는다 — 수령일/취소일이 비어 있는 것만 진행 중(8/9 실측)
  const ended=x=>String(x.loan_date||'').trim()!==''||String(x.cancel_date||'').trim()!=='';
  _myWaitCache={picks:smItems(pk).filter(x=>!ended(x)), resv:smItems(rv)}; _myWaitTs=now;
  return _myWaitCache;
}
async function markMyHolding(reckey, d){
  try{
    if(!ssoIsPersonal()) return;
    const ctrl=String(reckey).replace(/\D/g,'');
    const w=await myWaiting();
    const btn=document.getElementById('lhResv'); if(!btn||!btn.isConnected) return;
    // ⚠️ 응답의 제어번호 필드는 ctrl_no (8/14 실측 — control_no가 아님)
    const pk=(w.picks||[]).find(x=>String(x.ctrl_no||x.control_no||'').replace(/\D/g,'')===ctrl);
    if(pk){
      const cancellable=String(pk.loan_status||'')==='0001';   // 취소는 신청 단계에서만 — 직원 처리 시작 후엔 API가 안 받는다
      btn.removeAttribute('onclick'); btn.className=btn.className.replace(/\bbusy\b/,'')+' done'; delete btn.dataset.busy;
      btn.innerHTML='이미 찾아줘북즈를 신청한 책이에요 · '+esc(pk.loan_status_name||'신청 접수')
        +(cancellable
          ? '<br><span class="lh-cancel" onclick="smCancel(\''+esc(reckey)+'\',\'\',\''+esc(pk.request_no||'')+'\')">신청 취소하기</span>'
          : '<br><span style="font-weight:600">도서관이 처리 중이에요 — 취소는 2층 안내데스크에 말씀해 주세요</span>');
      return;
    }
    const mains=new Set((d&&d.copies||[]).map(x=>String(x.mainNo||'')).filter(Boolean));
    const rv=(w.resv||[]).find(x=>mains.has(String(x.main_no||'')));
    if(rv){
      btn.removeAttribute('onclick'); btn.className=btn.className.replace(/\bbusy\b/,'')+' done'; delete btn.dataset.busy;
      btn.innerHTML='이미 예약한 책이에요 · 반납되면 문자로 알려드려요'
        +'<br><span class="lh-cancel" onclick="smUnhold(\''+esc(reckey)+'\',\''+esc(rv.main_no||'')+'\')">예약 취소하기</span>';
    }
  }catch(e){}
}
// 제어번호 없는 종이책(검색·큐레이션 경로) → 소장목록에서 ctrl을 찾아 표준 소장 박스로 승격(표현 통일, 8/14)
// ⚠️ 제목만 맞추면 딴 책이 잡힌다(8/6 실측 10%) — ISBN 정확 일치 우선, 제목 폴백은 저자까지 맞아야 채택.
async function tulipPaperKey(isbn, title, author){
  try{
    const clean=String(isbn||'').replace(/^sm-/,'').replace(/[^0-9Xx]/g,'');
    if(clean.length>=10){
      const r=await sbGetAnon('/semyung_tulip?select=ctrl&kind=eq.paper&isbn=eq.'+clean+'&limit=1');
      if(r.ok){ const rows=await r.json(); if(rows&&rows[0]&&rows[0].ctrl) return 'CATTOT'+String(rows[0].ctrl); }
    }
    const t=cleanT(title||'').slice(0,12), au=String(author||'').trim();
    if(!t||!au) return '';
    const r2=await sbGetAnon('/semyung_tulip?select=ctrl,title,author&kind=eq.paper&limit=5&title=ilike.'+encodeURIComponent(t+'*'));
    if(!r2.ok) return '';
    const rows=await r2.json();
    const key=cleanT(title||'').replace(/\s+/g,'');
    const hit=(Array.isArray(rows)?rows:[]).find(x=>x.ctrl
      && cleanT(x.title||'').replace(/\s+/g,'').indexOf(key)===0
      && String(x.author||'').indexOf(au.slice(0,2))>=0);
    return hit?('CATTOT'+String(hit.ctrl)):'';
  }catch(e){ return ''; }
}
// 전자책+종이책 책: '종이책 대출' 줄을 탭하면 같은 소장정보(위치/청구기호/대출가능/예약)를 그 자리에서 펼침
function togglePaperHold(reckey, row){
  const box=row.nextElementSibling; if(!box) return;
  const closed = box.style.display==='none';
  if(closed){
    box.style.display=''; row.classList.add('pw-open');
    if(!box.dataset.loaded){ box.dataset.loaded='1'; box.className='lcd-holding pw-hold loading'; box.textContent='우리 도서관 소장 현황을 확인하고 있어요…'; loadHolding(reckey, box.id); }
  } else {
    box.style.display='none'; row.classList.remove('pw-open');
  }
}
// 찾아줘북즈 예약 — 서버(semyung-reserve)가 도서관장 계정으로 로그인·신청까지 북스타 안에서 완결
const SMRESV_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-reserve";
// ── 미연동 이용자 예약 차단 → 도서관 로그인 안내 (8/9 계약 전 잠금) ──────────
// 예약은 사서가 실물을 움직이는 실세계 작업이라 학생 본인 이름으로만 받는다.
// (예전엔 공유계정 폴백으로 로그인 없이도 신청됐음 — 서버 semyung-reserve도 같이 잠갔다)
// 연계값은 도서관 홈페이지 배너를 통해서만 넘어오므로 흐름은 [세명대 로그인 → 배너 → 복귀].
const SEMYUNG_LOGIN_URL='https://setopia.semyung.ac.kr/main/index_lib_smate.jsp';
// mode: 'reserve'(기본, 종이책 예약) | 'read'(전자책 대출) — 마지막 줄만 상황에 맞게 바뀐다
function smLoginGuide(mode){
  // 8/14 사장님 수정요청: 로그인하고 돌아왔을 때 보던 책이 다시 열리게 — 열려 있던 상세 모달의 책을 기억해 둔다
  // (classic 게이트에서 온 호출은 제외 — 고전 복귀 기억(bx_sso_return_classic)이 따로 있고, 둘 다 저장되면 이중으로 열린다)
  try{
    const lcOn=document.getElementById('lcDetail')?.classList.contains('on');
    if(mode!=='classic' && lcOn && window._lcCurBook && window._lcCurBook.isbn)
      localStorage.setItem('bx_sso_return_book', JSON.stringify(Object.assign({_ts:Date.now()}, window._lcCurBook)));
  }catch(e){}
  const read = mode==='read';
  const classic = mode==='classic';   // 8/14: 고전 읽기 게이트 — 대출이 아니라 '구성원 확인' 성격의 문구
  const review = mode==='review';     // 8/14: 서평도 본인 이름으로만
  // ⛔ "내 이름으로·본인 명의" 계열 문구 금지(8/23 사용자) — 학생에겐 당연한 사실이라
  //    정보가 안 되고 개인정보가 나가는 느낌만 준다. 쓸모 있는 조건(권수 등)만 남긴다.
  const sub = classic
    ? '북스타 고전은 <b>세명대 구성원 전용</b>이에요. 세명대 계정으로 로그인하면 바로 읽을 수 있어요.'
    : read
    ? '세명대 계정으로 로그인하면 전자책을 <b>5권까지</b> 빌릴 수 있어요.'
    : review
    ? '세명대 계정으로 로그인하면 서평을 바로 쓸 수 있어요.'
    : '세명대 계정으로 로그인하면 예약을 바로 할 수 있어요.';
  const last = classic ? '돌아오면 <b>보던 책이 바로</b> 열려요' : read ? '돌아와서 누르면 <b>바로 대출</b>돼요' : review ? '돌아와서 <b>바로 쓸 수</b> 있어요' : '돌아와서 <b>바로 예약</b>할 수 있어요';
  let sh=document.getElementById('rsvSheet');
  if(!sh){ sh=document.createElement('div'); sh.id='rsvSheet'; sh.className='rsv-sheet';
    sh.addEventListener('click',e=>{ if(e.target===sh) sh.classList.remove('on'); }); document.body.appendChild(sh); }
  sh.innerHTML=`<div class="rsv-card">
    <h3>도서관 로그인이 필요해요</h3>
    <div class="rsv-sub">${sub}</div>
    <div style="margin-top:14px;display:grid;gap:8px">
      <input id="smLgId" placeholder="포털 아이디 (학번)" autocomplete="username" autocapitalize="none"
        style="width:100%;padding:12px 13px;border:1px solid #d8dce3;border-radius:10px;font-size:14px;font-family:inherit">
      <input id="smLgPw" type="password" placeholder="포털 비밀번호" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')smPortalLogin()"
        style="width:100%;padding:12px 13px;border:1px solid #d8dce3;border-radius:10px;font-size:14px;font-family:inherit">
      <div id="smLgMsg" style="display:none;color:#c0392b;font-size:12px">아이디와 비밀번호를 입력해 주세요.</div>
    </div>
    <div class="rsv-btns">
      <button class="rsv-close" onclick="document.getElementById('rsvSheet').classList.remove('on')">닫기</button>
      <button class="rsv-go" onclick="smPortalLogin()">포털 아이디로 로그인</button>
    </div>
    <div style="font-size:11px;color:#8b93a5;margin-top:10px;line-height:1.6">
      비밀번호는 학교 포털 확인에 한 번 쓰이고 저장하지 않아요. 로그인하면 이 페이지로 돌아오고, ${last}
    </div></div>`;
  sh.classList.add('on');
}
// 포털 아이디 직접 로그인 — 폼 전송이라 CORS 없음. sso-login이 세션값을 싣고 이 페이지로 302 복귀
// (도서관 홈피 참나루 배너 설치 전에도 웹에서 본인 명의 기능을 쓸 수 있는 길 — 앱 8/11 체인과 동일)
function smPortalLogin(pfx){
  const idEl=document.getElementById((pfx||'sm')+'LgId'), pwEl=document.getElementById((pfx||'sm')+'LgPw');
  const id=idEl?idEl.value.trim():'', pw=pwEl?pwEl.value:'';
  if(!id||!pw){ const m=document.getElementById((pfx||'sm')+'LgMsg'); if(m)m.style.display='block'; return; }
  const f=document.createElement('form'); f.method='POST';
  f.action='https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/sso-login';
  const add=(k,v)=>{ const i=document.createElement('input'); i.type='hidden'; i.name=k; i.value=v; f.appendChild(i); };
  add('school','semyung.ac.kr'); add('client_userid',id); add('client_username','');
  add('portal_id',id); add('portal_pw',pw);
  document.body.appendChild(f); f.submit();
}
// 예약 직전 확인 시트 — 규칙(24h 수령·3권·노쇼)을 결정 순간에 안내 + 실수 탭 방지
function smConfirm(reckey){
  if(!ssoIsPersonal()){ smLoginGuide(); return; }
  const title=((document.querySelector('#lcDetail h2')||{}).textContent||'이 책').trim();
  let sh=document.getElementById('rsvSheet');
  if(!sh){ sh=document.createElement('div'); sh.id='rsvSheet'; sh.className='rsv-sheet';
    sh.addEventListener('click',e=>{ if(e.target===sh) sh.classList.remove('on'); }); document.body.appendChild(sh); }
  sh.innerHTML=`<div class="rsv-card">
    <h3>찾아줘북즈를 신청할까요?</h3>
    <div class="rsv-sub">「${esc(title)}」을(를) 서가에서 찾아 <b>민송도서관 2층 안내데스크</b>에 보관해 드려요.</div>
    <ul class="rsv-rules">
      <li><span class="rsv-tag">수령</span><span>도서관 승인 후 <b>24시간 안에</b> 민송도서관 2층 안내데스크에서 받으세요.</span></li>
      <li><span class="rsv-tag">한도</span><span>신청 <b>1인 3권</b>까지 · 대출기간 <b>14일</b></span></li>
      <li><span class="rsv-tag warn">주의</span><span class="rsv-warn">받아가지 않으면 노쇼로 기록돼요. <b>3회 쌓이면 30일간</b> 이용이 제한됩니다.</span></li>
    </ul>
    <div class="rsv-btns">
      <button class="rsv-close" onclick="document.getElementById('rsvSheet').classList.remove('on')">닫기</button>
      <button class="rsv-go" onclick="document.getElementById('rsvSheet').classList.remove('on');smReserve('${esc(reckey)}')">찾아줘북즈 신청</button>
    </div></div>`;
  sh.classList.add('on');
}
// ── 찾아줘북즈: 개인 연동이 열린 학생은 본인 명의 정식 API(openapi loanreq), 아니면 공유계정 폴백 ──
// reckey(CATTOT000000339481) → 숫자만 뽑으면 openapi의 제어번호(000000339481)
async function smPickupPersonal(reckey){
  const ctrl=String(reckey).replace(/\D/g,'');
  const h=await smMy('holding',{ctrl});
  let list=(((h||{}).data||{}).holdings||{}).holding;
  if(!list) return {ok:false,message:'소장 정보를 불러오지 못했어요'};
  if(!Array.isArray(list)) list=[list];
  const av=list.find(x=>x&&x.book_state==='대출가능');
  if(!av) return {ok:false,message:'지금 바로 찾아드릴 수 있는 책이 없어요'};
  const d=await smMy('pickup',{controlno:ctrl,accession_no:av.accession_no||'',main_no:av.main_no||''});
  if(!d||!d.ok) return {ok:false,message:((d||{}).data||{}).message||'신청에 실패했어요'};
  // 취소 버튼에 쓸 신청번호 — 신청 응답엔 없어서 현황에서 살아있는 건(0001=신청)으로 되찾는다.
  // ⚠️ 진행 중 신청이 여럿일 수 있다 — 첫 건을 집으면 딴 책을 취소하게 된다.
  //    이 책(제어번호 일치)을 우선 찾고, 응답에 제어번호가 없으면 방금 만든 최신 건(번호 최대)을 쓴다.
  let request_no='';
  try{
    const l=await smMy('pickups'); let it=((l||{}).data||{}).item;
    if(it&&!Array.isArray(it)) it=[it];
    const live=(it||[]).filter(x=>x&&x.loan_status==='0001');
    // ⚠️ 제어번호 필드는 ctrl_no다(8/14 실측) — control_no로 찾으면 영영 못 맞춰 최신 건 폴백만 탔다
    const mine=live.find(x=>String(x.ctrl_no||x.control_no||'').replace(/\D/g,'')===ctrl)
      || live.slice().sort((a,b)=>Number(b.request_no||0)-Number(a.request_no||0))[0];
    request_no=(mine&&mine.request_no)||'';
  }catch(e){}
  return {ok:true,request_no:request_no,accession_no:av.accession_no||''};
}
async function smReserve(reckey){
  const btn=document.getElementById('lhResv'); if(!btn||btn.dataset.busy) return;
  const orig=btn.innerHTML; btn.dataset.busy='1'; btn.classList.add('busy'); btn.innerHTML='예약 신청 중…';
  try{
    if(!ssoIsPersonal()){ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; smLoginGuide(); return; }
    const d=await smPickupPersonal(reckey);
    bxEvent('link',{sub:'pickup', book:window._lcCurBook, item_type:'paper', item_key:reckey, ok:!!(d&&d.ok), meta:{request_no:(d&&d.request_no)||'', msg:(d&&!d.ok)?String(d.message||d.error||'').slice(0,120):''}});   // 측정: 이용(종이책 연결=신청까지)
    if(d&&d.ok){
      _myWaitCache=null;   // 방금 신청이 목록에 생겼다 — 캐시를 비워 소장 박스·내 도서관이 바로 알게
      btn.removeAttribute('onclick'); btn.className='lh-resv done';
      btn.innerHTML='찾아줘북즈 신청이 접수됐어요 · 도서관 승인 후 2층 안내데스크에서 <b>24시간 안에</b> 받으세요<br><span class="lh-cancel" onclick="smCancel(\''+esc(reckey)+'\',\''+esc(d.accession_no||'')+'\',\''+esc(d.request_no||'')+'\')">신청 취소하기</span>';
      try{ renderMyLibStatus(); }catch(e){}
    }else{ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; alert((d&&(d.message||d.error))||'신청에 실패했어요'); }
  }catch(e){ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; alert('신청 중 오류가 발생했어요'); }
}
async function smCancel(reckey,acc,requestNo){
  // 취소도 신청과 같은 본인 명의로만 — 예전의 공유계정 폴백은 남(관장님 계정)의 신청을 지울 수 있어 제거(8/14)
  const btn=document.getElementById('lhResv'); if(!btn) return;
  if(!confirm('찾아줘북즈 신청을 취소할까요?')) return;
  btn.innerHTML='취소 중…';
  try{
    if(!ssoIsPersonal()){ smLoginGuide(); loadHolding(reckey); return; }
    let no=requestNo;
    if(!no){
      // 신청번호가 없으면 내 신청 현황에서 이 책(ctrl_no 일치·신청 단계 0001)을 다시 찾는다
      const ctrl=String(reckey).replace(/\D/g,'');
      const w=await myWaiting(true);
      const pk=(w.picks||[]).find(x=>String(x.loan_status||'')==='0001'&&String(x.ctrl_no||x.control_no||'').replace(/\D/g,'')===ctrl);
      no=(pk&&pk.request_no)||'';
    }
    if(!no){ alert('취소할 신청을 찾지 못했어요. 도서관이 이미 처리 중이면 2층 안내데스크에 말씀해 주세요.'); loadHolding(reckey); return; }
    const d=await smMy('cancelPickup',{request_no:no});
    _myWaitCache=null;
    if(d&&d.ok){ btn.className='lh-resv'; delete btn.dataset.busy; btn.setAttribute('onclick',"smConfirm('"+esc(reckey)+"')"); btn.innerHTML='찾아줘북즈 신청하기 · 서가에서 찾아 2층 안내데스크에 보관해 드려요'; }
    else alert((((d||{}).data||{}).message)||'취소하지 못했어요 — 도서관이 이미 처리 중이면 2층 안내데스크에 말씀해 주세요');
    try{ renderMyLibStatus(); }catch(e){}
  }catch(e){ alert('취소 중 오류가 발생했어요'); }
}
// 도서 예약(반납 대기) — 전권 대출중인 책을 반납되면 순번대로 받기
function smHoldConfirm(reckey){
  if(!ssoIsPersonal()){ smLoginGuide(); return; }
  const title=((document.querySelector('#lcDetail h2')||{}).textContent||'이 책').trim();
  let sh=document.getElementById('rsvSheet');
  if(!sh){ sh=document.createElement('div'); sh.id='rsvSheet'; sh.className='rsv-sheet';
    sh.addEventListener('click',e=>{ if(e.target===sh) sh.classList.remove('on'); }); document.body.appendChild(sh); }
  sh.innerHTML=`<div class="rsv-card">
    <h3>반납되면 예약해 드릴까요?</h3>
    <div class="rsv-sub">「${esc(title)}」은(는) 지금 대출 중이에요. 예약해 두면 <b>반납되는 대로 순번대로</b> 빌리실 수 있어요.</div>
    <ul class="rsv-rules">
      <li><span class="rsv-tag">안내</span><span>반납되면 <b>문자로 알려드리고</b>, 2층 안내데스크에 보관해 드려요. 먼저 예약한 순서대로 진행됩니다.</span></li>
      <li><span class="rsv-tag">기한</span><span>안내 후 <b>3일 안에</b> 대출하지 않으면 예약이 자동 취소돼요.</span></li>
      <li><span class="rsv-tag">한도</span><span>한 책당 <b>1순위</b>만 예약 가능 · 예약은 <b>3권</b>까지</span></li>
    </ul>
    <div class="rsv-btns">
      <button class="rsv-close" onclick="document.getElementById('rsvSheet').classList.remove('on')">닫기</button>
      <button class="rsv-go" onclick="document.getElementById('rsvSheet').classList.remove('on');smHold('${esc(reckey)}')">예약 신청</button>
    </div></div>`;
  sh.classList.add('on');
}
// 도서예약(반납 대기)도 동일하게 개인 명의 정식 API 우선. 대출중인 소장본에서 대표번호·소장처를 얻는다.
async function smHoldPersonal(reckey){
  const ctrl=String(reckey).replace(/\D/g,'');
  const h=await smMy('holding',{ctrl});
  let list=(((h||{}).data||{}).holdings||{}).holding;
  if(!list) return {ok:false,message:'소장 정보를 불러오지 못했어요'};
  if(!Array.isArray(list)) list=[list];
  const t=list.find(x=>x&&x.book_state==='대출중'&&x.reserve_available==='Y')||list.find(x=>x&&x.reserve_available==='Y');
  if(!t) return {ok:false,message:'지금은 예약할 수 있는 책이 없어요'};
  const d=await smMy('reserve',{main_no:t.main_no||'',location:t.location||''});
  if(!d||!d.ok) return {ok:false,message:((d||{}).data||{}).message||'예약에 실패했어요'};
  return {ok:true,main_no:t.main_no||''};
}
async function smHold(reckey){
  const btn=document.getElementById('lhResv'); if(!btn||btn.dataset.busy) return;
  const orig=btn.innerHTML; btn.dataset.busy='1'; btn.classList.add('busy'); btn.innerHTML='예약 신청 중…';
  try{
    if(!ssoIsPersonal()){ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; smLoginGuide(); return; }
    const d=await smHoldPersonal(reckey);
    bxEvent('link',{sub:'hold', book:window._lcCurBook, item_type:'paper', item_key:reckey, ok:!!(d&&d.ok), meta:{msg:(d&&!d.ok)?String(d.message||'').slice(0,120):''}});   // 측정: 이용(종이책 연결=예약)
    if(d&&d.ok){
      _myWaitCache=null;
      btn.removeAttribute('onclick'); btn.className='lh-resv done';
      btn.innerHTML='도서 예약이 접수됐어요 · 반납되면 <b>문자로 알려드리고</b> 2층 안내데스크에 보관해 드려요<br><span class="lh-cancel" onclick="smUnhold(\''+esc(reckey)+'\',\''+esc(d.main_no||'')+'\')">예약 취소하기</span>';
      try{ renderMyLibStatus(); }catch(e){}
    }else{ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; alert((d&&(d.message||d.error))||'예약에 실패했어요'); }
  }catch(e){ btn.innerHTML=orig; btn.classList.remove('busy'); delete btn.dataset.busy; alert('예약 중 오류가 발생했어요'); }
}
async function smUnhold(reckey,mainNo){
  // 취소도 본인 명의로만 — 공유계정 폴백 제거(8/14, smCancel과 같은 이유)
  const btn=document.getElementById('lhResv'); if(!btn) return;
  if(!confirm('예약을 취소할까요?')) return;
  btn.innerHTML='취소 중…';
  try{
    if(!ssoIsPersonal()){ smLoginGuide(); loadHolding(reckey); return; }
    if(!mainNo){ alert('취소할 예약을 찾지 못했어요. 내 서재에서 다시 시도해 주세요.'); loadHolding(reckey); return; }
    const d=await smMy('cancelReserve',{main_no:mainNo});
    _myWaitCache=null;
    if(d&&d.ok){ btn.className='lh-resv'; delete btn.dataset.busy; btn.setAttribute('onclick',"smHoldConfirm('"+esc(reckey)+"')"); btn.innerHTML='예약하기 · 반납되면 문자로 알려드리고 2층 안내데스크에 보관해 드려요'; }
    else alert((((d||{}).data||{}).message)||'취소하지 못했어요');
    try{ renderMyLibStatus(); }catch(e){}
  }catch(e){ alert('취소 중 오류가 발생했어요'); }
}
const COVER_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
function hiCover(u){return (u||'').replace('/coversum/','/cover500/').replace('/cover200/','/cover500/');}

