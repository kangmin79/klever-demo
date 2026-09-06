/* ═══ 속표지(첫 화면) — 왼쪽 칸=표지, 오른쪽 칸=목차 ═══
   ⚠️ 이 블록 안에 <p>를 넣으면 안 된다. 좌우 문단 1:1 정렬이 <p> 개수로 정렬책을 판정하므로
      한쪽에만 <p>가 생기면 책 전체 수평정렬이 꺼진다. (.cv-chunk·h3.ch-title도 금지 —
      읽던 자리 저장 앵커가 그 둘을 세기 때문)
   국내 고전(kr-) 9/2 확인 → 해외 고전(gb-)까지 전권 적용. */
function frontPageOn(){
  if(!currentBook || currentMode !== 'full') return false;
  const id = String(currentBook.id);
  return id.startsWith('kr-') || id.startsWith('gb-');
}
// 속표지 문구 — 지금 보고 있는 칸의 언어를 따라간다(번역 칸은 그 나라 말, 원문 칸은 한국어)
const FRONT_I18N = {
  ko:{about:'이 책은',            toc:'목차',      start:'읽기 시작 ↓'},
  zh:{about:'关于本书',            toc:'目录',      start:'开始阅读 ↓'},
  vi:{about:'Về cuốn sách',       toc:'Mục lục',   start:'Bắt đầu đọc ↓'},
  en:{about:'About this book',    toc:'Contents',  start:'Start reading ↓'},
  ja:{about:'この本について',       toc:'目次',      start:'読みはじめる ↓'},
};
function frontT(lang){ return FRONT_I18N[lang] || FRONT_I18N.ko; }
// 지금 뷰어의 왼쪽·오른쪽 칸이 각각 무슨 말인지
//  - 한국 고전 평행본: 왼쪽 번역(KR_LANG) / 오른쪽 한국어 원문
//  - 해외 고전: 왼쪽 원서(영어, Gutenberg) / 오른쪽 한국어 번역
function frontLangs(b){
  if(!b) return {left:'ko', right:'ko'};
  const id = String(b.id);
  if(id.startsWith('gb-')) return {left:'en', right:'ko'};
  const swap = id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[b.id];
  return {left: swap ? KR_LANG : 'ko', right: 'ko'};
}
function bookIntro(b, lang){
  if(!b) return '';
  const ml = (typeof CLASSIC_SUMMARY_ML!=='undefined') && CLASSIC_SUMMARY_ML[b.id];
  if(lang && lang!=='ko' && ml && ml[lang]) return ml[lang];   // 번역본 없으면 아래 한국어로 폴백
  const s = (typeof CLASSIC_SUMMARY!=='undefined' && CLASSIC_SUMMARY[b.id]) ? CLASSIC_SUMMARY[b.id] : '';
  if(s) return s;
  if(ml && ml.ko) return ml.ko;   // 한국어 소개글이 원래 없던 해외 고전 61권은 다국어판 쪽에 한국어도 들어 있음
  return `${b.author||''}의 ${b.period||''} ${b.category||''} 정전입니다. 저작권이 만료된 공개 작품(PD)으로, 북픽 표준 격조체 본문으로 바로 읽을 수 있어요.`;
}
function bfCoverFail(img){ img.outerHTML = '<div class="bf-nocv">'+esc(img.dataset.t||'')+'</div>'; }
function frontGoRead(){
  const pane = _scrollEl(); if(!pane) return;
  const first = pane.querySelector('.chapter-anchor, .cv-chunk');
  if(first) pane.scrollTo({top: first.offsetTop, behavior:'smooth'});
}
function bookFrontHtml(b, lang){
  const isGb = String(b.id).startsWith('gb-');
  const ml = (typeof CLASSIC_SUMMARY_ML!=='undefined') && CLASSIC_SUMMARY_ML[b.id];
  // 해외 고전의 영어 칸: 원제를 크게, 한글 제목을 작게, 저자는 영문 표기. 그 외는 한글 제목 크게 + 원제 작게
  const enPane = isGb && lang === 'en';
  // 원제: 데이터에 영어 원제가 없고 한글만 있는 16권(설득·월든 등)은 다국어판의 영문 제목을 쓴다
  const titleEn = (b.titleEn && !/[가-힣]/.test(b.titleEn)) ? b.titleEn : ((ml && ml.title_en) || '');
  const big   = enPane ? (titleEn || b.title || '') : (b.title || '');
  const small = enPane ? (b.title !== big ? b.title : '') : (titleEn && titleEn !== b.title ? titleEn : '');
  const author = (enPane && ml && ml.author_en) ? ml.author_en : (b.author || '');
  const t = esc(big);
  const orig = small ? `<div class="bf-meta">${esc(small)}</div>` : '';
  const cover = b.coverSrc
    ? `<img src="${esc(b.coverSrc)}" alt="${t}" data-t="${t}" onerror="bfCoverFail(this)">`
    : `<div class="bf-nocv">${t}</div>`;
  // 메타 줄: 해외 고전은 분류(해외문학)와 시대(해외)가 같은 말이라 시대는 뺀다. 영어 칸엔 출처만
  const meta = (enPane ? [b.src] : [b.category, b.period !== '해외' ? b.period : '', b.src]).filter(Boolean).map(esc).join(' · ');
  return `<div class="book-front" data-lang="${esc(lang||'ko')}">
      <div class="bf-cover">${cover}
        <div class="bf-t">${t}</div>${orig}
        <div class="bf-a">${esc(author)}</div>
        ${meta ? `<div class="bf-meta">${meta}</div>` : ''}</div>
      <div class="bf-side"><div class="bf-h"></div><div class="bf-toc"></div></div>
      <div class="bf-go"><button onclick="frontGoRead()">${esc(frontT(lang).start)}</button></div>
    </div>`;
}

