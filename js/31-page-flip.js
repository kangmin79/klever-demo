/* ═══════════ 종이책 페이지 넘김 (모바일 전용 · 장별 CSS 칼럼) ═══════════ */
let _pg={on:false, chapters:[], chIdx:0, page:0, count:1, colW:0, colH:0, gap:36, padX:20, padY:24};
// 완독 모드 한정 — 챌린지에서 발동하면 퀴즈 pane이 정적 클론으로 조판돼 입력·제출이 죽는다 (8/15 리뷰)
function pgEligible(){ return !!readerPrefs.pageMode && window.innerWidth<=600 && currentMode==='full'; }
function _pgSourcePane(){   // 페이지로 조판할 원본 칸 (모바일 선택 탭 기준 — 숨겨져 있어도 outerHTML 읽음)
  const left=document.querySelector('.viewer-pane.left');
  const right=document.querySelector('.viewer-pane.right');
  return (_mobPane==='second' && right) ? right : (left||right);
}
function buildPagedChapters(){
  const src=_pgSourcePane(); if(!src) return [];
  let secs=[...src.querySelectorAll('.chapter-anchor')];
  if(!secs.length){                                   // 단일 장 책: 본문 전체를 한 장으로
    const clone=src.cloneNode(true);
    clone.querySelector('.viewer-pane-label')?.remove();
    clone.querySelector('.book-front')?.remove();   // 속표지는 본문이 아니다(탭 넘김에는 넣지 않음)
    const wrap=document.createElement('section');
    wrap.className='chapter-anchor'; wrap.dataset.chTitle='전체';
    wrap.innerHTML=clone.innerHTML; secs=[wrap];
  }
  return secs.map(s=>({title:(s.dataset.chTitle||'').replace(/\s+/g,' ').trim(), html:s.outerHTML}));
}
function _pgFromScroll(){   // 스크롤 모드의 현재 위치 → {ch(장 인덱스), frac(장 내 비율)} — 탭넘김 전환 시 자리 승계용
  const pane=_scrollEl(); if(!pane||!pane.clientHeight||!pane.scrollTop) return null;
  const secs=[...pane.querySelectorAll('.chapter-anchor')]; if(!secs.length) return null;
  const top=pane.scrollTop;
  let i=0;
  for(let k=0;k<secs.length;k++){ if(secs[k].offsetTop<=top+4) i=k; else break; }
  const s=secs[i], h=Math.max(1, s.offsetHeight);
  return {ch:i, frac:Math.max(0, Math.min(0.999, (top-s.offsetTop)/h))};
}
function enterPageMode(fromScroll){
  if(!pgEligible()||!currentBook) return;
  const wasOn=_pg.on, keepCh=_pg.chIdx, keepPg=_pg.page;
  const cur=(!wasOn && fromScroll)?_pgFromScroll():null;   // pg-active로 본문이 숨기 전에 스크롤 위치 캡처
  _pg.chapters=buildPagedChapters();
  if(!_pg.chapters.length) return;
  _pg.on=true;
  document.getElementById('viewerBody')?.classList.add('pg-active');
  const pv=document.getElementById('pagedView');
  if(pv){ pv.className='paged-view gv-'+genreOf(currentBook.category); pv.style.display='block'; }
  setupPagedGestures();
  let ch,pg,frac=null;
  if(wasOn){ ch=keepCh; pg=keepPg; }
  else if(cur){ ch=cur.ch; pg=0; frac=cur.frac; }   // 스크롤로 읽던 자리 그대로(페이지 수는 조판 후 확정 → frac로 환산)
  else { const sp=(readerStats.pagePos&&readerStats.pagePos[currentBook.id])||{}; ch=sp.ch||0; pg=sp.page||0; }
  showChapter(ch, pg);
  if(frac!=null && _pg.count>1){
    _pg.page=Math.max(0, Math.min(_pg.count-1, Math.round(frac*(_pg.count-1))));
    applyPageTransform(); updatePagedInfo(); pgSave();
  }
}
function exitPageMode(){
  if(!_pg.on) return;
  _pg.on=false;
  const pv=document.getElementById('pagedView'); if(pv) pv.style.display='none';
  document.getElementById('viewerBody')?.classList.remove('pg-active');
  requestAnimationFrame(()=>{   // 스크롤 모드로 돌아갈 때 보던 장으로 대략 복귀
    const pane=_scrollEl(); if(!pane) return;
    const secs=[...pane.querySelectorAll('.chapter-anchor')];
    if(secs[_pg.chIdx]) pane.scrollTo({top:secs[_pg.chIdx].offsetTop});
    updateProgress();
  });
}
function applyPagedFont(){
  const flow=document.getElementById('pagedFlow'); if(!flow) return;
  flow.style.setProperty('--reader-fs', FONT_SIZES[readerPrefs.fontSizeIdx]+'px');
  flow.style.setProperty('--reader-lh', LINE_HEIGHTS[readerPrefs.lineHeightIdx]);
  // 서체·배경·여백도 스크롤 모드와 동일하게 (8/15: 페이지모드에서 Aa 설정 절반이 안 먹던 문제)
  flow.style.setProperty('--reader-ff', (READER_FONTS[readerPrefs.fontIdx]||READER_FONTS[0]).ff);
  flow.style.fontFamily = readerPrefs.fontIdx>0 ? 'var(--reader-ff)' : '';   // 기본 서체는 장르별 조판 유지
  const pv=document.getElementById('pagedView');
  const bgc=READER_BGS.find(b=>b.id===readerPrefs.bg);
  if(pv){
    if(bgc && bgc.bg){ pv.style.background=bgc.bg; pv.style.color=bgc.fg||''; }
    else { pv.style.background=''; pv.style.color=''; }
  }
  if(typeof PAD_X!=='undefined' && PAD_X[readerPrefs.padXIdx]!=null) _pg.padX=PAD_X[readerPrefs.padXIdx];
  if(typeof PAD_Y!=='undefined' && PAD_Y[readerPrefs.padYIdx]!=null) _pg.padY=PAD_Y[readerPrefs.padYIdx];
}
function layoutPaged(){
  const clip=document.getElementById('pagedClip'), flow=document.getElementById('pagedFlow');
  if(!clip||!flow) return;
  const W=clip.clientWidth, H=clip.clientHeight;
  const colW=Math.max(140, W-_pg.padX*2), colH=Math.max(140, H-_pg.padY*2);
  _pg.colW=colW; _pg.colH=colH;
  flow.style.left=_pg.padX+'px'; flow.style.top=_pg.padY+'px';
  flow.style.width=colW+'px'; flow.style.height=colH+'px';
  flow.style.columnWidth=colW+'px'; flow.style.webkitColumnWidth=colW+'px';
  flow.style.columnGap=_pg.gap+'px'; flow.style.webkitColumnGap=_pg.gap+'px';
  _pg.count=Math.max(1, Math.round((flow.scrollWidth+_pg.gap)/(colW+_pg.gap)));
}
function applyPageTransform(){
  const flow=document.getElementById('pagedFlow'); if(!flow) return;
  flow.style.transform='translateX('+(-_pg.page*(_pg.colW+_pg.gap))+'px)';
}
function showChapter(chIdx, page){
  if(!_pg.chapters.length) return;
  _pg.chIdx=Math.max(0,Math.min(_pg.chapters.length-1, chIdx));
  const flow=document.getElementById('pagedFlow'); if(!flow) return;
  flow.classList.add('no-anim');
  flow.innerHTML=_pg.chapters[_pg.chIdx].html;
  applyPagedFont(); layoutPaged();
  _pg.page=(page==='last')?_pg.count-1:Math.max(0,Math.min(_pg.count-1, page||0));
  applyPageTransform();
  void flow.offsetWidth;
  requestAnimationFrame(()=>flow.classList.remove('no-anim'));
  updatePagedInfo(); pgSave();
}
function pgGo(dir){
  if(!_pg.on) return;
  _sentClear();   // 페이지 넘기면 열린 번역 바 닫기
  const np=_pg.page+dir;
  if(np<0){ if(_pg.chIdx>0) showChapter(_pg.chIdx-1,'last'); return; }
  if(np>=_pg.count){ if(_pg.chIdx<_pg.chapters.length-1) showChapter(_pg.chIdx+1,0); return; }
  _pg.page=np; applyPageTransform(); updatePagedInfo(); pgSave();
}
function pgRelayout(){     // 글자크기·줄간격·회전 변경 시 페이지 비율 유지 재배치
  if(!_pg.on) return;
  const frac=_pg.count?(_pg.page/_pg.count):0;
  const flow=document.getElementById('pagedFlow'); if(!flow) return;
  flow.classList.add('no-anim');
  applyPagedFont(); layoutPaged();
  _pg.page=Math.max(0,Math.min(_pg.count-1, Math.round(frac*_pg.count)));
  applyPageTransform();
  void flow.offsetWidth;
  requestAnimationFrame(()=>flow.classList.remove('no-anim'));
  updatePagedInfo();
}
function updatePagedInfo(){
  const info=document.getElementById('pagedInfo');
  const ch=_pg.chapters[_pg.chIdx]||{};
  const multi=_pg.chapters.length>1;
  if(info) info.textContent=(multi&&ch.title?ch.title+' · ':'')+(_pg.page+1)+' / '+_pg.count;
  const bar=document.getElementById('viewerProg');
  const per=_pg.count?((_pg.page+1)/_pg.count):1;
  const frac=(_pg.chIdx+per)/Math.max(1,_pg.chapters.length);
  if(bar) bar.style.width=Math.min(100,frac*100).toFixed(1)+'%';
  _setProgLabel(frac);
}
function pgSave(){
  if(!currentBook) return;
  if(!readerStats.pagePos) readerStats.pagePos={};
  readerStats.pagePos[currentBook.id]={ch:_pg.chIdx, page:_pg.page, t:Date.now()};
  saveReaderStats();
  v4Activity(); v4Recalc();   // 완독율 v4: 페이지 넘김 = 활동 + 진행률 갱신
}
let _pgBound=false, _pgTouchActive=false;
function setupPagedGestures(){
  const pv=document.getElementById('pagedView'); if(!pv||_pgBound) return; _pgBound=true;
  let sx=0,sy=0,moved=false;
  pv.addEventListener('touchstart',e=>{ _pgTouchActive=true; const t=e.touches[0]; sx=t.clientX; sy=t.clientY; moved=false; },{passive:true});
  pv.addEventListener('touchmove',e=>{ const t=e.touches[0]; if(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10) moved=true; },{passive:true});
  pv.addEventListener('touchend',e=>{
    if(_pgIgnore(e)) return;
    const t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.4){ pgGo(dx<0?1:-1); return; }   // 스와이프
    if(moved) return;
    pgTap(t.clientX, e.target);                                                         // 탭
  },{passive:true});
  pv.addEventListener('click',e=>{                  // 비터치(데스크톱 미리보기)용
    if(_pgTouchActive) return;
    if(_pgIgnore(e)) return;
    pgTap(e.clientX, e.target);
  });
}
function _pgIgnore(e){
  if(e.target.closest('a,button,mark')) return true;        // 링크·버튼·하이라이트
  if(e.detail>1) return true;                               // 더블클릭(사전)
  const sel=window.getSelection();
  if(sel && sel.toString().trim().length>0) return true;    // 드래그 선택 중
  return false;
}
function pgTap(clientX, tgt){
  const pv=document.getElementById('pagedView'); if(!pv) return;
  const r=pv.getBoundingClientRect();
  const fx=(clientX-r.left)/r.width;
  if(fx<0.30){ pgGo(-1); return; }                          // 좌 30% = 이전
  if(fx>0.70){ pgGo(1);  return; }                          // 우 30% = 다음
  const s = tgt && tgt.closest ? tgt.closest('#pagedFlow span.psent') : null;
  if(s){ _sentTapPaged(s); return; }                        // 가운데 문장 = 번역 바 (스크롤 모드의 문장탭과 동일 역할)
  _sentClear();
  _toggleChrome();  // 가운데 빈곳 = 바 토글
}

