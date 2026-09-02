/* ═══════════════════════════════════════════════════════════
   리더 모듈 — 폰트/크기/줄간격/테마, TOC, 위치저장, 읽기시간, streak, 하이라이트
   ═══════════════════════════════════════════════════════════ */
const READER_PREFS_KEY = 'klever-reader-prefs';
const READER_STATS_KEY = 'klever-reader-stats';
const FONT_SIZES = [14,15,16,17,18,19,20,22,24];
const LINE_HEIGHTS = [1.5,1.65,1.75,1.85,2.0,2.2];
const PAD_X = [10,22,36,54,80];          // 좌우 여백 px
const PAD_Y = [14,30,48,72];             // 상하 여백 px
const READER_FONTS = [                    // 글꼴 선택
  {name:'책 원본', ff:"'Pretendard Variable','Noto Serif KR',serif"},
  {name:'명조',   ff:"'Noto Serif KR',serif"},
  {name:'고딕',   ff:"'Pretendard Variable',sans-serif"},
];
const READER_BGS = [                       // 배경색 6종 (빈 bg=테마 기본)
  {id:'',       label:'기본'},
  {id:'cream',  label:'크림',   bg:'#f6efdd', fg:'#3b342a'},
  {id:'mint',   label:'민트',   bg:'#e7efe6', fg:'#2c3a2e'},
  {id:'forest', label:'포레스트', bg:'#1e3a32', fg:'#e7efe9'},
  {id:'gray',   label:'그레이', bg:'#4a4a4a', fg:'#e9e9e9'},
  {id:'black',  label:'블랙',   bg:'#161616', fg:'#d8d8d8'},
];

let readerPrefs = {fontSizeIdx:3, lineHeightIdx:3, theme:'light', pageMode:false,
                   padXIdx:2, padYIdx:1, fontIdx:0, bg:'', mouseHide:false, hdrAuto:true};
let readerStats = {positions:{}, completedChapters:{}, highlights:{}, bookmarks:{}, readingTime:{total:0,days:{}}, streak:{last:'',count:0}};
let _readerSessionStart = 0;
let _scrollSaveTimer = null;
let _lastSelectionRange = null;

function loadReaderPrefs(){ try{ const s=JSON.parse(localStorage.getItem(READER_PREFS_KEY)||'null'); if(s)Object.assign(readerPrefs,s);}catch(e){}
  // 오염·구버전 값 방어: 인덱스가 범위 밖이면 기본값 — CSS에 undefinedpx가 박혀 조판이 깨지는 것 방지
  const _ck=(k,n,d)=>{ const v=readerPrefs[k]; if(typeof v!=='number'||!(v>=0&&v<n)) readerPrefs[k]=d; };
  _ck('fontSizeIdx',FONT_SIZES.length,3); _ck('lineHeightIdx',LINE_HEIGHTS.length,3);
  _ck('padXIdx',PAD_X.length,2); _ck('padYIdx',PAD_Y.length,1); _ck('fontIdx',READER_FONTS.length,0);
}
function saveReaderPrefs(){ try{ localStorage.setItem(READER_PREFS_KEY, JSON.stringify(readerPrefs)); }catch(e){} }
// 리더 통계는 계정별로 분리(전역 키 공유 시 다계정 테스트가 서로 오염) — 로그인 시 klever-reader-stats-{sid}
function _rsKey(){ try{ const s=(typeof bxStudent==='function')?bxStudent():null; return (s&&s.id)?READER_STATS_KEY+'-'+s.id:READER_STATS_KEY; }catch(e){ return READER_STATS_KEY; } }
function _rsDefault(){ return {positions:{}, completedChapters:{}, highlights:{}, bookmarks:{}, readingTime:{total:0,days:{}}, streak:{last:'',count:0}}; }
function loadReaderStats(){
  readerStats = _rsDefault();                          // 계정 전환 시 이전 계정 잔여 제거
  try{ const s=JSON.parse(localStorage.getItem(_rsKey())||'null'); if(s)Object.assign(readerStats,s);}catch(e){}
  // 형태 방어: 오염된 저장값(null 등)이 streak 갱신·앵커 복원에서 TypeError로 번져 뷰어 초기화가 중단되지 않게
  ['positions','completedChapters','highlights','bookmarks','pagePos','deleted'].forEach(k=>{ if(!readerStats[k]||typeof readerStats[k]!=='object') readerStats[k]={}; });
  if(!readerStats.readingTime||typeof readerStats.readingTime!=='object') readerStats.readingTime={total:0,days:{}};
  if(!readerStats.readingTime.days||typeof readerStats.readingTime.days!=='object') readerStats.readingTime.days={};
  if(!readerStats.streak||typeof readerStats.streak!=='object') readerStats.streak={last:'',count:0};
  // 방어: 탭 장시간 방치 등으로 하루가 과대 기록된 값 보정(하루 ≤ 8시간), 누적은 일별 합과 일치
  try{
    const rt=readerStats.readingTime;
    if(rt&&rt.days){
      let sum=0, fixed=false;
      for(const k in rt.days){ const v=Math.min(Math.round(rt.days[k]||0), 300); if(v!==rt.days[k]) fixed=true; rt.days[k]=v; sum+=v; }
      if((rt.total||0)!==sum){ rt.total=sum; fixed=true; }   // 누적 = 일별 합 불변식 유지
      if(fixed) saveReaderStats();
    }
  }catch(e){}
}
function saveReaderStats(){ try{ localStorage.setItem(_rsKey(), JSON.stringify(readerStats)); }catch(e){} bxUpsertReaderStats(); }

/* ── 내 서재(도서관에서 빌린 책) — '읽고 돌아오기' 루프의 그릇 ──
   빌리기 클릭 → 읽는 중 기록 → 돌아와서 완독 인증(독후감) → 완독 이력 누적.
   외부 뷰어 안은 못 보지만 '완독 증명'은 북스타가 소유 = 차별화 지점. */
const SHELF_KEY='bookstar-myshelf';
function shelfLoad(){ try{ return JSON.parse(localStorage.getItem(SHELF_KEY)||'[]'); }catch(e){ return []; } }
function shelfSave(a){ try{ localStorage.setItem(SHELF_KEY, JSON.stringify(a)); }catch(e){} }
function shelfAdd(b){
  if(!b) return; const key=b.isbn||b.brcd; if(!key) return;
  const a=shelfLoad();
  if(!a.find(x=>x.key===key)){ a.unshift({key,t:b.t||b.title||'',a:b.a||b.author||'',cover:b.cover||'',lib:b.lib||'',status:'reading',ts:Date.now()}); shelfSave(a); }
}
// 빌린 전자책의 반납예정일 한 줄 — 도서관이 준 날짜 그대로.
// 전자책 대출기간은 생각보다 짧다(실측 5일). 안 알려주면 읽던 책이 어느 날 갑자기 사라진다.
function shelfDueLine(x){
  if(x.status==='done'||x.returned||!x.loanSrmb||!x.dueDate) return '';
  const d=smDday(x.dueDate);
  if(d===null) return '';
  const when = d<0 ? `${-d}일 지남` : d===0 ? '오늘까지' : d<=2 ? `${d}일 남음` : `${smFmt(x.dueDate)}까지`;
  const color = d<=0 ? '#dc2626' : d<=2 ? '#ea580c' : 'var(--text-light)';
  return `<div style="font-size:11.5px;font-weight:700;color:${color};margin-top:3px">${when}</div>`;
}
function shelfCard(x){
  const cv=x.cover?`<img src="${esc(hiCover(x.cover))}" onerror="this.style.display='none'">`:ncCover(x);
  const right = x.status==='done'
    ? `<span style="font-size:12px;font-weight:800;color:#1d6b48;white-space:nowrap">✔ 완독${x.returned?' · 반납됨':''}</span>`
    : `<div style="display:flex;gap:6px;align-items:center;white-space:nowrap">`
      + (x.loanSrmb?`<button onclick="event.stopPropagation();shelfReturn('${esc(x.key)}')" style="background:transparent;color:var(--text-sub);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer">반납</button>`:'')
      + `<button onclick="event.stopPropagation();shelfCertOpen('${esc(x.key)}')" style="background:var(--gold);color:#1a1208;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer">완독 인증 →</button></div>`;
  return `<div style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--border)">
    <div style="flex:0 0 42px;width:42px;height:60px;border-radius:6px;overflow:hidden;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:20px">${cv}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13.5px;font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cleanT(x.t))}</div>
      <div style="font-size:11.5px;color:var(--text-light);margin-top:2px">${esc(x.a||'')}${x.status==='done'&&x.soclip?` · “${esc(x.soclip.slice(0,24))}”`:''}</div>
      ${shelfDueLine(x)}
    </div>${right}</div>`;
}
function renderMyShelf(){
  const el=document.getElementById('myShelf'); if(!el) return;
  const a=shelfLoad();
  if(!a.length){ el.innerHTML=`<div style="text-align:center;color:var(--text-light);font-size:12.5px;padding:26px 10px;background:var(--bg-input);border-radius:12px;line-height:1.7">아직 빌린 책이 없어요.<br><b style="color:var(--primary)">우리 도서관</b>에서 책을 빌리면 여기에 쌓이고, 다 읽으면 <b>완독 인증</b>으로 점수가 올라가요.</div>`; return; }
  const reading=a.filter(x=>x.status!=='done' && !x.returned), done=a.filter(x=>x.status==='done');
  const sub=(t)=>`<div style="font-size:12px;font-weight:800;color:var(--text-sub);margin:14px 0 2px">${t}</div>`;
  // 도서관 종이책 대출현황은 '우리 도서관' 상단(renderMyLibStatus)이 전담 — 여기는 북스타 서재만
  el.innerHTML=(reading.length?sub(`📖 읽는 중 ${reading.length}`)+reading.map(shelfCard).join(''):'')
    +(done.length?sub(`✅ 완독 ${done.length}`)+done.map(shelfCard).join(''):'');
}
// 완독 인증 모달 (상세 오버레이 재사용) — 독후감 한 줄 = 완독 증명
function shelfCertOpen(key){
  const x=shelfLoad().find(i=>i.key===key); if(!x) return;
  const ov=document.getElementById('lcDetail');
  ov.querySelector('.lcd').innerHTML=`<span class="lcd-x" onclick="closeLc()">×</span>
    <div style="padding:26px 24px 22px">
      <div style="font-size:12px;font-weight:800;color:var(--gold);letter-spacing:.05em">완독 인증</div>
      <h2 style="font-size:18px;font-weight:800;margin:6px 0 4px;line-height:1.35">${esc(cleanT(x.t))}</h2>
      <div style="font-size:12.5px;color:var(--text-light)">${esc(x.a||'')}</div>
      <div style="font-size:12.5px;color:var(--text-sub);margin:16px 0 8px;line-height:1.6">다 읽으셨나요? <b>한 줄 소감</b>을 남기면 완독으로 인증되고, 독서 이력·점수에 반영돼요.</div>
      <textarea id="certSoclip" placeholder="이 책에서 가장 기억에 남는 한 가지…" style="width:100%;min-height:88px;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13.5px;line-height:1.6;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
      <button onclick="shelfCertSubmit('${esc(key)}')" style="width:100%;margin-top:12px;background:var(--gold);color:#1a1208;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer">✔ 완독 인증하기</button>
      <div style="font-size:11px;color:var(--text-light);text-align:center;margin-top:8px">AI 독후감 평가는 연동 시 자동 채점됩니다</div>
    </div>`;
  ov.classList.add('on');
}
function shelfCertSubmit(key){
  const soclip=(document.getElementById('certSoclip')||{}).value||'';
  if(!soclip.trim()){ readerToast('한 줄 소감을 적어주세요 — 완독 증명이 됩니다'); return; }
  const a=shelfLoad(); const it=a.find(x=>x.key===key); if(!it) return;
  it.status='done'; it.doneTs=Date.now(); it.soclip=soclip.trim(); shelfSave(a);
  closeLc(); renderMyShelf();
  const done=shelfLoad().filter(x=>x.status==='done').length;
  bsCelebrate({
    title:`『${esc(cleanT(it.t))}』<br>완독 인증 완료!`,
    rows:[`독서 이력에 추가 — 누적 완독 <b>${done}권</b>`],
  });
}
// 전자책 반납 — semyung-ebook-borrow(action=return)로 대출 슬롯 비우기. 반납 시각 기록 → 대출기간 측정.
async function shelfReturn(key){
  const a=shelfLoad(); const it=a.find(x=>x.key===key); if(!it) return;
  if(!it.loanSrmb){ readerToast('반납 정보가 없어요 — 도서관에서 직접 확인해 주세요'); return; }
  if(!confirm(`「${cleanT(it.t)}」 반납할까요?`)) return;
  readerToast('반납 중…');
  try{
    const r=await sbFn(SMEBK_FN,{action:'return',loanSrmb:it.loanSrmb,brcd:String(key).replace(/^sm-/,'')});
    const d=await r.json();
    if(d&&d.ok){ it.returned=true; it.returnedTs=Date.now(); shelfSave(a); renderMyShelf(); readerToast('반납 완료 — 대출 슬롯이 비었어요'); }
    // 도서관 계정 미연결(또는 연동 만료) — 8/9부터 전자책은 본인 명의로만 다뤄서 반납도 로그인이 필요하다
    else if(d&&d.needsPersonal){ try{ localStorage.setItem(SSO_PERSONAL_KEY,'0'); }catch(e){} smLoginGuide('read'); }
    else{ readerToast('반납에 실패했어요. 잠시 후 다시 시도해 주세요'); }
  }catch(e){ readerToast('반납 중 오류가 났어요'); }
}

