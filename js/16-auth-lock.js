/* ═══ 8/29 신원 잠금 — 앱 안 활동(글·챌린지·팔로우·인생책)의 학생 신원 = Supabase Auth 세션 ═══
   전에는 주소창 ?sso_uid=학번 / localStorage 학번을 그대로 믿어 "학번만 알면 남으로" 쓰고 지울 수 있었다.
   이제 sso-login 이 주는 1회용 sso_auth 를 /auth/v1/verify 로 세션(JWT)으로 바꾸고, 그 JWT 의
   app_metadata.hakbun(서버만 쓸 수 있는 칸)이 학번이다. DB(RLS)는 이 학번과 행의 student_id 가 같을 때만 쓰게 한다.
   BX_H.Authorization 을 이 세션으로 바꿔 두면 기존 호출 70여 곳이 그대로 본인 명의로 동작한다. */
const BX_AUTH_KEY='bx_auth';
// (SB_AUTH 는 js/00-config.js — 9/2 S7-4)
let _bxAuthTimer=null;
function _bxJwt(at){
  try{ let p=String(at).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); while(p.length%4) p+='=';
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p),c=>c.charCodeAt(0)))); }catch(e){ return null; }
}
function _bxAuthGet(){ try{ return JSON.parse(localStorage.getItem(BX_AUTH_KEY)||'null'); }catch(e){ return null; } }
function _bxAuthStore(j){
  const sess={at:j.access_token, rt:j.refresh_token, exp:(j.expires_at||(Math.floor(Date.now()/1000)+(j.expires_in||3600)))};
  try{ localStorage.setItem(BX_AUTH_KEY, JSON.stringify(sess)); }catch(e){}
  return sess;
}
function _bxAuthClear(){ try{ localStorage.removeItem(BX_AUTH_KEY); }catch(e){} BX_H.Authorization='Bearer '+COVER_ANON; clearTimeout(_bxAuthTimer); }
function _bxAuthSchedule(sess){
  clearTimeout(_bxAuthTimer);
  const ms=Math.max(10000,(sess.exp-Math.floor(Date.now()/1000)-120)*1000);
  _bxAuthTimer=setTimeout(bxAuthRefresh, Math.min(ms, 2000000000));
}
// 세션 → 헤더 + 학생 확정. 학번이 JWT 에 없으면 신원으로 안 친다.
function _bxAuthApply(sess){
  const p=_bxJwt(sess.at)||{};
  const hak=String((p.app_metadata&&p.app_metadata.hakbun)||'');
  if(!hak){ _bxAuthClear(); return false; }
  BX_H.Authorization='Bearer '+sess.at;
  const nm=String((p.user_metadata&&p.user_metadata.name)||hak);
  const cur=bxStudent();
  const st={id:hak, name:nm, emoji:(cur&&cur.id===hak&&cur.emoji)||'🎓', dept:'세명대학교'};
  window.__SSO_STUDENT=st; bxSetStudent(st);
  _bxAuthSchedule(sess);
  return true;
}
async function bxAuthRefresh(){
  const s=_bxAuthGet(); if(!s||!s.rt) return false;
  try{
    const r=await sbAuth('/token?grant_type=refresh_token',{refresh_token:s.rt});
    if(r.ok){ const j=await r.json(); if(j&&j.access_token) return _bxAuthApply(_bxAuthStore(j)); }
    if(r.status===400||r.status===401||r.status===403){
      const s2=_bxAuthGet();                       // 다른 탭이 먼저 갱신했으면 그걸 쓴다
      if(s2&&s2.rt&&s2.rt!==s.rt) return _bxAuthApply(s2);
      bxAuthSignedOut(); return false;
    }
  }catch(e){}
  clearTimeout(_bxAuthTimer); _bxAuthTimer=setTimeout(bxAuthRefresh,60000);   // 네트워크 — 1분 뒤 재시도
  return false;
}
// 세션 무효(서버에서 회수·만료) — 게스트로 되돌림
function bxAuthSignedOut(){
  _bxAuthClear();
  try{ localStorage.removeItem('bookstar-current-student'); localStorage.removeItem(SSO_TOK_KEY); localStorage.removeItem(SSO_PERSONAL_KEY); }catch(e){}
  try{ window.__SSO_STUDENT=null; }catch(e){}
  try{ bxRenderAccountChip(); }catch(e){}
}
// sso-login 이 준 1회용 해시 → 세션. 성공=true
async function bxAuthExchange(tokenHash){
  try{
    const r=await sbAuth('/verify',{type:'magiclink',token_hash:tokenHash});
    if(!r.ok) return false;
    const j=await r.json(); if(!j||!j.access_token) return false;
    return _bxAuthApply(_bxAuthStore(j));
  }catch(e){ return false; }
}
// 시작 시 복원 — 세션이 없으면 옛 방식 잔여(학번만 든 localStorage)는 신원이 아니므로 지운다
function bxAuthRestore(){
  const s=_bxAuthGet();
  if(!s||!s.at){ try{ localStorage.removeItem('bookstar-current-student'); }catch(e){} try{ window.__SSO_STUDENT=null; }catch(e){} return false; }
  const ok=_bxAuthApply(s);
  if(ok && s.exp-Math.floor(Date.now()/1000)<=120) bxAuthRefresh();   // 만료 임박·지남 → 바로 재발급(표시는 유지)
  return ok;
}
bxAuthRestore();
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState!=='visible') return; const s=_bxAuthGet(); if(s&&s.rt&&s.exp-Math.floor(Date.now()/1000)<=120) bxAuthRefresh(); });
function smHeaders(){
  const t=ssoToken();
  return t ? {apikey:COVER_ANON, Authorization:'Bearer '+t} : {apikey:COVER_ANON, Authorization:'Bearer '+COVER_ANON};
}
// 종이책 개인기능 공용 호출 — 대출현황/연장/예약. 미연동(409)이면 안내 문구를 그대로 돌려준다.
async function smMy(action, params){
  const q=new URLSearchParams(Object.assign({action:action}, params||{}));
  const r=await sbFn(SMMY_FN+'?'+q.toString());   // 쿼리는 URLSearchParams 인코딩 그대로(공백=+) — sbFn 의 encodeURIComponent 와 달라 여기서 조립
  return await r.json();
}
/* ── 알림(웹푸시) ──────────────────────────────────────────────────
   지금까지 반납일은 "앱을 열어야만" 알 수 있었다(사이드바 배지). 이게 그 반대편이다.
   서버(notify-due)가 매일 아침 도서관을 대신 확인하고, 켠 사람에게만 하루 한 통 보낸다.
   ⚠️ 아이폰은 홈 화면에 추가(A2HS)한 경우에만 웹푸시가 온다 — 그래서 안내를 따로 띄운다. */
