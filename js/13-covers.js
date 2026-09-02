/* ═══ 표지 없는 책 = 활자 표지(A안) ═══════════════════════════════════
   ncCover(b) 하나로 앱 전체의 '표지 없음' 자리를 통일한다. 호출부는 크기를 몰라도 된다(CSS cqw가 처리).
   b는 화면마다 모양이 달라서(t/title, a/author, pubYear/pub_year…) 방어적으로 읽는다. */
const NC_PAL=['#55606f','#5d4e8e','#7b5a3d','#2d6183','#2f6b55','#7a6531','#8a4560','#256f74','#8d4034','#4d5570'];
function ncShade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  const cl=v=>Math.max(0,Math.min(255,v));
  const r=cl((n>>16)+amt), g=cl(((n>>8)&255)+amt), b=cl((n&255)+amt);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
/* 색: 청구기호(KDC) 첫 자리가 있으면 주제색, 없으면 제목 해시.
   ※ 지금 대부분의 화면은 class_no를 안 실어와 해시로 떨어진다(색은 고르게 흩어짐).
     검색 RPC·Edge Fn에 class_no를 추가하면 자동으로 주제색으로 승격된다. */
function ncColor(b){
  const c=String((b&&(b.class_no||b.call_no||b.callNo))||'').trim();
  if(/^[0-9]/.test(c)) return NC_PAL[+c[0]];
  const s=String((b&&(b.t||b.title))||'')+'|'+String((b&&(b.a||b.author))||'');
  let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return NC_PAL[h%NC_PAL.length];
}
/* 서지 표기 잡음 제거 + 부제 분리. cleanT()는 '-'에서도 자르기 때문에 표지엔 쓰지 않는다. */
function ncSplit(t){
  let s=decEnt(String(t||'')).replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
  let sub='';
  const eq=s.indexOf(' = ');                       // ' = ' 뒤는 원제(영문)
  if(eq>0){ sub=s.slice(eq+3).trim(); s=s.slice(0,eq).trim(); }
  const co=s.indexOf(' : ');                       // ' : ' 뒤는 부제
  if(co>0){ sub=s.slice(co+3).trim()+(sub?' / '+sub:''); s=s.slice(0,co).trim(); }
  s=s.replace(/\s*[\/:,.]\s*$/,'').trim();
  return {main:s||decEnt(String(t||'')).trim(),sub:sub};
}
function ncLenClass(n){ return n<=6?'l1':n<=10?'l2':n<=16?'l3':n<=26?'l4':n<=40?'l5':'l6'; }
function ncCover(b){
  b=b||{};
  const {main,sub}=ncSplit(b.t||b.title||'');
  const col=ncColor(b);
  const au=authName(b);
  const pub=String(b.publisher||'').trim();
  const yr=String(b.pubYear||b.pub_year||b.year||'').trim().slice(0,4);
  const foot=[pub,yr].filter(Boolean).join(' · ');
  const bg=`linear-gradient(157deg,${ncShade(col,22)},${col} 58%,${ncShade(col,-20)})`;
  return `<div class="nc-a ${ncLenClass(main.length)}" style="background:${bg}">`
    + `<div><div class="nc-t">${escD(main)}</div>`
    + (sub?`<div class="nc-s">${escD(sub)}</div>`:'')
    + `</div>`
    + ((au||foot)?`<div class="nc-f">${au?`<b>${escD(au)}</b>`:''}${foot?`<i>${escD(foot)}</i>`:''}</div>`:'')
    + `</div>`;
}
/* ── 표지 로딩 공용 체인 (8/14 사장님 "버그 없이 빨리 뜨게") ─────────────────
   ① 종이책(sm-CATTOT…)은 자체 미러(Storage 600px WEBP, 18.8만 장) 우선 — 외부 핫링크보다 빠르고 차단 위험 0
      8/16 전자책도 미러 우선(sm-<barcode> → covers/<barcode>.webp, 2.3만 장 별칭) — 세명대 전자도서관이 표지 파일을
      지우면(자존감 수업 404 실측) 같이 잃던 핫링크 의존 제거. 로컬키(sm-EB…)·순수 ISBN은 미러 조립 불가 → ②로.
   ② 실패하면 원 표지(네이버/알라딘/세명대) → 고화질 → 원본 순으로 재시도
   ③ 전부 실패하면 활자 표지(ncCover)로 — 예전엔 this.remove()로 빈칸이 남았다(알려진 버그 수리) */