function applyReaderPrefs(){
  const v = document.getElementById('viewerBody');
  if(v){
    v.style.setProperty('--reader-fs', FONT_SIZES[readerPrefs.fontSizeIdx] + 'px');
    v.style.setProperty('--reader-lh', LINE_HEIGHTS[readerPrefs.lineHeightIdx]);
    v.style.setProperty('--reader-padx', PAD_X[readerPrefs.padXIdx] + 'px');
    v.style.setProperty('--reader-pady', PAD_Y[readerPrefs.padYIdx] + 'px');
    v.style.setProperty('--reader-ff', (READER_FONTS[readerPrefs.fontIdx]||READER_FONTS[0]).ff);
    const bgc = READER_BGS.find(b=>b.id===readerPrefs.bg);
    if(bgc && bgc.bg){ v.style.setProperty('--reader-bg', bgc.bg); v.style.setProperty('--reader-fg', bgc.fg); }
    else { v.style.removeProperty('--reader-bg'); v.style.removeProperty('--reader-fg'); }
  }
  document.querySelectorAll('.rss-bg[data-bg]').forEach(b=>b.classList.toggle('on', b.dataset.bg===readerPrefs.bg));
  document.querySelectorAll('.rss-font[data-fi]').forEach(b=>b.classList.toggle('on', +b.dataset.fi===readerPrefs.fontIdx));
  const mh=document.getElementById('mouseHideToggle'); if(mh) mh.classList.toggle('on', !!readerPrefs.mouseHide);
  _mouseHideArm();
  const ha=document.getElementById('hdrAutoToggle'); if(ha) ha.classList.toggle('on', !!readerPrefs.hdrAuto);
  _hdrAutoApply();
  document.body.classList.remove('dark','sepia');
  if(readerPrefs.theme === 'dark') document.body.classList.add('dark');
  else if(readerPrefs.theme === 'sepia') document.body.classList.add('sepia');
  // 브라우저 주소창 색을 지금 헤더 색과 맞춘다 (.header 밝은 rgba(247,246,241) / body.dark .header rgba(15,23,42))
  // 세피아는 헤더 override 가 없어 밝은 색 그대로다 — 일부러 light 와 같은 값을 준다
  const _tcMeta = document.querySelector('meta[name="theme-color"]');
  if(_tcMeta) _tcMeta.setAttribute('content', readerPrefs.theme === 'dark' ? '#0f172a' : '#f7f6f1');
  document.querySelectorAll('.reader-btn[data-theme]').forEach(b=>{
    b.classList.toggle('on', b.dataset.theme === readerPrefs.theme);
  });
  // 휴면 중인 dark 테마 토글 버튼과 동기화
  const tBtn = document.getElementById('themeBtn');
  if(tBtn) tBtn.innerHTML = readerPrefs.theme==='dark' ? ic('sun','icon icon-sm') : ic('moon','icon icon-sm');
  if(typeof _pg!=='undefined' && _pg.on) pgRelayout();   // 페이지 모드: 글자크기·줄간격 바뀌면 페이지 재계산
  if(typeof scheduleAlign==='function') scheduleAlign();  // A안: 글자크기·폰트 바뀌면 좌우 문단 재정렬
}
function readerFS(d){ _withAnchorKept(()=>{ readerPrefs.fontSizeIdx = Math.max(0, Math.min(FONT_SIZES.length-1, readerPrefs.fontSizeIdx+d)); applyReaderPrefs(); saveReaderPrefs(); }); }
function readerLH(d){ _withAnchorKept(()=>{ readerPrefs.lineHeightIdx = Math.max(0, Math.min(LINE_HEIGHTS.length-1, readerPrefs.lineHeightIdx+d)); applyReaderPrefs(); saveReaderPrefs(); }); }
function readerTheme(t){ readerPrefs.theme = t; applyReaderPrefs(); saveReaderPrefs(); }
function readerPadX(d){ _withAnchorKept(()=>{ readerPrefs.padXIdx = Math.max(0, Math.min(PAD_X.length-1, readerPrefs.padXIdx+d)); applyReaderPrefs(); saveReaderPrefs(); }); }
function readerPadY(d){ _withAnchorKept(()=>{ readerPrefs.padYIdx = Math.max(0, Math.min(PAD_Y.length-1, readerPrefs.padYIdx+d)); applyReaderPrefs(); saveReaderPrefs(); }); }
function readerFont(i){ _withAnchorKept(()=>{ readerPrefs.fontIdx = i; applyReaderPrefs(); saveReaderPrefs(); }); }   // 서체도 줄바꿈·높이를 바꾸므로 읽던 자리 보존
function readerBg(id){ readerPrefs.bg = id; applyReaderPrefs(); saveReaderPrefs(); }
function toggleMouseHide(){ readerPrefs.mouseHide = !readerPrefs.mouseHide; applyReaderPrefs(); saveReaderPrefs(); }
/* 마우스 숨기기: 켜져 있으면 2.5초 무동작 시 커서·헤더 숨김, 움직이면 복귀 */
let _mhTimer=null, _mhBound=false;
function _mouseHideArm(){
  const sh=document.querySelector('.viewer-shell'); if(!sh) return;
  if(!_mhBound){ const ov=document.getElementById('viewerOverlay');
    if(ov){ ov.addEventListener('mousemove', _mouseHideReset); ov.addEventListener('click', _mouseHideReset); _mhBound=true; } }
  _mouseHideReset();
}
function _mouseHideReset(){
  const sh=document.querySelector('.viewer-shell'); if(!sh) return;
  sh.classList.remove('mh-hidden'); clearTimeout(_mhTimer);
  if(readerPrefs.mouseHide) _mhTimer=setTimeout(()=>sh.classList.add('mh-hidden'), 2500);
}
/* 헤더 자동숨김: 켜져 있으면 평소 숨김, 마우스를 상단(64px)에 올리면 노출 */
function toggleHdrAuto(){ readerPrefs.hdrAuto = !readerPrefs.hdrAuto; applyReaderPrefs(); saveReaderPrefs(); }
let _hdrPeekBound=false;
function _hdrAutoApply(){
  const sh=document.querySelector('.viewer-shell'); if(!sh) return;
  sh.classList.toggle('hdr-auto', !!readerPrefs.hdrAuto);
  if(!readerPrefs.hdrAuto){ sh.classList.remove('hdr-peek'); return; }
  if(!_hdrPeekBound){ const ov=document.getElementById('viewerOverlay');
    if(ov){ ov.addEventListener('mousemove', _hdrPeekMove); _hdrPeekBound=true; } }
  // 설정 시트가 열린 채로 켰으면 헤더 유지(시트가 헤더에 매달려 있음)
  if(document.getElementById('readerSettingsSheet')?.classList.contains('open')) sh.classList.add('hdr-peek');
}
function _hdrPeekMove(e){
  const sh=document.querySelector('.viewer-shell');
  if(!sh || !sh.classList.contains('hdr-auto')) return;
  // 설정 시트 열려 있으면 헤더 계속 노출 (시트가 헤더 아래로 펼쳐짐)
  if(document.getElementById('readerSettingsSheet')?.classList.contains('open')){ sh.classList.add('hdr-peek'); return; }
  const r=sh.getBoundingClientRect();
  sh.classList.toggle('hdr-peek', (e.clientY - r.top) < 64);
}

/* ── 모바일 읽기 설정 시트 (Aa) ── */
function toggleReaderSettings(e){ if(e) e.stopPropagation(); const s=document.getElementById('readerSettingsSheet'); if(s){ s.classList.toggle('open'); if(s.classList.contains('open')) syncPageModeBtns(); } }
document.addEventListener('click',(e)=>{
  const s=document.getElementById('readerSettingsSheet');
  if(!s || !s.classList.contains('open')) return;
  if(s.contains(e.target) || e.target.closest('#readerAaBtn')) return;   // 시트·Aa 클릭은 유지
  s.classList.remove('open');
});

