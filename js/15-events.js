/* ═══ 측정 로그 v2 — bookstar_events (2026-08-17) · 설계: klever_demo/_측정로그_설계_20260817.md ═══
   관리자 5화면(접속·조회·이용·활동·경로·출처)의 유일한 원천. 추가 전용(anon INSERT만), 실패해도 앱 동작엔 영향 없음.
   kind: visit 접속 / view 상세 조회 / read 고전 읽기(뷰어 닫을 때 1줄) / link 도서관 연결(찾아줘북즈·예약·전자책대출·크레마·OPAC) / activity 글쓰기 */
const BX_EV_URL = SB_REST+'/bookstar_events';
function _bxSess(){ try{ let s=sessionStorage.getItem('bx_sess'); if(!s){ s='s_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); sessionStorage.setItem('bx_sess',s); } return s; }catch(e){ return 'nosess'; } }
// 출처(origin): 클릭한 요소의 가장 가까운 [data-origin] 조상에서 읽는다 — 호출처 15곳을 하나하나 안 고치기 위한 위임 방식
window._bxOrigin=null;
document.addEventListener('click', e=>{
  try{
    const t=e.target; if(!t||!t.closest) return;
    const el=t.closest('[data-origin]');
    if(el) window._bxOrigin={origin:el.getAttribute('data-origin')||'unknown', id:el.getAttribute('data-origin-id')||'', ts:Date.now()};
    // 상세 모달 안의 외부 링크(크레마·OPAC)는 <a>라 JS 훅이 없다 → 여기서 링크 이벤트로 기록
    const a=t.closest('#lcDetail a[href]');
    if(a){
      const b=window._lcCurBook||null;
      if(a.classList.contains('t-sub')) bxEvent('link',{sub:'crema_open', book:b, item_type:'ebook'});
      else if(a.classList.contains('t-paper')||a.hasAttribute('data-pwup')) bxEvent('link',{sub:'opac_open', book:b, item_type:'paper'});
    }
  }catch(_){}
}, true);
function _bxOriginNow(){ const o=window._bxOrigin; return (o && Date.now()-o.ts<4000) ? o : {origin:'unknown',id:''}; }
// 책 객체 → 유형(paper·ebook·foreign·korean·external)·키·제목. 사장님 화면 '유형' 4종의 근거.
function bxItemOf(b){
  if(!b) return {item_type:'none',item_key:'',item_title:''};
  const id=String(b.id||'');
  if(/^(gb|kr)-/.test(id)){
    const c=(typeof clOf==='function')?clOf(b):b;
    return {item_type:id.indexOf('gb-')===0?'foreign':'korean', item_key:id, item_title:cleanT(c.title||b.t||b.title||'')};
  }
  const isbn=String(b.isbn||''); const rk=isbn.replace(/^sm-/,''); const tags=b.tags||[];
  let t='external';
  if(tags.includes('ebook')) t='ebook';
  else if(tags.includes('paper')) t='paper';
  else if(tags.includes('sub')) t='ebook';
  else if(/^sm-CATTOT/i.test(isbn) || (b._material && /^sm-/.test(isbn))) t='paper';   // fmtTags()와 같은 판정
  else if(/^sm-/.test(isbn) || b._sm || b.lib || b._smLib) t='ebook';
  return {item_type:t, item_key:(/^sm-/.test(isbn)?rk:isbn), item_title:cleanT(b.t||b.title||'')};
}
function bxBookByKey(key){
  key=String(key||'');
  try{ if(typeof BOOKS!=='undefined'){ const c=BOOKS.find(x=>x.id===key); if(c) return c; } }catch(e){}
  try{ if(typeof LIB_POOL!=='undefined'){ const l=LIB_POOL.find(x=>x.isbn===key||x.isbn==='sm-'+key); if(l) return l; } }catch(e){}
  return /^(gb|kr)-/.test(key)?{id:key}:{isbn:key};
}
let _bxLastView={key:'',ts:0};
function bxEvent(kind, o){
  try{
    o=o||{};
    const it = o.book ? bxItemOf(o.book) : {item_type:'none',item_key:'',item_title:''};
    if(o.item_type) it.item_type=o.item_type;
    if(o.item_key)  it.item_key=String(o.item_key);
    if(o.item_title) it.item_title=String(o.item_title);
    if(kind==='view'){   // 같은 책 30초 안 재열림(더블클릭·재렌더)은 1건
      const k=it.item_type+':'+it.item_key; if(k===_bxLastView.key && Date.now()-_bxLastView.ts<30000) return; _bxLastView={key:k,ts:Date.now()};
    }
    const org = o.origin ? {origin:o.origin, id:o.origin_id||''} : _bxOriginNow();
    let pid = o.program_id;
    if(pid===undefined){ try{ const c=(o.book&&typeof chalForBook==='function')?chalForBook(o.book):null; pid=c?String(c.id):null; }catch(e){ pid=null; } }
    const row={ school_id:(typeof CH_SCHOOL!=='undefined'?CH_SCHOOL:'hankuk'), student_id:_bxSid(), session_id:_bxSess(),
      kind:kind, sub:o.sub||null, item_type:it.item_type||'none', item_key:it.item_key||null, item_title:(it.item_title||'').slice(0,200)||null,
      origin:org.origin||'unknown', origin_id:(org.id||'').slice(0,120)||null, program_id:pid||null,
      ref_table:o.ref_table||null, ref_id:o.ref_id?String(o.ref_id).slice(0,200):null,
      ok:o.ok!==false, seconds:(o.seconds!=null?Math.max(0,Math.round(o.seconds)):null), meta:o.meta||{} };
    fetch(BX_EV_URL,{method:'POST',headers:{...BX_H,Prefer:'return=minimal'},body:JSON.stringify(row),keepalive:!!o.beacon}).catch(()=>{});
  }catch(e){}
}
// 접속(visit): 탭당 1회. guest도 남기되 '접속 학생' 집계는 학번만 센다.
function bxVisitOnce(){
  try{ const k='bx_visit_'+_bxSid(); if(sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); }catch(e){}
  bxEvent('visit',{origin:'direct', sub:(bxStudent()?'student':'guest')});
}
// 고전 읽기(read): 뷰어가 열려 있는 동안 readerSessionEnd()가 초를 누적, 닫을 때(또는 탭 이탈) 1줄로 보냄.
let _bxReadSec=0, _bxReadBook=null;
function bxReadAcc(sec, book){ if(sec>0){ _bxReadSec+=sec; _bxReadBook=book||_bxReadBook; } }
function bxReadFlush(beacon){
  if(!_bxReadBook || _bxReadSec<=0){ _bxReadSec=0; return; }
  const b=_bxReadBook, s=_bxReadSec; _bxReadSec=0; _bxReadBook=null;
  bxEvent('read',{sub:'session', book:b, seconds:s, origin:'reader', meta:{mode:(typeof currentMode!=='undefined'?currentMode:'')}, beacon:!!beacon});
}
// 활동 자동 미인정 규칙(설계 §4) — 학생 화면 문구와 동일. 통과 못 하면 {ok:false, reason, msg}
function bxWriteCheck(v, kind, min){
  const s=String(v||'').trim(); const flat=s.replace(/\s/g,'');
  if(min && s.length<min) return {ok:false, reason:'min', msg:min+'자 이상 적어 주세요.'};
  if(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(s) || /https?:\/\/|www\./i.test(s) || /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(s)) return {ok:false, reason:'contact', msg:'연락처·링크가 들어간 글은 인정되지 않아요.'};
  if(flat.length>=5 && new Set(flat).size<=3) return {ok:false, reason:'repeat', msg:'같은 글자만 반복한 글은 인정되지 않아요.'};
  return {ok:true};
}
// 로컬 독서기록(챌린지 캐시·참여목록)을 한 계정 → 다른 계정으로 이관·병합. SSO 방식과 무관한 순수 로컬 유틸.
// 데모: 게스트로 읽다 로그인 시 진행이 안 날아가게. SSO 후에도 동일 함수로 재사용 가능.
function _migrateChalRecords(fromId, toId){
  if(!fromId || !toId || fromId===toId) return;
  try{
    const pre='bookstar-chal-'+fromId+'-', keys=[];
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf(pre)===0) keys.push(k); }
    keys.forEach(fk=>{
      const bookId=fk.slice(pre.length);
      const from=JSON.parse(localStorage.getItem(fk)||'null'); if(!from) return;
      const tk='bookstar-chal-'+toId+'-'+bookId;
      const to=JSON.parse(localStorage.getItem(tk)||'null')||{};
      const merged=Object.assign({}, from, to, {   // 더 진행된 값 우선
        read_pct:Math.max(from.read_pct||0, to.read_pct||0),
        read_sec:Math.max(from.read_sec||0, to.read_sec||0),
        char_pct:Math.max(from.char_pct||0, to.char_pct||0),
        submitted:!!(from.submitted||to.submitted),
        ans:Object.assign({}, from.ans||{}, to.ans||{}),
        ts:Date.now()
      });
      localStorage.setItem(tk, JSON.stringify(merged));
      localStorage.removeItem(fk);
    });
    const fj='bookstar-joined-chals-'+fromId, tj='bookstar-joined-chals-'+toId, fjv=localStorage.getItem(fj);
    if(fjv){ try{ const fa=JSON.parse(fjv)||[], ta=JSON.parse(localStorage.getItem(tj)||'[]')||[];
      localStorage.setItem(tj, JSON.stringify([...new Set([...ta, ...fa])])); }catch(e){}
      localStorage.removeItem(fj); }
  }catch(e){}
}
function _chalKey(bookId){ return 'bookstar-chal-'+_bxSid()+'-'+bookId; }   // 계정별 로컬 캐시 키
function _chalRead(bookId){ try{ return JSON.parse(localStorage.getItem(_chalKey(bookId))||'null'); }catch(e){ return null; } }
function _chalWriteLocal(bookId, obj){ try{ localStorage.setItem(_chalKey(bookId), JSON.stringify(obj)); }catch(e){} }
function _chalMerge(bookId, patch){   // 기존 기록에 일부만 갱신(퀴즈↔읽기% 서로 안 덮어쓰게)
  const cur = _chalRead(bookId) || {ans:{}, impression:'', submitted:false, read_pct:0};
  const next = Object.assign(cur, patch, {ts:Date.now()});
  _chalWriteLocal(bookId, next); return next;
}
async function bxUpsertRead(bookId, pct, sec){   // 읽기 진행률(완독율 v4)+독서시간만 서버 저장(퀴즈 컬럼 보존)
  const s=bxStudent(); if(!s) return;
  const row={student_id:s.id,book_id:bookId,read_pct:pct,updated_at:new Date().toISOString()};
  if(typeof sec==='number') row.read_sec=Math.round(sec);
  try{ await fetch(`${BX_SB}/bookstar_challenge_results?on_conflict=student_id,book_id`,
    {method:'POST',headers:{...BX_H,Prefer:'resolution=merge-duplicates,return=minimal'},
     body:JSON.stringify(row)}); }catch(e){}
}
async function bxUpsertResult(bookId, obj){          // 서버 저장(계정별·책별 upsert)
  const s=bxStudent(); if(!s) return;
  const sc=(typeof CHALLENGE_SCENES!=='undefined')?CHALLENGE_SCENES[bookId]:null;
  const arr=Object.values(obj.ans||{}); const ok=arr.filter(a=>a.ok).length;
  const total=sc?sc.scenes.reduce((t,x)=>t+x.quiz.length,0):0;
  const score=ok*10+(obj.submitted?50:0);
  try{
    await fetch(`${BX_SB}/bookstar_challenge_results?on_conflict=student_id,book_id`,
      {method:'POST',headers:{...BX_H,Prefer:'resolution=merge-duplicates,return=minimal'},
       body:JSON.stringify({student_id:s.id,book_id:bookId,ans:obj.ans||{},impression:obj.impression||'',quiz_ok:ok,quiz_total:total,score,submitted:!!obj.submitted,updated_at:new Date().toISOString()})});
  }catch(e){}
}
async function bxLoadResultsFromDB(){                // 로그인/전환 시 서버→로컬 캐시
  const s=bxStudent(); if(!s) return;
  const sid=s.id;   // 요청 세대 캡처
  try{
    const r=await sbGet(`/bookstar_challenge_results?student_id=eq.${encodeURIComponent(sid)}&select=*`);
    if(!r.ok) return; const rows=await r.json(); if(!Array.isArray(rows)) return;
    if((bxStudent()||{}).id!==sid) return;   // 응답 대기 중 다른 계정으로 전환됐으면 폐기(계정간 기록 혼입 방지)
    // 통째 교체가 아닌 병합: cert_prompted 등 로컬 전용 필드 보존 + read_pct는 max(서버 upsert 실패분 후퇴 방지)
    rows.forEach(x=>{
      const cur=_chalRead(x.book_id)||{};
      _chalWriteLocal(x.book_id, Object.assign({}, cur, {
        ans:(x.ans&&Object.keys(x.ans).length)?x.ans:(cur.ans||{}),
        impression:x.impression||cur.impression||'',
        submitted:!!(cur.submitted||x.submitted),
        read_pct:Math.max(cur.read_pct||0, x.read_pct||0),
        read_sec:Math.max(cur.read_sec||0, x.read_sec||0),   // 완독율 v4: 독서시간도 다기기 최댓값 병합
        quiz_total:(x.quiz_total||cur.quiz_total||0),   // 미션 패널 퀴즈 문항수(카드 '퀴즈 n/N')
        ts:Date.now()
      }));
    });
  }catch(e){}
}
let _rsServerTimer=null;
function bxUpsertReaderStats(){            // 리더 통계(읽은시간·streak·하이라이트·책갈피·위치) 서버 동기화 — 계정별 1행, 디바운스
  const s=(typeof bxStudent==='function')?bxStudent():null; if(!s||!s.id) return;
  clearTimeout(_rsServerTimer);
  _rsServerTimer=setTimeout(()=>{
    _rsServerTimer=null;
    try{ fetch(`${BX_SB}/bookstar_reader_stats?on_conflict=student_id`,
      {method:'POST',headers:{...BX_H,Prefer:'resolution=merge-duplicates,return=minimal'},
       body:JSON.stringify({student_id:s.id,data:readerStats,updated_at:new Date().toISOString()})}); }catch(e){}
  }, 1500);
}
function _rsFlushNow(){   // 탭 종료·화면 이탈 시 대기 중(1.5초 디바운스) 동기화를 keepalive로 즉시 발사 — 마지막 세션 기록 유실 방지
  if(!_rsServerTimer) return;
  clearTimeout(_rsServerTimer); _rsServerTimer=null;
  const s=(typeof bxStudent==='function')?bxStudent():null; if(!s||!s.id) return;
  try{ fetch(`${BX_SB}/bookstar_reader_stats?on_conflict=student_id`,
    {method:'POST',headers:{...BX_H,Prefer:'resolution=merge-duplicates,return=minimal'},keepalive:true,
     body:JSON.stringify({student_id:s.id,data:readerStats,updated_at:new Date().toISOString()})}); }catch(e){}
}
window.addEventListener('pagehide', ()=>{ try{ if(_viewerOpen()) readerSessionEnd(); }catch(e){} try{ bxReadFlush(true); }catch(e){} _rsFlushNow(); });
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) _rsFlushNow(); });
function _rsMergeServer(sv){               // 서버 데이터 ⊕ 로컬 (다기기 안전: 맵 합집합, 읽은시간 최댓값, 하이라이트·책갈피는 원소 단위)
  if(!sv||typeof sv!=='object') return;
  const L=readerStats;
  L.completedChapters=Object.assign({}, sv.completedChapters||{}, L.completedChapters||{});
  ['positions','pagePos'].forEach(k=>{   // 읽던 위치: 책별 최신(t) 우선 — 옛 로컬이 다른 기기의 최신 위치를 덮지 않게(t 없는 구기록은 로컬 우선)
    const out=Object.assign({}, sv[k]||{});
    for(const bid in (L[k]||{})){
      const lv=L[k][bid], svv=out[bid];
      out[bid]=(svv&&typeof svv==='object'&&lv&&typeof lv==='object'&&(svv.t||0)>(lv.t||0))?svv:lv;
    }
    L[k]=out;
  });
  // 삭제 기록(톰스톤) 합집합 — 한쪽 기기에서 지운 형광펜·책갈피가 병합으로 되살아나지 않게. 90일 지난 기록은 정리
  const del=Object.assign({}, sv.deleted||{}, L.deleted||{});
  const cut=Date.now()-90*86400000; for(const k in del){ if(del[k]<cut) delete del[k]; }
  L.deleted=del;
  // 하이라이트·책갈피: 책 단위 통째 교체(마지막 저장이 이김)가 아닌 원소(ts) 단위 합집합 — 다기기 형광펜 유실 방지
  [['highlights','h'],['bookmarks','b']].forEach(([k,pf])=>{
    const out={};
    new Set([...Object.keys(sv[k]||{}), ...Object.keys(L[k]||{})]).forEach(bid=>{
      const seen=new Set(), m=[];
      [...((L[k]||{})[bid]||[]), ...((sv[k]||{})[bid]||[])].forEach(x=>{
        if(!x||seen.has(x.ts)||del[pf+x.ts]) return;
        seen.add(x.ts); m.push(x);
      });
      m.sort((a,b)=>(a.ts||0)-(b.ts||0));
      out[bid]=m;
    });
    L[k]=out;
  });
  const days={}, sd=(sv.readingTime&&sv.readingTime.days)||{}, ld=(L.readingTime&&L.readingTime.days)||{};
  for(const k in sd) days[k]=Math.max(days[k]||0, Math.round(sd[k]||0));
  for(const k in ld) days[k]=Math.max(days[k]||0, Math.round(ld[k]||0));
  let tot=0; for(const k in days) tot+=days[k];
  L.readingTime={total:tot, days:days};
  // streak: 최신 날짜 쪽 기준 — 하루 차이(이어 읽음)면 이어붙이고, 같은 날이면 큰 쪽, 끊겼으면 옛 카운트 부활 금지
  const ss=sv.streak||{}, ls=L.streak||{};
  const newer=((ss.last||'')>(ls.last||''))?ss:ls, older=(newer===ss)?ls:ss;
  let cnt=newer.count||0;
  if((older.last||'')&&(newer.last||'')){
    const gap=Math.round((new Date(newer.last)-new Date(older.last))/86400000);
    if(gap===0) cnt=Math.max(cnt, older.count||0);
    else if(gap===1) cnt=Math.max(cnt, (older.count||0)+1);
  }
  L.streak={last:newer.last||'', count:cnt};
}
async function bxLoadReaderStats(){        // 로그인/전환 시 서버 리더통계 → 로컬 병합 후 재렌더
  const s=(typeof bxStudent==='function')?bxStudent():null; if(!s||!s.id) return;
  const sid=s.id;   // 요청 세대 캡처
  try{
    const r=await sbGet(`/bookstar_reader_stats?student_id=eq.${encodeURIComponent(sid)}&select=data`);
    if(!r.ok) return; const rows=await r.json(); if(!Array.isArray(rows)||!rows[0]||!rows[0].data) return;
    if(((typeof bxStudent==='function'&&bxStudent())||{}).id!==sid) return;   // 계정 전환됐으면 폐기
    _rsMergeServer(rows[0].data);
    try{ localStorage.setItem(_rsKey(), JSON.stringify(readerStats)); }catch(e){}   // 로컬 갱신(서버 재upsert 루프 방지 위해 saveReaderStats 미사용)
    try{ renderReadingRhythm(); }catch(e){}
    try{ renderStreakCal(); }catch(e){}
    try{ renderReadChart(); }catch(e){}
    try{ renderSummaryCard(); }catch(e){}
  }catch(e){}
}
// 헤더 계정 칩 — 게스트 / 로그인 / 연동만료 세 상태를 한 자리에서 보여준다.
// ⚠️ 8/13까지 이 칩은 display:none으로 숨겨져 있었다. 로그인해도 헤더가 그대로라
//    학생이 자기가 로그인된 건지 알 방법이 없었다(게스트와 화면이 동일).
function bxRenderAccountChip(){
  const el=document.getElementById('bxAccChip'); if(!el) return;
  const s=bxStudent();
  const _t=(k)=>(typeof uiT==='function'?uiT(k):k);   // 다국어 (uiT 정의 전 호출 대비 가드)
  if(!s){ el.innerHTML=esc(_t('세명대 로그인')); el.title=_t('세명대 계정으로 로그인'); return; }
  // 로그인은 됐는데 도서관 개인연동이 끊긴 상태 — 예전엔 내 도서관까지 들어가야만 알 수 있었고,
  // 그전까지는 예약·대출 버튼을 눌렀다가 튕기는 걸로 알게 됐다. 헤더에서 미리 알린다.
  if(!ssoIsPersonal()){
    el.innerHTML=`<span class="bx-acc-dot" style="background:#9ca3af"></span><span class="bx-acc-name">${esc(s.name)}</span><span class="bx-acc-sep"> · </span>${esc(_t('다시 로그인'))}`;
    el.title='도서관 연동이 끊겼어요 — 다시 로그인하면 대출·예약이 열립니다';
    return;
  }
  const b=(typeof MYLIB_BADGE!=='undefined')?MYLIB_BADGE:null;   // 연체·도착·반납임박 중 가장 급한 하나
  el.innerHTML=`<span style="font-size:15px;">${s.emoji||'🎓'}</span><span class="bx-acc-name">${esc(s.name)}</span>`
    + (b?`<span class="bx-acc-dot" style="background:${b.color}"></span>`:'');
  el.title=b?b.title:(s.dept||'세명대학교');
}
// 칩 클릭 — 게스트·연동만료는 곧장 로그인으로, 로그인 상태면 계정 메뉴를 연다
function bxChipClick(ev){
  if(ev) ev.stopPropagation();
  const s=bxStudent();
  if(!s || !ssoIsPersonal()){ bxCloseAccMenu(); bxOpenPicker(); return; }
  bxToggleAccMenu();
}
function bxRenderAccMenu(){
  const m=document.getElementById('bxAccMenu'); if(!m) return;
  const s=bxStudent(); if(!s){ m.innerHTML=''; return; }
  const b=(typeof MYLIB_BADGE!=='undefined')?MYLIB_BADGE:null;
  const _t=(k)=>(typeof uiT==='function'?uiT(k):k);
  m.innerHTML=`<div class="who"><b>${esc(s.name)}</b><br>${esc(s.dept||'세명대학교')}</div>
    <button class="mi" onclick="bxCloseAccMenu();nav('mypage')"><span>${esc(_t('내 서재'))}</span>${b?`<span class="n" style="color:${b.color}">${esc(b.title)}</span>`:''}</button>
    <div class="sep"></div>
    <button class="mi" onclick="bxLogout()"><span style="color:#c0392b">${esc(_t('로그아웃'))}</span></button>`;
}
function bxToggleAccMenu(){
  const m=document.getElementById('bxAccMenu'); if(!m) return;
  if(m.classList.contains('open')){ bxCloseAccMenu(); return; }
  bxRenderAccMenu(); m.classList.add('open');
}
function bxCloseAccMenu(){ const m=document.getElementById('bxAccMenu'); if(m) m.classList.remove('open'); }
document.addEventListener('click', bxCloseAccMenu);   // 바깥을 누르면 닫힘(칩은 stopPropagation)
// 로그아웃 — 도서관 열람실 공용 PC를 생각하면 없어선 안 된다(다음 사람이 남의 대출내역을 그대로 본다).
function bxLogout(){
  if(!confirm('로그아웃할까요?\n이 기기에서 도서관 연동 정보가 지워집니다.')) return;
  // 8/29: 서버 세션도 끝내고(다음 사람이 이 기기에서 이어 쓰지 못하게), 이 학생 이름으로 남은 임시 기록까지 지운다
  try{ const a=_bxAuthGet(); if(a&&a.at) fetch(SB_AUTH+'/logout',{method:'POST',headers:{apikey:COVER_ANON,Authorization:'Bearer '+a.at},keepalive:true}).catch(()=>{}); }catch(e){}
  try{ _bxAuthClear(); }catch(e){}
  try{
    localStorage.removeItem('bookstar-current-student');
    localStorage.removeItem(SSO_TOK_KEY);
    localStorage.removeItem(SSO_PERSONAL_KEY);
    const gone=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; if(/^bookstar-(chal|draft|joined-chal|score-log)/.test(k)) gone.push(k); }
    gone.forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  try{ window.__SSO_STUDENT=null; }catch(e){}
  location.href=location.pathname;   // 부분 갱신은 이전 계정 잔여가 남는다 — 통째로 게스트 상태에서 다시 시작
}
function bxOpenPicker(){
  // 8/12 포털 아이디 직접 로그인으로 전환 — 배너 설치 전에도 들어올 수 있게 (배너가 생기면 배너로도 가능)
  const list=document.getElementById('bxAccList');
  if(list) list.innerHTML=`
    <div style="display:grid;gap:8px;padding:4px 2px">
      <input id="bxLgId" placeholder="포털 아이디 (학번)" autocomplete="username" autocapitalize="none"
        style="width:100%;padding:12px 13px;border:1px solid #d8dce3;border-radius:10px;font-size:14px;font-family:inherit">
      <input id="bxLgPw" type="password" placeholder="포털 비밀번호" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')smPortalLogin('bx')"
        style="width:100%;padding:12px 13px;border:1px solid #d8dce3;border-radius:10px;font-size:14px;font-family:inherit">
      <div id="bxLgMsg" style="display:none;color:#c0392b;font-size:12px">아이디와 비밀번호를 입력해 주세요.</div>
      <button class="bx-acc-item" style="justify-content:center" onclick="smPortalLogin('bx')">
        <span class="bx-acc-emoji">🎓</span><span>세명대 포털로 로그인</span>
      </button>
      <div style="font-size:11px;color:#8b93a5;line-height:1.6;text-align:center">
        비밀번호는 학교 포털 확인에 한 번 쓰이고 저장하지 않아요.
      </div>
    </div>`;
  document.getElementById('bxAccOverlay')?.classList.add('open');
}
function bxClosePicker(){ document.getElementById('bxAccOverlay')?.classList.remove('open'); }
// 우리도서관 카테고리(관리자가 추가·삭제·편집) — 서버 library_sections에서 로드
let SECTIONS=[
  {slot:'life',title:'오늘의 사서 추천',subtitle:'',style:'hero'},
  {slot:'row',title:'사서가 주목한 책',subtitle:'우리 학교 사서가 직접 고른 책',style:'row'},
  {slot:'rank',title:'우리 학교 대출 랭킹',subtitle:'이번 달 가장 많이 빌린 책',style:'rank'},
  {slot:'ebookrank',title:'세명대 인기 전자책',subtitle:'전자도서관에서 많이 빌린 전자책',style:'ebookrank'},
  {slot:'newarr_p',title:'세명대 종이책 신착',subtitle:'새로 들어온 종이책',style:'newlive_p'},
  {slot:'newarr_e',title:'세명대 전자책 신착',subtitle:'새로 들어온 전자책',style:'newlive_e'},
  {slot:'grad',title:'하루 15분, 핵심만',subtitle:'책 한 권의 핵심을 15분만에',style:'grad'},
];
// 서버 발행 섹션이 기본 SECTIONS를 덮어써도 라이브 줄(전자책 인기·신착)은 항상 대출 랭킹 뒤에 끼운다(중복 방지)
function injectNewArr(arr){
  if(!Array.isArray(arr)) return arr;
  const i=arr.findIndex(s=>s.slot==='rank'||s.style==='rank');
  // 전자책 인기 = 종이책 대출 랭킹 바로 아래
  if(!arr.some(s=>s.slot==='ebookrank'||s.style==='ebookrank')){
    const eb={slot:'ebookrank',title:'세명대 인기 전자책',subtitle:'전자도서관에서 많이 빌린 전자책',style:'ebookrank'};
    if(i>=0) arr.splice(i+1,0,eb); else arr.push(eb);
  }
  // 신착 = 전자책 인기 바로 아래 (종이책 신착 → 전자책 신착 순서)
  if(!arr.some(s=>s.style==='newlive_p'||s.style==='newlive_e'||s.slot==='newarr')){
    const j=arr.findIndex(s=>s.slot==='ebookrank'||s.style==='ebookrank');
    const at=(j>=0?j:i);
    const pp={slot:'newarr_p',title:'세명대 종이책 신착',subtitle:'새로 들어온 종이책',style:'newlive_p'};
    const ee={slot:'newarr_e',title:'세명대 전자책 신착',subtitle:'새로 들어온 전자책',style:'newlive_e'};
    if(at>=0) arr.splice(at+1,0,pp,ee); else arr.push(pp,ee);
  }
  return arr;
}
async function loadSections(){
  try{
    // 우리도서관 페이지는 area='우리도서관' 칸만 (고전 컬렉션·International은 별도 영역)
    const r=await fetch(`${SB_REST}/library_sections?select=area,slot,title,subtitle,style,sort_order,books,visible&order=sort_order`,
      {headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok)return; const rows=await r.json(); if(!Array.isArray(rows)||!rows.length)return;
    SECTIONS=rows.filter(x=>(x.area||'우리도서관')==='우리도서관')
      .map(x=>({slot:x.slot,title:x.title,subtitle:x.subtitle||'',style:x.style||'row',visible:x.visible!==false,books:Array.isArray(x.books)?x.books:[]}));
    injectNewArr(SECTIONS);   // 서버 섹션에도 신착 라이브 보장
  }catch(e){}
}
// 고전 컬렉션 / International 영역의 사서 큐레이션 칸 로드
async function loadAreaSections(area){
  try{
    const r=await fetch(`${SB_REST}/library_sections?select=slot,title,subtitle,style,sort_order,books,chal_pos&area=eq.${encodeURIComponent(area)}&order=sort_order`,
      {headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok) return []; const rows=await r.json();
    return Array.isArray(rows)?rows.map(x=>({slot:x.slot,title:x.title,subtitle:x.subtitle||'',style:x.style||'row',books:Array.isArray(x.books)?x.books:[],chal_pos:(x.chal_pos==null?null:+x.chal_pos)})):[];
  }catch(e){ return []; }
}
// 영역 큐레이션을 컨테이너에 렌더(없으면 비워둠 → 기존 콘텐츠 폴백). 우리도서관과 동일한 millieHTML 사용
async function renderAreaCuration(containerId, area){
  const grid=document.getElementById(containerId); if(!grid) return;
  if(PREVIEW) return;   // 미리보기 모드는 _pvRender가 localStorage로 직접 렌더
  const secs=await loadAreaSections(area);
  if(!secs.length){ grid.innerHTML=''; return; }
  // 담긴 책을 풀에 병합(표지·별점 보강)
  secs.forEach(s=>(s.books||[]).forEach(b=>{ if(b.isbn&&!LIB_POOL.find(x=>x.isbn===b.isbn)) LIB_POOL.push(Object.assign({},b,{t:b.title||b.t||'',a:b.author||b.a||'',cover:b.cover||''})); }));   // 형태 필드 보존
  // International(국내 탭)에서 언어 선택 시 사서 큐레이션 줄 제목·부제 번역(사전 미등재는 한국어 폴백)
  let secsR=secs;
  if(typeof clT==='function' && typeof CL_AREA!=='undefined' && area===CL_AREA.modern && _clTab==='modern' && _clLang!=='all')
    secsR=secs.map(s=>Object.assign({},s,{title:clT(s.title||''),subtitle:clT(s.subtitle||'')}));
  grid.innerHTML=millieHTML(secsR, isClassicsArea(area));
  try{ mlBindDrag(); }catch(e){}
  try{ backfillPool(); }catch(e){}
}
function rebuildLibPool(){
  const seen=new Set(); LIB_POOL=[];
  LC_PUB.forEach(c=>(c.books||[]).forEach(b=>{ if(b.isbn&&!seen.has(b.isbn)){ seen.add(b.isbn); LIB_POOL.push(Object.assign({},b)); } }));
  SECTIONS.forEach(s=>(s.books||[]).forEach(b=>{ if(b.isbn&&!seen.has(b.isbn)){ seen.add(b.isbn); const sm=b._sm||(b.isbn||'').startsWith('sm-'); LIB_POOL.push(Object.assign({},b,{t:b.title||b.t||'',a:b.author||b.a||'',cover:b.cover||'',lib:b.lib||'',_sm:sm||undefined})); } }));   // 형태 필드(tags·_pp·crema·cremaUrl) 보존 위해 전체 복사
  LIB_SAMPLE.forEach(isbn=>{ if(!seen.has(isbn)){ seen.add(isbn); LIB_POOL.push({isbn}); } });
  // (8/29 데모 책 '프로젝트 헤일메리' 풀 삽입 삭제 — 데모 계정 번호가 박힌 http 링크라 실제 학생이 누르면 남의 계정으로 열렸다)
  SEMYUNG_BEST.forEach(b=>{ if(!seen.has(b.isbn)){ seen.add(b.isbn); LIB_POOL.push(Object.assign({},b)); } });  // [데모] 세명대 실소장 베스트 소설(폴백)
  if(SEMYUNG_BEST_LIVE) SEMYUNG_BEST_LIVE.forEach(b=>{ if(!seen.has(b.isbn)){ seen.add(b.isbn); LIB_POOL.push(Object.assign({},b)); } });  // 세명대 대출 베스트 라이브
  if(SEMYUNG_NEW_LIVE) SEMYUNG_NEW_LIVE.forEach(b=>{ if(!seen.has(b.isbn)){ seen.add(b.isbn); LIB_POOL.push(Object.assign({},b)); } });  // 세명대 신착 자료 라이브
  if(SEMYUNG_LOANRANK) SEMYUNG_LOANRANK.forEach(b=>{ if(!seen.has(b.isbn)){ seen.add(b.isbn); LIB_POOL.push(Object.assign({},b)); } });  // 세명대 종이책 대출 랭킹
  // 표지 안전망: 세명대 표지가 placeholder(준비중)인 책은 알라딘 실표지로 덮어쓰기 (brcd 매칭)
  LIB_POOL.forEach(b=>{ const m=/^sm-(.+)$/.exec(b.isbn||''); if(m && COVER_OVR[m[1]]) b.cover=COVER_OVR[m[1]]; });
}
// 카테고리에 직접 담긴 책(꾸미기) — pool에서 표지·별점 보강
function booksForSection(s){
  return (s.books||[]).map(b=>{
    if(isCls(b)){ const c=(typeof BOOKS!=='undefined')&&BOOKS.find(x=>x.id===b.id);   // 마스터 목록(BOOKS)에서 한글 제목·표지 보강 — 저장된 영어 제목/빈 표지 대신. new·grid·mag 등 모든 큐레이션 스타일에 표지·한글 적용
      return {id:b.id, t:(c&&c.title)||b.title||b.t||'', a:(c&&c.author)||b.author||b.a||'', cover:(c&&c.coverSrc)||'', cls:true}; }
    const p=(b.isbn&&LIB_POOL.find(x=>x.isbn===b.isbn));
    const r=p?Object.assign({},p):{t:b.title||b.t,a:b.author||b.a,isbn:b.isbn,cover:b.cover,note:b.note};
    if(b.tags&&b.tags.length) r.tags=b.tags;   // 섹션에 저장된 형태태그(전자책/종이책)를 최우선 보존 — 풀 매칭이 태그 없는 버전과 겹쳐도 뱃지 유지
    return r;
  }).filter(b=>b.t||b.title||b.id)
    // 2026-06-21 사용자 지시: 큐레이션도 노출목록(BOOKS)에 있는 고전만 표시. 장르제외 희곡·시(셰익스피어 등)·미번역 해외고전은 사서 큐레이션에 담겨 있어도 숨김. 일반 도서관 책(isbn)은 영향 없음.
    .filter(b=> !(b.cls && typeof BOOKS!=='undefined' && !BOOKS.some(x=>x.id===b.id)) );
}
const PREVIEW = new URLSearchParams(location.search).get('preview')==='1';
function renderLibCuration(){
  const grid=document.getElementById('libCurationGrid'); if(!grid) return;
  if(PREVIEW){                 // 관리자 미리보기 — 저장 전 SECTIONS를 localStorage로 받아 그대로 렌더(서버 로드 안 함)
    try{ const ps=JSON.parse(localStorage.getItem('bookstar_preview_sections')||'[]');
      if(Array.isArray(ps)&&ps.length) SECTIONS=ps.map(x=>({slot:x.slot,title:x.title,subtitle:x.subtitle||'',style:x.style||'row',books:Array.isArray(x.books)?x.books:[]}));
    }catch(e){}
    rebuildLibPool(); grid.innerHTML=millieHTML(); mlBindDrag(); backfillPool();
    return;
  }
  // 즉시 표시(로컬 폴백) → 서버 발행물로 갱신
  try{ LC_PUB=JSON.parse(localStorage.getItem('bookstar_pub')||'[]'); }catch(e){ LC_PUB=[]; }
  rebuildLibPool();
  grid.innerHTML = millieHTML();
  mlBindDrag();
  backfillPool();
  loadServerPub();
}
// 미리보기 대상 영역 (관리자 꾸미기 탭과 1:1) — 우리도서관/고전 컬렉션/International
const PV_AREA = new URLSearchParams(location.search).get('area') || '우리도서관';
const PV_MAP = {'우리도서관':{page:'ourlib',grid:'libCurationGrid'},'고전 컬렉션':{page:'collection',grid:'collectionCuration'},'고전 컬렉션 해외':{page:'collection',grid:'collectionCuration'},'고전 컬렉션 국내':{page:'collection',grid:'collectionCuration'},'International':{page:'international',grid:'intlCuration'},
  // 8/31: 독서 챌린지도 같은 미리보기 경로로 합침. 예전엔 관리자가 따로 흉내 내 그려서 사서가 고른 스타일이 미리보기에만 빠져 있었다
  '독서챌린지':{page:'curation',grid:'chalLive',chal:true}};
const PV_T = PV_MAP[PV_AREA] || PV_MAP['우리도서관'];
let _pvLastSecs=null;
// 미리보기도 실제 앱처럼 발행 프로그램(library_programs)을 불러와 LC_PUB 채움 → 빈 칸 폴백이 앱과 일치(WYSIWYG)
async function _pvLoadPub(){
  try{
    const r=await fetch(`${SB_REST}/library_programs?select=*&status=eq.${encodeURIComponent('진행중')}&order=sort_order.asc.nullslast,created_at.desc`,   // 8/29: 사서가 정한 순서
      {headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(r.ok){ const rows=await r.json(); if(Array.isArray(rows)) LC_PUB=rows.map(x=>({id:x.id,title:x.title,intro:x.intro||'',location:x.location||'',
      books:(x.books||[]).map(b=>Object.assign({t:b.title,a:b.author,isbn:b.isbn,cover:b.cover,note:b.note||''},_keepForm(b)))})); }
  }catch(e){}
  try{ const ps=_pvLastSecs||JSON.parse(localStorage.getItem('bookstar_preview_sections')||'[]'); _pvRender(ps); }catch(e){}
}
function _pvRender(rawSecs){
  _pvLastSecs=rawSecs;
  const secs=(rawSecs||[]).map(x=>({slot:x.slot,title:x.title,subtitle:x.subtitle||'',style:x.style||'row',visible:x.visible!==false,books:Array.isArray(x.books)?x.books:[]}));
  if(PV_AREA==='우리도서관') SECTIONS=secs;
  rebuildLibPool();
  // 담긴 책을 풀에 보강(표지·별점)
  secs.forEach(s=>(s.books||[]).forEach(b=>{ if(b.isbn&&!LIB_POOL.find(x=>x.isbn===b.isbn)) LIB_POOL.push({isbn:b.isbn,t:b.title||b.t||'',a:b.author||b.a||'',cover:b.cover||''}); }));
  const g=document.getElementById(PV_T.grid); if(g){ g.innerHTML=millieHTML(secs, isClassicsArea(PV_AREA)); try{mlBindDrag();}catch(e){} try{backfillPool();}catch(e){} }
}
// 8/31: 독서 챌린지 미리보기 — 관리자가 편집 중인 챌린지를 그대로 받아 학생 앱 렌더러(renderChalCards)로 그린다.
//   관리자 쪽 이름(detail/title/author)을 학생 앱 이름(intro/t/a)으로만 바꿔 넘긴다. 그리는 코드는 학생 앱 것 하나뿐 = 스타일이 어긋날 수 없다.
function _pvRenderChal(chals,notices){
  CHAL_PUB=(chals||[]).map(x=>({
    id:x.id!=null?x.id:('pv-'+Math.random().toString(36).slice(2)),
    type:x.type||'소장챌린지', title:x.title||'', intro:x.intro||x.detail||'',
    from:x.from||x.start_date||'', to:x.to||x.end_date||'', featured:!!x.featured, style:x.style||'row',
    mission:x.mission||null,
    books:(x.books||[]).map(b=>Object.assign({id:b.id||'',t:b.title||b.t||'',a:b.author||b.a||'',cover:b.cover||'',isbn:b.isbn,
      tags:(!b.isbn&&/^(gb|kr)-/.test(b.id||''))?['cls']:b.tags},_keepForm(b)))
  }));
  CHAL_NOTICES=(notices||[]).map(s=>({title:s.title||'',subtitle:s.subtitle||'',chal_pos:s.chal_pos}));
  try{ renderChalCards(); }catch(e){}
}
if(PREVIEW){ try{ document.body.classList.add('preview-mode'); }catch(e){}
  const goPv=()=>{ try{ nav(PV_T.page); }catch(e){}
    if(PV_T.chal){ try{ const pc=JSON.parse(localStorage.getItem('bookstar_preview_chals')||'null'); if(pc) _pvRenderChal(pc.challenges,pc.notices); }catch(e){} return; }
    try{ const ps=JSON.parse(localStorage.getItem('bookstar_preview_sections')||'[]'); _pvRender(ps); }catch(e){} };
  window.addEventListener('DOMContentLoaded',goPv); setTimeout(goPv,60);
  if(!PV_T.chal) _pvLoadPub();   // 발행 프로그램 로드 → 로드 후 자동 재렌더(앱과 동일 화면). 챌린지는 부모가 보낸 것만 그린다
  // 관리자 '꾸미기' 실시간 미리보기 — 부모창이 보낸 SECTIONS로 즉시 재렌더(새로고침 없음)
  window.addEventListener('message',function(e){
    if(e.origin!==location.origin) return;   // 같은 도메인(관리자 iframe 부모)만 허용
    var d=e.data; if(!d)return;
    if(d.type==='bookstar_preview_chal'){ try{ _pvRenderChal(d.challenges,d.notices); }catch(err){} return; }
    if(d.type!=='bookstar_preview'||!Array.isArray(d.sections))return;
    try{ _pvRender(d.sections); }catch(err){}
  });
}
async function loadServerPub(){
  try{
    // 칸(sections)·발행물(programs, 60초 공유 캐시) 두 fetch를 병렬로 — 서로 독립
    const progReq=fetchProgramsCached();
    await loadSections();
    const rows=await progReq;
    {
      if(Array.isArray(rows)) LC_PUB=rows.map(x=>({id:x.id,title:x.title,intro:x.intro||'',location:x.location||'',
        books:(x.books||[]).map(b=>Object.assign({t:b.title,a:b.author,isbn:b.isbn,cover:b.cover,note:b.note||''},_keepForm(b)))}));
    }
    // programs 실패해도 새로 받은 sections는 반영해서 렌더
    scheduleGridRender(true);
  }catch(e){}
}
// bookinfo(표지·별점·소개) localStorage 캐시 — 재방문 즉시 표시, 반복 조회 방지
const BOOKINFO_CACHE_KEY='bookstar_bookinfo_v1';
const BOOKINFO_TTL=7*24*3600*1000; // 7일
function _biCacheLoad(){ try{ return JSON.parse(localStorage.getItem(BOOKINFO_CACHE_KEY)||'{}')||{}; }catch(e){ return {}; } }
function _biCacheSave(c){
  try{
    // 저장 전 만료 정리 + 개수 상한 500 — 무한 누적으로 quota 도달 시 캐시가 조용히 죽던 것 방지
    const now=Date.now();
    for(const k in c){ if(!c[k]._ts || now-c[k]._ts>=BOOKINFO_TTL) delete c[k]; }
    const ks=Object.keys(c);
    if(ks.length>500) ks.map(k=>[k,c[k]._ts||0]).sort((a,b)=>a[1]-b[1]).slice(0,ks.length-500).forEach(([k])=>delete c[k]);
    localStorage.setItem(BOOKINFO_CACHE_KEY, JSON.stringify(c));
  }catch(e){ try{ localStorage.removeItem(BOOKINFO_CACHE_KEY); }catch(_){} }   // quota 실패 시 키 리셋 후 다음 방문에 재구축
}
function _applyInfo(b,x){ if(!x) return;
  if(!b.t&&x.title) b.t=x.title;
  if(!b.a&&x.author) b.a=x.author;
  if(!b.cover&&x.cover) b.cover=x.cover;
  if(b.rating===undefined&&x.rating!=null){ b.rating=x.rating; b.ratingCount=x.ratingCount||0; }
  if(!b.loan&&x.loan) b.loan=x.loan;
  if(!b.pages&&x.pages) b.pages=x.pages;
  if(!b.publisher&&x.publisher) b.publisher=x.publisher;
  if(!b.pubYear&&x.pubYear) b.pubYear=x.pubYear;
  if(b.description===undefined&&x.description) b.description=x.description;
}
async function backfillPool(){
  const need=[...new Set(LIB_POOL.filter(b=>b.isbn&&!b._sm&&(!b.t||!b.cover||b.rating===undefined||b.description===undefined||!b.publisher)).map(b=>b.isbn))];
  if(!need.length) return;
  // isbn → 해당 책 객체들(같은 isbn이 여러 칸에 있을 수 있음)
  const byIsbn={}; LIB_POOL.forEach(b=>{ if(b.isbn){ (byIsbn[b.isbn]||(byIsbn[b.isbn]=[])).push(b); } });
  const apply=(isbn,x)=>{ (byIsbn[isbn]||[]).forEach(b=>_applyInfo(b,x)); };
  // 1) 캐시 먼저 적용 → 미스만 추림
  const cache=_biCacheLoad(); const now=Date.now(); const miss=[];
  need.forEach(isbn=>{ const c=cache[isbn]; if(c&&c._ts&&(now-c._ts)<BOOKINFO_TTL){ apply(isbn,c); } else miss.push(isbn); });
  // 2) 미스만 24개 배치로 병렬 조회
  if(miss.length){
    const batches=[]; for(let i=0;i<miss.length;i+=24) batches.push(miss.slice(i,i+24));
    const results=await Promise.all(batches.map(batch=>
      fetch(INFO_FN,{method:'POST',headers:{'Authorization':'Bearer '+COVER_ANON,'apikey':COVER_ANON,'content-type':'application/json'},body:JSON.stringify({isbns:batch})})
        .then(r=>r.ok?r.json():null).catch(()=>null)));
    let changed=false;
    results.forEach(d=>{ const info=(d&&d.info)||{}; for(const isbn in info){ const x=info[isbn]; cache[isbn]=Object.assign({},x,{_ts:now}); changed=true; apply(isbn,x); } });
    if(changed) _biCacheSave(cache);
  }
  scheduleGridRender();
}
// 세명대 실제 키(전자책 바코드 또는 종이책 CATTOT) 추출 — isbn 접두(sm-)에만 의존하면 깨진다(8/19 발견):
//   사서 AI 큐레이션이 book_pool 경로로 찾은 후보를 담을 때 isbn을 원본 ISBN13 그대로 저장하고
//   sm-접두를 안 붙이는 경우가 있다(_sm:true·tags:['ebook']인데 isbn='9791190238977' 같은 순수 ISBN13).
//   ISBN13은 13자리 숫자라 우연히 바코드처럼 보여 그대로 조회하면 재고·줄거리 조회가 조용히 실패하고,
//   lcBorrow는 대출 없이 전자책 URL을 그냥 열어 빈 화면이 뜬다 — lib/_pp URL 안의 진짜 키를 먼저 본다.
function smKeyOf(b){
  const fromLib=(String(b.lib||b.smEbookUrl||'').match(/[?&]brcd=([0-9A-Za-z]+)/)||[,''])[1];
  if(fromLib) return fromLib;
  const fromPaper=(String(b._pp||b.smPaperUrl||'').match(/CATTOT\d+/)||[''])[0];
  if(fromPaper) return fromPaper;
  return (b.isbn||'').replace(/^sm-/,'');
}
function libDetail(isbn){
  const b=LIB_POOL.find(x=>x.isbn===isbn); if(!b) return;
  try{ const _ov=document.getElementById('lcDetail'); if(_ov){ _ov.removeAttribute('data-origin'); _ov.removeAttribute('data-origin-id'); } }catch(e){}   // 대체추천(ebSimOpen)이 남긴 origin 표식 초기화
  window._lcCurBook=b;   // 8/14: 로그인 다녀오면 이 책으로 되돌아오기 위한 현재 책 기억
  bxEvent('view',{book:b});   // 측정: 조회(상세 열림)
  try{ mbTouch(b); }catch(e){}   // 8/21: 상세를 연 책은 내서재 '내 책'에 담긴다
  // 세명대 책 보강 캐시(줄거리·출판사·연도·장르) 적용 — books/semyung_enrich.json
  const reckey=smKeyOf(b);
  const en = (b._sm && b.isbn) ? SM_ENRICH[reckey] : null;
  const desc = b.description || (en&&en.desc) || '';
  const pubYear = b.pubYear || (en&&en.year) || '';
  const publisher = b.publisher || (en&&en.publisher) || '';
  const genre = (en&&en.genre) || '';
  // 세명대 통합검색 딥링크(제목) — 종이책 소장·구독 전자책 확인용
  const opacUrl = 'https://lib.semyung.ac.kr/search/tot/result?st=KWRD&si=TOTAL&q='+encodeURIComponent(cleanT(b.t||''));
  const isPaperHold=/^CATTOT/.test(reckey);   // OPAC 종이책 → 라이브 대출가능 현황 표시
  // 전자책+종이책 책: 짝이 되는 종이책 소장키(CATTOT) — paperUrl(or _pp)에서 추출 → 있으면 종이책 줄을 탭 펼침으로
  const paperHoldKey=(()=>{ const m=String((en&&en.paperUrl)||b._pp||'').match(/CATTOT\d+/); return m?m[0]:''; })();
  // SVG 라인 아이콘(이모지 대체)
  const SVG_EBOOK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
  const SVG_PAPER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
  const SVG_SUB='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  const SVG_RANK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18v-6"/><path d="M12 18V8"/><path d="M16 18v-9"/></svg>';
  // 보조 '종이책 대출' 줄: 소장키 있으면 탭하면 소장정보 펼침(종이책만일 때와 동일 박스), 없으면 OPAC 링크 폴백
  const paperWay=(statusLabel,fallbackHref)=>{
    const wtag=statusLabel?`<span class="wtag">${esc(statusLabel)}</span>`:'';   // 상태 모르면 배지 생략(구 '소장' 폐기)
    if(paperHoldKey){
      // 종이책만 있는 책과 똑같이 소장현황(위치·청구기호·예약 버튼)을 처음부터 펼쳐 둔다.
      // 접어두면 전자책과 같이 있는 책만 종이책 정보가 사라져 학생이 "여긴 왜 없지" 하게 된다.
      return `<div class="lcd-way t-paper ok pw-open" onclick="togglePaperHold('${paperHoldKey}',this)"><span class="wic">${SVG_PAPER}</span><span class="wlabel">종이책 대출</span>${wtag}<span class="ar pw-ar">›</span></div>`
        + `<div class="lcd-holding pw-hold loading" id="pwHold-${paperHoldKey}" data-loaded="1">우리 도서관 소장 현황을 확인하고 있어요…</div>`;
    }
    return `<a class="lcd-way t-paper ok" data-pwup="1" href="${esc(fallbackHref)}" target="_blank" rel="noopener"><span class="wic">${SVG_PAPER}</span><span class="wlabel">종이책 대출</span>${wtag}<span class="ar">›</span></a>`;
  };
  const meta=[];
  if(b.rating!=null) meta.push(`<span class="lc-star">★</span> ${b.rating}${b.ratingCount?` · ${b.ratingCount}명`:''}`);
  if(b.loan) meta.push(`대출 ${Number(b.loan).toLocaleString()}`);
  if(b.pages) meta.push(`${b.pages}쪽`);
  if(genre) meta.push(esc(genre));
  const ov=document.getElementById('lcDetail');
  ov.querySelector('.lcd').innerHTML=`<span class="lcd-x" onclick="closeLc()">×</span>
    <div class="lcd-top">
      <div class="lcd-cv">${b.cover?`<img src="${esc(hiCover(b.cover))}" decoding="async" data-t="${esc(cleanT(b.t||''))}" data-a="${esc(String(b.a||b.author||''))}" onerror="ncSwap(this)">`:ncCover(b)}</div>
      <div class="lcd-i">${b.rank?`<div class="lcd-rank"><span class="ricon">${SVG_RANK}</span>우리 학교 대출 ${b.rank}위</div>`:''}<h2>${escD(cleanT(b.t))}</h2><div class="au">${escD(authorLine(b))}${publisher?` · ${escD(publisher)}`:''}${pubYear?` · ${esc(pubYear)}`:''}</div>
        ${meta.length?`<div class="lcd-meta">${meta.join('  |  ')}</div>`:''}
        ${b.note?`<div class="lcd-note">“${esc(b.note)}” — 사서</div>`:''}</div>
    </div>
    <!-- 8/30 사장님: 줄거리는 표지 바로 아래(원래 자리). 펼쳐도 아래 버튼이 밀리지 않도록
         .lcd-desc.open 에서 높이를 묶고 그 안에서만 스크롤한다 -->
    <p class="lcd-desc" id="lcdDesc"${desc?'':' style="display:none"'}>${escD(desc)}</p>
    ${isPaperHold?'<div id="lcdHolding" class="lcd-holding loading">우리 도서관 소장 현황을 확인하고 있어요…</div>':''}
    <div class="lcd-acts">
      ${(()=>{
        const tags=b.tags||null;
        // 신착(semyung_new)은 tags로 형태 확정 — 종이책에 '전자책 읽기' 오표기 방지
        if(tags){
          const hasEb=tags.includes('ebook'), hasPaper=tags.includes('paper'), hasSub=tags.includes('sub');
          const cremaUrl=b.cremaUrl||(en&&en.cremaUrl)||'';
          const primary = hasEb
            ? `<div class="lcd-way t-ebook" onclick="lcBorrow('${b.isbn}')"><span class="wic">${SVG_EBOOK}</span><span class="wlabel">전자책 바로 읽기</span><span class="wtag eb" id="ebStockTag">확인 중</span><span class="ar">›</span></div><div id="ebStockNote"></div>`
            : isPaperHold
            ? '' /* 종이책 라이브 소장+예약(찾아줘북즈)은 위 소장현황 박스에서 — 북스타 안에서 일원화 */
            : hasPaper
            ? `<a class="lcd-way pw t-paper" data-pwup="1" href="${esc(b._pp||opacUrl)}" target="_blank" rel="noopener"><span class="wic">${SVG_PAPER}</span><span class="wlabel">종이책 대출하기</span><span class="ar">›</span></a>`
            : hasSub
            ? `<a class="lcd-way pw t-sub" href="${esc(cremaHref(cremaUrl, b.t||''))}" target="_blank" rel="noopener"><span class="wic">${SVG_SUB}</span><span class="wlabel">크레마클럽에서 읽기 · 크레마 앱 필요</span><span class="wtag sub">무제한</span><span class="ar">›</span></a>`
            : '';
          const otherPaper=(hasEb&&hasPaper) ? paperWay((en&&en.paperStatus)||'', b._pp||opacUrl) : '';
          const cremaWay=(hasSub && (hasEb||hasPaper)) ? `<a class="lcd-way t-sub" href="${esc(cremaHref(cremaUrl, b.t||''))}" target="_blank" rel="noopener"><span class="wic">${SVG_SUB}</span><span class="wlabel">크레마클럽에서 읽기 · 크레마 앱 필요</span><span class="wtag sub">무제한</span><span class="ar">›</span></a>` : '';
          const ways=otherPaper+cremaWay;
          return primary + (ways?`<div class="lcd-ways"><div class="lcd-ways-h">이렇게도 읽을 수 있어요</div>${ways}</div>`:'');
        }
        return (b.lib
        ? `<div class="lcd-way t-ebook" onclick="lcBorrow('${b.isbn}')"><span class="wic">${SVG_EBOOK}</span><span class="wlabel">전자책 바로 읽기</span><span class="wtag eb" id="ebStockTag">확인 중</span><span class="ar">›</span></div><div id="ebStockNote"></div>`
        : isPaperHold
        ? '' /* 종이책 소장+예약은 위 소장현황 박스에서 — 일원화 */
        : `<div class="lcd-way pw t-find" onclick="lcBorrow('${b.isbn}')"><span class="wic">${SVG_PAPER}</span><span class="wlabel">우리 도서관에서 찾기</span><span class="ar">›</span></div>`)
        + ((b._sm && en && (en.crema || (en.paper && !isPaperHold))) ? `<div class="lcd-ways">
        <div class="lcd-ways-h">이렇게도 읽을 수 있어요</div>
        ${en.crema ? `<a class="lcd-way t-sub" href="${esc(cremaHref(en.cremaUrl||'', b.t||''))}" target="_blank" rel="noopener"><span class="wic">${SVG_SUB}</span><span class="wlabel">크레마클럽에서 읽기 · 크레마 앱 필요</span><span class="wtag sub">무제한</span><span class="ar">›</span></a>` : ''}
        ${(en.paper && !isPaperHold) ? paperWay(en.paperStatus||'', en.paperUrl||opacUrl) : ''}
      </div>` : '');
      })()}
      <div id="ebSimilar"></div>
    </div>
    <div class="lcd-src">${(()=>{
      const tags=b.tags||null;
      if(tags){
        const fmt = tags.includes('ebook') ? '전자도서관 소장' : '소장(종이책)';
        return '출처 · 세명대학교 학술정보원 '+fmt+(tags.includes('paper')&&!tags.includes('ebook')?(desc?' · 표지·줄거리 알라딘':' · 표지 알라딘'):'');
      }
      return b._sm?('출처 · 세명대학교 학술정보원 전자도서관 소장'+(en&&en.src==='nl'?' · 줄거리·서지 국립중앙도서관(정보나루)':'')):'출처 · 별점·표지·쪽수 알라딘 / 대출 정보나루(국립중앙도서관)';
    })()}</div>`;
  // 8/20 사장님 수정요청: 소장자료 상세의 '독자 서평' 삭제(PC·모바일 둘 다 — 같은 DOM을 CSS로만 나누므로 여기 한 곳).
  //   고전 상세(openDetail)의 서평은 그대로 두고, 서평 쓰기·보기 기능 자체도 유지(내 도서관에서 계속 쓴다)
  ov.classList.add('on');
  lcdDescMark(document.getElementById('lcdDesc'));   // 8/14: 설명 넘치면 '더 보기' 표시(탭=펼침)
  if(isPaperHold) loadHolding(reckey);
  // 전자책과 같이 있는 책의 종이책 소장현황 — 기본으로 펼쳐 두므로 여기서 바로 불러온다
  if(paperHoldKey) loadHolding(paperHoldKey, 'pwHold-'+paperHoldKey);
  // 표현 통일(8/14 사장님): 제어번호를 모르는 종이책은 '종이책 대출하기' 링크로만 보였다 —
  // 소장목록에서 ctrl을 찾으면(ISBN 우선, 제목 폴백은 저자 일치 필수) 같은 소장 박스로 교체한다. 못 찾으면 링크 유지.
  const _pwup=ov.querySelector('[data-pwup]');
  if(_pwup && !isPaperHold && !paperHoldKey){
    tulipPaperKey(b.isbn, b.t, authorLine(b)).then(k=>{
      if(!k || !_pwup.isConnected) return;
      const wrap=document.createElement('div');
      wrap.innerHTML=`<div class="lcd-way t-paper ok pw-open" onclick="togglePaperHold('${k}',this)"><span class="wic">${SVG_PAPER}</span><span class="wlabel">종이책 대출</span><span class="ar pw-ar">›</span></div>`
        +`<div class="lcd-holding pw-hold loading" id="pwHold-${k}" data-loaded="1">우리 도서관 소장 현황을 확인하고 있어요…</div>`;
      _pwup.replaceWith(...wrap.childNodes);
      loadHolding(k, 'pwHold-'+k);
    });
  }
  // 줄거리 lazy 로드 — 후보가 description을 안 싣고 와도 DB에서 채움. P3부터 단일 semyung_tulip(종이책=CATTOT{ctrl}, 전자책=barcode/isbn).
  // 세명대 키(전자책 바코드=숫자 / 종이책 CATTOT)만 있으면 어느 목록에서 왔든 DB에서 보강한다.
  // (기존: b._sm 플래그에 의존 → 큐레이션 등 일부 경로에서 저자·줄거리가 통째로 비어 보였다)
  const isSmKey = /^\d+$/.test(reckey) || /^CATTOT/.test(reckey);
  if(isSmKey) loadDesc(reckey, /^CATTOT/.test(reckey), b);
  // 전자책 실시간 재고 — 태그가 실제로 그려졌는지로 판단(책 객체의 lib 유무에 의존하지 않는다)
  // 용어 통일(8/12 피드백): 배지는 '지금 대출 가능'/'대출 중' 둘만. 확인 못 하면 배지 생략('소장' 폐기)
  // 키가 바코드가 아니라 ISBN인 책(제철 행복류)은 소장목록에서 진짜 바코드를 찾아 재시도
  const _ebTag=document.getElementById('ebStockTag');
  if(_ebTag){
    if(/^\d+$/.test(reckey)) loadEbookStock(reckey, b.t||'');
    else tulipEbookBarcode(b.t||'').then(bc=>{
      if(bc) loadEbookStock(bc, '', true);
      else if(_ebTag.isConnected) _ebTag.remove();
    });
  }else if(isPaperHold){
    // 8/19 항상 추천: 종이책 상세에도 같은 장르 전자책 3권(제어번호로 분류를 읽음) — 종이책→전자책 즉시읽기 흐름
    loadSimilarEbooks('', b.t||'', {ctrl:reckey.replace(/^CATTOT/,''), avail:true});
  }
}
/* 전자책 실시간 재고 — 전자도서관이 상세화면에 노출하는 [대출 n/m · 예약 k]를 그대로 가져온다.
   못 읽으면 배지를 지운다 — 틀린 숫자를 보여주느니 말을 안 하는 편이 낫다(8/12 용어 통일). */
// 소장목록(semyung_tulip)에서 같은 제목의 전자책 바코드를 찾는다 — 키가 ISBN으로 들어온 책의 구명줄
async function tulipEbookBarcode(title){
  try{
    const t=cleanT(title||'').slice(0,12); if(!t) return '';
    const r=await fetch(SB_REST+'/semyung_tulip?select=title,barcode&kind=eq.ebook&limit=5&title=ilike.'+encodeURIComponent(t+'*'),
      {headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok) return '';
    const rows=await r.json();
    const key=cleanT(title||'').replace(/\s+/g,'');
    const hit=(Array.isArray(rows)?rows:[]).find(x=>cleanT(x.title||'').replace(/\s+/g,'').indexOf(key)===0 && x.barcode);
    return hit?String(hit.barcode):'';
  }catch(e){ return ''; }
}
async function loadEbookStock(brcd, bookTitle, _retried){
  const tag=document.getElementById('ebStockTag'), note=document.getElementById('ebStockNote');
  if(!tag) return;
  try{
    const r=await sbFn(SMEBK_FN,{action:'stock',brcd:brcd},{anon:true});
    const d=await r.json();
    if(!tag.isConnected) return;   // 다른 책 모달로 바뀌었으면 폐기
    if(!d||!d.ok){
      // 이 키가 진짜 바코드가 아니었을 수 있다 — 소장목록에서 바코드를 찾아 딱 한 번 재시도
      if(bookTitle && !_retried){
        const bc=await tulipEbookBarcode(bookTitle);
        if(bc && bc!==String(brcd) && tag.isConnected) return loadEbookStock(bc, '', true);
      }
      tag.remove();   // 그래도 모르면 배지 생략(용어 통일 — 틀린 말보다 침묵)
      // 8/30 사장님 지적: 재고를 모르는 책(재고 표에 줄이 없는 전자책)은 같은 장르 추천도 안 나왔다 — 추천은 재고와 무관하게 항상(8/19 원칙)
      loadSimilarEbooks(brcd, bookTitle, {avail:true});
      return;
    }
    const row=tag.closest('.lcd-way');
    if(d.available){
      tag.textContent='지금 대출 가능';
      tag.style.color='#16a34a';
      // 예약이 취소되는 등으로 다시 대출 가능해졌으면 원래의 '대출' 클릭으로 복원
      if(row&&row.dataset.borrowOnclick){ row.setAttribute('onclick',row.dataset.borrowOnclick); delete row.dataset.borrowOnclick; }
      if(note&&note.isConnected) note.innerHTML='';
      loadSimilarEbooks(brcd, bookTitle, {avail:true});   // 8/19 항상 추천: 대출 가능일 때도 "같은 장르 · 바로 읽을 수 있는 다른 책"(주 액션 아래)
    }else{
      tag.textContent='대출 중';
      tag.style.color='#dc2626';
      // '바로 읽기' 줄을 그대로 두면 눌렀을 때 헛된 대출 시도(빈 탭에 "다른 회원이 먼저…" 실패)로 간다
      // — 대출 중엔 이 줄의 클릭도 예약으로 보낸다(원래 동작은 보관해 뒀다가 재고 회복 시 복원).
      if(row){
        if(!row.dataset.borrowOnclick) row.dataset.borrowOnclick=row.getAttribute('onclick')||'';
        row.setAttribute('onclick',"ebReserve('"+brcd+"')");
      }
      const waiting=d.reserved>0?` · 앞에 ${d.reserved}명 기다리는 중`:'';
      if(note&&note.isConnected){
        // 아이콘은 위 '전자책 바로 읽기' 줄에서 그대로 빌려 쓴다.
        // (libDetail 안의 SVG_EBOOK을 참조하면 스코프 밖이라 ReferenceError → catch가 삼켜
        //  '대출 중'까지만 바뀌고 예약 버튼이 조용히 사라지던 버그)
        const wic=row&&row.querySelector('.wic');
        note.innerHTML=`<div class="lcd-way t-ebook" onclick="ebReserve('${esc(brcd)}')" style="margin-top:8px">
          <span class="wic">${wic?wic.innerHTML:''}</span><span class="wlabel">예약하기 · 반납되면 알려드려요${waiting}</span><span class="ar">›</span></div>`;
        loadSimilarEbooks(brcd, bookTitle, {avail:false});   // 추천 v2(8/18): 예약은 1순위, 그 아래 "같은 장르 · 지금 바로 읽을 수 있는" 3권
      }
    }
  }catch(e){ try{ if(tag&&tag.isConnected) tag.remove(); }catch(_){} try{ loadSimilarEbooks(brcd, bookTitle, {avail:true}); }catch(_){} }   // 확인 실패 — 배지 생략, 추천은 그대로
}
// 전자책 대체 추천(추천 v2, _추천설계_20260818.md) — 학생이 열려던 전자책이 전권 대출 중일 때, 그 자리에서
//   "같은 장르(KDC) · 인기 · 지금 바로 읽을 수 있는" 3권. 줄거리 유사도 아님(급류를 찾은 학생은 '요즘 다들 읽는 소설'을 원한 것).
//   서버(curate similar 모드)가 재고까지 확인해 대출 가능한 것만 준다. 카드 클릭 = 바로 대출(lcBorrow). 측정: data-origin="similar" →
//   클릭 위임이 origin을 잡아 ebook_borrow 링크 이벤트에 origin=similar로 남는다(추천→대출 전환을 관리자 엑셀에서).
// 8/19 항상 추천으로 확장: 대출 가능일 때(avail:true)도, 종이책 상세(ctrl)에서도 같은 자리에 "같은 장르 전자책 3권". 문구만 상태별로 다르다.
//   부하: 서버가 도서관 재고를 최대 24권 찌르므로 같은 책은 sessionStorage 10분 캐시(서버에도 10분 캐시).
async function loadSimilarEbooks(brcd, bookTitle, opts){
  const box=document.getElementById('ebSimilar'); if(!box) return;
  opts=opts||{};
  const key=String(brcd||'')+'|'+String(opts.ctrl||'')+'|'+String(bookTitle||'').slice(0,40);
  if(box.dataset.for===key) return;   // 재고 재확인 등으로 두 번 불려도 한 번만
  box.dataset.for=key;
  // 8/30 사장님: 바로 읽을 수 없는 책도 추천 — 재고 문구는 책마다 아는 것만 붙인다
  const heading = opts.avail===false ? '기다리는 동안 — 같은 장르 전자책' : '같은 장르 전자책';
  try{
    const ck='ebsim:'+key; let d=null;
    try{ const c=JSON.parse(sessionStorage.getItem(ck)||'null'); if(c&&c.t&&Date.now()-c.t<600000) d=c.d; }catch(e){}
    if(!d){
      const r=await fetch(US_CURATE_FN,{method:'POST',headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON,'content-type':'application/json'},
        body:JSON.stringify({similar:{brcd:String(brcd||''), ctrl:String(opts.ctrl||''), title:bookTitle||'', count:3}})});
      d=await r.json();
      try{ if(d&&d.count) sessionStorage.setItem(ck,JSON.stringify({t:Date.now(),d})); }catch(e){}
    }
    if(!box.isConnected) return;   // 다른 책 모달로 바뀌었으면 폐기
    const list=(d&&Array.isArray(d.candidates))?d.candidates.filter(c=>c&&c.isbn&&c.title):[];
    if(!list.length){ box.innerHTML=''; return; }   // 대체재 없으면 조용히(주 액션만 남음)
    list.forEach(c=>{ curateToLibBook(c); US_CLICKMAP[String(c.isbn||'')]=c; });
    box.innerHTML=`<div class="ebsim" data-origin="similar" data-origin-id="${esc(String(brcd||opts.ctrl||''))}">
      <div class="ebsim-h">${heading}</div>
      <div class="ebsim-row">${list.map(c=>{ const isbn=String(c.isbn||'').replace(/'/g,'');
        return `<div class="ebsim-card" onclick="event.stopPropagation();ebSimOpen('${esc(isbn)}','${esc(String(brcd||opts.ctrl||''))}')" title="${esc(cleanT(c.title||''))}">
          <div class="ebsim-cv">${c.cover?`<img src="${esc(c.cover)}" loading="lazy" decoding="async" data-t="${esc(cleanT(c.title||''))}" data-a="${esc(String(c.author||''))}" onerror="ncSwap(this)">`:ncCover(c)}</div>
          <div class="ebsim-t">${escD(cleanT(c.title||''))}</div><div class="ebsim-a">${escD(c.author||'')}</div>
          ${c._avail?'<div class="ebsim-go">지금 대출 가능</div>':(c._stock?'<div class="ebsim-go" style="color:#dc2626">대출 중</div>':'')}</div>`; }).join('')}</div></div>`;
  }catch(e){ try{ if(box&&box.isConnected) box.innerHTML=''; }catch(_){} }
}
// 대체 추천 카드 클릭 → 바로 대출하지 않고 그 책의 상세(표지·설명·재고)로 이동, 거기서 '전자책 바로 읽기'로 대출(사용자 지시 8/18).
//   상세 모달(#lcDetail)에 data-origin=similar를 남겨 이후 대출 이벤트가 origin=similar로 기록되게 한다(4초 클릭창 밖에서도 측정 유지).
function ebSimOpen(isbn, fromBrcd){
  libDetail(isbn);
  try{ const ov=document.getElementById('lcDetail'); if(ov){ ov.setAttribute('data-origin','similar'); ov.setAttribute('data-origin-id',String(fromBrcd||'')); } }catch(e){}
}
// 전자책 예약 — 개인 계정이 있어야 순번이 내 것이 된다(공유계정으론 의미 없음)
async function ebReserve(brcd){
  if(!ssoIsPersonal()){ smLoginGuide(); return; }
  // '바로 읽기' 줄에서도 들어오므로(대출 중엔 클릭이 예약으로 전환) 실수 탭 방지 확인 필수
  if(!confirm('지금은 대출 중이에요.\n예약해 두면 반납되는 대로 순번대로 빌려드려요. 예약할까요?')) return;
  const r=await sbFn(SMEBK_FN,{action:'reserve',brcd:brcd});
  const d=await r.json();
  alert(d&&d.ok ? '예약했어요 — 반납되면 순번대로 알려드릴게요' : ((d&&(d.message||d.error))||'예약하지 못했어요'));
  if(d&&d.ok) loadEbookStock(brcd);
}
// 모달 줄거리 보강 → #lcdDesc 채움. isCatalog면 종이책(CATTOT+ctrl), 아니면 전자책(barcode 또는 isbn).
async function loadDesc(key, isCatalog, book){
  try{
    // 대상 요소를 await 전에 캡처 — 다른 책 모달로 바뀌면 이 el은 detach돼 늦은 응답이 무해해짐
    // (기존: 응답 후 id로 찾아 → A책 줄거리가 B책 모달에 쓰이던 레이스)
    const el=document.getElementById('lcdDesc'); if(!el) return;
    const auEl=document.querySelector('#lcDetail .lcd-i .au');   // 저자·출판사 줄(비어 있으면 함께 채움)
    const sel='description,author,publisher,pub_year';
    const url=isCatalog
      ? `${SB_REST}/semyung_tulip?ctrl=eq.${encodeURIComponent(key.replace(/^CATTOT/,''))}&select=${sel}&limit=1`
      : `${SB_REST}/semyung_tulip?or=(barcode.eq.${encodeURIComponent(key)},isbn.eq.${encodeURIComponent(key)})&select=${sel}&limit=1`;
    const r=await fetch(url,{headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok) return; const rows=await r.json(); const d=rows&&rows[0];
    if(!d) return;
    if(!el.isConnected) return;   // 모달이 재렌더/닫힘 → 폐기
    // 저자·출판사·발행년이 비어 있으면 채운다(있으면 손대지 않는다 — 목록이 더 정확할 수 있음)
    if(auEl && auEl.isConnected && !auEl.textContent.trim()){
      const bits=[d.author,d.publisher,d.pub_year].map(v=>String(v||'').trim()).filter(Boolean);
      if(bits.length) auEl.textContent=bits.join(' · ');
    }
    if(!d.description) return;
    if(el.textContent.trim()) return;   // 이미 줄거리가 있으면 덮지 않는다
    el.textContent=d.description; el.style.display='';
    lcdDescMark(el);   // 8/14: lazy 채움 뒤에도 잘림 여부 재판정
  }catch(e){}
}
// 8/14 사장님 수정요청: 도서 설명 잘림 — 넘칠 때만 '더 보기' 페이드, 탭하면 전체 펼침/접기 (도서관·고전 상세 공용)
function lcdDescMark(el){
  if(!el) return;
  el.onclick=function(){
    const open=el.classList.toggle('open');
    el.classList.toggle('clip', !open && el.scrollHeight>el.clientHeight+4);
  };
  el.classList.remove('clip');
  if(!el.classList.contains('open') && el.scrollHeight>el.clientHeight+4) el.classList.add('clip');
}
function closeLc(){document.getElementById('lcDetail').classList.remove('on');}
// 도서관에서 빌리기 — 브라우저가 직접 전자도서관 뷰어 페이지를 연다.
//  예스24 뷰어 토큰은 "여는 브라우저 세션"에 묶여 있어(DRM) 서버 릴레이로는 못 만든다.
//  그래서 b.lib(yes24_ebook_open.asp)를 브라우저가 직접 열어야 토큰이 유효하다.
//  새 탭의 첫 화면을 북스타 디자인 '이동 중' 브리지로 덮은 뒤 → 실제 뷰어로 넘긴다.
//  (예스24 선택화면 자체는 그들 서버라 못 바꾸지만, 전환 첫인상은 북스타가 갖는다.)
function bridgeHTML(b){
  const cover=b.cover?`<img src="${esc(hiCover(b.cover))}" alt="" style="width:108px;height:158px;object-fit:cover;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.45)">`:'<div style="width:108px;height:158px;border-radius:8px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:40px">📖</div>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>북스타 · 도서관 전자책</title><style>
  *{margin:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
    background:radial-gradient(1200px 600px at 50% -10%,#243056 0%,#1a2240 55%,#141a30 100%);
    color:#f4f1ea;font-family:'Noto Serif KR',serif;text-align:center;padding:40px}
  .logo{font-size:22px;letter-spacing:.18em;font-weight:700;color:#c9a86a;text-transform:uppercase}
  .cv{margin-top:6px}
  .ti{font-size:19px;font-weight:700;line-height:1.4}
  .au{font-size:13.5px;color:#b9c0d4;margin-top:-12px}
  .msg{font-size:14px;color:#d7dbe8;display:flex;align-items:center;gap:9px;margin-top:4px}
  .dot{width:7px;height:7px;border-radius:50%;background:#c9a86a;animation:bk 1s infinite ease-in-out}
  .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
  @keyframes bk{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
  .sub{font-size:12px;color:#8a93ad;margin-top:2px}
  </style></head><body>
  <div class="logo">bookstar</div>
  <div class="cv">${cover}</div>
  <div class="ti">${esc(cleanT(b.t))}</div>
  <div class="au">${esc(authorLine(b))}</div>
  <div class="msg"><span>세명대학교 학술정보원으로 연결합니다</span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <div class="sub">잠시만 기다려 주세요…</div>
  </body></html>`;
}
function lcBorrow(isbn){
  const b=LIB_POOL.find(x=>x.isbn===isbn); if(!b) return;
  const reckey=smKeyOf(b);   // isbn 접두 대신 lib URL의 진짜 brcd 우선(8/19) — 아니면 대출 없이 뷰어 URL을 그냥 열어 빈 화면
  // 세명대 전자도서관 구매 전자책(숫자 brcd) → 북스타 안에서 실제 대출 후 DRM 뷰어 열기
  const isEbookLoan = /^\d+$/.test(reckey) &&
    ((b.lib||'').indexOf('ebook.semyung')>-1 || (b.lib||'').indexOf('elibrary')>-1 || (b.tags&&b.tags.includes('ebook')));
  // 미연동자 전자책 대출 차단(8/9) — 예전엔 공유계정(관장님)으로 대신 빌려줘서 관장님 이름으로
  // 기록이 남고, 5칸이 차면 남이 읽던 책이 강제 반납됐다. 창을 열기 전에 막는다.
  if(isEbookLoan && !ssoIsPersonal()){ smLoginGuide('read'); return; }
  // 대출형(isEbookLoan)은 대출 '성공 후'에 서재 기록(smEbookBorrowOpen 내) — 실패해도 '읽는 중'에 남던 버그 방지
  if(b.lib && !isEbookLoan) shelfAdd(b);   // 외부 열람형은 열기=열람 시작으로 기록('읽고 돌아오기' 루프)
  const w=window.open('','_blank');                 // 제스처 내에서 새 탭 확보(팝업차단 회피)
  if(isEbookLoan){
    if(!w){ alert('새 창이 차단됐어요. 팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
    try{ w.document.write(bridgeHTML(b)); w.document.close(); }catch(e){}
    smEbookBorrowOpen(reckey, w, b);   // 대출 → 성공 시 서재 기록 + viewerUrl로 이동
    return;
  }
  const dest = b.lib || semyungLink(cleanT(b.t||b.title||''));
  bxEvent('link',{sub:(b.lib?'ext_open':'opac_open'), book:b});   // 측정: 이용(외부 뷰어/통합검색으로 넘김)
  if(!w){ window.open(dest,'_blank','noopener'); return; }
  try{ w.document.write(bridgeHTML(b)); w.document.close(); }catch(e){}
  setTimeout(()=>{ try{ w.location.href=dest; }catch(e){} }, 1600);   // 북스타 브리지 → 실제 뷰어/통합검색
}
// 전자도서관 구매 전자책 대출 — semyung-ebook-borrow가 로그인·대출·뷰어URL 생성까지 대행, 그 URL로 이동
const SMEBK_FN="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-ebook-borrow";
// 폰 브라우저면 교보 뷰어를 모바일용으로 발급(device=m) — PC용 뷰어가 폰에서 깨짐(8/21, 앱과 동일 수리).
// 판별식은 도서관 자체 isPC()와 동일. 창 크기가 아니라 UA 기준(좁힌 PC 창에 모바일 뷰어가 나가지 않게)
const SM_DEV=/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)?'&device=m':'';
const SMMY_FN ="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-my";
// ── 세명대 개인기능 자격증명 ──
// 토큰이 있으면 학생 본인 명의(각자 5권 한도), 없으면 서버가 공유계정으로 폴백한다.
const SSO_TOK_KEY='bx_sso_token', SSO_PERSONAL_KEY='bx_sso_personal';
function ssoToken(){ try{ return localStorage.getItem(SSO_TOK_KEY)||''; }catch(e){ return ''; } }
function ssoIsPersonal(){ try{ return localStorage.getItem(SSO_PERSONAL_KEY)==='1'; }catch(e){ return false; } }

