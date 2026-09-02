/* ═══════════════════════════════════════════════════════════════════════════
   통계·관리 5화면 — 측정 로그 v2 (2026-08-17) → 8/17 오후 사장님 시안 '엑셀 다운로드 방식'으로 재구성
   원천: bookstar_events(+writings·stars·enroll) → admin-save stats_* op(service role) → 엑셀.
   설계 문서: klever_demo/_측정로그_설계_20260817.md · 사장님 시안: Desktop/북스타_관리자_엑셀 다운로드 방식_2026.08.17.html
   원칙: 화면에 집계 숫자·표·차트·순위를 두지 않는다("이용자도 없는데 한눈에 보여주는 건 안 된다"). 각 화면 = 1.언제(기간) → 2.무엇을(시트 체크) → 요약 줄 → [엑셀 다운로드] → note → 경고.
   예외 = 피드관리의 글 목록 10건(숨기기 작업용)·운영이력의 지난 목록 10줄(숫자 없음).
   같은 이름의 옛 함수(loadWritings·renderHistory 등)를 여기서 덮어쓴다(뒤에 선언된 함수가 이김).
   ═══════════════════════════════════════════════════════════════════════════ */
const ST_SCHOOL='hankuk';   // 학생 앱 CH_SCHOOL과 동일 (세명대 표기 정리는 별도)
const TYPE_KO={paper:'종이책',ebook:'전자책',foreign:'해외고전',korean:'국내고전',external:'외부참조',none:'—'};
const ACT_KO={oneline:'한 줄 소감',question:'한 줄 질문',review:'서평 쓰기',essay:'독후감',underline:'핵심 문장',recommend:'책 추천',rv:'독자 서평'};   // rv = reviews 테이블(빌린 책 서평, 별 없음)
const pad2=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const kst=(s)=>s+'T00:00:00+09:00';                 // 날짜(YYYY-MM-DD) → 그날 0시 KST
const nextDay=(s)=>{const d=new Date(s+'T00:00:00'); d.setDate(d.getDate()+1); return ymd(d);};
// 학기: 3/1~8/31 = 1학기, 9/1~2/28 = 2학기
function termRange(){ const t=new Date(); const y=t.getFullYear(), m=t.getMonth()+1;
  if(m>=3&&m<=8) return [y+'-03-01', y+'-08-31'];
  return m>=9 ? [y+'-09-01', (y+1)+'-02-28'] : [(y-1)+'-09-01', y+'-02-28']; }
// 기간 프리셋 → [from,to]. to는 언제나 오늘(시안: dbTo=TODAY). 8/17 시안 키 추가: w(이번 주 월요일부터)·m(이번 달)·t(이번 학기)·y(최근 1년)·a(전체)
function presetRange(k){ const t=new Date(); const to=ymd(t);
  if(k==='today') return [to,to];
  if(k==='week'||k==='d7'){ const d=new Date(t); d.setDate(d.getDate()-6); return [ymd(d),to]; }
  if(k==='w'){ const d=new Date(t); const dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow); return [ymd(d),to]; }   // 이번 주 = 이번 주 월요일 ~ 오늘
  if(k==='d30'){ const d=new Date(t); d.setDate(d.getDate()-29); return [ymd(d),to]; }
  if(k==='month'||k==='m') return [t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-01', to];
  if(k==='y'){ const d=new Date(t); d.setFullYear(d.getFullYear()-1); d.setDate(d.getDate()+1); return [ymd(d),to]; }
  if(k==='a') return ['2020-01-01',to];
  return [termRange()[0], to]; }   // term/t: 학기 시작 ~ 오늘
async function statsOp(op, extra){
  const r=await adminSave(Object.assign({op:op, school:ST_SCHOOL}, extra||{}));
  if(!r.ok){ let t=''; try{ t=await r.text(); }catch(e){} throw new Error('stats '+op+' '+r.status+' '+t.slice(0,120)); }
  return await r.json();
}
const stEmpty=(n,msg)=>`<tr><td colspan="${n}" style="text-align:center;color:var(--light);padding:26px">${msg}</td></tr>`;
const fmtRange=(f,t)=>'기간: '+f+' ~ '+t;
/* ── 엑셀: SheetJS(xlsx, 시트 여러 장) — 없으면 첫 시트를 CSV로 ── */
function xlsxDownload(name, sheets){   // sheets=[{name, rows:[[...],...]}]
  try{
    if(typeof XLSX!=='undefined'){
      const wb=XLSX.utils.book_new();
      sheets.forEach(s=>{ const ws=XLSX.utils.aoa_to_sheet(s.rows); XLSX.utils.book_append_sheet(wb, ws, String(s.name).slice(0,31)); });
      XLSX.writeFile(wb, name+'.xlsx'); toast('엑셀 파일을 내려받았어요'); return;
    }
  }catch(e){ console.warn('xlsx fail, csv fallback', e); }
  const rows=sheets[0].rows;
  const csv='﻿'+rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name+'.csv';a.click();URL.revokeObjectURL(url); toast('엑셀 라이브러리를 못 불러와 CSV(첫 장)로 내려받았어요');
}
const NOTE3=[['조회는 상세페이지 살펴 본 건수'],['이용은 종이책·전자책은 넘겨준 건수(종이책은 신청까지), 고전은 북스타에서 읽은 건수(1분 이상)'],['활동은 한줄소감, 한줄질문, 서평 작성 건수']];

