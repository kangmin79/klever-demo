/* ═══════════════════════════════════════════════════════════
   기타
   ═══════════════════════════════════════════════════════════ */
function enrollProgram(key){
  const names = {champion:'고전 챔피언 프로그램', freshman:'2026 신입생 고전 챌린지', intl:'Learning Korean through Korean Classics'};
  alert(`✅ ${names[key]} 참가 완료!\n\n마이페이지 → 챌린지 메뉴에서 진행률을 확인하세요.`);
  nav('mypage');
}


function changeLang(lang){
  // 헤더 언어 드롭다운 = International 칩과 동일 전환 (GNB·사이드바 + 국내 탭 콘텐츠 + 리더 기본 번역 언어)
  if(lang==='ko'){ applyUiLang('ko'); _clLang='all'; }
  else{
    applyUiLang(lang);
    if(typeof KR_LANG!=='undefined') KR_LANG=lang;
    _clLang=lang; loadKrTitles();
  }
  try{ localStorage.setItem('bookstar_lang', lang); }catch(e){}   // 새로고침해도 언어 유지 — 대상이 한국어 서툰 유학생이라 필수
  if(document.getElementById('page-collection')?.classList.contains('active')) renderClassicShelves();
}


