/* ═══════════════════════════════════════════════════════════
   Quest Map 12슬롯
   ═══════════════════════════════════════════════════════════ */
function _chalBookState(bookId){
  // 장면 챌린지 진행 상태: done(소감 제출) / progress(퀴즈 일부) / none
  try{
    const sv = _chalRead(bookId);
    if(!sv) return 'none';
    if(sv.submitted || sv.mp_done) return 'done';   // mp_done = 미션 패널 챌린지 완주(8/18)
    if(sv.ans && Object.keys(sv.ans).length) return 'progress';
  }catch(e){}
  return 'none';
}
function _chalBookScore(bookId){
  // 책별 획득 점수: 정답 ×10 + 소감 제출 50. 미응시면 null.
  try{
    const sv = _chalRead(bookId);
    if(!sv) return null;
    const arr = Object.values(sv.ans||{});
    const ok = arr.filter(a=>a.ok).length;
    // 문항수: 장면 챌린지(하드코딩 3권)는 CHALLENGE_SCENES, DB 퀴즈(미션 패널) 책은 quiz_total(8/18 — 없으면 '0/0'으로 보이던 버그)
    const total = (typeof CHALLENGE_SCENES!=='undefined' && CHALLENGE_SCENES[bookId])
      ? CHALLENGE_SCENES[bookId].scenes.reduce((s,x)=>s+x.quiz.length,0) : (sv.quiz_total||arr.length||0);
    if(!arr.length && !sv.submitted && !sv.mp_done) return null;   // 시도 기록이 없으면 '아직 시작 안 함'(빈 0/0 대신)
    return {answered:arr.length, ok, total, pts: ok*10 + (sv.submitted?50:0), submitted:!!(sv.submitted||sv.mp_done)};
  }catch(e){ return null; }
}
function _matchBookByTitle(t){
  const norm = s => (s||'').replace(/\s+/g,'').toLowerCase();
  const n = norm(t);
  const hit = BOOKS.find(b => norm(b.title) === n);
  if(hit) return hit;
  // 한글 제목 매핑(해외 고전): "데미안" → gb-74222 등
  if(typeof CLASSICS_KO !== 'undefined'){
    for(const [id, ko] of Object.entries(CLASSICS_KO)){
      if(norm(ko) === n){
        const b = BOOKS.find(x => x.id === id);
        if(b) return b;
      }
    }
  }
  return null;
}
function _questIsExpired(c){ return c.to && (new Date(c.to + 'T23:59:59') < new Date()); }
function _questSlot(ci, bi, x, expired){
  const cls = x.st==='done' ? 'completed' : 'available';
  const icon = x.book ? '📘' : '🏛️';
  const shortT = t => (t||'').split(/[:=\/]/)[0].trim() || t;
  const pill = x.st==='done'
    ? `<span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:99px;background:var(--gold,#b8860b);color:#fff;">완료 ✓</span>`
    : x.st==='progress'
    ? `<span style="font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--primary);color:#fff;">진행 중</span>`
    : x.book
    ? `<span style="font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid var(--primary);color:var(--primary);">시작하기</span>`
    : `<span style="font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid var(--primary);color:var(--primary);">글쓰기</span>`;   // 8/21: 소장자료 책은 누르면 글쓰기 메뉴(소감·질문·서평·독후감 중 미션에 켜진 것)
  const coverHtml = x.cover
    ? `<img src="${esc(x.cover)}" loading="lazy" style="width:62px;height:90px;object-fit:cover;border-radius:6px;box-shadow:0 5px 14px rgba(0,0,0,.22);">`
    : `<div style="width:62px;height:90px;border-radius:6px;background:rgba(120,120,140,.12);display:flex;align-items:center;justify-content:center;font-size:26px;">${icon}</div>`;
  const pct = x.pct||0;
  const scoreLine = !x.book
    ? (x.wr&&x.wr.total ? `<div class="qs-quiz" style="font-size:11.5px">${x.wr.list.map(w=>`<span style="${w.done?'color:var(--primary);font-weight:700':'color:var(--text-light)'}">${w.done?'✓':'○'} ${esc(w.t)}</span>`).join(' · ')}</div>` : `<div class="qs-empty">아직 시작 안 함</div>`)
    : (!(pct>0) && !x.sco)
    ? `<div class="qs-empty">아직 시작 안 함</div>`
    : `<div class="qs-stats">
         <div class="qs-bar-row"><span class="qs-k">읽기</span><div class="qs-bar"><div class="qs-bar-fill" style="width:${pct}%"></div></div><span class="qs-v">${pct}%</span></div>
         <div class="qs-quiz">${x.sco?`퀴즈 ${x.sco.ok}/${x.sco.total} · ${x.sco.pts}점`:'퀴즈 전'}</div>
       </div>`;
  return `<div class="quest-slot ${cls}" onclick="onJoinedSlot(${ci},${bi})" title="${esc(x.t)}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 10px 14px;${expired?'opacity:.7;':''}">
    ${coverHtml}
    <div class="quest-slot-book" style="font-weight:700;line-height:1.35;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(shortT(x.t))}</div>
    ${pill}
    ${scoreLine}
  </div>`;
}
function _questGroup(c, ci){
  const expired = _questIsExpired(c);
  const mm = appChalMission(c);
  const writeMis = CH_MISSIONS.filter(x=>x.kind==='write'&&mm[x.k]);
  const mine = (typeof _wrMine!=='undefined'&&Array.isArray(_wrMine))?_wrMine:[];
  const items = (c.books||[]).map(b=>{
    const m = _matchBookByTitle(b.t);
    if(m) return { t:b.t, cover:b.cover, book:m, st:_chalBookState(m.id), sco:_chalBookScore(m.id), pct:((_chalRead(m.id)||{}).read_pct||0) };
    // 도서관 소장 책(고전 아님): 진행 = 이 책에 쓴 미션 글(bookstar_writings) 기준 — 8/21 '대출 후 완독 인증' 막다른 길 제거
    const key=String(b.isbn||b.id||'');
    const list=writeMis.map(x=>({k:x.k,t:x.t.replace(' 쓰기',''),done:mine.some(w=>String(w.book_id)===key&&w.is_public!==false&&(w.activity===x.k||(x.k==='oneline'&&w.activity==='impression')))}));   // 8/30 공개 글만 인정
    const doneN=list.filter(w=>w.done).length;
    const st=list.length&&doneN===list.length?'done':(doneN>0?'progress':'none');
    return { t:b.t, cover:b.cover, book:null, key, st, sco:null, pct:0, wr:{list,total:list.length,done:doneN} };
  });
  const doneCnt = items.filter(x=>x.st==='done').length;
  const sumPts = items.reduce((s,x)=>s+(x.sco?x.sco.pts:0), 0);
  const pctBar = items.length ? Math.round(doneCnt/items.length*100) : 0;
  const dday = expired ? `<span style="color:#c0392b;font-weight:700;">종료</span>` : `<span style="color:var(--gold);">${ddayText(c.to)||'상시'}</span>`;
  const quit = `<button class="qg-quit" onclick="chalQuit('${esc(String(c.id))}')">${expired?'내리기':'나가기'}</button>`;
  return `<div class="qg-block${expired?' past':''}">
    <div class="qg-head">
      <div class="qg-title">${esc(c.title)}</div>
      <div class="qg-meta">${items.length}권 중 <b>${doneCnt}</b> 완료 · 획득 <b style="color:var(--gold,#b8860b);">${sumPts}점</b> · ${dday} ${quit}</div>
    </div>
    <div class="qg-bar"><div class="qg-bar-fill" style="width:${pctBar}%"></div></div>
    <div class="quest-grid quest-grid-wide">${items.map((x,bi)=>_questSlot(ci,bi,x,expired)).join('')}</div>
    ${expired
      ? `<div class="qg-note">기간이 끝난 챌린지예요 — 완료 ${doneCnt}/${items.length}권. 퀴즈·소감·점수는 그대로 보관돼요. <b>내리기</b>를 누르면 정리됩니다.</div>`
      : `<div class="qg-note">미션: ${esc(chalMissionPlain(c.mission))}</div>`}
  </div>`;
}
// 사서가 삭제한(=DB에 더 없는) 챌린지를 학생 내서재에서 자동 정리
async function pruneDeadChals(){
  try{
    const r=await fetch(`${SB_REST}/library_programs?select=id`,{headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    // 8/9: 0건도 유효한 진실로 취급 — 데모 챌린지 3개를 전부 삭제하면서 필요해졌다.
    // (통신 실패는 !r.ok/비배열에서 걸러진다. 200+빈배열 = 정말 챌린지가 없는 상태)
    if(!r.ok) return false; const rows=await r.json(); if(!Array.isArray(rows)) return false;
    const live=new Set(rows.map(x=>String(x.id)));
    const arr=joinedChals(); const kept=arr.filter(c=>live.has(String(c.id)));
    if(kept.length!==arr.length){ _saveJoinedChals(kept); return true; }
  }catch(e){}
  return false;
}
let _qmPruned=false;
function renderQuestMap(){
  const body = document.getElementById('questMapBody');
  if(!body) return;
  if(!_qmPruned){ _qmPruned=true; pruneDeadChals().then(changed=>{ if(changed){ try{ renderQuestMap(); }catch(e){} } }); }
  // 8/30: 기간이 끝났고 완료(enroll done)한 챌린지는 '완료한 챌린지'로 옮겨졌으므로 여기선 뺀다
  const chals = joinedChals().filter(c=>!(typeof _cgDoneChalIds!=='undefined' && _cgDoneChalIds.has(String(c.id)) && _questIsExpired(c)));
  if(!chals.length){
    body.innerHTML = `<div class="qg-empty">아직 참여 중인 챌린지가 없어요.<br><b style="color:var(--primary);">독서 챌린지</b> 메뉴에서 참여하면 여기에 책들이 들어와요.</div>`;
    return;
  }
  const active = [], past = [];
  chals.forEach((c,ci)=>{ (_questIsExpired(c)?past:active).push({c,ci}); });
  let html = active.map(o=>_questGroup(o.c, o.ci)).join('');
  if(past.length){
    html += `<div class="qg-section">지난 챌린지</div>` + past.map(o=>_questGroup(o.c, o.ci)).join('');
  }
  body.innerHTML = html;
}
function onJoinedSlot(ci, bi){
  const c = joinedChals()[ci]; if(!c) return;
  const b = (c.books||[])[bi]; if(!b) return;
  const m = _matchBookByTitle(b.t);
  if(!m){   // 8/21: 소장자료 책 → 글쓰기 메뉴(챌린지 미션에 켜진 글 종류만, 제출 시 별)
    const mm=appChalMission(c); const only=CH_MISSIONS.filter(x=>x.kind==='write'&&mm[x.k]).map(x=>x.k);
    const key=String(b.isbn||b.id||'');
    const book={id:key, title:cleanT(b.t||''), author:b.a||'', coverSrc:b.cover||'', isbn:b.isbn||'', kind:'', last:''};
    mbMenu(key,{chId:String(c.id), only, book}); return;
  }
  if(_chalBookState(m.id)==='done'){
    if(!confirm(`‘${b.t}’은(는) 이미 완료했어요.\n다시 열어 볼까요?`)) return;
  }
  openViewer(m.id, 'challenge');
}