async function openViewer(bookId, mode){
  const b = BOOKS.find(x=>x.id===bookId);
  if(!b) return;
  // 8/14 사장님 지시: 고전 읽기도 세명대 로그인 필수 — 로그인하고 돌아오면 그 책이 바로 열린다
  if(!bxStudent()){
    try{ localStorage.setItem('bx_sso_return_classic', JSON.stringify({id:bookId, mode:mode||'full', _ts:Date.now()})); }catch(e){}
    smLoginGuide('classic');
    return;
  }
  // 같은 책·같은 모드가 이미 열려 있으면(더블클릭 등) 재초기화 금지 — 독서 세션 리셋·화면 스냅백 방지
  if(currentBook && currentBook.id===bookId && currentMode===(mode||'challenge')
     && document.getElementById('viewerOverlay')?.classList.contains('open')) return;
  // 뷰어가 열린 채 다른 책으로 전환(bxOpenBook 등): 이전 책 정산·상태 초기화
  // (기존: 독서시간 유실 + 이전 책 페이지 위치가 새 책에 적용되던 버그)
  if(currentBook && currentBook.id !== bookId
     && document.getElementById('viewerOverlay')?.classList.contains('open')){
    saveScrollPos(); readerSessionEnd();
    try{ bxReadFlush(false); }catch(e){}   // 측정: 이전 책 읽기 세션 정산
    if(_scrollSaveTimer){ clearTimeout(_scrollSaveTimer); _scrollSaveTimer=null; }   // 이전 책의 대기 디바운스가 새 책 위치를 덮는 것 방지
    if(_pg.on){ pgSave(); _pg.on=false; const pv=document.getElementById('pagedView'); if(pv) pv.style.display='none'; document.getElementById('viewerBody')?.classList.remove('pg-active'); }
  }
  if(currentBook && currentBook.id !== bookId){ _pg.chIdx=0; _pg.page=0; }
  currentBook = b;
  currentMode = mode || 'challenge';
  applyPaneDefault();   // KO 1단 기본 책이면 pane-trans, 아니면 나란히로 리셋

  document.getElementById('viewerTitle').textContent = b.title;
  document.getElementById('viewerAuthor').textContent = '— ' + b.author;
  document.getElementById('viewerOverlay').classList.add('open');
  // 8/14 사장님 수정요청: 모바일 읽기 화면은 열 때 메뉴 없이 본문만(밀리 방식)
  // 8/17 사장님 수정요청: 메뉴는 탭이 아니라 스크롤 방향으로 — 위로 올리면 뜨고 내리면 사라짐(setupImmersiveTap의 scroll 감시).
  //   챌린지도 같은 방식(퀴즈 화면도 동일 적용) — 단, 장면카드 있는 책이 쌓기(.chal-stack)로 바뀔 때 _chalStackApply가 켠다.
  //   (장면카드 없는 책은 본문/퀴즈 탭 방식이라 메뉴가 상시 — 겹치면 퀴즈 첫 줄이 가려짐)
  // .immersive = 메뉴를 본문 위에 겹쳐 띄우는 표식(CSS)
  {
    const _sh=document.querySelector('.viewer-shell');
    if(_sh){
      const _imm = window.innerWidth<=600 && currentMode!=='challenge';
      _sh.classList.toggle('immersive', _imm);
      _sh.classList.toggle('chrome-hidden', _imm);
      // 8/30 사장님: '전체화면' 보기를 기본값으로. 끄면 그 선택을 기억한다
      let _mx=true; try{ _mx = localStorage.getItem('bx-reader-maxed')!=='0'; }catch(e){}
      _sh.classList.toggle('maxed', _mx);
    }
  }
  renderViewer();
  // 고전 본문 비동기 확보 후 재렌더: 해외 번역 bodies(지연로드, 147권 수동 include 대체) + 원문(Supabase)
  let _reload = false;
  // 해외 고전(gb-): Supabase에서 원문(body)+번역(body_trans) 먼저 받음 → 번역이 있으면 대용량 JS 본문파일 생략(가볍게).
  // 번역이 Supabase에 아직 없으면(정렬형 SENT·미이전분) JS 본문파일로 폴백. (원문은 정렬형이면 SENT가 덮어씀)
  if(bookId.startsWith('gb-')){
    const _sumP = ensureSummaryML();                           // 속표지 소개글(영어·한국어)·저자 영문 표기 — 본문과 나란히 받음
    await ensureClassicBody(bookId);
    // Supabase에 번역(body_trans=ko-only) 또는 문장쌍(body_sent=정렬형) 있으면 대용량 JS 본문파일 생략
    const haveSupaTrans = CLASSIC_TRANS[bookId] || (typeof BODIES_SENT !== 'undefined' && BODIES_SENT[bookId]);
    if(!haveSupaTrans && (b.hasTrans||LEGACY_BODY_FILES[bookId])) await ensureForeignBody(bookId);
    await _sumP;
    _reload = true;
  }
  if(bookId.startsWith('kr-')){
    const jobs = [ensureSummaryML()];                       // 속표지 '이 책은' 칸의 번역 언어 소개글
    if(b.hasTrans) jobs.push(ensureKrBody(b));              // 평행 번역 본문
    await Promise.all(jobs);
    if(b.hasTrans && currentBook===b) applyKrLang(bookId);  // 늦은 응답이 전역 KR_LANG을 바꾸지 않게(레이스 가드 앞이라 별도 확인)
    _reload = true;
  }
  // kr-/레거시(g\d+) 등 gb- 외 고전 원문 fetch (gb-는 위에서 처리)
  if(classicFetchId(bookId) && !bookId.startsWith('gb-')){ await ensureClassicBody(bookId); _reload = true; }
  // 레이스 가드: 위 await(수 초) 동안 다른 책을 열었거나 뷰어를 닫았으면 꼬리 초기화 중단
  // (이전 책 사전(glossary) 적용·스크롤 스냅백·세션 타이머 유령 시작 방지)
  if(currentBook !== b || !_viewerOpen()) return;
  if(_reload) renderViewer();
  // 리더 모듈 초기화
  setTimeout(() => {
    if(currentBook !== b || !_viewerOpen()) return;   // setTimeout 시점 재확인(책 전환·닫힘)
    applyReaderPrefs();
    buildTOC();
    restoreHighlights();   // 페이지 모드 조판 전에 복원해야 형광펜이 페이지에도 실림
    restoreScrollPos();
    updateModeClass();
    readerSessionStart();
    attachScrollListener();
    updatePaneToggleVisibility();
    if(pgEligible()) enterPageMode();
    hlHintOnce();
  }, 0);
  loadGlossary(b.id);
}

