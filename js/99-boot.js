/* ═══════════════════════════════════════════════════════════
   초기화
   ═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  // 8/14: 로그인 게이트가 걸린 웹툰 페이지 목록 (복귀 리다이렉트 화이트리스트)
  const WT_LOGIN_FILES=['webtoon_redmt.html','webtoon_demian.html','webtoon_gatsby.html','webtoon_emma.html','webtoon_unsu.html','webtoon_memil.html'];
  // 모바일 GNB 축약 라벨 초기 적용 + 회전/리사이즈 대응. 저장된 언어(bookstar_lang)가 있으면 그 언어로 복원
  try{
    const _sl=localStorage.getItem('bookstar_lang');
    if(_sl && _sl!=='ko' && UI_I18N[_sl]) changeLang(_sl);
    else applyUiLang(UI_LANG);
  }catch(e){ try{ applyUiLang(UI_LANG); }catch(_){} }
  let _gnbRz; window.addEventListener('resize', ()=>{ clearTimeout(_gnbRz); _gnbRz=setTimeout(()=>{ try{ applyUiLang(UI_LANG); }catch(e){} },200); });
  // ── 세명대 SSO 수신 (도서관 배너/테스트폼 → sso-login Edge Fn → ?sso_uid=학번&sso_name=이름) ──
  // 학번이 오면 그 학생으로 즉시 로그인(__SSO_STUDENT). 데모 선택창(bxOpenPicker)은 건너뜀.
  try{
    const _sp=new URLSearchParams(location.search);
    const _ssoAuth=_sp.get('sso_auth');
    // 8/29 신원 잠금: 학번(sso_uid)은 더 이상 신원 근거가 아니다. sso_auth(1회용 해시)를 세션으로 바꿔야 로그인.
    //   바꾸는 동안 이 페이지는 게스트로 그려지고, 성공하면 주소를 깨끗이 해서 다시 연다(그때 bxAuthRestore 가 학생을 복원).
    if(_ssoAuth){
      try{
        // 서명 세션토큰 보관 — 개인기능(대출현황·연장·예약·본인명의 전자책 대출)의 유일한 자격증명.
        // sso_personal=1 이어야 도서관 개인정보 연동까지 열린 상태(=liid 확보). 0이면 이름만 아는 게스트.
        localStorage.setItem(SSO_TOK_KEY, _sp.get('sso_token')||'');
        localStorage.setItem(SSO_PERSONAL_KEY, _sp.get('sso_personal')==='1'?'1':'0');
        sessionStorage.setItem('bx_login_prev', _bxSid());   // 로그인 직전 계정(게스트) — 읽던 진행 승계용
        sessionStorage.setItem('bx_login_pending','1');
      }catch(e){}
      history.replaceState(null,'',location.pathname+location.hash);   // 학번·토큰 URL 노출·새로고침 재적용 방지
      bxAuthExchange(_ssoAuth).then(ok=>{
        if(ok){ location.replace(location.pathname+location.hash); return; }
        try{ sessionStorage.removeItem('bx_login_pending'); localStorage.removeItem(SSO_TOK_KEY); localStorage.removeItem(SSO_PERSONAL_KEY); }catch(e){}
        try{ bmToast('로그인 확인에 실패했어요. 다시 로그인해 주세요.'); }catch(e){}
      });
    }else if(_sp.get('sso_uid')){
      history.replaceState(null,'',location.pathname+location.hash);   // 옛 방식 링크 — 신원으로 쓰지 않고 주소만 정리
    }
    let _pending=false; try{ _pending=sessionStorage.getItem('bx_login_pending')==='1'; }catch(e){}
    if(_pending && bxStudent()){   // 세션 교환 뒤 다시 열린 페이지 — 로그인 직후 1회 처리
      let _prevSid='guest'; try{ _prevSid=sessionStorage.getItem('bx_login_prev')||'guest'; sessionStorage.removeItem('bx_login_prev'); sessionStorage.removeItem('bx_login_pending'); }catch(e){}
      try{ _migrateChalRecords(_prevSid, bxStudent().id); }catch(e){}
      // (8/29 별 포인트 폐지 — 출석 별 지급 삭제)
      // 8/14 사장님 수정요청: 로그인 전에 보던 책을 자동으로 다시 연다 (로그인 후 활성화 안 되던 문제)
      // 고전(뷰어 게이트)이 우선 — 있으면 그 책 읽기로 바로 진입하고 도서관 책 기억은 함께 폐기
      try{
        const _pw=localStorage.getItem('bx_sso_return_webtoon');
        const _pc=localStorage.getItem('bx_sso_return_classic');
        const _pb=localStorage.getItem('bx_sso_return_book');
        localStorage.removeItem('bx_sso_return_webtoon');
        localStorage.removeItem('bx_sso_return_classic');
        localStorage.removeItem('bx_sso_return_book');
        const _fresh=o=>o && (!o._ts || Date.now()-o._ts < 15*60*1000);   // 15분 지난 기억은 폐기
        const _rw=_pw?JSON.parse(_pw):null;
        const _rc=_pc?JSON.parse(_pc):null;
        if(_rw && _rw.f && _fresh(_rw) && WT_LOGIN_FILES.includes(_rw.f)){
          location.replace('/'+_rw.f);   // 보려던 웹툰으로 곧장 복귀
        }else if(_rc && _rc.id && _fresh(_rc)){
          setTimeout(()=>{ try{ openViewer(_rc.id, _rc.mode||'full'); }catch(e){} }, 450);
        }else if(_pb){
          const _rb=JSON.parse(_pb);
          if(_rb && _rb.isbn && _fresh(_rb)){
            if(!LIB_POOL.find(x=>x.isbn===_rb.isbn)) LIB_POOL.push(_rb);   // 새로고침으로 풀이 비어도 열리게 복원
            setTimeout(()=>{ try{ libDetail(_rb.isbn); }catch(e){} }, 450);
          }
        }
      }catch(e){}
    }
  }catch(e){}
  try{ bxVisitOnce(); }catch(e){}   // 측정: 접속(탭당 1회, 학생 확정 후)
  // ── 8/14 사장님 지시: 웹툰도 로그인 필수 — 웹툰 페이지가 미로그인 접근을 ?webtoon=파일 로 돌려보낸다 ──
  try{
    const _q=new URLSearchParams(location.search);
    const _wt=_q.get('webtoon');
    if(_wt && WT_LOGIN_FILES.includes(_wt)){   // 화이트리스트 — 열린 리다이렉트 방지
      history.replaceState(null,'',location.pathname+location.hash);
      if(bxStudent()){ location.replace('/'+_wt); }   // 이미 로그인 → 바로 웹툰으로
      else{
        try{ localStorage.setItem('bx_sso_return_webtoon', JSON.stringify({f:_wt,_ts:Date.now()})); }catch(e){}
        setTimeout(()=>{ try{ smLoginGuide('classic'); }catch(e){} }, 300);   // 로그인 시트 — 복귀하면 위 SSO 분기가 웹툰으로 보냄
      }
    }
  }catch(e){}
  // 계정 칩 표시 + (로그인됨)서버 결과 로딩.
  // 8/9 미로그인 자동 선택창 제거 — 데모 계정이 사라졌으므로 방문자는 게스트로 자유 탐색,
  // 로그인은 헤더 칩(세명대 로그인 안내)이나 글쓰기 등 계정 필요 순간에만 권한다.
  bxRenderAccountChip();
  if(bxStudent()){ bxLoadResultsFromDB().then(()=>{ try{ renderChalScore(); renderMyImpressions(); renderQuestMap(); }catch(e){} }); }
  // 리더 prefs / stats 복원
  loadReaderPrefs(); loadReaderStats(); if(bxStudent()) bxLoadReaderStats();
  // 레거시 klever-theme(다크 토글) → 새 prefs로 흡수
  if(!localStorage.getItem(READER_PREFS_KEY) && localStorage.getItem('klever-theme') === 'dark'){
    readerPrefs.theme = 'dark'; saveReaderPrefs();
  }
  applyReaderPrefs();
  setupHighlightHandlers();
  setupDictHandlers();
  setupImmersiveTap();
  checkForUpdate();
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkForUpdate(); });
  renderClassicShelves();   // 내부에서 탭별 collectionCuration 렌더
  renderCurations('curationIntl', true);
  renderBookGrid('bookGridIntl', true);
  renderAreaCuration('intlCuration','International');
  renderRecChips();
  loadLoanData();
  renderCommunity('program');
  // ?page=airec/community/mypage 등 딥링크(관리자에서 학생앱 화면 연결용) — 없으면 우리 도서관
  // 8/29: 푸시 알림(/#mylib)·즐겨찾기 해시도 첫 화면으로 — 전엔 ?page= 만 읽어 알림을 눌러도 첫 화면이었다
  const _ip=new URLSearchParams(location.search).get('page') || (location.hash||'').replace(/^#/,'').replace(/[^a-z_-]/gi,'');
  const _ipm=(_ip==='mylib')?'mypage':_ip;
  nav(_ipm && document.getElementById('page-'+_ipm) ? _ipm : 'ourlib');
});

window.addEventListener('resize', () => {
  const ph = document.getElementById('page-home');
  if(ph && ph.classList.contains('active')){
    renderHomeHub();
  }
  // 리더 페이지 모드: 데스크톱↔모바일 전환·회전 대응
  if(document.getElementById('viewerOverlay')?.classList.contains('open')){
    if(pgEligible() && !_pg.on) enterPageMode();
    else if(!pgEligible() && _pg.on) exitPageMode();
    else if(_pg.on) pgRelayout();
  }
});

window.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    const _mx=document.querySelector('.viewer-shell.maxed');
    if(_mx){ _mx.classList.remove('maxed'); return; }   // 꽉채우기 먼저 해제
    if(document.getElementById('viewerOverlay').classList.contains('open')) closeViewer();
    else if(document.getElementById('programModal').classList.contains('open')) closeProgramModal();
  }
});
