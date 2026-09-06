/* ═══════════════════════════════════════════════════════════
   홈 / 컬렉션 큐레이션 렌더
   ═══════════════════════════════════════════════════════════ */
function renderCurations(targetId, filterIntl){
  const el = document.getElementById(targetId);
  if(!el) return;
  const list = filterIntl ? CURATIONS.filter(c=>c.intl) : CURATIONS;
  el.innerHTML = list.map(c=>`
    <div class="curation-card ${c.cls}" onclick="alert('${esc(c.title)} 컬렉션 열기')">
      <div class="curation-eyebrow">${esc(c.eyebrow)}</div>
      <div class="curation-title">${esc(c.title)}</div>
      <div class="curation-desc">${esc(c.desc)}</div>
      <div class="curation-meta">${esc(c.meta)}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   AI 추천 (목원대 큐레이션 대응 — 북스타판: 추천→챌린지 연결)
   ═══════════════════════════════════════════════════════════ */
// 세부 category를 사용자 친화 장르로 묶기
const REC_GENRES = [
  {key:'novel',   label:'소설',       cats:['소설','근대 소설','수필','근대 수필'], kdc:'8'},
  {key:'poem',    label:'시',         cats:['시','근대 시'], kdc:'8'},
  {key:'thought', label:'철학·사상',  cats:['고대 철학','근세 철학','철학','정치사상','경제사상','근대 사상'], kdc:'1'},
  {key:'play',    label:'희곡',       cats:['희곡','고대 비극'], kdc:'8'},
  {key:'epic',    label:'서사시·고전',cats:['서사시','고대 서사시'], kdc:'9'},
  {key:'sci',     label:'과학·심리',  cats:['과학','심리학'], kdc:'4'},
];

/* ═══════════════════════════════════════════════════════════
   고전 컬렉션 — 카테고리별 책 캐러셀 (우리 도서관 형식)
   ═══════════════════════════════════════════════════════════ */
const CLASSIC_SUB = {
  '소설':'한 편의 이야기로 시대를 읽다', '시':'짧은 행에 담긴 깊은 울림',
  '철학·사상':'생각하는 법을 배우는 고전', '희곡':'무대 위에서 살아나는 인간',
  '서사시·고전':'문명의 뿌리가 된 위대한 서사', '수필·에세이':'삶을 들여다보는 작가의 시선',
  '과학·심리':'세계와 마음을 탐구하다',
};
function clCard(b, opts){
  opts = opts || {};
  const showLang = opts.krLang && b.locale==='modern' && b.hasTrans;   // 번역된 한국 고전만 4개언어 표시
  const badge = showLang ? '<span class="cl-langbadge" aria-label="번역서"></span>' : '';
  let chips = '';
  if(showLang && opts.krLang!=='all'){   // 'all'일 땐 표지 배지(🌐 4개 언어)와 중복이라 칩 생략, 특정 언어 선택 시에만 표시
    chips = `<div class="cl-cardlangs"><span class="cl-lg hl">${KR_LANG_NAMES[opts.krLang]}</span><span class="cl-lg">+한국어</span></div>`;
  }
  // 언어 선택 시 번역 제목을 주 제목으로, 한국어 원제는 아래 줄에 (title_tr, classic_translations)
  const tt = (b.locale==='modern' && typeof krTitleOf==='function') ? krTitleOf(b) : null;
  return `<div class="book-card cl-card${b.minumsa?' has-mns':''}" onclick="openDetail('${b.id}')">`
    + `${b.minumsa?'<span class="mns-badge">★ 민음사</span>':''}${badge}${bookCoverHTML(b)}`
    + `<div class="book-info"><div class="book-title">${esc(tt||b.title)}</div>`
    + `<div class="book-author">${esc(tt ? (b.title+' · '+b.author) : b.author)}</div>${chips}</div></div>`;
}
function clShelf(title, books, opts){
  const unit = {en:' books',zh:'本',vi:' cuốn',ja:'冊'};
  const u = (_clTab==='modern'&&_clLang!=='all') ? (unit[_clLang]||'권') : '권';
  return `<div class="cl-shelf">${mlHead(clT(title), clT(CLASSIC_SUB[title]||'')+' · '+books.length+u)}`
    + `${mlCarousel(`<div class="ml-hrow">${books.map(b=>clCard(b,opts)).join('')}</div>`)}</div>`;
}
function clShelvesHTML(loc, opts){
  const pool = BOOKS.filter(b=> b.locale===loc);
  const covered = new Set();
  let html = '';
  REC_GENRES.forEach(g=>{
    const books = pool.filter(b=> g.cats.includes(b.category));
    if(!books.length) return;
    books.forEach(b=>covered.add(b.id));
    html += clShelf(g.label, books, opts);
  });
  const rest = pool.filter(b=> !covered.has(b.id));
  if(rest.length) html += clShelf(loc==='foreign'?'해외 고전':'그 외 고전', rest, opts);
  return html;
}
// 고전 컬렉션 — 해외/국내 탭 (국내 탭: 유학생 환영 배너 + 언어칩)
// 탭별 사서 큐레이션 영역 (library_sections.area) — 관리자에서 해외/국내 분리 큐레이션
const CL_AREA = {foreign:'고전 컬렉션 해외', modern:'고전 컬렉션 국내'};
function isClassicsArea(a){ return String(a||'').indexOf('고전 컬렉션')===0; }
let _clTab='foreign', _clLang='all';
function renderClassicShelves(){
  const head = document.getElementById('clHead');
  const host = document.getElementById('classicShelves');
  if(!host || typeof BOOKS==='undefined') return;
  const fN = BOOKS.filter(b=>b.locale==='foreign').length;
  const kN = BOOKS.filter(b=>b.locale==='modern').length;
  if(!fN && !kN){ host.innerHTML=`<div style="text-align:center;color:var(--text-light);font-size:13.5px;padding:40px 0">${uiT('불러오는 중…')}</div>`; return; }
  const foreign = _clTab==='foreign';
  // 탭 라벨·권수 단위 다국어 (비한국어 모드에선 영문 부제와 겹치지 않게 권수만)
  const _cnt={en:' books',zh:'本',vi:' cuốn',ja:'冊'};
  const _fSub = UI_LANG==='ko' ? `WORLD CLASSICS · ${fN}권` : `${fN}${_cnt[UI_LANG]||'권'}`;
  const _kSub = UI_LANG==='ko' ? `KOREAN CLASSICS · 다국어 · ${kN}권` : `KOREAN CLASSICS · ${kN}${_cnt[UI_LANG]||'권'}`;
  const tabs = `<div class="cl-tabs">
      <button class="cl-tab ${foreign?'on':''}" onclick="clSetTab('foreign')">${uiT('세계고전')} <span class="en">${_fSub}</span></button>
      <button class="cl-tab ${!foreign?'on':''}" onclick="clSetTab('modern')">Global Book <span class="en">${_kSub}</span></button>
    </div>`;
  // 8/17 사장님 수정요청: 메뉴 하단 설명 2줄(윗줄 메인·아랫줄 보조). 기존 cl-intro/cl-welcome 한 줄 소개문은 이걸로 대체.
  // International 아랫줄은 학생이 고른 언어(헤더 드롭다운 UI_LANG)로 — 한국어 모드면 영어(시안 그대로).
  let headBody;
  if(foreign){
    headBody = `<div class="pg-intro"><div class="pi-main">세계 고전을 원문과 번역으로 함께 읽어요</div><div class="pi-sub">대출이나 예약 없이 언제든 바로 읽고, 다 읽으면 완독으로 남아요</div></div>`;
  } else {
    const subMap = {ko:'Read Korean classics with a translation in your own language', en:'Read Korean classics with a translation in your own language', zh:'用你的母语译文阅读韩国古典文学', vi:'Đọc văn học kinh điển Hàn Quốc cùng bản dịch bằng ngôn ngữ của bạn', ja:'あなたの母語の翻訳と一緒に韓国古典を読みましょう'};
    const lang = (typeof UI_LANG!=='undefined' && subMap[UI_LANG]) ? UI_LANG : (subMap[_clLang]?_clLang:'ko');
    headBody = `<div class="pg-intro"><div class="pi-main">한국 고전을 모국어 번역과 함께 읽으며 한국어와 한국 문화를 배워요</div><div class="pi-sub" lang="${lang==='ko'?'en':lang}">${subMap[lang]}</div></div>`;
  }
  // 탭(모바일만 노출) + (국내)배너/인트로 = 페이지 최상단(clHead). 책 줄 = 사서 큐레이션 아래.
  // 데스크톱은 큰 권역 제목 없이 인트로/배너만 — 상단 네비 드롭다운이 권역을 알려줌(중복 제거)
  if(head) head.innerHTML = tabs + headBody;
  const rows = foreign ? clShelvesHTML('foreign') : clShelvesHTML('modern', {krLang:_clLang});
  host.innerHTML = `<div style="margin-top:6px;">${rows}</div>`;
  bindClassicDrag();
  // 탭별 사서 큐레이션(해외/국내 각각) 렌더
  renderAreaCuration('collectionCuration', CL_AREA[_clTab]);
}
// 8/15: 탭 이동 시 언어 강제 리셋 제거 — 영어 고른 유학생이 세계고전 누르면 전체 UI가 한국어로 돌아가던 문제.
// 언어는 헤더 드롭다운의 전역 선택으로 유지. 세계고전 콘텐츠는 clT()가 _clTab 가드로 알아서 한국어 표시.
function clSetTab(t){ _clTab=t; renderClassicShelves(); _gnbClSync(); }
// 페이지 내 탭 전환 시 GNB(세계고전/International) 밑줄도 현재 권역으로 동기화
function _gnbClSync(){
  const pg=document.getElementById('page-collection');
  if(!pg||!pg.classList.contains('active')) return;
  document.querySelectorAll('.gnb-item[data-page="collection"]').forEach(el=>
    el.classList.toggle('active', el.dataset.cl===(_clTab==='modern'?'modern':'foreign')));
}
// 상단 네비(세계고전/International) → 권역 설정 후 고전 컬렉션 페이지로 (언어 리셋 없음 — clSetTab 주석 참조)
function navCl(t){ _clTab=t; nav('collection'); }
// ── International 언어 전환: 칩 클릭 시 GNB·사이드바·줄제목·장르서가·책제목까지 일괄 전환 ──
// UI 크롬(GNB·사이드바) 고정 문구 사전. 그 외 페이지 콘텐츠(우리도서관 큐레이션 등)는 한국어 유지.
const UI_I18N={
  en:{'우리 도서관':'Our Library','독서 챌린지':'Reading Challenge','세계고전':'World Classics','커뮤니티':'Community',
      '마이 챌린지':'My Challenge','리더보드':'Leaderboard','검색':'Search','피드':'Feed','내서재':'My Bookshelf',
      '내 도서관':'My Library','내 서재':'My Bookshelf','마이페이지':'My Page','로그아웃':'Log out','세명대 로그인':'Semyung Login',
      '다시 로그인':'Log in again','세명대 계정으로 로그인':'Log in with your Semyung account','불러오는 중…':'Loading…'},
  zh:{'우리 도서관':'我们的图书馆','독서 챌린지':'阅读挑战','세계고전':'世界古典','커뮤니티':'社区',
      '마이 챌린지':'我的挑战','리더보드':'排行榜','검색':'搜索','피드':'动态','내서재':'我的书架',
      '내 도서관':'我的图书馆','내 서재':'我的书架','마이페이지':'我的页面','로그아웃':'退出登录','세명대 로그인':'世明大学登录',
      '다시 로그인':'重新登录','세명대 계정으로 로그인':'使用世明大学账号登录','불러오는 중…':'加载中…'},
  vi:{'우리 도서관':'Thư viện của chúng ta','독서 챌린지':'Thử thách đọc sách','세계고전':'Kinh điển thế giới','커뮤니티':'Cộng đồng',
      '마이 챌린지':'Thử thách của tôi','리더보드':'Bảng xếp hạng','검색':'Tìm kiếm','피드':'Bảng tin','내서재':'Tủ sách của tôi',
      '내 도서관':'Thư viện của tôi','내 서재':'Tủ sách của tôi','마이페이지':'Trang của tôi','로그아웃':'Đăng xuất','세명대 로그인':'Đăng nhập Semyung',
      '다시 로그인':'Đăng nhập lại','세명대 계정으로 로그인':'Đăng nhập bằng tài khoản Semyung','불러오는 중…':'Đang tải…'},
  ja:{'우리 도서관':'私たちの図書館','독서 챌린지':'読書チャレンジ','세계고전':'世界古典','커뮤니티':'コミュニティ',
      '마이 챌린지':'マイチャレンジ','리더보드':'リーダーボード','검색':'検索','피드':'フィード','내서재':'マイ本棚',
      '내 도서관':'マイ図書館','내 서재':'マイ本棚','마이페이지':'マイページ','로그아웃':'ログアウト','세명대 로그인':'世明大ログイン',
      '다시 로그인':'再ログイン','세명대 계정으로 로그인':'世明大アカウントでログイン','불러오는 중…':'読み込み中…'},
};
// 로그인 안내 모달(정적 HTML) 다국어 — applyUiLang()이 h3/p를 갈아끼움
const LOGIN_MODAL_I18N={
  ko:{h:'세명대 계정으로 로그인', p:'세명대 포털로 로그인한 뒤, 도서관 홈페이지의 <b>북픽 배너</b>를 누르면 자동으로 로그인됩니다. 로그인하지 않아도 책은 자유롭게 둘러볼 수 있어요.'},
  en:{h:'Log in with your Semyung account', p:'Log in on the Semyung portal, then click the <b>Book Pick banner</b> on the library homepage — you will be logged in automatically. You can still browse books freely without logging in.'},
  zh:{h:'使用世明大学账号登录', p:'先登录世明大学门户，再点击图书馆主页的<b>북픽（Book Pick）横幅</b>，即可自动登录。不登录也可以自由浏览图书。'},
  vi:{h:'Đăng nhập bằng tài khoản Semyung', p:'Đăng nhập cổng thông tin Semyung, sau đó nhấn <b>banner Book Pick</b> trên trang chủ thư viện — bạn sẽ được đăng nhập tự động. Không đăng nhập vẫn có thể tự do xem sách.'},
  ja:{h:'世明大アカウントでログイン', p:'世明大ポータルにログインした後、図書館ホームページの<b>ブックピック（북픽）バナー</b>を押すと自動でログインされます。ログインしなくても本は自由に見られます。'},
};
// 세계고전 탭 인트로 다국어 (마크업 포함)
const CL_FOREIGN_INTRO={
  ko:'세계 명작을 <b>한국어로 쉽게</b> — 작가가 던지는 질문을 퀴즈로 풀고, 한 줄 소감을 남기며 가볍게 고전에 다가가요.',
  en:'World classics, <b>made easy in Korean</b> — answer each author\'s questions as quizzes, leave a one-line impression, and get closer to the classics.',
  zh:'世界名著，<b>用韩语轻松读</b>——把作家抛出的问题当作小测验来解，留下一句感想，轻松走近古典。',
  vi:'Danh tác thế giới, <b>đọc dễ dàng bằng tiếng Hàn</b> — giải những câu hỏi của tác giả qua quiz, để lại một dòng cảm nhận và đến gần hơn với kinh điển.',
  ja:'世界の名作を<b>韓国語でやさしく</b>——作家が投げかける問いをクイズで解き、一行の感想を残して、気軽に古典に近づきましょう。',
};
let UI_LANG='ko';
function uiT(ko){ return (UI_I18N[UI_LANG]||{})[ko]||ko; }
// (8/31 폐지) 모바일 축약 라벨 '우리 도서관'→'도서관' · '독서 챌린지'→'챌린지'.
//   사장님: 폰에서 '우리'가 빠져 보인다. 실측하니 전체 이름 4개가 284px면 되고 360px 폰부터는 여유가 있다.
//   320px대 옛 기기만 4px 모자라서, 그 구간은 CSS(max-width:360px)에서 글자·간격을 살짝 좁혀 한 줄을 지킨다.
function applyUiLang(l){
  UI_LANG=(l&&UI_I18N[l])?l:'ko';
  const _ls=document.getElementById('langSelect'); if(_ls&&_ls.value!==UI_LANG)_ls.value=UI_LANG;   // 헤더 드롭다운 표시값 동기화
  document.documentElement.lang=UI_LANG;   // 화면낭독기·브라우저 자동번역이 현재 언어를 알도록
  // 로그인 안내 모달(정적 HTML) 문구 교체
  const _lm=LOGIN_MODAL_I18N[UI_LANG]||LOGIN_MODAL_I18N.ko;
  const _mh=document.getElementById('bxAccModalH'); if(_mh) _mh.textContent=_lm.h;
  const _mp=document.getElementById('bxAccModalP'); if(_mp) _mp.innerHTML=_lm.p;

  document.querySelectorAll('.gnb-item').forEach(el=>{
    if(!el.dataset.ko) el.dataset.ko=el.textContent.trim();
    el.textContent=uiT(el.dataset.ko);   // 폰에서도 전체 이름 그대로 (축약 폐지 — 위 주석)
  });
  // 넘칠 때만 스크롤 페이드 힌트 (다 들어가면 페이드·여백 없이 깔끔하게)
  // 주의: gnb-scroll 자체가 여백 28px를 추가하므로, 반드시 벗긴 상태에서 측정 (상태 고착 방지)
  const g=document.querySelector('.gnb');
  if(g)requestAnimationFrame(()=>{g.classList.remove('gnb-scroll');g.classList.toggle('gnb-scroll',g.scrollWidth>g.clientWidth+2);});
  if(typeof _navPage!=='undefined'&&_navPage) renderSideNav(_navPage);   // 사이드바 라벨 재렌더
}
// International 콘텐츠(줄제목·부제·장르라벨) 사전 — 한국어 원문 키. 사서가 제목을 바꾸면 자동으로 한국어 폴백.
const CL_I18N={
en:{
 '[유학생] 처음 펼치기 좋은, 가장 가까운 한국':'Your First Step into Korea','짧고 쉬워서, 한국 문학으로 들어서는 가장 편안한 첫걸음':'Short and easy — the gentlest way into Korean literature',
 '[유학생] 변하지 않는 마음':'Feelings That Never Change','설렘도 그리움도, 결국 같은 마음':'Longing and love — the same heart everywhere',
 '다시, 처음처럼':'Again, Like the First Time','익숙한 제목이네, 아직 읽지 않은 이야기':"Familiar titles, stories you haven't read yet",
 '[유학생] 오래 사랑받는 이름들':'Names Loved for Generations','시간이 지나도 빛나는, 그 이름들과의 만남':'Meet the names that shine through time',
 '무너지지 않는 마음':"Hearts That Don't Break",'흔들려도 끝내 무너지지 않은 마음들':'Shaken, but never broken',
 '[유학생] 한국이라는 마음':'The Heart of Korea','한 걸음 더 가까이, 이 나라의 안쪽으로':'One step closer to the inside of this country',
 '문장이 머무는 자리':'Where Sentences Stay','짧은 한 줄이 오래 남는 순간':'When one short line lingers',
 '[유학생] 스스로를 택한 여자들':'Women Who Chose Themselves','누구의 눈치도 보지 않고, 자기 삶을':'Living their own lives, on their own terms',
 '소설':'Fiction','시':'Poetry','철학·사상':'Philosophy & Thought','그 외 고전':'More Classics',
 '한 편의 이야기로 시대를 읽다':'Reading an era through a single story','짧은 행에 담긴 깊은 울림':'Deep resonance in short lines','생각하는 법을 배우는 고전':'Classics that teach you how to think',
 '이상하게 끌리는 문장들':'Strangely Captivating Sentences','이상의 소설과 시를 직접 읽으며, 해체와 실험 속에서 나만의 문체 감각을 찾아보세요.':"Read Yi Sang's fiction and poetry firsthand, and find your own sense of style amid deconstruction and experiment.",
 '웃음 뒤에 칼이 있다':'A Blade Behind the Laughter','시대의 모순을 정면으로 겨눈 작가들의 날 선 문장들—웃기지만 결코 가볍지 않은 이야기들이 기다리고 있어요.':'Sharp-edged sentences aimed straight at the contradictions of their era — funny, but never light.',
 '닿지 못한 마음들':'Hearts That Never Reached','사랑했지만 끝내 엇갈렸던 사람들의 이야기—그 애틋하고 쓸쓸한 감정의 결을 따라가 보세요.':'Stories of people who loved but kept missing each other — follow the tender, lonely grain of those feelings.',
 '우리가 살아낸 자리':'The Places We Lived Through','강경애와 나혜석, 시대의 틈새에서 자신의 언어로 삶을 새긴 두 여성 작가의 목소리를 만나보세요.':'Meet Kang Kyeong-ae and Na Hye-sok — two women writers who carved their lives in their own words, in the cracks of their era.',
 '사람으로 읽는 역사':'History Read Through People','왕도, 장군도, 승려도 결국 한 사람이었다 — 인물의 삶 속으로 걸어 들어가 역사를 온몸으로 느껴보세요.':'Kings, generals, monks — all of them, in the end, one person. Step into their lives and feel history firsthand.',
 '굶주림이 사람을 만든다':'Hunger Makes the Human','배고픔 앞에서 인간은 무엇을 선택하는가 — 강경애·김동인·최서해의 날카로운 시선으로 읽는 결핍의 심리학.':'What do people choose in the face of hunger? The psychology of deprivation, through the sharp eyes of Kang Kyeong-ae, Kim Tong-in, and Choe Seo-hae.'},
zh:{
 '[유학생] 처음 펼치기 좋은, 가장 가까운 한국':'初次翻开，最亲近的韩国','짧고 쉬워서, 한국 문학으로 들어서는 가장 편안한 첫걸음':'短小易读，走进韩国文学最轻松的第一步',
 '[유학생] 변하지 않는 마음':'不变的心','설렘도 그리움도, 결국 같은 마음':'心动与思念，终究是同一种心情',
 '다시, 처음처럼':'再一次，像初见','익숙한 제목이네, 아직 읽지 않은 이야기':'熟悉的书名，还未读过的故事',
 '[유학생] 오래 사랑받는 이름들':'被长久喜爱的名字','시간이 지나도 빛나는, 그 이름들과의 만남':'与历久弥新的名字相遇',
 '무너지지 않는 마음':'不会倒下的心','흔들려도 끝내 무너지지 않은 마음들':'纵然动摇，终未倒下的心',
 '[유학생] 한국이라는 마음':'名为韩国的心','한 걸음 더 가까이, 이 나라의 안쪽으로':'再近一步，走进这个国家的内心',
 '문장이 머무는 자리':'文字停留的地方','짧은 한 줄이 오래 남는 순간':'短短一行，久久难忘',
 '[유학생] 스스로를 택한 여자들':'选择了自己的女性','누구의 눈치도 보지 않고, 자기 삶을':'不看任何人的眼色，活出自己的人生',
 '소설':'小说','시':'诗歌','철학·사상':'哲学·思想','그 외 고전':'其他古典',
 '한 편의 이야기로 시대를 읽다':'以一个故事读懂一个时代','짧은 행에 담긴 깊은 울림':'短句中蕴含的深沉回响','생각하는 법을 배우는 고전':'学会思考的古典',
 '이상하게 끌리는 문장들':'莫名被吸引的句子','이상의 소설과 시를 직접 읽으며, 해체와 실험 속에서 나만의 문체 감각을 찾아보세요.':'直接阅读李箱的小说与诗歌，在解体与实验中找到属于自己的文体感觉。',
 '웃음 뒤에 칼이 있다':'笑声背后藏着刀','시대의 모순을 정면으로 겨눈 작가들의 날 선 문장들—웃기지만 결코 가볍지 않은 이야기들이 기다리고 있어요.':'直面时代矛盾的作家们的锋利文字——好笑却绝不轻浮的故事在等着你。',
 '닿지 못한 마음들':'未能抵达的心意','사랑했지만 끝내 엇갈렸던 사람들의 이야기—그 애틋하고 쓸쓸한 감정의 결을 따라가 보세요.':'相爱却终究错过的人们的故事——请随那份深切而孤寂的情感一路前行。',
 '우리가 살아낸 자리':'我们活过的地方','강경애와 나혜석, 시대의 틈새에서 자신의 언어로 삶을 새긴 두 여성 작가의 목소리를 만나보세요.':'姜敬爱与罗蕙锡——在时代的夹缝中用自己的语言镌刻人生的两位女性作家的声音。',
 '사람으로 읽는 역사':'以人读史','왕도, 장군도, 승려도 결국 한 사람이었다 — 인물의 삶 속으로 걸어 들어가 역사를 온몸으로 느껴보세요.':'君王、将军、僧侣，终究都是一个人——走进人物的人生，用全身感受历史。',
 '굶주림이 사람을 만든다':'饥饿造就人','배고픔 앞에서 인간은 무엇을 선택하는가 — 강경애·김동인·최서해의 날카로운 시선으로 읽는 결핍의 심리학.':'在饥饿面前，人会做出怎样的选择——透过姜敬爱、金东仁、崔曙海的锐利目光解读匮乏的心理学。'},
vi:{
 '[유학생] 처음 펼치기 좋은, 가장 가까운 한국':'Bước đầu đến với Hàn Quốc','짧고 쉬워서, 한국 문학으로 들어서는 가장 편안한 첫걸음':'Ngắn gọn, dễ đọc — bước khởi đầu nhẹ nhàng vào văn học Hàn Quốc',
 '[유학생] 변하지 않는 마음':'Những cảm xúc không đổi thay','설렘도 그리움도, 결국 같은 마음':'Rung động hay nhớ nhung, cuối cùng vẫn là một tấm lòng',
 '다시, 처음처럼':'Một lần nữa, như lần đầu','익숙한 제목이네, 아직 읽지 않은 이야기':'Tựa sách quen thuộc, câu chuyện bạn chưa từng đọc',
 '[유학생] 오래 사랑받는 이름들':'Những cái tên được yêu mến lâu dài','시간이 지나도 빛나는, 그 이름들과의 만남':'Gặp gỡ những cái tên tỏa sáng theo thời gian',
 '무너지지 않는 마음':'Những trái tim không gục ngã','흔들려도 끝내 무너지지 않은 마음들':'Dao động nhưng không bao giờ sụp đổ',
 '[유학생] 한국이라는 마음':'Tấm lòng mang tên Hàn Quốc','한 걸음 더 가까이, 이 나라의 안쪽으로':'Thêm một bước, vào sâu bên trong đất nước này',
 '문장이 머무는 자리':'Nơi câu văn ở lại','짧은 한 줄이 오래 남는 순간':'Một dòng ngắn đọng lại thật lâu',
 '[유학생] 스스로를 택한 여자들':'Những người phụ nữ chọn chính mình','누구의 눈치도 보지 않고, 자기 삶을':'Sống cuộc đời của mình, không e dè ai',
 '소설':'Tiểu thuyết','시':'Thơ','철학·사상':'Triết học & Tư tưởng','그 외 고전':'Các tác phẩm khác',
 '한 편의 이야기로 시대를 읽다':'Đọc cả một thời đại qua một câu chuyện','짧은 행에 담긴 깊은 울림':'Âm vang sâu lắng trong những dòng thơ ngắn','생각하는 법을 배우는 고전':'Những tác phẩm dạy ta cách suy nghĩ',
 '이상하게 끌리는 문장들':'Những câu văn cuốn hút đến lạ','이상의 소설과 시를 직접 읽으며, 해체와 실험 속에서 나만의 문체 감각을 찾아보세요.':'Đọc trực tiếp tiểu thuyết và thơ của Yi Sang, tìm cảm quan văn phong của riêng bạn giữa sự phá cách và thử nghiệm.',
 '웃음 뒤에 칼이 있다':'Lưỡi dao sau tiếng cười','시대의 모순을 정면으로 겨눈 작가들의 날 선 문장들—웃기지만 결코 가볍지 않은 이야기들이 기다리고 있어요.':'Những câu văn sắc bén nhắm thẳng vào mâu thuẫn của thời đại — hài hước nhưng không hề nhẹ tênh.',
 '닿지 못한 마음들':'Những tấm lòng không chạm tới nhau','사랑했지만 끝내 엇갈렸던 사람들의 이야기—그 애틋하고 쓸쓸한 감정의 결을 따라가 보세요.':'Chuyện về những người yêu nhau nhưng mãi lỡ nhịp — hãy lần theo những cung bậc cảm xúc da diết và cô đơn ấy.',
 '우리가 살아낸 자리':'Nơi chúng ta đã sống trọn','강경애와 나혜석, 시대의 틈새에서 자신의 언어로 삶을 새긴 두 여성 작가의 목소리를 만나보세요.':'Gặp gỡ Kang Kyeong-ae và Na Hye-sok — hai nhà văn nữ khắc ghi cuộc đời bằng ngôn ngữ của chính mình giữa khe hở của thời đại.',
 '사람으로 읽는 역사':'Đọc lịch sử qua con người','왕도, 장군도, 승려도 결국 한 사람이었다 — 인물의 삶 속으로 걸어 들어가 역사를 온몸으로 느껴보세요.':'Vua chúa, tướng lĩnh hay thiền sư, rốt cuộc đều là con người — hãy bước vào cuộc đời họ và cảm nhận lịch sử bằng cả trái tim.',
 '굶주림이 사람을 만든다':'Cái đói làm nên con người','배고픔 앞에서 인간은 무엇을 선택하는가 — 강경애·김동인·최서해의 날카로운 시선으로 읽는 결핍의 심리학.':'Trước cơn đói, con người lựa chọn điều gì — tâm lý học của sự thiếu thốn qua ánh nhìn sắc sảo của Kang Kyeong-ae, Kim Tong-in và Choe Seo-hae.'},
ja:{
 '[유학생] 처음 펼치기 좋은, 가장 가까운 한국':'初めてひらく、いちばん身近な韓国','짧고 쉬워서, 한국 문학으로 들어서는 가장 편안한 첫걸음':'短くてやさしい、韓国文学への心地よい第一歩',
 '[유학생] 변하지 않는 마음':'変わらない心','설렘도 그리움도, 결국 같은 마음':'ときめきも恋しさも、結局おなじ心',
 '다시, 처음처럼':'もう一度、初めてのように','익숙한 제목이네, 아직 읽지 않은 이야기':'なじみのタイトル、まだ読んでいない物語',
 '[유학생] 오래 사랑받는 이름들':'長く愛される名前たち','시간이 지나도 빛나는, 그 이름들과의 만남':'時を超えて輝く、その名前との出会い',
 '무너지지 않는 마음':'くじけない心','흔들려도 끝내 무너지지 않은 마음들':'揺れても、ついに崩れなかった心',
 '[유학생] 한국이라는 마음':'韓国という心','한 걸음 더 가까이, 이 나라의 안쪽으로':'もう一歩近く、この国の内側へ',
 '문장이 머무는 자리':'文章がとどまる場所','짧은 한 줄이 오래 남는 순간':'短い一行が長く残る瞬間',
 '[유학생] 스스로를 택한 여자들':'自分を選んだ女性たち','누구의 눈치도 보지 않고, 자기 삶을':'誰の顔色もうかがわず、自分の人生を',
 '소설':'小説','시':'詩','철학·사상':'哲学・思想','그 외 고전':'そのほかの古典',
 '한 편의 이야기로 시대를 읽다':'一つの物語で時代を読む','짧은 행에 담긴 깊은 울림':'短い行にこもる深い響き','생각하는 법을 배우는 고전':'考える方法を学ぶ古典',
 '이상하게 끌리는 문장들':'不思議と惹かれる文章たち','이상의 소설과 시를 직접 읽으며, 해체와 실험 속에서 나만의 문체 감각을 찾아보세요.':'李箱の小説と詩を直接読みながら、解体と実験の中で自分だけの文体感覚を見つけてみましょう。',
 '웃음 뒤에 칼이 있다':'笑いの奥に刃がある','시대의 모순을 정면으로 겨눈 작가들의 날 선 문장들—웃기지만 결코 가볍지 않은 이야기들이 기다리고 있어요.':'時代の矛盾に正面から切り込んだ作家たちの鋭い文章——笑えるのに決して軽くない物語が待っています。',
 '닿지 못한 마음들':'届かなかった心','사랑했지만 끝내 엇갈렸던 사람들의 이야기—그 애틋하고 쓸쓸한 감정의 결을 따라가 보세요.':'愛しながらもすれ違った人々の物語——切なく寂しい感情の襞をたどってみてください。',
 '우리가 살아낸 자리':'私たちが生き抜いた場所','강경애와 나혜석, 시대의 틈새에서 자신의 언어로 삶을 새긴 두 여성 작가의 목소리를 만나보세요.':'姜敬愛と羅蕙錫——時代の狭間で自分の言葉で人生を刻んだ二人の女性作家の声に出会ってください。',
 '사람으로 읽는 역사':'人で読む歴史','왕도, 장군도, 승려도 결국 한 사람이었다 — 인물의 삶 속으로 걸어 들어가 역사를 온몸으로 느껴보세요.':'王も将軍も僧侶も、結局は一人の人間だった——人物の人生に歩み入り、歴史を全身で感じてみましょう。',
 '굶주림이 사람을 만든다':'飢えが人をつくる','배고픔 앞에서 인간은 무엇을 선택하는가 — 강경애·김동인·최서해의 날카로운 시선으로 읽는 결핍의 심리학.':'空腹を前に人は何を選ぶのか——姜敬愛・金東仁・崔曙海の鋭い視線で読む欠乏の心理学。'},
};
// International(국내 탭) 문자열 번역 — 사전에 없으면 한국어 그대로
function clT(ko){ if(_clTab!=='modern'||_clLang==='all') return ko; return (CL_I18N[_clLang]||{})[ko]||ko; }
// 책 제목 번역(classic_translations.title_tr) — 칩 선택 시 1회 로드 후 캐시
let KR_TITLE_TR=null, _krTitleP=null;
function loadKrTitles(){
  if(KR_TITLE_TR||_krTitleP) return _krTitleP||Promise.resolve();
  _krTitleP=sbGetAnon('/classic_translations?select=classic_id,lang,title_tr')
    .then(r=>r.ok?r.json():[]).then(rows=>{
      KR_TITLE_TR={};
      (rows||[]).forEach(x=>{ if(x.title_tr){ (KR_TITLE_TR[x.classic_id]=KR_TITLE_TR[x.classic_id]||{})[x.lang]=x.title_tr; } });
      if(_clTab==='modern'&&_clLang!=='all') renderClassicShelves();   // 로드 완료 후 재렌더
    }).catch(()=>{ KR_TITLE_TR={}; });
  return _krTitleP;
}
function krTitleOf(b){
  if(_clLang==='all'||!KR_TITLE_TR||!b||!b.id) return null;
  const m=KR_TITLE_TR[b.id]; return (m&&m[_clLang])||null;
}
// International 배너 다국어 — 대상이 한국어 서툰 유학생인데 문구가 한국어뿐이던 모순 해소.
// 칩 = '너의 언어 선택기': 배너가 그 언어로 바뀌고, 책 열 때 기본 번역 언어(KR_LANG)도 따라감.
const CL_WELCOME = {
  all:{h:'너의 언어로 읽는 한국 고전',            p:'한국어가 익숙하지 않아도 괜찮아요. 번역본을 원문과 나란히 읽어보세요.'},
  en:{ h:'Korean Classics in Your Language',      p:"Don't worry if your Korean isn't fluent — read the translation side by side with the original."},
  zh:{ h:'用你的语言阅读韩国古典文学',              p:'韩语不熟练也没关系。译文与原文并排对照，轻松阅读。'},
  vi:{ h:'Đọc văn học kinh điển Hàn Quốc bằng ngôn ngữ của bạn', p:'Chưa giỏi tiếng Hàn cũng không sao — hãy đọc bản dịch song song với nguyên văn.'},
  ja:{ h:'あなたの言語で読む韓国古典',              p:'韓国語がまだ苦手でも大丈夫。翻訳を原文と並べて読んでみましょう。'},
};
// (구 clSetLang 삭제 — 언어 전환은 헤더 드롭다운 changeLang() 단일 경로)
function bindClassicDrag(){ bindDragScroll('#classicShelves .ml-hrow'); }
// 정보나루 인기대출 캐시 (books/loan_popular.json) — 도서관 대출 추천용
let LOAN_DATA = {};
async function loadLoanData(){
  try{ const r = await fetch('./books/loan_popular.json'); if(r.ok) LOAN_DATA = await r.json(); }catch(e){ LOAN_DATA = {}; }
}
// 기분 → 선호 장르 가중치
const REC_MOODS = [
  {key:'calm',  label:'🌱 평온',     boost:['essay','poem']},
  {key:'flutter',label:'✨ 설렘',     boost:['novel','epic']},
  {key:'comfort',label:'🤍 위로',     boost:['poem','novel']},
  {key:'deep',  label:'🧠 깊은 생각', boost:['thought','sci']},
  {key:'light', label:'☕ 가볍게',    boost:['essay','play']},
];
const REC_REGIONS = [
  {key:'any',     label:'무관',     locale:null},
  {key:'modern',  label:'한국 고전', locale:'modern'},
  {key:'foreign', label:'해외 고전', locale:'foreign'},
];
let recSel = {genres:new Set(), mood:null, region:'any'};

function renderRecChips(){
  const g = document.getElementById('recGenres');
  const m = document.getElementById('recMoods');
  const r = document.getElementById('recRegions');
  if(!g) return;
  g.innerHTML = REC_GENRES.map(x=>`<span class="rec-chip ${recSel.genres.has(x.key)?'on':''}" onclick="toggleRecGenre('${x.key}')">${x.label}</span>`).join('');
  m.innerHTML = REC_MOODS.map(x=>`<span class="rec-chip ${recSel.mood===x.key?'on':''}" onclick="setRecMood('${x.key}')">${x.label}</span>`).join('');
  r.innerHTML = REC_REGIONS.map(x=>`<span class="rec-seg-item ${recSel.region===x.key?'on':''}" onclick="setRecRegion('${x.key}')">${x.label}</span>`).join('');
}
function toggleRecGenre(k){ recSel.genres.has(k)?recSel.genres.delete(k):recSel.genres.add(k); renderRecChips(); }
function setRecMood(k){ recSel.mood = (recSel.mood===k)?null:k; renderRecChips(); }
function setRecRegion(k){ recSel.region = k; renderRecChips(); }




function bookCoverHTML(b, extra=''){
  const hasImg = !!b.coverSrc;
  const cls = hasImg ? 'book-cover has-img' : `book-cover style-${b.cover||((Math.abs(b.id?b.id.charCodeAt(0):0)%8)+1)}`;
  const badge = b.progress===100 ? '<span class="book-cover-badge">완독 ✓</span>'
              : (b.progress>0&&b.progress<100 ? `<span class="book-cover-badge">${b.progress}%</span>` : '');
  const img = hasImg ? `<img src="${esc(b.coverSrc)}" alt="${esc(b.title)}" loading="lazy" onerror="this.style.display='none';this.parentNode.classList.remove('has-img');this.parentNode.classList.add('style-${(Math.abs(b.id.charCodeAt(0))%8)+1}');this.parentNode.querySelector('div').style.display='block';">` : '';
  return `<div class="${cls}"${extra}>
    ${badge}
    ${img}
    <div>
      <div class="book-cover-title">${esc(b.title)}</div>
      <div class="book-cover-author">${esc(b.author)}</div>
    </div>
  </div>`;
}

let currentLibTab = 'modern';  // 한국 고전이 기본 (해외는 표지 결이 달라 시각적으로 강조)


function renderBookGrid(targetId, filterIntl){
  const el = document.getElementById(targetId);
  if(!el) return;
  let list = BOOKS;
  if(targetId === 'bookGridAll'){
    if(currentLibTab === 'modern')      list = BOOKS.filter(b => b.locale === 'modern');
    else if(currentLibTab === 'foreign') list = BOOKS.filter(b => b.locale === 'foreign');
    // 'all' → 그대로 전체
  } else if(targetId === 'bookGridIntl'){
    list = BOOKS.filter(b => b.locale === 'modern');  // International Students = 한국 고전만
  } else if(filterIntl){
    list = BOOKS.filter(b => b.intl);
  }
  el.innerHTML = list.map(b=>`
    <div class="book-card${b.minumsa?' has-mns':''}" onclick="openDetail('${b.id}')">
      ${b.minumsa?'<span class="mns-badge">★ 민음사</span>':''}
      ${bookCoverHTML(b)}
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-author">${esc(b.author)} · ${esc(b.category)}</div>
        ${b.progress>0 ? `<div class="book-progress"><div class="book-progress-fill" style="width:${b.progress}%"></div></div>` : ''}
      </div>
    </div>
  `).join('');
}

