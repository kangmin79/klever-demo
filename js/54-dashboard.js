/* ═══════════════════════════════════════════════════════════
   사서 대시보드 — 전교생 완독·퀴즈·독서시간 집계 (?page=dashboard)
   데이터: bookstar_challenge_results(read_pct·read_sec·quiz_ok·quiz_total·score) + students + reader_stats
   ═══════════════════════════════════════════════════════════ */
function _dashMin(sec){ const m=Math.round((sec||0)/60); if(m<=0) return '0분'; if(m<60) return m+'분'; const h=Math.floor(m/60), r=m%60; return r?`${h}시간 ${r}분`:`${h}시간`; }
function _dashBookTitle(id){
  const b=(typeof BOOKS!=='undefined')?BOOKS.find(x=>x.id===id):null;
  if(b) return (typeof cleanT==='function'?cleanT(b.title):b.title)||id;
  return id;
}
async function renderDashboard(){
  const el=document.getElementById('dashboardBody'); if(!el) return;
  el.innerHTML='<div class="lb-loading">독서 통계를 불러오는 중…</div>';
  const [students, results, rstats] = await Promise.all([
    _agFetch(`bookstar_students_public?select=id,name,emoji`),   // 8/29 공개용 뷰(이름 가림). dept는 서버에 없음
    _agFetch(`bookstar_challenge_results?select=student_id,book_id,read_pct,read_sec,quiz_ok,quiz_total,score,submitted`),
    _agFetch(`bookstar_reader_stats?select=student_id,data`)
  ]);
  const deptMap={}; (typeof BX_STUDENTS!=='undefined'?BX_STUDENTS:[]).forEach(x=>{ deptMap[x.id]=x.dept||''; });
  const stu=(students||[]).map(s=>({...s, dept:s.dept||deptMap[s.id]||''})), res=results||[], rst=rstats||[];
  if(!stu.length){ el.innerHTML='<div class="lb-empty"><div class="lb-empty-emo">📊</div><div class="lb-empty-t">아직 학생 데이터가 없어요</div></div>'; return; }

  // 독서시간: read_sec(v4, 책별 합) 우선, 없으면 reader_stats.readingTime.total(분)로 폴백
  const secMap={};   // student_id → 총 독서 초
  res.forEach(r=>{ secMap[r.student_id]=(secMap[r.student_id]||0)+(r.read_sec||0); });
  const rsMinMap={}; // reader_stats 총 분
  rst.forEach(r=>{ const t=(r.data&&r.data.readingTime&&r.data.readingTime.total)||0; rsMinMap[r.student_id]=t; });

  // 학생별 집계
  const perStu=stu.map(s=>{
    const mine=res.filter(r=>r.student_id===s.id);
    const done=mine.filter(r=>(r.read_pct||0)>=95).length;
    const reading=mine.filter(r=>(r.read_pct||0)>0 && (r.read_pct||0)<95).length;
    const avgPct=mine.length?Math.round(mine.reduce((a,r)=>a+(r.read_pct||0),0)/mine.length):0;
    const qOk=mine.reduce((a,r)=>a+(r.quiz_ok||0),0), qTot=mine.reduce((a,r)=>a+(r.quiz_total||0),0);
    const qRate=qTot?Math.round(qOk/qTot*100):null;
    const score=mine.reduce((a,r)=>a+(r.score||0),0);
    const sec=secMap[s.id]||0;
    const mins=sec>0?Math.round(sec/60):(rsMinMap[s.id]||0);   // v4 초가 있으면 그걸로, 없으면 옛 분
    return {s, done, reading, avgPct, qOk, qTot, qRate, score, mins};
  });

  // 전교생 KPI
  const nStu=stu.length;
  const totDone=perStu.reduce((a,p)=>a+p.done,0);
  const activeStu=perStu.filter(p=>p.done+p.reading>0).length;
  const avgPctAll=(()=>{ const withRead=perStu.filter(p=>res.some(r=>r.student_id===p.s.id)); if(!withRead.length) return 0;
    return Math.round(withRead.reduce((a,p)=>a+p.avgPct,0)/withRead.length); })();
  const totMin=perStu.reduce((a,p)=>a+p.mins,0);
  const gOk=perStu.reduce((a,p)=>a+p.qOk,0), gTot=perStu.reduce((a,p)=>a+p.qTot,0);
  const qRateAll=gTot?Math.round(gOk/gTot*100):null;

  const kpis=[
    {emo:'👥', lab:'참여 학생', val:`${activeStu}<span class="dk-u">/${nStu}명</span>`},
    {emo:'📖', lab:'총 완독', val:`${totDone}<span class="dk-u">권</span>`},
    {emo:'📊', lab:'평균 완독율', val:`${avgPctAll}<span class="dk-u">%</span>`},
    {emo:'⏱', lab:'총 독서시간', val:`${_dashMin(totMin*60)}`},
    {emo:'✏️', lab:'퀴즈 정답률', val:qRateAll==null?'—':`${qRateAll}<span class="dk-u">%</span>`},
  ];

  // 책별 인기 (읽은 학생 수 · 완독 수) — 상위 8
  const bookAgg={};
  res.forEach(r=>{ if((r.read_pct||0)<=0) return; const b=bookAgg[r.book_id]||(bookAgg[r.book_id]={readers:0,done:0});
    b.readers++; if((r.read_pct||0)>=95) b.done++; });
  const topBooks=Object.entries(bookAgg).sort((a,b)=>b[1].readers-a[1].readers||b[1].done-a[1].done).slice(0,8);

  // 학생 테이블: 점수 내림차순
  const rows=perStu.slice().sort((a,b)=>b.score-a.score||b.done-a.done).map(p=>{
    const emo=p.s.emoji||'📘', nm=p.s.name||p.s.id;
    const qtxt=p.qRate==null?'<span class="dk-dim">—</span>':`${p.qRate}% <span class="dk-dim">(${p.qOk}/${p.qTot})</span>`;
    return `<tr>
      <td class="dk-name"><span class="dk-emo">${emo}</span>${esc(nm)}<span class="dk-dept">${esc(p.s.dept||'')}</span></td>
      <td class="dk-num">${p.done}<span class="dk-dim"> / 읽는중 ${p.reading}</span></td>
      <td class="dk-num"><div class="dk-bar"><span style="width:${Math.min(100,p.avgPct)}%"></span></div>${p.avgPct}%</td>
      <td class="dk-num">${_dashMin(p.mins*60)}</td>
      <td class="dk-num">${qtxt}</td>
      <td class="dk-num dk-score">${p.score.toLocaleString()}</td>
    </tr>`;
  }).join('');

  const bookRows=topBooks.map(([id,b])=>`<div class="dk-book">
      <span class="dk-book-t">${esc(_dashBookTitle(id))}</span>
      <span class="dk-book-m">👀 ${b.readers}명 · 📖 완독 ${b.done}</span>
    </div>`).join('') || '<div class="dk-dim" style="padding:10px">아직 읽은 책 기록이 없어요</div>';

  el.innerHTML=`
    <div class="dk-kpis">${kpis.map(k=>`
      <div class="dk-kpi"><div class="dk-kpi-emo">${k.emo}</div>
        <div class="dk-kpi-val">${k.val}</div><div class="dk-kpi-lab">${k.lab}</div></div>`).join('')}</div>

    <div class="dk-card">
      <div class="dk-h">학생별 현황 <span class="dk-dim">· 점수순</span></div>
      <div class="dk-twrap"><table class="dk-table">
        <thead><tr><th>학생</th><th>완독</th><th>평균 완독율</th><th>독서시간</th><th>퀴즈 정답률</th><th>점수</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>

    <div class="dk-card">
      <div class="dk-h">가장 많이 읽은 책 <span class="dk-dim">· 상위 ${topBooks.length}</span></div>
      <div class="dk-books">${bookRows}</div>
    </div>

    <div class="dk-note">📌 완독율은 <b>글자수 진행률과 독서시간 중 낮은 값</b>으로 계산돼요(빨리 넘기기 방지). 독서시간이 0인 기록은 새 완독율 규칙 적용 전에 읽은 것이에요.</div>
  `;
}

function renderMyBooks(){
  const el = document.getElementById('myBooks');
  if(!el) return;
  const mine = (typeof myReadBooks==='function') ? myReadBooks() : BOOKS.filter(b=>b.progress>0);
  el.innerHTML = mine.map(b=>{
    const c=_chalRead(b.id)||{};   // 실데이터 — 가짜 랜덤 독서시간 제거 (8/15)
    const sub = (c.read_pct||0)>0 ? `완독율 ${Math.floor(c.read_pct)}%`
              : (c.read_sec||0)>0 ? `독서 ${Math.max(1,Math.round(c.read_sec/60))}분` : '읽기 시작';
    return `
    <div class="book-card" onclick="openDetail('${b.id}')">
      ${bookCoverHTML(b)}
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-author">${sub}</div>
      </div>
    </div>
  `;}).join('');
}

