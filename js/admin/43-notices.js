/* ====== 공지글 ====== */
let ntLocSel=[];
// 발행 설정 패널 열고/닫기 (네이버식) — 제목·내용은 먼저 채워야 열림
function openNtPublish(){
  if(!el('ntTitle').value.trim()){toast('제목을 입력해주세요');el('ntTitle').focus();return;}
  if(rtEmpty('ntBodyRich')){toast('내용을 입력해주세요');return;}
  buildNtLoc(); el('ntPubOv').classList.add('on');
}
function closeNtPublish(){el('ntPubOv').classList.remove('on');}
// 게시 기간 = 시작·종료 날짜선택 → "YYYY.M.D ~ YYYY.M.D" 문자열
function ntPeriodStr(){
  const fmt=s=>{if(!s)return '';const p=s.split('-');return p[0]+'.'+(+p[1])+'.'+(+p[2]);};
  const f=fmt(el('ntFrom').value), t=fmt(el('ntTo').value);
  if(f&&t)return f+' ~ '+t; return f||t||'';
}
// 칸 제목(사서 자유입력)을 onclick JS 문자열에 직접 넣지 않음 — 따옴표/< 포함 제목에 칩이 죽던 버그 → 인덱스 방식
function buildNtLoc(){el('ntLoc').innerHTML=LOCATIONS.map((l,i)=>`<span class="locchip ${ntLocSel.includes(l)?'on':''}" onclick="toggleNtLocIdx(${i})">${esc(l)}</span>`).join('');}
function toggleNtLocIdx(i){toggleNtLoc(LOCATIONS[i]);}
function toggleNtLoc(l){const i=ntLocSel.indexOf(l);if(i<0)ntLocSel.push(l);else ntLocSel.splice(i,1);buildNtLoc();}
async function loadNotices(){
  try{
    const r=await fetch(`${SB_REST}/library_notices?select=*&order=created_at.desc`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    if(!r.ok)return; const rows=await r.json(); if(!Array.isArray(rows))return;
    NOTICES=rows.map(x=>({id:x.id,title:x.title,target:x.target||'전교생',period:x.period||'',loc:(x.location||'').split(',').filter(Boolean),body:x.body||'',at:(x.created_at||'').slice(0,10)}));
    if(el('pg-notice').style.display!=='none')renderNotices();
  }catch(e){}
}
async function publishNotice(){
  const title=el('ntTitle').value.trim(),body=rtGet('ntBodyRich');
  if(!title){toast('공지 제목을 입력해주세요');return;}
  if(rtEmpty('ntBodyRich')){toast('공지 내용을 입력해주세요');return;}
  const row={school:'한국대학교',title,target:el('ntTarget').value.trim()||'전교생',period:ntPeriodStr(),location:ntLocSel.join(','),body};
  try{
    const r=await adminSave({op:'notices_insert',row});
    if(!r.ok){toast('발행 실패 ('+r.status+')');return;}
  }catch(e){toast('발행 실패 — 연결 확인');return;}
  closeNtPublish();
  el('ntTitle').value='';rtSet('ntBodyRich','');el('ntFrom').value='';el('ntTo').value='';ntLocSel=[];buildNtLoc();
  await loadNotices();
  toast('공지가 발행됐어요 — 학생 앱에 노출됩니다');
}
function renderNotices(){
  el('noticeList').innerHTML=NOTICES.map(n=>`<div class="notice-i"><div class="nx">
    <h4>${esc(n.title)}</h4><div class="nm">${esc(n.target)} · ${esc(n.period||'')} · ${esc(n.at)}</div>
    <div class="rt-view">${sanitizeHtml(n.body)}</div></div>${n.loc&&n.loc.length?`<span class="nloc">${esc(n.loc.join(' · '))}</span>`:''}</div>`).join('')
    ||'<div class="pv-empty">게시된 공지가 없어요.</div>';
}

