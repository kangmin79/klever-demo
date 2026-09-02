/* ====== 민송 앱 (네이티브 앱 실측 — minsong_app_events 집계 RPC, 원본 로그는 외부 열람 불가) ====== */
const MA_LBL={login:'로그인',ebook_borrow:'전자책 대출',pickup:'찾아줘북즈',hold:'반납예약',cancel_pickup:'픽업 취소',cancel_hold:'예약 취소',charm_pick:'인증도서 담음',charm_done:'독후감 제출 기록'};
const MA_COL={login:'#6366f1',ebook_borrow:'#22c55e',pickup:'#f59e0b',hold:'#ec4899',cancel_pickup:'#94a3b8',cancel_hold:'#cbd5e1',charm_pick:'#d4a93b',charm_done:'#b8902f'};
let _maCharts={bar:null,cat:null};
async function renderMsApp(){
  let d=null;
  try{ const r=await sbWrite('POST', `/rpc/minsong_app_stats`, {}, {anon:true});
    if(r.ok)d=await r.json(); }catch(e){}
  if(!d){ el('maBanner').innerHTML='<div class="db-chip"><div class="v">—</div><div class="l">집계를 불러오지 못했어요</div></div>'; return; }
  const tot=d.totals||{}, today=d.today||{};
  const acts=k=>(k.ebook_borrow||0)+(k.pickup||0)+(k.hold||0);
  el('maBanner').innerHTML=[
    ['오늘 로그인',today.login||0,1],
    ['오늘 대출·예약',acts(today),1],
    ['누적 로그인',tot.login||0,0],
    ['누적 대출·예약',acts(tot),0],
    ['이용 학생',d.students||0,0],
    ['실패',d.fails||0,0],
  ].map(k=>`<div class="db-chip${k[2]?' hl':''}"><div class="v">${nf(k[1])}</div><div class="l">${k[0]}</div></div>`).join('');
  if(typeof Chart!=='undefined'){
    try{ if(_maCharts.bar)_maCharts.bar.destroy(); if(_maCharts.cat)_maCharts.cat.destroy(); }catch(e){}
    const days=d.daily||[];
    if(el('maBar'))_maCharts.bar=new Chart(el('maBar'),{type:'bar',data:{labels:days.map(x=>{const p=String(x.d).split('-');return (+p[1])+'/'+(+p[2]);}),datasets:[{data:days.map(x=>x.n),backgroundColor:'#6366f1',borderRadius:8,barThickness:18,maxBarThickness:22}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#eef0f5'},ticks:{precision:0,color:'#aeb3cc'}},x:{grid:{display:false},ticks:{color:'#aeb3cc'}}},maintainAspectRatio:false}});
    const mix=(d.byevent||[]).map(x=>[MA_LBL[x.e]||x.e,x.n,MA_COL[x.e]||'#94a3b8']);
    if(el('maCatTot'))el('maCatTot').textContent=nf(mix.reduce((a,x)=>a+x[1],0));
    if(el('maCat'))_maCharts.cat=new Chart(el('maCat'),{type:'doughnut',data:{labels:mix.map(x=>x[0]),datasets:[{data:mix.map(x=>x[1]),backgroundColor:mix.map(x=>x[2]),borderWidth:0,borderRadius:8,spacing:4,hoverOffset:6}]},options:{cutout:'72%',plugins:{legend:{display:false}},maintainAspectRatio:false}});
    if(el('maCatLeg'))el('maCatLeg').innerHTML=mix.length?mix.map(x=>`<span><i style="background:${x[2]}"></i>${x[0]} ${x[1]}</span>`).join(''):'<span class="muted">아직 앱 이용 기록이 없어요</span>';
  }
  const books=d.top_books||[]; const bmx=Math.max(1,...books.map(b=>b.n||0));
  el('maBooks').innerHTML=books.length?books.map((b,i)=>`<div class="db-rbar">
    <div class="rno ${i<3?'t':''}">${i+1}</div><div class="rnm">${esc(b.t||'')}</div>
    <div class="rtk"><i style="width:${Math.round((b.n||0)/bmx*100)}%"></i></div><div class="rvl">${nf(b.n)}건</div></div>`).join('')
    :`<div class="ph-sub" style="padding:18px 2px">아직 앱에서 대출·예약된 책이 없어요.<br>학생이 앱 버튼으로 빌리면 여기 쌓입니다.</div>`;
  const rec=d.recent||[];
  el('maRecent').innerHTML=rec.length?rec.map(r=>`<tr><td>${esc(r.at||'')}</td><td>${esc(MA_LBL[r.e]||r.e)}</td><td>${esc(r.b||'—')}</td><td class="num">${r.ok?'성공':'<span style="color:#dc2626">실패</span>'}</td></tr>`).join('')
    :`<tr><td colspan="4" style="color:var(--light);text-align:center;padding:22px">아직 기록이 없어요</td></tr>`;
}