/* ── 8/17 시안 공통: 세그 선택·체크카드(.pk)·요약 줄(.st-sum)·버튼 잠금 ── */
function segOn(b){ if(!b||!b.parentNode) return; b.parentNode.querySelectorAll('button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); }
function ck(id){ const p=el(id); const i=p&&p.querySelector('input'); return !!(i&&i.checked); }
function mark(id){ const p=el(id); if(!p) return false; const on=ck(id); p.classList.toggle('on',on); return on; }   // 체크 상태 → 카드 테두리(.on) 동기 + 값 반환
const NEED_PICK='<b style="color:var(--bad)">받을 자료를 하나 이상 골라 주세요.</b>';
const rangeOf=(fid,tid)=>{ const f=el(fid)?el(fid).value:'', t=el(tid)?el(tid).value:''; return [f,t]; };
const rangeOk=(f,t)=>{ if(!f||!t||f>t){ toast('기간을 확인해 주세요'); return false; } return true; };
// 엑셀 버튼: 집계 받아오는 동안 잠그고 문구 바꿈(두 번 눌러 두 번 받는 사고 방지)
async function withBusy(btn, fn){
  const old=btn?btn.textContent:''; if(btn){ btn.disabled=true; btn.textContent='집계를 받아오는 중…'; }
  try{ await fn(); }catch(e){ toast('집계를 불러오지 못했어요 — '+String(e&&e.message||e)); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
}

/* ══════════ 1. 대시보드 — 기간·시트 고르고 엑셀 (stats_overview) ══════════ */
function initDashDates(){ if(el('dbFrom')&&!el('dbFrom').value){ const [f,t]=presetRange('t'); el('dbFrom').value=f; el('dbTo').value=t; } }
function setRange(b,k){ segOn(b); const [f,t]=presetRange(k); el('dbFrom').value=f; el('dbTo').value=t; dbSum(); }
const DB_PK=[['pkSum','요약'],['pkSrc','유형별'],['pkChSt','챌린지 현황']];   // 8/29 별 포인트 폐지 — '별 순위' 시트 삭제
function dbPicked(){ return DB_PK.filter(x=>mark(x[0])).map(x=>x[0]); }
function dbSum(){
  initDashDates();
  const [f,t]=rangeOf('dbFrom','dbTo'); const on=dbPicked(); const id9=false;
  const e=el('dbSumLine'); if(!e) return;
  if(!on.length){ e.innerHTML=NEED_PICK; return; }
  e.innerHTML='<b>'+esc(f)+' ~ '+esc(t)+'</b><br>엑셀 한 개 · 시트 <b>'+on.length+'장</b> — '+DB_PK.filter(x=>on.includes(x[0])).map(x=>x[1]).join(' · ')
    +(id9?' <span class="chip done">학번 있음</span>':'')+'<br>파일 이름 &nbsp;<b>'+esc(dbFileName(f,t,id9))+'</b>';
}
const dbFileName=(f,t,id9)=>'북스타_대시보드_'+(id9?'시상용_':'')+f+'_'+t+'.xlsx';
function downloadDashExcel(btn){
  const [f,t]=rangeOf('dbFrom','dbTo'); if(!rangeOk(f,t)) return;
  const on=dbPicked(); if(!on.length){ dbSum(); toast('받을 자료를 하나 이상 골라 주세요'); return; }
  return withBusy(btn, async()=>{
    const d=await statsOp('stats_overview',{from:kst(f), to:kst(nextDay(t))});
    const per=[fmtRange(f,t)], sheets=[];
    if(on.includes('pkSum'))  sheets.push({name:'요약',rows:[per,[],['접속 학생','조회','이용','활동'],[d.visitors,d.views,d.uses,d.acts],[],...NOTE3]});   // 8/29 리뷰 F-1: "유형별과 합이 다를 수 있다" 경고 삭제 — 둘 다 같은 기준(외부참조 제외)으로 세서 항상 같다
    if(on.includes('pkSrc')){ const bt=(d.by_type||[]).filter(r=>r.type!=='external'&&r.type!=='none');   // 시안: 외부참조(세명대 미소장)는 담지 않음 → 합계도 네 줄 기준
      const sum=k=>bt.reduce((a,r)=>a+(+r[k]||0),0);
      sheets.push({name:'유형별',rows:[per,[],['유형','조회','이용','활동'],...bt.map(r=>[TYPE_KO[r.type]||r.type,r.views,r.uses,r.acts]),['합계',sum('views'),sum('uses'),sum('acts')],[],...NOTE3]}); }
    if(on.includes('pkChSt')) sheets.push({name:'챌린지 현황',rows:[per,[],['운영중인 챌린지','완료된 챌린지','참여 학생','완주 학생'],[d.ch_open,d.ch_done,d.ch_part,d.ch_fin]]});
    xlsxDownload(dbFileName(f,t,false).replace(/\.xlsx$/,''), sheets);
  });
}

/* ══════════ 2. 이용통계 — 기간·유형·경로·시트 고르고 엑셀 (stats_usage). 시안: 탭/표/[조회] 없음, 엑셀 버튼이 곧 조회 ══════════ */
function initStatDates(){ if(el('stDateFrom')&&!el('stDateFrom').value){ const [f,t]=presetRange('t'); el('stDateFrom').value=f; el('stDateTo').value=t; } }
function setStatRange(b,k){ segOn(b); const [f,t]=presetRange(k); el('stDateFrom').value=f; el('stDateTo').value=t; statSum(); }
const ST_PK=[['pkBook','도서별'],['pkUser','학생별'],['pkDetail','상세통계']];
function stPicked(){ return ST_PK.filter(x=>mark(x[0])).map(x=>x[0]); }
const selText=id=>{ const s=el(id); return (s&&s.selectedOptions&&s.selectedOptions[0])?s.selectedOptions[0].text:'전체'; };
function statSum(){
  initStatDates();
  const [f,t]=rangeOf('stDateFrom','stDateTo'); const on=stPicked(); const id9=on.includes('pkUser')||on.includes('pkDetail');
  const e=el('stSum'); if(!e) return;
  if(!on.length){ e.innerHTML=NEED_PICK; return; }
  e.innerHTML='<b>'+esc(f)+' ~ '+esc(t)+'</b> · 유형 <b>'+esc(selText('stSrc'))+'</b> · 경로 <b>'+esc(selText('stPath'))+'</b><br>'
    +'엑셀 한 개 · 시트 <b>'+on.length+'장</b> — '+ST_PK.filter(x=>on.includes(x[0])).map(x=>x[1]).join(' · ')
    +(id9?' <span class="chip done">학번 있음</span>':'')+'<br>파일 이름 &nbsp;<b>'+esc(stFileName(f,t,id9))+'</b>';
}
const stFileName=(f,t,id9)=>'북스타_이용통계_'+(id9?'시상용_':'')+f+'_'+t+'.xlsx';
function downloadStatsExcel(btn){
  const [f,t]=rangeOf('stDateFrom','stDateTo'); if(!rangeOk(f,t)) return;
  const on=stPicked(); if(!on.length){ statSum(); toast('받을 자료를 하나 이상 골라 주세요'); return; }
  const ty=el('stSrc').value, pa=el('stPath').value;
  return withBusy(btn, async()=>{
    const d=await statsOp('stats_usage',{from:kst(f), to:kst(nextDay(t)), type:ty, path:pa});
    const per=[fmtRange(f,t)+(ty?' · 유형: '+(TYPE_KO[ty]||ty):'')+(pa?' · 경로: '+pa:'')], sheets=[];
    if(on.includes('pkBook'))   sheets.push({name:'도서별',rows:[per,[],['번호','유형','도서명','조회','이용','활동'],...(d.books||[]).map((b,i)=>[i+1,TYPE_KO[b.item_type]||b.item_type,b.title||b.item_key,b.views,b.uses,b.acts]),[],...NOTE3]});
    if(on.includes('pkUser'))   sheets.push({name:'학생별',rows:[per,[],['번호','학번','조회','이용','활동'],...(d.students||[]).map((s,i)=>[i+1,s.student_id,s.views,s.uses,s.acts])]});
    if(on.includes('pkDetail')) sheets.push({name:'상세통계',rows:[per,[],['학번','날짜','유형','도서명','이용 방식','경로'],...(d.detail||[]).map(r=>[r.student_id,r.date,TYPE_KO[r.type]||r.type,r.title||'',r.way,r.path])]});
    xlsxDownload(stFileName(f,t,on.includes('pkUser')||on.includes('pkDetail')).replace(/\.xlsx$/,''), sheets);
  });
}

/* ══════════ 3. 챌린지 통계 ══════════ */
let CHS=[]; let CHD=null;
const chStatus=(c)=>{ const today=ymd(new Date()); if(c.end_date && c.end_date<today) return '<span class="chip end">종료</span>';
  if(c.start_date && c.start_date>today) return '<span class="chip end">예정</span>';
  const dd=c.end_date?Math.ceil((new Date(c.end_date+'T00:00:00')-new Date(today+'T00:00:00'))/86400000):null; return '<span class="chip run">운영중'+(dd!=null?' D-'+dd:'')+'</span>'; };
const chMissionLabel=(m)=>{ m=m||{}; const a=[]; if(m.quiz)a.push('퀴즈 풀기'); if(m.oneline)a.push('한 줄 소감'); if(m.question)a.push('한 줄 질문'); if(m.review)a.push('서평 쓰기'); if(m.essay)a.push('독후감'); return a.join('·')||'—'; };
// 추첨 응모 자격 = 챌린지 빌더의 '추첨 자격' 옵션을 그대로 따른다: all(미션 전체 완료)=완주 수 / any(미션 1개 이상)=참가 수  (8/17 시안 감사 C7)
const chEligible=(c)=>{ const m=c.mission||{}; return (m.drawCond==='any') ? {n:c.part||0, label:'참가'} : {n:c.done||0, label:'완주'}; };
const chRewardText=(c)=>{ const m=c.mission||{}; return '추첨형 · '+(m.drawCount||'?')+'명 뽑기'; };   // 8/29 별 포인트 폐지 — 순위형 없음
const chType=(t)=>String(t||'').indexOf('고전')>=0?'고전 컬렉션 챌린지':'소장자료 챌린지';
const chEnded=(c)=>!!(c.end_date && c.end_date<ymd(new Date()));
// 결과 확정(얼린 값) — 챌린지 id → {fixed_at, summary}.
// ⚠ 8/17 시안('엑셀 다운로드 방식'): 결과확정 UI 제거, 함수 보존 — 아래 loadFixed·fixedChip·chFixCell·chFix·chFixedExcel 은 화면 어디서도 부르지 않는다(백엔드 op ch_fix/ch_fixed_*는 그대로).
let FIXED={};
async function loadFixed(){ try{ const a=await statsOp('ch_fixed_list'); FIXED={}; (Array.isArray(a)?a:[]).forEach(x=>{ FIXED[String(x.challenge_id)]=x; }); }catch(e){ FIXED={}; } }
const fixedChip=(c)=>{ const f=FIXED[String(c.id)]; return f?`<span class="chip done" title="${esc(String(f.fixed_at||'').slice(0,19).replace('T',' '))}">확정 ${esc(String(f.fixed_at||'').slice(5,10))}</span>`:''; };
const chFixCell=(c)=>{ if(!chEnded(c)) return ''; const f=FIXED[String(c.id)]; return f ? '<div style="margin-top:5px">'+fixedChip(c)+'</div>' : `<button class="btn-ghost" style="padding:5px 10px;font-size:11.5px;margin-top:5px" onclick="chFix('${esc(String(c.id))}')">결과 확정 → 운영이력</button>`; };
async function chFix(id){
  const c=CHS.find(x=>String(x.id)===String(id)); if(!c) return;
  if(!confirm('「'+c.title+'」의 결과를 지금 값으로 확정할까요?\n지금의 참가·완주·학생별 명단이 운영이력에 얼려지고, 이후 학생이 글을 지워도 이 명단은 바뀌지 않습니다.\n(확정은 한 번만 됩니다)')) return;
  try{ const r=await statsOp('ch_fix',{program:id}); if(!r||!r.ok) throw new Error((r&&r.error)||'실패');
    toast(r.already?'이미 확정된 챌린지예요':'결과를 확정했어요 — 운영이력에서 명단 엑셀을 받을 수 있어요'); await loadFixed(); renderChStat(); }
  catch(e){ toast('확정하지 못했어요 — '+String(e.message||e)); }
}
// 챌린지 상태 글자(select 옵션용 — chStatus는 chip HTML)
const chStatusText=(c)=>{ const today=ymd(new Date()); if(c.end_date && c.end_date<today) return '종료'; if(c.start_date && c.start_date>today) return '예정'; return '운영중'; };
// 셀렉트 옵션 = `제목 · 종류 · N권 · 운영중/종료` (시안). 챌린지 목록(CHS)은 stats_challenges 한 번으로 받고 운영이력도 같이 쓴다
async function loadChs(){ const a=await statsOp('stats_challenges'); CHS=Array.isArray(a)?a:[]; return CHS; }
async function renderChStat(){
  const sel=el('chPick'); if(!sel) return;
  sel.innerHTML='<option value="">불러오는 중…</option>'; chSum();
  try{
    await loadChs();
    const cur=sel.value;
    sel.innerHTML = CHS.length ? CHS.map(c=>`<option value="${esc(c.id)}">${esc(c.title)} · ${chType(c.type).replace(' 챌린지','')} · ${nf(c.books_n)}권 · ${chStatusText(c)}</option>`).join('') : '<option value="">아직 만든 챌린지가 없어요</option>';
    if(cur&&CHS.some(c=>String(c.id)===cur)) sel.value=cur;
  }catch(e){ sel.innerHTML='<option value="">챌린지 목록을 불러오지 못했어요</option>'; toast('챌린지 목록을 불러오지 못했어요 — '+String(e&&e.message||e)); }
  chSum();
}
function chSum(){
  const sel=el('chPick'), e=el('chSumLine'); if(!sel||!e) return;
  const s=mark('pkChSum'), d=mark('pkChDet');
  if(!s&&!d){ e.innerHTML=NEED_PICK; return; }
  const c=CHS.find(x=>String(x.id)===sel.value)||null, today=ymd(new Date());
  const optText=(sel.value&&sel.selectedOptions&&sel.selectedOptions[0])?sel.selectedOptions[0].text:'';
  let h='고른 챌린지 &nbsp;<b>'+esc(optText||'—')+'</b><br>';
  h+='받는 파일 <b>'+((s?1:0)+(d?1:0))+'개</b><br>';
  if(s) h+='· 요약 &nbsp;<b>'+esc(chSumFileName(today))+'.xlsx</b> <span class="chip end">전체 챌린지</span><br>';
  if(d) h+='· 상세 &nbsp;<b>'+esc(chDetFileName(c,today))+'.xlsx</b> <span class="chip done">학번 있음</span>';
  e.innerHTML=h;
}
const chSumFileName=(today)=>'북스타_챌린지통계_요약_'+today;
const chDetFileName=(c,today)=>'북스타_챌린지통계_상세_시상용_'+(c?chFileTitle(c):'챌린지')+'_'+today;
// [엑셀 다운로드] — 요약 체크=전체 챌린지, 상세 체크=고른 챌린지(학번 있음).
//   8/29 리뷰 F-15/F-18: 예전엔 둘 다 고르면 파일이 둘 나가 브라우저가 둘째를 막아도 "내려받았어요"가 두 번 떴고, 상세 실패도 조용히 넘어갔다
//   → 이제 파일 하나에 시트 둘(요약·상세). 상세를 못 받으면 파일 자체를 안 만들고 실패를 알린다.
function downloadChExcel(btn){
  const s=ck('pkChSum'), d=ck('pkChDet');
  if(!s&&!d){ chSum(); toast('받을 자료를 하나 이상 골라 주세요'); return; }
  const pid=el('chPick')?el('chPick').value:'';
  if(d&&!pid){ toast('상세를 받으려면 챌린지를 골라 주세요'); return; }
  return withBusy(btn, async()=>{
    if(!CHS.length) await loadChs();
    const today=ymd(new Date());
    const sheets=[];
    if(s){ if(!CHS.length) throw new Error('불러온 챌린지가 없어요'); sheets.push({name:'요약',rows:chSumRows()}); }
    let dd=null;
    if(d){ dd=await statsOp('stats_challenge_detail',{program:pid}); CHD=dd;
      if(!dd||!dd.program) throw new Error('이 챌린지의 상세를 불러오지 못했어요 — 잠시 후 다시 시도해 주세요');
      sheets.push({name:'상세(시상용)',rows:chMatrixRows(dd,'기준일: '+today)}); }
    const name = dd ? (s ? '북스타_챌린지통계_요약+상세_시상용_'+chFileTitle(dd.program)+'_'+today : chDetFileName(dd.program,today)) : chSumFileName(today);
    xlsxDownload(name, sheets);
  });
}
function chSumRows(){
  return [['기준일: '+ymd(new Date())],[],['챌린지','구분','미션','시작','종료','담긴 책','참가','완주','완주율(%)','미션 수행','시상 방식','응모 자격'],
    ...CHS.map(c=>{ const e=chEligible(c); return [c.title,chType(c.type),chMissionLabel(c.mission),c.start_date||'',c.end_date||'',c.books_n,c.part,c.done,c.part?Math.round(c.done/c.part*100):0,c.missions,chRewardText(c).replace('<br>',' '),e.label+' '+e.n+'명']; })];
}
// 상세 행렬(학생 × 담긴 책) — 화면·상세 엑셀·운영이력 확정본 엑셀이 같은 계산을 쓴다
function chBuildMatrix(d){
  const books=d.books||[], rows=d.rows||[], enroll=d.enroll||[], m=(d.program&&d.program.mission)||{};
  const need=[]; if(m.quiz)need.push('quiz'); if(m.oneline)need.push('oneline'); if(m.question)need.push('question'); if(m.review)need.push('review'); if(m.essay)need.push('essay');
  const bkey=b=>String(b||'').replace(/^sm-/,'');
  const byStu={};
  rows.forEach(r=>{ const s=byStu[r.student_id]||(byStu[r.student_id]={books:{},first:null});
    const k=bkey(r.book_id); const bb=s.books[k]||(s.books[k]={acts:{},at:null,text:[]});
    // 8/29 리뷰 F-14: 화면이 약속한 "글자 수 미달은 미완료"를 실제로 적용 — 피드관리의 미인정 기준(WR_MIN)과 같은 잣대
    const _min=WR_MIN[r.act]; const _short=!!(_min && String(r.text||'').trim().length<_min);
    if(!_short) bb.acts[r.act]=true;
    if(r.text&&r.act!=='quiz') bb.text.push(_short?('[글자 수 미달] '+r.text):r.text); if(r.act==='quiz'&&r.text) bb.text.unshift('퀴즈 '+r.text);
    const at=kstDay(r.at); if(at&&(!bb.at||at>bb.at)) bb.at=at; if(at&&(!s.first||at<s.first)) s.first=at; });
  // 8/29 리뷰 F-19: 신청만 하고 활동 0인 학생도 줄을 만든다(전부 '—') — 화면 문구 "안 한 책도 —로 줄이 남습니다"와 맞춤
  enroll.forEach(e=>{ const s=byStu[e.student_id]||(byStu[e.student_id]={books:{},first:null}); if(!s.first&&e.joined_at) s.first=kstDay(e.joined_at); s.done_at=e.done_at; });
  const doneBook=bb=>bb && (need.length?need.every(k=>bb.acts[k]):Object.keys(bb.acts).length>0);
  const list=Object.keys(byStu).map(sid=>{ const s=byStu[sid]; const cnt=books.filter(b=>doneBook(s.books[bkey(b.key)])).length; return {sid,s,cnt}; }).sort((a,b)=>b.cnt-a.cnt||a.sid.localeCompare(b.sid));
  return {books,list,need,m,doneBook,bkey};
}
// 상세 엑셀 행(전부: N명 × 책) — 시상용, 학번 포함
function chMatrixRows(d, headLine){
  const {books,list,doneBook,bkey}=chBuildMatrix(d); const p=d.program||{};
  const rows=[['챌린지: '+(p.title||''),'기간: '+(p.start_date||'')+' ~ '+(p.end_date||''),headLine],[],['학번','진척(권)','완주','도서명','완료','쓴 내용','참여한 날짜','완료한 날짜']];
  list.forEach(x=>{ books.forEach(b=>{ const bb=x.s.books[bkey(b.key)]; const ok=doneBook(bb); rows.push([x.sid,x.cnt,(x.cnt===books.length&&books.length>0)?'완주':'',b.title||b.key,ok?'○':'—',bb?bb.text.join(' / '):'',x.s.first||'',ok&&bb?(bb.at||''):'']); }); });
  return rows;
}
// (8/17 시안: 상세 표 renderChDetail·downloadChDetailExcel 제거 — 상세는 downloadChExcel이 stats_challenge_detail → chMatrixRows 로 바로 엑셀)
const chFileTitle=(p)=>String((p&&p.title)||'').replace(/[\\/:*?"<>|,·\s]+/g,'');   // 파일명 안전 + 시안 예('AI다음나의자리')처럼 쉼표·가운뎃점도 뺌
// (보존·미사용) 운영이력 [명단 엑셀] — 확정 시점에 얼린 detail로 만든다(지금 다시 세지 않음). 8/17 시안: 결과확정 UI 제거, 함수 보존
async function chFixedExcel(id){
  try{ const f=await statsOp('ch_fixed_get',{program:id}); if(!f||!f.detail){ toast('확정본이 없어요'); return; }
    const at=String(f.fixed_at||'').slice(0,10);
    xlsxDownload('북스타_독서챌린지_확정명단_시상용_'+chFileTitle(f.detail.program)+'_'+at, [{name:'확정 명단',rows:chMatrixRows(f.detail,'확정일: '+at+' (이 명단은 확정 시점 값으로 얼려 있음)')}]);
  }catch(e){ toast('확정본을 불러오지 못했어요 — '+String(e.message||e)); }
}

/* ══════════ 4. 피드관리(학생 글) — 기간·종류 정해 엑셀 1장 + '부적절한 글 숨기기' 최근 10건 ══════════
   8/17 시안: 여기는 챌린지 밖에서 쓴 글만(challenge_id 없는 bookstar_writings + reviews 독자 서평). 챌린지 글은 「챌린지 통계」 상세 엑셀에서. */
let FEEDV=null, FEED_FAILED=false;   // WRITINGS 선언은 위 '학생 글' 구역
let _wrSeq=0;     // 기간을 연달아 바꿔도 마지막 응답만 화면에(경합 방지)
const WR_MIN={oneline:5,question:5,review:300,essay:800,rv:100};   // 학생 앱 CH_MISSIONS min 과 동일. rv(독자 서평)=학생 앱 100자 기준(8/29 리뷰 W6). 글자 수 미달 = 미인정
// 8/29 리뷰 W1: 서버 시각은 세계표준시(…T16:00Z) — 그대로 자르면 자정~오전 9시 글이 전날로 찍힌다. 한국시간 날짜로.
function kstDay(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return String(iso).slice(0,10); return new Date(d.getTime()+9*3600*1000).toISOString().slice(0,10); }
// 8/29 리뷰 W2: 조회에 개수 제한이 없으면 서버 상한(1,000)에서 조용히 잘린다 → 1,000건씩 끝까지 이어 받는다
async function fetchAllRows(path){
  const out=[], PAGE=1000;
  for(let from=0; ; from+=PAGE){
    const r=await sbGetAnon(path,{range:`${from}-${from+PAGE-1}`});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const a=await r.json(); if(!Array.isArray(a)) break;
    out.push(...a); if(a.length<PAGE) break;
  }
  return out;
}
function initFeedDates(){ if(el('fdFrom')&&!el('fdFrom').value){ const [f,t]=presetRange('d30'); el('fdFrom').value=f; el('fdTo').value=t; } }
function setFeedRange(b,k){ segOn(b); const [f,t]=presetRange(k); el('fdFrom').value=f; el('fdTo').value=t; fdSum(); loadWritings(); }
function fdSum(){
  initFeedDates();
  const [f,t]=rangeOf('fdFrom','fdTo'); const e=el('fdSumLine'); if(!e) return;
  if(!mark('pkFeed')){ e.innerHTML='<b style="color:var(--bad)">받을 자료를 골라 주세요.</b>'; return; }
  e.innerHTML='<b>'+esc(f)+' ~ '+esc(t)+'</b> · 종류 <b>'+esc(selText('fdMs'))+'</b><br>엑셀 한 개 · 시트 <b>1장</b> — 학생 글 목록 '
    +'<span class="chip done">학번 · 글 전문 있음</span><br>파일 이름 &nbsp;<b>'+esc(fdFileName(f,t))+'.xlsx</b>';
}
const fdFileName=(f,t)=>'북스타_학생글_'+f+'_'+t;
async function loadWritings(){
  initFeedDates();
  const f=el('fdFrom').value, t=el('fdTo').value; if(!f||!t||f>t){ return; }
  const seq=++_wrSeq;
  el('fdTbl').innerHTML=stEmpty(6,'불러오는 중…');
  const rng=`created_at=gte.${encodeURIComponent(kst(f))}&created_at=lt.${encodeURIComponent(kst(nextDay(t)))}`;
  let list=[], failed=false;   // 8/18 리뷰: 실패를 삼키면 빈 엑셀이 조용히 내려감 → 실패 표시
  // 챌린지 밖에서 쓴 글만(challenge_id 없음) — 시안: 챌린지 글은 여기 없음
  try{ list=await fetchAllRows(`/bookstar_writings?school_id=eq.${ST_SCHOOL}&challenge_id=is.null&${rng}&order=created_at.desc&select=*`); }catch(e){ failed=true; }
  // 독자 서평(reviews = 빌린 책에서 쓴 상시 서평)도 같은 표에 합류(8/17) — activity 'rv', id 는 'rv:'+reviews.id 로 구분(챌린지 글 id 와 안 겹치게)
  try{ const rv=await fetchAllRows(`/reviews?school=eq.${encodeURIComponent('세명대학교')}&${rng}&order=created_at.desc&select=id,student_id,reviewer,book_id,book_title,body,rating,hidden,created_at`);
    rv.forEach(x=>list.push({id:'rv:'+x.id,rv_id:x.id,student_id:x.student_id||x.reviewer||'-',book_id:x.book_id,book_title:x.book_title,activity:'rv',text:x.body,hidden:!!x.hidden,created_at:x.created_at,challenge_id:null}));
  }catch(e){ failed=true; }
  if(seq!==_wrSeq) return null;   // 그 사이 다른 기간 요청이 나갔으면 버림(실패 아님 — 8/29 리뷰 W9)
  list.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  WRITINGS=list; FEEDV=failed?null:{from:f,to:t}; FEED_FAILED=failed; renderWritings();
  if(failed) toast('학생 글을 다 불러오지 못했어요 — 잠시 후 다시 시도해 주세요');
  return !failed;
}
const wrTitle=w=>w.activity==='rv'?(w.book_title||bookTitleOf(String(w.book_id||'').replace(/^sm-/,''))):bookTitleOf(w.book_id);
const wrShort=w=>{ const min=WR_MIN[w.activity]; return !!(min && String(w.text||'').trim().length<min); };   // 글자 수 미달(미인정)
function bookTitleOf(id){ id=String(id||'');
  try{ if(/^gb-/.test(id)&&typeof CLASSICS_KO!=='undefined'&&CLASSICS_KO[id]) return CLASSICS_KO[id]; }catch(e){}
  try{ if(/^kr-/.test(id)&&typeof BOOKS_CLASSICS_KR!=='undefined'){ const b=BOOKS_CLASSICS_KR.find(x=>x.id===id); if(b&&b.title) return b.title; } }catch(e){}
  for(const p of PROGRAMS){ for(const b of (p.books||[])){ if(b.isbn===id||b.isbn==='sm-'+id||('sm-'+(b.isbn||''))===id) return b.t||b.title||id; } } return id; }
// '3. 부적절한 글 숨기기' — 최근 10건만(시안: 「더 보기」 없음). 종류(fdMs)·보기(fdView) 필터
function renderWritings(){
  const tb=el('fdTbl'); if(!tb) return;
  const ms=el('fdMs')?el('fdMs').value:'', view=el('fdView')?el('fdView').value:'on';
  const rows=WRITINGS.filter(w=>(view==='on'?!w.hidden:!!w.hidden)&&(!ms||w.activity===ms));
  const LIMIT=10;
  tb.innerHTML = rows.length ? rows.slice(0,LIMIT).map(w=>{
    const tag=w.hidden?`<span class="chip bad">숨김</span>`
                     :(wrShort(w)?'<span class="chip end">미인정 · 글자 수 미달</span>':'');
    return `<tr class="${w.hidden?'hid':''}"><td><b>${esc(w.student_id)}</b></td><td>${esc(kstDay(w.created_at))}</td><td>${esc(ACT_KO[w.activity]||w.activity)}</td><td>${esc(wrTitle(w))}</td>
      <td><div class="fd-txt">${w.hidden?'숨긴 글입니다':esc(w.text)}</div>${tag?`<div style="margin-top:5px">${tag}</div>`:''}</td>
      <td><button class="btn-ghost" style="padding:6px 11px;font-size:12px" onclick="wrToggleHide('${esc(String(w.id))}')">${w.hidden?'다시 보이기':'숨기기'}</button></td></tr>`; }).join('')
    : stEmpty(6, FEEDV ? '해당하는 글이 없어요.' : (FEED_FAILED ? '불러오지 못했어요 — 기간을 다시 고르거나 잠시 후 시도해 주세요' : '불러오는 중…'));   // 8/29 리뷰 W8: 실패가 "불러오는 중…"으로 영구 표시되던 것
}
async function wrToggleHide(id){
  const w=WRITINGS.find(x=>String(x.id)===String(id)); if(!w) return;
  const to=!w.hidden, isRv=w.activity==='rv';
  if(to && !confirm(isRv?'이 서평을 숨길까요? 학생 화면(책 상세·서평 목록)에서 내려갑니다.':'이 글을 숨길까요? 학생 화면에서 내려갑니다.')) return;
  try{ const r=await adminSave(isRv
        ? {op:'reviews_hide', id:w.rv_id, hidden:to}
        : {op:'writings_hide', school:ST_SCHOOL, student_id:w.student_id, activity:w.activity, book_id:w.book_id, hidden:to});
    const j=r.ok?await r.json():null; if(!j||!j.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
    w.hidden=to; renderWritings(); toast(to?'숨겼어요':'다시 보이게 했어요'); }
  catch(e){ toast('처리하지 못했어요 — '+String(e.message||e)); }
}
// 8/29 사장님 지시: 사서 '우수작' 선정 기능 전부 삭제 (wrFeature·featured 표시·정렬·서버 경로). 숨김(hidden)만 남는다.
// [엑셀 다운로드] — 기간(fdFrom~fdTo)·종류(fdMs) 조건의 학생 글 전부 1장. 화면 목록(10건)과 달리 숨긴 글도 '숨김' 표시로 함께
function downloadFeedExcel(btn){
  const [f,t]=rangeOf('fdFrom','fdTo'); if(!rangeOk(f,t)) return;
  if(!ck('pkFeed')){ fdSum(); toast('받을 자료를 골라 주세요'); return; }
  return withBusy(btn, async()=>{
    if(!FEEDV||FEEDV.from!==f||FEEDV.to!==t){ const ok=await loadWritings(); if(ok===false){ toast('불러오지 못했어요 — 잠시 후 다시 시도해 주세요'); return; } }
    const ms=el('fdMs')?el('fdMs').value:'';
    const list=WRITINGS.filter(w=>!ms||w.activity===ms);
    const rows=[[fmtRange(f,t)+(ms?' · 종류: '+(ACT_KO[ms]||ms):'')],[],['학번','날짜','종류','도서명','쓴 내용','숨김'],
      ...list.map(w=>[w.student_id,kstDay(w.created_at),ACT_KO[w.activity]||w.activity,wrTitle(w),w.text,w.hidden?'숨김':''])];
    xlsxDownload(fdFileName(f,t), [{name:'학생 글 목록',rows:rows}]);
  });
}

/* ══════════ 5. 운영이력 — 끝난 챌린지·큐레이션을 기간(종료일 기준)으로 골라 엑셀 1개 2시트 + '지난 목록' 10줄(숫자 없음) ══════════
   8/17 시안: 진행중·지금 걸린 칸 실적(stats_curation)·확정 명단 [명단 엑셀] 은 두지 않는다. 시상 명단은 「챌린지 통계」 상세 엑셀. */
let HSHIST=null, HS_FAILED=false;   // stats_curation_history (끝난 큐레이션 — 트리거 자동 기록, 8/17부터)
const fmtD=(s)=>kstDay(s);   // 8/29 리뷰: 시각(ended_at 등)은 한국시간 날짜로. 날짜만 있는 값(end_date)은 그대로
function initHsDates(){ if(el('hsFrom')&&!el('hsFrom').value){ const [f,t]=presetRange('y'); el('hsFrom').value=f; el('hsTo').value=t; } }
function setHsRange(b,k){ segOn(b); const [f,t]=presetRange(k); el('hsFrom').value=f; el('hsTo').value=t; hsSum(); renderHist(); }
// 끝난 챌린지: 종료일이 지난 것(지금 다시 센 값). FIXED 는 8/17 시안 이후 비어 있어(로드 안 함) 항상 현재 값
function hsEndedList(){ const today=ymd(new Date());
  // 8/29 리뷰 H3: 서버 함수가 프로그램 종류를 안 걸러 끝난 '큐레이션' 발행물이 챌린지 이력에 섞였다 → 챌린지만
  return CHS.filter(c=>String(c.type||'').includes('챌린지')).filter(c=>c.end_date&&c.end_date<today).sort((a,b)=>String(b.end_date).localeCompare(String(a.end_date)))
    .map(c=>{ const f=FIXED[String(c.id)]; const s=f&&f.summary||null; return Object.assign({}, c, {part_v:s?s.part:c.part, done_v:s?s.done:c.done, fixed:!!f, fixed_at:f?String(f.fixed_at||'').slice(0,10):''}); }); }
// 기간 안에 끝난 것만(종료일 기준)
function hsInRange(){ const [f,t]=rangeOf('hsFrom','hsTo');
  const ch=hsEndedList().filter(c=>{ const d=fmtD(c.end_date); return (!f||d>=f)&&(!t||d<=t); });
  const cur=(HSHIST||[]).filter(r=>{ const d=fmtD(r.ended_at); return d&&(!f||d>=f)&&(!t||d<=t); }).sort((a,b)=>String(b.ended_at||'').localeCompare(String(a.ended_at||'')));
  return {ch,cur}; }
function hsSum(){
  initHsDates();
  const [f,t]=rangeOf('hsFrom','hsTo'); const a=mark('pkHsCh'), b=mark('pkHsCur'), on=[];
  if(a) on.push('챌린지 이력'); if(b) on.push('큐레이션 이력');
  const e=el('hsSumLine'); if(!e) return;
  if(!on.length){ e.innerHTML=NEED_PICK; return; }
  e.innerHTML='<b>'+esc(f)+' ~ '+esc(t)+'</b> 안에 끝난 것<br>엑셀 한 개 · 시트 <b>'+on.length+'장</b> — '+on.join(' · ')
    +' <span class="chip end">학번 없음</span><br>파일 이름 &nbsp;<b>'+esc(hsFileName(f,t))+'.xlsx</b>';
}
const hsFileName=(f,t)=>'북스타_운영이력_'+f+'_'+t;
// 목록·엑셀 원천 로드(챌린지 = stats_challenges, 큐레이션 = stats_curation_history). 한 번 받으면 재사용, force 면 다시
async function hsLoad(force){
  const jobs=[];
  let failed=false;
  if(force||!CHS.length) jobs.push(loadChs().catch(()=>{ failed=true; }));
  // 8/29 리뷰 H2: 실패 때 HSHIST=[] 로 두면 다음 hsLoad가 "이미 있다"고 보고 재시도를 건너뛰어 빈 엑셀이 내려갔다 → 실패면 null 유지(=다음에 다시 시도)
  if(force||!HSHIST) jobs.push(statsOp('stats_curation_history').then(h=>{ HSHIST=Array.isArray(h)?h:[]; }).catch(()=>{ failed=true; HSHIST=null; }));
  await Promise.all(jobs);
  HS_FAILED=failed;
  return !failed;   // 8/18 리뷰: 실패를 삼키면 빈 엑셀이 조용히 내려감 → 호출부가 판단
}
async function renderHistory(){ initHsDates(); hsSum(); const tb=el('hsTbl'); if(tb&&!HSHIST) tb.innerHTML=stEmpty(4,'불러오는 중…');
  const ok=await hsLoad(true); renderHist();
  if(!ok) toast('운영이력을 불러오지 못했어요 — 잠시 후 다시 열어 주세요');   // 8/29 리뷰 H1: 실패가 "끝난 것이 없어요"로 둔갑하던 것
}
// '3. 지난 목록' — 구분·이름·기간·미션/위치, 최근 끝난 순 10줄, 숫자 없음. 체크 안 한 종류는 목록에서도 뺀다(시안 renderHist)
function renderHist(){
  const tb=el('hsTbl'); if(!tb) return;
  const a=ck('pkHsCh'), b=ck('pkHsCur'); const {ch,cur}=hsInRange();
  const items=[];
  if(a) ch.forEach(c=>items.push({end:fmtD(c.end_date), kind:chType(c.type).replace(' 챌린지',''), name:c.title, term:fmtD(c.start_date)+' ~ '+fmtD(c.end_date), sub:chMissionLabel(c.mission)}));
  if(b) cur.forEach(r=>items.push({end:fmtD(r.ended_at), kind:'큐레이션', name:r.title||('(제목 없는 칸) '+r.slot), term:fmtD(r.started_at)+' ~ '+fmtD(r.ended_at), sub:AREA_LABELS[r.area]||r.area||''}));
  items.sort((x,y)=>String(y.end).localeCompare(String(x.end)));
  tb.innerHTML = items.length ? items.slice(0,10).map(x=>`<tr><td><span class="chip end">${esc(x.kind)}</span></td><td><b>${esc(x.name)}</b></td><td>${esc(x.term)}</td><td class="db-sub2">${esc(x.sub)}</td></tr>`).join('')
    : stEmpty(4,(a||b)?(HS_FAILED?'불러오지 못했어요 — 잠시 후 다시 열어 주세요':'이 기간에 끝난 것이 없어요.'):'고른 자료가 없어요.');
}
function downloadHistExcel(btn){
  const [f,t]=rangeOf('hsFrom','hsTo'); if(!rangeOk(f,t)) return;
  const a=ck('pkHsCh'), b=ck('pkHsCur'); if(!a&&!b){ hsSum(); toast('받을 자료를 하나 이상 골라 주세요'); return; }
  return withBusy(btn, async()=>{
    const ok=await hsLoad(false);
    if(ok===false){ toast('불러오지 못했어요 — 잠시 후 다시 시도해 주세요'); return; }
    const {ch,cur}=hsInRange(); const per=[fmtRange(f,t)+' (종료일 기준)'], sheets=[];
    if(a) sheets.push({name:'챌린지 이력',rows:[per,[],['구분','이름','시작','종료','미션','시상','참가','완주'],...ch.map(c=>[chType(c.type),c.title,c.start_date||'',c.end_date||'',chMissionLabel(c.mission),chRewardText(c),c.part_v,c.done_v])]});
    if(b) sheets.push({name:'큐레이션 이력',rows:[per,[],['이름','시작','끝','위치','담긴 책','조회','이용'],...cur.map(r=>[r.title||'',fmtD(r.started_at),fmtD(r.ended_at),AREA_LABELS[r.area]||r.area||'',r.books_n!=null?r.books_n:'',r.views,r.uses])]});
    xlsxDownload(hsFileName(f,t), sheets);
  });
}