/* TOC */
// 속표지(첫 화면) 오른쪽 칸 채우기 — 목차가 있으면 목차, 없으면 작품 소개.
// 장 정보는 본문에서 뽑기 때문에 본문 렌더가 끝난 뒤(buildTOC 시점)에야 채울 수 있다.
// kind: 'toc' | 'about'. 칸마다 data-lang이 달라서(번역 칸/원문 칸) 각각의 말로 채운다
function _fillFront(kind, makeHtml){
  document.querySelectorAll('.book-front').forEach(f=>{
    const lang=f.dataset.lang||'ko';
    const h=f.querySelector('.bf-h'), t=f.querySelector('.bf-toc');
    if(h) h.textContent=frontT(lang)[kind==='toc'?'toc':'about'];
    if(t) t.innerHTML=makeHtml(lang, f.closest('.viewer-pane'));
  });
}
function buildTOC(){
  const list = document.getElementById('tocList');
  const left = document.querySelector('.viewer-pane.left');
  if(!list) return;
  if(!left){ list.innerHTML = ''; return; }
  const sections = left.querySelectorAll('.chapter-anchor');
  if(sections.length <= 1){
    list.innerHTML = '<div style="padding:14px 18px;color:var(--text-light);font-size:12px;">이 책은 단일 장(章)입니다.</div>';
    _fillFront('about', lang => '<div class="bf-intro">'+esc(bookIntro(currentBook, lang))+'</div>');
    return;
  }
  // 속표지 목차 — 서랍 목차와 같은 장 목록. 누르면 그 장으로 내려간다.
  // 장 제목은 칸마다 그 칸의 말로 적혀 있으므로(번역 칸/원문 칸) 각 칸 자기 것에서 뽑는다
  {
    const done = (readerStats.completedChapters || {})[currentBook.id] || [];
    _fillFront('toc', (lang, pane) => {
      const secs = (pane && pane.querySelectorAll('.chapter-anchor').length === sections.length)
                   ? [...pane.querySelectorAll('.chapter-anchor')] : [...sections];
      return secs.map((sec,i)=>{
        const t = sec.dataset.chTitle || ('Chapter '+(i+1));
        // 9/2 해외 고전 한국어 칸은 장 제목이 '제1장'뿐인 책이 많다 → 왼쪽(원서) 칸의 부제를 옆에 작게 붙인다
        const other = sections[i] && sections[i].dataset.chTitle;
        const sub = (_bareCh(t) && other && !_bareCh(other) && sec !== sections[i]) ? _chSub(other) : '';
        return `<div class="bf-ch${done.includes(i)?' done':''}" onclick="tocGo(${i})">${esc(_chCase(t))}${sub?`<span class="bf-sub">${esc(_chCase(sub))}</span>`:''}</div>`;
      }).join('');
    });
  }
  const completed = (readerStats.completedChapters || {})[currentBook.id] || [];
  list.innerHTML = '';
  sections.forEach((sec, i) => {
    const title = sec.dataset.chTitle || ('Chapter ' + (i+1));
    const div = document.createElement('div');
    div.className = 'toc-item' + (completed.includes(i) ? ' done' : '');
    div.textContent = title;
    div.onclick = () => {
      if(_pg.on){   // 페이지 모드: 해당 장 1페이지로
        showChapter(i, 0);
        document.querySelectorAll('.toc-item').forEach(x=>x.classList.remove('active'));
        div.classList.add('active');
        if(window.innerWidth <= 600) toggleTOC();
        return;
      }
      // 현재 보이는 칸(PC=본문, 모바일=선택 탭)의 같은 장 인덱스로 이동 — scrollIntoView는 중첩 스크롤서 불안정
      const pane = _scrollEl();
      const secs = pane ? [...pane.querySelectorAll('.chapter-anchor')] : [];
      const target = secs[i] || sec;
      if(pane && target) pane.scrollTo({top: target.offsetTop, behavior:'smooth'});
      else target.scrollIntoView({behavior:'smooth', block:'start'});
      document.querySelectorAll('.toc-item').forEach(x=>x.classList.remove('active'));
      div.classList.add('active');
      if(window.innerWidth <= 600) toggleTOC();   // 모바일: 선택 후 목차 닫기
    };
    list.appendChild(div);
  });
}
// 속표지 목차 표기 도우미
//  _bareCh: '제3장' / 'CHAPTER III' / '12' 처럼 번호뿐인 제목인가
//  _chSub : 'CHAPTER 1 MY UNCLE MAKES A GREAT DISCOVERY' → 'MY UNCLE MAKES A GREAT DISCOVERY'
//  _chCase: 원서 제목이 전부 대문자면 읽기 쉽게 첫 글자만 대문자로(로마숫자는 그대로). 소문자가 하나라도 있으면 손대지 않음
function _bareCh(t){ return /^(제\s*\d+\s*장|(?:CHAPTER|Chapter|chapter)\s+[\dIVXLC]+|[\dIVXLC]+)[.:]?$/.test(String(t||'').trim()); }
function _chSub(t){ const m = String(t||'').match(/^(?:CHAPTER|Chapter|chapter)\s+[\dIVXLC]+\b[.:\s—–-]*(.*)$/); return (m ? m[1] : String(t||'')).trim(); }
function _chCase(t){
  t = String(t||'');
  if(/[a-z]/.test(t)) return t;
  const roman = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;   // 'CIVIC' 같은 낱말은 로마숫자로 안 본다
  return t.replace(/[A-Z][A-Z'’]*/g, w => roman.test(w) ? w : w[0] + w.slice(1).toLowerCase());
}
function toggleTOC(){ const d=document.getElementById('tocDrawer'); if(d) d.classList.toggle('open'); }
// 속표지 목차에서 장 이동 (서랍 목차와 같은 동작, 서랍은 열려 있을 때만 닫는다)
function tocGo(i){
  if(_pg.on){ showChapter(i, 0); }
  else {
    const pane = _scrollEl();
    const secs = pane ? [...pane.querySelectorAll('.chapter-anchor')] : [];
    const target = secs[i];
    if(pane && target) pane.scrollTo({top: target.offsetTop, behavior:'smooth'});
    else if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
  }
  const d=document.getElementById('tocDrawer');
  if(window.innerWidth <= 600 && d && d.classList.contains('open')) toggleTOC();
}

/* 위치 저장 · 진행률 (스크롤은 .viewer-pane.left에서 일어남) */
function _vis(el){ return !!el && (el.offsetWidth>0 || el.offsetHeight>0); }   // display:none이면 0
function _scrollEl(){   // 현재 화면에 보이는(스크롤되는) 칸 — PC=본문(left), 모바일=선택된 칸
  const left=document.querySelector('.viewer-pane.left');
  const right=document.querySelector('.viewer-pane.right');
  if(_vis(left)) return left;
  if(_vis(right)) return right;
  return left;
}
// 폰 챌린지 쌓기 모드(장면카드 위·퀴즈 아래, 몸통 스크롤)인지 — 8/17
function _chalStacked(){ const b=document.getElementById('viewerBody'); return !!(b && window.innerWidth<=600 && b.classList.contains('chal-stack')); }
// 쌓기 모드 켜기 — 장면카드 있는 책에서 mpLoadQuiz가 호출. 본문/퀴즈·수행 탭을 없애고 두 칸을 모두 펼친다
function _chalStackApply(){
  const body=document.getElementById('viewerBody'); if(!body || currentMode!=='challenge') return;
  body.classList.add('chal-stack'); body.classList.remove('mob-second'); _mobPane='main';
  const bar=document.getElementById('paneTabs'); if(bar) bar.style.display='none';
  // 메뉴는 읽기 화면과 같은 스크롤 방식(위로 올리면 뜨고 내리면 숨음) — 처음엔 숨김
  const sh=document.querySelector('.viewer-shell'); if(sh){ sh.classList.add('immersive'); sh.classList.add('chrome-hidden'); }
}
// ── 모바일 1단 + 본문/번역(퀴즈) 탭 전환 ──
let _mobPane='main', _mobScroll={};   // 탭별 스크롤 위치 보관 — display:none이 scrollTop을 파기하므로 직접 복원
function switchMobilePane(which){
  if(which===_mobPane) return;
  const prevEl=_scrollEl();
  if(prevEl && prevEl.clientHeight) _mobScroll[_mobPane]=prevEl.scrollTop;   // 숨기기 전에 현재 위치 보관
  _mobPane=which;
  const body=document.getElementById('viewerBody');
  if(body) body.classList.toggle('mob-second', which==='second');
  document.querySelectorAll('#paneTabs .pt-btn').forEach(b=>b.classList.toggle('on', b.dataset.pane===which));
  const nowEl=_scrollEl();
  if(nowEl && _mobScroll[which]!=null) nowEl.scrollTop=_mobScroll[which];   // 왕복 시 맨 위로 튕기지 않게 복원
  attachScrollListener(); updateProgress();
  if(pgEligible()){ _pg.on=false; _pg.chIdx=0; _pg.page=0; enterPageMode(); }   // 페이지 모드: 바뀐 칸으로 재조판
}
function updatePaneTabs(hasSecond,label,opts){
  opts=opts||{};
  const bar=document.getElementById('paneTabs'); if(!bar) return;
  bar.style.display = hasSecond ? '' : 'none';   // 두번째 칸 없으면 탭 숨김 → 본문 전체폭
  const m=document.getElementById('ptMain'), s=document.getElementById('ptSecond');
  if(m) m.textContent=opts.mainLabel||'본문';
  if(s&&label) s.textContent=label;
  // 8/14 사장님 수정요청: 해외고전은 [번역][원문] 순서 — 번역 탭이 왼쪽에 오도록 flex order로 자리 바꿈
  if(m) m.style.order = opts.mainFirst===false ? 2 : 0;
  if(s) s.style.order = 1;
  const def=opts.defaultPane||'main';
  document.querySelectorAll('#paneTabs .pt-btn').forEach(b=>b.classList.toggle('on', b.dataset.pane===def));
}
function _setupMobilePanes(c){   // renderViewer 끝에서 호출 — 탭 라벨/표시·기본 칸 갱신
  _mobPane='main'; _mobScroll={};   // 재렌더 = 새 pane → 보관해둔 탭별 위치 무효
  const body=document.getElementById('viewerBody'); if(body) body.classList.remove('mob-second');
  // 8/17 사장님 수정요청: 폰 챌린지는 장면카드(핵심문장·배경설명) 아래 퀴즈가 이어지는 한 화면 스크롤(.chal-stack).
  //   장면카드가 있는 책만(mpLoadQuiz가 확인한 뒤 _chalStackApply) — 장면카드 없는 책은 왼쪽이 소설 전문이라 쌓으면 퀴즈가 수십만 px 아래로 가서 기존 탭 방식 유지.
  if(body) body.classList.remove('chal-stack');
  let hasSecond,label,opts={};
  if(currentMode==='challenge'){ hasSecond=true; label='퀴즈·수행'; }
  else if(currentMode==='intl'){ hasSecond=true; label='English'; }
  else {
    hasSecond=!!c.trans;
    // 한국고전 평행(krSwap)은 좌우가 스왑돼 두번째 칸=한국어 원문 → [번역][원문], 번역(main)이 기본
    const krSwap = currentBook && currentBook.id && currentBook.id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[currentBook.id];
    if(krSwap){ label='원문'; opts.mainLabel='번역'; }
    else if(hasSecond){
      // 8/14 사장님 수정요청: 해외고전은 영어 원문이 아니라 번역이 기본으로 보이게 + 용어 '본문'→'원문'
      label='번역'; opts.mainLabel='원문'; opts.mainFirst=false; opts.defaultPane='second';
    }
  }
  updatePaneTabs(hasSecond,label,opts);
  if(opts.defaultPane==='second'){ _mobPane='second'; if(body) body.classList.add('mob-second'); }
}
// 위치를 px가 아니라 "문단 청크 인덱스 + 그 안의 비율"로 잡음 → 글자크기를 바꿔도 읽던 자리 유지
function _anchorBlocks(){ const el=_scrollEl(); return el?[...el.querySelectorAll('.cv-chunk, h3.ch-title')]:[]; }
function _captureAnchor(){
  const el=_scrollEl(); if(!el||!el.clientHeight) return null;   // 뷰어가 닫혀(display:none) 레이아웃이 없으면 캡처 무효 — 늦은 타이머가 위치를 책 끝으로 덮는 것 방지
  const blocks=_anchorBlocks(); if(!blocks.length) return null;
  const top=el.scrollTop, paneTop=el.getBoundingClientRect().top;
  // 속표지를 보고 있는 중이면 "아직 안 읽음"으로 기록 — 열었다 바로 닫아도 다음에 표지가 다시 나온다
  const fr=el.querySelector('.book-front');
  if(fr && top < fr.offsetHeight*0.5) return {i:-1, frac:0};
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i];
    const bTop=b.getBoundingClientRect().top - paneTop + top, bH=b.offsetHeight||1;
    if(bTop+bH > top+1) return {i, frac: Math.min(0.999, Math.max(0,(top-bTop)/bH))};
  }
  return {i:blocks.length-1, frac:0};
}
function _applyAnchor(a){
  if(!a||typeof a!=='object') return;
  const el=_scrollEl(); if(!el) return;
  if(a.i<0){ el.scrollTop=0; updateProgress(); return; }   // 속표지 자리
  const blocks=_anchorBlocks(); if(!blocks.length) return;
  const b=blocks[Math.min(a.i, blocks.length-1)]; if(!b) return;
  const bTop=b.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
  el.scrollTop = Math.max(0, bTop + (a.frac||0)*(b.offsetHeight||0));
  updateProgress();
}
// 글자크기·줄간격 변경 등 재배치 작업 전후로 읽던 자리를 보존
function _withAnchorKept(fn){ const a=_captureAnchor(); fn(); requestAnimationFrame(()=>_applyAnchor(a)); }
function saveScrollPos(){
  if(!currentBook) return;
  const a=_captureAnchor(); if(a){ a.m=currentMode; a.t=Date.now(); readerStats.positions[currentBook.id] = a; saveReaderStats(); }   // 모드·시각 기록 — 모드 다르면 복원 생략, 시각은 다기기 최신성 병합용
  // 완독 모드: 완독율 v4 = min(글자수 진행률, 독서시간 환산 진행률) 재계산·저장
  if(currentMode==='full') v4Recalc();
}
function restoreScrollPos(){
  if(!currentBook) return;
  const el = _scrollEl(); if(!el) return;
  const p = readerStats.positions[currentBook.id];
  if(p && typeof p==='object'){
    if(p.m && p.m!==currentMode){ updateProgress(); return; }   // 다른 모드에서 저장된 앵커 = 칸 내용이 달라 엉뚱한 지점 → 복원 생략(처음부터)
    _applyAnchor(p);                                     // 신규: 앵커
  }
  else { el.scrollTop = p || 0; updateProgress(); }       // 구버전 호환: px 숫자
}
// 남은 읽기시간 추정: 보이는 칸 총 글자수 / 읽기속도(한글 ~550자/분, 영문 ~1100자≈220wpm/분).
// pane 요소별 캐시(WeakMap) — 재렌더로 pane 교체되면 자동 무효.
const _readMinCache = new WeakMap();
function _bookTotalMin(el){
  if(!el) return 0;
  let c=_readMinCache.get(el);
  if(!c){
    const ps=el.querySelectorAll('p'); let chars=0;
    for(const p of ps) chars+=p.textContent.length;
    // 언어 판정: 라벨("왼쪽 — …" 한글)이 아닌 본문 <p> 표본의 한글 비율로 — 영어 원문 칸이 한국어(550자/분)로 오판되어 남은시간이 2배 되는 것 방지
    let sample=''; for(const p of ps){ sample+=p.textContent; if(sample.length>=1000) break; }
    const koN=(sample.match(/[가-힣]/g)||[]).length;
    const ko=koN/Math.max(1,sample.length)>=0.2;
    c={min: chars/(ko?550:1100)};
    _readMinCache.set(el,c);
  }
  return c.min;
}
function _fmtReadMin(m){
  if(m<1) return '곧 끝';
  if(m<60) return '약 '+Math.round(m)+'분';
  const h=Math.floor(m/60), mm=Math.round(m%60);
  return '약 '+h+'시간'+(mm?' '+mm+'분':'');
}
function _setProgLabel(frac){
  const lbl=document.getElementById('viewerProgLabel'); if(!lbl) return;
  if(currentMode==='challenge'){ lbl.textContent=''; return; }   // 챌린지 화면: 남은시간 미표시(미션 진행바로 충분)
  frac=Math.max(0,Math.min(1,frac||0));
  const totMin=_bookTotalMin((typeof _pg!=='undefined'&&_pg.on)?_pgSourcePane():_scrollEl());   // 페이지 모드: 숨겨진 left 폴백이 아니라 실제 조판 중인 칸 기준
  const pct=Math.round(frac*100);
  lbl.textContent = totMin>1 ? (pct+'% · 남은 '+_fmtReadMin(totMin*(1-frac))) : (pct+'%');
}
function updateProgress(){
  const el = _scrollEl();
  const bar = document.getElementById('viewerProg');
  if(!el || !bar) return;
  const max = el.scrollHeight - el.clientHeight;
  const frac = max>0 ? el.scrollTop/max : (el.querySelector('.cv-chunk')?1:0);   // 스크롤이 필요 없는 한 화면 책 = 전부 보임 = 100%(페이지 모드 1/1과 일치)
  bar.style.width = (Math.min(100, frac*100)).toFixed(1) + '%';
  _setProgLabel(frac);
}
let _progRAF=0;
function readerOnScroll(){
  v4Activity();   // 완독율 v4: 스크롤 = 읽는 중(2분 무활동 타이머 리셋)
  if(!_progRAF) _progRAF=requestAnimationFrame(()=>{ _progRAF=0; updateProgress(); });   // 스크롤 이벤트마다 reflow 강제 → 1프레임당 1회로 코얼레스
  if(_scrollSaveTimer) clearTimeout(_scrollSaveTimer);
  _scrollSaveTimer = setTimeout(saveScrollPos, 800);
}
/* ── 좌우 동기 스크롤 (PC 나란히: 원문↔번역 길이 달라 비율 기반) ── */
let _activeScrollPane = null, _syncReleaseTimer = null;
function _lockActiveScroll(p){
  _activeScrollPane = p;
  clearTimeout(_syncReleaseTimer);
  _syncReleaseTimer = setTimeout(()=>{ _activeScrollPane = null; }, 150);
}
// 문단 NodeList 캐시 — 매 스크롤 이벤트마다 querySelectorAll(대작 1만+ 문단) 재수집하던 것 방지.
// WeakMap이라 pane이 재렌더로 교체되면 자동 무효(옛 pane과 함께 GC).
const _mirrorPCache = new WeakMap();
function _mirrorPs(pane){
  let a=_mirrorPCache.get(pane);
  if(!a){ a=pane.querySelectorAll('p[data-pi]'); _mirrorPCache.set(pane,a); }
  return a;
}
function _mirrorScroll(src, dst){
  // 정렬책(문단 1:1): 화면 상단 1/3 지점의 문단을 반대쪽도 같은 위치에 — 문단끼리 나란히 감
  if(_parallelOn){
    const anchorY = src.clientHeight * 0.33;
    const sTop = src.getBoundingClientRect().top;
    const arr = _mirrorPs(src);
    if(arr.length){
      let lo = 0, hi = arr.length - 1, found = null;
      while(lo <= hi){   // 이진 탐색 — 긴 책에서도 스크롤마다 rect 10번 안팎
        const mid = (lo + hi) >> 1, r = arr[mid].getBoundingClientRect(), top = r.top - sTop;
        if(top > anchorY) hi = mid - 1;
        else if(top + r.height <= anchorY) lo = mid + 1;
        else { found = arr[mid]; break; }
      }
      if(!found) found = arr[Math.max(0, Math.min(arr.length - 1, lo))];
      const fr = found.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (anchorY - (fr.top - sTop)) / (fr.height || 1)));
      const D = dst.querySelector('p[data-pi="' + found.dataset.pi + '"]');
      if(D){
        const dr = D.getBoundingClientRect();
        const dContentTop = dr.top - dst.getBoundingClientRect().top + dst.scrollTop;
        dst.scrollTop = Math.max(0, dContentTop + frac * dr.height - anchorY);
        return;
      }
    }
  }
  const sMax = src.scrollHeight - src.clientHeight;
  const dMax = dst.scrollHeight - dst.clientHeight;
  dst.scrollTop = sMax > 0 ? (src.scrollTop / sMax) * dMax : 0;
}
function attachScrollListener(){
  const left  = document.querySelector('.viewer-pane.left');
  const right = document.querySelector('.viewer-pane.right');
  if(left)  left.onscroll  = null;
  if(right) right.onscroll = null;
  // 양쪽 칸이 모두 보일 때만(PC 나란히) 비율 동기 스크롤
  if(_vis(left) && _vis(right)){
    left.onscroll  = ()=>{ if(_suppressSync || _activeScrollPane === right) return; _lockActiveScroll(left);  _mirrorScroll(left, right); readerOnScroll(); };
    right.onscroll = ()=>{ if(_suppressSync || _activeScrollPane === left)  return; _lockActiveScroll(right); _mirrorScroll(right, left); readerOnScroll(); };
  } else {
    const el = _scrollEl();
    if(el) el.onscroll = readerOnScroll;
  }
}

