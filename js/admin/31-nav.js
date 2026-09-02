/* ====== 네비게이션 ====== */
// 웹/앱 관리 모드 — 사이드바 메뉴가 통째로 바뀌고, 앱 모드는 금색 계열로 표시
function setMode(m,skipGo){
  document.body.setAttribute('data-mode',m);
  el('sideWeb').style.display=m==='web'?'':'none';
  el('sideApp').style.display=m==='app'?'':'none';
  el('msWeb').classList.toggle('on',m==='web');
  el('msApp').classList.toggle('on',m==='app');
  try{localStorage.setItem('bs_admin_mode',m);}catch(e){}
  if(!skipGo){
    var first=document.querySelector(m==='web'?'#sideWeb .navi':'#sideApp .navi');
    if(first)go(first,m==='web'?'dash':'msapp');
  }
}
function go(elm,page){
  document.querySelectorAll('.navi').forEach(n=>n.classList.remove('on'));elm.classList.add('on');
  ['dash','stats','chstat','writings','make','notice','history','settings','comm','msapp','popup'].forEach(id=>el('pg-'+id).style.display='none');
  el('pg-'+page).style.display='';
  _pvClose(); chalPvClose();  // 다른 페이지로 가면 미리보기 닫기(.main 폭 복원)
  // 8/17 시안(엑셀 다운로드 방식): 통계 5화면은 들어가도 집계를 안 부른다 — 기간·항목 골라 [엑셀 다운로드]가 곧 조회. 목록이 필요한 화면(챌린지 select·학생 글 10건·지난 목록)만 로드
  if(page==='dash'){ initDashDates(); dbSum(); }
  else if(page==='msapp')renderMsApp();
  else if(page==='popup')loadPopups();
  else if(page==='make'){ renderChallenges(); chalPvAutoOpen(); }
  else if(page==='stats'){ initStatDates(); statSum(); }
  else if(page==='chstat')renderChStat();
  else if(page==='writings'){ initFeedDates(); fdSum(); loadWritings(); }
  else if(page==='history')renderHistory();
  else if(page==='notice'){renderNotices();loadNotices();}
  else if(page==='comm'){renderComm();loadCommPosts();}
  else if(page==='settings'){ renderSettings(); autoOpenPreview(); }
  window.scrollTo(0,0);
}
// 좌측 'bookstar Builder' — 영역별 꾸미기 진입
function goArea(elm,area){ try{readSecInputs();}catch(e){} _pvFocusSlot=null; curArea=area; go(elm,'settings'); }

