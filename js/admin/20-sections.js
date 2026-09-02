// 우리도서관 카테고리(app.html millieHTML와 동일) — 관리자가 추가·삭제·편집
// 9/1 사장님 요청: 화면에서 약속한 대로 안 나오는 스타일 5개를 골라 쓰는 목록에서 뺀다(우리도서관·독서챌린지·세계고전·한국고전 공통).
//   요약 카드(15분)·AI 카드 = 15분 요약, AI와 함께 읽기를 제공하지 않음 / 책 속 한 문장 = 문장이 아니라 제목이 나옴
//   스와이프 카드 = 넘겨지지 않음 / 테마 컬렉션 = 묶어만 주고 펼쳐지지 않음
//   ※ 지금 쓰는 칸·챌린지 중 이 5개를 쓰는 것은 없음(2026-09-01 실측) — 학생 화면이 바뀌는 칸은 없다.
const STYLES=[
  ['hero','히어로 (대표 1권)'],['row','가로 표지 목록'],['rank','랭킹 (대출 자동)'],
  ['grid','표지 그리드 (서가)'],['mag','매거진'],['banner','와이드 띠배너'],
  ['new','신간 입고'],
  ['notice','안내 카드 (글만)']   // 8/29 사장님 요청: 책 없이 공지·안내만 담는 칸
];
// 8/29: 책을 담지 않는 스타일 — 편집 화면에서 '담긴 책'을 숨기고 본문 칸을 보여준다
const NO_BOOK_STYLES=['notice'];
// 스타일별 한 줄 설명(툴팁)
const STYLE_DESC={hero:'대표 1권을 큰 카드로 강조',row:'표지를 가로로 죽 나열(가장 기본)',grad:'15분 요약 카드',ai:'AI 질문이 있는 다크 카드',grid:'표지를 격자(서가)처럼',mag:'잡지 스프레드형(큰 표지+소개)',banner:'와이드 띠배너 1권',new:'신간 NEW 표시 줄',quote:'책 속 문장 인용',swipe:'넘겨보는 스와이프 카드',coll:'테마별 표지 모음',notice:'책 없이 공지·안내 글만 (칸 사이에 끼워 넣기)'};
// 스타일별 미니 미리보기 그림(CSS 도형)
function styleThumb(st){
  switch(st){
    case 'hero': return `<span style="display:flex;align-items:center;gap:5px"><span style="width:24px;height:32px;border-radius:4px;background:linear-gradient(160deg,#aeb7e6,#7e8ad0);display:flex;align-items:flex-end;justify-content:center;color:#fff;font-size:7px;font-weight:800;padding-bottom:2px">대표</span><span style="width:30px"><i class="tln" style="width:90%"></i><i class="tln" style="width:60%"></i></span></span>`;
    case 'row': return `<span style="display:flex;gap:3px">${'<i class="tcv"></i>'.repeat(5)}</span>`;
    case 'grad': return `<span style="display:flex;align-items:center;justify-content:center;width:52px;height:30px;border-radius:6px;background:linear-gradient(160deg,#f0a07a,#e07a9a);color:#fff;font-size:9px;font-weight:800">15분</span>`;
    case 'ai': return `<span style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:52px;height:32px;border-radius:6px;background:linear-gradient(160deg,#3a2b6e,#23194a);color:#ffd86b;font-size:9px;font-weight:800">✦ AI<span style="width:32px;height:6px;border-radius:3px;background:#6a5cc0"></span></span>`;
    case 'grid': return `<span style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">${'<i class="tcv" style="width:7px;height:9px"></i>'.repeat(8)}</span>`;
    case 'mag': return `<span style="display:flex;align-items:center;gap:5px"><i class="tcv" style="width:20px;height:28px;border-radius:2px"></i><span style="width:30px"><i class="tln" style="width:100%"></i><i class="tln" style="width:80%"></i><i class="tln" style="width:55%"></i></span></span>`;
    case 'banner': return `<span style="display:flex;align-items:center;gap:4px;width:60px;height:22px;border-radius:5px;background:linear-gradient(90deg,#5b6bd6,#8a7be0);padding:0 4px"><i class="tcv" style="width:11px;height:16px;background:#fff"></i><span style="flex:1"><i class="tln" style="width:90%;background:rgba(255,255,255,.85)"></i><i class="tln" style="width:60%;background:rgba(255,255,255,.6)"></i></span></span>`;
    case 'new': return `<span style="display:flex;gap:3px;align-items:flex-start"><span style="position:relative"><i class="tcv"></i><b style="position:absolute;top:-3px;left:-2px;background:#e0466a;color:#fff;font-size:5px;padding:0 2px;border-radius:2px">N</b></span><i class="tcv"></i><i class="tcv"></i><i class="tcv"></i></span>`;
    case 'quote': return `<span style="display:flex;align-items:center;gap:4px"><b style="font-size:24px;color:#aeb7e6;line-height:.7;font-family:Georgia,serif">“</b><span style="width:36px"><i class="tln" style="width:100%"></i><i class="tln" style="width:85%"></i><i class="tln" style="width:50%"></i></span></span>`;
    case 'swipe': return `<span style="position:relative;width:40px;height:32px"><i class="tcv" style="position:absolute;left:8px;top:4px;width:20px;height:26px;transform:rotate(-8deg);background:#cdd4ee"></i><i class="tcv" style="position:absolute;left:13px;top:2px;width:20px;height:26px;transform:rotate(6deg);background:#aeb7e6"></i></span>`;
    case 'coll': return `<span style="display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:3px;border-radius:5px;background:#e7ebf6">${'<i class="tcv" style="width:11px;height:13px"></i>'.repeat(4)}</span>`;
    case 'notice': return `<span style="display:flex;gap:5px;align-items:center;width:60px;height:30px;border-radius:6px;border:1px solid #cfd8ee;border-left:3px solid #3a6ea5;background:#f7f9fd;padding:0 5px"><span style="font-size:11px">📢</span><span style="flex:1"><i class="tln" style="width:88%"></i><i class="tln" style="width:66%"></i><i class="tln" style="width:78%"></i></span></span>`;
    default: return `<span style="display:flex;gap:3px">${'<i class="tcv"></i>'.repeat(4)}</span>`;
  }
}
function setSecStyle(slot,val){const h=el('sec_style_'+slot);if(h)h.value=val;readSecInputs();renderSettings();}
// 8/30: 챌린지가 고를 수 있는 스타일 — 자동 집계(rank)·글 전용(안내 카드)·히어로(큐레이션 문맥 필요)는 뺀다
const CHAL_STYLES=STYLES.filter(o=>!['rank','hero'].includes(o[0])&&!NO_BOOK_STYLES.includes(o[0]));
function setChalStyle(i,val){ const h=el('ch_style_'+i); if(h)h.value=val; readChalInputs(); renderChallenges(); try{ chalPvSync(); }catch(e){} }   // 8/31: 스타일만 미리보기 갱신이 빠져 있어 "바꿔도 그대로"로 보였다
function styleLabel(key){const o=STYLES.find(x=>x[0]===key);return o?o[1]:'가로 표지 목록';}
// 스타일 그리드 접기/펼치기 — 칸 높이 절약(평소엔 현재 스타일만 표시)
function toggleStyleGrid(e,slot){ const g=el('stylegrid_'+slot); if(!g)return;
  const open=g.style.display!=='none'; g.style.display=open?'none':'';
  const t=el('styletoggle_'+slot); if(t)t.textContent=open?'바꾸기 ▾':'접기 ▴';
}
// 영역: 우리도서관 / 고전 컬렉션(해외·국내) / International Students (학생앱 페이지와 1:1)
const AREAS=['우리도서관','고전 컬렉션 해외','고전 컬렉션 국내','International'];
let curArea='우리도서관';
const aOf=s=>s.area||'우리도서관';
// 학교 도서관 고정 카테고리 — 데이터가 자동 집계되는 칸(책을 직접 담지 않음). 사서는 노출 on/off·제목만 손댐.
const FIXED_SLOTS={
  rank:      {style:'rank',     label:'대출 랭킹 (종이책·자동)'},
  ebookrank: {style:'ebookrank',label:'인기 전자책 (전자도서관·자동)'},
  newarr_p:  {style:'newlive_p',label:'종이책 신착 (자동)'},
  newarr_e:  {style:'newlive_e',label:'전자책 신착 (자동)'},
};
const FIXED_ORDER=['rank','ebookrank','newarr_p','newarr_e'];
const isFixed=s=>!!FIXED_SLOTS[s&&s.slot];
const visOf=s=>s.visible!==false;   // 기본 노출
// 우리도서관 영역에 고정 4칸이 모두 있도록 보장(없으면 대출 랭킹 뒤에 끼움)
function injectFixed(arr){
  if(!Array.isArray(arr)) return arr;
  let anchor=arr.findIndex(s=>aOf(s)==='우리도서관'&&s.slot==='rank');
  FIXED_ORDER.forEach(slot=>{
    if(arr.some(s=>aOf(s)==='우리도서관'&&s.slot===slot)) return;
    const def={rank:['우리 학교 대출 랭킹','이번 달 가장 많이 빌린 책'],ebookrank:['세명대 인기 전자책','전자도서관에서 많이 빌린 전자책'],newarr_p:['세명대 종이책 신착','새로 들어온 종이책'],newarr_e:['세명대 전자책 신착','새로 들어온 전자책']}[slot];
    const row={area:'우리도서관',slot,title:def[0],subtitle:def[1],style:FIXED_SLOTS[slot].style,visible:true,books:[]};
    const at=arr.findIndex(s=>aOf(s)==='우리도서관'&&s.slot===FIXED_ORDER[FIXED_ORDER.indexOf(slot)-1]);
    if(at>=0) arr.splice(at+1,0,row); else if(anchor>=0) arr.splice(anchor+1,0,row); else arr.push(row);
  });
  return arr;
}
let SECTIONS=[
  {area:'우리도서관',slot:'life',title:'오늘의 사서 추천',subtitle:'',style:'hero',books:[]},
  {area:'우리도서관',slot:'row',title:'사서가 주목한 책',subtitle:'우리 학교 사서가 직접 고른 책',style:'row',books:[]},
  {area:'우리도서관',slot:'rank',title:'우리 학교 대출 랭킹',subtitle:'이번 달 가장 많이 빌린 책',style:'rank',visible:true,books:[]},
  {area:'우리도서관',slot:'ebookrank',title:'세명대 인기 전자책',subtitle:'전자도서관에서 많이 빌린 전자책',style:'ebookrank',visible:true,books:[]},
  {area:'우리도서관',slot:'newarr_p',title:'세명대 종이책 신착',subtitle:'새로 들어온 종이책',style:'newlive_p',visible:true,books:[]},
  {area:'우리도서관',slot:'newarr_e',title:'세명대 전자책 신착',subtitle:'새로 들어온 전자책',style:'newlive_e',visible:true,books:[]},
  // 9/1: '요약 카드(15분)'·'AI 카드' 견본 칸 삭제 — 그 스타일을 골라 쓸 수 없게 뺐으므로 견본에도 남기지 않는다
];
let ORIG_SLOTS=SECTIONS.map(s=>s.slot);
let LOCATIONS=SECTIONS.filter(s=>aOf(s)==='우리도서관').map(s=>s.title);
// 8/29 리뷰 B2: 조회 실패가 조용히 넘어가면 코드에 박힌 견본 칸이 화면에 남고, 그걸 저장하면 서버의 진짜 칸을 덮어쓴다 → 실패 표시 + 저장 차단
let SEC_LOAD_FAILED=false;
async function loadSections(){
  try{
    const r=await fetch(`${SB_REST}/library_sections?select=area,slot,title,subtitle,style,sort_order,books,visible,chal_pos&order=sort_order`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    if(!r.ok){ SEC_LOAD_FAILED=true; if(el('pg-settings').style.display!=='none')renderSettings(); return; }
    const rows=await r.json(); if(!Array.isArray(rows)){ SEC_LOAD_FAILED=true; if(el('pg-settings').style.display!=='none')renderSettings(); return; }
    SEC_LOAD_FAILED=false;
    if(!rows.length) return;   // 서버에 아직 아무 칸도 없음(첫 사용) — 견본으로 시작
    SECTIONS=rows.map(x=>({area:x.area||'우리도서관',slot:x.slot,title:x.title,subtitle:x.subtitle||'',style:x.style||'row',visible:x.visible!==false,books:Array.isArray(x.books)?x.books:[],chal_pos:(x.chal_pos==null?null:+x.chal_pos)}));
    injectFixed(SECTIONS);   // 고정 4칸(대출랭킹·인기전자책·종이/전자 신착) 항상 존재 보장
    ORIG_SLOTS=SECTIONS.map(s=>s.slot);
    LOCATIONS=SECTIONS.filter(s=>aOf(s)==='우리도서관').map(s=>s.title);
    buildNtLoc(); if(MK.type)buildLoc();
    if(el('pg-settings').style.display!=='none')renderSettings();
    if(el('pg-make')&&el('pg-make').style.display!=='none'){ try{ renderChalNotices(); }catch(e){} }   // 8/29 독서 챌린지 안내 카드도 갱신
  }catch(e){ SEC_LOAD_FAILED=true; try{ if(el('pg-settings').style.display!=='none')renderSettings(); }catch(_){} }
}
// 북스타 고전 풀 (고전 컬렉션 큐레이션용 — classics 테이블)
let CLASSICS_POOL=[];
// 8/14 사장님 수정요청: 고전 표지 맵 — 담긴 책·후보 목록에 표지 이미지가 보이게 (앱과 동일한 covers/*.webp)
const CLS_COVER={};
try{
  (typeof BOOKS_CLASSICS_FOREIGN!=='undefined'?BOOKS_CLASSICS_FOREIGN:[])
    .concat(typeof BOOKS_CLASSICS_KR!=='undefined'?BOOKS_CLASSICS_KR:[])
    .forEach(b=>{ if(b&&b.id&&b.coverSrc) CLS_COVER[b.id]=String(b.coverSrc).replace(/^\.\//,'/'); });
}catch(e){}
async function loadClassicsPool(){
  try{ const r=await fetch(`${SB_REST}/classics?select=id,title,author,origin&order=origin,id`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    if(r.ok){ const d=await r.json(); if(Array.isArray(d)){
      const KO=window.CLASSICS_KO||{};
      CLASSICS_POOL=d.map(b=>({...b, title_ko:(b.origin==='foreign'?(KO[b.id]||''):'')}));  // 해외 고전에 한글 제목 부여
      if(el('secOv')&&el('secOv').classList.contains('on')&&scTab==='cls') secRenderClassics();  // 로딩 끝나면 열린 책담기 갱신(레이스 방지)
    } }
  }catch(e){}
}
loadClassicsPool();
function readSecInputs(){
  SECTIONS.forEach(s=>{const t=el('sec_t_'+s.slot),sub=el('sec_s_'+s.slot),st=el('sec_style_'+s.slot);
    if(t)s.title=t.value.trim()||s.title; if(sub)s.subtitle=sub.value.trim(); if(st)s.style=st.value; if(!Array.isArray(s.books))s.books=[];});
}
function addSection(){readSecInputs();
  // 8/29: 손으로 만드는 칸도 현재 영역 맨 위에(AI 큐레이션과 같은 규칙) — 그 뒤 ↕ 순서 바꾸기로 옮긴다
  const idxs=SECTIONS.map((s,i)=>i).filter(i=>aOf(SECTIONS[i])===curArea);
  const at=idxs.length?idxs[0]:SECTIONS.length;
  SECTIONS.splice(at,0,{area:curArea,slot:newSlot('c'),title:'새 카테고리',subtitle:'',style:'row',books:[]});
  renderSettings();}
// 8/29 사장님 요청: 책 없이 공지·안내 글만 담는 '안내 카드' 칸. 다른 칸과 똑같이 ↕ 순서 바꾸기로 원하는 자리에 끼워 넣는다.
// 8/29 사장님 요청: 'AI로 큐레이션 만들기'와 같은 방식 — 누르면 아래가 펴지고 다시 누르면 닫힌다.
//   그리고 칸은 '등록'을 눌러야 생긴다(펴는 것만으로는 아무것도 안 만들어짐).
let _ntFormOpen=false, _ntDraft={title:'',body:''};
// 8/29: 이 만들기 바는 '우리 도서관 등 꾸미기'와 '독서 챌린지' 두 화면에서 함께 쓴다. 지금 보고 있는 화면의 영역을 쓴다.
const CHAL_AREA='독서챌린지';
// 8/29: 칸 이름표(slot)는 저장·삭제의 열쇠 — 겹치면 다른 칸을 덮어쓰거나 못 지운다.
//   Date.now()만 쓰면 같은 밀리초에 만든 두 칸이 같은 이름표를 갖는다(실측으로 걸림). 무작위 꼬리 + 중복 확인.
function newSlot(prefix){
  let s; do{ s=prefix+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36); }
  while(SECTIONS.some(x=>x.slot===s));
  return s;
}
function _ntArea(){ const p=el('pg-make'); return (p && p.style.display!=='none') ? CHAL_AREA : curArea; }
function _ntRepaint(){ if(_ntArea()===CHAL_AREA) renderChalNotices(); else { renderSettings(); pvSync(); } }
function _ntSyncDraft(){ const t=el('ntNewT'), b=el('ntNewB'); if(t)_ntDraft.title=t.value; if(b)_ntDraft.body=b.value; }
function ntToggleForm(){ _ntSyncDraft(); _ntFormOpen=!_ntFormOpen; _ntRepaint();
  if(_ntFormOpen) setTimeout(()=>{ const t=el('ntNewT'); if(t) t.focus(); },60); }
function ntCancel(){ _ntDraft={title:'',body:''}; _ntFormOpen=false; _ntRepaint(); }
async function ntSubmit(){
  _ntSyncDraft();
  const body=String(_ntDraft.body||'').trim();
  if(!body){ toast('본문을 적어 주세요 — 안내 카드는 글이 전부예요'); const b=el('ntNewB'); if(b)b.focus(); return; }
  const area=_ntArea();
  if(area!==CHAL_AREA) readSecInputs(); else ntReadInputs();
  const idxs=SECTIONS.map((s,i)=>i).filter(i=>aOf(SECTIONS[i])===area);
  const at=idxs.length?idxs[0]:SECTIONS.length;   // 일단 이 영역 맨 위 — 자리는 카드의 ▲위로·▼아래로로 옮긴다
  SECTIONS.splice(at,0,{area,slot:newSlot('nt'),
    title:String(_ntDraft.title||'').trim()||'안내', subtitle:body, style:'notice', books:[]});
  _ntDraft={title:'',body:''}; _ntFormOpen=false; _pvFocusSlot=null;
  _ntRepaint();
  await saveSections();   // 등록 = 학생 앱에 실제 반영(완료 알림도 여기서)
}
// 8/31 사장님 요청: '+ 카테고리 추가'를 목록 맨 아래에서 위로 올리고 이름을 바꾼다.
//   만드는 방법 3가지(AI로 · 직접 · 안내형)를 화면 맨 위에 나란히 모아 한눈에 보이게 한다.
function secAddBarHTML(){
  return `<div class="nt-wrap">
      <div class="nt-add" onclick="addSection()" title="책을 직접 골라 담는 큐레이션 칸을 만듭니다">
        <span class="nt-add-ic">📚</span>
        <span class="nt-add-x"><b>직접 큐레이션 만들기</b><span>고른 책으로 큐레이션 한 칸을 만들 수 있어요</span></span>
        <span class="nt-add-p">만들기 +</span>
      </div>
    </div>`;
}
// 9/1 사장님 요청: 독서 챌린지도 같은 자리로 — 맨 아래 '+ 새 챌린지 추가' 버튼을 화면 위로 올리고 이름을 바꾼다.
//   AI로 / 직접 / 안내형 순서는 우리 도서관 꾸미기와 동일.
function chalAddBarHTML(){
  return `<div class="nt-wrap">
      <div class="nt-add" onclick="chalAdd()" title="책을 직접 골라 담는 챌린지를 만듭니다">
        <span class="nt-add-ic">📚</span>
        <span class="nt-add-x"><b>직접 챌린지 만들기</b><span>고른 책으로 챌린지 한 칸을 만들 수 있어요</span></span>
        <span class="nt-add-p">만들기 +</span>
      </div>
    </div>`;
}
/* ── 안내 카드 만들기 바 + 폼 (두 화면 공용 마크업) ── */
function ntBarHTML(){
  return `<div class="nt-wrap${_ntFormOpen?' on':''}">
      <div class="nt-add" onclick="ntToggleForm()" title="책 없이 공지·행사 안내만 보여 주는 칸을 만듭니다">
        <span class="nt-add-ic">📢</span>
        <span class="nt-add-x"><b>안내형 카드 만들기</b><span>책 없이 공지·행사 안내 글만 — 칸 사이 원하는 자리에 넣을 수 있어요</span></span>
        <span class="nt-add-p">${_ntFormOpen?'닫기 ▴':'열기 ▾'}</span>
      </div>
      ${_ntFormOpen?`<div class="nt-form">
        <div class="flabel">제목</div>
        <input class="cur-inp" id="ntNewT" value="${esc(_ntDraft.title)}" placeholder="예) 2026학년도 2학기 월별 우수독서 후기" oninput="_ntSyncDraft()">
        <div class="flabel" style="margin-top:11px">본문 <span style="font-weight:400;color:var(--light)">· 학생에게 보일 글 — 줄바꿈 그대로 나오고, 주소(http…)는 누를 수 있게 바뀝니다</span></div>
        <textarea class="cur-inp" id="ntNewB" rows="8" style="line-height:1.8" placeholder="1. 방법 : 매월 학술정보원 홈페이지 게시판에 제출한 독서 후기를 평가하여 포상&#10;2. 기간 : 2026. 9. 1. ~ 11. 30.&#10;&#10;보러가기 : https://lib.semyung.ac.kr/bbs/content/1_33953&#10;&#10;문의사항 : 043)649-7010" oninput="_ntSyncDraft()">${esc(_ntDraft.body)}</textarea>
        <div class="nt-form-f">
          <span class="nt-form-n">등록하면 <b>맨 위</b>에 생겨요 — 자리는 카드의 <b>▲ 위로 · ▼ 아래로</b>로 옮기세요.</span>
          <button class="btn-ghost" onclick="ntCancel()">취소</button>
          <button class="btn-primary" onclick="ntSubmit()">등록</button>
        </div>
      </div>`:''}
    </div>`;
}
/* ── 독서 챌린지 화면의 안내 카드 목록 (챌린지와 별개 데이터라 여기서 따로 그린다) ── */
function ntReadInputs(){   // 화면에 떠 있는 안내 카드 입력값을 SECTIONS로 되받기
  SECTIONS.forEach(s=>{ if(aOf(s)!==CHAL_AREA) return;
    const t=el('sec_t_'+s.slot), b=el('sec_s_'+s.slot);
    if(t) s.title=t.value.trim()||s.title; if(b) s.subtitle=b.value; });
}
function ntChalDel(slot){
  ntReadInputs();
  const i=SECTIONS.findIndex(s=>s.slot===slot); if(i<0) return;
  SECTIONS.splice(i,1); renderChalNotices();
  toast('지웠어요 — 위쪽 「저장 →」을 눌러야 학생 앱에서도 사라집니다');   // 8/29 리뷰 F3: 마지막 카드를 지우면 '등록' 버튼이 없어지므로 상단 저장을 가리킨다
}
async function ntChalSave(){ ntReadInputs(); await saveSections(); }
function renderChalNotices(){
  const host=el('ntListChal'); if(!host) return;
  ntReadInputs();   // 8/29 리뷰 F1: 다시 그리기 전에 화면의 입력값을 먼저 되받는다 — 안 그러면 챌린지 쪽 버튼만 눌러도 쓰던 안내 글이 사라진다
  // 8/29 사장님: 왼쪽 편집 목록도 오른쪽 화면과 같은 순서로 — 안내 카드는 챌린지 목록(renderChallenges) 안에 제자리로 섞여 그려진다. 여기엔 만들기 바만.
  // 9/1: 만드는 방법 3가지(AI로 · 직접 · 안내형)를 우리 도서관과 같은 순서로 화면 맨 위에 나란히.
  host.innerHTML=chalAddBarHTML()+ntBarHTML();
}
// 안내 카드 한 장(편집용). pos/total = 챌린지와 섞인 전체 목록에서의 자리 — ▲▼가 챌린지 사이로 움직인다
function ntCardHTML(s,pos,total){
  return `
    <div class="panel sec-panel" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="sec-no">📢 안내 카드</span><span style="flex:1"></span>
        <button class="btn-ghost sec-mv" ${pos<=0?'disabled':''} onclick="chalCombMove('n:${esc(s.slot)}',-1)" title="한 칸 위로">▲ 위로</button>
        <button class="btn-ghost sec-mv" ${pos>=total-1?'disabled':''} onclick="chalCombMove('n:${esc(s.slot)}',1)" title="한 칸 아래로">▼ 아래로</button>
        <button class="btn-ghost" style="padding:5px 10px;color:var(--bad);border-color:#e7c9c4" onclick="ntChalDel('${esc(s.slot)}')">삭제</button>
        <button class="btn-primary sec-reg" onclick="ntChalSave()" title="지금 고친 내용을 학생 앱에 반영합니다">등록</button>
      </div>
      <div class="flabel">제목</div><input class="cur-inp" id="sec_t_${esc(s.slot)}" value="${esc(s.title)}">
      <div class="flabel" style="margin-top:11px">본문 <span style="font-weight:400;color:var(--light)">· 줄바꿈 그대로 나오고, 주소(http…)는 누를 수 있게 바뀝니다</span></div>
      <textarea class="cur-inp" id="sec_s_${esc(s.slot)}" rows="7" style="line-height:1.8">${esc(s.subtitle)}</textarea>
      <div class="note" style="margin-top:12px">📢 이 자리 그대로 학생 앱에 나가요. ▲▼나 위쪽 <b>↕ 순서 바꾸기</b>로 챌린지 사이를 옮기고, <b>등록</b> 또는 <b>저장</b>을 눌러야 반영돼요.</div>
    </div>`;
}
// 챌린지·안내 카드를 한 줄로 놓고 한 칸 옮기기. key = 'c:<챌린지 index>' | 'n:<안내 slot>'
function chalCombMove(key,dir){
  readChalInputs(); ntReadInputs();
  const items=_chalCombined();
  const k=key.startsWith('n:')?items.findIndex(s=>(s.style||'')==='notice'&&s.slot===key.slice(2)):items.indexOf(CHALLENGES[+key.slice(2)]);
  const j=k+dir; if(k<0||j<0||j>=items.length) return;
  const t=items[k]; items[k]=items[j]; items[j]=t;
  if(!_applyChalOrder(items)) return;
  _chalPvFocus=null;   // 자리를 옮겼으니 미리보기는 전체로 — 어디로 갔는지 보이게 (우리 도서관 secMove와 같은 규칙)
  renderChallenges();
}
function delSection(i){readSecInputs();
  if(isFixed(SECTIONS[i])){toast('학교 도서관 고정 칸은 삭제 대신 ‘노출 끄기’로 숨길 수 있어요');return;}
  const s=SECTIONS[i]; if(!s) return;
  if(!confirm(`‘${s.title||'제목 없음'}’ 칸을 지울까요? 저장하면 학생 앱에서도 사라져요.`)) return;   // 8/29 리뷰: 한 번 클릭에 삭제 방지
  SECTIONS.splice(i,1);renderSettings();
  toast('지웠어요 — 저장(등록)을 눌러야 학생 앱에서도 사라집니다');}   // 8/29 리뷰 C7: 삭제 뒤 아무 신호가 없던 것
// 고정 칸 노출 on/off — 우리 도서관에 보일지 사서가 결정
function toggleVisible(i){readSecInputs();SECTIONS[i].visible=!visOf(SECTIONS[i]);renderSettings();}
function secRemoveBook(i,bi){readSecInputs();SECTIONS[i].books.splice(bi,1);renderSettings();}
/* ── 순서 바꾸기 모드 (제목만 컴팩트 목록 — 스크롤 없이 한눈에 정렬) ── */
// 8/17: 같은 모달을 독서 챌린지 빌더도 쓴다 — _reMode 'sec'(우리도서관·고전 칸) | 'chal'(CHALLENGES 순서)
let _reMode='sec';
// 8/29 사장님 지적: 순서 바꾸기 창에 안내 카드가 없어 챌린지 사이로 못 옮겼다 → 챌린지+안내 카드를 한 줄로 섞어 보여 준다.
//   안내 카드의 자리 = chal_pos(앞에 오는 챌린지 수). 없으면 맨 위. 학생 앱·미리보기도 같은 규칙으로 그린다.
function _chalCombined(){
  const nts=SECTIONS.filter(s=>aOf(s)===CHAL_AREA&&(s.style||'')==='notice');
  // 학생 화면과 같은 순서로 나열: '이달의 챌린지'(featured)는 항상 맨 위 → 그 다음 나머지. chal_pos 는 이 화면 순서 기준.
  const heroC=CHALLENGES.find(c=>c.featured)||null;
  const D=heroC?[heroC,...CHALLENGES.filter(c=>c!==heroC)]:CHALLENGES.slice();
  const out=[]; const n=D.length;
  const at=p=>nts.filter(s=>Math.min(Math.max(s.chal_pos==null?0:+s.chal_pos,0),n)===p);
  for(let i=0;i<n;i++){ out.push(...at(i)); out.push(D[i]); }
  out.push(...at(n));
  return out;
}
function _areaSecs(){ if(_reMode==='chal') return _chalCombined().map((s,i)=>({s,i})); return SECTIONS.map((s,i)=>({s,i})).filter(o=>aOf(o.s)===curArea); }
// 섞인 목록(items) → CHALLENGES 순서 + 안내 카드 chal_pos. '이달의 챌린지'는 학생 화면에서 항상 맨 위라 그 위로는 못 올린다(안내 카드는 예외 — 히어로 위에 둘 수 있음).
function _applyChalOrder(items){
  const chs=[]; const ntOrder=[];
  items.forEach(s=>{ if((s.style||'')==='notice'){ s.chal_pos=chs.length; ntOrder.push(s); } else chs.push(s); });
  const heroC=chs.find(c=>c.featured)||null;
  if(heroC&&chs[0]!==heroC){ toast('‘이달의 챌린지’는 학생 화면에서 항상 맨 위예요 — 다른 챌린지를 그 위로 올릴 수 없어요'); return false; }
  CHALLENGES.splice(0,CHALLENGES.length,...chs);
  // 안내 카드끼리의 순서도 정한 대로 SECTIONS 에 반영(같은 자리에 둘 이상일 때의 앞뒤)
  let k=0; SECTIONS.forEach((s,idx)=>{ if(aOf(s)===CHAL_AREA&&(s.style||'')==='notice') SECTIONS[idx]=ntOrder[k++]; });
  return true;
}
function _applyAreaOrder(items){
  if(_reMode==='chal'){ _applyChalOrder(items); return; }
  let k=0; SECTIONS.forEach((s,idx)=>{ if(aOf(s)===curArea) SECTIONS[idx]=items[k++]; }); }   // 현재 영역 칸만 재배열, 다른 영역 위치 보존
function openReorder(mode){ _reMode=(mode==='chal')?'chal':'sec'; if(_reMode==='chal') readChalInputs(); else readSecInputs();
  const h=document.querySelector('#reOv .sec-h h3'); if(h) h.textContent=_reMode==='chal'?'챌린지 순서 바꾸기':'칸 순서 바꾸기';
  renderReorderList(); el('reOv').classList.add('on'); }
function closeReorder(){ el('reOv').classList.remove('on'); if(_reMode==='chal'){ _chalPvFocus=null; updateChalPvCap(); renderChallenges(); } else renderSettings(); }
function renderReorderList(){
  const items=_areaSecs();
  el('reList').innerHTML=items.map((o,k)=>{
    const s=o.s, isFix=isFixed(s);
    return `<div class="re-row" draggable="true" data-k="${k}"
      ondragstart="reDragStart(event,${k})" ondragover="reDragOver(event,${k})" ondragleave="reDragLeave(event)" ondrop="reDrop(event,${k})" ondragend="reDragEnd()">
      <span class="re-handle">⠿</span><span class="re-no">${k+1}</span>
      <span class="re-t">${esc(s.title||'(제목 없음)')}${isFix?`<span class="re-lock">고정·자동${visOf(s)?'':' · 숨김'}</span>`:(s.style==='notice'?'<span class="re-lock">📢 안내 카드</span>':'')}</span>
      <span class="re-btns">
        <button class="re-arrow" ${k===0?'disabled':''} onclick="reMove(${k},-1)" title="위로">▲</button>
        <button class="re-arrow" ${k===items.length-1?'disabled':''} onclick="reMove(${k},1)" title="아래로">▼</button>
      </span></div>`;
  }).join('');
}
function reMove(k,dir){ const items=_areaSecs().map(o=>o.s); const j=k+dir; if(j<0||j>=items.length) return;
  const t=items[k]; items[k]=items[j]; items[j]=t; _applyAreaOrder(items); renderReorderList(); }
// 8/29 사장님 요청: 자리(위치)는 사서가 카드에서 바로 정한다 — 순서 바꾸기 창을 열지 않아도 ▲▼로 한 칸씩 옮긴다.
//   (_areaSecs는 순서바꾸기 모달용 _reMode에 걸려 있어 여기선 쓰지 않고 현재 영역만 직접 다룬다)
function secMove(i,dir){
  readSecInputs();
  const items=SECTIONS.map((s,idx)=>({s,idx})).filter(o=>aOf(o.s)===curArea);
  const k=items.findIndex(o=>o.idx===i); if(k<0) return;
  const j=k+dir; if(j<0||j>=items.length) return;
  const arr=items.map(o=>o.s); const t=arr[k]; arr[k]=arr[j]; arr[j]=t;
  let n=0; SECTIONS.forEach((s,idx)=>{ if(aOf(s)===curArea) SECTIONS[idx]=arr[n++]; });   // 현재 영역 칸만 재배열(다른 영역 위치 보존)
  _pvFocusSlot=null; updatePvCap();   // 자리를 옮겼으니 미리보기는 '한 칸만'이 아니라 전체를 보여 준다(어디로 갔는지 보이게)
  renderSettings(); pvSync();
  const el2=document.querySelector('#secList .sec-panel[data-slot="'+arr[j].slot+'"]');
  if(el2) el2.scrollIntoView({block:'center',behavior:'smooth'});   // 옮긴 칸을 눈으로 따라갈 수 있게
}
let _reDrag=-1;
function reDragStart(e,k){ _reDrag=k; e.currentTarget.classList.add('dragging'); try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',String(k)); }catch(_){}}
function reDragOver(e,k){ if(_reDrag<0||_reDrag===k) return; e.preventDefault(); const p=e.currentTarget;
  document.querySelectorAll('.re-row.drag-over').forEach(x=>{if(x!==p)x.classList.remove('drag-over')}); p.classList.add('drag-over'); }
function reDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function reDrop(e,k){ e.preventDefault(); const from=_reDrag; _reDrag=-1; const p=e.currentTarget; p.classList.remove('drag-over');
  if(from<0||from===k) return; const items=_areaSecs().map(o=>o.s);
  const rect=p.getBoundingClientRect(); const after=e.clientY>rect.top+rect.height/2; let target=k+(after?1:0);
  const moved=items.splice(from,1)[0]; if(from<target) target--;
  if(target<0)target=0; if(target>items.length)target=items.length;
  items.splice(target,0,moved); _applyAreaOrder(items); renderReorderList(); }
function reDragEnd(){ _reDrag=-1; document.querySelectorAll('.re-row.drag-over,.re-row.dragging').forEach(x=>{x.classList.remove('drag-over');x.classList.remove('dragging');}); }
function closePreview(){ el('pvOv').classList.remove('on'); el('pvFrame').src='about:blank'; }
async function applyFromPreview(){ closePreview(); await saveSections(); }
// ── 실시간 미리보기 (오른쪽 폰 패널 — postMessage로 새로고침 없이 즉시 반영) ──
let _pvFocusSlot=null;   // 설정 시 미리보기에 그 칸만 보냄(좌측 편집 칸 = 우측 미리보기)
function pvBuildRows(){ readSecInputs();
  let rows=SECTIONS.filter(s=>aOf(s)===curArea).map((s,i)=>({slot:s.slot,title:s.title,subtitle:s.subtitle,style:s.style,sort_order:i,books:s.books||[],visible:visOf(s)}));
  if(_pvFocusSlot){ const f=rows.filter(r=>r.slot===_pvFocusSlot); if(f.length) return f; _pvFocusSlot=null; }   // 칸 삭제 등으로 사라지면 전체로 복귀
  return rows;
}
// 좌측에서 편집 중인 칸 → 우측 미리보기에 그 칸만 표시
function pvFocusSec(slot){
  // 8/29 리뷰 C4: 제목 칸에 커서만 놓아도 미리보기가 한 칸으로 줄어들던 것 — 입력칸·버튼 클릭은 무시하고 카드 여백을 눌렀을 때만
  try{ const t=window.event&&window.event.target; if(t&&/^(INPUT|TEXTAREA|SELECT|BUTTON|LABEL|OPTION)$/.test(t.tagName)) return; }catch(e){}
  if(_pvFocusSlot!==slot){_pvFocusSlot=slot; updatePvCap();
    document.querySelectorAll('#secList .sec-panel').forEach(p=>p.classList.toggle('pv-focus',p.getAttribute('data-slot')===slot));
  }
  pvSync();
}
function pvShowAll(){ _pvFocusSlot=null; updatePvCap(); pvSync(); }
function updatePvCap(){ const c=el('pvCap'); if(!c)return;
  if(_pvFocusSlot){ const s=SECTIONS.find(x=>x.slot===_pvFocusSlot);
    c.innerHTML=`<b style="color:var(--text)">${esc(s?s.title:'선택한 칸')}</b> 칸만 보는 중 · <a onclick="pvShowAll()" style="cursor:pointer;color:var(--accent);font-weight:700;text-decoration:underline">전체 보기</a>`; }
  else { c.textContent='학생 앱 ‘'+curArea+'’ · 편집 즉시 반영'; }
}
function _pvOpen(){
  const p=el('livePv'); if(!p) return; p.classList.add('on'); document.body.classList.add('pv-open');
  try{ localStorage.setItem('bookstar_preview_sections',JSON.stringify(pvBuildRows())); }catch(e){}
  el('pvLiveFrame').src='/?preview=1&area='+encodeURIComponent(curArea)+'&t='+Date.now();
  const cap=el('pvCap'); if(cap) cap.textContent='학생 앱 ‘'+(AREA_LABELS[curArea]||curArea)+'’ · 편집 즉시 반영';
  const btn=el('pvToggleBtn'); if(btn) btn.textContent='👁 미리보기 닫기';
  requestAnimationFrame(pvFitScale);
}
function _pvClose(){
  const p=el('livePv'); if(!p) return; p.classList.remove('on'); document.body.classList.remove('pv-open');
  const f=el('pvLiveFrame'); if(f) f.src='about:blank';
  const btn=el('pvToggleBtn'); if(btn) btn.textContent='👁 미리보기';
}
function toggleLivePreview(){ const p=el('livePv'); if(p&&p.classList.contains('on')) _pvClose(); else _pvOpen(); }
// 꾸미기 진입 시 넓은 화면이면 자동으로 열기(좁으면 토글 유지)
function autoOpenPreview(){ if(window.innerWidth>=1180){ const p=el('livePv'); if(p&&!p.classList.contains('on')) _pvOpen(); } }
// iframe 로드 완료 시 현재 편집 상태 한 번 더 전송(첫 상태 누락 방지) + 축소 적용
function pvFrameLoaded(){ const p=el('livePv'); if(!p||!p.classList.contains('on')) return;
  const f=el('pvLiveFrame'); if(f&&f.contentWindow){ try{ f.contentWindow.postMessage({type:'bookstar_preview',sections:pvBuildRows()},'*'); }catch(e){} }
  pvFitScale(); pvBindFrameScroll(); }
// 실제 웹을 PV_DEVICE_W 너비로 렌더한 뒤 패널 폭에 맞춰 축소 → "작은 실제 화면"
let _pvScale=1;
const PV_DEVICE_W=1024;   // 이 너비로 렌더 후 축소(작게 보고 싶으면 키우고, 크게 보려면 줄이기)
function pvFitScale(){
  const ph=document.querySelector('#livePv .pv-phone'); const f=el('pvLiveFrame');
  if(!ph||!f) return; const w=ph.clientWidth, h=ph.clientHeight; if(!w) return;
  const s=w/PV_DEVICE_W; _pvScale=s;
  f.style.width=PV_DEVICE_W+'px';
  f.style.height=Math.ceil(h/s)+'px';
  f.style.transformOrigin='top left';
  f.style.transform='scale('+s+')';
}
// 관리자 화면 ↔ 미리보기(iframe) 양방향 스크롤 동기 (픽셀 1:1)
// (미리보기가 화면에 고정되는 지점부터, 그 이후 스크롤한 px만큼 동일하게 이동 → 손가락 따라 붙는 느낌)
let _pvScrollRAF=0, _pvFrameRAF=0;
const PV_STICKY_TOP=78;   // .settings-pv 의 sticky top 값과 동일
let _pvIgnoreWinUntil=0, _pvIgnoreFrameUntil=0;   // 되먹임(echo) 방지용 방향별 무시 창(ms)
function _pvInner(doc){
  const cands=[doc.querySelector('.main'),doc.scrollingElement,doc.documentElement,doc.body].filter(Boolean);
  return cands.find(c=>(c.scrollHeight-c.clientHeight)>4)||cands[0]||null;
}
function _pvPin(){
  const se=document.scrollingElement||document.documentElement;
  const wrap=document.querySelector('.settings-wrap');
  return wrap?Math.max(0,(wrap.getBoundingClientRect().top+se.scrollTop)-PV_STICKY_TOP):0;
}
// ① 관리자 창 스크롤 → 미리보기 따라가기
function pvSyncScroll(){
  const p=el('livePv'); if(!p||!p.classList.contains('on')) return;
  const f=el('pvLiveFrame'); if(!f||!f.contentWindow) return;
  if(Date.now()<_pvIgnoreWinUntil) return;   // 이 창 스크롤은 iframe→창 동기가 만든 것 → 되돌리지 않음
  try{
    const doc=f.contentDocument||f.contentWindow.document; if(!doc) return;
    const inner=_pvInner(doc); if(!inner) return;
    const se=document.scrollingElement||document.documentElement;
    _pvIgnoreFrameUntil=Date.now()+90;   // 이로 인해 발생할 iframe scroll 이벤트는 무시(echo 방지)
    inner.scrollTop=Math.max(0,(se.scrollTop-_pvPin())/(_pvScale||1));   // 축소 보정
  }catch(e){}
}
// ② 미리보기 스크롤 → 관리자 창 따라오기 (반대 방향)
function pvFrameScroll(){
  const p=el('livePv'); if(!p||!p.classList.contains('on')) return;
  const f=el('pvLiveFrame'); if(!f||!f.contentWindow) return;
  if(Date.now()<_pvIgnoreFrameUntil) return;   // 이 iframe 스크롤은 창→iframe 동기가 만든 것 → 되돌리지 않음
  try{
    const doc=f.contentDocument||f.contentWindow.document; if(!doc) return;
    const inner=_pvInner(doc); if(!inner) return;
    _pvIgnoreWinUntil=Date.now()+90;   // 이로 인해 발생할 창 scroll 이벤트는 무시(echo 방지)
    window.scrollTo(0,_pvPin()+inner.scrollTop*(_pvScale||1));
  }catch(e){}
}
function pvOnScroll(){ if(_pvScrollRAF) return; _pvScrollRAF=requestAnimationFrame(function(){ _pvScrollRAF=0; pvSyncScroll(); }); }
function pvOnFrameScroll(){ if(_pvFrameRAF) return; _pvFrameRAF=requestAnimationFrame(function(){ _pvFrameRAF=0; pvFrameScroll(); }); }
window.addEventListener('scroll',pvOnScroll,{passive:true});
window.addEventListener('resize',function(){ const p=el('livePv'); if(p&&p.classList.contains('on')){ pvFitScale(); pvSyncScroll(); } });
// iframe 내부 스크롤 리스너 부착(로드 후) — capture로 .main 같은 overflow 요소 스크롤도 포착
function pvBindFrameScroll(){
  const f=el('pvLiveFrame'); if(!f||!f.contentWindow) return;
  try{ const cw=f.contentWindow; cw.removeEventListener('scroll',pvOnFrameScroll,true); cw.addEventListener('scroll',pvOnFrameScroll,true); }catch(e){}
}
let _pvTimer=null;
function pvSync(){
  const p=el('livePv'); if(!p||!p.classList.contains('on')) return;
  clearTimeout(_pvTimer);
  _pvTimer=setTimeout(()=>{ const rows=pvBuildRows();
    try{ localStorage.setItem('bookstar_preview_sections',JSON.stringify(rows)); }catch(e){}
    const f=el('pvLiveFrame'); if(f&&f.contentWindow){ try{ f.contentWindow.postMessage({type:'bookstar_preview',sections:rows},'*'); }catch(e){} }
  },200);
}
// ── 8/22 소장 표식 보정(저장 직전 단일 관문) ─────────────────────────────────────
// 사고: 챌린지 저장이 책을 {id,isbn,title,…}로만 추려 tags/_pp/lib 를 버렸고, AI 큐레이션 경로는 애초에 안 붙였다
//   → 학생 앱에서 소장 책(71권)이 "우리 도서관에서 찾기"(외부책)로 보였다. 사장님 지적 "세명대에 없는 책이 또 나온다".
// 규칙: 맨 ISBN인데 소장 표식(_pp·lib)이 없으면 장서(semyung_tulip)에서 채우고, 장서에 없으면 저장을 막는다(미소장은 선반에 못 올린다).
// 8/29 리뷰 F7/B3: 장서 조회가 실패하면 예전엔 조용히 "전부 미소장"이 되어 사서가 멀쩡한 책을 빼게 했다 → 실패는 throw(호출부가 "연결 문제"로 안내)
async function fillHeld(books){
  const need=[...new Set((books||[]).map(b=>String(b.isbn||'')).filter(i=>/^\d{10,13}$/.test(i)))];
  const map={};
  for(let i=0;i<need.length;i+=100){
    const r=await fetch(`${SB_REST}/semyung_tulip?select=isbn,kind,ctrl,viewer_url&isbn=in.(${need.slice(i,i+100).map(x=>'"'+x+'"').join(',')})&limit=500`,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    if(!r.ok) throw new Error('held-check '+r.status);
    for(const row of await r.json()) (map[row.isbn]=map[row.isbn]||[]).push(row);
  }
  const missing=[];
  for(const b of (books||[])){
    const isbn=String(b.isbn||''); if(!/^\d{10,13}$/.test(isbn)) continue;
    const hits=map[isbn]||[];
    if(!hits.length){ if(!b._pp&&!b.lib) missing.push(b.title||b.t||isbn); continue; }
    const tags=new Set(b.tags||[]);
    for(const h of hits){
      if(h.kind==='paper'&&h.ctrl){ b._pp=b._pp||('https://lib.semyung.ac.kr/search/detail/CATTOT'+h.ctrl); tags.add('paper'); }
      if(h.kind==='ebook'&&h.viewer_url){ b.lib=b.lib||h.viewer_url; b._sm=true; tags.add('ebook'); }
    }
    if(tags.size) b.tags=[...tags];
    delete b.held;
  }
  return missing;
}
async function saveSections(){
  readSecInputs();
  if(SEC_LOAD_FAILED){ toast('칸을 서버에서 불러오지 못한 상태라 저장할 수 없어요 — 새로고침 후 다시 시도해 주세요'); return; }   // 8/29 리뷰 B2: 견본 칸이 진짜를 덮어쓰는 것 방지
  // 8/29 안내 카드는 글이 전부다 — 본문이 비면 학생 앱에 빈 카드가 올라간다. 등록 전에 막는다.
  const _emptyNt=SECTIONS.filter(s=>(s.style==='notice')&&!String(s.subtitle||'').trim());
  if(_emptyNt.length){ toast('📢 안내 카드에 본문이 비어 있어요 — 내용을 적고 등록해 주세요'); return; }
  for(const s of SECTIONS){
    let miss; try{ miss=await fillHeld(s.books||[]); }catch(e){ toast('소장 여부를 확인하지 못했어요(연결 문제) — 잠시 후 다시 저장해 주세요'); return; }
    // 8/29 리뷰 B4: 다른 영역 칸 이름만 대면 사서가 못 찾는다 → 어느 화면인지 같이 알린다
    if(miss.length){ const where=(AREA_LABELS[aOf(s)]||aOf(s)); toast(`[${where}] ‘${s.title}’ 칸에 세명대 미소장 책이 있어요: ${miss.slice(0,3).join(', ')}${miss.length>3?' 외 '+(miss.length-3)+'권':''} — 그 화면에서 빼고 저장해 주세요`); return; } }
  const rows=SECTIONS.map((s,i)=>({school:'한국대학교',area:aOf(s),slot:s.slot,title:s.title,subtitle:s.subtitle,style:s.style,sort_order:i,books:s.books||[],visible:visOf(s),chal_pos:(s.chal_pos==null?null:s.chal_pos)}));   // chal_pos: 독서챌린지 안내 카드의 자리(앞에 오는 챌린지 수)
  try{
    const r=await adminSave({op:'sections_upsert',rows});
    if(!r.ok){toast(r.status===401?'로그인이 만료됐어요 — 새로고침 후 다시 로그인해주세요':'저장 실패 ('+r.status+')');return;}
    // 삭제된 칸 서버 정리 — 실패한 slot은 추적 목록에 남겨 다음 저장 때 자동 재시도 (유령 칸 방지)
    const cur=new Set(SECTIONS.map(s=>s.slot));
    const delFail=[];
    for(const slot of ORIG_SLOTS.filter(x=>!cur.has(x))){
      try{
        const dr=await adminSave({op:'sections_delete',school:'한국대학교',slot});
        if(!dr.ok) delFail.push(slot);
      }catch(_){ delFail.push(slot); }
    }
    ORIG_SLOTS=SECTIONS.map(s=>s.slot).concat(delFail);
    LOCATIONS=SECTIONS.filter(s=>aOf(s)==='우리도서관').map(s=>s.title);buildNtLoc();if(MK.type)buildLoc();
    if(delFail.length) toast('저장은 됐지만 지운 칸 '+delFail.length+'개가 서버에서 안 지워졌어요 — 잠시 후 다시 저장해주세요');
    else { const _a=(typeof _ntArea==='function')?_ntArea():curArea;   // 독서 챌린지 화면에서 저장하면 그 이름으로 알린다
      toast('저장 완료 — 학생 앱 ‘'+(AREA_LABELS[_a]||_a)+'’에 반영됩니다'); }
  }catch(e){toast('저장 실패 — 연결 확인');}
}
// ── 칸 드래그&드롭 순서 변경 (↑↓ 버튼과 병행) ──
let _secDragFrom=-1;
const AREA_LABELS={'우리도서관':'우리 도서관','고전 컬렉션':'고전 컬렉션','고전 컬렉션 해외':'세계 고전','고전 컬렉션 국내':'한국 고전','International':'International Students','독서챌린지':'독서 챌린지'};
const AREA_HINTS={
  '우리도서관':'학생 앱 ‘우리 도서관’ 첫 화면 — 칸 추가·이름·순서·책 담기.',
  '고전 컬렉션 해외':'학생 앱 ‘고전 컬렉션 > 해외 고전’ 탭 큐레이션 — 해외 고전 선반을 직접 구성합니다.',
  '고전 컬렉션 국내':'학생 앱 ‘고전 컬렉션 > 국내 고전’ 탭 큐레이션 — 한국 고전(유학생 다국어) 선반을 구성합니다.',
  'International':'학생 앱 ‘International Students’ 화면 큐레이션 — 유학생용 다국어 선반을 구성합니다.'
};
// (탭 제거 — 영역은 좌측 사이드바에서 선택) 진입 영역에 맞춰 제목/부제만 갱신
function renderAreaTabs(){
  const t=el('setTitle'); if(t) t.textContent=(AREA_LABELS[curArea]||curArea)+' 꾸미기';
  const h=el('setSub'); if(h) h.textContent=AREA_HINTS[curArea]||'';
}
function renderSettings(){
  renderAreaTabs();
  const list=SECTIONS.map((s,i)=>({s,i})).filter(o=>aOf(o.s)===curArea);
  // 8/29 사장님 요청: AI 큐레이션 카드 바로 아래 = 안내 카드 만들기 입구. 누르면 펴지고 다시 누르면 닫힌다.
  // 8/31 사장님 요청: 그 사이에 '직접 큐레이션 만들기'(옛 '+ 카테고리 추가') — AI로 / 직접 / 안내형 순으로 나란히.
  el('secList').innerHTML=(SEC_LOAD_FAILED?`<div class="load-fail">칸을 서버에서 불러오지 못했어요. <span>지금 보이는 칸은 견본일 수 있어 저장이 막혀 있습니다 — 페이지를 새로고침한 뒤 다시 시도해 주세요.</span></div>`:'')
   +secAddBarHTML()
   +ntBarHTML()
   +list.map((o,k)=>{
    const s=o.s, i=o.i, isFix=isFixed(s), vis=visOf(s), books=s.books||[];
    const isNotice=!isFix && NO_BOOK_STYLES.includes(s.style||'row');   // 8/29 안내 카드 = 책 없는 칸
    const first=k===0, last=k===list.length-1;
    return `<div class="panel sec-panel${isFix?' sec-fixed':''}${s.slot===_pvFocusSlot?' pv-focus':''}" style="margin-bottom:12px${isFix&&!vis?';opacity:.5':''}" data-i="${i}" data-slot="${esc(s.slot)}" onclick="pvFocusSec('${s.slot}')">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="sec-no">칸 ${k+1}${isFix?' · 고정':''}${isNotice?' · 📢 안내 카드':''}</span><span style="flex:1"></span>
      ${/* 8/29 사장님 요청: 자리는 사서가 여기서 바로 — 위/아래 한 칸씩 */''}
      <button class="btn-ghost sec-mv" ${first?'disabled':''} onclick="event.stopPropagation();secMove(${i},-1)" title="한 칸 위로">▲ 위로</button>
      <button class="btn-ghost sec-mv" ${last?'disabled':''} onclick="event.stopPropagation();secMove(${i},1)" title="한 칸 아래로">▼ 아래로</button>
      ${isFix?`<button class="btn-ghost vis-toggle" style="padding:5px 11px;font-weight:700;${vis?'color:#1a8f4c;border-color:#bfe6cd;background:#f0faf3':'color:var(--light);border-color:var(--border)'}" onclick="event.stopPropagation();toggleVisible(${i})" title="우리 도서관에 보일지 켜고 끄기">${vis?'👁 노출 켜짐':'🚫 숨김'}</button>
        <span class="btn-ghost" style="padding:5px 10px;color:var(--light)" title="자동 집계 고정 — 삭제 불가">🔒 고정</span>`
        :`<button class="btn-ghost" style="padding:5px 10px;color:var(--bad);border-color:#e7c9c4" onclick="event.stopPropagation();delSection(${i})">삭제</button>`}
      ${/* 8/29 사장님 요청: 등록(=저장) 버튼을 카드에도 — 위의 '저장 →'과 같은 일을 한다 */''}
      <button class="btn-primary sec-reg" onclick="event.stopPropagation();saveSections()" title="지금까지 고친 내용을 학생 앱에 반영합니다">등록</button>
    </div>
    <div><div class="flabel">제목</div><input class="cur-inp" id="sec_t_${s.slot}" value="${esc(s.title)}" oninput="pvSync()"></div>
    ${isNotice
      /* 8/29 사장님 지시: 안내 카드는 모양이 하나뿐 — 스타일 고르는 칸을 아예 안 보여준다(11개를 늘어놓으면 뭘 골라야 할지 알 수 없다) */
      ?`<input type="hidden" id="sec_style_${s.slot}" value="notice">`
      :`<div class="flabel" style="margin-top:11px">스타일 (앱에서 어떻게 보일지)</div>${isFix
      ?`<input class="cur-inp" value="${esc(FIXED_SLOTS[s.slot].label)}" disabled style="color:var(--light)">`
      :`<input type="hidden" id="sec_style_${s.slot}" value="${esc(s.style||'row')}">
        <div class="style-bar" onclick="toggleStyleGrid(event,'${s.slot}')">
          <span class="style-cur"><span class="sb-th">${styleThumb(s.style||'row')}</span><b id="style_lbl_${s.slot}">${esc(styleLabel(s.style||'row'))}</b></span>
          <span class="style-toggle" id="styletoggle_${s.slot}">바꾸기 ▾</span>
        </div>
        <div class="style-pick" id="stylegrid_${s.slot}" style="display:none">${STYLES.filter(o=>o[0]!=='rank'&&!NO_BOOK_STYLES.includes(o[0])).map(o=>`<div class="sp-card${s.style===o[0]?' on':''}" onclick="setSecStyle('${s.slot}','${o[0]}')" title="${esc(STYLE_DESC[o[0]]||'')}"><div class="sp-th">${styleThumb(o[0])}</div><div class="sp-nm">${esc(o[1])}</div></div>`).join('')}</div>`}`}
    ${isNotice
      ? `<div class="flabel">본문 <span style="font-weight:400;color:var(--light)">· 학생에게 보일 글 — 줄바꿈 그대로 나오고, 주소(http…)는 누를 수 있게 바뀝니다</span></div>
         <textarea class="cur-inp" id="sec_s_${s.slot}" rows="7" style="line-height:1.8" placeholder="예) 2026학년도 2학기 월별 우수독서 후기&#10;&#10;1. 방법 : 매월 학술정보원 홈페이지 게시판에 제출한 독서 후기를 평가하여 포상&#10;2. 기간 : 2026. 9. 1. ~ 11. 30.&#10;&#10;보러가기 : https://lib.semyung.ac.kr/bbs/content/1_33953&#10;&#10;문의사항 : 043)649-7010" oninput="pvSync()">${esc(s.subtitle)}</textarea>`
      : `<div class="flabel">부제 (선택)</div><input class="cur-inp" id="sec_s_${s.slot}" value="${esc(s.subtitle)}" oninput="pvSync()">`}
    ${isFix?`<div class="note" style="margin-top:12px">⚙ 자동 집계 — 책을 직접 담지 않습니다. ${vis?'지금 <b>우리 도서관에 노출 중</b>이에요.':'지금 <b>숨김</b> 상태 — 학생 앱에 안 보여요.'}</div>`
      :isNotice?`<div class="note" style="margin-top:12px">📢 안내 카드 — 책을 담지 않습니다. 제목과 본문만 학생 앱에 그대로 나와요. 자리는 위의 <b>▲ 위로 · ▼ 아래로</b>로 옮기고, <b>등록</b>을 눌러야 학생 앱에 반영됩니다.</div>`
      :`<div class="flabel">담긴 책 ${books.length}권</div>
        ${books.length?'':`<div class="deco-empty">아직 담은 책이 없어요. 비워두면 앱에서 <b>도서관 인기·추천 책</b>이 자동으로 채워집니다.</div>`}
        <div class="deco-list">${books.map((b,bi)=>{const _cv=b.cover||(b.id&&CLS_COVER[b.id])||'';return `<div class="deco-bk" title="${esc((b.title||b.t||'')+' · '+(b.author||b.a||''))}">
            <button class="db-rm" title="빼기" onclick="event.stopPropagation();secRemoveBook(${i},${bi})">×</button>
            <div class="db-cv">${_cv?`<img src="${esc(_cv)}" onerror="this.parentNode.textContent='📕'">`:'📕'}</div>
            <div class="db-t">${esc(b.title||b.t||'제목 미상')}</div>
          </div>`;}).join('')}
          <span class="deco-add" onclick="event.stopPropagation();secOpenPicker(${i})">+ 책<br>담기</span></div>`}
  </div>`;}).join('');   // (8/31) 맨 아래 '+ 카테고리 추가' 버튼은 위 '직접 큐레이션 만들기'로 옮겨 삭제
  // 8/14 사장님 수정요청: AI 큐레이션을 세계고전·한국고전에서도 — 영역별 문맥 설정 + 카드 제자리 복귀
  const aic=el('aiCurCard');
  if(aic){
    const host=document.querySelector('#pg-settings .settings-main'); aicMount(host);
    const ctx = curArea==='우리도서관' ? 'lib'
      : curArea==='고전 컬렉션 해외' ? 'foreign'
      : curArea==='고전 컬렉션 국내' ? 'kr' : '';
    if(ctx){ aic.style.display=''; aicSetContext(ctx); aicLoadUsage(); if(ctx!=='lib'&&!CLASSICS_POOL.length) loadClassicsPool(); }
    else aic.style.display='none';
  }
  updatePvCap(); pvSync();
}
/* ── 칸별 책 담기 모달 (공유 3탭) ── */
let scTab='nat', scIdx=-1, SCAND=[], scHead='', scMode='sec';   // scMode: sec(우리도서관 칸) | chal(챌린지)
let _aiCur=null;   // 통합검색(AI)이 제안한 큐레이션 제목·부제 — '이 큐레이션 통째로 담기'용
let _clsOrigin='all';   // 북스타 고전 필터: all | kr(한국) | foreign(서양)
let _clsLock=null;      // 탭 영역에 묶인 강제 필터(해외 칸='foreign' / 국내 칸='kr'). 설정 시 변경 칩 숨김
function clsChips(){
  return [['all','전체'],['kr','한국 고전'],['foreign','서양 고전']].map(o=>
    `<span onclick="setClsOrigin('${o[0]}')" style="cursor:pointer;padding:4px 12px;border-radius:99px;margin-right:6px;font-size:12px;font-weight:700;border:1px solid var(--border);${_clsOrigin===o[0]?'background:var(--primary);color:#fff;border-color:var(--primary)':'background:var(--card);color:var(--text)'}">${o[1]}</span>`).join('');
}
function setClsOrigin(o){_clsOrigin=o;el('secEx').innerHTML=clsChips();secRenderClassics();}
function pkObj(){return scMode==='chal'?CHALLENGES[scIdx]:SECTIONS[scIdx];}   // 책 담기 대상
function secExample(t){el('secQ').value=t;secSearch();}
function secOpenPicker(i,mode){scMode=mode||'sec';if(scMode==='chal')readChalInputs();else readSecInputs();
  scIdx=i;SCAND=[];
  // 고전 컬렉션 큐레이션은 '북스타 고전' 안에서만 (국중/ISBN/도서관내 숨김)
  const secArea = scMode==='sec' ? aOf(SECTIONS[i]) : '';
  const clsArea = (scMode==='sec' && secArea.indexOf('고전 컬렉션')===0) || (scMode==='chal' && (CHALLENGES[i]||{}).type==='고전챌린지');   // 고전 컬렉션 칸 + 고전 챌린지 = 북스타 고전에서 담기
  document.querySelectorAll('#secOv .btab').forEach(btn=>{ const sbt=btn.dataset.sbt;
    // 고전 영역=북스타 고전만 / 그 외=통합검색+ISBN만(도서관내·세명대 탭은 통합검색으로 흡수)
    btn.style.display = clsArea ? (sbt==='cls'?'':'none') : (['nat','isbn'].includes(sbt)?'':'none'); });
  // 영역에 맞춰 고전 풀 강제 잠금: 해외 칸→해외 고전만, 국내 칸→한국 고전만 (사서가 못 바꿈)
  _clsLock = secArea==='고전 컬렉션 해외' ? 'foreign' : (secArea==='고전 컬렉션 국내' ? 'kr' : null);
  _clsOrigin = _clsLock || 'all';
  scTab = clsArea ? 'cls' : 'nat';
  el('secModalTitle').textContent=`‘${pkObj().title}’에 책 담기`;
  document.querySelectorAll('#secOv .btab').forEach(b=>b.classList.toggle('on',b.dataset.sbt===scTab));
  el('secOv').classList.add('on');secApplyTab();loadInventory();}
function secClosePicker(){el('secOv').classList.remove('on');if(scMode==='chal')renderChallenges();else renderSettings();}
function secTab(t){scTab=t;document.querySelectorAll('#secOv .btab').forEach(b=>b.classList.toggle('on',b.dataset.sbt===t));SCAND=[];_aiCur=null;secApplyTab();}
function secNote(){const o=pkObj();el('secAddedNote').textContent='담긴 책 '+((o&&o.books||[]).length)+'권';}
function secApplyTab(){const q=el('secQ');
  const fr=el('secFmtRow'); if(fr){ fr.style.display=(scTab==='nat')?'flex':'none'; secSyncFormat(); }   // 8/19 책 형태는 통합검색 탭에서만
  if(scTab==='cls'){q.placeholder='북스타 고전 검색 (제목·저자) — 비우면 전체';el('secBtn').textContent='검색';
    el('secEx').innerHTML = _clsLock ? `<span style="font-size:12px;color:var(--text-light);font-weight:700">${_clsLock==='foreign'?'🌍 해외 고전':'🇰🇷 한국 고전'}만 담을 수 있어요 (이 탭 전용)</span>` : clsChips();
    secRenderClassics();}
  else if(scTab==='lib'){q.placeholder='소장 목록 검색 (제목·저자)';el('secBtn').textContent='검색';el('secEx').innerHTML='';secRenderLib();}
  else if(scTab==='sm'){q.placeholder='세명대 전자도서관 검색 (제목·저자)';el('secBtn').textContent='검색';el('secEx').innerHTML='';el('secCandWrap').innerHTML='<div class="book-empty">세명대 학술정보원 전자책에서 검색해 담아요.<br>담은 책은 학생 앱에서 ‘전자책 바로 읽기’로 연결됩니다.</div>';}
  else if(scTab==='isbn'){q.placeholder='ISBN 13자리 입력';el('secBtn').textContent='조회';el('secEx').innerHTML='';el('secCandWrap').innerHTML='<div class="book-empty">ISBN을 넣으면 표지·제목이 자동으로 붙어요.</div>';}
  else{q.placeholder='제목·저자 또는 자연어 (예: 시험 끝 머리 식히는 책)';el('secBtn').textContent='찾기';el('secEx').innerHTML=EX_HOLD.map(e=>`<span onclick="secExample('${esc(e)}')">${esc(e)}</span>`).join('');el('secCandWrap').innerHTML=(CUR_FORMAT==='ebook'||CUR_FORMAT==='paper')
      ?`<div class="book-empty">말하듯 적거나 제목을 넣으면 우리 도서관 <b>${FMT_LABEL[CUR_FORMAT]}</b> 중에서 찾아드려요.<br>미소장 책은 이 형태에선 표시되지 않아요 (‘종이책 + 전자책’으로 바꾸면 함께 보여요).</div>`
      :'<div class="book-empty">말하듯 적거나 제목을 넣으면 <b>세명대 소장 책</b>과 <b>미소장 책</b>을 한 번에 찾아드려요.<br>세명대 소장 책이 위에, 미소장 책은 아래에 표시됩니다.</div>';}
  q.value='';secNote();
}
function secRenderClassics(){
  if(!CLASSICS_POOL.length){el('secCandWrap').innerHTML='<div class="book-empty">고전 목록을 불러오는 중… 잠시 후 다시 시도해주세요.</div>';loadClassicsPool();return;}
  const q=(el('secQ').value||'').trim().toLowerCase();
  let list=CLASSICS_POOL;
  if(_clsOrigin==='kr') list=list.filter(b=>b.origin!=='foreign');        // 한국 고전
  else if(_clsOrigin==='foreign') list=list.filter(b=>b.origin==='foreign'); // 서양(해외) 고전
  // 한글 제목 + 영어 제목 + 저자 모두로 검색 (한글 없는 책은 영어·저자로 폴백)
  if(q) list=list.filter(b=>((b.title_ko||'')+' '+(b.title||'')+' '+(b.author||'')).toLowerCase().includes(q));
  SCAND=list.map(b=>{
    const ko=b.title_ko||'';                              // 표시: 한글(영어). 한글 없으면 영어만
    const disp=ko||b.title;
    const sub=(b.author||'')+(b.origin==='foreign'?' · 해외 고전'+(ko?(' · '+b.title):''):' · 한국 고전');
    return {id:b.id,t:disp,a:sub,cls:true,cover:CLS_COVER[b.id]||''};   // 8/14: 후보에도 표지
  });
  if(!SCAND.length){el('secCandWrap').innerHTML='<div class="book-empty">검색 결과가 없어요.</div>';return;}
  secRenderCands('북스타 고전 '+SCAND.length+'권'+(q?(' · "'+q+'"'):''));
}
function secRenderLib(){const q=(el('secQ').value||'').trim();const list=q?LIB_BOOKS.filter(b=>(b.t+' '+b.a).includes(q)):LIB_BOOKS;SCAND=list.slice(0,40);
  if(!SCAND.length){el('secCandWrap').innerHTML='<div class="book-empty">아직 우리 도서관에 담긴 책이 없어요.<br>‘통합검색’이나 ‘ISBN 입력’으로 담으면 여기에 쌓입니다.</div>';return;}
  secRenderCands('우리 도서관 소장 '+SCAND.length+'권');}
async function secSearch(){
  if(scTab==='cls'){secRenderClassics();return;}
  if(scTab==='lib'){secRenderLib();return;}
  if(scTab==='sm'){return secSearchSemyung();}
  if(scTab==='isbn'){return secLookupISBN();}
  // ── 통합검색: 자연어/제목 → 세명대 소장 + 국중 전체 병렬 → 병합(소장 우선, 미소장 표시) ──
  const q=el('secQ').value.trim();if(!q)return;
  const fmt=CUR_FORMAT||'both';   // 8/19 책 형태: ebook=소장 전자책만 / paper=소장 종이책만 / both=기존(소장+미소장)
  el('secCandWrap').innerHTML='<div class="cur-loading">✦ '+(fmt==='ebook'?'세명대 소장 전자책을 찾는 중…':fmt==='paper'?'세명대 소장 종이책을 찾는 중…':'세명대 소장 책과 미소장 책을 함께 찾는 중…')+'</div>';
  const normT=s=>(s||'').replace(/\[[^\]]*\]/g,'').split(/[:：]/)[0].replace(/[()（）\[\]\s\-·,.]/g,'').toLowerCase();
  // 1) 세명대 소장 전자책(제목·저자 키워드) — P3: semyung_tulip (종이책만 고르면 건너뜀)
  const smP=(async()=>{ if(fmt==='paper') return []; try{
    const p='*'+encodeURIComponent(q.replace(/[(),*]/g,' ').trim())+'*';
    const r=await fetch(SB_REST+'/semyung_tulip?kind=eq.ebook&or=(title.ilike.'+p+',author.ilike.'+p+')&select=barcode,ctrl,title,author,cover_url,vendor&limit=20',{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    const d=await r.json(); return (Array.isArray(d)?d:[]).map(b=>({brcd:b.barcode||b.ctrl,title:b.title,author:b.author,cover:b.cover_url||'',provider:b.vendor||'',
      detail_url:b.barcode?('https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd='+b.barcode):''}));
  }catch(e){ return []; } })();
  // 2) 국중 전체(자연어 OK — curate+Haiku). curate가 제안한 큐레이션 제목·부제도 함께 받음(AI 큐레이션 만들기용)
  _aiCur=null;
  const natP=(async()=>{ try{
    const r=await fetch(CURATE_FN,{method:'POST',headers:{'Authorization':'Bearer '+CURATE_ANON,'apikey':CURATE_ANON,'content-type':'application/json'},body:JSON.stringify(fmt==='both'?{query:q,genTitle:true}:{query:q,genTitle:true,holdings:true,format:fmt,rerank:true})});   // 형태 지정=소장 그 형태만(서버가 강제) + 풀이 좁아 꼬리가 약해지므로 리랭크로 무관책 컷
    const d=await r.json(); if(d&&d.title) _aiCur={title:d.title,subtitle:d.subtitle||''}; return d.candidates||[];
  }catch(e){ return []; } })();
  const [sm,nat]=await Promise.all([smP,natP]);
  const smCand=sm.map(b=>({isbn:'sm-'+b.brcd,t:b.title,a:b.author||'',cover:b.cover||'',lib:b.detail_url,_sm:true,held:true,prov:b.provider||''}));
  const heldT=new Set(smCand.map(b=>normT(b.t)));
  let natCand=(nat||[]).filter(b=>!heldT.has(normT(b.title))).map(b=>({t:b.title,a:(b.author||'')+(b.publisher?' · '+b.publisher:''),isbn:b.isbn,loan:b.loan||0,cover:b.cover||'',rating:b.rating,held:false,smPaper:b.smPaper,smPaperStatus:b.smPaperStatus||'',smPaperUrl:b.smPaperUrl||'',smEbook:b.smEbook,smEbookProvider:b.smEbookProvider||'',smEbookUrl:b.smEbookUrl||''}));
  if(fmt==='ebook') natCand=natCand.filter(b=>b.smEbook);   // 클라 안전망(서버도 거름): 고른 형태가 아닌 책·미소장은 안 보임
  if(fmt==='paper') natCand=natCand.filter(b=>b.smPaper);
  SCAND=[...smCand,...natCand];   // 세명대 소장 먼저, 미소장(국중) 뒤
  if(!SCAND.length){el('secCandWrap').innerHTML='<div class="book-empty">'+(fmt==='both'?'딱 맞는 후보를 못 찾았어요. 다른 말로 검색해보세요.':`우리 도서관 <b>${FMT_LABEL[fmt]}</b> 중엔 딱 맞는 책이 없어요. 다른 말로 찾거나 형태를 ‘종이책 + 전자책’으로 바꿔보세요.`)+'</div>';return;}
  secRenderCands(fmt==='both'?`통합검색 ${SCAND.length}권 · 세명대 소장 ${smCand.length} · 미소장 ${natCand.length}`:`${FMT_LABEL[fmt]} ${SCAND.length}권 · 모두 세명대 소장`);
}
async function secSearchSemyung(){
  const raw=(el('secQ').value||'').trim();
  const q=raw.replace(/[(),*]/g,' ').trim();   // PostgREST or() 파서 보호
  if(!q){el('secCandWrap').innerHTML='<div class="book-empty">제목이나 저자를 입력해 검색하세요.</div>';return;}
  el('secCandWrap').innerHTML='<div class="cur-loading">✦ 세명대 전자도서관에서 찾는 중…</div>';
  try{
    const p='*'+encodeURIComponent(q)+'*';
    const url=SB_REST+'/semyung_tulip?kind=eq.ebook&or=(title.ilike.'+p+',author.ilike.'+p+')&select=barcode,ctrl,title,author,cover_url,vendor&limit=40';
    const r=await fetch(url,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON}});
    const d=await r.json();
    SCAND=(Array.isArray(d)?d:[]).map(b=>({isbn:'sm-'+(b.barcode||b.ctrl),t:b.title,a:b.author||'',cover:b.cover_url||'',
      lib:b.barcode?('https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd='+b.barcode):'',_sm:true,prov:b.vendor||''}));
    if(!SCAND.length){el('secCandWrap').innerHTML='<div class="book-empty">세명대 소장에서 못 찾았어요. 다른 제목으로 검색해보세요.</div>';return;}
    secRenderCands('세명대 학술정보원 전자책 '+SCAND.length+'권 · + 를 눌러 담으세요');
  }catch(e){el('secCandWrap').innerHTML='<div class="book-empty">검색 실패 — 잠시 후 다시 시도해주세요.</div>';}
}
async function secLookupISBN(){
  const raw=(el('secQ').value||'').replace(/[^0-9Xx]/g,'');
  if(raw.length<10){el('secCandWrap').innerHTML='<div class="book-empty">ISBN을 정확히 입력해주세요 (10~13자리).</div>';return;}
  el('secCandWrap').innerHTML='<div class="cur-loading">📘 ISBN으로 도서 정보를 조회하는 중…</div>';
  try{
    const r=await fetch(INFO_FN,{method:'POST',headers:{'Authorization':'Bearer '+SB_ANON,'apikey':SB_ANON,'content-type':'application/json'},body:JSON.stringify({isbns:[raw]})});
    const d=await r.json();const x=(d.info||{})[raw];
    if(!x||!x.title){el('secCandWrap').innerHTML='<div class="book-empty">해당 ISBN의 책을 찾지 못했어요.</div>';return;}
    SCAND=[{t:x.title,a:x.author||'',isbn:raw,loan:x.loan||0,cover:x.cover||'',rating:x.rating}];
    secRenderCands('조회 결과 — + 를 눌러 담으세요');
  }catch(e){el('secCandWrap').innerHTML='<div class="book-empty">조회 실패 — 잠시 후 다시 시도해주세요.</div>';}
}
// 통합검색(AI) 결과 위에 뜨는 'AI 큐레이션 통째로 만들기' 배너 — 제목·부제 + 상위 8권을 한 번에
function aiCurBanner(){
  if(scMode!=='sec'||scTab!=='nat'||!_aiCur||!_aiCur.title||!SCAND.length) return '';
  return `<div class="ai-cur-banner">
    <div class="acb-l">
      <div class="acb-k">✨ AI 큐레이션 제안</div>
      <div class="acb-t">${esc(_aiCur.title)}</div>
      ${_aiCur.subtitle?`<div class="acb-s">${esc(_aiCur.subtitle)}</div>`:''}
    </div>
    <button class="acb-btn" onclick="secMakeAICuration()">이 큐레이션으로 만들기 →</button>
  </div>`;
}
// 후보(검색결과)의 소장형태 → 저장 책 객체에 박을 형태필드(tags + 링크). 학생앱 fmtTags/모달이 그대로 사용.
function bkForm(b){
  const o={}, tags=[];
  const ebUrl=b.lib||b.smEbookUrl||'';
  if(b._sm||b.smEbook||ebUrl){ tags.push('ebook'); if(ebUrl)o.lib=ebUrl; }
  if(b.smPaper){ tags.push('paper'); if(b.smPaperUrl)o._pp=b.smPaperUrl; if(b.smPaperStatus)o.paperStatus=b.smPaperStatus; }
  if(b.crema){ tags.push('sub'); o.crema=true; if(b.cremaUrl)o.cremaUrl=b.cremaUrl; }
  if(tags.length)o.tags=tags;
  return o;
}
function secMakeAICuration(){
  if(!_aiCur) return;
  const o=pkObj(); if(!o) return;
  readSecInputs();
  // 제목·부제: 비었거나 기본값일 때만 AI 제안으로 채움(사서가 정한 제목은 보존)
  const DEF=new Set(['','새 카테고리','새 큐레이션']);
  if(DEF.has((o.title||'').trim())){ o.title=_aiCur.title; const ti=el('sec_t_'+o.slot); if(ti) ti.value=o.title; }
  if(_aiCur.subtitle && !((o.subtitle||'').trim())){ o.subtitle=_aiCur.subtitle; const si=el('sec_s_'+o.slot); if(si) si.value=o.subtitle; }
  // 상위 8권을 한 번에 담기(소장 우선 — SCAND가 이미 소장 먼저). 이미 담긴 책·중복 제외
  o.books=o.books||[]; const have=new Set(o.books.map(b=>b.isbn||b.id).filter(Boolean)); let added=0;
  for(const b of SCAND){ if(added>=8) break; const key=b.isbn||b.id; if(key&&have.has(key)) continue;
    if(b.cls||b.id){ o.books.push({id:b.id,title:b.t,author:(b.a||'').split(' · ')[0],cover:''}); }
    else if(b._sm){ o.books.push(Object.assign({isbn:b.isbn,title:b.t,author:b.a||'',cover:b.cover||'',lib:b.lib||'',_sm:true,note:''},bkForm(b))); }
    else{ o.books.push(Object.assign({isbn:b.isbn||'',title:b.t,author:b.a||'',cover:b.cover||'',note:'',held:b.held},bkForm(b))); if(b.isbn&&b.held!==false){LIB_INV.add(b.isbn);upsertInventory([b]);} }
    if(key) have.add(key); added++;
  }
  toast(`✨ AI 큐레이션 완성 — 책 ${added}권 담았어요. 미리보기를 확인하세요`);
  pvSync(); secNote(); secRenderCands(scHead);
}
