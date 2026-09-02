// ===== 챌린지 미션 (8/29 별 포인트 폐지 — 배점 없음·시상은 추첨형만) =====
const CH_MISSIONS=[
  {k:'quiz',t:'퀴즈 풀기',s:'책마다 퀴즈 10문항'},
  {k:'oneline',t:'한 줄 소감',s:'짧은 감상 한 줄'},
  {k:'question',t:'한 줄 질문',s:'책에 대한 질문 던지기'},
  {k:'review',t:'서평 쓰기',s:'300자 이상으로 책에 대한 평을 작성'},
  {k:'essay',t:'독후감 쓰기',s:'800자 이상으로 읽고 난 내 생각을 작성'},   // 8/21 사장님 요청: 독후감 미션 추가
];
const _CH_MISS_KEYS=CH_MISSIONS.map(x=>x.k);
function chalMissClean(m,type){   // DB 미션에서 폐지된 키 제거(underline/recommend/cert) — 5종 + autoJoin 유지
  m=m||{};
  const o={reward:'draw', quizN:10, autoJoin:!!m.autoJoin, drawCount:m.drawCount||10, drawCond:m.drawCond||'all'};   /* 퀴즈 문항 수 = 10개 고정. 8/29: 시상은 추첨형만. 리뷰 F4: 추첨 인원·조건을 여기서 버려 저장 때마다 10명/전체완료로 되돌아가던 것 */
  if(m.quizType)o.quizType=m.quizType; if(m.quizLevel)o.quizLevel=m.quizLevel;
  _CH_MISS_KEYS.forEach(k=>{ o[k]=(m[k]!==undefined)?!!m[k]:(k==='quiz'?(type==='고전챌린지'):false); });
  return o;
}
/* Ver10 2종 체제(2026-07-04): ①작품 이해 ②인문 성찰, 난이도 없음. 옛 5종 값은 발행된 챌린지에만 잔존(수정 시 보존) */
const CH_MAX=3, CH_QTYPES=['작품 이해','인문 성찰'];
function chalMission(c){   // 미션객체 정규화(구버전 review→oneline / question→question 호환)
  const m=c.mission||{};
  const o={reward:'draw',   // 8/29 별 포인트 폐지: 순위형 없음
    quiz:c.type==='고전챌린지'?true:!!m.quiz, quizN:10,   /* 퀴즈 문항 수 = 10개 고정 */
    quizType:m.quizType||'', quizLevel:m.quizLevel||'',
    drawCount:m.drawCount||10, drawCond:m.drawCond||'all',
    autoJoin:!!m.autoJoin};   // 8/21: 신청 없이 자동 참여(학생 앱에 '참여하기' 버튼 없음 → '자동 참여')
  CH_MISSIONS.forEach(x=>{ if(x.k==='quiz')return;
    o[x.k]=(m[x.k]!==undefined)?!!m[x.k]:(x.k==='oneline'?!!m.review:(x.k==='question'?!!m.question:false)); });
  c.mission=o; return o;
}
function chalMissCount(c){ const m=c.mission; return CH_MISSIONS.filter(x=>m[x.k]).length; }
function readChalInputs(){
  CHALLENGES.forEach((c,i)=>{
    const t=el('ch_t_'+i),d=el('ch_d_'+i),f=el('ch_f_'+i),to=el('ch_to_'+i),ty=el('ch_type_'+i);
    if(t)c.title=t.value.trim()||c.title; if(d)c.detail=d.value; if(f)c.from=f.value; if(to)c.to=to.value;
    if(ty)c.type=ty.value;
    const st=el('ch_style_'+i); if(st)c.style=st.value||'row';
    chalMission(c);
    const qt=el('ch_qt_'+i),ql=el('ch_ql_'+i),dc=el('ch_dc_'+i),dcd=el('ch_dcd_'+i);
    if(qt)c.mission.quizType=qt.value; if(ql)c.mission.quizLevel=ql.value;
    if(dc)c.mission.drawCount=+dc.value||10; if(dcd)c.mission.drawCond=dcd.value;
    if(!Array.isArray(c.books))c.books=[];
  });
}
function renderChallenges(){
  try{ renderChalNotices(); }catch(e){}   // 8/29: 챌린지 목록 위 안내 카드도 같이 그린다
  el('chalList').innerHTML=(CHAL_LOAD_FAILED?`<div class="load-fail">챌린지를 서버에서 불러오지 못했어요. <span>지금 보이는 목록은 진짜가 아닐 수 있어 저장이 막혀 있습니다 — 페이지를 새로고침한 뒤 다시 시도해 주세요.</span></div>`:'')
  +(function(){ const _comb=_chalCombined(); const cards=CHALLENGES.map((c,i)=>{   // 8/29: 안내 카드와 섞인 화면 순서대로 그린다(오른쪽 미리보기·학생 앱과 동일)
    chalMission(c);
    const _pos=_comb.indexOf(c);
    const m=c.mission, isClassic=c.type==='고전챌린지', books=c.books||[], cnt=chalMissCount(c);
    const missCells=CH_MISSIONS.map(x=>{
      if(x.k==='quiz'&&!isClassic)return '';
      if(x.soon) return `<div class="mrow" style="opacity:.5"><div class="mt"><b>${x.t}</b><span>${x.s} · 준비 중</span></div>
        <div class="tg lock" title="준비 중인 미션이에요"></div></div>`;
      const on=!!m[x.k], lock=(x.k==='quiz'&&isClassic);
      return `<div class="mrow"><div class="mt"><b>${x.t}</b><span>${x.s}${lock?' · 필수':''}</span></div>
        <div class="tg${on?' on':''}${lock?' lock':''}" onclick="chalToggleM(${i},'${x.k}')"></div></div>`;
    }).join('');
    const quizCfg=(isClassic&&m.quiz)?`<div style="margin:6px 0 2px">
      <div class="row2">
        <div><div class="flabel" style="font-weight:500">퀴즈 유형</div><select class="cur-inp" id="ch_qt_${i}" onchange="readChalInputs();renderChallenges()"><option value="">선택</option>${CH_QTYPES.map(t=>`<option ${m.quizType===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div><div class="flabel" style="font-weight:500">권당 문항 수</div><div class="qn" style="margin-top:2px"><span class="on">10문제 고정</span></div></div>
      </div></div>`:'';
    return `<div class="panel chal-panel${_chalPvFocus===i?' pv-focus':''}" style="margin-bottom:12px" data-ci="${i}" onclick="chalPvFocus(${i})">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <span style="font-size:11px;font-weight:800;color:var(--light)">챌린지 ${i+1}</span>
        <button class="btn-ghost" style="padding:5px 10px;${c.featured?'background:#fff7e6;border-color:#f0c674;color:#b8860b;font-weight:800':''}" onclick="chalSetFeatured(${i})" title="학생 앱 '독서 챌린지' 상단 '이달의 챌린지'로 크게 노출됩니다 (하나만 지정)">${c.featured?'⭐ 이달의 챌린지':'☆ 이달의로 지정'}</button>
        <span style="flex:1"></span>
        <button class="btn-ghost" style="padding:5px 10px" onclick="chalCombMove('c:${i}',-1)" ${_pos<=0?'disabled':''}>↑</button>
        <button class="btn-ghost" style="padding:5px 10px" onclick="chalCombMove('c:${i}',1)" ${_pos>=_comb.length-1?'disabled':''}>↓</button>
        <button class="btn-ghost" style="padding:5px 10px;color:var(--bad);border-color:#e7c9c4" onclick="chalDel(${i})">삭제</button>
      </div>
      <div class="row2">
        <div><div class="flabel">제목</div><input class="cur-inp" id="ch_t_${i}" value="${esc(c.title)}" oninput="chalPvSync()"></div>
        <div><div class="flabel">종류</div><select class="cur-inp" id="ch_type_${i}" onchange="readChalInputs();renderChallenges()">
          <option value="소장챌린지" ${!isClassic?'selected':''}>소장자료 챌린지</option>
          <option value="고전챌린지" ${isClassic?'selected':''}>고전 컬렉션 챌린지</option></select></div>
      </div>
      ${/* 8/30: 챌린지도 스타일 선택 가능. 8/31 사장님 지적 — 미션·퀴즈 아래에 묻혀 있어 없는 줄 알았다.
            우리 도서관 칸과 같은 자리(제목 바로 아래)로 올려 두 화면의 순서를 맞춘다. */''}
      <div class="flabel" style="margin-top:11px">스타일 (학생 앱에서 담긴 책이 어떻게 보일지)</div>
      <input type="hidden" id="ch_style_${i}" value="${esc(c.style||'row')}">
      <div class="style-bar" onclick="toggleStyleGrid(event,'chal${i}')">
        <span class="style-cur"><span class="sb-th">${styleThumb(c.style||'row')}</span><b id="style_lbl_chal${i}">${esc(styleLabel(c.style||'row'))}</b></span>
        <span class="style-toggle" id="styletoggle_chal${i}">바꾸기 ▾</span>
      </div>
      <div class="style-pick" id="stylegrid_chal${i}" style="display:none">${CHAL_STYLES.map(o=>`<div class="sp-card${(c.style||'row')===o[0]?' on':''}" onclick="setChalStyle(${i},'${o[0]}')" title="${esc(STYLE_DESC[o[0]]||'')}"><div class="sp-th">${styleThumb(o[0])}</div><div class="sp-nm">${esc(o[1])}</div></div>`).join('')}</div>
      <div class="flabel" style="margin-top:11px">상세내용 — 학생에게 보일 설명</div>
      <textarea class="cur-inp" id="ch_d_${i}" rows="2" placeholder="${isClassic?'예: 6월 한 달, 고전을 읽고 퀴즈에 도전하세요':'예: 6월 한 달, 추천도서를 읽고 한 줄 소감을 남겨 보세요'}" oninput="chalPvSync()">${esc(c.detail||'')}</textarea>
      <div class="row2"><div><div class="flabel">시작일</div><input type="date" class="cur-inp" id="ch_f_${i}" value="${esc(c.from||'')}" onchange="chalPvSync()"></div>
        <div><div class="flabel">종료일</div><input type="date" class="cur-inp" id="ch_to_${i}" value="${esc(c.to||'')}" onchange="chalPvSync()"></div></div>
      <div class="flabel">미션 <span style="font-weight:400;color:var(--light)">· 원하는 만큼 선택</span></div>
      <div class="mission">
        <div class="mrow" style="background:#eef4fb;border-color:#cfe0f5"><div class="mt"><b>신청 없이 자동으로 참여시키기</b><span>켜면 학생 앱에 ‘참여하기’ 버튼 대신 ‘자동 참여’로 표시되고, 모든 학생이 바로 참여 상태가 돼요</span></div>
          <div class="tg${m.autoJoin?' on':''}" onclick="chalToggleAuto(${i})"></div></div>
        ${missCells}</div>
      ${quizCfg}
      <!-- 8/21 사장님 요청: 보상 방식·별 적립 블록 삭제(엑셀로 확인). 8/29 되살렸다가 다시 뺌 — 화면 변경은 사장님 승인 후. 추첨 인원·조건 값은 chalMissClean에서 보존만 -->
      <div class="flabel" style="margin-top:10px">담긴 책 ${books.length}권</div>
      <div class="deco-books">${books.map((b,bi)=>{const _cv=b.cover||(b.id&&CLS_COVER[b.id])||'';return `<div class="deco-bk" title="${esc(b.title||'')}"><div class="c">${_cv?`<img src="${esc(_cv)}" onerror="this.parentNode.textContent='📕'">`:'📕'}</div><button class="rm" onclick="chalRemoveBook(${i},${bi})">×</button></div>`;}).join('')}
        <span class="deco-add" onclick="secOpenPicker(${i},'chal')">+ 책 담기</span></div>
    </div>`;
  }); return _comb.map((it,pos)=>(it.style||'')==='notice'?ntCardHTML(it,pos,_comb.length):cards[CHALLENGES.indexOf(it)]).join(''); })()
  ;   // 9/1: 맨 아래 '+ 새 챌린지 추가' 버튼은 위 '직접 챌린지 만들기'로 옮겨 삭제
  // 8/14 사장님 수정요청: 독서 챌린지에도 AI 큐레이션 카드 — 이 페이지 상단 슬롯으로 이동
  const _slot=el('aicSlotChal');
  if(_slot){ aicMount(_slot); const c=el('aiCurCard'); if(c){ c.style.display=''; aicSetContext('chal'); aicLoadUsage(); } }
  chalPvSync();
}
/* ── 8/17 사장님 수정요청: 독서 챌린지 빌더 오른쪽 미리보기 = 학생 앱 '독서 챌린지' 탭(이달의 챌린지 히어로 + 진행 중인 챌린지 목록)
   학생 앱(루트 index.html)엔 챌린지 preview 모드가 없어(우리도서관은 ?preview=1 iframe+postMessage) 여기서 renderChalCards()·chalHero()의 구조를 그대로 인라인 렌더한다.
   학생 앱 규칙 미러: featured 하나만 히어로·히어로는 아래 목록에서 제외·기간(시작~종료) 안인 것만 노출·미션 표기 '퀴즈 10문항 · 한 줄 소감 …'·부제 'N권 · 미션 · 6/1 ~ 6/30 · D-12' ── */
let _chalPvTimer=null;
function chalPvOpen(){ const p=el('chalPv'); if(!p) return; p.classList.add('on'); document.body.classList.add('pv-open');
  const b=el('chalPvBtn'); if(b) b.textContent='👁 미리보기 닫기'; chalPvRender(); }
function chalPvClose(){ const p=el('chalPv'); if(!p) return; p.classList.remove('on'); document.body.classList.remove('pv-open');
  const b=el('chalPvBtn'); if(b) b.textContent='👁 미리보기'; }
function toggleChalPreview(){ const p=el('chalPv'); if(p&&p.classList.contains('on')) chalPvClose(); else chalPvOpen(); }
function chalPvAutoOpen(){ if(window.innerWidth>=1180){ const p=el('chalPv'); if(p&&!p.classList.contains('on')) chalPvOpen(); } }   // 우리도서관 autoOpenPreview 와 동일 기준
function chalPvSync(){ const p=el('chalPv'); if(!p||!p.classList.contains('on')) return; clearTimeout(_chalPvTimer); _chalPvTimer=setTimeout(chalPvRender,150); }
// ── 좌측에서 편집 중인 챌린지 → 우측 미리보기에 그 챌린지만 (우리 도서관 pvFocusSec 와 같은 방식, 8/31 사장님 요청) ──
// 자리(index)로 기억한다. 순서가 바뀌거나 추가·삭제되면 가리키는 대상이 달라지므로 그때는 전체로 되돌린다.
let _chalPvFocus=null;
function chalPvFocus(i){
  // 입력칸·버튼을 누른 것은 '카드를 골랐다'가 아니다 (우리 도서관과 같은 판단 — 제목에 커서만 놔도 좁아지던 문제 방지)
  try{ const t=window.event&&window.event.target; if(t&&/^(INPUT|TEXTAREA|SELECT|BUTTON|LABEL|OPTION)$/.test(t.tagName)) return; }catch(e){}
  if(_chalPvFocus!==i){
    _chalPvFocus=i;
    document.querySelectorAll('#chalList .chal-panel,.chal-panel').forEach(p=>p.classList.toggle('pv-focus',+p.getAttribute('data-ci')===i));
    updateChalPvCap();
  }
  chalPvRender();
}
function chalPvShowAll(){ _chalPvFocus=null; document.querySelectorAll('.chal-panel').forEach(p=>p.classList.remove('pv-focus')); updateChalPvCap(); chalPvRender(); }
function updateChalPvCap(){ const c=el('chalPvCap'); if(!c) return;
  const f=_chalPvFocus!=null?CHALLENGES[_chalPvFocus]:null;
  if(f) c.innerHTML=`<b style="color:var(--text)">${esc(f.title||'선택한 챌린지')}</b>만 보는 중 · <a onclick="chalPvShowAll()" style="cursor:pointer;color:var(--accent);font-weight:700;text-decoration:underline">전체 보기</a>`;
  else c.textContent='학생 앱 ‘독서 챌린지’ 탭 · 편집 즉시 반영 (저장 전 모습)';
  // 8/31: 미리보기가 학생 앱 그대로가 되면서 '기간 밖' 딱지를 화면 안에 못 그린다 → 캡션으로 알린다
  try{ const off=(f?[f]:CHALLENGES).filter(x=>!cpvLive(x));
    if(off.length) c.innerHTML+=`<div style="margin-top:5px;color:#b45309;font-weight:700">⚠ ${off.map(x=>esc(x.title||'제목 없음')+' — '+cpvOffWhy(x)).join('<br>')}</div>`;
  }catch(e){}
}
const cpvLive=c=>{ const t=ymd(new Date()); return (!c.from||c.from<=t)&&(!c.to||t<=c.to); };   // 학생 앱: 오늘이 기간 안인 것만 노출
const cpvOffWhy=c=>{ const t=ymd(new Date()); return c.from&&c.from>t?'학생에겐 '+esc(c.from)+'부터 보여요':'종료 — 학생에겐 안 보여요'; };
// 8/31: 미리보기를 학생 앱 화면 그대로 띄운다(우리 도서관과 같은 방식).
//   예전엔 여기서 관리자가 직접 흉내 내 그렸는데, 그 코드에 스타일 처리가 빠져 사서가 고른 스타일이 미리보기에만 반영되지 않았다.
//   이제 그리는 코드는 학생 앱 하나뿐 — 두 화면이 어긋날 수 없다.
let _chalPvReady=false;
function chalPvPayload(){
  readChalInputs();
  if(_chalPvFocus!=null && !CHALLENGES[_chalPvFocus]){ _chalPvFocus=null; }
  const focused=_chalPvFocus!=null?CHALLENGES[_chalPvFocus]:null;
  const list=focused?[focused]:CHALLENGES.slice();
  const challenges=list.map(c=>({id:c.id,type:c.type,title:c.title,intro:c.detail||'',from:c.from,to:c.to,
    featured:!!c.featured,style:c.style||'row',mission:chalMission(c),
    books:(c.books||[]).map(b=>Object.assign({},b))}));
  let notices=[];
  if(!focused){ try{ ntReadInputs();
    notices=SECTIONS.filter(s=>aOf(s)===CHAL_AREA&&(s.style||'')==='notice')
      .map(s=>({title:s.title||'',subtitle:s.subtitle||'',chal_pos:s.chal_pos})); }catch(e){} }
  return {type:'bookstar_preview_chal',challenges:challenges,notices:notices};
}
function chalPvPost(){
  const f=el('chalPvFrame'); if(!f||!f.contentWindow) return;
  try{ f.contentWindow.postMessage(chalPvPayload(),location.origin); }catch(e){}
}
function chalPvRender(){
  const f=el('chalPvFrame'); if(!f) return;
  updateChalPvCap();
  if(!_chalPvReady){   // 첫 열림 — 학생 앱을 미리보기 모드로 띄우고, 뜨는 즉시 편집 중 내용을 보낸다
    _chalPvReady=true;
    try{ localStorage.setItem('bookstar_preview_chals',JSON.stringify(chalPvPayload())); }catch(e){}
    f.onload=function(){ chalPvPost(); };
    f.src='/?preview=1&area='+encodeURIComponent('독서챌린지')+'&t='+Date.now();
    return;
  }
  chalPvPost();
}
// 8/29 리뷰 F11: 미션 0개로 만들면 저장이 거부되는데 그 말이 없었다 → 한 줄 소감을 기본으로 켜 둔다(끄면 됨)
function chalAdd(){readChalInputs();ntReadInputs();CHALLENGES.unshift({id:null,type:'소장챌린지',style:'row',title:'새 챌린지',detail:'',from:ymd(new Date()),to:ymd(new Date(Date.now()+30*86400000)),mission:{reward:'draw',quiz:false,quizN:10,oneline:true},books:[]});_chalPvFocus=0;updateChalPvCap();renderChallenges();}   // 새로 만든 챌린지로 시선이 가게(맨 앞에 들어간다)
function chalDel(i){readChalInputs();const c=CHALLENGES[i]; if(!c) return;
  if(!confirm(`‘${c.title||'제목 없음'}’ 챌린지를 지울까요? 저장하면 학생 앱에서도 사라지고 참여 기록도 이어지지 않아요.`)) return;   // 8/29 리뷰: 한 번 클릭에 통째 삭제 방지
  CHALLENGES.splice(i,1);_chalPvFocus=null;updateChalPvCap();renderChallenges();}
function chalSetFeatured(i){readChalInputs();const on=!CHALLENGES[i].featured;CHALLENGES.forEach(c=>c.featured=false);CHALLENGES[i].featured=on;renderChallenges();}   // 라디오식: 하나만 '이달의 챌린지'(다시 누르면 해제)
function chalToggleM(i,k){readChalInputs();const c=CHALLENGES[i];if(k==='quiz'&&c.type==='고전챌린지')return;
  const def=CH_MISSIONS.find(x=>x.k===k); if(def&&def.soon)return;   // 준비 중 미션은 켤 수 없음
  c.mission[k]=!c.mission[k];renderChallenges();}
function chalToggleAuto(i){readChalInputs();const c=CHALLENGES[i];c.mission.autoJoin=!c.mission.autoJoin;renderChallenges();}
function chalRemoveBook(i,bi){readChalInputs();CHALLENGES[i].books.splice(bi,1);renderChallenges();}
async function saveChallenges(){
  readChalInputs();
  if(CHAL_LOAD_FAILED){ toast('챌린지를 불러오지 못한 상태라 저장할 수 없어요 — 새로고침 후 다시 시도해 주세요'); return; }   // 8/29 리뷰 F6: 중복 발행 방지
  for(const c of CHALLENGES){
    if(!c.title||!c.title.trim()){toast('제목이 빈 챌린지가 있어요');return;}
    if(!c.books||!c.books.length){toast(`‘${c.title}’에 책을 1권 이상 담아주세요`);return;}
    if(chalMissCount(c)===0){toast(`‘${c.title}’의 미션을 1개 이상 선택해주세요`);return;}
    if(c.type==='고전챌린지'&&c.mission.quiz&&!c.mission.quizType){toast(`‘${c.title}’의 퀴즈 유형을 선택해주세요`);return;}
    if(c.from&&c.to&&c.from>c.to){toast(`‘${c.title}’의 종료일이 시작일보다 앞서 있어요`);return;}
    let miss; try{ miss=await fillHeld(c.books||[]); }catch(e){ toast('소장 여부를 확인하지 못했어요(연결 문제) — 잠시 후 다시 저장해 주세요'); return; }   // 8/29 리뷰 F7: 연결 실패를 "미소장"으로 안내하지 않음
    if(miss.length){toast(`‘${c.title}’에 세명대 미소장 책이 있어요: ${miss.slice(0,3).join(', ')}${miss.length>3?' 외 '+(miss.length-3)+'권':''} — 빼고 저장해 주세요`);return;}
  }
  try{
    if(CHALLENGES.length){
      // 8/22: 형태 필드(tags·_pp·lib·_sm)를 버리지 않는다 — 버리면 학생 앱이 소장 책을 외부책으로 그린다
      const keep=b=>{ const o={id:b.id||'',isbn:b.isbn||'',title:b.title,author:b.author||'',cover:b.cover||'',note:b.note||''}; for(const k of ['tags','_pp','lib','_sm','paperStatus','crema','cremaUrl']) if(b[k]!==undefined) o[k]=b[k]; return o; };
      // 8/29: sort_order(화면 순서) 저장 — 예전엔 없어서 "↕ 순서 바꾸기"로 정한 순서가 저장 후 보장되지 않았다
      //   (전부 지우고 한꺼번에 다시 넣는 방식이라 created_at이 전부 같음 → 정렬 동점 → 순서는 운)
      // 8/29 리뷰 F8: id를 실어 보내 기존 챌린지는 같은 id로 덮어쓴다(서버가 upsert). 예전엔 매번 새 id라 학생 참여·퀴즈 기록이 끊겼다
      const rows=CHALLENGES.map((c,i)=>({id:c.id||null,school:'한국대학교',type:c.type,title:c.title,intro:c.detail||'',location:'',featured:!!c.featured,sort_order:i,style:c.style||'row',
        status:calcStatus(c.from,c.to),start_date:c.from||null,end_date:c.to||null,mission:c.mission,
        books:(c.books||[]).map(keep)}));
      const r=await adminSave({op:'programs_insert',rows});
      if(!r.ok){toast(r.status===401?'로그인이 만료됐어요 — 새로고침 후 다시 로그인해주세요':'저장 실패 ('+r.status+')');return;}
    }
    // 화면에서 지운 챌린지만 서버에서 삭제(살아 있는 id는 위에서 덮어썼으므로 건드리지 않음)
    // 삭제 실패 감지: 실패하면 옛 행이 남아 학생 앱에 챌린지가 중복 노출되므로 반드시 알림 (재저장하면 스스로 회복)
    let chalDelFail=false;
    const _keepIds=new Set(CHALLENGES.map(c=>String(c.id||'')).filter(Boolean));
    const _delIds=ORIG_CHAL_IDS.filter(id=>!_keepIds.has(String(id)));
    if(_delIds.length){
      try{
        const dr=await adminSave({op:'programs_delete',ids:_delIds});
        if(!dr.ok) chalDelFail=true;
      }catch(_){ chalDelFail=true; }
    }
    // 8/29 리뷰 F2: 위쪽 큰 '저장 →'이 안내 카드는 안 저장하던 문제 — 안내 카드(library_sections 독서챌린지)도 같이 저장
    try{ const _ntDirty=SECTIONS.some(s=>aOf(s)===CHAL_AREA)||ORIG_SLOTS.some(sl=>!SECTIONS.some(s=>s.slot===sl));
      if(_ntDirty){ ntReadInputs(); await saveSections(); } }catch(_){}
    if(chalDelFail) toast('저장은 됐지만 이전 챌린지 정리가 실패했어요 — 중복으로 보이면 다시 저장해주세요');
    else toast('저장 완료 — 학생 앱에 반영됩니다');
    await loadChallenges(); loadServerPrograms();
  }catch(e){toast('저장 실패 — 연결 확인');}
}

