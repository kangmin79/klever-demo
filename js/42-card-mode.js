/* ═══ 한 문제씩 넘기기(카드모드) — 왼쪽=인용구+배경설명, DB 장면카드 있는 책 자동 적용 ═══ */
let _mpStep=null, _mpScenes=null;
async function _mpFetchScenes(){
  _mpScenes=null;
  if(!currentBook) return;
  try{
    const r=await sbGet(`/bookstar_quiz_scenes?book_id=eq.${encodeURIComponent(currentBook.id)}&order=scene_no&select=scene_no,title,core_sentence,source,scene_desc,image_url`);
    if(r.ok){ const rows=await r.json();
      if(Array.isArray(rows)&&rows.length){ _mpScenes={}; rows.forEach(x=>{ _mpScenes[x.scene_no]={core:x.core_sentence,desc:x.scene_desc,title:x.title,source:x.source,image:x.image_url||''}; }); }
    }
  }catch(e){}
}
function _mpStepMode(){ return !!(_mpScenes && Object.keys(_mpScenes).length); }
function _mpStepInit(box, items){
  if(_scnIO){ _scnIO.disconnect(); _scnIO=null; }   // 스크롤 감시 끔(이 모드는 수동 이동)
  _scnCur=-1; _scnMarkP=null;
  box.classList.add('mp-step-on');
  _mpStep={idx:0, n:items.length};
  // 왼쪽 pane을 '결정적 장면' 카드로 교체(본문 대신 인용구+배경설명)
  const left=document.querySelector('.viewer-pane.left');
  if(left) left.innerHTML='<div class="viewer-pane-label">결정적 장면</div><div id="mpSceneBox" class="mp-scene"></div>';
  // 카드모드엔 본문 장(章)이 안 보이므로 바닥의 장 이동(◀이전/다음▶) 버튼 제거 — 미션 닫기만 남김
  const acts=document.getElementById('viewerActions');
  if(acts) acts.innerHTML=`<button class="viewer-action primary" onclick="closeViewer()">닫기</button>`;
  box.querySelectorAll('.mp-step-nav').forEach(n=>n.remove());   // 8/17: 재초기화 시 네비 중복 방지(마지막 방어선)
  const nav=document.createElement('div'); nav.className='mp-step-nav'; nav.id='mpStepNav';
  nav.innerHTML=`<button class="mp-step-btn" id="mpStepPrev" onclick="mpStepGo(-1)">◀ 이전</button>`
    +`<span class="mp-step-count"><b id="mpStepCur">1</b> / ${items.length}</span>`
    +`<button class="mp-step-btn primary" id="mpStepNext" onclick="mpStepGo(1)">다음 ▶</button>`;
  box.appendChild(nav);
  _mpStepShow(0);
}
function _mpStepShow(i){
  if(!_mpStep) return;
  const box=document.getElementById('mpQuizBox'); if(!box) return;
  const qs=box.querySelectorAll('.mp-q'); if(!qs.length) return;
  i=Math.max(0, Math.min(qs.length-1, i)); _mpStep.idx=i;
  qs.forEach((q,qi)=>{ q.style.display=(qi===i)?'':'none'; });
  const cur=document.getElementById('mpStepCur'); if(cur) cur.textContent=i+1;
  const prev=document.getElementById('mpStepPrev'); if(prev) prev.disabled=(i===0);
  const next=document.getElementById('mpStepNext');
  if(next){ const last=(i>=qs.length-1); next.disabled=last; next.textContent=last?'마지막 문제':'다음 ▶'; }
  const right=document.querySelector('.viewer-pane.right'); if(right) right.scrollTop=0;
  _mpRenderScene(+qs[i].dataset.scene||1);   // 왼쪽 장면 카드 갱신
  // 폰 쌓기 모드: 문항이 바뀌면 새 장면(위)부터 읽도록 몸통을 맨 위로 (8/17)
  if(_chalStacked()){ const vb=document.getElementById('viewerBody'); if(vb){ vb._chrIgnoreUntil=Date.now()+900; vb.scrollTo({top:0,behavior:'smooth'}); } setTimeout(_chromeAutoCheck, 300); }
}
function _mpRenderScene(sn){
  const box=document.getElementById('mpSceneBox'); if(!box) return;
  const sc=(_mpScenes&&_mpScenes[sn])||null;
  const anchors=(currentBook && SCENE_ANCHORS[currentBook.id])||[];   // DB 실패 시 폴백(기존 하드코딩)
  const descs=(currentBook && SCENE_DESC[currentBook.id])||[];
  const quote=(sc&&sc.core)||anchors[sn-1]||'';
  const desc=(sc&&sc.desc)||descs[sn-1]||'';
  const img=(sc&&sc.image)||'';
  box.innerHTML=(quote?`<div class="mp-scene-quote">“${esc(quote)}”</div>`:'')
    +(img?`<img class="mp-scene-img" src="${esc(img)}" alt="">`:'')
    +(desc?`<div class="mp-scene-desc"><div class="mp-scene-desc-h">배경 설명</div><p>${esc(desc)}</p></div>`:'');
  const left=document.querySelector('.viewer-pane.left'); if(left) left.scrollTop=0;
}
function mpStepGo(dir){ if(_mpStep) _mpStepShow(_mpStep.idx+dir); }
async function mpAnswer(el,q,it){
  if(!_mpCtx) return;
  q.querySelectorAll('.mp-opt').forEach(x=>x.classList.add('mp-lock'));
  const chosen=+el.dataset.orig;
  // 8/29 별 포인트 폐지: 서버 award_quiz 대신 문항에 담긴 정답(it.correct)으로 바로 채점
  const correct=it.correct;
  const right=(typeof correct==='number') && chosen===correct;
  mpRevealQuiz(q,it,correct,right,false,chosen);
  // 진행 기록(정답·오답 모두 = "풀었음") → 서버 저장 + 진행바 + 완료체크
  _mpCtx.ans[it.id]={ok:right, pick:chosen};
  mpSaveProgress();
  _mpMirrorLocal();   // 8/18 사장님 수정요청(귀향 퀴즈 3개 풀고 닫으면 카드가 0/0): 내 챌린지 카드는 로컬 캐시만 읽으므로 여기에도 기록
  mpRenderProgress();
  mpCheckComplete();
}
function mpRevealQuiz(q,it,correct,right,restored,pickOrig){
  q.querySelectorAll('.mp-opt').forEach(x=>{ x.classList.add('mp-lock');
    const oi=+x.dataset.orig;
    if(oi===correct){ x.classList.add('mp-right'); x.querySelector('.mp-mk').textContent='✓'; }
    else if(oi===pickOrig && !right){ x.classList.add('mp-wrong'); x.querySelector('.mp-mk').textContent='✕'; }
    else x.classList.add('mp-dim');
  });
  const ex=q.querySelector('.mp-expl'); if(ex){ ex.innerHTML='<b>'+(right?'정답!':'아쉬워요')+'</b> '+esc(it.expl||''); ex.classList.add('mp-show'); }
}
async function mpSubmitWrite(k,min){
  if(!_mpCtx) return;
  const ta=document.getElementById('mp_ta_'+k); const v=((ta&&ta.value)||'').trim();
  const chk=bxWriteCheck(v,k,min);   // 측정 설계 §4 자동 미인정(글자수·연락처/링크·반복) — 저장 없음
  if(!chk.ok){ alert(chk.msg); if(ta) ta.focus(); bxEvent('activity',{sub:k, book:bxBookByKey(_mpCtx.bookId), program_id:_mpCtx.chId||null, ok:false, meta:{reason:chk.reason,len:v.length}}); return; }
  const btn=document.getElementById('mp_btn_'+k); if(btn) btn.disabled=true;
  // 8/29 별 포인트 폐지: 글 저장(bookstar_writings)이 곧 미션 완료. 재제출 시 갱신.
  let ok=false;
  try{ const r=await sbWrite('POST',`/bookstar_writings?on_conflict=student_id,activity,book_id`,
      {student_id:_mpCtx.student,school_id:_mpCtx.school,challenge_id:_mpCtx.chId,book_id:_mpCtx.bookId,activity:k,text:v,is_public:true},
      {prefer:'resolution=merge-duplicates,return=minimal'}); ok=r.ok; }catch(e){}
  if(!ok){ if(btn) btn.disabled=false; const m='글 저장에 실패했어요 — 다시 제출해 주세요'; try{ bmToast(m); }catch(e){ alert(m); } return; }
  mpMarkDone(k); _mpCtx.done.add(k+'|book:'+_mpCtx.bookId);
  bxEvent('activity',{sub:k, book:bxBookByKey(_mpCtx.bookId), program_id:_mpCtx.chId||null, ref_table:'bookstar_writings', ref_id:_mpCtx.student+'|'+k+'|'+_mpCtx.bookId, meta:{len:v.length}});   // 측정: 활동(챌린지 글)
  mpRenderProgress(); mpCheckComplete();
}
// 진행률 = 푼 퀴즈 문항 + 완료한 작성·인증 미션 / (퀴즈 문항수 + 켠 작성·인증 미션수)
function mpProgress(){
  if(!_mpCtx) return {done:0,total:0};
  let total=0, done=0;
  chalActiveMissions(_mpCtx.m).forEach(x=>{
    if(x.kind==='quiz'){ total+=_mpCtx.quizCount||0; done+=Object.keys(_mpCtx.ans||{}).length; }
    else { total+=1; if(_mpCtx.done.has(x.k+'|book:'+_mpCtx.bookId)) done+=1; }
  });
  if(done>total) done=total;
  return {done,total};
}
function mpRenderProgress(){
  const el=document.getElementById('mpProg'); if(!el) return;
  const {done,total}=mpProgress();
  const pct=total?Math.round(done/total*100):0;
  const full=total>0 && done>=total;
  el.innerHTML=`<div class="mp-prog-top"><span class="${full?'mp-prog-full':''}">${full?'🏅 챌린지 완주!':'미션 진행'}</span><span>${done}/${total}</span></div>`
    + `<div class="mp-prog-bar"><div class="mp-prog-fill" style="width:${pct}%"></div></div>`;
}
// 퀴즈 시도(정답·오답) 진행을 서버에 저장 (이어하기/진행률 소스)
async function mpSaveProgress(){
  if(!_mpCtx || _mpCtx.solo) return;   // solo=챌린지 없이 연 퀴즈 — challenge_id가 없어 이 표에 못 쓴다(8/20)
  try{
    await sbWrite('POST',`/bookstar_challenge_results?on_conflict=student_id,book_id`,
      {student_id:_mpCtx.student, book_id:_mpCtx.bookId, challenge_id:_mpCtx.chId,
       ans:_mpCtx.ans, quiz_total:_mpCtx.quizCount,
       quiz_ok:Object.values(_mpCtx.ans||{}).filter(a=>a&&a.ok).length, score:Object.values(_mpCtx.ans||{}).filter(a=>a&&a.ok).length*10,   // 8/18: 완료 목록·관리자도 같은 숫자를 보게
       updated_at:new Date().toISOString()},
      {prefer:'resolution=merge-duplicates,return=minimal'});
  }catch(e){}
}
// 미션 패널(DB 퀴즈) 진행을 로컬 캐시에 미러 — 내 챌린지 카드(_chalBookScore/_chalBookState)는 로컬만 읽는다.
//   ans 키는 퀴즈 항목 UUID(장면 챌린지의 'si-qi'와 다르지만 카드는 값의 ok만 센다), 문항수는 quiz_total로 저장.
function _mpMirrorLocal(extra){
  try{
    if(!_mpCtx||!_mpCtx.bookId||_mpCtx.solo) return;   // solo는 챌린지 카드가 없으므로 미러할 곳도 없다(8/20)
    const cur=_chalRead(_mpCtx.bookId)||{};
    _chalMerge(_mpCtx.bookId, Object.assign({ ans:Object.assign({}, cur.ans||{}, _mpCtx.ans||{}), quiz_total:(_mpCtx.quizCount||cur.quiz_total||0) }, extra||{}));
  }catch(e){}
}
// 모든 미션 수행 시: enroll done + 축하 (8/29 별 포인트 폐지 — 완주 보너스 삭제)
async function mpCheckComplete(){
  if(!_mpCtx || _mpCtx.complete || _mpCtx.solo) return;   // solo는 챌린지 완주가 아니다(8/20)
  const {done,total}=mpProgress();
  if(!(total>0 && done>=total)) return;
  _mpCtx.complete=true;
  _mpMirrorLocal({mp_done:true});   // 내 챌린지 카드 '완료 ✓'(8/18)
  try{
    await sbWrite('POST',`/bookstar_challenge_enroll?on_conflict=student_id,challenge_id`,
      {student_id:_mpCtx.student, challenge_id:_mpCtx.chId, status:'done', done_at:new Date().toISOString()},
      {prefer:'resolution=merge-duplicates,return=minimal'});
  }catch(e){}
  mpRenderProgress();
  try{ bsCelebrate({title:'🏅 챌린지 완주!', rows:['이 책의 미션을 모두 마쳤어요','마이페이지에서 내 기록을 확인하세요']}); }
  catch(e){ readerToast&&readerToast('🏅 챌린지 완주!'); }
}

