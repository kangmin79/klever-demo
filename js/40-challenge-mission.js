/* ═══ 챌린지 미션 패널 (참여 챌린지 mission → 퀴즈·글 미션 수행. 8/29 별 포인트 폐지) ═══ */
let _mpCtx=null;
// 8/20 사장님 수정요청 — 상세 모달의 '작품 이해 퀴즈 / 인문 성찰 퀴즈'에서 바로 들어온 경우.
//   챌린지 참여 여부와 무관하게 그 유형의 퀴즈를 연다(참여했으면 아래 정규 경로가 그대로 돌고, 아니면 퀴즈만 있는 패널).
// {bookId, qtype} — 뷰어가 열려 있는 동안 유지한다. renderMissionPanel은 좌우 칸 토글·언어 전환 등으로 여러 번 다시 그려지므로
//   한 번 쓰고 버리면 두 번째 렌더에서 '챌린지에 먼저 참여' 안내로 되돌아간다(8/20 스모크에서 실측).
let _quizWanted = null;
function openQuizDirect(bookId, qtype){
  _quizWanted = {bookId, qtype};
  closeLc();
  openViewer(bookId, 'challenge');
}
function _quizWant(){ return (_quizWanted && currentBook && _quizWanted.bookId===currentBook.id) ? _quizWanted.qtype : null; }
function renderMissionPanel(body, info, leftBody, L){
  const ch = chalForBook(currentBook);
  const stu = bxStudent();
  const want = _quizWant();
  let m = ch ? appChalMission(ch) : null;
  // 사서가 미션을 바꿨으면 최신본 우선(독서 챌린지 페이지에서 로드된 CHAL_PUB) — 참여 시점 스냅샷보다 최신
  if(ch && typeof CHAL_PUB!=='undefined'){ const pub=CHAL_PUB.find(x=>String(x.id)===String(ch.id)); if(pub&&pub.mission) m=appChalMission(pub); }
  // 상세 모달에서 유형을 골라 들어왔으면 그 유형으로 연다(챌린지가 켠 유형보다 우선 — 학생이 방금 누른 것이니까)
  if(want && m) m = Object.assign({}, m, {quiz:true, quizType:want, quizLevel:''});
  const solo = !!want && !ch;   // 챌린지 없이 퀴즈만 푸는 모드 — 챌린지 진행/완주 기록은 건드리지 않는다
  if(solo) m = {reward:'draw', quiz:true, quizN:10, quizType:want, quizLevel:'', oneline:false, question:false, review:false};
  const acts = m ? chalActiveMissions(m) : [];
  info.innerHTML = ch ? `챌린지 · <b>${esc(ch.title)}</b> · 퀴즈·글 미션`
                      : (solo ? `<b>${esc(want)} 퀴즈</b>`
                              : '챌린지 미션 · <b>참여 후 수행</b>');
  let right;
  if(!stu){
    right = `<div class="mp-note">상단에서 <b>학생 계정</b>을 선택하면 미션을 수행할 수 있어요.</div>`;
  } else if(!ch && !solo){
    right = `<div class="mp-note">이 책이 담긴 <b>챌린지에 먼저 참여</b>하면 미션이 열려요.<br>독서 챌린지 페이지에서 ‘참여하기’를 눌러 주세요.</div>`;
  } else if(!acts.length){
    right = `<div class="mp-note">사서가 켠 미션이 아직 없어요.</div>`;
  } else {
    right = `<div class="mp-prog" id="mpProg"></div>`
          + acts.map(mpMissionCard).join('');
  }
  body.innerHTML = `
    <div class="viewer-pane left">
      <div class="viewer-pane-label">${L.challengeLeftLabel}</div>
      ${leftBody}
    </div>
    <div class="viewer-pane right">
      <div class="viewer-pane-label">${solo ? '오른쪽 — '+esc(want)+' 퀴즈' : '오른쪽 — 챌린지 미션'+(ch?' <span style="color:var(--text-light);font-weight:500">· 사서가 켠 것만</span>':'')}</div>
      ${right}
    </div>`;
  if(stu && (ch||solo) && acts.length) setTimeout(()=>mpHydrate(ch, m, stu, solo), 0);
}
function mpMissionCard(x){
  if(x.kind==='quiz'){
    return `<div class="mp-card">
      <div class="mp-t">🎯 퀴즈 풀기</div>
      <div class="mp-s">보기는 매번 섞여요 — 위치가 아니라 내용으로 채점됩니다.</div>
      <div id="mpQuizBox"><div class="mp-load">문제 불러오는 중…</div></div></div>`;
  }
  return `<div class="mp-card">
    <div class="mp-t">${x.icon} ${esc(x.t)}</div>
    <div class="mp-s">${esc(x.ph||'')} (${x.min}자 이상 · 연락처·링크·같은 글자 반복은 인정되지 않아요)</div>
    <textarea class="mp-ta" id="mp_ta_${x.k}" placeholder="여기에 적어 주세요"></textarea>
    <div class="mp-sub"><button class="mp-btn" id="mp_btn_${x.k}" onclick="mpSubmitWrite('${x.k}',${x.min})">제출</button>
      <span class="mp-done" id="mp_done_${x.k}">✓ 완료</span></div></div>`;
}
async function mpHydrate(ch, m, stu, solo){
  const _bid=currentBook.id;   // 레이스 가드: fetch 대기 중 다른 책으로 전환되면 B 화면을 A 미션으로 덮지 않게
  // solo(상세 모달에서 퀴즈만 열기, 8/20): 챌린지가 없으므로 chId 없음 →
  //   진행 저장(challenge_id NOT NULL)·완주 처리·내 챌린지 카드 미러는 건너뛴다.
  _mpCtx={bookId:_bid, school:CH_SCHOOL, student:stu.id, m, chId:ch?ch.id:null, solo:!!solo,
          done:new Set(), ans:{}, quizCount:0, complete:false};
  // 제출한 글(완료 표시용) + 퀴즈 시도 복원 — 독립 쿼리 병렬. (8/29 별 포인트 폐지: 완료 여부는 bookstar_stars 대신 bookstar_writings로 판단)
  await Promise.all([
    (async()=>{ try{
      // 8/30 사장님 규칙: 공개한 글만 챌린지 참여 기록으로 인정 — '나만 보기' 글은 미션 완료로 치지 않는다
      const r=await fetch(`${SB_REST}/bookstar_writings?student_id=eq.${encodeURIComponent(stu.id)}&book_id=eq.${encodeURIComponent(_bid)}&is_public=eq.true&select=activity`,{headers:BX_H});
      if(r.ok){ const rows=await r.json(); if(Array.isArray(rows)) rows.forEach(x=>_mpCtx.done.add(x.activity+'|book:'+_bid)); }
    }catch(e){} })(),
    (async()=>{ try{
      const r=await fetch(`${SB_REST}/bookstar_challenge_results?student_id=eq.${encodeURIComponent(stu.id)}&book_id=eq.${encodeURIComponent(currentBook.id)}&select=ans`,{headers:BX_H});
      if(r.ok){ const rows=await r.json(); if(rows&&rows[0]&&rows[0].ans&&typeof rows[0].ans==='object') _mpCtx.ans=rows[0].ans; }
    }catch(e){} })(),
  ]);
  if(!currentBook || currentBook.id!==_bid || _mpCtx.bookId!==_bid) return;   // 책 전환됨 — 낡은 하이드레이트 중단
  _mpMirrorLocal();   // 서버에 있던 시도 기록을 로컬 카드 캐시에도(8/18)
  chalActiveMissions(m).forEach(x=>{
    if(x.kind==='quiz') return;
    if(_mpCtx.done.has(x.k+'|book:'+currentBook.id)) mpMarkDone(x.k);
  });
  if(m.quiz) await mpLoadQuiz(m);
  const p=mpProgress();
  if(p.total>0 && p.done>=p.total) _mpCtx.complete=true;   // 이미 완료 — 재적립·모달 방지
  mpRenderProgress();
}
function mpMarkDone(k){
  const b=document.getElementById('mp_btn_'+k), d=document.getElementById('mp_done_'+k), ta=document.getElementById('mp_ta_'+k);
  if(b) b.disabled=true; if(d) d.style.display='inline'; if(ta) ta.readOnly=true;
}
function _mpShuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
// 8/17 사장님 수정요청(이전/다음이 두 개 보임): 같은 책으로 mpLoadQuiz가 겹쳐 두 번 돌면(패널 재렌더 등)
//   먼저 시작한 쪽이 await 뒤에 낡은 items로 _mpStepInit을 한 번 더 호출해 네비가 2개 쌓였다 → 순번 토큰으로 낡은 호출 폐기
let _mpLoadSeq=0;
async function mpLoadQuiz(m){
  const box=document.getElementById('mpQuizBox'); if(!box) return;
  const _seq=++_mpLoadSeq;
  const _bid=currentBook&&currentBook.id;   // 레이스 가드용 — fetch 대기 중 책 전환 감지
  const qt=CH_QMAP[m.quizType]||''; const lv=m.quizLevel||'';
  if(!qt){ box.innerHTML='<div class="mp-load">퀴즈 유형이 설정되지 않았어요.</div>'; return; }
  const n=10;   /* 퀴즈 문항 수 = 10개 고정 (유형별 10장면 전부) */
  let items=[];
  _scnDbAnchors=null;   // 이전 책 앵커 잔존 방지
  try{
    /* 2종 체제: 난이도 없는 챌린지는 q_type만으로 로드. 난이도 있는 옛 챌린지는 level 필터 →
       0건이면(책이 2종 신규 데이터) level 없이 재조회. 장면당 1문항만 남겨 어떤 조합에서도 10문항 보장 */
    const base=`${SB_REST}/bookstar_quiz_items?book_id=eq.${encodeURIComponent(currentBook.id)}&q_type=eq.${qt}&order=scene_no&limit=40&select=id,scene_no,scene_title,question,opts,correct,expl,anchor`;
    if(lv){ const r=await fetch(`${base}&level=eq.${encodeURIComponent(lv)}`,{headers:BX_H}); if(r.ok) items=await r.json(); }
    if(!Array.isArray(items)||!items.length){ const r2=await fetch(base,{headers:BX_H}); if(r2.ok) items=await r2.json(); }
  }catch(e){}
  if(_seq!==_mpLoadSeq || !currentBook || currentBook.id!==_bid || !box.isConnected) return;   // 책 전환/재렌더/겹친 호출 — 낡은 응답 폐기(B 컨텍스트 오염 방지)
  if(Array.isArray(items)&&items.length){ const seen=new Set(); items=items.filter(it=>{ if(seen.has(it.scene_no))return false; seen.add(it.scene_no); return true; }).slice(0,n); }
  if(!Array.isArray(items)||!items.length){ box.innerHTML='<div class="mp-load">이 책의 퀴즈가 아직 준비되지 않았어요.</div>'; return; }
  // DB 앵커(장면별 본문 정확일치 문장) 수집 → 하드코딩 SCENE_ANCHORS 없는 책도 좌측 본문 점프+형광펜
  { const arr=new Array(10).fill(''); let has=false;
    items.forEach(it=>{ if(it.anchor&&it.scene_no>=1&&it.scene_no<=10){ arr[it.scene_no-1]=it.anchor; has=true; } });
    if(has) _scnDbAnchors=arr; }
  _mpCtx.quizCount=items.length; _mpCtx.quizIds=items.map(it=>it.id);
  box.innerHTML=''; box.classList.remove('mp-step-on'); _mpStep=null;
  items.forEach((it,qi)=>{
    const shuffled=_mpShuffle(it.opts.map((t,oi)=>({t,orig:oi})));
    const q=document.createElement('div'); q.className='mp-q';
    if(it.scene_no) q.dataset.scene=it.scene_no;   // 왼쪽 본문 동기화용(장면 번호)
    q.innerHTML=`<div class="mp-qn">문제 ${qi+1} · ${esc(it.scene_title||'')}</div><div class="mp-qq">${esc(it.question)}</div>`
      + shuffled.map((o,di)=>`<div class="mp-opt" data-orig="${o.orig}"><span class="mp-mk">${String.fromCharCode(65+di)}</span><span>${esc(o.t)}</span></div>`).join('')
      + `<div class="mp-expl"></div>`;
    box.appendChild(q);
    const prev=_mpCtx.ans[it.id];   // {ok, pick} | undefined  (이미 푼 문항 복원)
    if(prev){ mpRevealQuiz(q, it, it.correct, !!prev.ok, true, prev.pick); }
    else q.querySelectorAll('.mp-opt').forEach(el=>{ el.onclick=()=>mpAnswer(el,q,it); });
  });
  await _mpFetchScenes();   // DB 장면카드(핵심문장+배경설명) 로드 → 있으면 카드모드
  if(_seq!==_mpLoadSeq || !currentBook || currentBook.id!==_bid || !box.isConnected) return;   // 장면카드 대기 중 책 전환/겹친 호출 — 중단
  if(_mpStepMode()){
    if(window.innerWidth<=600) _chalStackApply();   // 8/17: 폰은 장면카드 아래 퀴즈 한 화면 스크롤
    _mpStepInit(box, items);   // 카드모드: 왼쪽=인용구+배경설명
  }
  else _scnSetupSync();   // 왼쪽 본문 ↔ 오른쪽 퀴즈 장면 동기화(앵커 있는 책만)
  setTimeout(_chromeAutoCheck, 300);
}