// 모드(챌린지/완독/Intl)는 openViewer(bookId, mode)에서 정해짐 — 헤더 모드 알약·setMode는 9/2 제거(8월부터 CSS 숨김 상태였던 죽은 UI)

// 장르 버킷 (category → 조판 템플릿). 시 먼저 검사(서사시의 '시' 우선).
function genreOf(cat){
  cat = cat || '';
  if(/시|운문/.test(cat)) return 'poem';          // 근대 시, 시, 고대 서사시, 서사시
  if(/소설/.test(cat)) return 'novel';
  if(/희곡|비극|戱/.test(cat)) return 'drama';
  if(/수필|에세이|기행/.test(cat)) return 'essay';
  if(/사상|철학|심리|경제|과학|논어|학$/.test(cat)) return 'idea';  // 정치사상·고대철학·심리학·과학…
  return 'prose';   // 기본(기존 양끝맞춤 유지)
}
const GENRE_CLASSES = ['gv-poem','gv-novel','gv-drama','gv-idea','gv-essay','gv-prose'];

function bodyToHtml(text){
  if(!text) return '';
  const chPat = /^\s*(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\s+[IVXLCDM\d]+[.:]?[^\n]*$/i;
  const mdPat = /^\s*#{1,6}\s+\S/; // 마크다운 ATX 헤더 (시집 `# 시제목`, `## 시제N호`)
  const lines = text.split(/\n/);
  const headerIdx = [];
  for(let i = 0; i < lines.length; i++) if(chPat.test(lines[i]) || mdPat.test(lines[i])) headerIdx.push(i);
  // 문단을 12개씩 .cv-chunk 로 묶음 → content-visibility 로 화면 밖 구간은 렌더 생략(대작 성능)
  const paraHtml = body => {
    const ps = body.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean)
      .map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`);
    if(!ps.length) return '';
    let out=''; for(let i=0;i<ps.length;i+=12) out += `<div class="cv-chunk">${ps.slice(i,i+12).join('')}</div>`;
    return out;
  };
  if(headerIdx.length < 2){
    return `<section class="chapter-anchor" data-ch-title="전체">${paraHtml(text)}</section>`;
  }
  let html = '';
  // 첫 챕터 헤더 앞 (서문) 있으면 별도 섹션
  if(headerIdx[0] > 0){
    const pre = lines.slice(0, headerIdx[0]).join('\n').trim();
    if(pre) html += `<section class="chapter-anchor" data-ch-title="서문 · 머리말">${paraHtml(pre)}</section>`;
  }
  for(let i = 0; i < headerIdx.length; i++){
    const s = headerIdx[i], e = i+1 < headerIdx.length ? headerIdx[i+1] : lines.length;
    const title = lines[s].trim().replace(/^#{1,6}\s+/,'').replace(/\s+/g,' ');
    const body = lines.slice(s+1, e).join('\n').trim();
    html += `<section class="chapter-anchor" data-ch-title="${esc(title)}"><h3 class="ch-title">${esc(title)}</h3>${paraHtml(body)}</section>`;
  }
  return html;
}

// locale별 viewer 라벨 + 본문 매핑
function viewerLabels(book){
  const loc = book.locale || 'foreign';
  // 한국 고전 다국어 평행: 번역(모국어) 왼쪽 / 한국어 원문 오른쪽
  if(book.id && book.id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[book.id]){
    const ln = (typeof KR_LANG_NAMES!=='undefined' && KR_LANG_NAMES[KR_LANG]) || '번역';
    return {
      leftLabel:  '왼쪽 — '+ln+' 번역',
      rightLabel: '오른쪽 — 한국어 원문',
      challengeLeftLabel: '왼쪽 — 본문',
      intlLeftLabel: '왼쪽 — '+ln+' 번역',
      placeholderOrig: '원문 준비 중',
      placeholderTrans: '번역 준비 중',
    };
  }
  if(loc === 'classic'){
    return {
      leftLabel:  '왼쪽 — 원문 (옛글·한문)',
      rightLabel: '오른쪽 — 현대어 풀이 (북픽 격조체)',
      challengeLeftLabel: '왼쪽 — 현대어 풀이 (북픽 격조체)',
      intlLeftLabel: '왼쪽 — 현대어 풀이 (북픽 격조체)',
      placeholderOrig: '원문 준비 중',
      placeholderTrans: '격조체 풀이 준비 중',
    };
  }
  if(loc === 'modern'){
    return {
      leftLabel:  '왼쪽 — 원문',
      rightLabel: '오른쪽 — 메모 · 주석',
      challengeLeftLabel: '왼쪽 — 본문',
      intlLeftLabel: '왼쪽 — 본문 (한국어)',
      placeholderOrig: '본문 준비 중',
      placeholderTrans: '주석 영역 (별도 작성 예정)',
    };
  }
  // foreign (군주론 등)
  return {
    leftLabel:  '왼쪽 — 원서 원본',
    rightLabel: '오른쪽 — AI 한국어 번역 (격조체)',
    challengeLeftLabel: '왼쪽 — AI 한국어 번역 (격조체)',
    intlLeftLabel: '왼쪽 — AI 한글 번역 (격조체)',
    placeholderOrig: '원서 본문 자리',
    placeholderTrans: '번역 본문 자리',
  };
}

// 고전 본문 캐시 (Supabase classics 테이블서 fetch)
// kr-* = 한국 고전, gb-* = 해외 고전, 옛 해외 g{N} = gb-{N} 로 매핑
const CLASSIC_BODIES = {};
const CLASSIC_TRANS = {};   // 고전 번역본(좌우 평행용) — Supabase classics.body_trans 이전분(ko-only 등)
function classicFetchId(id){
  if(!id) return null;
  if(id.startsWith('kr-') || id.startsWith('gb-')) return id;
  const m = id.match(/^g(\d+)$/);        // 옛 해외 g15 → gb-15
  return m ? 'gb-' + m[1] : null;
}
const CLASSIC_BODY_P = {};   // in-flight 프라미스 캐시 — 상세모달 프리페치+뷰어 열기가 같은 수 MB를 2번 받지 않게
async function ensureClassicBody(id){
  const fid = classicFetchId(id);
  if(!fid) return;
  // 성공(본문 or 문장쌍 확보) 시에만 skip — 실패로 남은 ''는 다음 열기 때 재시도 (새로고침 전까지 빈 화면 고착 방지)
  if(CLASSIC_BODIES[id] !== undefined &&
     (CLASSIC_BODIES[id] || (typeof BODIES_SENT !== 'undefined' && BODIES_SENT[id]))) return;
  if(CLASSIC_BODY_P[id]) return CLASSIC_BODY_P[id];   // 이미 받는 중이면 그 프라미스 공유
  CLASSIC_BODY_P[id] = (async()=>{
    const base = `/classics?id=eq.${encodeURIComponent(fid)}`;   // SB_REST 뒤 경로 — 익명 키 GET(sbGetAnon)
    try{
      // 1차: body_sent(정렬형 문장쌍)만 — 정렬형(전체 절반)은 body/body_trans가 렌더에 안 쓰여 MB급 낭비였음
      const r1 = await sbGetAnon(`${base}&select=body_sent`);
      if(!r1.ok) throw new Error('HTTP '+r1.status);   // 429/5xx 에러응답을 성공으로 오인해 빈 본문 캐시하는 것 방지
      const rows1 = await r1.json();
      const sent = rows1 && rows1[0] && rows1[0].body_sent;
      if(sent){
        if(typeof BODIES_SENT !== 'undefined' && !BODIES_SENT[id]) BODIES_SENT[id] = sent;
        CLASSIC_BODIES[id] = '';   // fetch 완료 표식(로딩 종료) — 렌더는 BODIES_SENT 경로가 담당
        return;
      }
      // 2차: 비정렬형만 body(원문)+body_trans(ko-only 번역)
      const r = await sbGetAnon(`${base}&select=body,body_trans`);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const rows = await r.json();
      CLASSIC_BODIES[id] = (rows && rows[0] && rows[0].body) ? rows[0].body : '';
      if(rows && rows[0] && rows[0].body_trans) CLASSIC_TRANS[id] = rows[0].body_trans;
    }catch(e){ CLASSIC_BODIES[id] = ''; }   // 이번 뷰는 placeholder 표시, 위 가드 덕에 다음 열기 때 재시도됨
    finally{ delete CLASSIC_BODY_P[id]; }
  })();
  return CLASSIC_BODY_P[id];
}

// 해외 번역 bodies(bodies_gb{id}.js) 지연 로드 — 147권 수동 <script> include 대체.
// 양산 드라이버(_drive.py build) 산출물을 자동 흡수. legacy(dq/gatsby/demian/emma)는 정적 include라
// BODIES_TRANS가 이미 채워져 아래 가드에서 skip. 실패해도 원문 폴백으로 진행.
const FOREIGN_BODY_P = {};
// 레거시 평행리더 본문(파일명이 bodies_gb{id}.js 규칙과 다름) — 정적 include 대신 지연 로드
const LEGACY_BODY_FILES = {'gb-64317':'bodies_gatsby.js','gb-74222':'bodies_demian.js','gb-158':'bodies_emma.js'};
function ensureForeignBody(id){
  if(!id || !id.startsWith('gb-')) return Promise.resolve();
  if((typeof BODIES_TRANS !== 'undefined' && BODIES_TRANS[id]) ||
     (typeof BODIES_ORIG  !== 'undefined' && BODIES_ORIG[id])) return Promise.resolve();
  if(FOREIGN_BODY_P[id]) return FOREIGN_BODY_P[id];
  FOREIGN_BODY_P[id] = new Promise(res=>{
    const s = document.createElement('script');
    s.src = (LEGACY_BODY_FILES[id] || ('bodies_' + id.replace(/-/g,'') + '.js')) + (typeof BODIES_VER !== 'undefined' ? '?b='+BODIES_VER : '');
    s.onload = res;
    s.onerror = ()=>{ delete FOREIGN_BODY_P[id]; s.remove(); res(); };   // 실패분 캐시 삭제 — 새로고침 없이 다음 열기 때 재시도(일시 네트워크 오류·배포 지연 복구)
    document.head.appendChild(s);
  });
  return FOREIGN_BODY_P[id];
}

// ── 챕터블록 렌더(B) 책: 문장쌍 정렬이 드리프트한 재정렬 대상 ──
// 문장 짝맞춤을 포기하고 챕터 단위로만 좌우 정렬. 각 챕터의 en/ko를 독립 블록으로 흘려 렌더.
// 챕터 헤더가 좌우 동일 위치라 챕터 경계서 정렬(alignSections), 챕터 내부는 자연 흐름 → 미스얼라인 0.
// 재정렬 대상 중 챕터블록 렌더가 정합성 검증된 14권(오프라인 blocksim/coherence 확인).
// gb-580·2701·74·76은 body_sent 앞 TOC/프론트매터 제거(DB 수리) 후 편입.
// gb-6593(톰존스)·gb-135(레미제라블): 이전 오정렬/손상분 → 재구축 후 편입(body_sent 확보: 톰존스 415쌍·레미제라블 11,770쌍, 챕터 헤더 정렬됨). 산문은 챕터블록 흐름 렌더.
const CHAPTER_BLOCK_BOOKS = new Set([]);   // 7/15 16권 전권 문장쌍 렌더 복귀 완료(레미제라블 포함 — 챕터단위 367청크 재빌드)
// concat TOC junk(헤더 토큰 2개+ 이어붙고 en===ko) 감지 → 블록 렌더서 스킵
function _isConcatTocJunk(g){
  if(!g||g.length!==1) return false;
  const en=(g[0][0]||'').trim(), ko=(g[0][1]||'').trim();
  const hits=(en.match(/\b(CHAPTER|BOOK|PART|CANTO|LETTER|ACT|SCENE)\b\s+[IVXLCDM0-9]+/gi)||[]).length;
  return hits>=2 && en===ko;
}
// 챕터블록 렌더: side(0=원문/1=번역) 컬럼을 챕터별 블록으로. data-pi/psent 없음(짝맞춤 안 함).
function sentBlockHtml(sentArr, side){
  const chPat = /^\s*(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\s+[IVXLCDM\d]+[.:]?[^\n]*$/i;
  const mdPat = /^\s*#{1,6}\s+\S/;
  const looksHead = s => chPat.test(s) || mdPat.test(s);
  const isHeadPara = g => g.length===1 && looksHead((g[0][0]||'').trim()) && looksHead((g[0][1]||'').trim());
  const arr = sentArr.filter(g => !_isConcatTocJunk(g));   // TOC junk 제거
  const paraText = g => g.map(c=>(c[side]||'')).join(' ').trim();
  const cvChunks = (from, to) => {
    let out=''; for(let i=from;i<to;i+=12){ let inner='';
      for(let j=i;j<Math.min(i+12,to);j++){ const t=paraText(arr[j]); if(t) inner += '<p>'+esc(t).replace(/\n/g,'<br>')+'</p>'; }
      if(inner) out += '<div class="cv-chunk">'+inner+'</div>'; }
    return out;
  };
  const headerIdx = []; arr.forEach((g,i)=>{ if(isHeadPara(g)) headerIdx.push(i); });
  if(headerIdx.length < 2) return cvChunks(0, arr.length);
  // 섹션 범위 계산 + 연속 3개 이상 "빈(본문 0문단) 헤더 섹션" = 미니TOC 블록 → drop (개별 BOOK 구분자는 유지)
  const ranges=[]; for(let i=0;i<headerIdx.length;i++){ const s=headerIdx[i], e=i+1<headerIdx.length?headerIdx[i+1]:arr.length; ranges.push([s,e,e-s-1]); }
  const drop=new Array(ranges.length).fill(false);
  for(let i=0;i<ranges.length;){ if(ranges[i][2]===0){ let j=i; while(j<ranges.length&&ranges[j][2]===0) j++; if(j-i>=3) for(let k=i;k<j;k++) drop[k]=true; i=j; } else i++; }
  let html = '';
  if(headerIdx[0] > 0) html += '<section class="chapter-anchor" data-ch-title="서문 · 머리말">'+cvChunks(0, headerIdx[0])+'</section>';
  for(let i=0;i<ranges.length;i++){
    if(drop[i]) continue;
    const [s,e]=ranges[i];
    const title=((arr[s][0]||[])[side]||'').trim().replace(/^#{1,6}\s+/,'').replace(/\s+/g,' ');
    html += '<section class="chapter-anchor" data-ch-title="'+esc(title)+'"><h3 class="ch-title">'+esc(title)+'</h3>'+cvChunks(s+1, e)+'</section>';
  }
  return html;
}

// 문장정렬 책: 각 문단을 문장 그룹 <span>으로 (data-pi/data-sg 같으면 원문↔번역 대응)
// 모든 책 공통: 챕터헤더(#/CHAPTER)는 chapter-anchor 섹션+제목(TOC용), 산문은 문장 span,
// 12문단씩 cv-chunk(content-visibility)로 묶어 대작(레미제라블 등) 성능 확보. bodyToHtml과 동일 구조.
function sentHtml(sentArr, side){
  const chPat = /^\s*(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\s+[IVXLCDM\d]+[.:]?[^\n]*$/i;
  const mdPat = /^\s*#{1,6}\s+\S/;
  // 양측 모두 헤더로 보일 때만 챕터 섹션화(레거시 '# 제목'). 한쪽만 헤더면(원문만 긴 장제목 등) 본문 취급.
  const looksHead = s => chPat.test(s) || mdPat.test(s);
  const isHeadPara = g => g.length===1 && looksHead((g[0][0]||'').trim()) && looksHead((g[0][1]||'').trim());
  const sentP = (groups, pi) => '<p data-pi="'+pi+'">' +
    groups.map((g, sg) => '<span class="psent" data-pi="'+pi+'" data-sg="'+sg+'">'+esc(g[side]||'')+'</span>').join(' ') + '</p>';
  const cvChunks = (from, to) => {
    let out=''; for(let i=from;i<to;i+=12){ let inner='';
      for(let j=i;j<Math.min(i+12,to);j++) inner += sentP(sentArr[j], j);
      if(inner) out += '<div class="cv-chunk">'+inner+'</div>'; }
    return out;
  };
  const headerIdx = []; sentArr.forEach((g,i)=>{ if(isHeadPara(g)) headerIdx.push(i); });
  if(headerIdx.length < 2) return cvChunks(0, sentArr.length);   // 헤더 없는 책(변신·신규): cv-chunk만
  let html = '';
  if(headerIdx[0] > 0) html += '<section class="chapter-anchor" data-ch-title="서문 · 머리말">'+cvChunks(0, headerIdx[0])+'</section>';
  for(let i=0;i<headerIdx.length;i++){
    const s=headerIdx[i], e=i+1<headerIdx.length?headerIdx[i+1]:sentArr.length;
    const title=((sentArr[s][0]||[])[side]||'').trim().replace(/^#{1,6}\s+/,'').replace(/\s+/g,' ');
    html += '<section class="chapter-anchor" data-ch-title="'+esc(title)+'"><h3 class="ch-title">'+esc(title)+'</h3>'+cvChunks(s+1, e)+'</section>';
  }
  return html;
}

function viewerBodies(book){
  // BOOK_CONTENT 우선(mock 군주론 등), 없으면 CLASSIC_BODIES(한국고전 fetch) → BODIES_ORIG/TRANS
  const mock = BOOK_CONTENT[book.id] || {};
  const id = book.id;
  // 문장정렬 데이터 있으면 문장 span 렌더(상호 하이라이트용). mock(군주론 등)이 우선.
  if(!mock.origin && typeof BODIES_SENT !== 'undefined' && BODIES_SENT[id]){
    const S = BODIES_SENT[id];
    if(CHAPTER_BLOCK_BOOKS.has(id))   // 재정렬 책: 챕터블록 렌더(문장 짝맞춤 X, 챕터 단위 정렬)
      return { orig: sentBlockHtml(S, 0), trans: sentBlockHtml(S, 1), quiz: mock.quiz, nativeEN: mock.nativeEN };
    return { orig: sentHtml(S, 0), trans: sentHtml(S, 1), quiz: mock.quiz, nativeEN: mock.nativeEN };
  }
  const orig = mock.origin
    || (typeof BODIES_ORIG !== 'undefined' && BODIES_ORIG[id] ? bodyToHtml(BODIES_ORIG[id]) : '')
    || (CLASSIC_BODIES[id] ? bodyToHtml(CLASSIC_BODIES[id]) : '');
  let trans = mock.trans
    || (typeof BODIES_TRANS !== 'undefined' && BODIES_TRANS[id] ? bodyToHtml(BODIES_TRANS[id]) : '')
    || (CLASSIC_TRANS[id] ? bodyToHtml(CLASSIC_TRANS[id]) : '');
  // modern: trans는 별도 없음 — 비워두고 placeholder가 노출되게 함
  return { orig, trans, quiz: mock.quiz, nativeEN: mock.nativeEN };
}