// (PUSHREG_FN 은 js/00-config.js — 9/2 S7-4)
const VAPID_PUB="BCot9wRyajAtBdSgORnIrh26K_qWtmXFicgP5C8D8dAiswMYW7YLBQakjW3441syTPxPvTguM481_KiLZ_leFhE";
const pushSupported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
// iOS는 홈 화면에 설치해야만 푸시가 된다 — 사파리 탭에서는 아무리 눌러도 안 온다
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function b64ToU8(s){
  const pad='='.repeat((4-s.length%4)%4);
  const raw=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));
  const u=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) u[i]=raw.charCodeAt(i);
  return u;
}
async function pushReg(){ return await navigator.serviceWorker.register('/sw.js',{scope:'/'}); }
async function pushCurrent(){
  if(!pushSupported()) return null;
  try{ const r=await navigator.serviceWorker.getRegistration('/'); return r?await r.pushManager.getSubscription():null; }catch(e){ return null; }
}
async function pushEnable(){
  if(!pushSupported()){ alert('이 브라우저는 알림을 지원하지 않아요.'); return false; }
  // 권한 요청은 사용자가 버튼을 누른 그 순간에만 통한다(제스처 밖에서 부르면 조용히 거부됨)
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){
    alert(perm==='denied'
      ? '알림이 차단돼 있어요. 브라우저 주소창의 자물쇠 → 알림 → 허용으로 바꿔 주세요.'
      : '알림을 켜지 못했어요.');
    return false;
  }
  const reg=await pushReg();
  await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(VAPID_PUB)});
  const j=sub.toJSON();
  const r=await sbFnPost(PUSHREG_FN,{action:'subscribe',subscription:{endpoint:j.endpoint,keys:j.keys}});
  const d=await r.json();
  if(!d||!d.ok){
    // 서버에 등록 못 했으면 브라우저 구독만 남아 "켜진 것처럼 보이는데 안 오는" 상태가 된다 — 되돌린다
    try{ await sub.unsubscribe(); }catch(e){}
    alert((d&&d.error)||'알림을 등록하지 못했어요.');
    return false;
  }
  // 진짜로 오는지 그 자리에서 한 통 — "켰는데 오는지 모르겠다"를 없앤다
  try{ await sbFnPost(PUSHREG_FN,{action:'test',endpoint:j.endpoint}); }catch(e){}
  return true;
}
async function pushDisable(){
  const sub=await pushCurrent();
  if(!sub) return true;
  const ep=sub.endpoint;
  try{ await sub.unsubscribe(); }catch(e){}
  try{ await sbFnPost(PUSHREG_FN,{action:'unsubscribe',endpoint:ep}); }catch(e){}
  return true;
}
async function pushToggle(on){
  const box=document.getElementById('myLibPush');
  if(box) box.style.opacity='.5';
  try{ if(on) await pushEnable(); else await pushDisable(); }
  finally{ if(box) box.style.opacity=''; renderPushRow(); }
}
/* 8/30 사장님: 반납일 알림 줄 감춤.
   보내는 쪽(아침 배치 bookstar-notify-due)이 8/27 학교 자동 읽기 정지 때 같이 꺼져 있어,
   켜도 확인 알림 한 통 뒤로는 아무것도 오지 않는다 — 거짓말하는 버튼이라 화면에서 뺀다.
   되살리는 법: PUSH_UI_OFF=false + DB에서 select cron.alter_job(5, active:=true).
   (전자책 대출목록은 화면 긁기라, 긁기 없이 가려면 종이책만 알리도록 notify-due도 손봐야 함) */