/* ── 평행 하이라이트 (정렬 이중언어책: 원문↔번역 문단 1:1) ── */
/* ── 문장 단위 상호 하이라이트 ── PC=호버(양쪽 강조), 모바일=탭(강조+인라인 펼침) ── */
let _sentBound=false;
function setupSentenceParallel(){
  const vb=document.getElementById('viewerBody'); if(!vb) return false;
  if(!vb.querySelector('span.psent')){ vb.classList.remove('sent-mode'); return false; }   // 문장정렬 책 아님
  vb.classList.add('sent-mode');                          // 문단 전체 호버 배경 끄기용
  if(_sentBound) return true;                              // 위임 이벤트 1회 바인딩
  _sentBound=true;
  if(matchMedia('(hover:hover)').matches){                 // PC: 호버
    vb.addEventListener('mouseover', e=>{ const s=e.target.closest('span.psent'); if(s) _sentHot(s); });
    vb.addEventListener('mouseout',  e=>{ const s=e.target.closest('span.psent'); if(s) _sentClear(); });
  } else {                                                  // 모바일: 탭
    vb.addEventListener('click', e=>{
      const s=e.target.closest('span.psent'); if(!s) return;
      // 8/14: 탭 넘김 모드에서 좌/우 끝 탭은 페이지 넘김이 우선 — 문장 원문 펼침은 가운데 탭에서만
      if(readerPrefs.pageMode){
        const r=vb.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width;
        if(x<0.30 || x>0.70) return;
      }
      _sentTap(s);
    });
  }
  return true;
}
function _sentSpans(pi,sg){ return document.querySelectorAll('span.psent[data-pi="'+pi+'"][data-sg="'+sg+'"]'); }
function _sentClear(){
  document.querySelectorAll('span.psent.ps-hot').forEach(x=>x.classList.remove('ps-hot'));
  document.querySelectorAll('.viewer-pane .sent-reveal').forEach(x=>x.remove());
  document.querySelectorAll('.pg-sent-reveal').forEach(x=>x.remove());   // 페이지모드 하단 번역 바
}
function _sentHot(s){   // PC: 같은 pi/sg 양쪽 칸 강조
  _sentClear();
  _sentSpans(s.dataset.pi, s.dataset.sg).forEach(x=>x.classList.add('ps-hot'));
}
/* 8/30 사장님: 폰에서 중국어 문장을 누르면 또 중국어가, 한국어를 누르면 또 한국어가 나왔다.
   한국 고전(kr-)만 왼쪽이 번역·오른쪽이 한국어 원문으로 다른 책과 좌우가 반대인데,
   '반대 언어' 고르기가 그 반전을 안 따라가서 보고 있는 칸과 같은 말이 나왔다.
   짝 자료는 [한국어, 번역] 순서라, 좌우가 뒤집힌 책은 고르는 쪽도 뒤집는다. (베트남·영어·일어 동일) */
function _sentOther(g, inLeft){
  const krSwap = !!(currentBook && currentBook.id && String(currentBook.id).startsWith('kr-')
                    && typeof KR_SENT!=='undefined' && KR_SENT[currentBook.id]);
  return (inLeft !== krSwap) ? (g[1]||'') : (g[0]||'');
}
function _sentTap(s){   // 모바일: 강조 + 반대 언어 인라인 펼침(다시 탭 = 닫기)
  const opened = s.classList.contains('ps-hot');
  _sentClear();
  if(opened) return;
  s.classList.add('ps-hot');
  const grp = (BODIES_SENT[currentBook.id]||[])[+s.dataset.pi];
  const g = grp && grp[+s.dataset.sg];
  if(!g) return;
  const inLeft = !!s.closest('.viewer-pane.left');         // 보이는 칸 기준 반대 언어
  const other = _sentOther(g, inLeft);
  if(!other) return;
  const rev=document.createElement('span'); rev.className='sent-reveal'; rev.textContent=other;
  s.insertAdjacentElement('afterend', rev);
  rev.scrollIntoView({block:'nearest', behavior:'smooth'});
}
function _sentTapPaged(s){   // 페이지모드: 인라인 삽입은 다단 조판(페이지 수)을 흔들어 하단 고정 바로 표시
  const opened = s.classList.contains('ps-hot');
  _sentClear();
  if(opened) return;
  const grp = (BODIES_SENT[currentBook.id]||[])[+s.dataset.pi];
  const g = grp && grp[+s.dataset.sg];
  if(!g) return;
  const src = _pgSourcePane();                             // 조판 원본 칸 기준 반대 언어 (스크롤 모드와 동일 규칙)
  const inLeft = !!(src && src.classList.contains('left'));
  const other = _sentOther(g, inLeft);
  if(!other) return;
  s.classList.add('ps-hot');
  const bar=document.createElement('div'); bar.className='pg-sent-reveal'; bar.textContent=other;
  bar.onclick=_sentClear;
  document.getElementById('pagedView')?.appendChild(bar);
}

let _parallelOn=false, _suppressSync=false, _parallelBound=false, _suppressTimer=null;
function setupParallel(){
  _parallelOn=false;
  const left=document.querySelector('.viewer-pane.left');
  const right=document.querySelector('.viewer-pane.right');
  if(!left||!right||!_vis(left)||!_vis(right)) return;
  // 챕터블록(B) 책: 문단 1:1 짝맞춤 안 함 → _parallelOn=false 유지(비율 동기 스크롤), 챕터 섹션만 정렬
  if(currentBook && typeof CHAPTER_BLOCK_BOOKS!=='undefined' && CHAPTER_BLOCK_BOOKS.has(currentBook.id)){ scheduleAlign(); return; }
  const lp=left.querySelectorAll('p'), rp=right.querySelectorAll('p');
  if(!lp.length || lp.length!==rp.length) return;   // 문단 수 다르면 정렬책 아님
  lp.forEach((p,i)=>p.dataset.pi=i);
  rp.forEach((p,i)=>p.dataset.pi=i);
  _parallelOn=true;
  if(!_parallelBound){
    const vb=document.getElementById('viewerBody');
    if(vb){ vb.addEventListener('click', onParallelClick); _parallelBound=true; }
  }
  syncPairMarks();
  scheduleAlign();   // A안: 문단 쌍 높이 맞춰 좌우 수평 정렬
}
/* ── A안: 정렬책(문단 1:1) 좌우 문단 쌍을 같은 높이로 → 항상 수평 정렬 (짧은 쪽 빈 공백 감수) ── */
let _alignT=0, _alignT2=0, _alignResizeBound=false, _alignRO=null, _alignW=0;
function scheduleAlign(){
  if(!_alignResizeBound){
    window.addEventListener('resize', scheduleAlign);
    if(window.visualViewport) visualViewport.addEventListener('resize', scheduleAlign); // 브라우저 줌·OS 디스플레이 배율(125%/150%) 변화 대응
    window.addEventListener('load', scheduleAlign);                                     // 이미지·리소스 늦게 로드되는 PC 대응
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleAlign); // 웹폰트 로드 후 재측정(캐시 없는 PC)
    // ResizeObserver: 칸 폭이 바뀌면(창·줌·모니터배율·패널 등 무엇이든) 자동 재정렬. 폭 변화일 때만 → 높이 재설정 루프 방지
    if(window.ResizeObserver){
      _alignRO=new ResizeObserver(es=>{
        const w=Math.round((es[0]&&es[0].contentRect.width)||0);
        if(w && w!==_alignW){ _alignW=w; clearTimeout(_alignT); _alignT=setTimeout(alignParallel,60); }
      });
    }
    _alignResizeBound=true;
  }
  if(_alignRO){   // 매 렌더마다 새로 생긴 페인을 다시 관찰
    _alignRO.disconnect();
    const L=document.querySelector('.viewer-pane.left'), R=document.querySelector('.viewer-pane.right');
    if(L) _alignRO.observe(L); if(R) _alignRO.observe(R);
  }
  clearTimeout(_alignT);  _alignT =setTimeout(alignParallel, 60);
  clearTimeout(_alignT2); _alignT2=setTimeout(alignParallel, 500);  // 폰트/레이아웃 늦게 안정화되는 PC 대비 안전 재측정 1회
}
// 챕터블록(B): 챕터 섹션 단위로만 좌우 높이 잠금 → 챕터 경계 정렬 + 양쪽 총높이 동일(비율 스크롤 정확).
// 챕터 내부는 자연 흐름(짧은쪽 하단 여백). 드리프트한 문장쌍 정렬을 회피.
function alignSections(L,R){
  const ls=[...L.querySelectorAll('.chapter-anchor')], rs=[...R.querySelectorAll('.chapter-anchor')];
  const lc=[...L.querySelectorAll('.cv-chunk')], rc=[...R.querySelectorAll('.cv-chunk')];
  [...ls,...rs].forEach(s=>s.style.minHeight='');
  [...lc,...rc].forEach(c=>{ c.style.minHeight=''; c.style.contentVisibility='visible'; });   // 측정 위해 강제 렌더
  const n=Math.min(ls.length,rs.length), hs=[];
  for(let i=0;i<n;i++) hs.push(Math.max(ls[i].offsetHeight, rs[i].offsetHeight));   // 읽기 일괄
  for(let i=0;i<n;i++){ ls[i].style.minHeight=hs[i]+'px'; rs[i].style.minHeight=hs[i]+'px'; }   // 쓰기 일괄
  [...lc,...rc].forEach(c=>c.style.contentVisibility='');   // 가상화 복귀(섹션 min-height는 유지)
}
function alignParallel(){
  const L=document.querySelector('.viewer-pane.left'), R=document.querySelector('.viewer-pane.right');
  if(!L||!R) return;
  // 챕터블록 책: 섹션 단위 정렬로 분기
  if(currentBook && typeof CHAPTER_BLOCK_BOOKS!=='undefined' && CHAPTER_BLOCK_BOOKS.has(currentBook.id)){
    if(!_vis(L)||!_vis(R)){ [L,R].forEach(P=>P.querySelectorAll('.chapter-anchor,.cv-chunk').forEach(e=>{ e.style.minHeight=''; })); return; }
    alignSections(L,R); return;
  }
  const lc=L.querySelectorAll('.cv-chunk'), rc=R.querySelectorAll('.cv-chunk');
  if(!_vis(L)||!_vis(R)){   // 단일 페인(원문만/번역만)·모바일 탭 → 정렬용 스타일 제거(빈 공백 방지)
    [L,R].forEach(P=>P.querySelectorAll('p[data-pi],h3.ch-title,.cv-chunk').forEach(e=>{ e.style.minHeight=''; e.style.lineHeight=''; }));
    return;
  }
  const lp=L.querySelectorAll('p[data-pi]'), rp=R.querySelectorAll('p[data-pi]');
  if(!lp.length || lp.length!==rp.length) return;        // 정렬책(문단 1:1) 아니면 패스 — ko전용은 건너뜀
  const lh=L.querySelectorAll('h3.ch-title'), rh=R.querySelectorAll('h3.ch-title');
  // 1) 이전 min-height·line-height 초기화 + 측정 위해 cv-chunk 강제 렌더(화면 밖도)
  lp.forEach(p=>{ p.style.minHeight=''; p.style.lineHeight=''; }); rp.forEach(p=>p.style.minHeight='');
  lh.forEach(h=>h.style.minHeight=''); rh.forEach(h=>h.style.minHeight='');
  [...lc,...rc].forEach(c=>{ c.style.minHeight=''; c.style.contentVisibility='visible'; });
  const rmap={}; rp.forEach(p=>{ rmap[p.dataset.pi]=p; });
  // 1.5) ★ 원문(왼쪽 영어)을 번역(오른쪽 한국어) 높이에 맞춰 줄간격 조절 → 한국어는 자연 균일간격 유지,
  //      빈 공간(padding) 없이 문단시작 정렬. gb-책(영어원문+한국어번역)만. 읽기 일괄 후 쓰기 일괄(thrash 최소화).
  if(currentBook && currentBook.id && currentBook.id.startsWith('gb-')){
    const baseLH = parseFloat(getComputedStyle(L).lineHeight) || 0;
    const fs = parseFloat(getComputedStyle(lp[0]||L).fontSize) || 15;
    const meas=[]; lp.forEach(l=>{ const r=rmap[l.dataset.pi]; meas.push(r?[l, l.offsetHeight, r.offsetHeight]:null); });  // 읽기 일괄(자연 높이)
    if(baseLH>0) meas.forEach(m=>{ if(!m) return; const [l,enH,koH]=m;
      if(enH>0 && koH>0 && Math.abs(enH-koH) > baseLH*0.6){   // 반 줄 이상 차이날 때만 조절
        const lhpx = Math.max(fs*1.25, Math.min(fs*2.6, baseLH*(koH/enH)));  // 가독성 클램프(1.25~2.6배)
        l.style.lineHeight = lhpx+'px';
      }});
  }
  // 2) 읽기(레이아웃 1회) → 쓰기 분리(thrash 방지). 문단 쌍은 data-pi로, 장 제목은 순서로 매칭
  const work=[];
  lp.forEach(l=>{ const r=rmap[l.dataset.pi]; if(r) work.push([l,r,Math.max(l.offsetHeight,r.offsetHeight)]); });
  const hwork=[];
  for(let i=0;i<Math.min(lh.length,rh.length);i++) hwork.push([lh[i],rh[i],Math.max(lh[i].offsetHeight,rh[i].offsetHeight)]);
  work.forEach(([l,r,h])=>{ l.style.minHeight=h+'px'; r.style.minHeight=h+'px'; });
  hwork.forEach(([l,r,h])=>{ l.style.minHeight=h+'px'; r.style.minHeight=h+'px'; });
  // 3) ★ 문단쌍 정렬 후 cv-chunk 컨테이너 높이도 좌우 동일하게 잠금. 좌우 청크는 동일 12문단 경계로 생성돼
  //    개수·순서가 같다. 화면 밖으로 나가 content-visibility가 내부를 스킵(contain-intrinsic-size)해도
  //    청크 박스 min-height가 좌우 같아 스크롤 누적 드리프트 방지(auto 미지원 브라우저·모니터 무관 정합).
  const cwork=[];
  for(let i=0;i<Math.min(lc.length,rc.length);i++) cwork.push([lc[i],rc[i],Math.max(lc[i].offsetHeight,rc[i].offsetHeight)]);
  cwork.forEach(([l,r,h])=>{ l.style.minHeight=h+'px'; r.style.minHeight=h+'px'; });
  // 4) cv-chunk 렌더 스킵 복귀(청크 min-height는 유지 → 화면 밖에서도 높이 고정, 대작 성능 보존)
  [...lc,...rc].forEach(c=>c.style.contentVisibility='');
}
/* 형광펜 친 원문 문단의 번역 문단에 .hl-pair 마커 동기화 (정렬책 전용) */
function syncPairMarks(){
  document.querySelectorAll('.viewer-pane p.hl-pair').forEach(p=>p.classList.remove('hl-pair'));
  if(!_parallelOn) return;
  const left=document.querySelector('.viewer-pane.left');
  const right=document.querySelector('.viewer-pane.right');
  if(!left||!right) return;
  // 양방향: 어느 칸의 형광펜이든 반대 칸 같은 문단에 골드 마커 (형광펜이 이미 있는 문단은 생략)
  const mirror=(from,to)=>{
    const pis=new Set();
    from.querySelectorAll('mark.hl[data-hlts]').forEach(mk=>{
      const p=mk.closest('p[data-pi]'); if(p) pis.add(p.dataset.pi);
    });
    pis.forEach(pi=>{
      const R=to.querySelector('p[data-pi="'+pi+'"]');
      if(R && !R.querySelector('mark.hl')) R.classList.add('hl-pair');
    });
  };
  mirror(left,right); mirror(right,left);
}
function _clearParallel(){ document.querySelectorAll('.viewer-pane p.pp-on').forEach(p=>p.classList.remove('pp-on')); }
function onParallelClick(e){
  if(!_parallelOn) return;
  const p=e.target.closest('.viewer-pane p[data-pi]');
  if(!p) return;
  const sel=window.getSelection();
  if(sel && sel.toString().trim().length>1) return;   // 드래그 선택 중이면 무시
  const pi=p.dataset.pi;
  _clearParallel();
  const left=document.querySelector('.viewer-pane.left');
  const right=document.querySelector('.viewer-pane.right');
  const L=left.querySelector('p[data-pi="'+pi+'"]');
  const R=right.querySelector('p[data-pi="'+pi+'"]');
  if(L) L.classList.add('pp-on');
  if(R) R.classList.add('pp-on');
  // 양쪽 문단을 각 칸 중앙으로 (동기 스크롤 일시 정지 → 핑퐁 방지)
  _suppressSync=true;
  // 대상 문단이 content-visibility로 가상화된(화면 밖) 청크 안이면 offsetTop/clientHeight가 부정확 →
  // 좌우가 서로 다른 곳으로 스크롤돼 어긋남(첫 클릭 실패, 재클릭 시 화면에 들어와 정상). 먼저 강제 렌더 후 측정.
  [L,R].forEach(el=>{ const ch=el&&el.closest('.cv-chunk'); if(ch) ch.style.contentVisibility='visible'; });
  const center=(pane,el)=>{ if(pane&&el&&_vis(pane)) pane.scrollTo({top: el.offsetTop - pane.clientHeight/2 + el.clientHeight/2, behavior:'smooth'}); };
  center(left,L); center(right,R);
  clearTimeout(_suppressTimer);
  _suppressTimer=setTimeout(()=>{ _suppressSync=false; updateProgress();
    [L,R].forEach(el=>{ const ch=el&&el.closest('.cv-chunk'); if(ch) ch.style.contentVisibility=''; }); }, 650);
}

