/* ═══ AI추천 (ai.html 이식) — air* 네임스페이스, 전역 esc 재사용 ═══ */
(function(){
  const FUNC="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/recommend";
  const ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
  const EX=["요즘 지쳐서 위로받고 싶어","가볍게 머리 식힐 책","오싹하고 무서운 이야기","우주와 과학이 궁금해","철학 입문하고 싶어","김애란 책"];
  const f5=r=>r==null?'':(Math.round(r/2*10)/10).toFixed(1);
  const man=n=>{if(!n)return '';if(n>=10000)return (n/10000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'만';return n.toLocaleString();};
  let LAST=[];
  const SBR="https://gkujptyfrzqrjrvovbnc.supabase.co/rest/v1/semyung_tulip";   // P3: semyung_books → semyung_tulip
  const _core=t=>(t||'').split(/[\(\[:·\-]/)[0].trim();
  const _norm=t=>(t||'').replace(/\s+/g,'').toLowerCase();
  // 추천 결과 → 세명대 전자책 매칭(_smLib=상세 딥링크 → '바로 읽기')
  async function airSm(results){
    const cores=results.map(b=>_core(b.title)).filter(Boolean).slice(0,12);
    if(!cores.length) return;
    const or=cores.map(c=>'title.ilike.*'+encodeURIComponent(c.replace(/[(),*]/g,' ').trim())+'*').join(',');
    try{
      const r=await fetch(SBR+'?kind=eq.ebook&or=('+or+')&select=title,barcode&limit=80',{headers:{apikey:ANON,Authorization:'Bearer '+ANON}});
      const rows=await r.json(); if(!Array.isArray(rows)||!rows.length) return;
      results.forEach(b=>{ const c=_norm(_core(b.title)); if(!c)return;
        const hit=rows.find(x=>{const xc=_norm(_core(x.title));return xc&&(xc.includes(c)||c.includes(xc));});
        if(hit&&hit.barcode) b._smLib='https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd='+hit.barcode; });
    }catch(e){}
  }
  function cardHtml(b,i){
    const star=b.rating!=null?`<span class="air-star">★</span> ${f5(b.rating)}`:'';
    const loan=b.loan_count?`  ·  대출 ${man(b.loan_count)}`:'';
    return `<div class="air-card" onclick="airOpen(${i})">
      <div class="air-cv"><img src="${esc(b.cover)}" loading="lazy" decoding="async" data-t="${esc(b.title||'')}" data-a="${esc(b.author||'')}" onerror="ncSwap(this)"></div>
      <div class="air-bd"><h3>${esc(b.title)}</h3><div class="air-au">${esc(b.author)}</div>
        <div class="air-meta">${star}${loan}</div>
        ${b.reason?`<div class="air-why">${esc(b.reason)}</div>`:''}
        ${b._smLib?'<div class="air-read">우리 도서관 전자책 · 바로 읽기</div>':''}
      </div></div>`;
  }
  function render(d){
    const st=document.getElementById('airStage');
    if(!d.results||!d.results.length){st.innerHTML='<div class="air-empty">딱 맞는 책을 못 찾았어요.<br>조금 다르게 말해보거나 예시를 눌러보세요.</div>';return;}
    const modeTxt=d.mode==='entity'?'정확 검색 · 도서관 DB':'Bookstar AI 큐레이션';
    st.innerHTML=`<div class="air-results"><div class="air-intro">${esc(d.intro||'')}</div><div class="air-modeline">${modeTxt} · ${d.results.length}권</div><div class="air-grid">${d.results.map(cardHtml).join('')}</div></div>`;
  }
  window.airRun=function(t){document.getElementById('airQ').value=t;airGo();};
  window.airGo=async function(){
    const q=document.getElementById('airQ').value.trim(); if(!q)return;
    const st=document.getElementById('airStage');
    var sy=document.getElementById('airStory'); if(sy) sy.style.display='none';
    document.getElementById('airSend').disabled=true;
    st.innerHTML='<div class="air-loading"><div class="air-pulse"></div><br>AI가 책을 고르는 중…</div>';
    try{
      const r=await fetch(FUNC,{method:'POST',headers:{'Authorization':'Bearer '+ANON,'apikey':ANON,'content-type':'application/json'},body:JSON.stringify({query:q})});
      const d=await r.json(); LAST=d.results||[]; await airSm(LAST); render(d);
    }catch(e){ st.innerHTML='<div class="air-empty">잠시 문제가 생겼어요. 다시 시도해 주세요.</div>'; }
    document.getElementById('airSend').disabled=false;
  };
  window.airOpen=function(i){const b=LAST[i];if(!b)return; window.__airBook=b;
    const star=b.rating!=null?`<span class="air-star">★</span> ${f5(b.rating)} · ${b.rating_count||0}명`:'';
    const loan=b.loan_count?`  |  대출 ${man(b.loan_count)}`:'';
    const page=b.pages?`  |  ${b.pages}쪽`:'';
    const kws=(b.keywords||[]).slice(0,5);
    document.getElementById('airSheet').innerHTML=`<div class="air-stop"><div class="air-scv"><img src="${esc(b.cover)}" decoding="async" data-t="${esc(b.title||'')}" data-a="${esc(b.author||'')}" onerror="ncSwap(this)"></div>
      <div style="flex:1"><h2>${esc(b.title)}</h2><div class="air-sau">${esc(b.author)} · ${esc(b.publisher||'')} · ${b.pub_year||''}</div>
      <div class="air-smeta">${star}${loan}${page}</div></div></div>
      ${b.reason?`<div class="air-swhy">${esc(b.reason)}</div>`:''}
      <p class="air-sdesc">${esc(b.description||'')}</p>
      ${kws.length?`<div class="air-kws">${kws.map(k=>'<span class="air-kw">'+esc(k)+'</span>').join('')}</div>`:''}
      <div class="air-acts"><button class="air-cta" onclick="libBridgeOpen(window.__airBook)">${b._smLib?'전자책 바로 읽기':'우리 도서관에서 찾기'}</button><button class="air-cta2" onclick="airClose()">닫기</button></div>
      <div class="air-src">출처 · 별점·표지 알라딘 / 대출·키워드 정보나루(국립중앙도서관)</div>`;
    document.getElementById('airOv').classList.add('on');
  };
  window.airClose=function(){document.getElementById('airOv').classList.remove('on');};
  // 예시 칩 초기화
  var ch=document.getElementById('airChips');
  if(ch) ch.innerHTML=EX.map(e=>`<span class="air-chip" onclick="airRun('${e}')">${esc(e)}</span>`).join('');
})();