const PUSH_UI_OFF=true;
async function renderPushRow(){
  const box=document.getElementById('myLibPush');
  if(!box) return;
  if(PUSH_UI_OFF){ box.innerHTML=''; return; }
  if(!ssoIsPersonal()){ box.innerHTML=''; return; }
  const wrap=(inner)=>`<div class="section" style="padding-top:0"><div style="background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:13px 14px">${inner}</div></div>`;
  if(!pushSupported()){
    box.innerHTML=wrap(`<div style="font-size:12.5px;color:var(--text-light)">이 브라우저는 알림을 지원하지 않아요.</div>`);
    return;
  }
  // 아이폰: 홈 화면에 추가하기 전에는 켜도 오지 않으므로, 켜기 버튼 대신 설치 안내를 보여준다
  if(isIOS()&&!isStandalone()){
    box.innerHTML=wrap(`<div style="font-size:13px;font-weight:800;margin-bottom:4px">알림 받기</div>
      <div style="font-size:12.5px;color:var(--text-sub);line-height:1.55">아이폰은 <b>홈 화면에 추가</b>한 뒤에만 알림을 받을 수 있어요.<br>
      공유 <span style="font-family:system-ui">↑</span> → <b>홈 화면에 추가</b> → 홈에서 북스타를 열고 다시 이 화면으로 오세요.</div>`);
    return;
  }
  const on=!!(await pushCurrent());
  const denied=Notification.permission==='denied';
  const btn=denied
    ? `<span style="font-size:12px;color:#dc2626;font-weight:700;flex:none">브라우저에서 차단됨</span>`
    : `<button onclick="pushToggle(${on?'false':'true'})" style="flex:none;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;${on?'background:transparent;color:var(--text-sub);border:1px solid var(--border)':'background:var(--primary);color:#fff;border:1px solid var(--primary)'}">${on?'끄기':'켜기'}</button>`;
  box.innerHTML=wrap(`<div style="display:flex;gap:10px;align-items:center">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:800">반납일 알림 ${on?'<span style="font-size:11px;color:#16a34a">켜짐</span>':''}</div>
      <div style="font-size:12.5px;color:var(--text-sub);margin-top:3px;line-height:1.5">앱을 안 열어도 <b>반납 사흘 전·하루 전·당일</b>, 연체, 예약한 책 도착을 알려드려요. 하루 한 번만 울려요.</div>
    </div>${btn}
  </div>`);
}
// 도서관 XML은 결과가 1건이면 배열이 아니라 객체로 온다 — 항상 배열로 펴서 쓴다
function smItems(d){ const it=((d||{}).data||{}).item; if(!it) return []; return Array.isArray(it)?it:[it]; }
// 도서관 날짜는 "2026.08.24" 또는 "20260824" 두 형태로 온다
function smDate(s){
  const t=String(s||'').replace(/[^0-9]/g,'');
  if(t.length!==8) return null;
  const d=new Date(+t.slice(0,4), +t.slice(4,6)-1, +t.slice(6,8));
  return isNaN(d) ? null : d;
}
// 오늘 기준 남은 일수(음수면 연체). 시각은 버리고 날짜만 비교한다.
function smDday(s){
  const d=smDate(s); if(!d) return null;
  const t=new Date(); t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
const smFmt=(s)=>{ const d=smDate(s); return d?`${d.getMonth()+1}월 ${d.getDate()}일`:''; };

/* ── 우리 도서관 상단: 빌린 책 · 기다리는 책 ──────────────────────────
   도서관 홈페이지에 들어가야만 알 수 있던 것(반납일·예약 도착)을 여기서 먼저 알려준다.
   숫자·날짜는 전부 도서관 실시간 값. 추정·캐시 없음. 개인연동 안 된 이용자에겐 아예 안 보인다. */
async function renderMyLibStatus(_retry){
  const el=document.getElementById('myLibBody');
  const line=document.getElementById('myLibStatus');   // 우리 도서관 상단 한 줄 요약
  // 알림 줄은 대출 목록과 무관하게 그린다(아래 어느 경로로 빠져나가도 항상 보이도록)
  try{ renderPushRow(); }catch(e){}
  // 8/21: 내서재 맨 위 '내 대출·예약' 그룹 — 도서관 연동 학생에게만 헤더째 표시
  try{ const g=document.getElementById('libGroup'); if(g) g.style.display=ssoIsPersonal()?'':'none'; const a=document.querySelector('#actGroup .lib-grp'); if(a) a.classList.toggle('first',!ssoIsPersonal()); }catch(e){}
  if(!ssoIsPersonal()){ if(el) el.innerHTML=''; if(line) line.innerHTML=''; MYLIB_BADGE=null; return; }
  try{
    // 종이책(퓨처누리)과 전자책(교보)은 시스템이 다르지만 학생에겐 그냥 '내가 빌린 책'이다 — 한 화면에 합친다
    const _safe=p=>p.catch(()=>null);
    // 8/30 실측: 전자책 대출·예약 조회를 동시에 보내면 학교 전자도서관 로그인이 겹쳐 둘 중 하나가 409(연결 안 됨)로 실패했다
    //   (순서대로 부르면 12/12 성공) → 전자책 둘은 차례로, 종이책 셋은 동시에.
    const _ebSeq=(async()=>{ const a=await smEbookLoans(); const b=await smEbookReserves(); return [a,b]; })();
    let [ln,rv,pk,_ebPair]=await Promise.all([_safe(smMy('loans')),_safe(smMy('reservations')),_safe(smMy('pickups')),_ebSeq]);
    let [eb,ebrv]=_ebPair;
    // 8/30 사장님 지적("안 보일 때가 많고 새로고침해야 보임"): 다섯 조회 중 하나라도 실패하면 예전엔 "없어요"로 그렸다.
    //   실패는 '일부 못 불러옴'으로 정직하게 표시하고 1.5초 뒤 한 번 자동 재시도, 그래도 안 되면 '다시 시도' 버튼.
    const _bad=x=>x===null||x===undefined||(x&&x.ok===false&&!x.needsPersonal&&!/로그인이 필요|만료/.test(x.error||''));
    const partial=_bad(ln)||_bad(rv)||_bad(pk)||eb===null||ebrv===null;
    eb=eb||[]; ebrv=ebrv||[];
    if(partial && !_retry){ setTimeout(()=>{ try{ renderMyLibStatus(true); }catch(e){} },1500); }
    const partialNote=partial?`<div style="display:flex;gap:8px;align-items:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:12.5px;color:#9a3412">
        <span>${_retry?'도서관에서 일부 정보를 불러오지 못했어요.':'도서관 정보를 다시 불러오는 중…'}</span>${_retry?'<button onclick="renderMyLibStatus(true)" style="margin-left:auto;border:1px solid #fdba74;background:#fff;color:#9a3412;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">다시 시도</button>':''}
      </div>`:'';
    // 토큰 만료(401)·연동 소실(409) — 이대로 두면 "연결됨·0권"이라는 거짓 화면이 된다.
    // 개인 플래그를 내리고, 다시 배너로 로그인하라고 정직하게 알린다.
    if(ln && ln.ok===false && (ln.needsPersonal || /로그인이 필요|만료/.test(ln.error||''))){
      try{ localStorage.setItem(SSO_PERSONAL_KEY,'0'); }catch(e){}
      if(el) el.innerHTML=`<div class="section"><div style="display:flex;gap:8px;align-items:center;background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:11px 14px">
        <span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;flex:none"></span>
        <span style="font-size:12.5px;color:var(--text-sub)">도서관 연동이 만료됐어요 — 도서관 홈페이지 배너로 다시 로그인해 주세요</span>
      </div></div>`;
      if(line) line.innerHTML='';
      MYLIB_BADGE=null; renderSideNav(_navPage);
      return;
    }
    const loans=smItems(ln), resv=smItems(rv);
    // 찾아줘북즈는 취소·완료 건도 이력으로 남으므로 진행 중인 것만 고른다.
    // ⚠️ 예전엔 loan_status==='0001'(예약신청)만 남겼는데, 직원이 책을 꺼내 상태를 다음 단계로
    //    바꾸는 순간 목록에서 통째로 사라졌다 — 정작 "찾아가세요"가 되는 그 시점에 안 보인 것.
    //    코드값을 다 알 수 없으므로(도서관이 0002·0003을 뭐라 쓰는지 미확인) 날짜로 판정한다:
    //    수령일(loan_date)이나 취소일(cancel_date)이 찍히면 끝난 건, 비어 있으면 진행 중. (8/9 실측)
    const _ended=(x)=>String(x.loan_date||'').trim()!==''||String(x.cancel_date||'').trim()!=='';
    const picks=smItems(pk).filter(x=>!_ended(x));
    // 빌린 것도 기다리는 것도 없을 때 — 아무것도 안 그리면 연동이 된 건지 알 수 없다.
    // 도서관 계정이 붙었다는 신호는 남기되, 큐레이션을 가리지 않게 한 줄로.
    // 이용 상태 — ⚠️ myloan info는 종이책만 센다. 그대로 쓰면 전자책 2권을 빌린 학생에게
    //   "0권 대출 중"이라고 하면서 바로 아래엔 2권을 보여주는 모순이 생긴다.
    //   그래서 화면에 실제로 그리는 목록으로 직접 센다 — 숫자와 목록이 항상 일치한다.
    const overdueCnt=[...loans.map(x=>x.return_plan_date),...eb.map(x=>x.dueDate)]
      .map(smDday).filter(d=>d!==null&&d<0).length;
    const loanCnt=loans.length+eb.length, waitCnt=resv.length+picks.length;
    const statusBox=`<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
      <span style="font-size:12px;font-weight:800;color:var(--primary)">이용 상태</span>
      <span style="font-size:12.5px;color:var(--text-sub)"><b style="color:${overdueCnt?'#dc2626':'var(--text)'}">${overdueCnt}</b>권 연체</span>
      <span style="font-size:12.5px;color:var(--text-sub)"><b style="color:var(--text)">${loanCnt}</b>권 대출 중</span>
      <span style="font-size:12.5px;color:var(--text-sub)"><b style="color:var(--text)">${waitCnt}</b>권 기다리는 중</span>
    </div>`;

    if(!loans.length && !resv.length && !picks.length && !eb.length && !ebrv.length){
      el.innerHTML=`<div class="section">${partialNote}${partial?'':statusBox}${partial?'':`<div style="display:flex;gap:8px;align-items:center;background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:11px 14px">
        <span style="width:7px;height:7px;border-radius:50%;background:#16a34a;flex:none"></span>
        <span style="font-size:12.5px;color:var(--text-sub)">도서관 계정 연결됨 — 지금 빌리거나 기다리는 책이 없어요</span>
      </div>`}</div>`;
      if(line) line.innerHTML='';
      MYLIB_BADGE=null; renderSideNav(_navPage);
      return;
    }
    const box=(inner)=>`<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:13px 14px;margin-bottom:8px">${inner}</div>`;
    const head=(t)=>`<div style="font-size:12px;font-weight:800;color:var(--text-sub);margin:0 0 7px">${t}</div>`;
    let html=partialNote+statusBox;

    // ① 빌린 책 — 종이책+전자책을 합쳐 반납일이 급한 순으로
    const all=loans.map(x=>({kind:'paper',title:x.title,author:x.author,due:x.return_plan_date,
                             renewCnt:parseInt(x.renew_cnt||0,10)||0,acc:x.accession_no||''}))
      .concat(eb.map(x=>({kind:'ebook',title:x.title,author:x.author,due:x.dueDate,
                          extendable:x.extendable,loanSrmb:x.loanSrmb,brcd:x.brcd})));
    if(all.length){
      const sorted=all.slice().sort((a,b)=>(smDday(a.due)??999)-(smDday(b.due)??999));
      html+=head(`빌린 책 ${all.length}권`)+sorted.map(x=>{
        const dd=smDday(x.due);
        let when,color;
        if(dd===null){ when='반납일 정보 없음'; color='var(--text-light)'; }
        else if(dd<0){ when=`${-dd}일 연체`; color='#dc2626'; }
        else if(dd===0){ when='오늘까지'; color='#dc2626'; }
        else if(dd<=3){ when=`${dd}일 남음`; color='#ea580c'; }
        else{ when=`${smFmt(x.due)}까지`; color='var(--text-sub)'; }
        const isEb=x.kind==='ebook';
        const kindTag=isEb?'<span style="font-size:10.5px;font-weight:800;color:#1d4ed8;background:rgba(37,99,235,.1);border-radius:5px;padding:1px 5px;margin-right:5px">전자책</span>':'';
        const extra=isEb?'':(x.renewCnt?` · ${x.renewCnt}회 연장함`:'');
        const bs='flex:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;background:transparent';
        // 전자책은 도서관이 '연장 가능/불가'를 직접 알려주므로 그 판정을 따른다.
        // 종이책 반납은 도서관에 직접 가야 하므로 버튼을 두지 않는다 — 전자책만 여기서 반납된다.
        // 전자책 버튼 순서 = 학생이 여기 오는 이유 순서. 9할은 읽으러 온다 → '이어 읽기'가 맨 앞·유일한 채운 버튼.
        const _t=esc(cleanT(x.title||'').replace(/'/g,'’'));
        const _a=esc(String(x.author||'').replace(/'/g,'’'));
        // 서평 쓰기는 빌린 책에서만(8/14) — 대출이 "읽었다"의 최소 증거. 책 상세의 쓰기 버튼은 제거됨.
        const rvBtn=`<button onclick="smReviewFromLoan('${isEb?'ebook':'paper'}','${isEb?esc(x.brcd):''}','${_t}','${_a}')" style="${bs};color:var(--text-sub);border:1px solid var(--border)">서평</button>`;
        const btns=isEb
          ? `<button onclick="ebOpen('${esc(x.loanSrmb)}','${esc(x.brcd)}','${_t}')" style="${bs};background:var(--primary);color:#fff;border:1px solid var(--primary)">이어 읽기</button>`
            +(x.extendable?`<button onclick="ebExtend('${esc(x.loanSrmb)}','${esc(x.brcd)}')" style="${bs};color:var(--primary);border:1px solid var(--primary)">연장</button>`:'')
            +`<button onclick="ebReturn('${esc(x.loanSrmb)}','${esc(x.brcd)}','${_t}')" style="${bs};color:var(--text-sub);border:1px solid var(--border)">반납</button>`+rvBtn
          : `<button onclick="smRenew('${esc(x.acc)}')" style="${bs};color:var(--primary);border:1px solid var(--primary)">연장</button>`+rvBtn;
        return box(`<div class="sm-loan-row" style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;line-height:1.4">${kindTag}${esc(cleanT(x.title||''))}</div>
            ${x.author?`<div style="font-size:12px;color:var(--text-light);margin-top:2px">${esc(x.author)}</div>`:''}
            <div style="font-size:12.5px;font-weight:700;color:${color};margin-top:5px">${when}${extra}${isEb?'':' · 반납은 도서관에서'}</div>
          </div><div style="display:flex;gap:6px;flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end">${btns}</div>
        </div>`);
      }).join('');
    }

    // ② 기다리는 책 — 예약(반납 대기) + 찾아줘북즈(서가 픽업)
    if(resv.length||picks.length||ebrv.length){
      html+=head(`기다리는 책 ${resv.length+picks.length+ebrv.length}권`);
      html+=ebrv.map(x=>box(`<div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;line-height:1.4"><span style="font-size:10.5px;font-weight:800;color:#1d4ed8;background:rgba(37,99,235,.1);border-radius:5px;padding:1px 5px;margin-right:5px">전자책</span>${esc(cleanT(x.title||''))}</div>
            <div style="font-size:12.5px;color:var(--text-sub);margin-top:5px">반납되면 순번대로 빌려드려요${x.rank?` · 내 순번 ${esc(x.rank)}번`:''}</div>
          </div>
          <button onclick="ebDropReserve('${esc(x.prenSrmb)}')" style="flex:none;background:transparent;color:var(--text-sub);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>
        </div>`)).join('');
      html+=resv.map(x=>{
        // 0008 = 예약서가비치 → 도착. 3일 내 안 찾으면 자동취소 + 1개월 예약정지라 가장 크게 알린다.
        const arrived=(x.reservation_staus||x.reservation_status)==='0008';
        const rank=parseInt(x.reservation_rank||0,10)||0;
        const note=arrived
          ? `<span style="color:#16a34a;font-weight:800">도착했어요${x.wait_date?` · ${smFmt(x.wait_date)}까지 찾아가세요`:''}</span>`
          : `${esc(x.reservation_status_display||'예약중')}${rank?` · 내 순번 ${rank}번`:''}`;
        return box(`<div class="sm-loan-row" style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;line-height:1.4">${esc(cleanT(x.title||''))}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">${esc(x.author||'')}</div>
            <div style="font-size:12.5px;color:var(--text-sub);margin-top:5px">${note}</div>
          </div>
          <button onclick="smDropReserve('${esc(x.main_no||'')}')" style="flex:none;background:transparent;color:var(--text-sub);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>
        </div>`);
      }).join('');
      html+=picks.map(x=>{
        // 상태 문구는 도서관이 준 이름을 그대로 쓴다(loan_status_name: "예약신청" 등).
        // 우리가 코드를 해석하지 않으므로 도서관이 단계를 늘려도 그대로 정확하다.
        const ready=String(x.loan_status||'')!=='0001';   // 신청 단계를 벗어남 = 직원이 처리 시작
        const stName=String(x.loan_status_name||'').trim();
        const note=ready
          ? `<span style="color:#16a34a;font-weight:800">${esc(stName||'준비 중')}</span> · ${esc(x.receive_location||'민송도서관')} 2층 안내데스크에서 받으세요`
          : `서가에서 찾는 중 · ${esc(x.receive_location||'민송도서관')} 2층 안내데스크에서 수령`;
        // 취소는 신청 단계(0001)에서만 통한다 — 처리 시작 후엔 버튼 대신 안내(눌러도 실패하는 버튼을 두지 않는다, 8/14)
        const cancelBtn=ready
          ? `<span style="flex:none;font-size:11.5px;color:var(--text-light);align-self:center">취소는 데스크에</span>`
          : `<button onclick="smDropPickup('${esc(x.request_no||'')}')" style="flex:none;background:transparent;color:var(--text-sub);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>`;
        return box(`<div class="sm-loan-row" style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;line-height:1.4">${esc(cleanT(x.title||''))}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">${esc(x.author||'')}</div>
            <div style="font-size:12.5px;color:var(--text-sub);margin-top:5px">${note}</div>
          </div>
          ${cancelBtn}
        </div>`);
      }).join('');
    }
    el.innerHTML=`<div class="section" style="padding-bottom:4px">${html}</div>`;

    // ③ 사이드바 배지 + 우리 도서관 한 줄 요약 — 내 도서관에 안 들어와도 급한 건 알게 한다
    const arrived=resv.filter(x=>(x.reservation_staus||x.reservation_status)==='0008').length;
    const due=all.map(x=>smDday(x.due)).filter(d=>d!==null);
    const overdue=due.filter(d=>d<0).length;
    const soon=due.filter(d=>d>=0&&d<=3).length;
    // 찾아줘북즈가 신청 단계를 벗어남 = 직원이 처리 중/완료 → 24시간 안에 받아야 하므로 가장 급하다
    const readyPick=picks.filter(x=>String(x.loan_status||'')!=='0001').length;
    MYLIB_BADGE = overdue    ? {color:'#dc2626', title:`${overdue}권 연체`}
                : readyPick  ? {color:'#16a34a', title:'신청한 책이 준비됐어요'}
                : arrived    ? {color:'#16a34a', title:'예약한 책이 도착했어요'}
                : soon       ? {color:'#ea580c', title:'반납일이 다가와요'} : null;
    renderSideNav(_navPage);
    // 8/16 사용자 지시: 우리 도서관 상단 한 줄 요약 배너 삭제 — #myLibStatus div가 없어져 line은 null.
    // 급한 신호는 위 MYLIB_BADGE(사이드바 배지)로 유지.
  }catch(e){ if(el) el.innerHTML=''; }
}
// 내가 빌린 전자책 — 실패해도 종이책 표시는 살려야 하므로 빈 배열로 흡수
// ⚠️ personal===true 확인 필수: 개인세션 수립이 실패하면 서버가 공유계정으로 폴백하는데,
//    그 목록을 그대로 그리면 남(공유계정)의 대출이 학생 것처럼 보이고 반납 버튼까지 진짜 작동한다.
async function smEbookLoans(){
  if(!ssoIsPersonal()) return [];
  try{
    const r=await sbFn(SMEBK_FN,{action:'myLoans'});
    const d=await r.json();
    if(d&&d.ok&&d.personal===true&&Array.isArray(d.items)) return d.items;
    return null;   // 8/30: 실패는 '0권'이 아니라 '모름'으로 — 화면이 "없어요"라고 거짓말하지 않게
  }catch(e){ return null; }
}
// 내가 예약한 전자책 — 취소에 필요한 예약번호가 여기서만 나온다. personal 확인은 위와 같은 이유.
async function smEbookReserves(){
  if(!ssoIsPersonal()) return [];
  try{
    const r=await sbFn(SMEBK_FN,{action:'myReserves'});
    const d=await r.json();
    if(d&&d.ok&&d.personal===true&&Array.isArray(d.items)) return d.items;
    return null;
  }catch(e){ return null; }
}
async function ebDropReserve(prenSrmb){
  if(!confirm('예약을 취소할까요?')) return;
  const r=await sbFn(SMEBK_FN,{action:'cancelReserve',prenSrmb:prenSrmb});
  const d=await r.json();
  readerToast(d&&d.ok?'예약을 취소했어요':((d&&(d.message||d.error))||'취소하지 못했어요'));
  renderMyLibStatus();
}
// 빌린 전자책 이어 읽기 — 도서관 사이트의 '바로보기'. 뷰어 주소는 세션에 묶여 있어 매번 서버가 새로 만든다.
// (대출 때 받은 주소를 저장해 뒀다 쓰면 안 열린다 — 그래서 지금까지 이어 읽을 길이 없었다)
async function ebOpen(loanSrmb, brcd, title){
  const w=window.open('','_blank');                 // 제스처 안에서 새 탭 확보(팝업차단 회피)
  if(!w){ alert('새 창이 차단됐어요. 팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
  try{ w.document.write(bridgeHTML({t:title||'',a:'',cover:''})); w.document.close(); }catch(e){}
  try{
    const r=await sbFn(SMEBK_FN,{action:'viewer',loanSrmb:loanSrmb,brcd:brcd||''},{dev:true});
    const d=await r.json();
    if(d&&d.ok&&d.viewerUrl){ try{ w.location.href=d.viewerUrl; }catch(e){ window.open(d.viewerUrl,'_blank'); } return; }
    try{ w.close(); }catch(e){}
    // 연동 만료 — 빈 창만 남기지 말고 다시 로그인으로 잇는다
    if(d&&d.needsPersonal){ try{ localStorage.setItem(SSO_PERSONAL_KEY,'0'); }catch(e){} smLoginGuide('read'); return; }
    readerToast((d&&(d.message||d.error))||'책을 열지 못했어요');
    renderMyLibStatus();   // 반납·만료로 목록이 바뀐 경우 화면을 사실에 맞춘다
  }catch(e){ try{ w.close(); }catch(_){} readerToast('책을 여는 중 오류가 났어요'); }
}
async function ebExtend(loanSrmb, brcd){
  const r=await sbFn(SMEBK_FN,{action:'extend',loanSrmb:loanSrmb,brcd:brcd||''});
  const d=await r.json();
  readerToast(d&&d.ok?'연장했어요':((d&&d.message)||'연장할 수 없어요'));
  renderMyLibStatus();
}
// 전자책 반납 — 반납하면 더 못 읽으므로 반드시 확인을 받는다(대출 슬롯은 즉시 비워짐)
async function ebReturn(loanSrmb, brcd, title){
  if(!confirm(`「${title||'이 책'}」 반납할까요?\n반납하면 더 이상 읽을 수 없어요.`)) return;
  const r=await sbFn(SMEBK_FN,{action:'return',loanSrmb:loanSrmb,brcd:brcd||''});
  const d=await r.json();
  if(d&&d.ok){
    // 북스타 서재의 그 책도 '반납함'으로 맞춰 둔다(같은 책이 두 곳에서 다르게 보이지 않게)
    try{ const a=shelfLoad(); const it=a.find(x=>x.key==='sm-'+brcd); if(it){ it.returned=true; it.returnedTs=Date.now(); shelfSave(a); } }catch(e){}
    readerToast('반납했어요');
  }else readerToast((d&&d.message)||'반납하지 못했어요');
  renderMyLibStatus();
}
async function smRenew(acc){
  if(!acc) return;
  const d=await smMy('renew',{accession_no:acc});
  // 연장 실패 사유(연체·한도초과 등)는 도서관 문구를 그대로 보여준다 — 우리가 지어내지 않는다
  readerToast(d&&d.ok ? '연장했어요' : (((d||{}).data||{}).message||'연장할 수 없어요'));
  renderMyLibStatus();
}
async function smDropReserve(mainNo){
  if(!mainNo||!confirm('예약을 취소할까요?')) return;
  const d=await smMy('cancelReserve',{main_no:mainNo});
  _myWaitCache=null;
  // 실패 사유는 도서관 문구를 그대로 — "취소하지 못했어요"만으론 학생이 다음 행동을 모른다
  readerToast(d&&d.ok?'예약을 취소했어요':((((d||{}).data||{}).message)||'취소하지 못했어요'));
  renderMyLibStatus();
}
async function smDropPickup(reqNo){
  if(!reqNo||!confirm('찾아줘북즈 신청을 취소할까요?')) return;
  const d=await smMy('cancelPickup',{request_no:reqNo});
  _myWaitCache=null;
  readerToast(d&&d.ok?'신청을 취소했어요':((((d||{}).data||{}).message)||'취소하지 못했어요 — 도서관이 처리 중이면 2층 안내데스크에 말씀해 주세요'));
  renderMyLibStatus();
}
async function smEbookBorrowOpen(brcd, w, book){
  try{
    const r=await sbFn(SMEBK_FN,{action:'borrow',brcd:brcd},{dev:true});
    const d=await r.json();
    // 연동 만료(토큰 7일) — 누를 땐 연동 상태였는데 서버에서 세션이 안 만들어진 경우.
    // 공유계정으로 대신 빌려주지 않으므로 여기서 안내로 돌린다.
    if(d&&d.needsPersonal){
      try{ localStorage.setItem(SSO_PERSONAL_KEY,'0'); }catch(e){}
      try{ w.close(); }catch(e){}
      smLoginGuide('read'); return;
    }
    bxEvent('link',{sub:'ebook_borrow', book:book, item_type:'ebook', item_key:brcd, ok:!!(d&&d.ok&&d.viewerUrl), meta:{ents:(d&&d.entsDvsnCode)||'', msg:(d&&!d.ok)?String(d.message||d.error||'').slice(0,120):''}});   // 측정: 이용(전자책 연결=대출)
    if(d&&d.ok&&d.viewerUrl){
      if(book){ try{ shelfAdd(book); }catch(e){} }   // 대출 성공 확정 후에만 '읽는 중' 기록
      // 반납용 loanSrmb를 내 서재 항목에 저장(대출 기간 측정·반납 버튼에서 사용)
      try{ const a=shelfLoad(); const it=a.find(x=>x.key==='sm-'+brcd); if(it){ it.loanSrmb=d.loanSrmb||''; it.ents=d.entsDvsnCode||''; it.dueDate=d.dueDate||''; it.ts=Date.now(); it.returned=false; shelfSave(a); } }catch(e){}
      try{ w.location.href=d.viewerUrl; }catch(e){ window.open(d.viewerUrl,'_blank'); }
    }
    else{ const msg=(d&&(d.message||d.error))||'지금은 대출할 수 없어요(동시이용 한도일 수 있어요)';
      // 남이 빌려간 경우엔 "다시 시도"가 아니라 예약이 정답 — 안내를 예약으로 잇는다
      const othersHave=/먼저|대출\s*중/.test(msg);
      const hint=othersHave?'창을 닫은 뒤, 책 화면의 <b>예약하기</b>를 눌러 두면 반납되는 대로 알려드려요.':'창을 닫고 다시 시도해 주세요.';
      try{ w.document.body.innerHTML='<div style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#334"><p style="font-size:15px">'+msg+'</p><p style="font-size:13px;color:#889;margin-top:10px">'+hint+'</p></div>'; }catch(e){ alert(msg); }
      // 재고를 다시 읽어 모달의 '바로 읽기' 줄을 예약 클릭으로 전환(재고 로드 전에 눌렀던 레이스 대비)
      try{ if(document.getElementById('ebStockTag')) loadEbookStock(brcd); }catch(e){} }
  }catch(e){ try{ w.document.body.innerHTML='<p style="font-family:sans-serif;padding:48px;text-align:center">대출 중 오류가 발생했어요. 다시 시도해 주세요.</p>'; }catch(_){ } }
}
// 별이(플로팅 챗봇) 추천 책 → 도서관 연결: 제목이 세명대 소장 전자책과 같으면 '바로 읽기', 아니면 통합검색. 둘 다 북스타 브리지 경유.
function libBridgeOpen(book){
  if(!book) return;
  const norm=t=>cleanT(t||'').replace(/\s+/g,'');
  // 1순위: 추천 매칭으로 이미 확보한 세명대 전자책 딥링크(_smLib) → 바로 읽기
  let b;
  if(book._smLib||book.lib){ b={t:book.title||book.t||'', cover:book.cover||'', a:book.author||book.a||'', lib:book._smLib||book.lib}; }
  else{
    const pool=(typeof SEMYUNG_BEST!=='undefined'?SEMYUNG_BEST:[]);
    const hit=pool.find(x=>norm(x.t)===norm(book.title||book.t));
    b=hit||{t:book.title||book.t||'', cover:book.cover||'', a:book.author||book.a||'', lib:null};
  }
  const dest=b.lib||semyungLink(cleanT(b.t||''));
  bxEvent('link',{sub:(b.lib?'ext_open':'opac_open'), book:Object.assign({},b,{isbn:book.isbn||''}), item_type:(b.lib?'ebook':'external'), origin:'search', origin_id:'byeoli'});   // 측정: 별이 추천→도서관
  if(b.lib) shelfAdd(b);   // 소장 전자책 열람만 '읽는 중' 기록 (lib 확보 = _smLib 딥링크 or 풀 매칭)
  const w=window.open('','_blank');
  if(!w){ window.open(dest,'_blank','noopener'); return; }
  try{ w.document.write(bridgeHTML(b)); w.document.close(); }catch(e){}
  setTimeout(()=>{ try{ w.location.href=dest; }catch(e){} }, 1600);
}
/* Ver03 고정 좌측 메뉴 — 마이 챌린지 / 검색 / 피드 / 내서재 (8/29 별 포인트 폐지로 리더보드 삭제) */
const SIDE_MENU = [
  // 8/21 사장님 요청: '내 도서관' 메뉴는 내서재(내 대출·예약 그룹)로 합쳐짐 — 연체·예약도착 배지는 내서재에 표시
  {key:'mychal', icon:'target',   label:'마이 챌린지', page:'mychal'},
  {key:'search', icon:'search',   label:'검색',        page:'search'},
  {key:'feed',   icon:'users',    label:'피드',        page:'feed'},
  {key:'shelf',  icon:'bookOpen', label:'내서재',      page:'mypage'},
];
// 사이드바 배지 — 연체(빨강) > 예약도착(초록) 순. 들어가 보지 않아도 알게 하는 최소 알림.
let MYLIB_BADGE=null;
function renderSideNav(activePage){
  // 헤더 칩도 같은 배지를 쓴다 — 여기서 같이 갱신해야 사이드바와 헤더가 어긋나지 않는다
  try{ bxRenderAccountChip(); }catch(e){}
  const el = document.getElementById('sideNav');
  if(!el) return;
  // 8/14 사장님 지시: 로그인 전에는 좌측 메뉴 전체 숨김(검색 포함) — 개인 기능뿐이라 빈 화면만 보인다
  if(!bxStudent()){ el.innerHTML=''; el.style.display='none'; return; }
  el.style.display='';
  el.innerHTML = SIDE_MENU.filter(n=>!n.needsLib||ssoIsPersonal()).map(n=>{
    const on = (activePage===n.page) ? ' active' : '';
    const badge=(n.key==='shelf'&&MYLIB_BADGE)
      ? `<span class="side-badge" style="background:${MYLIB_BADGE.color}" title="${esc(MYLIB_BADGE.title)}"></span>` : '';
    return `<div class="side-node${on}" data-key="${n.key}" onclick="onSideMenu('${n.key}')">
      ${ic(n.icon)}${badge}
      <div class="side-node-label">${esc(typeof uiT==='function'?uiT(n.label):n.label)}</div>
    </div>`;
  }).join('');
}

function onSideMenu(key){
  const item = SIDE_MENU.find(n=>n.key===key);
  if(item) nav(item.page);
}

/* 좌측 네비 — 첫 등장 연출(화면 중앙 → 좌측 제자리로 도킹). 최초 1회만. PC 전용 */
let _sideNavEntered = false, _sideNavEntering = false;
function playSideNavEntrance(){
  if(_sideNavEntered) return;
  const el = document.getElementById('sideNav');
  if(!el) return;
  if(!window.matchMedia('(min-width:901px)').matches){ _sideNavEntered = true; return; }
  requestAnimationFrame(()=>{
    const rect = el.getBoundingClientRect();
    if(!rect.width) return;                       // 아직 표시 전 → 다음 진입에서 재시도
    _sideNavEntered = true; _sideNavEntering = true;
    const cx = (window.innerWidth  - rect.width )/2 - rect.left;   // 화면 가로 중앙까지
    const cy = (window.innerHeight - rect.height)/2 - rect.top;    // 화면 세로 중앙까지
    el.style.transition = 'none';
    el.style.transform  = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(1.08)`;
    el.style.opacity    = '0';
    void el.offsetWidth;                          // reflow 강제
    el.style.transition = 'transform .9s cubic-bezier(.22,.9,.25,1), opacity .55s ease';
    requestAnimationFrame(()=>{
      el.style.transform = 'translate(0,0) scale(1)';
      el.style.opacity   = '1';
    });
    setTimeout(()=>{ el.style.transition=''; el.style.transform=''; el.style.opacity=''; _sideNavEntering=false; }, 1000);
  });
}

/* 좌측 네비 — 스크롤 시 부드럽게 따라오는 드리프트(고정 유지 + 살짝 흘렀다가 안착)
   ⚠️ 이 앱은 window가 아니라 .main 박스가 스크롤됨(html,body overflow:hidden) */
(function initSideNavFloat(){
  const isPC = () => window.matchMedia('(min-width:901px)').matches;
  let scroller = null, lastY = 0, offset = 0, target = 0, raf = null;
  function frame(){
    offset += (target - offset) * 0.14;   // 현재 위치를 목표로 부드럽게 이동
    target  *= 0.80;                        // 목표는 0(제자리)으로 서서히 복귀
    const el = document.getElementById('sideNav');
    if(el){
      if(Math.abs(offset) > 0.08 || Math.abs(target) > 0.08){
        el.style.transform = `translateY(${offset.toFixed(2)}px)`;
        raf = requestAnimationFrame(frame);
      } else {
        el.style.transform = ''; offset = 0; target = 0; raf = null;
      }
    } else { raf = null; }
  }
  function onScroll(){
    const el = document.getElementById('sideNav');
    if(_sideNavEntering){ lastY = scroller ? scroller.scrollTop : 0; return; } // 등장 연출 중엔 양보
    if(!isPC()){ if(el) el.style.transform = ''; lastY = scroller ? scroller.scrollTop : 0; return; }
    const y = scroller ? scroller.scrollTop : 0;
    const dy = y - lastY; lastY = y;
    target += dy * 0.28;                     // 스크롤 방향으로 끌림
    target = Math.max(-28, Math.min(28, target)); // 최대 드리프트 폭 제한
    if(!raf) raf = requestAnimationFrame(frame);
  }
  function bind(){
    const m = document.querySelector('.main');
    if(m && m !== scroller){ scroller = m; lastY = m.scrollTop; m.addEventListener('scroll', onScroll, {passive:true}); }
  }
  if(document.readyState !== 'loading') bind();
  document.addEventListener('DOMContentLoaded', bind);
})();
/* 8/17 사장님 수정요청: 폰에서 스크롤 내리면 헤더 숨김·올리면 표시 (교보 전자책 모바일 방식). CSS body.hdr-hide */
(function(){
  let lastY=0, acc=0, bound=null;
  function onScroll(){
    if(window.innerWidth>900){ document.body.classList.remove('hdr-hide'); return; }
    const y=bound.scrollTop, dy=y-lastY; lastY=y;
    if(!dy) return;
    acc = (acc>0)===(dy>0) ? acc+dy : dy;
    if(dy<0 && (acc<=-24 || y<=0)) document.body.classList.remove('hdr-hide');
    else if(dy>0 && acc>=24 && y>60) document.body.classList.add('hdr-hide');
  }
  function bind(){
    const m=document.querySelector('.main');
    if(m && m!==bound){ bound=m; lastY=m.scrollTop; m.addEventListener('scroll', onScroll, {passive:true}); }
  }
  if(document.readyState!=='loading') bind();
  document.addEventListener('DOMContentLoaded', bind);
  window.addEventListener('resize', ()=>{ if(window.innerWidth>900) document.body.classList.remove('hdr-hide'); });
})();
/* 8/29 사장님 지적: 폰에서 메뉴 탭 4개가 본문 글 위에 '떠 있는 것처럼' 보였다.
   헤더 높이가 98px로 못박혀 있어서, 계정 이름이 길거나 글자를 키운 폰에서 헤더가 한 줄 더
   늘어나면 그 줄이 헤더 밖으로 삐져나왔던 것. 실제로 그려진 높이를 재서 본문 시작 위치에 알려준다.
   (CSS만으로는 '지금 몇 줄인지'를 알 수 없어 이 한 조각이 필요하다) */
(function(){
  const root=document.documentElement;
  function sync(){
    const h=document.querySelector('.header');
    if(!h) return;
    if(window.innerWidth>900){ root.style.removeProperty('--header-real'); return; }
    root.style.setProperty('--header-real', Math.round(h.getBoundingClientRect().height)+'px');
  }
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', ()=>setTimeout(sync,120));
  document.addEventListener('DOMContentLoaded', sync);
  if(document.readyState!=='loading') sync();
  // 로그인·언어 전환으로 계정 칩 글자가 바뀌면 높이도 달라질 수 있어 헤더 변화를 지켜본다
  try{
    const h=document.querySelector('.header');
    if(h && window.ResizeObserver) new ResizeObserver(sync).observe(h);
  }catch(e){}
})();

