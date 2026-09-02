/* ===== 인라인 'AI로 큐레이션 만들기' (소장도서) — 책담기 팝업과 별개의 두 번째 방법 ===== */
let AIC_RESULTS=[], AIC_PICKED=new Set(), AIC_COUNT=20, AIC_MSGS=[], AIC_TOPIC='', AIC_BUSY=false, AIC_DT_I=-1;
const AIC_GREETING="어떤 책이 필요하세요? 🙂\n주제·분위기·대상을 편하게 말씀해 주세요. 제가 의도를 파악해서 우리 도서관 소장도서로 골라드릴게요.";
const AIC_QUICK=["위로가 필요한 학생","새 학기 새로운 시작","진로·취업 고민","사랑을 다룬 이야기","과학으로 보는 세상"];
/* 8/14 사장님 수정요청: AI 큐레이션을 세계고전·한국고전·독서챌린지에서도 — 카드 하나를 페이지 간 옮겨 쓰고 문맥만 바꾼다 */
let AIC_CTX='lib';   // lib(우리도서관) | foreign(세계고전) | kr(한국고전) | chal(독서챌린지)
function aicSetContext(ctx){
  // 문맥이 바뀌면 이전 영역의 결과·대화를 비운다 — 세계고전 결과를 들고 한국고전에 담는 오염 방지
  if(AIC_CTX!==ctx){
    try{
      AIC_RESULTS=[]; AIC_PICKED=new Set(); AIC_MSGS=[]; AIC_TOPIC='';
      const r=el('aicResult'); if(r)r.classList.remove('show');
      const t=el('aicTopic'); if(t)t.value='';
      const th=el('aicThread'); if(th)th.innerHTML='';
      const q=el('aicQchips'); if(q)q.innerHTML='';
      const c=el('aiCurCard'); if(c)c.setAttribute('data-open','0');
      const ch=el('aicChevron'); if(ch)ch.textContent='열기 ▾';
    }catch(e){}
  }
  AIC_CTX=ctx;
  const sub=document.querySelector('#aiCurCard .aic-bar-t span');
  const addBtn=document.querySelector('#aiCurCard .aic-addbtn');
  // 9/1 사장님 요청: 독서 챌린지 화면에서는 만드는 것이 큐레이션이 아니라 챌린지 — 바 제목까지 그 화면 말로 바꾼다.
  const barT=document.querySelector('#aiCurCard .aic-bar-t b');
  const txt={
    lib:['주제만 적으면 우리 도서관 소장도서로 한 칸을 뚝딱 만들어 드려요','이 큐레이션을 칸으로 추가 →','AI로 큐레이션 만들기'],
    foreign:['주제만 적으면 북스타 해외 고전에서 골라 한 칸을 뚝딱 만들어 드려요','이 큐레이션을 칸으로 추가 →','AI로 큐레이션 만들기'],
    kr:['주제만 적으면 북스타 한국 고전에서 골라 한 칸을 뚝딱 만들어 드려요','이 큐레이션을 칸으로 추가 →','AI로 큐레이션 만들기'],
    chal:['주제만 적으면 소장도서로 챌린지 초안을 뚝딱 만들어 드려요','이 큐레이션으로 챌린지 추가 →','AI로 챌린지 만들기']
  }[ctx]||[];
  if(sub&&txt[0]) sub.textContent=txt[0];
  if(addBtn&&txt[1]) addBtn.textContent=txt[1];
  if(barT&&txt[2]) barT.textContent=txt[2];
  const fr=el('aicFmtRow'); if(fr) fr.style.display=(ctx==='foreign'||ctx==='kr')?'none':'';   // 고전 풀은 형태 개념 없음
}
// 8/19 책 형태(both|ebook|paper) — AI 큐레이션·책담기 통합검색이 같은 값을 공유(사서가 한 번 고르면 유지)
let CUR_FORMAT='both';
function aicFormat(b,f){ const changed=CUR_FORMAT!==f; CUR_FORMAT=f; document.querySelectorAll('#aicFmtSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); secSyncFormat();
  // 8/29: 결과가 이미 떠 있으면 형태를 바꾼 즉시 다시 만든다(형태가 바뀌면 후보 자체가 달라져 재검색이 필요 — AI 생성 1회 소모).
  //   예전엔 값만 기억하고 아무것도 안 해서 "작동 안 함"으로 보였다. 고전 영역은 형태 개념이 없어 제외.
  const shown=el('aicResult')&&el('aicResult').classList.contains('show');
  if(changed&&shown&&AIC_TOPIC&&!(AIC_CTX==='foreign'||AIC_CTX==='kr')&&!AIC_BUSY){ aicPush('me',FMT_LABEL[f]+'으로'); aicRunGenerate(AIC_TOPIC,true); } }
function secFormat(b,f){ CUR_FORMAT=f; document.querySelectorAll('#secFmtSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  document.querySelectorAll('#aicFmtSeg button').forEach(x=>x.classList.toggle('on',x.getAttribute('onclick').indexOf("'"+f+"'")>=0));
  if(scTab==='nat'){ if((el('secQ').value||'').trim()) secSearch(); else if(!SCAND.length) secApplyTab(); } }   // 검색어 있으면 바로 재검색, 없으면 안내문만 형태에 맞게
function secSyncFormat(){ document.querySelectorAll('#secFmtSeg button').forEach(x=>x.classList.toggle('on',x.getAttribute('onclick').indexOf("'"+CUR_FORMAT+"'")>=0)); }
const FMT_LABEL={both:'종이책 + 전자책',ebook:'전자책만',paper:'종이책만'};
function aicMount(host){ const c=el('aiCurCard'); if(c&&host&&c.parentNode!==host) host.prepend(c);
  // 8/29 리뷰 B5: 후보 책 상세 팝업이 꾸미기 화면 안에 있어 독서 챌린지 화면에선 숨겨진 부모 아래라 안 열렸다 → body 직속으로 한 번 옮긴다(position:fixed라 자리 무관)
  const d=el('aicDetail'); if(d&&d.parentNode!==document.body) document.body.appendChild(d); }
function aicClassicPool(){   // 현재 문맥(해외/국내)의 고전 후보 풀 — curate pool 모드로 보낸다
  const foreign=AIC_CTX==='foreign';
  return CLASSICS_POOL.filter(b=>foreign?b.origin==='foreign':b.origin!=='foreign')
    .map(b=>({id:b.id,title:b.title_ko||b.title,author:b.author||'',cover:CLS_COVER[b.id]||''}));
}
function aicToggle(){ const c=el('aiCurCard'); if(!c)return; const open=c.getAttribute('data-open')==='1';
  c.setAttribute('data-open',open?'0':'1'); const ch=el('aicChevron'); if(ch)ch.textContent=open?'열기 ▾':'닫기 ▴';
  if(!open){ if(!AIC_MSGS.length) aicReset(); setTimeout(()=>{const t=el('aicTopic'); if(t)t.focus();},80); } }
function aicReset(){ AIC_MSGS=[]; AIC_RESULTS=[]; AIC_PICKED=new Set(); AIC_TOPIC='';
  const th=el('aicThread'); if(th)th.innerHTML=''; const r=el('aicResult'); if(r)r.classList.remove('show');
  aicPush('ai',AIC_GREETING); aicShowChips(AIC_QUICK); }
function aicPush(who,text){ const th=el('aicThread'); if(!th)return null;
  const d=document.createElement('div'); d.className='aic-msg '+(who==='me'?'me':(who==='typing'?'ai typing':'ai')); d.textContent=text;
  th.appendChild(d); th.scrollTop=th.scrollHeight;
  if(who==='me') AIC_MSGS.push({role:'user',content:text}); else if(who==='ai') AIC_MSGS.push({role:'assistant',content:text});
  return d; }
function aicShowChips(chips){ const q=el('aicQchips'); if(!q)return; q.innerHTML='';
  (chips||[]).forEach(c=>{ const b=document.createElement('button'); b.type='button'; b.textContent=c; b.onclick=()=>aicSend(c); q.appendChild(b); }); }
async function aicSend(forced){
  if(AIC_BUSY) return;
  const inp=el('aicTopic'); const text=(forced!=null?String(forced):(inp.value||'')).trim(); if(!text) return;
  // 8/29 사장님 수정요청 "전부다": AI가 장르를 되물었을 때 "전부다"를 고르면 되묻기 없이 직전 주제로 바로 만든다(장르 안 가림).
  if(/^전부\s*다/.test(text)){
    const prev=[...AIC_MSGS].reverse().find(m=>m.role==='user');
    if(prev){ if(inp) inp.value=''; aicShowChips([]); aicPush('me',text); aicPush('ai','좋아요, 장르를 가리지 않고 골라볼게요 ✨'); aicRunGenerate(prev.content,false); return; }
  }
  if(inp) inp.value=''; aicShowChips([]); aicPush('me',text);
  AIC_BUSY=true; const sb=el('aicSendBtn'); if(sb)sb.disabled=true;
  const typing=aicPush('typing','⭐ 생각 중…');
  let j=null; try{
    const r=await sbFnPost(US_CURATE_FN, {chat:true, query:text, messages:AIC_MSGS.slice(-6)}, {anon:true});
    j=await r.json();
  }catch(e){}
  if(typing)typing.remove();
  AIC_BUSY=false; if(sb)sb.disabled=false;
  if(!j){ aicPush('ai','잠시 문제가 생겼어요. 다시 말씀해 주세요.'); return; }
  if(j.offtopic){ aicPush('ai', j.reply||'책 주제를 알려주세요 📚'); return; }
  aicPush('ai', j.reply||'좋아요, 골라볼게요 ✨');
  if(j.ready!==false){ AIC_TOPIC=j.refinedTopic||text; aicRunGenerate(AIC_TOPIC,false); }
  else { aicShowChips([...(j.chips||[]),'전부다 (장르 안 가림)']); }   // 8/29: AI가 무엇을 묻든 "전부다"는 항상 붙는다(AI가 만드는 칩이라 있다 없다 했음)
}
// 결과 후 조정 — chat 경유 없이 직전 주제를 방향만 바꿔 즉시 재생성(안정적·빠름)
function aicAdjust(kind){
  if(!AIC_TOPIC){ return; }
  const mod={light:' — 더 가볍고 부담 없이 읽히는 책으로', deep:' — 더 깊이 있고 묵직한 책으로'}[kind];
  if(kind==='other'){ aicPush('ai','어떤 분야·방향으로 바꿔볼까요? 편하게 말씀해 주세요.'); const t=el('aicTopic'); if(t)t.focus(); return; }
  if(kind==='ok'){ aicShowChips([]); aicPush('me','이대로 좋아요'); aicPush('ai','좋아요! 아래에서 제목·책을 마지막으로 다듬고 "이 큐레이션을 칸으로 추가"를 눌러주세요 👇'); return; }
  aicPush('me', kind==='light'?'더 가볍게':'더 깊이 있게');
  aicRunGenerate(AIC_TOPIC+mod, true);
}
function aicCount(b,n){ document.querySelectorAll('#aicSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); AIC_COUNT=n;
  // 8/29: 결과가 떠 있으면 담는 권수를 그 자리에서 다시 자른다(AI 호출 없음 = 즉시·공짜). 예전엔 배지 숫자만 바뀌고 후보엔 반영 안 됐다.
  if(AIC_RESULTS.length){ aicRepick(); aicRenderHint(); aicBuildGrid(); } else aicUpdateCount(); }
// 후보(AIC_RESULTS)에서 담을 책을 고른다 — 관련도 강한(rel≥2) 것부터 AIC_COUNT권. 강한 게 없으면 전체에서.
function aicRepick(){
  const strongIdx=AIC_RESULTS.map((b,i)=>i).filter(i=>AIC_RESULTS[i].rel===undefined||AIC_RESULTS[i].rel>=2);
  const baseIdx=strongIdx.length?strongIdx:AIC_RESULTS.map((_,i)=>i);
  AIC_PICKED=new Set(baseIdx.slice(0,AIC_COUNT||8));
  aicUpdateCount(); }
// 결과 위 안내문("후보 N권 중 M권을 담아뒀어요…") — 생성 직후와 권수 버튼 양쪽에서 같은 글을 쓴다
function aicRenderHint(){
  const h=el('aicHint'); if(!h) return;
  const clsMode=(AIC_CTX==='foreign'||AIC_CTX==='kr');
  const weakN=AIC_RESULTS.filter(b=>b.rel===1).length;
  h.innerHTML=`후보 <b>${AIC_RESULTS.length}권</b> 중 주제에 맞는 <b>${AIC_PICKED.size}권</b>을 담아뒀어요${weakN?`, <span style="color:#b45309">⚠ 관련 낮은 ${weakN}권</span>은 빼뒀어요(확인 후 담기)`:''}.<br>📖 <b>책을 누르면</b> ${clsMode?'작가·시대 정보를':'줄거리·작가·소장형태(전자/종이/구독)를'} 보고 담을 수 있어요. (오른쪽 ✓로 바로 담기/빼기, 모두 <b>${clsMode?'북스타 고전 — 바로 읽기 연결':(CUR_FORMAT==='ebook'?'우리 도서관 전자책 — 바로 읽기 연결':CUR_FORMAT==='paper'?'우리 도서관 종이책':'우리 도서관 소장')}</b>)`; }
function aicUpdateCount(){ const c=el('aicCnt'); if(c)c.textContent=AIC_PICKED.size+'권'; }
function aicBuildGrid(){
  const g=el('aicGrid'); if(!g)return;
  g.innerHTML=AIC_RESULTS.map((b,i)=>{ const on=AIC_PICKED.has(i); const weak=(b.rel===1); const bd=[];
    if(b.rel===1)bd.push('<span class="kw-weak">⚠ 관련 낮음</span>');   // rel=1(약간만 관련) — 기본 제외, 확인 후 담기. rel=2(주제권)는 정상으로 취급
    if(b.smPaper)bd.push('<span class="kw-paper">종이</span>');
    if(b.smEbook)bd.push('<span class="kw-ebook">전자'+(b.smEbookProvider?'·'+esc(b.smEbookProvider):'')+'</span>');
    if(b.crema)bd.push('<span class="kw-sub">구독</span>');   // 크레마클럽(YES24 무제한구독) — curate가 표시 대상만 권당 확인
    if(b.loan)bd.push('<span class="kw-loan">🔥 전국 대출 '+Number(b.loan).toLocaleString()+'</span>');   // 국중(정보나루) 대출수 — 검증된 인기도서
    const cv=b.cover?`<img class="cv" src="${esc(b.cover)}" loading="lazy" onerror="this.style.visibility='hidden'">`:`<div class="cv" style="background:linear-gradient(135deg,#7b6ef2,#9b6ef0)"></div>`;
    return `<div class="aic-bk ${on?'on':''}${weak?' weak':''}" onclick="aicShowDetail(${i})" title="눌러서 줄거리·정보 보기"><span class="ck" onclick="event.stopPropagation();aicToggleBook(${i})" title="담기/빼기">✓</span>${cv}<div class="bi"><div class="bt">${esc(b.title)}</div><div class="ba">${esc(b.author||'')}</div><div class="bk-kw">${bd.join('')}</div></div></div>`;
  }).join('');
  aicUpdateCount();
}
function aicToggleBook(i){ if(AIC_PICKED.has(i))AIC_PICKED.delete(i); else AIC_PICKED.add(i); aicBuildGrid(); }
const AIC_CAP=500;   // 월 무료 한도(curate MONTHLY_CAP과 동일)
function aicSetUsage(n){ const u=el('aicUsage'); if(!u)return; n=Math.max(0,n|0);
  u.textContent=`이번 달 ${n}/${AIC_CAP}`;
  u.classList.toggle('full',n>=AIC_CAP); u.classList.toggle('warn',n>=AIC_CAP*0.9&&n<AIC_CAP); }
async function aicLoadUsage(){ const u=el('aicUsage'); if(!u)return;
  const ym=new Date().toISOString().slice(0,7);   // 서버 bumpAiUsage와 동일한 키(년-월)
  try{ const r=await sbGetAnon(`/ai_curation_usage?ym=eq.${ym}&select=count`);
    const a=await r.json(); aicSetUsage((Array.isArray(a)&&a[0])?(a[0].count||0):0);
  }catch(_){ u.textContent='이번 달 –/500'; } }
async function aicRunGenerate(topic,isRe){
  topic=(topic||AIC_TOPIC||'').trim(); if(!topic){ aicPush('ai','어떤 주제로 골라드릴까요?'); return; }
  AIC_TOPIC=topic; AIC_BUSY=true; const sb=el('aicSendBtn'); if(sb)sb.disabled=true; aicShowChips([]);
  // 8/14: 문맥별 후보 소스 — 고전 영역은 북스타 고전 풀에서만 고른다(curate pool 모드)
  const clsMode=(AIC_CTX==='foreign'||AIC_CTX==='kr');
  const srcName=AIC_CTX==='foreign'?'북스타 해외 고전':AIC_CTX==='kr'?'북스타 한국 고전':(CUR_FORMAT==='ebook'?'소장 전자책':CUR_FORMAT==='paper'?'소장 종이책':'소장도서');
  if(clsMode&&!CLASSICS_POOL.length){ loadClassicsPool(); aicPush('ai','고전 목록을 불러오는 중이에요 — 잠시 후 다시 눌러주세요.'); AIC_BUSY=false; if(sb)sb.disabled=false; return; }
  const steps=el('aicSteps'), result=el('aicResult');
  el('aicS1').querySelector('span:last-child').innerHTML=`${srcName}에서 <b>'${esc(topic)}' 후보</b>를 좁히는 중…`;
  steps.classList.add('show'); result.classList.remove('show');
  const ids=['aicS1','aicS2','aicS3']; ids.forEach(id=>el(id).classList.remove('done','active'));
  [0,700,1500].forEach((t,k)=>setTimeout(()=>{ ids.forEach(x=>el(x).classList.remove('active')); for(let m=0;m<k;m++)el(ids[m]).classList.add('done'); el(ids[k]).classList.add('active'); },t));
  const started=Date.now(); let j=null, err=null;
  try{
    const r=await sbFnPost(US_CURATE_FN, clsMode
        ? {query:topic, pool:aicClassicPool(), genTitle:true, titleModel:'sonnet', count:(AIC_COUNT||8)}
        : {query:topic, onlyHeld:true, genTitle:true, holdings:true, titleModel:'sonnet', rerank:true, count:(AIC_COUNT||8), format:CUR_FORMAT}, {anon:true});   // 8/19 책 형태 · 8/29 "+6" 제거(10권 고르면 후보 16권 나와 라벨과 안 맞았다)
    j=await r.json(); if(j&&j.error)err=j.error;
  }catch(e){ err=String(e); }
  await new Promise(s=>setTimeout(s,Math.max(0,1600-(Date.now()-started))));
  ids.forEach(x=>{el(x).classList.remove('active');el(x).classList.add('done');}); await new Promise(s=>setTimeout(s,320));
  steps.classList.remove('show'); ids.forEach(x=>el(x).classList.remove('done')); AIC_BUSY=false; if(sb)sb.disabled=false;
  if(j){ if(typeof j.monthCount==='number') aicSetUsage(j.monthCount); else aicLoadUsage(); }   // sonnet 호출은 검색 전 카운터 +1 — 성공·실패 무관 배지 갱신
  if(j&&j.limited){ aicPush('ai','🚫 '+(j.error||'이번 달 AI 큐레이션 생성 한도(500회)에 도달했어요')); return; }
  if(j&&j.offtopic){ aicPush('ai','📚 '+(j.message||'책 큐레이션 주제를 적어주세요')); return; }
  if(err||!j||!(j.candidates||[]).length){ aicPush('ai',`음… 그 주제로는 ${srcName}에서 책을 못 찾았어요. 조금 다르게 말씀해 주실래요?`); return; }
  AIC_RESULTS=j.candidates;
  // 기본 선택 = 관련도 강함(rel≥2)만 → 약한 매칭은 사서가 판단. (aicRepick·aicRenderHint — 권수 버튼과 같은 규칙, 8/29)
  aicRepick(); aicRenderHint();
  el('aicTitle').value=j.title||topic; el('aicSub').value=j.subtitle||'';
  aicBuildGrid(); result.classList.add('show'); result.scrollIntoView({behavior:'smooth',block:'nearest'});
  aicPush('ai',(isRe?'다시 골라봤어요!':'이렇게 골라봤어요!')+' 아래에서 확인하고, 더 다듬고 싶으면 눌러주세요.');
  aicShowChips2([{t:'더 가볍게',k:'light'},{t:'더 깊이 있게',k:'deep'},{t:'다른 분야로',k:'other'},{t:'이대로 좋아요 ✓',k:'ok'}]);
}
// 결과 후 조정 칩(직접 핸들러)
function aicShowChips2(items){ const q=el('aicQchips'); if(!q)return; q.innerHTML='';
  (items||[]).forEach(it=>{ const b=document.createElement('button'); b.type='button'; b.textContent=it.t; b.onclick=()=>aicAdjust(it.k); q.appendChild(b); }); }
// 후보 상세(줄거리·작가·형태) — 사서가 내용 모르는 책도 보고 담게. 줄거리는 클릭 시 lazy 조회(클릭한 책만).
function aicShowDetail(i){ const b=AIC_RESULTS[i]; if(!b)return; AIC_DT_I=i;
  const tags=[];
  if(b.cls)tags.push('<span class="kw-ebook">북스타 고전</span>');   // 8/14: 고전 후보 표식
  if(b.rel===1)tags.push('<span class="kw-weak">⚠ 관련 낮음</span>');
  if(b.smEbook)tags.push('<span class="kw-ebook">전자책</span>');
  if(b.smPaper)tags.push('<span class="kw-paper">종이책</span>');
  if(b.crema)tags.push('<span class="kw-sub">구독</span>');
  if(b.loan)tags.push('<span class="kw-loan">🔥 전국 대출 '+Number(b.loan).toLocaleString()+'</span>');
  const meta=[b.author,b.publisher,b.year].filter(Boolean).join(' · ');
  el('aicDtBody').innerHTML=`<div class="aic-dt-top">
      <div class="aic-dt-cv">${b.cover?`<img src="${esc(b.cover)}" onerror="this.parentNode.textContent='📕'">`:'📕'}</div>
      <div class="aic-dt-i"><h3>${esc(b.title||'')}</h3><div class="au">${esc(meta)}</div>
        <div class="aic-dt-tags">${tags.join('')||'<span class="kw-ebook">소장 도서</span>'}</div></div>
    </div>
    <p class="aic-dt-desc" id="aicDtDesc">줄거리를 불러오는 중…</p>`;
  aicDtSyncBtn(); el('aicDetail').classList.add('on'); aicLoadDescAdmin(b);
}
function aicDtSyncBtn(){ const on=AIC_PICKED.has(AIC_DT_I); const btn=el('aicDtToggle'); if(!btn)return;
  btn.textContent=on?'✓ 담김 — 빼기':'+ 이 책 담기'; btn.classList.toggle('on',on); }
function aicDetailToggle(){ if(AIC_DT_I<0)return; aicToggleBook(AIC_DT_I); aicDtSyncBtn(); }
function aicCloseDetail(){ const d=el('aicDetail'); if(d)d.classList.remove('on'); }
async function aicLoadDescAdmin(b){ const e=el('aicDtDesc'); if(!e)return;
  const brcd=b.brcd||(b.isbn||'').replace(/^sm-/,''); const isbn=(b.isbn||'').replace(/^sm-/,'');
  if(!brcd&&!isbn){ e.textContent='줄거리 정보가 아직 없어요.'; return; }
  try{
    const ors=[]; if(brcd)ors.push('barcode.eq.'+encodeURIComponent(brcd)); if(isbn&&isbn!==brcd)ors.push('isbn.eq.'+encodeURIComponent(isbn));
    const r=await sbGetAnon(`/semyung_tulip?or=(${ors.join(',')})&select=description,author,publisher,pub_year&limit=1`);
    const a=await r.json(); const row=(Array.isArray(a)&&a[0])||{};
    e.textContent=row.description||'줄거리 정보가 아직 없어요. (소장 도서 · 표지/형태로 판단해 주세요)';
    // 작가·출판사 보강(후보에 비어있으면 채움 — 모달 표시 + 담을 때 저장에도 반영)
    const c=AIC_RESULTS[AIC_DT_I]; if(c){ if(!c.author&&row.author)c.author=row.author; if(!c.publisher&&row.publisher)c.publisher=row.publisher; if(!c.year&&row.pub_year)c.year=row.pub_year; }
    const au=document.querySelector('#aicDtBody .au'); if(au&&!au.textContent.trim()&&c){ au.textContent=[c.author,c.publisher,c.year].filter(Boolean).join(' · '); }
  }catch(_){ e.textContent='줄거리를 불러오지 못했어요.'; }
}
function aicAddSection(){
  const picks=[...AIC_PICKED].map(i=>AIC_RESULTS[i]).filter(Boolean);
  if(!picks.length){ toast('책을 1권 이상 담아주세요'); return; }
  const title=(el('aicTitle').value||'').trim()||'AI 추천';
  const subtitle=(el('aicSub').value||'').trim();
  const books=picks.map(b=>{
    // 8/14: 고전 후보는 id 참조로 저장(secAdd의 고전 담기와 동일 형태) — 앱이 id로 본문·표지를 연결한다
    if(b.cls||/^(gb|kr)-/.test(String(b.id||''))) return {id:b.id,title:b.title,author:b.author||'',cover:b.cover||CLS_COVER[b.id]||''};
    const o={isbn:b.isbn||'',title:b.title,author:b.author||'',cover:b.cover||'',note:''};
    if(b.smEbook&&b.smEbookUrl){o._sm=true;o.lib=b.smEbookUrl;}
    return Object.assign(o, bkForm(b)); });   // tags(전자/종이/구독) + 링크 일괄 저장
  const _reset=()=>{
    el('aiCurCard').setAttribute('data-open','0'); const ch=el('aicChevron'); if(ch)ch.textContent='열기 ▾';
    el('aicResult').classList.remove('show'); el('aicTopic').value=''; AIC_RESULTS=[]; AIC_PICKED=new Set();
    AIC_MSGS=[]; AIC_TOPIC=''; const _th=el('aicThread'); if(_th)_th.innerHTML=''; const _q=el('aicQchips'); if(_q)_q.innerHTML='';   // 대화 초기화 → 다음 열 때 새 인사
  };
  // 8/14: 독서 챌린지 문맥 — 칸이 아니라 챌린지 초안으로 추가
  if(AIC_CTX==='chal'){
    readChalInputs();
    const now=new Date(), y=now.getFullYear(), m=now.getMonth();
    const p2=n=>String(n).padStart(2,'0');
    const from=`${y}-${p2(m+1)}-01`, to=`${y}-${p2(m+1)}-${p2(new Date(y,m+1,0).getDate())}`;
    CHALLENGES.unshift({id:null,type:'소장챌린지',title,detail:subtitle,from,to,mission:{reward:'draw',quiz:false,quizN:10,oneline:true},books});   // 8/29: 새 챌린지는 맨 위(사장님 수정요청). 리뷰 F11: 미션 0개면 저장 거부라 한 줄 소감 기본 켬
    _reset(); renderChallenges();
    toast(`✦ '${title}' 챌린지 초안이 추가됐어요 — 기간·미션 확인 후 저장하세요`);
    return;
  }
  readSecInputs();
  // 8/29 사장님 수정요청: 새 큐레이션은 현재 영역의 **맨 위**에 — 예전엔 "고정 칸(대출랭킹·신착 등) 뒤"라
  //   사서 칸이 고정 칸 사이에 끼어 있는 지금은 8번째 칸으로 들어가 한참 찾아야 했다.
  //   위치는 그 뒤 사서가 ↕ 순서 바꾸기로 옮긴다. (관리자 순서 = 학생 앱 순서)
  const idxs=SECTIONS.map((s,i)=>i).filter(i=>aOf(SECTIONS[i])===curArea);
  const at=idxs.length?idxs[0]:SECTIONS.length;
  SECTIONS.splice(at,0,{area:curArea,slot:newSlot('ai'),title,subtitle,style:'row',books});
  _pvFocusSlot=SECTIONS[at].slot;   // 만든 직후 그 칸으로 시선이 가게(강조·스크롤은 renderSettings/pvSync가 처리)
  _reset();
  renderSettings(); pvSync();
  toast(`✦ '${title}' 칸으로 추가됐어요 — 저장하면 학생 앱에 반영됩니다`);
}
function secRenderCands(head){scHead=head;const have=new Set((pkObj().books||[]).map(b=>b.isbn||b.id).filter(Boolean));
  el('secCandWrap').innerHTML=aiCurBanner()+`<div style="font-size:12px;font-weight:800;margin-bottom:9px">${esc(head)}</div>`+
    SCAND.map((b,i)=>{const key=b.isbn||b.id;const added=key&&have.has(key);const own=b.isbn&&LIB_INV.has(b.isbn);
    return `<div class="cand ${added?'on':''}">
      <div class="cv2">${b.cover?`<img src="${esc(b.cover)}" onerror="this.parentNode.textContent='📕'">`:'📕'}</div>
      <div class="ci"><div class="t">${esc(b.t)}</div><div class="s">${esc(b.a)}${b.isbn?' · '+esc(b.isbn):''}</div>
        <div class="sig">${b.rating!=null?`<span class="sig-r">★ ${b.rating}</span>`:''}${b.loan?`<span class="sig-l">대출 ${nf(b.loan)}</span>`:''}${b._sm?`<span class="sig-own">세명대 전자책${b.prov?' · '+esc(b.prov):''}</span>`:(b.held===false?(()=>{const t=[];if(b.smEbook)t.push(`<span class="sig-own">세명대 전자책${b.smEbookProvider?' · '+esc(b.smEbookProvider):''}</span>`);if(b.smPaper)t.push(`<span class="sig-own">세명대 종이책 · ${esc(b.smPaperStatus||'소장')}</span>`);return t.length?t.join(''):'<span class="sig-no">미소장 · 희망도서</span>';})():own?'<span class="sig-own">소장중</span>':'')}</div></div>
      ${secNoHold(b)?'<div class="pick" title="소장하지 않은 책 — 학생이 빌릴 수 없어 담을 수 없어요" style="opacity:.35;cursor:not-allowed" onclick="secAdd(${i})">×</div>':`<div class="pick" onclick="secAdd(${i})">${added?'✓':'+'}</div>`}</div>`;}).join('');
}
// 챌린지·큐레이션 모두 세명대가 소장한 책만(8/21 사용자 확정: "큐레이션 전체에 미소장 도서는 안 되는 게 맞다"). 통합검색의 국중 후보 중
//   전자책도 종이책도 없는 책은 학생에게 막다른 골목(즐시읽기 원칙). 희망도서 유도는 검색 결과의 몶—선반이 아니다
function secNoHold(b){ return !!b && !b.cls && !b.id && !b._sm && b.held===false && !b.smEbook && !b.smPaper; }
function secAdd(i){const b=SCAND[i];const arr=pkObj().books;
  if(secNoHold(b)){toast('소장하지 않은 책은 담을 수 없어요 — 학생이 빌릴 수 없어요. 형태를 ‘종이책’이나 ‘전자책’으로 고르면 소장 책만 보여요');return;}
  const idx=arr.findIndex(x=>(b.isbn&&x.isbn===b.isbn)||(b.id&&x.id===b.id)||(x.title===b.t));
  if(idx>=0)arr.splice(idx,1);
  else if(b.cls||b.id){arr.push({id:b.id,title:b.t,author:(b.a||'').split(' · ')[0],cover:b.cover||CLS_COVER[b.id]||''});}   // 북스타 고전 참조 (8/14: 표지 저장)
  else if(b._sm){arr.push(Object.assign({isbn:b.isbn,title:b.t,author:b.a||'',cover:b.cover||'',lib:b.lib||'',_sm:true,note:''},bkForm(b)));}   // 세명대 전자책(lib=상세 딥링크) + 형태태그
  else{arr.push(Object.assign({isbn:b.isbn||'',title:b.t,author:b.a||'',cover:b.cover||'',note:'',held:b.held},bkForm(b)));if(b.isbn&&b.held!==false){LIB_INV.add(b.isbn);upsertInventory([b]);}}   // 국중책도 세명대 소장형태(전자/종이) 있으면 태그 저장
  secRenderCands(scHead);secNote();
}