/* ── 장(章) 이동 — 현재 보이는 칸의 chapter-anchor 기준 이전/다음 ── */


/* ── 점수 원장 (실측 적립 — 데모 기본 1,842점 + 챌린지로 번 점수) ── */
const SCORE_BASE = 0;   // 테스트 계정은 0점에서 시작(점수는 책별 결과에서 파생)
function _scoreLog(){ try{ return JSON.parse(localStorage.getItem('bookstar-score-log')||'[]'); }catch(e){ return []; } }
function addScore(pts, type, note){ /* 점수는 _chalBookScore에서 파생 — 별도 적립 안 함(no-op) */ return;
  // (legacy 보존)
  const log = _scoreLog();
  log.push({ts:Date.now(), pts, type, note});
  try{ localStorage.setItem('bookstar-score-log', JSON.stringify(log)); }catch(e){}
}
function _chalAllIds(){   // 점수·완독 집계 대상 = 진열 전체 + 장면챌린지 키(진열 제외돼도 기록 보존)
  const ids = new Set((typeof BOOKS !== 'undefined' ? BOOKS : []).map(b=>b.id));
  if(typeof CHALLENGE_SCENES !== 'undefined') Object.keys(CHALLENGE_SCENES).forEach(id=>ids.add(id));
  return [...ids];
}
function chalEarned(){   // 현재 계정의 모든 책 결과에서 점수 합산
  // (기존: CHALLENGE_SCENES 3권만 순회 → 다른 책 완독인증 +50점이 합산에서 빠지던 버그)
  return _chalAllIds().reduce((s,id)=>{ const sc=_chalBookScore(id); return s+(sc?sc.pts:0); }, 0);
}
function renderChalScore(){
  const el = document.getElementById('statScore');
  if(el) el.textContent = (SCORE_BASE + chalEarned()).toLocaleString();
}