function renderViewer(){
  if(!currentBook) return;
  const L = viewerLabels(currentBook);
  // viewerBodies(전권 HTML 생성, 대작 수백 ms)는 실제로 쓰는 분기에서만 지연 계산
  // (기존: 장면챌린지/챗퀴즈 모드에서도 매 응답마다 전권 HTML 2회 생성 후 버리던 낭비)
  let _c = null; const C = () => (_c || (_c = viewerBodies(currentBook)));
  const body = document.getElementById('viewerBody');
  const info = document.getElementById('viewerFooterInfo');
  // 고전 본문을 Supabase에서 받아오는 중이면 "준비 중" 대신 로딩 표시
  const loading = !!classicFetchId(currentBook.id) && CLASSIC_BODIES[currentBook.id]===undefined;
  const loadingHtml = '<div class="viewer-loading">📖 본문을 불러오는 중…</div>';
  const ph = txt => loading ? loadingHtml : `<p style="color:var(--text-light);">${txt}</p>`;
  // 장르별 조판 클래스 (category 기반)
  body.classList.remove(...GENRE_CLASSES);
  body.classList.add('gv-' + genreOf(currentBook.category));
  // 정렬본(문장쌍) 중 대작이 아닌 책: content-visibility 가상화를 꺼서 좌우 문단 높이잠금이 항상 정확·안정
  // (화면 밖 가상화가 정렬을 무너뜨리는 브라우저 문제 원천차단). 대작은 성능 위해 가상화 유지(청크쌍 잠금으로 방어).
  body.classList.remove('sent-novirt');
  { const _S = (typeof BODIES_SENT!=='undefined') && BODIES_SENT[currentBook.id];
    const _mockOrigin = (typeof BOOK_CONTENT!=='undefined' && BOOK_CONTENT[currentBook.id] && BOOK_CONTENT[currentBook.id].origin);
    if(_S && !_mockOrigin && _S.length <= 4500) body.classList.add('sent-novirt'); }

  if(currentMode==='challenge'){ const _pl=document.getElementById('viewerProgLabel'); if(_pl) _pl.textContent=''; }   // 챌린지: 남은시간 라벨 강제 비움(스크롤 없어 _setProgLabel 미호출 대비)
  // 상세 모달에서 유형을 골라 들어왔으면 장면 챌린지(하드코딩)보다 그 유형의 퀴즈 패널이 우선 — 학생이 방금 누른 것이니까(8/20)
  if(currentMode === 'challenge' && !_quizWant() && typeof CHALLENGE_SCENES !== 'undefined' && CHALLENGE_SCENES[currentBook.id]){
    renderSceneChallenge(CHALLENGE_SCENES[currentBook.id], body, info);
  } else if(currentMode === 'challenge'){
    // 챌린지 좌측: classic/foreign은 풀이/번역, modern은 원문 / 우측: 참여 챌린지 미션(별 적립)
    // 한국고전 평행(KR_SENT) 주입 후엔 trans=외국어(zh 등) → 본문 칸은 한국어(side0=orig)를 쓴다 (8/15: 챌린지에 중국어 뜨던 버그)
    const _krSent = currentBook.id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[currentBook.id];
    const leftBody = (_krSent ? C().orig : (currentBook.locale === 'modern' ? C().orig : C().trans))
                     || ph(_krSent ? L.placeholderOrig : L.placeholderTrans);
    renderMissionPanel(body, info, leftBody, L);
  } else if(currentMode === 'full'){
    info.innerHTML = '완독 모드 · 전권 일반 전자책 · <b>장당 +30 점수</b>';
    // 한국 고전 평행: 번역(모국어)을 왼쪽, 한국어 원문을 오른쪽
    const krSwap = currentBook.id.startsWith('kr-') && typeof KR_SENT!=='undefined' && KR_SENT[currentBook.id];
    const leftBody  = krSwap ? (C().trans || ph(L.placeholderTrans)) : (C().orig  || ph(L.placeholderOrig));
    const rightBody = krSwap ? (C().orig  || ph(L.placeholderOrig))  : (C().trans || ph(L.placeholderTrans));
    // 속표지: 양쪽 칸에 같은 블록을 넣고 CSS가 PC에서 왼쪽=표지·오른쪽=목차로 갈라 보여준다
    // (좌우 높이가 같아야 비율 동기 스크롤이 어긋나지 않는다 → .book-front{height:100%})
    const _fl = frontPageOn() ? frontLangs(currentBook) : null;
    const frontL = _fl ? bookFrontHtml(currentBook, _fl.left)  : '';
    const frontR = _fl ? bookFrontHtml(currentBook, _fl.right) : '';
    body.innerHTML = `
      <div class="viewer-pane left">
        ${frontL}
        <div class="viewer-pane-label">${L.leftLabel}</div>
        ${leftBody}
      </div>
      <div class="viewer-pane right">
        ${frontR}
        <div class="viewer-pane-label">${L.rightLabel}</div>
        ${rightBody}
      </div>
    `;
  } else if(currentMode === 'intl'){
    info.innerHTML = 'International 모드 · <b>한국어로 챌린지 수행 필수</b>';
    body.innerHTML = `
      <div class="viewer-pane left">
        <div class="viewer-pane-label">${L.intlLeftLabel}</div>
        ${C().trans || C().orig || ph(L.placeholderTrans)}
      </div>
      <div class="viewer-pane right">
        <div class="viewer-pane-label">오른쪽 — Native Language (English)</div>
        ${C().nativeEN || `<p style="color:var(--text-light);">Native translation will appear here. (Currently English; selectable to 中文 / Tiếng Việt / etc.)</p>`}
      </div>
    `;
  }
  _setupMobilePanes(_c || {});   // 장면챌린지 모드는 c 미계산(라벨 분기가 c를 안 봄)
  setTimeout(_chromeAutoCheck, 400);   // 8/17: 스크롤할 내용이 없으면 메뉴를 보여 둠
  if(!setupSentenceParallel()) setupParallel();   // 문장정렬 책=문장 단위, 아니면 기존 문단 단위
  scheduleAlign(); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(scheduleAlign);   // A안: 좌우 문단 수평 정렬(웹폰트 로드 후 재정렬)
  // 바닥 액션: 장 이동(◀이전/다음▶) 버튼 제거 — 스크롤·탭넘김·목차(☰)가 이미 담당, 모바일 세로 한 줄 회수
  // 장면챌린지의 장면 이동은 퀴즈 진행 자체라 유지. 완독 모드는 버튼이 없어 footer 통째 숨김(독서 공간 확보)
  const acts = document.getElementById('viewerActions');
  if(acts){
    const isSceneChal = (currentMode === 'challenge' && typeof CHALLENGE_SCENES !== 'undefined' && !!CHALLENGE_SCENES[currentBook.id]);
    const isChatChal = isSceneChal && CHAT_QUIZ_BOOKS.has(currentBook.id);
    acts.innerHTML = isChatChal
      ? `<button class="viewer-action" onclick="chatRestart()">↻ 처음부터 다시</button>`   // 연속 진행 — 재도전만
      : isSceneChal
      ? `<button class="viewer-action" onclick="sceneGo(-1)">◀ 이전 장면</button>`
        + `<button class="viewer-action primary" onclick="sceneGo(1)">다음 장면 ▶</button>`
      : (currentMode === 'full')
      ? ''
      : (currentMode === 'challenge')
      ? `<button class="viewer-action primary" onclick="closeViewer()">닫기</button>`
      : `<button class="viewer-action primary" onclick="finishChallenge()">챌린지 수행 완료 →</button>`;
    const ft = acts.closest('.viewer-footer');
    if(ft) ft.style.display = acts.innerHTML ? '' : 'none';
  }
}