/* 읽기 세션 · streak */
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function bumpStreak(){
  const today = todayKey();
  if(readerStats.streak.last === today) return;
  const y = new Date(); y.setDate(y.getDate()-1);
  const yk = y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
  readerStats.streak.count = (readerStats.streak.last === yk) ? (readerStats.streak.count+1) : 1;
  readerStats.streak.last = today;
  saveReaderStats();
}
function readerSessionStart(){ _readerSessionStart = Date.now(); bumpStreak(); }
function readerSessionEnd(){
  if(!_readerSessionStart) return;
  try{ bxReadAcc(Math.min((Date.now()-_readerSessionStart)/1000, 90*60), (typeof currentBook!=='undefined'?currentBook:null)); }catch(e){}   // 측정: 읽은 초 누적(닫을 때 1줄)
  // 한 번에 세는 시간은 최대 90분으로 상한 — 탭을 켜둔 채 자리를 비운 경우 과대 집계 방지
  const mins = Math.min(Math.round((Date.now() - _readerSessionStart) / 60000), 90);
  if(mins > 0){
    const tk = todayKey();
    const day = Math.min((readerStats.readingTime.days[tk]||0) + mins, 300);   // 하루 ≤ 5시간
    const add = day - (readerStats.readingTime.days[tk]||0);
    readerStats.readingTime.days[tk] = day;
    readerStats.readingTime.total = (readerStats.readingTime.total||0) + add;
    saveReaderStats();
  }
  _readerSessionStart = 0;
}
// 탭이 가려지면(다른 창·잠금) 읽기 타이머 일시정지, 돌아오면 재개 — 백그라운드 누적 방지
function _viewerOpen(){ return document.getElementById('viewerOverlay')?.classList.contains('open'); }
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){ if(_viewerOpen()) readerSessionEnd(); }
  else { if(_viewerOpen() && !_readerSessionStart){ _readerSessionStart = Date.now(); bumpStreak(); } }   // 자정 넘겨 계속 읽는 경우 새 날짜 streak 반영
});

/* ── 완독율 v4 — min(글자수 진행률, 독서시간 환산 진행률) · 규칙 문서: 북스타_완독율_최종규칙_v4.md ──
   글자수 진행률: 가장 멀리 도달한 지점(뒤로 가도 안 줄어듦)
   독서시간: 책별 누적, 화면 이탈·같은 자리 2분 무활동이면 멈춤
   필요시간 기준: 글자당 0.08초 → 시간환산% = 누적초 / (전체글자 × 0.08) */
const V4_SEC_PER_CHAR = 0.08;
const V4_IDLE_MS = 120000;
let _v4LastAct = Date.now();
let _v4Cache = {bookId:null, total:0};
function v4Activity(){ _v4LastAct = Date.now(); }
function _v4TotalChars(){   // 책 전체 글자수 — 한국어(한글 포함) 칸 기준, 책당 1회 계산
  if(!currentBook) return 0;
  if(_v4Cache.bookId === currentBook.id && _v4Cache.total > 0) return _v4Cache.total;
  const panes=[document.querySelector('.viewer-pane.left'), document.querySelector('.viewer-pane.right')].filter(Boolean);
  if(!panes.length) return 0;
  // 칸 선택: 라벨("왼쪽 — …" 한글)에 속지 않도록 본문 <p>의 한글 글자수가 많은 쪽을 한국어 칸으로 판정
  const koCount = pn => { let n=0; pn.querySelectorAll('p').forEach(el=>{ n+=((el.textContent||'').match(/[가-힣]/g)||[]).length; }); return n; };
  const pane = (panes.length>1 && koCount(panes[1])>koCount(panes[0])) ? panes[1] : panes[0];
  let total=0;
  pane.querySelectorAll('p').forEach(p=>{ const t=p.textContent||''; if(/[가-힣]/.test(t)) total+=t.length; });
  if(total<500){ total=0; pane.querySelectorAll('p').forEach(p=>{ total+=(p.textContent||'').length; }); }
  if(total<200) return 0;   // 본문 로드 실패 placeholder(수십 자)를 책 전체로 오인해 완독율 100% 오염되는 것 차단
  _v4Cache={bookId:currentBook.id, total};
  return total;
}
function _v4Frac(){   // 지금 도달한 지점(0~1) — 스크롤=화면 하단 기준, 페이지 모드=장 글자가중 + 장 내 페이지 비율
  if(typeof _pg!=='undefined' && _pg.on && _pg.chapters && _pg.chapters.length){
    if(!_pg.v4w || _pg.v4w.length!==_pg.chapters.length)
      _pg.v4w=_pg.chapters.map(c=>Math.max(1,(c.html||'').replace(/<[^>]+>/g,'').length));
    const sum=_pg.v4w.reduce((a,b)=>a+b,0);
    let before=0; for(let i=0;i<_pg.chIdx;i++) before+=_pg.v4w[i];
    const inCh=_pg.count?((_pg.page+1)/_pg.count):0;
    return Math.min(1,(before+inCh*(_pg.v4w[_pg.chIdx]||0))/sum);
  }
  const el=_scrollEl(); if(!el||!el.scrollHeight) return 0;
  return Math.min(1,(el.scrollTop+el.clientHeight)/el.scrollHeight);
}
function v4Recalc(){   // 완독율 재계산 → 로컬 저장 + 5% 계단·90%+에서만 서버 반영
  if(!currentBook || currentMode!=='full') return;
  const total=_v4TotalChars(); if(!total) return;
  const cur=_chalRead(currentBook.id)||{};
  // char_pct: 최대 도달 글자% (기존 read_pct도 하한으로 — 다른 기기에서 온 기록 보호)
  const charPct=Math.max(cur.char_pct||0, cur.read_pct||0, Math.min(100,_v4Frac()*100));
  const sec=cur.read_sec||0;
  const timePct=Math.min(100, sec/(total*V4_SEC_PER_CHAR)*100);
  const pct=Math.floor(Math.min(charPct,timePct));
  const prev=cur.read_pct||0;
  const patch={char_pct:Math.round(charPct*10)/10};
  if(pct>prev) patch.read_pct=pct;   // 완독율은 오르기만 함
  _chalMerge(currentBook.id,patch);
  if(pct>prev && (Math.floor(pct/5)>Math.floor(prev/5) || pct>=90)){ bxUpsertRead(currentBook.id,pct,sec); try{ renderQuestMap(); }catch(e){} }
  if(pct>=90) maybeCertPrompt(currentBook.id);   // 90% 도달 → 완독 인증 제안(책당 1회)
}
let _v4TickN=0;
setInterval(()=>{   // 독서시간 심박 5초 — 뷰어 닫힘·화면 이탈·2분 무활동이면 누적 안 함
  if(!_viewerOpen() || document.hidden || !currentBook || currentMode!=='full') return;
  if(Date.now()-_v4LastAct > V4_IDLE_MS) return;
  const cur=_chalRead(currentBook.id)||{};
  _chalMerge(currentBook.id,{read_sec:(cur.read_sec||0)+5});
  if(++_v4TickN%6===0) v4Recalc();   // 스크롤 없이 시간만 차오를 때도 30초마다 완독율 갱신
}, 5000);
document.addEventListener('pointerdown', ()=>{ if(_viewerOpen()) v4Activity(); }, true);
document.addEventListener('keydown', ()=>{ if(_viewerOpen()) v4Activity(); }, true);