const CV_MIRROR='https://gkujptyfrzqrjrvovbnc.supabase.co/storage/v1/object/public/covers/';
function ncSwap(img){
  try{
    const host=img.parentNode;
    if(host&&host.classList) host.classList.remove('has-img');
    img.outerHTML=ncCover({t:img.dataset.t||'',a:img.dataset.a||''});
  }catch(e){ try{ img.remove(); }catch(_){} }
}
function cvErr(img){
  try{
    const alts=JSON.parse(img.dataset.alt||'[]');
    if(alts.length){ img.dataset.alt=JSON.stringify(alts.slice(1)); img.src=alts[0]; return; }
  }catch(e){}
  ncSwap(img);
}
function lcCvHTML(b){
  const cv=_gbCover(b);
  const key=String((b&&b.isbn)||'');
  const m=key.match(/^sm-CATTOT(\d+)$/);
  const e=!m&&key.match(/^sm-(?!EB)([0-9A-Za-z_-]+)$/);   // 전자책 barcode (sm-EB<ctrl>는 로컬 임시키 — 미러 없음)
  const srcs=[];
  if(m) srcs.push(CV_MIRROR+m[1]+'.webp');
  else if(e) srcs.push(CV_MIRROR+e[1]+'.webp');
  if(cv){ const hi=hiCover(cv); srcs.push(hi); if(hi!==cv) srcs.push(cv); }
  if(!srcs.length) return ncCover(b);
  const t=esc(cleanT(b.t||b.title||'')), a=esc(String(b.a||b.author||''));
  return `<img src="${esc(srcs[0])}" data-alt="${esc(JSON.stringify(srcs.slice(1)))}" data-t="${t}" data-a="${a}" loading="lazy" decoding="async" onerror="cvErr(this)">`;
}
let LIB_POOL=[];
const LIB_SAMPLE=['9788936434267','9791161571188','9791165341909','9791188862290','9788936434120','9788998441012','9788936434595','9788937473401'];
// [데모] 도서관 통합검색 딥링크 — 세명대학교 학술정보원. 책 상세의 "도서관에서 빌리기" 클릭 시 실제 lib.semyung.ac.kr 통합검색(소장자료+예스24+학술DB)으로 바로 이동
const LIB_LINK_BASE='https://lib.semyung.ac.kr/searchTotal/result?st=KWRD&si=TOTAL&q=';
const semyungLink=(title)=>LIB_LINK_BASE+encodeURIComponent(title);
// (8/29 데모 계정(00003251) 헤일메리 상수 삭제 — 실제 학생에게 남의 계정 뷰어가 열리던 링크)
// 세명대학교 학술정보원 실제 소장 소설 — 대출순 베스트(전자도서관 contentList loanNmvl). brcd로 상세 딥링크.
const SM_LBRY=20213;
const smDetail=(brcd)=>`https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=${SM_LBRY}&brcd=${brcd}`;
// 구독(크레마) — C(딥링크): 그 책의 크레마클럽 페이지를 새 탭으로 엶.
// 학생 본인 YES24 세션에서 페이지가 열리고, 거기서 '바로읽기/내서재 추가' → 본인 뷰어로 읽기.
// ※ 무인증·학생마다 자기 계정으로 작동(일반화 가능). 북스타는 책 주소만 알면 됨.
// ※ cremaUrl: 정확한 책번호(goodsNo) 또는 Detail URL이 있으면 그 책으로, 없으면 제목 검색 폴백.
// ※ YES24 구조상 웹 리더 없음 + 특정책 자동펼침 불가라, "크레마 페이지로 보내기"가 천장(스킴/토큰 방식은 데모 1계정 한정이라 폐기).
const CREMA_BASE='https://cremaclub.yes24.com';
function cremaHref(cremaUrl, title){
  if(cremaUrl && /^https?:\/\//.test(cremaUrl)) return cremaUrl;                 // 전체 Detail URL
  if(cremaUrl && /^\d+$/.test(cremaUrl)) return CREMA_BASE+'/BookClub/Detail/'+cremaUrl; // 책번호만
  return CREMA_BASE+'/BookClub/Search?query='+encodeURIComponent(title||'');     // 제목 검색 폴백
}
const smCover=(p)=>'https:'+p;
const SEMYUNG_BEST=[
  {brcd:'4808954682152',t:'작별하지 않는다',a:'한강',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808954682152/L4808954682152.jpg',note:'노벨문학상 한강의 장편'},
  {brcd:'4801190090019',t:'우리가 빛의 속도로 갈 수 없다면',a:'김초엽',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4801190090019/L4801190090019.jpg',note:'한국 SF의 새 얼굴'},
  {brcd:'4808954622035',t:'살인자의 기억법',a:'김영하',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808954622035/L4808954622035.jpg'},
  {brcd:'4808954646079',t:'바깥은 여름',a:'김애란',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808954646079/L4808954646079.jpg'},
  {brcd:'4808954681179',t:'밝은 밤',a:'최은영',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808954681179/L4808954681179.jpg'},
  {brcd:'4808972753698',t:'용의자 X의 헌신',a:'히가시노 게이고',cv:'//image.aladin.co.kr/product/11649/82/cover200/8990982707_1.jpg'},
  {brcd:'4470894',t:'고래',a:'천명관',cv:'//ebook.semyung.ac.kr/upload/20213/content/DRMContent/YES24/bookimg/4289284.jpg'},
  {brcd:'4808982814471',t:'연금술사',a:'파울로 코엘료',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808982814471/L4808982814471.jpg'},
  {brcd:'11951396',t:'미 비포 유',a:'조조 모예스',cv:'//ebook.semyung.ac.kr/upload/20213/content/DRMContent/YES24/bookimg/M_201658.jpg'},
  {brcd:'4808954640756',t:'너무 한낮의 연애',a:'김금희',cv:'//ebook.semyung.ac.kr/upload/20213/content/ebook/4808954640756/L4808954640756.jpg'},
].map(b=>({isbn:'sm-'+b.brcd,t:b.t,a:b.a,cover:smCover(b.cv),note:b.note||'',lib:smDetail(b.brcd),_sm:true}));
// 세명대 전자도서관 라이브 — semyung-best Edge Function(?kind=best|new)이 bestContent/newContent 프록시·파싱. 로드 전엔 null.
let SEMYUNG_BEST_LIVE=null, SEMYUNG_NEW_LIVE=null, SEMYUNG_LOANRANK=null, SEMYUNG_NEW_E=null, SEMYUNG_NEW_P=null;
function _smMap(list){ return list.map(b=>({isbn:'sm-'+b.brcd,t:b.title,a:b.author,cover:b.cover||'',publisher:b.publisher||'',lib:b.detail||smDetail(b.brcd),_sm:true,rank:b.rank,pubDate:b.pubDate||''})); }
async function _smFetch(kind){
  try{
    const r=await sbFn(SMBEST_FN,{kind},{anon:true});   // kind 는 best/new 뿐이라 인코딩해도 같음
    if(!r.ok) return null;
    const d=await r.json(); const l=(d&&d.books)||[];
    return l.length?_smMap(l):null;
  }catch(e){ return null; }
}
// 신착 = semyung_tulip(공식 openapi 전수, tulip_sync.py --daily가 매일 갱신). P3에서 semyung_new 대체.
// 전자책·종이책을 각각 별도 줄로 표시(SEMYUNG_NEW_E / SEMYUNG_NEW_P). 각자 등록일(reg_date) 최신순.
function _smMapNew(b,tag){
  const brcd = tag==='ebook' ? (b.barcode||'') : ('CATTOT'+b.ctrl);
  const detail = tag==='ebook'
    ? (b.barcode ? smDetail(b.barcode) : '')
    : 'https://lib.semyung.ac.kr/search/detail/CATTOT'+b.ctrl;
  const title=(b.title||'').replace(/\s*\[전자책\]\s*/g,' ').replace(/\s+/g,' ').trim();
  const o={isbn:'sm-'+(brcd||('EB'+b.ctrl)),t:title,a:b.author,cover:b.cover_url||'',publisher:b.publisher||'',
    _sm:true,pubDate:b.reg_date||b.pub_year||'',tags:[tag],lib:detail,description:''};
  if(tag==='ebook') o._eb=detail; else o._pp=detail;
  return o;
}
async function _smNewTable(){
  try{
    const SEL='select=ctrl,kind,barcode,title,author,publisher,pub_year,reg_date,cover_url,isbn';
    // 2차 정렬 pub_year — 전자책은 몇 달치를 한 번에 등록해서(5/26 107권 등) 뭉텅이 안 순서가
    // ctrl(등록 일련번호) 임의순이 된다. 발행연도 내림차순을 끼우면 뭉텅이 안에서 최신 발행이 앞.
    const q=k=>sbGetAnon(`/semyung_tulip?${SEL}&kind=eq.${k}&order=reg_date.desc,pub_year.desc.nullslast,ctrl.desc&limit=200`)
      .then(r=>r.ok?r.json():[]).catch(()=>[]);
    const [eb,pp]=await Promise.all([q('ebook'),q('paper')]);
    if((!Array.isArray(eb)||!eb.length)&&(!Array.isArray(pp)||!pp.length)) return null;
    SEMYUNG_NEW_E=(eb||[]).map(b=>_smMapNew(b,'ebook'));
    SEMYUNG_NEW_P=(pp||[]).map(b=>_smMapNew(b,'paper'));
    return SEMYUNG_NEW_P.concat(SEMYUNG_NEW_E);   // 통합(검색풀 병합용)
  }catch(e){ return null; }
}
// 우리 학교 대출 랭킹 = 종이책 실대출(OPAC popularloanList, 최근1년, 대출횟수 있음). scripts/build_semyung_loan_rank.py 갱신.
async function _smLoanRank(){
  try{
    const r=await sbGetAnon(`/semyung_loan_rank?select=rank,title,author,publisher,pub_year,loan_count,cover,detail,brcd,prev_rank,description&order=rank&limit=20`);
    if(!r.ok) return null;
    const rows=await r.json(); if(!Array.isArray(rows)||!rows.length) return null;
    return rows.map(b=>({isbn:'sm-'+b.brcd,t:b.title,a:b.author,cover:b.cover||'',publisher:b.publisher||'',
      lib:b.detail||'',_sm:true,rank:b.rank,loan:b.loan_count,prevRank:(b.prev_rank==null?null:b.prev_rank),pubYear:b.pub_year||'',description:b.description||'',tags:['paper']}));
  }catch(e){ return null; }
}
// 세명대 책 보강 캐시(줄거리·출판사·연도·장르) — scripts/enrich_semyung.mjs가 빌드. 모달에서 brcd로 조회.
let SM_ENRICH={};
// 표지 안전망 — 세명대 표지가 placeholder(준비중 GIF)인 책만 알라딘 실표지로 교체. brcd 키. scripts/build_cover_overrides.py가 빌드.
let COVER_OVR={};
// 큐레이션 그리드 재렌더 rAF 코얼레싱 — 초기 로드에 5개 비동기(enrich/best/serverPub/backfill/폴백)가
// 각자 grid.innerHTML=millieHTML()을 불러 3~5회 전면 재구축·깜빡이던 것을 프레임당 1회로 합침
let _gridRaf=null;
function scheduleGridRender(withBackfill){
  if(withBackfill) scheduleGridRender._bf=true;
  if(_gridRaf) return;
  _gridRaf=requestAnimationFrame(()=>{
    _gridRaf=null;
    const g=document.getElementById('libCurationGrid'); if(!g) return;
    rebuildLibPool(); g.innerHTML=millieHTML(); try{mlBindDrag();}catch(e){}
    if(scheduleGridRender._bf){ scheduleGridRender._bf=false; try{backfillPool();}catch(e){} }
  });
}
async function loadSemyungEnrich(){
  try{ const r=await fetch('./books/cover_overrides.json?t='+Date.now()); if(r.ok) COVER_OVR=await r.json(); }catch(e){}
  try{ const r=await fetch('./books/semyung_enrich.json?t='+Date.now()); if(r.ok) SM_ENRICH=await r.json(); }catch(e){ SM_ENRICH={}; }
  // 보강 로드 후 목록 재렌더 → 형태 태그 반영
  try{ const g=document.getElementById('libCurationGrid'); if(g&&g.innerHTML.trim()) scheduleGridRender(); }catch(e){}
}
async function loadSemyungBest(){
  loadSemyungEnrich();   // 보강 캐시 병행 로드(모달용)
  const [best,nw,lr]=await Promise.all([_smFetch('best'),_smNewTable().then(v=>v||_smFetch('new')),_smLoanRank()]);
  if(best) SEMYUNG_BEST_LIVE=best;
  if(nw) SEMYUNG_NEW_LIVE=nw;
  if(lr) SEMYUNG_LOANRANK=lr;
  if(best||nw||lr) scheduleGridRender();
}
const ML_GRADS=[['#1f9b8e','#15756b'],['#d99a1a','#b07c10'],['#1f8fb0','#15708c'],['#5b6bd6','#3f4db0'],['#4f9e57','#3a7d42']];
const ML_DARK=[['#5a3b8c','#34215c'],['#9c2f63','#5e1c3c'],['#1f4f7a','#13314e'],['#1d6b5a','#103f34'],['#6b357a','#3f1f4a']];
function cleanT(t){const s=(t||'').split(/\s*[:\-(]/)[0].trim();return s||t||'';}
function cleanA(a){let s=(a||'').replace(/지은이\s*:?/g,'').replace(/\((지은이|그림|옮긴이|글)\)/g,'').replace(/\s(지음|글|옮김)\b/g,'');return (s.split(/[,·\/]/)[0]||'').trim();}
// 풍부 저자줄: 빈 괄호 제거 + 출판사. (전체 적용 — 출판사는 backfillPool이 ISBN으로 백필)
function authName(b){return (cleanA(b.a||b.author||'')).replace(/\(\s*\)/g,'').trim();}   // 저자만(빈 괄호 제거)
function authorRich(b){const a=authName(b);return b.publisher?`${a} · ${b.publisher}`:a;}      // 저자 · 출판사
function authorLine(b){return authorRich(b);}
// 보유 형태 태그(전자책/종이책/구독) — SM_ENRICH(brcd 키)로 조회. 목록 카드에 노출.
function fmtTags(b){
  if(!b) return '';
  // 신착(semyung_new)은 명시적 tags 배열(전자책/종이책)을 가짐 — 우선 사용
  if(b.tags&&b.tags.length){
    const M={ebook:'전자책',paper:'종이책',sub:'구독',cls:'고전 · 바로 읽기'};
    return `<div class="fmt-tags">${b.tags.map(k=>`<span class="fmt-tag fmt-${k}">${M[k]||k}</span>`).join('')}</div>`;
  }
  const isbn=b.isbn||'';
  const t=[];
  if(b._sm && isbn){
    const en=(typeof SM_ENRICH!=='undefined')?SM_ENRICH[isbn.replace(/^sm-/,'')]:null;
    if(b.lib) t.push(['전자책','ebook']);
    if(en&&en.paper) t.push(['종이책','paper']);
    if(en&&en.crema) t.push(['구독','sub']);
  }
  // 폴백: tags·deeplink·enrich 정보가 없어도 책 정체(isbn)로 형태 추정 → 배지 누락 방지.
  //   semyung_tulip: 숫자 brcd(barcode)=전자책 / CATTOT{ctrl}=종이책.
  if(!t.length){
    if(/^sm-CATTOT/i.test(isbn) || b._material) t.push(['종이책','paper']);
    else if(/^sm-/.test(isbn) || b._sm || b.lib || b._smLib) t.push(['전자책','ebook']);
  }
  return t.length?`<div class="fmt-tags">${t.map(x=>`<span class="fmt-tag fmt-${x[1]}">${x[0]}</span>`).join('')}</div>`:'';
}
function firstSent(d){if(!d)return '';const s=d.replace(/\s+/g,' ').replace(/([.!?。])\s/g,'$1').split('')[0].trim();return s.length>44?s.slice(0,44)+'…':s;}   // 8/29 lookbehind 제거 — 구형 iOS(16.3 이하)에서 스크립트 전체가 죽던 원인
function mlcv(cls,b){return `<div class="${cls}">${lcCvHTML(b)}</div>`;}   /* 표지 없으면 lcCvHTML이 ncCover(활자 표지)를 넣는다 — 뒤에 깔던 단색 배경 불필요 */
function mlHead(t,s){return `<div class="ml-head"><div><div class="ml-h-t">${esc(t)}</div>${s?`<div class="ml-h-s">${esc(s)}</div>`:''}</div></div>`;}/* 2026-06-21: 제목 옆 장식용 › (ml-h-x) 삭제 — 기능 없이 떠 있어 어색 */
/* 8/29 안내 카드 — 사서가 적은 글을 그대로 보여준다(줄바꿈 유지). 본문 속 주소는 자동으로 누를 수 있게 바뀐다.
   먼저 esc()로 전부 막은 뒤 주소만 링크로 되살리므로, 사서가 무엇을 적어도 화면이 깨지거나 스크립트가 끼어들 수 없다. */
function mlNoticeBody(text){
  return esc(String(text||'')).replace(/https?:\/\/[^\s<]+[^\s<.,)\]}"']/g,
    u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
function mlNotice(t,s){
  const body=mlNoticeBody(s);
  return `<div class="ml-nt">${t?`<div class="ml-nt-t">${esc(t)}</div>`:''}${body?`<div class="ml-nt-b">${body}</div>`:''}</div>`;
}
function mlCarousel(rowHTML){return `<div class="ml-car"><button class="ml-arrow ml-arrow-l" onclick="mlCar(this,-1)">‹</button>${rowHTML}<button class="ml-arrow ml-arrow-r" onclick="mlCar(this,1)">›</button></div>`;}
function mlCar(btn,dir){const row=btn.parentNode.querySelector('.ml-hrow');if(!row)return;const amt=Math.max(row.clientWidth*0.85,240);const max=row.scrollWidth-row.clientWidth;if(dir>0&&row.scrollLeft>=max-4){row.scrollTo({left:0,behavior:'smooth'});}else if(dir<0&&row.scrollLeft<=4){row.scrollTo({left:max,behavior:'smooth'});}else{row.scrollBy({left:dir*amt,behavior:'smooth'});}}
// 캐러셀 폭을 카드 개수 딱 맞게(마지막 책이 반쯤 잘려 보이지 않게) — 카드폭·간격은 실측(줄마다 다름: 130px/150px 등)
function fitMlCars(){
  // 모바일: 줄 폭은 화면 그대로 두고, 대신 카드 폭을 줄여 화면에 딱 떨어지게 한다
  //   (8/31 사용자: "오른쪽에 표지가 짤리지 않게") — 마지막 책이 반쯤 걸치던 것을 없앤다
  if(window.matchMedia('(max-width:760px)').matches){
    document.querySelectorAll('.ml-car').forEach(el=>{ el.style.width=''; });
    document.querySelectorAll('.ml-hrow').forEach(row=>{
      const kid=row.firstElementChild; if(!kid) return;
      // 표지 카드 줄만 대상 (장르·질문·인용 같은 넓은 카드 줄은 그대로 둔다)
      if(!(kid.classList.contains('ml-bk')||kid.classList.contains('cl-card')||kid.classList.contains('ml-nw'))){
        row.style.removeProperty('--mlcw'); return;
      }
      row.style.removeProperty('--mlcw');          // 원래 설계 폭으로 되돌린 뒤 재기 (계산이 계산을 먹지 않게)
      const base=kid.getBoundingClientRect().width; if(!base) return;
      const cs=getComputedStyle(row);
      const gap=parseFloat(cs.columnGap)||14;
      const avail=row.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      if(!avail) return;
      const n=Math.max(2, Math.round((avail+gap)/(base+gap)));
      row.style.setProperty('--mlcw', ((avail-(n-1)*gap)/n).toFixed(2)+'px');
    });
    return;
  }
  document.querySelectorAll('.ml-hrow').forEach(row=>row.style.removeProperty('--mlcw'));
  document.querySelectorAll('.ml-car').forEach(el=>{
    const hrow=el.querySelector('.ml-hrow'); if(!hrow||!hrow.children.length) return;
    const parent=el.parentElement; if(!parent) return;
    const avail=parent.clientWidth; if(!avail) return;
    const cardW=hrow.children[0].getBoundingClientRect().width; if(!cardW) return;
    const hs=getComputedStyle(hrow);
    const gap=parseFloat(hs.columnGap)||18;
    // 줄 자체의 좌우 여백까지 더해야 마지막 카드가 4px쯤 잘리지 않는다
    const pad=(parseFloat(hs.paddingLeft)||0)+(parseFloat(hs.paddingRight)||0);
    const n=Math.max(1, Math.floor((avail-pad+gap)/(cardW+gap)));
    el.style.width=Math.min(n*cardW+(n-1)*gap+pad, avail)+'px';
  });
}
let _fitMlT=null;
function _fitMlSoon(){ clearTimeout(_fitMlT); _fitMlT=setTimeout(fitMlCars, 80); }
window.addEventListener('resize', _fitMlSoon);
new MutationObserver(_fitMlSoon).observe(document.body, {childList:true, subtree:true});
document.querySelector('.main')?.addEventListener('transitionend', e=>{ if(e.propertyName==='padding-left') _fitMlSoon(); });
// ── 캐러셀 드래그 스크롤 (클릭 안전 + 누수 없음) ──
// setPointerCapture 미사용(click 타깃이 row로 바뀌어 카드 onclick이 안 불림).
// move/up은 document에 단 1회만 바인딩 → 캐러셀 밖에서 떼도 down이 안 끼고,
// hover 중 moved가 쌓여 클릭이 막히는 문제 없음.
let _dragRow=null, _dragSX=0, _dragSL=0, _dragMoved=0;
function _initDragOnce(){
  if(window.__dragInit) return; window.__dragInit=true;
  document.addEventListener('pointermove',e=>{
    if(!_dragRow) return;
    const dx=e.clientX-_dragSX; if(Math.abs(dx)>_dragMoved)_dragMoved=Math.abs(dx);
    _dragRow.scrollLeft=_dragSL-dx;
  });
  const stop=()=>{ if(_dragRow){_dragRow.classList.remove('grabbing'); _dragRow=null;} };
  document.addEventListener('pointerup',stop);
  document.addEventListener('pointercancel',stop);
}
function bindDragScroll(sel){
  _initDragOnce();
  document.querySelectorAll(sel).forEach(row=>{
    if(row.__dragBound) return; row.__dragBound=true;
    row.addEventListener('pointerdown',e=>{ if(e.button!=null&&e.button!==0)return; _dragRow=row;_dragMoved=0;_dragSX=e.clientX;_dragSL=row.scrollLeft;row.classList.add('grabbing'); });
    row.addEventListener('click',e=>{ if(_dragMoved>8){ e.stopPropagation(); e.preventDefault(); } },true);
  });
}
function mlBindDrag(){ bindDragScroll('#libCurationGrid .ml-hrow, #collectionCuration .ml-hrow, #intlCuration .ml-hrow'); }
function libTitled(){return LIB_POOL.filter(b=>b.t);}
function libPick(n,off){const p=libTitled();if(!p.length)return [];const r=[];for(let i=0;i<n;i++)r.push(p[(off+i)%p.length]);return r;}
// 고전 큐레이션용 — 책이 곧 우리 고전(BOOKS)
function isCls(b){ return !!(b&&b.id&&(b.id.indexOf('kr-')===0||b.id.indexOf('gb-')===0)); }
function clOf(b){ return (typeof BOOKS!=='undefined'&&BOOKS.find(x=>x.id===b.id))||{id:b.id,title:b.t||b.title||'',author:b.a||b.author||''}; }
function classicPick(n,off){ if(typeof BOOKS==='undefined')return []; const p=BOOKS.filter(b=>b.locale==='modern'); if(!p.length)return []; const r=[]; for(let i=0;i<n;i++){const b=p[((off||0)+i)%p.length]; r.push({id:b.id,t:b.title,a:b.author,cls:true});} return r; }
// 책장 히어로 (3D 세워진 책 + 선반) — 공용
function mlShelf(b,note,cur,title){
  const cls=isCls(b);
  const face = cls ? bookCoverHTML(clOf(b))
    : (b.cover ? `<div class="book-cover has-img"><img src="${esc(hiCover(b.cover))}" alt="" decoding="async" data-t="${esc(cleanT(b.t||b.title||''))}" data-a="${esc(String(b.a||b.author||''))}" onerror="ncSwap(this)"></div>`
    : `<div class="book-cover">${ncCover(b)}</div>`);
  const bookT = esc(cls?clOf(b).title:cleanT(b.t||b.title||'추천 도서'));
  const bookA = esc(cls?(clOf(b).author||''):authorRich(b));
  const checks=[];
  if(!cls && b.rating!=null) checks.push(`★ ${b.rating}`);
  if(!cls && b.loan) checks.push(`대출 ${Number(b.loan).toLocaleString()}회`);
  const click = cls?`openDetail('${b.id}')`:`libDetail('${esc(b.isbn||'')}')`;
  return `<div class="shelf-hero"><div class="sh-grid">
    <div class="sh-left">
      <div class="sh-kicker">✦ ${esc(title||'오늘의 사서 추천')}</div>
      <div class="sh-title">${bookT}</div>
      <div class="sh-sub">${bookA}</div>
      ${note?`<div class="sh-quote">“${esc(note)}”<span> — 사서</span></div>`:''}
      ${checks.length?`<div class="sh-meta">${checks.map(c=>`<span>${esc(c)}</span>`).join('')}</div>`:''}
      <button class="sh-btn" onclick="${click}">자세히 보기 →</button>
    </div>
    <div class="sh-stage">
      <div class="sh-side">${esc(title||'사서 추천')}</div>
      <div class="sh-shadow"></div>
      <div class="book3d" onclick="${click}">${face}</div>
      <div class="shelf"></div>
    </div>
  </div></div>`;
}
function mlRow(t,s,books){return `<div>${mlHead(t,s)}${mlCarousel(`<div class="ml-hrow">${books.map(b=>isCls(b)?clCard(clOf(b),{krLang:_clLang}):`<div class="ml-bk" onclick="libDetail('${b.isbn}')">${mlcv('ml-bk-cv',b)}<div class="ml-bk-t">${esc(cleanT(b.t))}</div><div class="ml-bk-a">${esc(authorLine(b))}</div>${fmtTags(b)}${b.rating!=null?`<div class="ml-bk-r"><span class="lc-star">★</span> ${b.rating}</div>`:''}</div>`).join('')}</div>`)}</div>`;}
const ML_CATS=['종합','소설','경제/경영','자기계발','에세이/시','인문/교양','취미/실용','어린이/청소년','매거진'];
const ML_CHG=['▲ 3','▲ 9','NEW','▼ 2','▲ 5','—','▲ 14','▼ 1','▲ 4','▼ 8','▲ 2','NEW'];
function mlChip(el){el.parentNode.querySelectorAll('.ml-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
function chgBadge(i){const v=ML_CHG[i%ML_CHG.length];const cls=v[0]==='▲'?'ml-up':v[0]==='▼'?'ml-down':v==='NEW'?'ml-new':'ml-flat';return `<div class="ml-rkc-chg ${cls}">${v}</div>`;}
function mlRank(t,s,books,live){
  const today=new Date().toLocaleDateString('ko-KR').replace(/\s/g,'').replace(/\.$/,'');
  // isLoan = 종이책 실대출(횟수 있음). live = 세명대 전자도서관 실데이터. 둘 다 카테고리칩·가짜배지 제거.
  const isLoan = !!(books[0] && books[0].loan!=null);
  const sub = isLoan?'우리 학교에서 가장 많이 빌린 책 · 최근 6개월' : (live?'세명대 전자도서관에서 많이 빌린 책':s);
  const chips=(live||isLoan)?'':`<div class="ml-chips">${ML_CATS.map((c,i)=>`<span class="ml-chip${i===0?' on':''}" onclick="mlChip(this)">${esc(c)}</span>`).join('')}</div>`;
  const bar=isLoan
    ? `<div class="ml-rkbar"><span class="ml-rkbar-l">세명대학교 학술정보원 · 종이책 대출</span></div>`
    : live
    ? `<div class="ml-rkbar"><span class="ml-rkbar-l">세명대학교 학술정보원 전자도서관</span></div>`
    : `<div class="ml-rkbar"><span class="ml-rkbar-l">일간 ▾</span></div>`;   /* 8/14 사장님 지시: 우측 '최근 6개월'·'날짜 기준' 캡션 제거 */
  return `<div>${mlHead(t,sub)}
    ${chips}
    ${bar}
    <div class="ml-rgrid">${books.map((b,i)=>`<div class="ml-rkc" onclick="libDetail('${b.isbn}')"><div class="ml-rkc-n"><div class="ml-rkc-num">${i+1}</div>${(isLoan||live)?'':chgBadge(i)}</div>${mlcv('ml-rkc-cv',b)}<div class="ml-rkc-i"><div class="ml-rkc-t">${esc(cleanT(b.t))}</div><div class="ml-rkc-a">${esc(authorLine(b))}</div>${fmtTags(b)}</div></div>`).join('')}</div></div>`;}
function mlGrad(t,s,books){return `<div>${mlHead(t,s)}${mlCarousel(`<div class="ml-hrow">${books.map((b,i)=>{const g=ML_GRADS[i%ML_GRADS.length];return `<div class="ml-gc" style="background:linear-gradient(160deg,${g[0]},${g[1]})" onclick="libDetail('${b.isbn}')"><div class="ml-gc-k">감상 Point</div><div class="ml-gc-h">${esc(firstSent(b.description)||cleanT(b.t))}</div>${mlcv('ml-gc-cv',b)}<div class="ml-gc-f">${esc(cleanT(b.t))} · 15분 요약</div></div>`;}).join('')}</div>`)}</div>`;}
function mlAI(t,s,books){return `<div>${mlHead(t,s)}${mlCarousel(`<div class="ml-hrow">${books.map((b,i)=>{const g=ML_DARK[i%ML_DARK.length];return `<div class="ml-ac" style="background:linear-gradient(160deg,${g[0]},${g[1]})"><div class="ml-ac-k">✦ 이 책의 질문</div><div class="ml-ac-h">${esc(firstSent(b.description)||cleanT(b.t))}</div>${mlcv('ml-ac-cv',b)}<button class="ml-ac-btn" onclick="nav('airec')">🤖 AI와 함께 읽기</button></div>`;}).join('')}</div>`)}</div>`;}
// 표지 그리드(서가)
// 9/1 사장님 지적: 표지 아래에 전자책·종이책이 안 보였다 — 다른 선반(mlRow·mlRank·mlNew)과 같이 fmtTags를 붙인다.
//   "지금 바로 읽을 수 있나"는 학생이 표지 다음으로 궁금해하는 것이라 디자인보다 앞선다.
function mlGrid(t,s,books){return `<div>${mlHead(t,s)}<div class="ml-grid">${books.map(b=>isCls(b)?clCard(clOf(b),{krLang:_clLang}):`<div class="ml-gd" onclick="libDetail('${b.isbn}')">${mlcv('ml-gd-cv',b)}<div class="ml-gd-t">${esc(cleanT(b.t))}</div>${fmtTags(b)}</div>`).join('')}</div></div>`;}
// 매거진 — 9/1 사장님 요청: EDITOR'S PICK → LIBRARY PICK(고른 주체는 편집자가 아니라 우리 도서관)
function mlMag(t,s,books){return `<div>${mlHead(t,s)}${books.slice(0,3).map((b,i)=>`<div class="ml-mg" onclick="libDetail('${b.isbn}')">${mlcv('ml-mg-cv',b)}<div class="ml-mg-x"><div class="ml-mg-k">LIBRARY PICK</div><div class="ml-mg-h">${esc(cleanT(b.t))}</div><div class="ml-mg-d">${esc(firstSent(b.description)||'')} ${esc(authorRich(b))}</div>${fmtTags(b)}</div></div>`).join('')}</div>`;}
// 와이드 띠배너(대표 1권)
function mlBanner(t,s,books){const b=books[0]||{};return `<div>${mlHead(t,s)}<div class="ml-bn" onclick="libDetail('${b.isbn}')">${mlcv('ml-bn-cv',b)}<div class="ml-bn-x"><div class="ml-bn-k">BOOK OF THE MONTH</div><div class="ml-bn-h">${esc(firstSent(b.description)||cleanT(b.t))}</div><div class="ml-bn-a">${esc(cleanT(b.t))} · ${esc(authorRich(b))}</div></div></div></div>`;}
// 신간 입고
function mlNew(t,s,books){return `<div>${mlHead(t,s)}${mlCarousel(`<div class="ml-hrow">${books.map(b=>{
    const click=b.cls?`openDetail('${esc(b.id)}')`:`libDetail('${b.isbn}')`;   // 고전(cls)은 isbn 없음 → openDetail(id)로
    return `<div class="ml-nw" onclick="${click}"><span class="ml-nw-b">NEW</span>${mlcv('ml-nw-cv',b)}<div class="ml-bk-t">${esc(cleanT(b.t))}</div><div class="ml-bk-a">${esc(authorLine(b))}</div>${fmtTags(b)}</div>`;
  }).join('')}</div>`)}</div>`;}
// 책 속 한 문장
function mlQuote(t,s,books){return `<div>${mlHead(t,s)}${mlCarousel(`<div class="ml-hrow">${books.map(b=>`<div class="ml-qc"><div class="ml-qc-m">“</div><div class="ml-qc-q">${esc(firstSent(b.description)||cleanT(b.t))}</div><div class="ml-qc-f" onclick="libDetail('${b.isbn}')">${mlcv('ml-qc-cv',b)}<div class="ml-qc-a">${esc(cleanT(b.t))} · ${esc(authorRich(b))}</div></div></div>`).join('')}</div>`)}</div>`;}
// 스와이프 카드(틴더형)
function mlSwipe(t,s,books){const b=books[0]||{};return `<div>${mlHead(t,s)}<div class="ml-sw-wrap"><div class="ml-sw" onclick="libDetail('${b.isbn}')"><div class="ml-sw-cv">${lcCvHTML(b)}<div class="ml-sw-ov"><div class="ml-sw-t">${esc(cleanT(b.t))}</div></div></div><div class="ml-sw-b"><div class="ml-sw-d">${esc(firstSent(b.description)||'')} ${esc(cleanA(b.a))}</div><div class="ml-sw-a"><div class="x">✕ 다음</div><div class="o">♥ 읽을래요</div></div></div></div><div class="ml-sw-hint">한 권씩 넘기며 빠르게 골라요</div></div></div>`;}
// 테마 컬렉션(한 칸 = 한 묶음)
function mlColl(t,s,books){const cv=books.slice(0,5),first=books[0]||{};return `<div>${mlHead(t,s)}<div class="ml-cl" onclick="libDetail('${first.isbn}')"><div class="ml-cl-cvs">${cv.map(b=>mlcv('ml-cl-cv',b)).join('')}</div><span class="ml-cl-n">${books.length}권 묶음 →</span></div></div>`;}
// 특정 카테고리(slot)로 발행된 큐레이션의 책들 (pool에서 표지·별점 보강)
function booksForSlot(slot){
  const out=[],seen=new Set();
  LC_PUB.forEach(c=>{ const locs=(c.location||'').split(',').filter(Boolean); if(!locs.includes(slot))return;
    (c.books||[]).forEach(b=>{ const key=b.isbn||b.t; if(!key||seen.has(key))return; seen.add(key);
      const p=(b.isbn&&LIB_POOL.find(x=>x.isbn===b.isbn))||b; if(p&&(p.t||p.title))out.push(p); }); });
  return out;
}
function millieHTML(secs,classicMode){
  secs=secs||SECTIONS;
  const P=libTitled();
  if(!P.length && !classicMode) return '<div style="text-align:center;color:var(--text-light);font-size:13.5px;padding:60px 0">불러오는 중…</div>';
  const cur=LC_PUB[0];
  const life=(cur&&(cur.books||[])[0]&&cur.books[0].t)?cur.books[0]:(P[0]||{});
  const note=life.note||(cur&&cur.intro)||'';
  // 종이책 대출 랭킹(횟수+변동). 전자책 인기는 ebookrank 줄에서 별도 표시.
  const liveRank=(SEMYUNG_LOANRANK&&SEMYUNG_LOANRANK.length)?SEMYUNG_LOANRANK.slice(0,12):null;
  const rank=liveRank||[...P].sort((a,b)=>(b.loan||0)-(a.loan||0)).slice(0,12);
  // 측정 출처: 칸(slot)마다 display:contents 래퍼로 감싸 클릭 시 '어느 큐레이션에서 열었나'를 남긴다(bxEvent origin). 빈 래퍼는 상자가 없어 간격에 영향 없음.
  let out='<div class="bx-org">';
  secs.forEach((s,i)=>{
    const st=s.style||'row';
    out+='</div><div class="bx-org" data-origin="'+((st==='rank'||st==='ebookrank')?'ranking':'curation')+'" data-origin-id="'+esc(String(s.slot||''))+'">';
    if(s.visible===false) return;   // 사서가 '노출 끄기' 한 고정 칸은 우리 도서관에 안 보임
    if(st==='notice'){ out+=mlNotice(s.title,s.subtitle); return; }   // 8/29 안내 카드 — 책을 담지 않는 글 전용 칸(공지·행사 안내)
    if(st==='rank'){ if(liveRank) out+=mlRank(s.title,s.subtitle,rank,true); return; }   // 종이책 대출 랭킹(횟수+변동). 실데이터 없으면 칸 자체를 안 그림(8/29 — 전엔 가짜 순위·▲배지가 나갔다)
    if(st==='ebookrank'){ if(SEMYUNG_BEST_LIVE&&SEMYUNG_BEST_LIVE.length) out+=mlRank(s.title,s.subtitle,SEMYUNG_BEST_LIVE.slice(0,12),true); return; }   // 전자책 인기(순위만, 전자도서관)
    if(st==='newlive_p'){ const nb=(SEMYUNG_NEW_P&&SEMYUNG_NEW_P.length)?SEMYUNG_NEW_P:(SEMYUNG_NEW_LIVE||[]).filter(b=>b.tags&&b.tags.includes('paper')); if(nb.length) out+=mlNew(s.title,s.subtitle,nb.slice(0,80)); return; }   // 종이책 신착(입고순)
    if(st==='newlive_e'){ const nb=(SEMYUNG_NEW_E&&SEMYUNG_NEW_E.length)?SEMYUNG_NEW_E:(SEMYUNG_NEW_LIVE||[]).filter(b=>b.tags&&b.tags.includes('ebook')); if(nb.length) out+=mlNew(s.title,s.subtitle,nb.slice(0,80)); return; }   // 전자책 신착(발행일순)
    if(st==='newlive'){ let nb=(SEMYUNG_NEW_LIVE&&SEMYUNG_NEW_LIVE.length)?SEMYUNG_NEW_LIVE:(booksForSection(s).length?booksForSection(s):booksForSlot(s.slot)); if(nb.length) out+=mlNew(s.title,s.subtitle,nb.slice(0,80)); return; }   // (구) 통합 신착 — 폴백
    const own=booksForSection(s);                                     // 꾸미기로 이 칸에 담은 책(우선)
    const assigned=own.length?own:booksForSlot(s.slot);               // 없으면 발행 프로그램(챌린지)
    if(st==='hero'){
      const hc=LC_PUB.find(c=>(c.location||'').split(',').includes(s.slot));
      // 설명: 사서가 이 칸에 적은 부제(s.subtitle)가 최우선. 사서가 책을 담은 칸은 그 칸 부제만 사용(비면 기본문).
      // 미설정 칸만 슬롯 배정 큐레이션 소개를 허용. 첫 챌린지 소개문을 무단으로 끌어다 쓰지 않음.
      const heroNote = own.length ? (s.subtitle||'') : (s.subtitle || (hc&&hc.intro) || '');
      out+=mlShelf(assigned[0]||(classicMode?classicPick(1,i)[0]:life), heroNote, hc||cur, s.title); return;
    }
    // '사서가 주목한 책'(우리도서관 row): 사서가 꾸미기로 담은 책이 최우선(8/29 수리 — 전엔 데모 11권 고정이라 사서가 바꿔도 안 변했다).
    //   담은 책이 없을 때만 세명대 실소장 소설 목록(SEMYUNG_BEST)으로 채운다. 데모 계정 링크가 박힌 헤일메리는 뺐다.
    if(s.slot==='row'&&!classicMode){
      const pick=assigned.length?assigned:SEMYUNG_BEST.map(b=>LIB_POOL.find(x=>x.isbn===b.isbn)||b).filter(Boolean);
      out+=mlRow(s.title, s.subtitle||'', pick); return;
    }
    const books=assigned.length?assigned:(classicMode?classicPick(10,i*4+2):libPick(8,i*3+2)); // 둘 다 없으면 폴백(고전영역=우리 고전)
    if(st==='grad') out+=mlGrad(s.title,s.subtitle,books);
    else if(st==='ai') out+=mlAI(s.title,s.subtitle,books);
    else if(st==='grid') out+=mlGrid(s.title,s.subtitle,books);
    else if(st==='mag') out+=mlMag(s.title,s.subtitle,books);
    else if(st==='banner') out+=mlBanner(s.title,s.subtitle,books);
    else if(st==='new') out+=mlNew(s.title,s.subtitle,books);
    else if(st==='quote') out+=mlQuote(s.title,s.subtitle,books);
    else if(st==='swipe') out+=mlSwipe(s.title,s.subtitle,books);
    else if(st==='coll') out+=mlColl(s.title,s.subtitle,books);
    else out+=mlRow(s.title,s.subtitle,books);
  });
  return `<div class="ml">${out}</div></div>`;   // 마지막 bx-org 래퍼 닫기 + .ml 닫기
}
// (SB_REST 는 js/00-config.js — 9/2 S7-4)

