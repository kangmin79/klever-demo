/* ═══════════════════════════════════════════════════════════
   책 뷰어 (3 모드)
   ═══════════════════════════════════════════════════════════ */
/* ── 자동 업데이트 안내 (배포 시 이용자에게 새로고침 배너 — 캐시 비우라는 안내 불필요) ── */
const APP_BUILD = '260902r';   // ⚠️ 배포마다 version.txt + 스크립트 ?b= 와 함께 갱신
// 본문 bodies_*.js 캐시 버전 — APP_BUILD와 분리. 앱을 배포해도 본문은 재다운로드 안 하도록 고정(체감 속도↑).
// ⚠️ 본문 파일(bodies_*.js)을 재생성/수정해 배포할 때'만' 이 값을 올린다. (일반 앱 배포에선 건드리지 않음)
const BODIES_VER = '260902d';   // 9/2 돈키호테 장 제목 복원 1~3단계(bodies_gb5921.js) — 3단계: 한국어 머리 8개를 Chapter N.으로 통일
async function checkForUpdate(){
  try{
    const r = await fetch('./version.txt?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const live = (await r.text()).trim();
    if(live && live !== APP_BUILD) showUpdateBanner();
  }catch(e){}
}
function showUpdateBanner(){
  if(document.getElementById('updateBanner')) return;
  const d = document.createElement('div');
  d.id = 'updateBanner'; d.className = 'update-banner';
  d.innerHTML = '✨ 새 버전이 있어요 <button onclick="location.reload()">새로고침</button>';
  document.body.appendChild(d);
}

/* ── 읽기 방식: 스크롤 / 탭 넘김 ── */
function setPageMode(on){ readerPrefs.pageMode=!!on; saveReaderPrefs(); syncPageModeBtns();
  if(window.innerWidth<=600){ if(on) enterPageMode(true); else exitPageMode(); }   // true=지금 스크롤 위치를 페이지로 승계
  readerToast(on ? '페이지 넘김 · 좌/우 탭·스와이프로 페이지, 가운데 탭으로 바' : '스크롤 모드'); }
function syncPageModeBtns(){ document.querySelectorAll('.rss-mode').forEach(b=>b.classList.toggle('on', (b.dataset.page==='1')===!!readerPrefs.pageMode)); }
function readerPage(dir){
  const pane=_scrollEl(); if(!pane) return;
  const step=Math.max(120, pane.clientHeight*0.88);          // 한 화면(약간 겹쳐 연속감)
  pane.scrollBy({top:dir*step, behavior:'smooth'});
}

/* ── 모바일 본문 탭: 스크롤모드=바 토글 / 탭넘김모드=좌(이전)·우(다음)·가운데(바 토글) ── */
// 8/30: 검색창이 열려 있으면 메뉴를 숨기지 않는다(검색어 입력이 막히던 문제)
function _toggleChrome(){
  const sh=document.querySelector('.viewer-shell'); if(!sh) return;
  if(sh.classList.contains('searching')) return;
  sh.classList.toggle('chrome-hidden');
}
let _immersiveTapTimer=null;
function setupImmersiveTap(){
  const vb=document.getElementById('viewerBody');
  if(!vb || vb._immBound) return;
  vb._immBound=true;
  vb.addEventListener('click',(e)=>{
    if(window.innerWidth>600) return;                      // 모바일에서만
    if(e.detail>1) return;                                  // 더블클릭(사전)은 제외
    const sel=window.getSelection();
    if(sel && sel.toString().trim().length>0) return;       // 드래그 선택 중 제외
    if(e.target.closest('a,button,mark')) return;           // 링크·버튼·하이라이트 탭은 제외
    // 8/14 사장님 수정요청(터치 동작 정리): 끝 탭=문장 위라도 무조건 페이지 넘김 / 가운데 문장 탭=원문 보기만 / 가운데 빈 곳=메뉴 토글
    const _onSent=e.target.closest('span.psent');
    if(readerPrefs.pageMode){                               // 탭 넘김 모드: 좌/우 구역은 즉시 페이지
      const rect=vb.getBoundingClientRect();
      const x=(e.clientX-rect.left)/rect.width;
      if(x<0.30){ readerPage(-1); return; }
      if(x>0.70){ readerPage(1);  return; }
      // 가운데(0.30~0.70) → 문장이면 원문 보기(_sentTap 담당), 아니면 바 토글
    }
    if(_onSent) return;                                     // 문장 탭 = 원문 보기 전용 — 메뉴는 안 올라옴
    // 8/17 사장님 수정요청: 스크롤 모드에선 빈 곳을 터치해도 메뉴가 올라오지 않는다(문장 터치=번역/원문과 충돌).
    //   메뉴는 아래 scroll 감시가 스크롤 방향으로 띄우고 숨긴다. 탭 넘김 모드만 가운데 탭 토글 유지(스크롤이 없어 대체 수단이 없음).
    if(!readerPrefs.pageMode) return;
    clearTimeout(_immersiveTapTimer);
    _immersiveTapTimer=setTimeout(()=>{                      // 더블클릭이면 아래서 취소
      _toggleChrome();
    },230);
  });
  vb.addEventListener('dblclick',()=>{ clearTimeout(_immersiveTapTimer); });
  // 8/17: 스크롤 방향으로 메뉴 표시 — 위로 올리면 뜨고(chrome-hidden 해제), 내리면 사라짐. 칸(.viewer-pane)·몸통(.chal-stack) 어느 쪽이 스크롤돼도 캡처
  vb.addEventListener('scroll',(e)=>{
    if(window.innerWidth>600 || readerPrefs.pageMode) return;
    const sh=document.querySelector('.viewer-shell'); if(!sh || !sh.classList.contains('immersive') || sh.classList.contains('searching')) return;
    const el=e.target; if(!el || typeof el.scrollTop!=='number') return;
    if(el._chrIgnoreUntil && Date.now()<el._chrIgnoreUntil){ el._chrY=el.scrollTop; return; }   // 코드가 움직인 스크롤(문항 전환 등)은 무시
    const y=el.scrollTop, last=(el._chrY==null)?y:el._chrY; el._chrY=y;
    const dy=y-last; if(!dy) return;
    delete sh.dataset.autoChrome;   // 사용자가 스크롤하기 시작하면 자동 표시 상태는 끝 — 이후는 방향이 결정
    el._chrAcc = ((el._chrAcc||0)>0)===(dy>0) ? (el._chrAcc||0)+dy : dy;   // 같은 방향으로 누적, 방향 바뀌면 리셋
    if(dy<0 && (el._chrAcc<=-28 || y<=0)) sh.classList.remove('chrome-hidden');
    else if(dy>0 && el._chrAcc>=28 && y>40) sh.classList.add('chrome-hidden');
  }, true);
  // 맨 위에서 손가락을 아래로 끌면(더 올릴 스크롤이 없어도) 메뉴 표시 — 짧은 화면·첫 화면에서 갇히지 않게
  let _tY=null;
  vb.addEventListener('touchstart',(e)=>{ _tY=(e.touches&&e.touches[0])?e.touches[0].clientY:null; },{passive:true});
  vb.addEventListener('touchmove',(e)=>{
    if(_tY==null || window.innerWidth>600 || readerPrefs.pageMode) return;
    const y=(e.touches&&e.touches[0])?e.touches[0].clientY:null; if(y==null) return;
    if(y-_tY>40){ const sc=e.target.closest ? (e.target.closest('.viewer-pane, .viewer-body')||vb) : vb;
      const top=(sc.scrollTop||0)<=0 && (vb.scrollTop||0)<=0;
      if(top){ const sh=document.querySelector('.viewer-shell.immersive'); if(sh){ sh.classList.remove('chrome-hidden'); delete sh.dataset.autoChrome; } _tY=null; } }
  },{passive:true});
}
// 스크롤할 내용이 없으면(짧은 장면·문항) 메뉴를 숨긴 채 두면 닫을 길이 없다 → 그때는 메뉴를 보여 둔다 (8/17)
function _chromeAutoCheck(){
  if(window.innerWidth>600) return;
  const sh=document.querySelector('.viewer-shell.immersive'); if(!sh) return;
  const vb=document.getElementById('viewerBody'); if(!vb) return;
  const el=_chalStacked()?vb:_scrollEl(); if(!el) return;
  if(el.scrollHeight<=el.clientHeight+8){ if(sh.classList.contains('chrome-hidden')){ sh.classList.remove('chrome-hidden'); sh.dataset.autoChrome='1'; } }
  else if(sh.dataset.autoChrome==='1'){ delete sh.dataset.autoChrome; sh.classList.add('chrome-hidden'); }   // 로딩 중 잠깐 짧았던 화면이 길어지면 다시 숨김(열 때 메뉴 없이 — 8/14 규칙 유지)
}