/* 하이라이트 (완독 모드에서만) — 위치 앵커(장+문단+글자위치) 저장 → 다시 열어도 복원 */
function setupHighlightHandlers(){
  const maybeShow = (tgt) => {
    const popup = document.getElementById('hlPopup');
    if(!popup) return;
    if(tgt && (tgt.closest('#hlPopup') || tgt.closest('.hl-note-box'))) return;   // 팝업·메모박스 조작 중엔 유지
    if(!tgt && document.getElementById('hlNoteBox')) return;   // 터치 보강 경로: 메모 입력 중엔 건드리지 않음
    if(currentMode !== 'full'){ popup.style.display = 'none'; return; }
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if(!text || text.length < 2){ popup.style.display = 'none'; _lastSelectionRange = null; return; }
    if(sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // 원문·번역 어느 칸이든 허용 (모바일 기본 탭=번역이라 left 한정이면 대부분 경로에서 죽음). AI챗 칸만 제외
    const pane0 = _elOf(range.startContainer)?.closest('#viewerBody .viewer-pane');
    if(!pane0 || pane0.classList.contains('bx-pane')) return;
    _lastSelectionRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    // 9/2: 한글 선택인데 이 책 용어집에 없으면 [사전] 버튼 숨김 — 온라인 폴백은 영어 사전뿐이라 헛도는 버튼
    const dictBtn = document.getElementById('hlDictBtn');
    if(dictBtn) dictBtn.style.display = (/[가-힣]/.test(text) && !dictEntryFor(text)) ? 'none' : '';
    popup.style.display = 'flex';
    // 먼저 표시해 실제 폭을 잰 뒤 좌우 클램프 — 좁은 화면에서 오른쪽 잘림 방지
    // 8/17 사장님 수정요청(폰에서 우리 메뉴가 '복사·공유·웹 검색' 뒤에 숨음): 폰은 선택 문장 바로 위(브라우저 기본 툴바 자리)를 피해
    //   화면 맨 위 가운데에 띄운다. 브라우저 기본 툴바·구글 검색 바 자체는 웹에서 끌 수 없음.
    // 8/18 사장님 수정요청: 폰에서는 화면 '맨 아래' 가운데에 고정(브라우저 기본 툴바는 선택 문장 위에 뜨므로 아래에 두면 안 겹침)
    if(window.innerWidth<=600){
      popup.classList.add('hl-popup-bottom');
      popup.style.left = Math.max(6, (window.innerWidth - popup.offsetWidth)/2) + 'px';
      popup.style.top  = 'auto';
    } else {
      popup.classList.remove('hl-popup-bottom');
      const px = rect.left + rect.width/2 - popup.offsetWidth/2;
      popup.style.left = Math.max(8, Math.min(px, window.innerWidth - popup.offsetWidth - 8)) + 'px';
      popup.style.top  = Math.max(8, rect.top - 44) + 'px';
    }
  };
  document.addEventListener('mouseup', (e) => maybeShow((e.target && e.target.closest) ? e.target : null));
  // iOS·안드로이드 롱프레스 선택은 mouseup이 안정적으로 오지 않음 → 터치 기기만 selectionchange로 보강
  if(window.matchMedia && matchMedia('(hover:none)').matches){
    let _selT = null;
    document.addEventListener('selectionchange', () => {
      clearTimeout(_selT); _selT = setTimeout(() => maybeShow(null), 400);
    });
  }
  // 본문 형광펜 클릭 → 메모 보기·수정·지우기 / 박스 밖 클릭 → 닫기
  document.addEventListener('click', (e) => {
    const tgt = (e.target && e.target.closest) ? e.target : null;
    const mk = tgt && tgt.closest('mark.hl');
    if(mk && mk.dataset.hlts){ hlMarkMenu(mk, e.clientX, e.clientY); return; }
    // 8/17 사장님 수정요청(메모 창 안 뜸): [메모] 버튼 클릭이 문서까지 버블돼 방금 연 메모박스를 곧바로 닫던 것 → 팝업 안 클릭은 제외
    if(tgt && tgt.closest('#hlPopup')) return;
    if(!(tgt && tgt.closest('.hl-note-box'))) closeNoteBox();
  });
}
function _elOf(n){ return n && (n.nodeType === 1 ? n : n.parentElement); }
// 문단 안 [start,end) 글자 구간을 mark.hl로 감쌈 — 텍스트 노드 분할 방식이라 <br> 걸쳐도 안전
function _hlWrap(p, start, end, ts, note){
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let acc = 0, n, targets = [];
  while((n = walker.nextNode())){
    const len = n.nodeValue.length, s = acc, e2 = acc + len; acc = e2;
    if(e2 <= start) continue;
    if(s >= end) break;
    targets.push({n, from: Math.max(0, start - s), to: Math.min(len, end - s)});
  }
  let first = null;
  targets.forEach(t => {
    let node = t.n;
    if(t.to < node.nodeValue.length) node.splitText(t.to);
    if(t.from > 0) node = node.splitText(t.from);
    if(!node.nodeValue) return;
    const mk = document.createElement('mark');
    mk.className = 'hl' + (note ? ' has-note' : '');
    mk.dataset.hlts = ts;
    node.parentNode.insertBefore(mk, node);
    mk.appendChild(node);
    if(!first) first = mk;
  });
  return first;
}
function addHighlight(fromNote){
  if(!_lastSelectionRange || !currentBook) return null;
  const r = _lastSelectionRange;
  document.getElementById('hlPopup').style.display = 'none';
  const p  = _elOf(r.startContainer)?.closest('p');
  const p2 = _elOf(r.endContainer)?.closest('p');
  const pane = p?.closest('.viewer-pane');
  if(!p || !p2 || !pane || p2.closest('.viewer-pane') !== pane){
    readerToast('본문 안의 텍스트만 하이라이트할 수 있어요');
    window.getSelection().removeAllRanges(); _lastSelectionRange = null;
    return null;
  }
  // 9/2: 여러 문단에 걸친 드래그 허용 — 문단마다 하나씩 잘라 저장 (기존: "한 단락 안에서만" 안내 후 거부)
  const _offIn = (para, node, offset) => { const pre = document.createRange(); pre.selectNodeContents(para); pre.setEnd(node, offset); return pre.toString().length; };
  const startOff = _offIn(p, r.startContainer, r.startOffset);
  const endOff   = _offIn(p2, r.endContainer, r.endOffset);
  const all = [...pane.querySelectorAll('p')];
  const i0 = all.indexOf(p), i1 = all.indexOf(p2);
  const segs = [];
  if(i0 < 0 || i1 < i0){ segs.push({para: p, s: startOff, e: startOff + r.toString().length}); }
  else for(let i = i0; i <= i1; i++){
    const para = all[i], len = para.textContent.length;
    const s = (i === i0) ? startOff : 0, e = (i === i1) ? endOff : len;
    if(e > s && para.textContent.slice(s, e).trim()) segs.push({para, s, e});
  }
  if(!readerStats.highlights[currentBook.id]) readerStats.highlights[currentBook.id] = [];
  const ts0 = Date.now();
  let first = null;
  segs.forEach((sg, k) => {
    const ts = ts0 + k;   // 문단별 항목은 ts로 구분·삭제되므로 1ms씩 어긋나게
    const text = sg.para.textContent.slice(sg.s, sg.e);
    _hlWrap(sg.para, sg.s, sg.e, ts);
    // 위치 앵커: 몇 번째 장(ch)·문단(p)·글자(off)인지 — 다시 열 때 복원용
    const sec = sg.para.closest('.chapter-anchor');
    const ch = sec ? [...pane.querySelectorAll('.chapter-anchor')].indexOf(sec) : -1;
    const pi = (ch >= 0 ? [...sec.querySelectorAll('p')] : all).indexOf(sg.para);
    // pn: 어느 칸의 앵커인지 (l=원문/좌, r=번역/우) — 복원·점프 때 같은 칸에 되그림. 옛 기록(pn 없음)=l
    const entry = {text, ts, anc: {ch, p: pi, off: sg.s, pn: pane.classList.contains('right') ? 'r' : 'l'}};
    readerStats.highlights[currentBook.id].push(entry);
    if(!first) first = entry;
  });
  if(!first){ window.getSelection().removeAllRanges(); _lastSelectionRange = null; return null; }
  saveReaderStats();
  if(!fromNote) readerToast('✦ 하이라이트 저장 — 독서노트에서 확인');
  window.getSelection().removeAllRanges(); _lastSelectionRange = null;
  buildNotesIfOpen();
  syncPairMarks();   // 정렬책: 번역쪽 같은 문단에 골드 마커
  return first;
}
function addNote(){
  if(!_lastSelectionRange || !currentBook) return;
  const rect = _lastSelectionRange.getBoundingClientRect();
  const entry = addHighlight(true);
  if(!entry) return;
  openNoteBox(entry.ts, rect.left + rect.width/2, rect.bottom);
}
/* 다시 열 때 형광펜 복원 (완독 모드 — 각 앵커가 기록된 칸에 되그림) */
function restoreHighlights(){
  if(!currentBook || currentMode !== 'full') return;
  const hls = readerStats.highlights[currentBook.id] || [];
  if(!hls.length) return;
  const panes = {l: document.querySelector('.viewer-pane.left'),
                 r: document.querySelector('.viewer-pane.right:not(.bx-pane)')};
  if(!panes.l && !panes.r) return;
  if((panes.l && panes.l.querySelector('mark.hl[data-hlts]')) ||
     (panes.r && panes.r.querySelector('mark.hl[data-hlts]'))) return;   // 이미 복원됨
  const secsOf = {};
  hls.forEach(h => {
    if(!h.anc) return;   // 옛 기록(위치 정보 없음): 독서노트 목록에서만 보임
    const key = h.anc.pn === 'r' ? 'r' : 'l';
    const pane = panes[key];
    if(!pane) return;
    if(!secsOf[key]) secsOf[key] = [...pane.querySelectorAll('.chapter-anchor')];
    const secs = secsOf[key];
    const scope = (h.anc.ch >= 0 && secs[h.anc.ch]) ? secs[h.anc.ch] : pane;
    const ps = [...scope.querySelectorAll('p')];
    const p = ps[h.anc.p];
    if(!p) return;
    let off = h.anc.off;
    const tc = p.textContent;
    if(tc.substr(off, h.text.length) !== h.text){ off = tc.indexOf(h.text); if(off < 0) return; }
    _hlWrap(p, off, off + h.text.length, h.ts, h.note);
  });
  syncPairMarks();
}
/* 메모 입력 박스 — prompt() 대체 인라인 */
function openNoteBox(ts, x, y){
  closeNoteBox();
  const h = (readerStats.highlights[currentBook?.id] || []).find(v => v.ts === ts);
  if(!h) return;
  const box = document.createElement('div'); box.className = 'hl-note-box'; box.id = 'hlNoteBox';
  box.innerHTML = `<textarea id="hlNoteText" placeholder="이 문장에 메모 남기기…">${h.note ? esc(h.note) : ''}</textarea>
    <div class="hnb-row"><button class="hnb-cancel" onclick="closeNoteBox()">취소</button>
    <button class="hnb-save" onclick="saveNoteBox(${ts})">저장</button></div>`;
  _fsHost().appendChild(box);   // 8/17: 화면 꽉 채우기(fullscreen) 중에도 보이게
  const bw = 260;
  box.style.left = Math.min(window.innerWidth - bw - 8, Math.max(8, (x || 80) - bw/2)) + 'px';
  box.style.top  = Math.min(window.innerHeight - 170, Math.max(8, (y || 80) + 8)) + 'px';
  setTimeout(() => document.getElementById('hlNoteText')?.focus(), 0);
}
function closeNoteBox(){ document.getElementById('hlNoteBox')?.remove(); }
function saveNoteBox(ts){
  const v = (document.getElementById('hlNoteText') || {}).value || '';
  const h = (readerStats.highlights[currentBook?.id] || []).find(x => x.ts === ts);
  if(!h){ closeNoteBox(); return; }
  if(v.trim()) h.note = v.trim(); else delete h.note;
  saveReaderStats(); closeNoteBox();
  document.querySelectorAll(`mark.hl[data-hlts="${ts}"]`).forEach(m => m.classList.toggle('has-note', !!h.note));
  buildNotesIfOpen();
  readerToast(h.note ? '📝 메모 저장' : '메모 삭제됨');
}
function buildNotesIfOpen(){ const d = document.getElementById('notesDrawer'); if(d && d.classList.contains('open')) buildNotes(); }
/* 완독 모드 첫 진입 시 형광펜 사용법 안내 (1회만) */
function hlHintOnce(){
  if(currentMode !== 'full') return;
  try{
    if(localStorage.getItem('bookstar-hl-hint')) return;
    localStorage.setItem('bookstar-hl-hint', '1');
  }catch(e){ return; }
  setTimeout(() => readerToast('💡 문장을 드래그하면 형광펜·메모를 남길 수 있어요'), 900);
}
/* 본문 형광펜 클릭 메뉴 */
function hlMarkMenu(mk, x, y){
  const ts = +mk.dataset.hlts;
  const h = (readerStats.highlights[currentBook?.id] || []).find(v => v.ts === ts);
  if(!h) return;
  closeNoteBox();
  const box = document.createElement('div'); box.className = 'hl-note-box'; box.id = 'hlNoteBox';
  box.innerHTML = `${h.note ? `<div class="hnb-note">📝 ${esc(h.note)}</div>` : ''}
    <div class="hnb-row"><button class="hnb-cancel" onclick="hlDelete(${ts})">형광펜 지우기</button>
    <button class="hnb-save" onclick="openNoteBox(${ts},${Math.round(x)},${Math.round(y)})">${h.note ? '메모 수정' : '메모 추가'}</button></div>`;
  _fsHost().appendChild(box);
  const bw = 260;
  box.style.left = Math.min(window.innerWidth - bw - 8, Math.max(8, (x || 80) - bw/2)) + 'px';
  box.style.top  = Math.min(window.innerHeight - 130, Math.max(8, (y || 80) + 10)) + 'px';
}
function hlDelete(ts){
  if(!currentBook) return;
  const arr = readerStats.highlights[currentBook.id] || [];
  const i = arr.findIndex(h => h.ts === ts);
  if(i < 0) return;
  arr.splice(i, 1);
  if(!readerStats.deleted) readerStats.deleted={}; readerStats.deleted['h'+ts]=Date.now();   // 톰스톤 — 다기기 병합 시 되살아나지 않게
  saveReaderStats();
  document.querySelectorAll(`mark.hl[data-hlts="${ts}"]`).forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  document.querySelectorAll('.viewer-pane, .paged-flow').forEach(p => p.normalize());
  closeNoteBox(); buildNotesIfOpen();
  syncPairMarks();
  readerToast('하이라이트 삭제됨');
}
/* 독서노트에서 형광펜 위치로 점프 */
function _hlFlash(mk){ mk.classList.add('hl-flash'); setTimeout(() => mk.classList.remove('hl-flash'), 1500); }
function hlJump(ts){
  const h = (readerStats.highlights[currentBook?.id] || []).find(v => v.ts === ts);
  if(!h) return;
  if(!h.anc){ readerToast('옛 기록이라 위치 정보가 없어요'); return; }
  const d = document.getElementById('notesDrawer');
  if(window.innerWidth <= 600 && d?.classList.contains('open')) toggleNotes();
  const _hlPn = (h.anc.pn === 'r') ? 'r' : 'l';   // 형광펜이 기록된 칸으로 탭 전환
  if(window.innerWidth <= 600){ const want = _hlPn === 'r' ? 'second' : 'main'; if(_mobPane !== want) switchMobilePane(want); }
  if(_pg.on){   // 페이지 모드: 해당 장으로 간 뒤 형광펜이 있는 페이지 계산
    showChapter(Math.max(0, h.anc.ch), 0);
    requestAnimationFrame(() => {
      const mk = document.querySelector(`#pagedFlow mark.hl[data-hlts="${h.ts}"]`);
      if(!mk) return;
      const pg = Math.max(0, Math.min(_pg.count - 1, Math.floor((mk.offsetLeft + 2) / (_pg.colW + _pg.gap))));
      _pg.page = pg; applyPageTransform(); updatePagedInfo(); pgSave();
      _hlFlash(mk);
    });
    return;
  }
  const pane = document.querySelector(_hlPn === 'r' ? '.viewer-pane.right:not(.bx-pane)' : '.viewer-pane.left');
  const mk = pane ? pane.querySelector(`mark.hl[data-hlts="${h.ts}"]`) : null;
  if(!mk){ readerToast('본문에서 위치를 찾지 못했어요'); return; }
  const el = pane;   // 형광펜이 있는 칸을 직접 스크롤 (반대 칸은 동기 스크롤이 따라옴)
  if(el){
    const top = mk.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 90;
    el.scrollTo({top: Math.max(0, top), behavior: 'smooth'});
  }
  _hlFlash(mk);
  // 정렬책: 반대 칸 같은 문단도 잠깐 강조
  if(_parallelOn){
    const p = mk.closest('p[data-pi]');
    const oppSel = _hlPn === 'r' ? '.viewer-pane.left' : '.viewer-pane.right';
    const R = p ? document.querySelector(oppSel + ' p[data-pi="' + p.dataset.pi + '"]') : null;
    if(R){ R.classList.add('pp-on'); setTimeout(() => R.classList.remove('pp-on'), 1600); }
  }
}

/* 모드 클래스 */
function updateModeClass(){
  const shell = document.querySelector('.viewer-shell');
  if(shell) shell.classList.toggle('mode-challenge', currentMode === 'challenge');
}


/* ── 본문 검색 ── */
let _searchHits = [], _searchIdx = -1;
function openSearch(){
  const bar = document.getElementById('readerSearchbar');
  bar.classList.add('open');
  // 8/30: 검색 중에는 메뉴를 항상 띄워 둔다 — 스크롤·탭으로 메뉴가 오르내리며 검색창을 덮던 문제
  const _sh=document.querySelector('.viewer-shell');
  if(_sh){ _sh.classList.add('searching'); _sh.classList.remove('chrome-hidden'); }
  const inp = document.getElementById('searchInput');
  inp.value=''; inp.focus();
  document.getElementById('searchCount').textContent='';
}
function closeSearch(){
  document.getElementById('readerSearchbar').classList.remove('open');
  document.querySelector('.viewer-shell')?.classList.remove('searching');
  clearSearchHits();
}
function clearSearchHits(){
  const had=_searchHits.length;
  document.querySelectorAll('.viewer-pane mark.search-hit').forEach(m=>{
    const t = document.createTextNode(m.textContent); m.replaceWith(t);
  });
  document.querySelectorAll('.viewer-pane').forEach(p=>p.normalize());
  _searchHits=[]; _searchIdx=-1;
  if(had && typeof _pg!=='undefined' && _pg.on){   // 페이지모드: 클론에 남은 검색 표시 제거(재조판)
    _pg.chapters=buildPagedChapters(); showChapter(_pg.chIdx,_pg.page);
  }
}
function runSearch(dir){
  const q = document.getElementById('searchInput').value.trim();
  if(!q){ clearSearchHits(); document.getElementById('searchCount').textContent=''; return; }
  // 이미 같은 검색이면 다음/이전 이동
  if(_searchHits.length && _searchHits[0]._q === q){
    moveSearch(dir); return;
  }
  clearSearchHits();
  // 페이지모드는 조판 원본 칸에서 검색해야 클론(화면)에 표시가 실린다. 스크롤 모드는 기존대로 좌측 우선
  const pane = (typeof _pg!=='undefined' && _pg.on ? _pgSourcePane() : null)
             || document.querySelector('.viewer-pane.left') || document.querySelector('.viewer-pane');
  if(!pane) return;
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, {
    // g 플래그 test()는 성공 시 lastIndex를 남겨 다음 노드 검사가 중간부터 시작됨(결과 누락) → 매번 리셋
    acceptNode: n => { if(n.parentElement.closest('mark')) return NodeFilter.FILTER_REJECT;
                       rx.lastIndex=0;
                       return rx.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
  });
  const targets=[]; let n;
  while((n=walker.nextNode())) targets.push(n);
  targets.forEach(node=>{
    rx.lastIndex=0;
    const frag=document.createDocumentFragment();
    let last=0, m;
    while((m=rx.exec(node.nodeValue))){
      if(m.index>last) frag.appendChild(document.createTextNode(node.nodeValue.slice(last,m.index)));
      const mk=document.createElement('mark'); mk.className='search-hit'; mk.textContent=m[0]; mk._q=q;
      frag.appendChild(mk); last=m.index+m[0].length;
      if(m[0].length===0) rx.lastIndex++;
    }
    if(last<node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
    node.replaceWith(frag);
  });
  _searchHits=[...pane.querySelectorAll('mark.search-hit')];
  _searchIdx = _searchHits.length ? 0 : -1;
  if(typeof _pg!=='undefined' && _pg.on && _searchHits.length) _pg.chapters=buildPagedChapters();   // 클론에 표시 반영
  highlightCurrentHit();
  document.getElementById('searchCount').textContent = _searchHits.length ? `1 / ${_searchHits.length}` : '결과 없음';
}
function moveSearch(dir){
  if(!_searchHits.length) return;
  _searchIdx = (_searchIdx + dir + _searchHits.length) % _searchHits.length;
  highlightCurrentHit();
  document.getElementById('searchCount').textContent = `${_searchIdx+1} / ${_searchHits.length}`;
}
function highlightCurrentHit(){
  _searchHits.forEach(m=>m.classList.remove('current'));
  const cur=_searchHits[_searchIdx];
  if(!cur) return;
  cur.classList.add('current');
  if(typeof _pg!=='undefined' && _pg.on){
    // 페이지모드: 원본 칸은 숨겨져 scrollIntoView가 무의미 → 히트가 있는 장으로 조판 후 그 페이지로 점프
    const pane=_pgSourcePane();
    const secs=pane?[...pane.querySelectorAll('.chapter-anchor')]:[];
    const sec=cur.closest('.chapter-anchor');
    const ch=(sec&&secs.length)?Math.max(0,secs.indexOf(sec)):0;
    showChapter(ch,0);
    requestAnimationFrame(()=>{
      const mks=[...document.querySelectorAll('#pagedFlow mark.search-hit')];
      const inSec=sec?[...sec.querySelectorAll('mark.search-hit')]:_searchHits;
      const k=inSec.indexOf(cur);
      const mk=(k>=0&&mks[k])||mks[0];
      if(!mk) return;
      mks.forEach(m=>m.classList.remove('current')); mk.classList.add('current');
      const pg=Math.max(0,Math.min(_pg.count-1,Math.floor((mk.offsetLeft+2)/(_pg.colW+_pg.gap))));
      _pg.page=pg; applyPageTransform(); updatePagedInfo(); pgSave();
    });
    return;
  }
  cur.scrollIntoView({behavior:'smooth',block:'center'});
}

/* ── 독서노트 + 책갈피 패널 ── */
function toggleNotes(){
  const d=document.getElementById('notesDrawer');
  if(!d) return;
  document.getElementById('tocDrawer')?.classList.remove('open');
  d.classList.toggle('open');
  if(d.classList.contains('open')) buildNotes();
}
function buildNotes(){
  const el=document.getElementById('notesList'); if(!el||!currentBook) return;
  const hls=(readerStats.highlights[currentBook.id]||[]);
  const bks=(readerStats.bookmarks?.[currentBook.id]||[]);
  const d8=ts=>{ const d=new Date(ts); return (d.getMonth()+1)+'/'+d.getDate(); };
  let html='';
  if(bks.length){
    html += `<div style="padding:10px 18px 4px;font-size:11px;font-weight:800;color:var(--text-light);">🔖 책갈피 ${bks.length}</div>`;
    bks.forEach((b,i)=>{
      html += `<div class="note-item" onclick="jumpToBookmark(${i})">
        <span class="note-bk">${esc(b.label)}</span>${b.ts?`<span class="note-meta" style="margin-left:8px">${d8(b.ts)}</span>`:''}
        <button class="note-del" onclick="event.stopPropagation();bmDelete(${i})" title="삭제">✕</button>
      </div>`;
    });
  }
  if(hls.length){
    // 읽기 순서(장→문단→글자)대로 정렬, 위치 없는 옛 기록은 맨 뒤
    const sorted=[...hls].sort((a,b)=>{
      if(!a.anc&&!b.anc) return a.ts-b.ts;
      if(!a.anc) return 1; if(!b.anc) return -1;
      return (a.anc.ch-b.anc.ch)||(a.anc.p-b.anc.p)||(a.anc.off-b.anc.off);
    });
    html += `<div style="padding:10px 18px 4px;font-size:11px;font-weight:800;color:var(--text-light);">✎ 하이라이트·메모 ${hls.length}</div>`;
    sorted.forEach(h=>{
      html += `<div class="note-item" onclick="hlJump(${h.ts})">
        <div class="note-quote">${esc(h.text.slice(0,140))}</div>
        ${h.note?`<div class="note-memo">📝 ${esc(h.note)}</div>`:''}
        <div class="note-meta">${d8(h.ts)}${h.anc?'':' · 위치 정보 없음'}</div>
        <button class="note-del" onclick="event.stopPropagation();hlDelete(${h.ts})" title="삭제">✕</button>
      </div>`;
    });
  }
  el.innerHTML = html || `<div class="note-empty">아직 하이라이트·책갈피가 없어요.<br><br>· <b>완독 모드</b>에서 문장을 드래그하면 하이라이트·메모를 남길 수 있어요.<br>· 상단 🔖 버튼으로 현재 위치를 책갈피할 수 있어요.</div>`;
}
function bmDelete(i){
  const bks=readerStats.bookmarks?.[currentBook?.id]; if(!bks||!bks[i]) return;
  const _ts=bks[i].ts;
  bks.splice(i,1);
  if(_ts){ if(!readerStats.deleted) readerStats.deleted={}; readerStats.deleted['b'+_ts]=Date.now(); }   // 톰스톤 — 다기기 병합 시 되살아나지 않게
  saveReaderStats(); buildNotes();
  readerToast('책갈피 삭제됨');
}
function jumpToPos(pos){
  const el=_scrollEl(); if(el){ el.scrollTop=pos; updateProgress(); }
}
function jumpToBookmark(i){
  const bks=readerStats.bookmarks?.[currentBook?.id]||[]; const b=bks[i]; if(!b) return;
  if(b.pgPos){ if(_pg.on){ showChapter(b.pgPos.ch, b.pgPos.page); } return; }   // 페이지 모드 책갈피
  if(b.anchor) _applyAnchor(b.anchor); else jumpToPos(b.pos);   // 앵커 우선, 없으면 구버전 px
}

/* ── 책갈피 ── */
function addBookmark(){
  if(!currentBook) return;
  if(!readerStats.bookmarks) readerStats.bookmarks={};
  if(!readerStats.bookmarks[currentBook.id]) readerStats.bookmarks[currentBook.id]=[];
  let pct, entry;
  if(_pg.on){   // 페이지 모드: 장+페이지로 저장
    const per=_pg.count?((_pg.page+1)/_pg.count):1;
    pct=Math.round(((_pg.chIdx+per)/_pg.chapters.length)*100);
    entry={pgPos:{ch:_pg.chIdx,page:_pg.page}, label:`${pct}% 지점`, ts:Date.now()};
  } else {
    const el=_scrollEl(); if(!el) return;
    const max=el.scrollHeight-el.clientHeight;
    pct=max>0?Math.round(el.scrollTop/max*100):0;
    entry={pos:el.scrollTop, anchor:_captureAnchor(), label:`${pct}% 지점`, ts:Date.now()};
  }
  readerStats.bookmarks[currentBook.id].push(entry);
  saveReaderStats();
  // 피드백: 아이콘(SVG) 건드리지 말고 버튼 잠깐 강조 + 토스트
  const btn=(typeof event!=='undefined'&&event&&event.target)?event.target.closest('.reader-btn'):null;
  if(btn){ btn.classList.add('bm-saved'); setTimeout(()=>btn.classList.remove('bm-saved'),700); }
  readerToast(`🔖 책갈피 저장 · ${pct}% 지점 — 독서노트에서 확인`);
}
/* ── 리더 토스트 (간단 안내) ── */
let _readerToastTimer=null;
function readerToast(msg){
  let t=document.getElementById('readerToast');
  const host=_fsHost();   // 화면 꽉 채우기 중엔 그 안에, 평소엔 body — 뷰어 밖에서도 보임
  if(!t){ t=document.createElement('div'); t.id='readerToast'; t.className='reader-toast'; }
  if(t.parentElement!==host) host.appendChild(t);
  t.textContent=msg; t.classList.add('show');
  clearTimeout(_readerToastTimer); _readerToastTimer=setTimeout(()=>t.classList.remove('show'),1900);
}
/* ── 축하 모달 (완료·인증 alert 대체) ── */
function bsCelebrate(o){
  document.getElementById('bsCele')?.remove();
  const d=document.createElement('div'); d.id='bsCele'; d.className='bs-cele';
  d.innerHTML=`<div class="bs-cele-card">
    <div class="bs-cele-badge">✓</div>
    <div class="bs-cele-title">${o.title}</div>
    ${o.sub?`<div class="bs-cele-sub">${o.sub}</div>`:''}
    ${(o.rows&&o.rows.length)?`<div class="bs-cele-rows">${o.rows.map(r=>`<div class="bs-cele-row">${r}</div>`).join('')}</div>`:''}
    <button class="bs-cele-btn" onclick="document.getElementById('bsCele')?.remove()">${o.btn||'확인'}</button>
  </div>`;
  d.addEventListener('click',e=>{ if(e.target===d) d.remove(); });
  _fsHost().appendChild(d);
}
/* ── 완독 인증 자동 제안 (완독 모드 90% 도달 시, 책당 1회만) ── */
function maybeCertPrompt(bookId){
  const r=_chalRead(bookId)||{};
  if(r.submitted || r.cert_prompted) return;            // 이미 인증·이미 물어봄
  if(document.getElementById('bsCertPrompt')) return;
  _chalMerge(bookId, {cert_prompted:true});             // 같은 책에 다시 묻지 않음
  const b=(typeof BOOKS!=='undefined')?BOOKS.find(x=>x.id===bookId):null;
  const d=document.createElement('div'); d.id='bsCertPrompt'; d.className='bs-cele';
  d.innerHTML=`<div class="bs-cele-card">
    <div class="bs-cele-badge">📖</div>
    <div class="bs-cele-title">거의 다 읽었어요!</div>
    <div class="bs-cele-sub">『${esc(cleanT(b?b.title:''))}』 ${Math.min(100,r.read_pct||90)}% 지점<br>한 줄 소감을 남기면 <b>완독 인증 +50점</b></div>
    <textarea class="bs-cert-ta" id="certPromptText" placeholder="이 책에서 가장 기억에 남는 한 가지…"></textarea>
    <button class="bs-cele-btn" onclick="certPromptSubmit('${esc(bookId)}')">✔ 완독 인증하기</button>
    <button class="bs-cele-btn ghost" onclick="document.getElementById('bsCertPrompt')?.remove()">나중에 할게요</button>
  </div>`;
  d.addEventListener('click',e=>{ if(e.target===d) d.remove(); });
  _fsHost().appendChild(d);
}
function certPromptSubmit(bookId){
  const v=((document.getElementById('certPromptText')||{}).value||'').trim();
  if(v.length<5){ readerToast('소감을 5자 이상 적어 주세요'); return; }
  const next=_chalMerge(bookId, {impression:v, submitted:true});
  bxUpsertResult(bookId, next);
  bxEvent('activity',{sub:'oneline', book:bxBookByKey(bookId), ref_table:'bookstar_challenge_results', ref_id:_bxSid()+'|'+bookId, meta:{len:v.length, via:'cert'}});   // 측정: 활동(완독 인증 소감)
  document.getElementById('bsCertPrompt')?.remove();
  const b=(typeof BOOKS!=='undefined')?BOOKS.find(x=>x.id===bookId):null;
  bsCelebrate({
    title:`『${esc(cleanT(b?b.title:''))}』<br>완독 인증 완료!`,
    rows:[`한 줄 소감 <b>+50점</b>`, `독서 이력에 추가 — 내서재에서 확인`],
  });
  try{ renderQuestMap(); renderMyImpressions(); renderReadingRhythm(); }catch(e){}
}
/* ── 퀴즈 정답/오답 인라인 피드백 (alert 대체) ── */
function quizFeedback(el, ok, msg){
  const block=el.closest('.quiz-block')||el.parentElement;
  let fb=block.querySelector('.quiz-fb');
  if(!fb){ fb=document.createElement('div'); fb.className='quiz-fb'; block.appendChild(fb); }
  fb.className='quiz-fb '+(ok?'ok':'no');
  fb.innerHTML=msg;
}

/* ── 전체화면 ── */
function toggleFullscreen(){
  // 진짜 Fullscreen API는 윈도우에서 캡쳐가 막히는 현상 → CSS로 화면 꽉 채우기
  const shell=document.querySelector('.viewer-shell'); if(!shell) return;
  if(document.fullscreenElement) document.exitFullscreen?.();   // 과거 진짜 전체화면 잔재 정리
  shell.classList.toggle('maxed');
  try{ localStorage.setItem('bx-reader-maxed', shell.classList.contains('maxed')?'1':'0'); }catch(e){}
}
/* 토스트·축하 모달이 화면 꽉 채우기 안에서도 보이도록 호스트 결정 */
function _fsHost(){
  return document.fullscreenElement
      || document.querySelector('.viewer-shell.maxed')
      || document.body;
}

/* ── 페인 보기 토글 (해외책: 나란히 → 원문만 → 번역만) ── */
// KO 1단 기본 책(Phase1 KO2COL): 문장쌍(body_sent) 없이 원문/번역이 독립 2단이라 좌우가 어긋남.
// 나란히 대신 한국어 번역 1단을 기본으로(영어 원문은 데스크톱 토글/모바일 탭으로 접근). KO2COL 8권.
const KO1COL_BOOKS = new Set(['gb-1200','gb-1251','gb-1666','gb-1837','gb-3154','gb-804','gb-9198','gb-9611']);
function applyPaneDefault(){
  const ko1 = currentBook && KO1COL_BOOKS.has(currentBook.id) && currentMode==='full';
  _paneView = ko1 ? 'trans' : 'both';
  const body=document.getElementById('viewerBody');
  if(body){ body.classList.remove('pane-orig','pane-trans'); if(ko1) body.classList.add('pane-trans'); }
  const lbl=document.getElementById('paneToggleLabel'); if(lbl) lbl.textContent = ko1 ? '번역만' : '나란히';
}
let _paneView='both';
function cyclePaneView(){
  const body=document.getElementById('viewerBody');
  const btn=document.getElementById('paneToggleBtn');
  const order=['both','orig','trans'];
  _paneView = order[(order.indexOf(_paneView)+1)%order.length];
  body.classList.remove('pane-orig','pane-trans');
  const lbl=document.getElementById('paneToggleLabel');
  // 한국 고전 평행은 좌=번역·우=원문이라 토글 라벨도 반대
  const krSwap = currentBook && currentBook.id && currentBook.id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[currentBook.id];
  if(_paneView==='orig'){ body.classList.add('pane-orig'); if(lbl)lbl.textContent= krSwap?'번역만':'원문만'; }
  else if(_paneView==='trans'){ body.classList.add('pane-trans'); if(lbl)lbl.textContent= krSwap?'원문만':'번역만'; }
  else { if(lbl)lbl.textContent='나란히'; }
  attachScrollListener();
  setupParallel();
}
function updatePaneToggleVisibility(){
  const btn=document.getElementById('paneToggleBtn');
  if(!btn||!currentBook) return;
  // 완독 모드 + 번역 존재(해외책 또는 한국 고전 다국어)일 때만 의미 있음
  const krParallel = currentBook.id.startsWith('kr-') && KR_SENT[currentBook.id];
  const hasTrans = currentBook.locale==='foreign' || currentBook.locale==='classic' || krParallel;
  btn.style.display = (currentMode==='full' && hasTrans) ? '' : 'none';
  // 한국 고전 평행 리더: 언어 셀렉터 표시
  const sel=document.getElementById('krLangSel');
  if(sel){
    if(currentMode==='full' && krParallel){
      sel.style.display='';
      sel.innerHTML=Object.keys(KR_SENT[currentBook.id]).map(l=>`<option value="${l}"${l===KR_LANG?' selected':''}>${KR_LANG_NAMES[l]||l}</option>`).join('');
    } else { sel.style.display='none'; }
  }
}

/* ── 사전 (외국인 학생용 다국어 glossary) ── */
let _glossary = {};           // {단어:{ko,en,en_w,zh,zh_w,vi,vi_w}}
let _glossaryBook = null;
let _dictLang = 'en';
const DICT_LANGS = [['en','English'],['zh','中文'],['vi','Tiếng Việt'],['ja','日本語'],['mn','Монгол'],['ru','Русский']];

async function loadGlossary(bookId){
  if(_glossaryBook === bookId) return;
  _glossary = {}; _glossaryBook = bookId;
  try{
    const res = await fetch(`./books/glossary_${bookId}.json`);
    if(_glossaryBook !== bookId) return;   // 그 사이 다른 책을 열었으면 폐기(이전 책 사전 오염 방지)
    if(res.ok){ const data = await res.json(); if(_glossaryBook === bookId) _glossary = data; }
  }catch(e){ if(_glossaryBook === bookId) _glossary = {}; }
}

function lookupSelection(){
  const sel = window.getSelection();
  const w = sel ? sel.toString().trim() : '';
  document.getElementById('hlPopup').style.display='none';
  if(w) showDict(w);
}

// 더블클릭으로 단어 조회 (모든 모드)
function setupDictHandlers(){
  document.addEventListener('dblclick', (e)=>{
    const pane = e.target.closest('.viewer-pane');
    if(!pane) return;
    const sel = window.getSelection();
    const w = sel ? sel.toString().trim() : '';
    if(w && w.length>=1 && w.length<=12) showDict(w, e.clientX, e.clientY);
  });
}

function dictEntryFor(word){
  // 정확 일치 → 조사 떼고 재시도 (한국어 어절)
  if(_glossary[word]) return {key:word, e:_glossary[word]};
  const stripped = word.replace(/(은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|부터|까지|만|마저|조차|보다)$/,'');
  if(stripped!==word && _glossary[stripped]) return {key:stripped, e:_glossary[stripped]};
  // 부분 포함 (가장 긴 매칭)
  let best=null;
  for(const k in _glossary){ if(word.includes(k) && (!best||k.length>best.length)) best=k; }
  return best ? {key:best, e:_glossary[best]} : null;
}

function showDict(word, x, y){
  const pop = document.getElementById('dictPopup');
  document.getElementById('dictWord').textContent = word;
  const hit = dictEntryFor(word);
  // 언어 탭 (glossary에 있는 언어만)
  const tabs = document.getElementById('dictLangTabs');
  if(hit){
    const avail = DICT_LANGS.filter(([code])=> hit.e[code]);
    if(avail.length && !avail.find(([c])=>c===_dictLang)) _dictLang = avail[0][0];
    tabs.innerHTML = avail.map(([code,label])=>
      `<span class="dict-lang-tab ${code===_dictLang?'on':''}" onclick="setDictLang('${code}')">${label}</span>`).join('');
  } else { tabs.innerHTML=''; }
  renderDictBody(hit, word);
  pop.classList.add('open');
  // 위치: 선택/더블클릭 지점 근처
  const px = (x!=null) ? Math.min(x, window.innerWidth-320) : (window.innerWidth/2-150);
  const py = (y!=null) ? Math.min(y+12, window.innerHeight-340) : 120;
  pop.style.left = Math.max(8,px)+'px';
  pop.style.top  = Math.max(8,py)+'px';
}

function setDictLang(code){ _dictLang=code; const hit=dictEntryFor(document.getElementById('dictWord').textContent);
  document.querySelectorAll('.dict-lang-tab').forEach(t=>t.classList.toggle('on', t.textContent===DICT_LANGS.find(([c])=>c===code)[1]));
  renderDictBody(hit); }

function renderDictBody(hit, word){
  const body = document.getElementById('dictBody');
  if(!hit){
    word = (word || document.getElementById('dictWord').textContent || '').trim()
           .replace(/^["'“”‘’(\[]+|["'“”‘’)\].,!?;:]+$/g,'');   // 드래그 선택에 딸려온 따옴표·구두점 제거 — "word." 도 영단어로 인식
    const isEn = /^[A-Za-z][A-Za-z'’\-]*$/.test(word);
    const naver = (isEn ? 'https://en.dict.naver.com/#/search?query=' : 'https://ko.dict.naver.com/#/search?query=') + encodeURIComponent(word);
    body.innerHTML = `<div class="dict-empty" id="dictOnline">${isEn ? '온라인 사전에서 찾는 중…' : '작품 풀이 사전에 없는 단어예요.'}</div>
      <div class="dict-links"><a href="${naver}" target="_blank" rel="noopener">네이버 사전에서 열기 ↗</a></div>`;
    if(isEn && word) _dictOnline(word);
    return;
  }
  const e = hit.e;
  const w = e[_dictLang+'_w'];
  const def = e[_dictLang];
  body.innerHTML = `
    <div class="dict-ko"><b style="color:var(--primary);">${esc(hit.key)}</b> · ${esc(e.ko||'')}</div>
    ${w?`<div class="dict-row"><span class="dict-lang">단어</span><span class="dict-trans"><b>${esc(w)}</b></span></div>`:''}
    ${def?`<div class="dict-row"><span class="dict-lang">뜻</span><span class="dict-trans"><span>${esc(def)}</span></span></div>`:''}
  `;
}
function closeDict(){ document.getElementById('dictPopup').classList.remove('open'); }
// 작품 사전에 없는 영단어: 무료 온라인 사전(dictionaryapi.dev, 무키·CORS 허용)으로 폴백
async function _dictOnline(word){
  const cur=()=>document.getElementById('dictWord').textContent;
  try{
    const r=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word.toLowerCase()));
    if(cur()!==word) return;                                  // 그새 다른 단어 조회
    const el=document.getElementById('dictOnline'); if(!el) return;
    if(!r.ok){ el.textContent='온라인 사전에도 없는 단어예요.'; return; }
    const j=await r.json(); if(cur()!==word) return;
    const e=Array.isArray(j)?j[0]:null;
    if(!e){ el.textContent='뜻을 찾지 못했어요.'; return; }
    const ph=e.phonetic || ((e.phonetics||[]).find(p=>p.text)||{}).text || '';
    let html=`<div class="dict-ko"><b style="color:var(--primary);">${esc(e.word||word)}</b>${ph?` <span style="color:var(--text-light);">${esc(ph)}</span>`:''}</div>`;
    (e.meanings||[]).slice(0,3).forEach(m=>{ const d=(m.definitions||[])[0]; if(!d||!d.definition) return;
      html+=`<div class="dict-row"><span class="dict-lang">${esc(m.partOfSpeech||'')}</span><span class="dict-trans">${esc(d.definition)}</span></div>`; });
    el.outerHTML=html;                                        // 로딩 노드 → 결과(링크는 형제로 유지)
  }catch(e){ if(cur()!==word) return; const el=document.getElementById('dictOnline'); if(el) el.textContent='온라인 사전 연결에 실패했어요.'; }   // 그새 다른 단어 조회면 실패 메시지로 덮지 않음
}