/* ── 결정적 장면 챌린지 (CHALLENGE_SCENES 보유 도서 전용) ── */
let _sc = {bookId:null, idx:0, ans:{}, impression:'', submitted:false};
function _scSave(){
  const patch = {ans:_sc.ans, impression:_sc.impression, submitted:_sc.submitted};
  _chalMerge(_sc.bookId, patch);      // 계정별 로컬 캐시(읽기% 보존)
  bxUpsertResult(_sc.bookId, patch);  // 서버 저장(비동기, 퀴즈 컬럼만)
}
function renderSceneChallenge(sc, body, info){
  if(_sc.bookId !== currentBook.id){
    _sc = {bookId:currentBook.id, idx:0, ans:{}, impression:'', submitted:false};
    _bxLastSi = -1; _bxShownCur = -1; _bxPendingReveal = false;
    try{
      const sv = _chalRead(currentBook.id);
      if(sv){ _sc.ans = sv.ans||{}; _sc.impression = sv.impression||''; _sc.submitted = !!sv.submitted; }
    }catch(e){}
  }
  const n = sc.scenes.length;
  const i = Math.min(_sc.idx, n);
  const total = sc.scenes.reduce((s,x)=>s+x.quiz.length, 0);
  const answered = Object.keys(_sc.ans).length;
  const okCnt = Object.values(_sc.ans).filter(a=>a.ok).length;
  info.innerHTML = `결정적 장면 챌린지 · <b>${i<n ? `장면 ${i+1}/${n}` : '한 줄 소감'}</b> · 퀴즈 ${answered}/${total}`;
  // 별이 챗봇 퀴즈 — 우선 '운수 좋은 날' 1권만 적용(확인 후 확대). 연속형이라 info도 직접 설정.
  if(CHAT_QUIZ_BOOKS.has(currentBook.id)){ return renderSceneChat(sc, body, info); }
  if(i < n){
    const s = sc.scenes[i];
    const ex = s.excerpt.split(/\n{2,}/).map(p=>`<p>${esc(p)}</p>`).join('');
    body.innerHTML = `
      <div class="viewer-pane left">
        <div class="viewer-pane-label">${esc(s.label)} — ${esc(s.title)}</div>
        ${ex}
        <div style="margin-top:18px;padding:14px 16px;border-left:3px solid var(--gold,#b8860b);background:rgba(184,134,11,.07);border-radius:0 10px 10px 0;font-size:.93em;line-height:1.75;">${esc(s.why)}</div>
      </div>
      <div class="viewer-pane right">
        <div class="viewer-pane-label">오른쪽 — 장면 ${i+1} 퀴즈</div>
        ${s.quiz.map((q,qi)=>{
          const got = _sc.ans[i+'-'+qi];
          return `<div class="quiz-block">
            <div class="quiz-q-num">Q ${qi+1}</div>
            <div class="quiz-q">${esc(q.q)}</div>
            ${q.opts.map((opt,oi)=>{
              let cls='';
              if(got){ if(oi===q.correct) cls=' correct'; else if(oi===got.pick && !got.ok) cls=' wrong'; }
              return `<div class="quiz-opt${cls}" onclick="checkSceneQuiz(this, ${i}, ${qi}, ${oi})">${esc(opt)}</div>`;
            }).join('')}
          </div>`;
        }).join('')}
        <p style="margin-top:14px;color:var(--text-light);font-size:.9em;">${s.quiz.length}문항을 풀고 아래 <b>다음 장면 ▶</b>을 눌러 주세요. (정답 1문항 = +10점)</p>
      </div>`;
  } else {
    body.innerHTML = `
      <div class="viewer-pane left">
        <div class="viewer-pane-label">챌린지 정리 — ${esc(sc.bookTitle)} · ${esc(sc.author)}</div>
        <p style="line-height:1.8;">${esc(sc.intro)}</p>
        <div style="margin-top:16px;padding:14px 16px;border-radius:10px;background:rgba(30,60,120,.06);line-height:1.8;">
          <b>장면 퀴즈 결과</b><br>정답 ${okCnt} / ${total}문항 ${answered<total ? `(아직 ${total-answered}문항이 남았어요 — 이전 장면으로 돌아가 마저 풀 수 있어요)` : ''}
        </div>
      </div>
      <div class="viewer-pane right">
        <div class="viewer-pane-label">오른쪽 — 한 줄 소감</div>
        <p style="line-height:1.8;">${esc(sc.finalPrompt)}</p>
        <textarea id="scImpression" rows="3" style="width:100%;margin-top:10px;padding:12px 14px;border:1.5px solid rgba(120,120,140,.4);border-radius:10px;font:inherit;line-height:1.6;resize:vertical;background:transparent;color:inherit;" placeholder="한 줄 소감을 적어 주세요 (5자 이상)">${esc(_sc.impression)}</textarea>
        <button class="viewer-action primary" style="margin-top:12px;" onclick="submitSceneImpression()">${_sc.submitted ? '소감 수정 저장' : '소감 제출하고 챌린지 완료 →'}</button>
        ${_sc.submitted ? '<p style="margin-top:10px;color:var(--text-light);">✅ 제출 완료 — 퀴즈 결과·소감은 AI 성장 리포트의 재료가 됩니다. (데모: 이 기기에 저장)</p>' : ''}
      </div>`;
  }
}
/* ── 별이 챗봇 퀴즈 (카톡 스타일) ── */
const CHAT_QUIZ_BOOKS = new Set(['kr-현진건-운수-좋은-날','kr-이효석-메밀꽃-필-무렵','kr-김동인-붉은-산','gb-74222','gb-64317']);
let _bxShownCur = -1, _bxPendingReveal = false;   // 노출된 질문 index(글로벌) / 타이핑 예약중
/* 질문별 하이라이트 — 왼쪽 원문에서 형광펜 칠 문장(해당 장면 excerpt의 정확한 부분 문자열) */
const BX_HL = {
 "kr-이효석-메밀꽃-필-무렵": [["얼결김에 따귀를 하나 갈겨 주지 않고는 배길 수 없었다","생원 당나귀가 바를 끊구 야단이에요.","머리에 피도 안 마른 녀석이 낮부터 술 처먹고 계집과 농탕이야","아직두 서름서름한 사인데 너무 과하지 않았을까 하고 마음이 섬뾵해졌다","짐승도 짐승이려니와 동이의 마음씨가 가슴을 울렸다"],["피기 시작한 꽃이 소금을 뿌린 듯이 흐뭇한 달빛에 숨이 막힐 지경이다","옷을 벗으러 물방앗간으로 들어가지 않았나. 이상한 일도 많지. 거기서 난데없는 성서방네 처녀와 마주쳤단 말이네","그 때부터 봉평이 마음에 든 것이 반평생을 두고 다니게 되었네. 반평생인들 잊을 수 있겠나.","다음 장도막에는 벌써 온 집안이 사라진 뒤였네.","산허리는 온통 메밀밭이어서 피기 시작한 꽃이 소금을 뿌린 듯이 흐뭇한 달빛에 숨이 막힐 지경이다"],["시원스리 말은 안해주나 봉평이라는 것만은 들었죠.","동이는 물속에서 어른을 해깝게 업을 수 있었다.","동이의 탐탁한 등어리가 뼈에 사무쳐 따뜻하다. 물을 다 건넜을 때에는 도리어 서글픈 생각에 좀더 업혔으면도 하였다.","나귀가 걷기 시작하였을 때 동이의 채찍은 왼손에 있었다.","오랫동안 아둑신이같이 눈이 어둡던 허생원도 요번만은 동이의 왼손잡이가 눈에 띄지 않을 수 없었다."]],
 "kr-김동인-붉은-산": [["어느덧 ××촌에서는 익호를 익호라 부르지 않고 '삵'이라고 부르게 되었다.","그의 장기(長技)는 투전이 일쑤며, 싸움 잘하고, 트집 잘 잡고, 칼부림 잘하고, 색시에게 덤벼들기 잘하는 것이라 한다.","물론 합의는 되었다. 그러나 내어쫓는 데 선착할 사람이 없었다.","'삵'은 이 동네에는 커다란 암종이었다.","'삵'도 남의 동정이나 사랑은 벌써 단념한 사람이었다."],["소출이 좋지 못하다고 두들겨 맞아서 부러져 꺾어진 송 첨지는 나귀등에 몸이 결박되어서 겨우 ××촌으로 돌아왔다.","누구든 앞장을 서려는 사람이 없었다.","여는 의사라는 여의 직업상 송 첨지 시체를 검시를 하였다.","여가 발을 떼려는 순간 얼핏 '삵'의 얼굴에 나타난 비창한 표정을 여는 넘길 수가 없었다.","그 억분함을 호소할 곳도 못 가진 우리의 처지를 생각하고, 여도 눈물을 금치를 못하였다."],["'삵'의 허리가 기역자로 뒤로 부러져서 밭고랑 위에 넘어져 있는 것을 여는 달려가 보았다.","“그 놈… 지주 놈의 집에…”","“보고 싶어요. 붉은 산이 - 그리고 흰 옷이!”","“선생님 노래를 불러주세요. 마지막 소원 - 노래를 해주세요. 동해물과 백두산이 마르고 닳도록…”","아아, 죽음에 임하여 그의 고국과 동포가 생각난 것이었다."]],
 "gb-74222": [["나는 어느 날 밤 친구의 도움으로 사과를 한 자루나 훔쳤노라고 떠벌렸다.","\"그럼 말해 봐. '하느님과 모든 거룩한 것에 두고 맹세한다'고!\"","마침내 순전히 겁에 질린 나머지 나도 이야기를 하나 늘어놓기 시작했다.","프랑크 크로머가 비집고 따라 들어왔다.","다시 집에 돌아와 가족의 밝음과 평화로 되돌아오는 것이 얼마나 큰 복인가!"],["카인이 전혀 사악하지 않았다는 거지?","사람들이 익숙한 것보다 그의 눈빛에 깃든 약간 더 많은 지혜와 대담함 같은 것.","자기들에게 복수하기 위해서, 그 무리가 자기들에게 불어넣은 그 모든 공포를 어느 정도 벌충하기 위해서 말이야.","나는 흥미가 일어 말했다. 그 일이 내 관심을 끌기 시작했다.","성경에 나오는 그 이야기 전체가 실은 참이 아니라는 거고?"],["새는 알을 깨고 나오려 싸운다.","알은 세계다.","그 신의 이름은 아브락사스*다.","태어나려는 자는 한 세계를 부수어야 한다.","고대 그노시스파에서 신적인 것과 악마적인 것을 한 몸에 아우르는 최고 존재로 여긴 신격의 이름."],["알의 구체(球體)를 뚫고 나오려 애쓰는 내 새가.","내 가슴은 기쁘면서도 슬펐다, 마치 그 순간 내가 행하고 겪은 모든 것이 응답이자 성취로 내게 되돌아오는 듯했다.","원수 크로머의 사악한 마법 아래 떨던 소년 시절의 나 자신이","그녀는 나를 홀에 혼자 남겨 두었다.","이 순간에 이르기까지의 모든 것이 다시 내 안에서 메아리쳤고, 또렷이 자리 잡고, 응답받고, 인정받았다."],["그 위에는 낯선 사람이, 내가 전에 한 번도 본 적 없는 남자가 누워 있었다.","에바 부인께서 말씀하셨어, 혹시라도 자네가 아프거든 그분의 입맞춤을 전하라고.","자네는 자네 안의 목소리에 귀를 기울여야 해. 그러면 그것이 나라는 걸, 내가 자네 안에 있다는 걸 알게 될 거야.","이제 그분과, 나의 인도자이자 벗과 완전히 닮아 있는 내 모습이.","나는 그저 그 검은 거울 쪽으로 몸을 굽히기만 하면 된다. 그러면 내 자신의 모습이 보인다."]],
 "gb-64317": [["내가 지금보다 어리고 마음이 여리던 시절, 아버지는 내게 충고 한마디를 해 주셨고, 나는 그 말을 그 뒤로 줄곧 마음속에서 곱씹어 왔다.","그는 어두운 물을 향해 묘한 자세로 두 팔을 뻗었고, 그토록 멀리 떨어져 있었는데도 나는 그가 떨고 있다고 장담할 수 있었다.","작고 아득한, 어느 부두 끝일 법한 초록 불빛 하나 말고는 아무것도 분간할 수 없었다.","그는 어두운 물을 향해 묘한 자세로 두 팔을 뻗었고, 그토록 멀리 떨어져 있었는데도 나는 그가 떨고 있다고 장담할 수 있었다.","나는 그 말을 그 뒤로 줄곧 마음속에서 곱씹어 왔다."],["그것은 평생 네댓 번이나 마주칠까 말까 한, 영원한 안도감 같은 것이 깃든 보기 드문 미소였다.","당신이 스스로를 믿고 싶은 만큼 당신을 믿어 주었으며, 당신이 가장 좋은 모습일 때 전하고 싶어 하는 바로 그 인상을 자신이 정확히 받았노라고 장담해 주었다.","공들인 그의 격식 차린 말투는 우스꽝스러워지기 직전에 가까스로 멈춰 있었다. 그가 자기소개를 하기 얼마 전부터 나는 그가 단어를 신중하게 고르고 있다는 강한 인상을 받았다.","개츠비 씨가 자신을 밝힌 바로 그 순간, 집사 하나가 시카고에서 전화가 왔다는 소식을 들고 그에게 황급히 다가왔다.","그것은 평생 네댓 번이나 마주칠까 말까 한, 영원한 안도감 같은 것이 깃든 보기 드문 미소였다."],["그는 셔츠 한 무더기를 꺼내, 우리 앞에 한 장 한 장 던지기 시작했다.","별안간 데이지가 무언가에 짓눌린 듯한 소리를 내며 셔츠 더미에 고개를 묻고는 폭풍처럼 울기 시작했다.","“당신네 부두 끝에는 밤새 켜져 있는 초록 불빛이 늘 있지요.”","어쩌면 그 불빛의 어마어마한 의미가 이제 영영 사라져 버렸다는 생각이 그에게 떠올랐는지도 모른다.","그러나 이제 그것은 다시 한낱 부두의 초록 불빛이 되어 버렸다."],["“당신 아내는 당신을 사랑하지 않소.” 개츠비가 말했다. “단 한 번도 사랑한 적이 없지. 그녀는 나를 사랑하오.”","그냥 그에게 사실대로만 말해 줘요—그를 한 번도 사랑한 적이 없다고—그러면 모든 게 영영 깨끗이 씻겨 나가는 거요.","그녀는 멍하니 그를 바라보았다. “아니—내가 어떻게 그를 사랑할 수가—그게 가당키나 해요?”","그냥 그에게 사실대로만 말해 줘요—그를 한 번도 사랑한 적이 없다고—그러면 모든 게 영영 깨끗이 씻겨 나가는 거요.","그녀는 멍하니 그를 바라보았다. “아니—내가 어떻게 그를 사랑할 수가—그게 가당키나 해요?”"],["개츠비가 데이지의 부두 끝에서 그 초록빛 불빛을 처음 알아보았을 때의 경이를 떠올렸다.","개츠비는 그 초록빛 불빛을, 해마다 우리 앞에서 물러가는 그 황홀경의 미래를 믿었다.","개츠비는 그 초록빛 불빛을, 해마다 우리 앞에서 물러가는 그 황홀경의 미래를 믿었다.","그리하여 우리는 계속 나아간다, 물살을 거스르는 배처럼, 끊임없이 과거 속으로 떠밀려 가면서.","그리하여 우리는 계속 나아간다, 물살을 거스르는 배처럼, 끊임없이 과거 속으로 떠밀려 가면서."]],
 'kr-현진건-운수-좋은-날': [
  ["설렁탕 국물이 마시고 싶다고 남편을 졸랐다",
   "이상하게도 꼬리를 맞물고 덤비는 이 행운 앞에 조금 겁이 났음이다",
   "오늘은 나가지 말아요. 제발 덕분에 집에 붙어 있어요. 내가 이렇게 아픈데",
   "그 돈벌 용기가 병자에 대한 염려를 사르고 말았다",
   "설마 오늘 내로 어떠랴 싶었다"],
  ["이윽고 끄는 이의 다리는 무거워졌다. 자기 집 가까이 다다른 까닭이다",
   "병자의 움쑥 들어간 눈이 원망하는 듯이 자기를 노리는 듯하였다",
   "다리를 재게 놀려야만 쉴새없이 자기의 머리에 떠오르는 모든 근심과 걱정을 잊을 듯이",
   "이 누그러움은 안심에서 오는 게 아니요 자기를 덮친 무서운 불행을 빈틈없이 알게 될 때가 박두한 것을 두리는 마음에서 오는 것이다",
   "누구든지 나를 좀 잡아 다고, 구해 다고 하는 듯하였다"],
  ["김첨지는 취중에도 설렁탕을 사가지고 집에 다다랐다",
   "",
   "죽기는 누가 죽어. 죽기는 왜 죽어, 생때같이 살아만 있단다",
   "설렁탕을 사다 놓았는데 왜 먹지를 못하니, 왜 먹지를 못하니",
   "괴상하게도 오늘은! 운수가, 좋더니만"]
 ]
};
function _bxHlExcerpt(excerpt, hl){     // excerpt를 문단별 esc + hl 문장에 형광펜
  return excerpt.split(/\n{2,}/).map(p=>{
    let e = esc(p);
    if(hl){ const eh = esc(hl); if(e.includes(eh)) e = e.split(eh).join('<mark class="bx-hl">'+eh+'</mark>'); }
    return `<p>${e}</p>`;
  }).join('');
}
function _bxTypingRow(){
  return `<div class="bx-row bot"><div class="bx-ava">⭐</div><div class="bx-col"><div class="bx-name">별이</div>`
    + `<div class="bx-msg bot bx-typing-bubble"><span class="bx-dot"></span><span class="bx-dot"></span><span class="bx-dot"></span></div></div></div>`;
}
function _bxBot(msgs){ // 연속 봇 말풍선 한 묶음 (아바타·이름 1회)
  return `<div class="bx-row bot"><div class="bx-ava">⭐</div><div class="bx-col"><div class="bx-name">별이</div>`
    + msgs.map(m=>`<div class="bx-msg bot${m.cls?(' '+m.cls):''}">${m.html}</div>`).join('') + `</div></div>`;
}
function _bxMe(text){ return `<div class="bx-row me"><div class="bx-msg me">${esc(text)}</div></div>`; }
function _bxQHtml(q){
  const m = q.q.match(/^\[(.+?)\]\s*([\s\S]*)$/);
  const tag = m ? `<span class="bx-tag">${esc(m[1])}</span>` : '';
  return tag + esc(m ? m[2] : q.q);
}
let _bxLeftScroll = 0, _bxLastSi = -1;     // 좌측 원문 스크롤 보존(같은 장면) / 장면 바뀌면 맨 위로
function renderSceneChat(sc, body, info){
  const scenes = sc.scenes;
  // 모든 장면의 문항을 하나로 펼침 → 연속 카톡 (장면 경계는 별이 멘트로만 구분)
  const flat = [];
  scenes.forEach((s,si)=> s.quiz.forEach((q,qi)=> flat.push({si,qi})));
  const total = flat.length;
  let cur = 0; while(cur < flat.length && _sc.ans[flat[cur].si+'-'+flat[cur].qi]) cur++;
  const allDone = cur >= flat.length;
  const answered = Object.keys(_sc.ans).length;
  const okCnt = Object.values(_sc.ans).filter(a=>a.ok).length;
  const activeSi = allDone ? scenes.length-1 : flat[cur].si;
  const typingNow = !allDone && (_bxShownCur !== cur);   // 활성 질문이 아직 노출 안 됨 → 입력 중…
  info.innerHTML = `결정적 장면 챌린지 · <b>${allDone ? '한 줄 소감' : `장면 ${activeSi+1}/${scenes.length}`}</b> · 퀴즈 ${answered}/${total}`;

  let chat = '';
  let pending = [];
  const flush = ()=>{ if(pending && pending.length){ chat += _bxBot(pending); pending = []; } };

  if(!allDone){
    outer:
    for(let si=0; si<=activeSi; si++){
      const s = scenes[si];
      pending.push({html: si===0
        ? `안녕하세요, <b>별이</b>예요 ⭐ 『${esc(sc.bookTitle)}』의 결정적인 장면을 함께 읽어 볼게요. <b>왼쪽 글</b>을 먼저 읽고 답해 주세요!`
        : `다음 장면으로 넘어왔어요 — <b>${esc(s.title)}</b>. <b>왼쪽 글이 바뀌었죠?</b> 읽고 이어서 답해 주세요!`});
      for(let qi=0; qi<s.quiz.length; qi++){
        const q = s.quiz[qi];
        const got = _sc.ans[si+'-'+qi];
        if(got){
          pending.push({html:_bxQHtml(q)});
          flush();
          chat += _bxMe(q.opts[got.pick]);
          pending.push(got.ok
            ? {cls:'react ok', html:`정답이에요! 🎉 <b>+10점</b>` + (q.expl?`<div class="bx-expl">${esc(q.expl)}</div>`:'')}
            : {cls:'react no', html:`앗, 아쉬워요. 정답은 <b>“${esc(q.opts[q.correct])}”</b>예요.` + (q.expl?`<div class="bx-expl">${esc(q.expl)}</div>`:'')});
        } else {                              // 활성 문제(cur)
          if(typingNow){ flush(); chat += _bxTypingRow(); }   // 별이가 입력 중… (질문은 잠시 뒤)
          else {
            pending.push({html:_bxQHtml(q)});
            flush();
            chat += `<div class="bx-chips">${q.opts.map((opt,oi)=>`<button class="bx-chip" onclick="chatPick(${si},${qi},${oi})">${esc(opt)}</button>`).join('')}</div>`;
          }
          pending = null; break outer;        // 활성 이후·다음 장면은 아직 숨김
        }
      }
    }
    flush();                                  // (방어) 남은 봇 묶음
    const s = scenes[activeSi];
    const activeQi = allDone ? -1 : flat[cur].qi;
    const hl = (BX_HL[currentBook.id] && BX_HL[currentBook.id][activeSi] && BX_HL[currentBook.id][activeSi][activeQi]) || '';
    const ex = _bxHlExcerpt(s.excerpt, hl);
    body.innerHTML = `
      <div class="viewer-pane left">
        <div class="viewer-pane-label">${esc(s.label)} — ${esc(s.title)}</div>
        ${ex}
        <div style="margin-top:18px;padding:14px 16px;border-left:3px solid var(--gold,#b8860b);background:rgba(184,134,11,.07);border-radius:0 10px 10px 0;font-size:.93em;line-height:1.75;">${esc(s.why)}</div>
      </div>
      <div class="viewer-pane right bx-pane"><div class="bx-chat">${chat}</div></div>`;
  } else {
    const done = _sc.submitted;
    chat += _bxBot([
      {html:`마지막이에요! 여기까지 잘 따라오셨어요 👏 장면 퀴즈는 <b>${okCnt}/${total}</b>문항 맞히셨어요.`},
      {html:esc(sc.finalPrompt)}
    ]);
    if(done){
      chat += _bxMe(_sc.impression);
      chat += _bxBot([{cls:'react ok', html:`고마워요, 잘 읽으셨어요 ⭐ 소감은 마이페이지에 기록됐어요. <b>다른 책도 별이와 함께 읽어 보실래요?</b>`}]);
      const others = _bxOtherBooks();
      if(others.length){
        chat += `<div class="bx-books-label">📚 아직 안 읽은 챌린지 책 — 표지를 눌러 별이와 함께 시작해요!</div><div class="bx-books">`
          + others.map(b=>`<button class="bx-book" onclick="bxOpenBook('${b.id}')">${b.cover?`<img src="${esc(b.cover)}" alt="">`:'<div class="bx-book-ph">📖</div>'}<span>${esc(b.title)}</span></button>`).join('')
          + `</div>`;
      } else {
        chat += `<div class="bx-next-row"><button class="bx-next-btn" onclick="bxFinishGo()">🏆 마이페이지에서 내 기록 보기 →</button></div>`;
      }
    }
    chat += `<div class="bx-inputbar"><input id="bxImpr" type="text" placeholder="${done?'소감을 바꾸고 싶으면 다시 써서 보내 주세요':'여기에 한 줄 소감을 써 주세요 (5자 이상)'}" value="" onkeydown="if(event.key==='Enter')chatSubmitImpression()"><button onclick="chatSubmitImpression()">${done?'수정':'보내기'}</button></div>`;
    body.innerHTML = `
      <div class="viewer-pane left">
        <div class="viewer-pane-label">챌린지 정리 — ${esc(sc.bookTitle)} · ${esc(sc.author)}</div>
        <p style="line-height:1.8;">${esc(sc.intro)}</p>
        <div style="margin-top:16px;padding:14px 16px;border-radius:10px;background:rgba(30,60,120,.06);line-height:1.8;">
          <b>장면 퀴즈 결과</b><br>정답 ${okCnt} / ${total}문항
        </div>
      </div>
      <div class="viewer-pane right bx-pane"><div class="bx-chat">${chat}</div></div>`;
  }
  // 좌측 원문: 형광펜 문장이 보이도록 스크롤. 없으면 같은 장면=유지 / 장면 바뀜=맨 위
  const leftEl = body.querySelector('.viewer-pane.left');
  if(leftEl){
    const mk = leftEl.querySelector('.bx-hl');
    if(mk){ const r1 = mk.getBoundingClientRect(), r0 = leftEl.getBoundingClientRect(); leftEl.scrollTop += (r1.top - r0.top) - 90; }
    else { leftEl.scrollTop = (activeSi === _bxLastSi) ? _bxLeftScroll : 0; }
  }
  _bxLastSi = activeSi;
  // 활성 질문이 아직 안 떴으면 → 잠깐 "입력 중…" 후 자동 노출 (첫 질문 포함 매 질문)
  if(typingNow && !_bxPendingReveal){
    _bxPendingReveal = true;
    const reveal = cur;
    setTimeout(()=>{
      _bxPendingReveal = false; _bxShownCur = reveal;
      if(currentMode==='challenge' && CHAT_QUIZ_BOOKS.has(currentBook.id)){ renderViewer(); _bxScrollBottom(); }
    }, 1500);
  }
}
function _bxScrollBottom(){ const r=document.querySelector('.viewer-pane.right'); if(r) r.scrollTop=r.scrollHeight; }
function bxFinishGo(){ closeViewer(); nav('mypage'); }   // 완료 후 → 내서재 Quest Map(다른 책 고르기)
function bxOpenBook(id){ openViewer(id, 'challenge'); }  // 챌린지 책 표지 클릭 → 그 책 별이 챌린지로
function _bxOtherBooks(){                                // 아직 소감까지 안 끝낸 다른 챌린지 책(표지+제목)
  const out = [], seen = new Set();
  (typeof joinedChals==='function' ? joinedChals() : []).forEach(c=>{
    if(_questIsExpired(c)) return;                        // 끝난 챌린지는 추천 제외
    (c.books||[]).forEach(b=>{
      const m = _matchBookByTitle(b.t); if(!m || seen.has(m.id)) return;
      if(currentBook && m.id===currentBook.id) return;
      const r = _chalRead(m.id); if(r && r.submitted) return;
      seen.add(m.id); out.push({id:m.id, title:b.t, cover:b.cover});
    });
  });
  return out;
}
function chatPick(si, qi, oi){
  const sc = (typeof CHALLENGE_SCENES!=='undefined') ? CHALLENGE_SCENES[currentBook.id] : null;
  if(!sc || _sc.ans[si+'-'+qi]) return;
  const q = sc.scenes[si].quiz[qi];
  const ok = (q.correct === oi);
  _sc.ans[si+'-'+qi] = {pick:oi, ok}; _scSave();
  if(ok) addScore(10, '장면 퀴즈', `${sc.bookTitle} 장면${si+1} Q${qi+1}`);
  _bxLeftScroll = document.querySelector('.viewer-pane.left')?.scrollTop || 0;
  renderViewer(); _bxScrollBottom();         // 다음 질문은 renderSceneChat이 타이핑 후 자동 노출
  try{ renderChalScore(); }catch(e){}
}
function _clearBookScore(bookTitle){      // 점수 원장에서 이 책 항목 제거(다시 풀기 시 중복적립 방지)
  try{
    const log = _scoreLog().filter(e => !((e.note||'').startsWith(bookTitle)));
    localStorage.setItem('bookstar-score-log', JSON.stringify(log));
  }catch(e){}
}
function chatRestart(){
  const sc = (typeof CHALLENGE_SCENES!=='undefined') ? CHALLENGE_SCENES[currentBook.id] : null;
  if(!sc) return;
  if(!confirm('지금까지 푼 답과 한 줄 소감을 지우고 처음부터 다시 풀까요?')) return;
  _clearBookScore(sc.bookTitle);
  _sc.ans = {}; _sc.impression = ''; _sc.submitted = false; _scSave();
  _bxShownCur = -1; _bxPendingReveal = false; _bxLastSi = -1; _bxLeftScroll = 0;
  renderViewer();
  const r = document.querySelector('.viewer-pane.right'); if(r) r.scrollTop = 0;
  try{ renderChalScore(); renderQuestMap(); renderMyImpressions(); }catch(e){}
}
function chatSubmitImpression(){
  const t = document.getElementById('bxImpr'); if(!t) return;
  const v = t.value.trim();
  if(v.length < 5){ readerToast('소감을 5자 이상 적어 줘!'); return; }
  const first = !_sc.submitted;
  _sc.impression = v; _sc.submitted = true; _scSave();
  if(first) bxEvent('activity',{sub:'oneline', book:currentBook, ref_table:'bookstar_challenge_results', ref_id:_bxSid()+'|'+currentBook.id, meta:{len:v.length, via:'chat'}});   // 측정: 활동(채팅 소감)
  if(first) addScore(50, '한 줄 소감', CHALLENGE_SCENES[currentBook.id].bookTitle);
  renderViewer(); _bxScrollBottom();
  try{ renderQuestMap(); renderChalScore(); renderMyImpressions(); }catch(e){}
}
/* 마이페이지 상단 히어로 — 실측 3숫자(완독·정답률·누적점수) */
function _myStats(){
  let done=0, ok=0, answered=0;
  _chalAllIds().forEach(id=>{   // 전체 책 기준(기존 CHALLENGE_SCENES 3권만 → 완독 수 미집계 버그)
    const r=_chalRead(id); if(!r) return;
    if((r.read_pct||0)>=95) done++;
    const a=Object.values(r.ans||{}); answered+=a.length; ok+=a.filter(x=>x.ok).length;
  });
  return {done, ok, answered, rate: answered?Math.round(ok/answered*100):0, score: SCORE_BASE+chalEarned()};
}
function renderMyHero(){
  const el=document.getElementById('myHero'); if(!el) return;
  const s=bxStudent(); const st=_myStats();
  const empty = st.done===0 && st.answered===0 && st.score===0;
  el.innerHTML = `
    <div class="my-hero-name">${s?`<span style="font-size:18px;">${esc(s.emoji||'🙂')}</span> ${esc(s.name)}`:'🙂 게스트'}</div>
    <div class="my-hero-msg">${empty
      ? '아직 시작 전이에요 — 첫 책을 골라 <b>별이</b>와 함께 읽어보세요!'
      : `지금까지 <b>${st.done}권 완독</b>${st.answered?` · 퀴즈 정답률 <b>${st.rate}%</b>`:''}`}</div>
    <div class="my-hero-nums">
      <div><div class="mh-n">${st.done}</div><div class="mh-l">완독</div></div>
      <div><div class="mh-n">${st.rate}<span class="mh-u">%</span></div><div class="mh-l">퀴즈 정답률</div></div>
      <div><div class="mh-n">${st.score.toLocaleString()}</div><div class="mh-l">누적 점수</div></div>
    </div>`;
}
/* 나의 독서 리듬 — Bento 그리드. 뷰어가 측정한 실데이터(읽기시간·streak·read_pct)만, 가짜 없음 */
function _fmtMins(m){ m=Math.max(0,Math.round(m||0)); return m>=60 ? Math.floor(m/60)+'시간'+(m%60?' '+(m%60)+'분':'') : m+'분'; }
function _dkey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _heatLevel(m){ if(!m) return 0; if(m<10) return 1; if(m<30) return 2; if(m<60) return 3; return 4; }
function renderReadingRhythm(){
  const el=document.getElementById('readingRhythm'); if(!el) return;
  const rt=readerStats.readingTime||{total:0,days:{}};
  const today=rt.days[todayKey()]||0;
  const streak=readerStats.streak?.count||0;
  // 이번 주(월~일) 막대
  const names=['일','월','화','수','목','금','토'];
  const week=[];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); week.push({k:_dkey(d), name:names[d.getDay()], v:rt.days[_dkey(d)]||0, today:i===0}); }
  const wmax=Math.max(...week.map(d=>d.v), 1);
  // 책별 진행률
  const rows=[];
  (typeof BOOKS!=='undefined'?BOOKS:[]).forEach(b=>{
    const r=_chalRead(b.id); const pct=r?.read_pct||0;
    if(pct>0) rows.push({id:b.id, title:b.title, pct:Math.min(100,pct), ts:r.ts||0, done:pct>=95});
  });
  rows.sort((a,b)=>(a.done-b.done)||(b.ts-a.ts));
  const shown=rows.slice(0,4);
  // 독서 잔디 (최근 8주, 일요일 시작 7×8 그리드)
  const t0=new Date(); t0.setHours(0,0,0,0);
  const start=new Date(t0); start.setDate(start.getDate()-(t0.getDay()+7*7));
  const cols=[];
  for(let w=0; w<8; w++){
    const col=[];
    for(let dd=0; dd<7; dd++){
      const d=new Date(start); d.setDate(start.getDate()+w*7+dd);
      if(d>t0){ col.push({future:true}); continue; }
      const m=rt.days[_dkey(d)]||0; col.push({lvl:_heatLevel(m), title:_dkey(d)+' · '+m+'분'});
    }
    cols.push(col);
  }
  const st=(typeof _myStats==='function')?_myStats():{done:0,rate:0,score:0};
  const s=(typeof bxStudent==='function')&&bxStudent();
  const name=(s&&s.name)||(typeof readerName==='function'?readerName():'게스트');
  const emoji=(s&&s.emoji)||'📘';
  const headline=streak>0?`<b>${streak}일째</b> 읽는 중`:`오늘 <b>첫 페이지</b>를 펴보세요`;
  // (위) 액션 블록 = 히어로 + 읽고 있는 책
  const heroTile=`
    <div class="b-tile b-identity">
      <div class="b-id-name">${esc(name)}</div>
      <div class="b-id-head">${headline}</div>
      <div class="b-week">${week.map(d=>`
        <div class="b-wbar${d.v?'':' zero'}${d.today?' today':''}" title="${d.k} · ${d.v}분">
          <div class="wb-fill" style="height:${d.v?Math.max(4,Math.round(d.v/wmax*42)):3}px"></div>
          <div class="wb-d">${d.today?'오늘':d.name}</div>
        </div>`).join('')}</div>
    </div>`;
  // 히어로(주간 리듬)·독서 밤하늘은 삭제 → 측정존은 KPI + 잔디만
  void heroTile;
  el.innerHTML='';
  // (아래) 통계 블록 = KPI 4 + 독서 잔디
  const kpiTiles=`
    <div class="b-tile b-num b-acc-gold"><div class="b-num-ic">📚</div><div class="b-num-v">${st.done}</div><div class="b-num-l">완독</div>${st.done?'<div class="b-num-sub">지금까지 모은 책</div>':'<div class="b-num-sub">첫 완독에 도전!</div>'}</div>
    <div class="b-tile b-num b-acc-blue"><div class="b-num-ic">🎯</div>${st.answered
      ? `<div class="b-num-v">${st.rate}<span class="b-num-u">%</span></div><div class="b-num-l">퀴즈 정답률</div><div class="b-num-sub">${st.ok}/${st.answered}문항 정답</div>`
      : `<div class="b-num-v b-num-soft">—</div><div class="b-num-l">퀴즈 정답률</div><div class="b-num-sub">아직 퀴즈 전이에요</div>`}</div>
    <div class="b-tile b-num b-acc-indigo"><div class="b-num-ic">⭐</div><div class="b-num-v">${(st.score||0).toLocaleString()}</div><div class="b-num-l">누적 점수</div>${st.score?'<div class="b-num-sub">미션으로 쌓은 점수</div>':'<div class="b-num-sub">미션 완료 시 적립</div>'}</div>
    <div class="b-tile b-num b-acc-green"><div class="b-num-ic">⏱️</div><div class="b-num-v">${_fmtMins(today)}</div><div class="b-num-l">오늘 읽음</div><div class="b-num-sub">누적 ${_fmtMins(rt.total||0)}</div></div>
    <div class="b-tile b-heat">
      <div class="b-head">독서 잔디 <span class="b-head-sub">최근 8주</span></div>
      <div class="b-heatgrid">${cols.map(col=>`<div class="b-heatcol">${col.map(c=>
        c.future?`<div class="b-cell future"></div>`:`<div class="b-cell${c.lvl?' l'+c.lvl:''}" title="${c.title}"></div>`
      ).join('')}</div>`).join('')}</div>
      <div class="b-heat-foot">적게 <span class="b-cell"></span><span class="b-cell l1"></span><span class="b-cell l2"></span><span class="b-cell l3"></span><span class="b-cell l4"></span> 많이</div>
    </div>`;
  const sEl=document.getElementById('readingStats'); if(sEl) sEl.innerHTML=`<div class="my-stats">${kpiTiles}</div>`;
}
/* ── 내서재 = 내 서가 (슬림 프로필 + 우리 도서관식 가로 표지 서가) ── */
const PE_EMOJI=['📘','🌷','⚽','🎨','🚀','📚','🦊','🌙','🍀','🐳','🎧','🌻','🐧','☕','🎸','🧩'];
let _peEmoji='', _peFav='';
function _doneBooks(){ const out=[]; (typeof BOOKS!=='undefined'?BOOKS:[]).forEach(b=>{ const r=_chalRead(b.id); if(r&&(r.read_pct||0)>=95) out.push(b); }); return out; }
function _readingBooks(){ const out=[]; (typeof BOOKS!=='undefined'?BOOKS:[]).forEach(b=>{ const r=_chalRead(b.id); const p=r?(r.read_pct||0):0; if(p>0&&p<95) out.push({b, pct:Math.max(1,Math.min(94,p)), ts:(r&&r.ts)||0}); }); out.sort((x,y)=>y.ts-x.ts); return out; }

