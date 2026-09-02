/* ═══ 플로팅 AI 사서 챗봇 (hwc 네임스페이스) — chat Edge Function 대화 맥락 ═══ */
(function(){
  const FUNC="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/chat";
  const BRAIN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/library-brain";  // 의도 라우팅(운영정보=KB로 바로 답 / 책=추천)
  const ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
  const GREET="안녕하세요, 별이예요. 🌙\n오늘은 어떤 책을 찾으세요? 기분이나 상황만 편하게 말씀해 주시면 딱 맞는 책을 골라드릴게요.";
  const CHIPS=["요즘 지쳐서 위로되는 책","가볍게 머리 식힐 소설","우주·과학이 궁금해","밤에 오싹한 이야기","돈·재테크 입문"];
  const f5=r=>r==null?'':(Math.round(r/2*10)/10).toFixed(1);
  let msgs=[], busy=false, opened=false, lastQ='';
  let shownKeys=new Set(), lastTopic='', lastRaw='';   // 통합검색 전환: 이미 보여준 책(isbn) + 마지막 검색 주제 + 학생이 친 말 그대로
  const SBR="https://gkujptyfrzqrjrvovbnc.supabase.co/rest/v1/semyung_tulip";   // P3: semyung_books → semyung_tulip (현재 미사용 상수)
  const el=id=>document.getElementById(id);
  const _core=t=>(t||'').split(/[\(\[:·\-]/)[0].trim();
  const _norm=t=>(t||'').replace(/\s+/g,'').toLowerCase();
  const scroll=()=>{const b=el('hwcBody');b.scrollTop=b.scrollHeight;};

  function addRow(role,html){const r=document.createElement('div');r.className='hwc-row '+(role==='user'?'user':'bot');r.innerHTML=`<div class="hwc-msg">${html}</div>`;el('hwcBody').appendChild(r);scroll();}
  function addUser(t){addRow('user',esc(t));}
  function addBot(t){addRow('bot',esc(t));}
  // 운영정보 답변: 요약 텍스트 + (있으면)도서관 링크 버튼 + 빠른답변 칩
  function addBotRich(text, link, label, chips){
    let h=mdLite(text);
    if(link && /^https?:\/\/lib\.semyung\.ac\.kr\//.test(link)){
      h+=`<a href="${esc(link)}" target="_blank" rel="noopener" style="display:block;width:fit-content;margin-top:11px;padding:8px 13px;border-radius:9px;background:var(--gold,#d4a017);color:#1a1a2e;font-weight:700;font-size:12.5px;text-decoration:none">📄 ${esc(label||'자세히 보기')}</a>`;
    }
    addRow('bot',h);
    if(Array.isArray(chips) && chips.length){
      const cr=document.createElement('div');cr.className='hwc-chips';
      // LLM 생성 칩에 홑따옴표(')가 있으면 홑따옴표 속성이 조기 종료되던 것 → 메인 챗(aicShowChips)과 동일한 쌍따옴표+&quot; 패턴
      cr.innerHTML=chips.slice(0,4).map(c=>`<span class="hwc-chip" onclick="hwcChip(${JSON.stringify(String(c)).replace(/"/g,'&quot;')})">${esc(c)}</span>`).join('');
      el('hwcBody').appendChild(cr);scroll();
    }
  }

  // 추천 카드 렌더(통합검색 전환) — 메인 별이와 동일하게 libDetail(isbn) 상세 연결 + 형태 배지 + 바로읽기 힌트
  function hwcCandCard(b){
    if(b._kind==='classic') return usClassicCardHTML(b).replace('class="book-card bc-book"','class="hwc-card bc-book"');   // 고전은 같은 카드(openDetail)
    const isbn=String(b.isbn||'').replace(/'/g,'');
    // 추천 v2(8/18): 서버 재고 판정 반영 — 대출 중이면 '바로 읽기' 힌트 대신 예약 안내
    const read=b.smEbook?(b._avail===false?'<div class="hwc-read" style="color:#dc2626">대출 중 · 예약하기</div>':`<div class="hwc-read">${b._avail===true?'지금 바로 읽기':'바로 읽기'}</div>`):'';
    const meta=[b.author, b.publisher, (b.year||b.pubYear)].filter(Boolean).join(' · ');
    const loan=b.loan?`<span class="hwc-loan">대출 <b>${Number(b.loan).toLocaleString()}</b></span>`:'';
    return `<div class="hwc-card ${(b._material==='thesis'||b._material==='serial')?'bc-paper':'bc-book'}" onclick="byeoliClickLog(US_CLICKMAP['${esc(isbn)}']);libDetail('${esc(isbn)}')">
      <div class="hwc-cv">${b.cover?`<img src="${esc(hiCover(b.cover))}" loading="lazy" decoding="async" data-t="${esc(cleanT(b.title||''))}" data-a="${esc(String(b.author||''))}" onerror="ncSwap(this)">`:ncCover(b)}</div>
      <div class="hwc-ci"><h4>${escD(b.title)}</h4><div class="au">${escD(meta)}</div>
      <div style="margin-top:5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap">${usFormBadges(b)}${loan}</div>${read}</div></div>`;
  }
  // 새 결과 중 이미 보여준 책(isbn) 제외하고 카드 추가 → 추가 개수 반환
  // Answer Engine 답변 행(플로팅) — 인용 [n]·근거 칩 클릭 시 libDetail 상세 모달
  function hwcAnswerRow(answer){
    if(!answer||!answer.used||!answer.text) return;
    // 번호 인용·칩 폐지(가독성) — 주제 요약 문단만. 책 목록은 아래 카드가 담당.
    const html=esc(answer.text).replace(/\s*\[\d+\]/g,'');
    const row=document.createElement('div'); row.className='hwc-row bot';
    row.innerHTML=`<div class="usc-answer" style="max-width:100%"><div class="usc-answer-h">별이의 답</div><div class="usc-answer-t">${html}</div></div>`;
    el('hwcBody').appendChild(row);
  }
  function hwcAddBooks(results, subtitle, answer){
    const fresh=(results||[]).filter(b=>b&&b.isbn&&!shownKeys.has(b.isbn));
    if(!fresh.length) return 0;
    fresh.forEach(b=>shownKeys.add(b.isbn));
    hwcAnswerRow(answer);
    addBot('우리 도서관에서 골라봤어요 ⭐'+(subtitle?' '+subtitle:''));
    const wrap=document.createElement('div');wrap.className='hwc-row bot';
    wrap.innerHTML=`<div class="hwc-cards">${fresh.map(hwcCandCard).join('')}</div>`;
    el('hwcBody').appendChild(wrap);
    followRow();
    // 한 권씩 '톡, 톡' 나타나며 그때마다 따라 스크롤(틴더식 — 별이가 골라주는 느낌). 즉시 scroll() 생략.
    byeoliStagger(wrap.querySelector('.hwc-cards'), ()=>scroll());
    return fresh.length;
  }
  // 후속 칩 — 같은 주제 재검색(이미 본 책 자동 제외) 또는 톤/분야 변형
  const FOLLOWS=[
    {label:'🔄 다른 책', mod:''},
    {label:'더 가볍게', mod:' 가볍고 부담 없이 읽히는 책'},
    {label:'분야 바꿔서', mod:' 다른 분야의 책'}];
  function followRow(){
    document.querySelectorAll('.hwc-follow').forEach(x=>x.remove());
    const r=document.createElement('div');r.className='hwc-chips hwc-follow';
    r.innerHTML=FOLLOWS.map((f,i)=>`<span class="hwc-chip" onclick="hwcFollow(${i})">${esc(f.label)}</span>`).join('');
    el('hwcBody').appendChild(r);
  }
  window.hwcFollow=async function(i){
    const f=FOLLOWS[i]; if(!f||busy)return;
    document.querySelectorAll('.hwc-follow').forEach(x=>x.remove());
    busy=true; el('hwcSend').disabled=true;
    addUser(f.label.replace('🔄 ','')); typing(true);
    try{
      const fr=await byeoliFindBooks((lastTopic+f.mod).trim(), 'float', false, (lastRaw+f.mod).trim()); typing(false);   // 팔로업=answer 생략(렌더 안 함)
      if(fr.offtopic){ addBot(fr.message||'다른 주제로 찾아볼까요?'); }
      else { const n=hwcAddBooks(fr.results); if(!n) addBot(fr.error ? '연결이 잠깐 불안정했어요. 잠시 후 다시 시도해 주세요.' : '이 주제로는 더 보여드릴 책이 없네요. 다른 걸로 찾아볼까요?'); }
    }catch(e){ typing(false); addBot('잠깐 문제가 생겼어요. 다시 시도해 주세요.'); }
    busy=false; el('hwcSend').disabled=false; el('hwcInput').focus();
  };
  function chipsRow(){
    const r=document.createElement('div');r.className='hwc-chips';r.id='hwcChips';
    r.innerHTML=CHIPS.map(c=>`<span class="hwc-chip" onclick="hwcChip('${c.replace(/'/g,"\\'")}')">${esc(c)}</span>`).join('');
    el('hwcBody').appendChild(r);
  }
  function typing(on){
    let t=el('hwcTyping');
    if(on){ if(t)return; t=document.createElement('div');t.id='hwcTyping';t.className='hwc-row bot';
      t.innerHTML='<div class="hwc-msg hwc-typing"><i></i><i></i><i></i></div>';el('hwcBody').appendChild(t);scroll(); }
    else if(t) t.remove();
  }

  window.hwcToggle=function(){
    opened=!opened;
    el('hwcPanel').classList.toggle('on',opened);
    el('hwcBubble').classList.toggle('hide',opened);
    if(opened){ if(!el('hwcBody').children.length){ addBot(GREET); chipsRow(); }
      // 8/14: 모바일은 자동 포커스 금지 — 키보드가 바로 올라와 인사말·칩이 가려지던 문제(전체화면과 세트)
      if(window.innerWidth>900) setTimeout(()=>el('hwcInput').focus(),60); }
  };
  window.hwcGrow=function(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,96)+'px';};
  window.hwcKey=function(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();hwcSend();} };
  window.hwcChip=function(t){ const c=el('hwcChips'); if(c)c.remove(); doSend(t); };
  window.hwcSend=function(){ const i=el('hwcInput'); const t=i.value.trim(); if(!t)return; i.value=''; hwcGrow(i); const c=el('hwcChips'); if(c)c.remove(); doSend(t); };

  async function doSend(text,shown){
    if(busy)return; busy=true; el('hwcSend').disabled=true; lastQ=text;
    document.querySelectorAll('.hwc-follow').forEach(x=>x.remove());   // 직접 입력 시에도 후속 칩 정리
    addUser(shown||text); msgs.push({role:'user',content:text}); typing(true);
    if(msgs.length>24){ msgs=msgs.slice(-24); while(msgs.length && msgs[0].role!=='user') msgs.shift(); }   // 히스토리 상한(user 턴 시작 보장) — 무제한 누적 시 매 턴 전체 전송(토큰·지연 증가) 방지
    try{
      let refined='', brainReply='';
      // 1) 별이 두뇌: 의도 라우팅. 운영정보(info)·잡담(other)·모호한 책요청 → KB로 바로 답(추천 호출 안 함).
      try{
        const br=await fetch(BRAIN,{method:'POST',headers:{'Authorization':'Bearer '+ANON,'apikey':ANON,'content-type':'application/json'},body:JSON.stringify({messages:msgs})});
        const bd=await br.json();
        if(bd && bd.intent && !(bd.intent==='books' && bd.ready!==false)){
          typing(false);
          const reply=bd.reply||'무엇을 도와드릴까요?';
          addBotRich(reply, bd.link, bd.linkLabel, bd.chips);
          msgs.push({role:'assistant',content:reply});
          byeoliLog({surface:'float',query:text,intent:bd.intent||'',ready:bd.ready,refined_topic:bd.refinedTopic||'',kb_link:bd.link||''});
          busy=false; el('hwcSend').disabled=false; el('hwcInput').focus();
          return;
        }
        if(bd && bd.refinedTopic) refined=bd.refinedTopic;   // 두뇌가 다듬은 검색 주제
        if(bd && bd.reply) brainReply=bd.reply;               // 책 확인 한마디(아래에서 assistant 턴으로 기록)
      }catch(e){ /* 두뇌 실패 → 원문 질의로 검색 */ }
      // 2) 책 추천 — 메인 별이와 동일 엔진(세명대 실소장 11만: curate 전자책 + semyung-find 종이/논문)
      lastTopic = byeoliTopicOf(refined, text);   // 두뇌가 덧붙이기만 했으면 학생 말 그대로(제목 검색 보호)
      lastRaw = text;   // 학생이 친 말 그대로 — 다듬은 주제로 못 찾을 때 이 말로 다시 찾는다
      const fr = await byeoliFindBooks(lastTopic, 'float', true, text);
      typing(false);
      // ⚠️책 추천도 assistant 턴으로 이력에 남긴다 — 안 남기면 user 메시지가 연속 누적되어
      //   Anthropic API가 한 덩어리로 합쳐 직전 책맥락이 다음 운영질문("운영시간?")을 books로 오분류시킨다(메인 챗은 8359에서 이미 기록).
      msgs.push({role:'assistant', content: brainReply || '책을 찾아드렸어요.'});
      if(fr.offtopic){ addBot(fr.message||'책 주제를 조금 더 구체적으로 말씀해 주세요.'); }
      else { const n=hwcAddBooks(fr.results, fr.subtitle, fr.answer); if(!n) addBot(fr.error ? '연결이 잠깐 불안정했어요. 잠시 후 다시 시도해 주세요.' : '아쉽지만 우리 도서관에서 딱 맞는 책을 못 찾았어요. 조금 다르게 말해볼까요?'); }
    }catch(e){ typing(false); addBot('잠깐 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'); }
    busy=false; el('hwcSend').disabled=false; el('hwcInput').focus();
  }

})();

