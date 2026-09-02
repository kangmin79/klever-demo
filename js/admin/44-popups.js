/* ====== 팝업 관리 (minsong_popups — 학생 앱·웹이 같은 테이블을 읽는다) ====== */
const PP_TGT={all:'전체',login:'로그인 학생',overdue:'연체 학생',charm0:'인증 시작 전'};
const PP_CH={both:'앱+웹',app:'앱만',web:'웹만'};
let POPUPS=[];
async function loadPopups(){
  try{
    const r=await fetch(`${SB_REST}/minsong_popups?select=*&order=created_at.desc`,
      {headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    POPUPS=r.ok?await r.json():[];
  }catch(e){POPUPS=[];}
  renderPopups();
}
function renderPopups(){
  const btn='padding:6px 10px;font-size:12px;border-radius:8px';
  el('ppList').innerHTML=POPUPS.length?POPUPS.map(p=>`<tr style="${p.active?'':'opacity:.45'}">
    <td style="font-weight:600">${esc(p.title)}</td>
    <td>${PP_TGT[p.target]||esc(p.target)}</td><td>${PP_CH[p.channel]||esc(p.channel)}</td>
    <td>${(!p.starts_at&&!p.ends_at)?'계속':esc(fmtD(p.starts_at)+' ~ '+fmtD(p.ends_at))}</td>
    <td class="num"><button class="btn-ghost" style="${btn}" onclick="togglePopup('${esc(String(p.id))}',${!p.active})">${p.active?((p.ends_at&&fmtD(p.ends_at)<ymd(new Date()))?'기간 지남 · 끄기':'켜짐 · 끄기'):'꺼짐 · 켜기'}</button></td>
    <td class="num"><button class="btn-ghost" style="${btn}" onclick="delPopup('${esc(String(p.id))}')">삭제</button></td></tr>`).join('')
  :'<tr><td colspan="6" style="color:var(--light)">아직 띄운 팝업이 없어요</td></tr>';
}
async function savePopup(){
  const title=el('ppTitle').value.trim();
  if(!title){toast('제목을 적어 주세요');return;}
  const from=el('ppFrom').value||null, to=el('ppTo').value||null, target=el('ppTarget').value, channel=el('ppChannel').value;
  if(from&&to&&from>to){toast('종료일이 시작일보다 앞서 있어요');return;}   // 8/29 리뷰 P3
  if((target==='overdue'||target==='charm0')&&channel==='web'){toast('연체·독서인증 대상은 앱에서만 판별돼요 — 채널을 앱 또는 앱+웹으로 골라 주세요');return;}   // 8/29 리뷰 P6: 아무도 못 보는 조합
  const row={title,body:el('ppBody').value.trim(),target,channel,starts_at:from,ends_at:to,active:true};   // 8/29 리뷰 P2: 켜짐 값을 명시(학생 앱은 active=true만 띄운다)
  try{
    const r=await adminSave({op:'popups_insert',row});
    if(!r.ok)throw new Error(r.status===401?'로그인이 만료됐어요 — 새로고침 후 다시 로그인해주세요':'저장 실패 ('+r.status+')');
    el('ppTitle').value='';el('ppBody').value='';el('ppFrom').value='';el('ppTo').value='';
    toast('팝업을 띄웠어요');loadPopups();
  }catch(e){toast(String(e&&e.message||'저장하지 못했어요 — 잠시 후 다시'));}
}
// 8/29 리뷰 P1: 켜기/끄기·삭제 실패가 완전히 무음이었다(만료된 로그인 포함) → 결과를 확인하고 알린다
async function togglePopup(id,on){
  try{
    const r=await adminSave({op:'popups_patch',id,patch:{active:on}});
    if(!r.ok) throw new Error(r.status===401?'로그인이 만료됐어요 — 새로고침 후 다시 로그인해주세요':'처리 실패 ('+r.status+')');
    toast(on?'켰어요':'껐어요');
  }catch(e){ toast(String(e&&e.message||'처리하지 못했어요 — 잠시 후 다시')); }
  loadPopups();
}
async function delPopup(id){
  if(!confirm('이 팝업을 삭제할까요?'))return;
  try{
    const r=await adminSave({op:'popups_delete',id});
    if(!r.ok) throw new Error(r.status===401?'로그인이 만료됐어요 — 새로고침 후 다시 로그인해주세요':'삭제 실패 ('+r.status+')');
    toast('삭제했어요');
  }catch(e){ toast(String(e&&e.message||'삭제하지 못했어요 — 잠시 후 다시')); }
  loadPopups();
}

