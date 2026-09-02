/* ═══════════════════════════════════════════════════════════
   통합 검색 페이지 (Ver03) — 키워드(즉시) + 자연어(별이 추천)
   ═══════════════════════════════════════════════════════════ */
// (US_*_FN·US_KEYWORD_RPC 는 js/00-config.js — 9/2 S7-4)
const US_NL_EX=["요즘 지쳐서 위로받고 싶어","오싹하고 무서운 이야기","우주와 과학이 궁금해","도서관 운영시간 알려줘","대출 몇 권까지 돼?"];
let US_MODE='kw';
let US_LAST_NL=[];

// 도서 유형 배지: 북스타 한국고전 / 북스타 해외고전 / 전자책 / 종이책
function bookTypeTag(b, kind){
  const id=b.id||'';
  if(id.indexOf('kr-')===0) return {label:'북스타 한국고전', cls:'bt-kr'};
  if(id.indexOf('gb-')===0 || /^g\d/.test(id)) return {label:'북스타 해외고전', cls:'bt-fr'};
  // tags 우선 판정(usFormBadges와 일치) — 'sm-' 접두 종이책(CATTOT)이 '전자책'으로 오표기되던 것
  if(Array.isArray(b.tags)){
    if(b.tags.includes('ebook')) return {label:'전자책', cls:'bt-eb'};
    if(b.tags.includes('paper')) return {label:'종이책', cls:'bt-pp'};
  }
  if(b._sm || (b.isbn||'').indexOf('sm-')===0 || b._smLib || b.lib) return {label:'전자책', cls:'bt-eb'};
  return {label:'종이책', cls:'bt-pp'};
}

function setSearchMode(m){
  US_MODE=m;
  document.querySelectorAll('#page-search .subtab').forEach(t=>t.classList.toggle('active', t.dataset.smode===m));
  const inp=document.getElementById('usSearchInput');
  inp.placeholder = (m==='nl')
    ? "별이에게 말하듯 물어보세요 — 예: 요즘 지쳐서 위로받고 싶어"
    : "책 제목·저자·키워드를 입력하세요";
  const chips=document.getElementById('usChips');
  chips.style.display='none';   // 예시칩은 대화 스레드 안(별이 인사)에 표시
  document.getElementById('usResults').innerHTML='';
  if(m==='nl'){
    inp.placeholder="별이에게 말하듯 답해보세요";
    usChatReset();              // 대화형 별이 시작(인사 + 예시 빠른답변)
  } else if(inp.value.trim()){
    onUnifiedSearch(false);
  }
}

// 검색 결과 카드 (고전 = openDetail / 도서관 = libDetail)
function usCard(b, kind){
  const tag=bookTypeTag(b, kind);
  if(kind==='cls'){
    return `<div class="book-card" onclick="openDetail('${b.id}')">
      <div onclick="openDetail('${b.id}')">${bookCoverHTML(b)}</div>
      <div class="book-info">
        <span class="bt-tag ${tag.cls}">${tag.label}</span>
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-author">${esc(b.author||'')}${b.category?' · '+esc(b.category):''}</div>
      </div></div>`;
  }
  const t=b.t||b.title||'', a=b.a||b.author||'';
  return `<div class="book-card" onclick="libDetail('${esc(b.isbn||'')}')">
    <div class="book-cover has-img">${lcCvHTML(b)}</div>
    <div class="book-info">
      <span class="bt-tag ${tag.cls}">${tag.label}</span>
      <div class="book-title">${esc(t)}</div>
      <div class="book-author">${esc(a)}</div>
    </div></div>`;
}

// 타이핑 디바운스(180ms) — 키스트로크마다 수백 장 카드 innerHTML 재생성하던 것 방지
let _usDebT=null;
function usDebounce(){ clearTimeout(_usDebT); _usDebT=setTimeout(()=>onUnifiedSearch(false), 180); }
function onUnifiedSearch(submit){
  clearTimeout(_usDebT);
  const inp=document.getElementById('usSearchInput');
  const box=document.getElementById('usResults');
  const q=(inp.value||'').trim();
  if(US_MODE==='nl'){
    if(!submit) return;          // 대화형은 엔터/보내기에서만 실행(타이핑마다 호출 X)
    inp.value='';
    return usChatSend(q);
  }
  // 키워드 모드 — 즉시 로컬 검색
  if(!q){ box.innerHTML=''; return; }
  const ql=q.toLowerCase();
  // 8/14 사장님 수정요청: '모비딕'처럼 붙여 써도 '모비 딕'이 나오게 — 공백 제거본으로도 비교
  const qn=ql.replace(/\s+/g,'');
  const hit=(s)=>{ s=String(s||'').toLowerCase(); return s.includes(ql) || (qn && s.replace(/\s+/g,'').includes(qn)); };
  const clsHits=BOOKS.filter(b=> hit(b.title) || hit(b.titleEn) || hit(b.author) || hit(b.category) );
  // 8/29 사장님 지적: 같은 책이 3~4장으로 — 풀에 같은 전자책이 키만 다르게(베스트 목록 brcd·장서 ctrl·ISBN) 여러 번 들어 있었다.
  //   제목(부제 앞)+저자+형태(전자책/종이책)가 같으면 한 장만 남긴다. 종이책·전자책은 서로 다른 카드로 유지.
  const _dupSeen=new Set();
  const libHits=(typeof libTitled==='function'?libTitled():[]).filter(b=>
    hit((b.t||b.title||'')+' '+(b.a||b.author||''))
  ).filter(b=>{ const k=_usDupKey(b.t||b.title,b.a||b.author,_usKindOf(b)); if(_dupSeen.has(k)) return false; _dupSeen.add(k); return true; });
  let html='';
  // 8/17 사장님 수정요청: 우리 도서관 소장이 위, 북스타 고전은 아래
  // 우리 도서관 소장 = 로컬 풀(베스트·신착·큐레이션) 즉시 표시 + 전체 장서(semyung_tulip 31.9만) 서버검색이 뒤이어 합류
  html+=`<div id="usLibSec" style="margin-bottom:28px;${libHits.length?'':'display:none;'}">
    <div class="us-section-label">🏛 우리 도서관 소장 <span id="usLibCnt" style="color:var(--text-light);font-weight:600;">${libHits.length||''}</span></div>
    <div class="book-grid us-grid" id="usLibGrid">${libHits.slice(0,24).map(b=>usCard(b,'lib')).join('')}</div>
  </div>`;
  if(clsHits.length){
    html+=`<div class="us-section-label">📚 북스타 고전 <span style="color:var(--text-light);font-weight:600;">${clsHits.length}</span></div>`;
    html+=`<div class="book-grid us-grid" style="margin-bottom:28px;">${clsHits.slice(0,24).map(b=>usCard(b,'cls')).join('')}</div>`;
    if(clsHits.length>24) html+=`<div style="text-align:center;color:var(--text-light);font-size:12.5px;margin:-16px 0 24px;">상위 24권만 표시 — 키워드를 더 구체적으로 입력해 보세요</div>`;
  }
  html+=`<div id="usNoHit" style="${(clsHits.length||libHits.length)?'display:none;':''}padding:40px;text-align:center;color:var(--text-light);">도서관 장서 검색 중…</div>`;
  box.innerHTML=html;
  usTulipSearch(q, libHits);
}

// 형태 판정(중복 제거용): tags 가 없는 풀 항목(베스트·신착 목록의 세명대 전자책)은 _sm/lib 로 전자책 취급 — fmtTags 와 같은 판정
function _usKindOf(b){ const t=b.tags||[]; if(t.includes('ebook')) return 'e'; if(t.includes('paper')) return 'p'; if(b._sm||b.lib||b._smLib||String(b.isbn||'').indexOf('sm-')===0) return 'e'; return 'x'; }
// 같은 책 판별 키: 부제(':' '/' 뒤) 떼고 공백·기호 제거한 제목 + 저자 + 형태(e 전자책/p 종이책)
function _usDupKey(title,author,kind){
  const n=s=>String(s||'').replace(/\[전자책\]/g,'').split(/\s[:/]\s|\s*:\s*|\s\/\s*/)[0].toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const a=String(author||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'').slice(0,6);
  return n(title)+'|'+a+'|'+(kind||'x');
}
// 키워드 탭 → 세명대 전체 장서(semyung_tulip) 서버 검색.
//   search_norm = 제목+저자에서 공백·기호 제거한 정규화 컬럼(gin_trgm 인덱스 있음) — 질의도 같은 규칙으로 정규화해 ilike.
let _usTulipSeq=0;
async function usTulipSearch(q, localLib){
  const seq=++_usTulipSeq;
  const norm=(q||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const els=()=>({sec:document.getElementById('usLibSec'), grid:document.getElementById('usLibGrid'), cnt:document.getElementById('usLibCnt'), no:document.getElementById('usNoHit')});
  const noHitMsg='검색 결과가 없어요. 다른 키워드로 시도하거나 ⭐별이에게 물어보세요.';
  if(norm.length<2){ const {no}=els(); if(no&&no.style.display!=='none') no.textContent=noHitMsg; return; }
  let rows=[];
  try{
    const r=await sbGet(`/semyung_tulip?select=ctrl,kind,title,author,publisher,pub_year,isbn,cover_url,viewer_url&search_norm=ilike.${encodeURIComponent('*'+norm+'*')}&limit=48`);
    if(r.ok){ const a=await r.json(); if(Array.isArray(a)) rows=a; }
  }catch(e){}
  if(seq!==_usTulipSeq) return;                        // 그 사이 새 입력 — 늦은 응답 폐기
  const seen=new Set((localLib||[]).map(b=>String(b.isbn||'')).filter(Boolean));
  // 8/29: ISBN 뿐 아니라 제목+저자+형태로도 중복 제거 — 풀의 전자책(brcd 키)과 장서 행(ctrl 키)이 같은 책인데 키가 달라 두 장으로 나오던 것
  const seenKey=new Set((localLib||[]).map(b=>_usDupKey(b.t||b.title,b.a||b.author,_usKindOf(b))));
  rows=rows.filter(t=>{ if(t.isbn && seen.has(String(t.isbn))) return false; const k=_usDupKey(t.title,t.author,t.kind==='ebook'?'e':(t.kind==='paper'?'p':'x')); if(seenKey.has(k)) return false; seenKey.add(k); return true; });
  rows.sort((x,y)=>((x.kind==='ebook')?0:1)-((y.kind==='ebook')?0:1) || (x.title||'').length-(y.title||'').length);   // 전자책 먼저, 짧은 제목(정확 일치 근접) 먼저
  const {sec,grid,cnt,no}=els();
  if(!rows.length){ if(no&&no.style.display!=='none') no.textContent=noHitMsg; return; }
  const books=rows.slice(0,24).map(t=>curateToLibBook({
    isbn:t.isbn||('sm-'+t.ctrl), title:String(t.title||'').replace(/\s*\[전자책\]\s*/g,' ').trim(),
    author:t.author||'', cover:t.cover_url||'', publisher:t.publisher||'', year:t.pub_year||'',
    smEbook:t.kind==='ebook', smPaper:t.kind==='paper',
    smEbookUrl:t.viewer_url||'', brcd:t.ctrl||''
  }));
  if(grid) grid.insertAdjacentHTML('beforeend', books.map(b=>usCard(b,'lib')).join(''));
  if(cnt) cnt.textContent=String((localLib||[]).length+rows.length)+(rows.length>=48?'+':'');
  if(sec) sec.style.display='';
  if(no) no.style.display='none';
}

// curate 후보(세명대 실소장 23,727 의미검색 결과) → 앱 공용 book 객체로 정규화 + LIB_POOL 등재
//   (libDetail/lcBorrow가 isbn으로 풀에서 찾아 줄거리·형태·읽기 경로를 표시·연결한다)
function curateToLibBook(c){
  const tags=[];
  if(c.smEbook) tags.push('ebook');
  if(c.smPaper) tags.push('paper');
  if(c.crema===true) tags.push('sub');
  const b={
    isbn:c.isbn, t:c.title||'', a:c.author||'', cover:c.cover||'',
    publisher:c.publisher||'', pubYear:c.year||'', loan:c.loan||null,
    description:c.description||'',
    // _sm = 세명대 소장 책 표식. curate/byeoli-search 전자책은 isbn을 raw isbn13로 주므로('sm-' 접두 없음)
    //   접두뿐 아니라 smEbook/smPaper로도 판정 — 안 그러면 libDetail이 loadDesc(줄거리 lazy)를 건너뛰고 출처라벨도 오표기.
    tags:tags.length?tags:undefined, _sm:((c.isbn||'').indexOf('sm-')===0 || c.smEbook===true || c.smPaper===true)||undefined,
    lib:c.smEbookUrl||'', _pp:c.smPaperUrl||'', cremaUrl:c.cremaUrl||'', brcd:c.brcd||'',
    _material:c._material||undefined
  };
  const ex=LIB_POOL.find(x=>x.isbn===b.isbn);
  if(ex) Object.assign(ex,b); else LIB_POOL.push(b);
  return b;
}
// 형태 배지(전자책/종이책/학위논문/연속간행물/비도서/구독) — 별이 추천 카드용
function usFormBadges(c){
  const out=[];
  // 통합검색 브리지 자료(종이책 단행본·학위논문 등)는 _material로 정확한 배지 표기
  if(c._material==='thesis'){ out.push('<span class="bt-tag bt-pp">학위논문</span>'); return out.join(' '); }
  if(c._material==='serial'){ out.push('<span class="bt-tag bt-pp">연속간행물</span>'); return out.join(' '); }
  if(c._material==='av'){ out.push('<span class="bt-tag bt-pp">비도서</span>'); return out.join(' '); }
  if(c.smEbook) out.push('<span class="bt-tag bt-eb">전자책</span>');
  if(c.smPaper) out.push('<span class="bt-tag bt-pp">종이책</span>');
  if(c.crema===true) out.push('<span class="bt-tag bt-sub">구독</span>');
  if(!out.length) out.push('<span class="bt-tag bt-eb">전자책</span>');
  return out.join(' ');
}

/* ── 개인화 레이어(#2) ── 북스타가 소유한 신호만 사용(학과·관심분야·내가 읽은 책).
   추천 엔진(curate)은 범용 유지하고, 개인화는 클라이언트에서 얹는다.
   ⚠️세명대 ILS 실제 대출이력은 계정 1개(데모한정)라 접근 불가 → 북스타 자체 활동으로 대체. */
function usMyProfile(){
  const s=(typeof bxStudent==='function')?bxStudent():null; if(!s) return null;
  const base=(typeof BX_STUDENTS!=='undefined'?BX_STUDENTS.find(x=>x.id===s.id):null)||{};   // 기존 로그인 객체에 dept 없을 수 있어 마스터에서 보강
  let extra={}; try{ extra=JSON.parse(localStorage.getItem('bookstar-interests-'+(s.id||''))||'{}')||{}; }catch(e){}
  const dept=extra.dept||s.dept||base.dept||'';
  const interests=(Array.isArray(extra.interests)&&extra.interests.length)?extra.interests:((s.interests||base.interests)||[]);
  const done=(typeof _doneBooks==='function')?_doneBooks():[];
  const reading=(typeof _readingBooks==='function')?_readingBooks().map(x=>x.b):[];
  const all=reading.concat(done);
  const norm=t=>String(t||'').replace(/\s+/g,'').toLowerCase();
  const readTitles=[...new Set(all.map(b=>b&&b.title).filter(Boolean))];
  const prof={name:s.name||'', dept, interests, readTitles, readNorm:readTitles.map(norm)};
  if(!dept && !interests.length && !readTitles.length) return null;   // 신호 없으면 개인화 생략
  return prof;
}
// ①이미 읽은 책 제외 ②관심·전공 키워드 매칭 책을 위로(동점 보정 — 주제적합도는 서버 리랭킹이 이미 보장)
function usPersonalize(results, prof){
  if(!prof) return {list:results, used:false, excluded:0};
  const norm=t=>String(t||'').replace(/\s+/g,'').toLowerCase();
  const kws=[...(prof.interests||[]), ...(prof.dept?[prof.dept.replace(/(학부|전공|과)$/,'')]:[])]
    .map(k=>String(k||'').trim()).filter(k=>k.length>=2);
  const before=results.length;
  let list=results.filter(b=>!prof.readNorm.includes(norm(b.title)));
  const excluded=before-list.length;
  const hit=b=>{ const hay=((b.title||'')+' '+(b.author||'')+' '+(b.kdc||'')).toLowerCase(); return kws.filter(k=>hay.includes(k.toLowerCase())).length; };
  const matched=list.filter(b=>hit(b)>0).length;
  list=list.map((b,i)=>({b,h:hit(b),i})).sort((x,y)=>y.h-x.h||x.i-y.i).map(x=>x.b);   // 안정 정렬(매칭 없으면 원순서 유지)
  return {list, used:(excluded>0 || matched>0), excluded, matched};   // 실제 변화가 있을 때만 used
}

/* ── 대화형 별이 ── 사서 빌더와 같은 curate chat 모드 재사용(의도 수렴).
   철학: 턴 제한 없음, 기본은 바로 추천(ready=true). 정말 모호할 때만 질문 1개 + 빠른답변 칩.
   메시지 종류: {role,content} 일반 / {role:'assistant',kind:'cards',cards,subtitle} 추천결과 / chips 첨부 */
let US_CHAT=[];
let US_CHAT_BUSY=false;

function usChatReset(){
  const prof=usMyProfile();
  const hi=(prof&&prof.name)
    ? `안녕하세요, ${prof.name}님 ⭐ 별이예요.${prof.dept?' '+prof.dept+'시죠?':''} 책 추천부터 도서관 운영시간·대출·시설 안내까지 뭐든 물어보세요.`
    : '안녕하세요, 별이예요 ⭐ 책 추천부터 도서관 운영시간·대출·시설 안내까지, 뭐든 편하게 물어보세요.';
  US_CHAT=[{role:'assistant', content:hi, chips:US_NL_EX.slice()}];
  US_CHAT_BUSY=false;
  usChatRender();
}

// 추천 결과 카드 그리드(클릭 → libDetail 상세; 카드 안에서 바로 읽기/예약 = #1 in-chat 완결)
// ── Answer Engine 답변 버블(인용 [n]을 카드로 점프하는 칩으로 치환) ──
// 별이가 '우리 소장 자료만 근거로' 합성한 답. [n]→해당 책 카드로 스크롤+하이라이트. 환각0(서버가 목록 번호로만 인용).
function usAnswerHTML(answer){
  if(!answer || !answer.used || !answer.text) return '';
  // 번호 인용·칩 폐지(가독성) — 주제 요약 문단만. [n] 잔재가 있어도 제거. 책 목록은 바로 아래 카드가 담당.
  const html=esc(answer.text).replace(/\s*\[\d+\]/g,'');
  return `<div class="usc-answer"><div class="usc-answer-h">별이의 답</div><div class="usc-answer-t">${html}</div></div>`;
}
// 논문 표지 대체(학술자료는 표지 이미지 없음) — 문서 라인 아이콘 플레이스홀더
const PAPER_COVER='<div class="paper-cover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg></div>';
// 별이 결과의 북스타 고전 카드(추천 v2, 8/18) — 자체 본문이라 항상 "지금 바로 읽기". 클릭=openDetail(id) (도서관 상세 아님)
function usClassicCardHTML(b){
  const id=String(b.isbn||'').replace(/'/g,'');
  const bk=(typeof BOOKS!=='undefined')?BOOKS.find(x=>x.id===id):null;
  const cover=(bk&&bk.coverSrc)?`<img src="${esc(bk.coverSrc)}" loading="lazy" decoding="async" onerror="this.style.display='none'">`:(b.cover?`<img src="${esc(b.cover)}" loading="lazy" decoding="async" onerror="this.style.display='none'">`:ncCover(bk||{title:b.title,author:b.author}));
  const genre=(b._classic&&b._classic.genre)||(bk&&(bk.litGenre||bk.category))||'';
  return `<div class="book-card bc-book" data-isbn="${esc(id)}" onclick="byeoliClickLog(US_CLICKMAP['${esc(id)}']);openDetail('${esc(id)}')">
      <div class="book-cover has-img">${cover}</div>
      <div class="book-info">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;"><span class="bt-tag bt-eb">북스타 고전</span>${genre?`<span class="hwc-loan">${esc(genre)}</span>`:''}</div>
        <div class="book-title">${escD(b.title)}</div>
        <div class="book-author">${escD([b.author,(b.year||'')].filter(Boolean).join(' · '))}</div>
        <button class="usc-act" onclick="event.stopPropagation();openDetail('${esc(id)}')">지금 바로 읽기</button>
      </div></div>`;
}
function usCardsHTML(results){
  return `<div class="book-grid">`+results.map(b=>{
    if(b._kind==='classic') return usClassicCardHTML(b);
    const isbn=String(b.isbn||'').replace(/'/g,'');
    // 인라인 액션: 묻기→읽기를 대화 안에서 한 탭으로(카드 본문 클릭은 상세 모달, 버튼은 stopPropagation)
    let act='';
    if(b.smEbook && b._avail===false){
      // 추천 v2(8/18): 서버가 재고를 확인해 '대출 중'으로 판정한 전자책 — 헛된 대출 시도 대신 상세(예약 CTA·대체 추천)로 보낸다
      act=`<button class="usc-act ghost" onclick="event.stopPropagation();libDetail('${esc(isbn)}')">대출 중 · 예약하기</button>`;
    } else if(b.smEbook){
      act=`<button class="usc-act" onclick="event.stopPropagation();lcBorrow('${esc(isbn)}')">${b._avail===true?'지금 바로 읽기':'바로 읽기'}</button>`;
    } else if(b.crema===true){
      act=`<a class="usc-act" href="${esc(cremaHref(b.cremaUrl||'', b.title||''))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">크레마클럽에서 읽기 · 앱 필요</a>`;
    } else if(b.smPaper){
      act=`<button class="usc-act ghost" onclick="event.stopPropagation();libDetail('${esc(isbn)}')">소장·예약 보기</button>`;
    }
    return `<div class="book-card ${(b._material==='thesis'||b._material==='serial')?'bc-paper':'bc-book'}" data-isbn="${esc(isbn)}" onclick="byeoliClickLog(US_CLICKMAP['${esc(isbn)}']);libDetail('${esc(isbn)}')">
      <div class="book-cover${b.cover?' has-img':''}">${b.cover?`<img src="${esc(b.cover)}" loading="lazy" decoding="async" data-t="${esc(cleanT(b.title||''))}" data-a="${esc(String(b.author||''))}" onerror="ncSwap(this)">`:ncCover(b)}</div>
      <div class="book-info">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">${usFormBadges(b)}${b.loan?`<span class="hwc-loan">대출 <b>${Number(b.loan).toLocaleString()}</b></span>`:''}</div>
        <div class="book-title">${escD(b.title)}</div>
        <div class="book-author">${escD([b.author,b.publisher,(b.year||b.pubYear)].filter(Boolean).join(' · '))}</div>
        ${act}
      </div></div>`;
  }).join('')+`</div>`;
}

function usChatRender(){
  const box=document.getElementById('usResults');
  if(!box) return;
  const rows=US_CHAT.map(m=>{
    if(m.kind==='cards'){
      const sub=m.subtitle?`<div class="usc-bubble usc-sub">${esc(m.subtitle)}</div>`:'';
      const note=m.note?`<div class="usc-pnote">✨ ${esc(m.note)}</div>`:'';
      const ans=usAnswerHTML(m.answer);
      return `<div class="usc-row star"><div class="usc-av">⭐</div><div class="usc-cards">${ans}<div class="usc-cards-h">⭐ 별이의 추천 <span>${m.cards.length}</span></div>${note}${sub}${usCardsHTML(m.cards)}</div></div>`;
    }
    if(m.role==='user') return `<div class="usc-row user"><div class="usc-bubble">${esc(m.content)}</div></div>`;
    const linkBtn=m.link?`<a class="usc-link" href="${esc(m.link)}" target="_blank" rel="noopener">📄 ${esc(m.linkLabel||'자세히 보기')}<span style="opacity:.6">›</span></a>`:'';
    return `<div class="usc-row star"><div class="usc-av">⭐</div><div style="min-width:0;max-width:78%"><div class="usc-bubble" style="max-width:100%">${mdLite(m.content)}</div>${linkBtn}</div></div>`;
  }).join('');
  const typing=US_CHAT_BUSY?`<div class="usc-row star"><div class="usc-av">⭐</div><div class="usc-bubble usc-typing"><span></span><span></span><span></span></div></div>`:'';
  const last=US_CHAT[US_CHAT.length-1];
  const chips=(!US_CHAT_BUSY && last && last.role==='assistant' && Array.isArray(last.chips) && last.chips.length)
    ? `<div class="usc-chips">${last.chips.map(c=>`<span class="usc-chip" onclick="usChatSend(${JSON.stringify(String(c)).replace(/"/g,'&quot;')})">${esc(c)}</span>`).join('')}</div>` : '';
  box.innerHTML=`<div class="usc-thread">${rows}${typing}${chips}</div>`;
  // 새로 추가된 추천 카드만 한 권씩 차례로 나타나게(이미 본 카드는 즉시 표시 — 재렌더 시 재애니메이션 방지)
  const lastCards=[...US_CHAT].reverse().find(m=>m.kind==='cards');
  const th=box.querySelector('.usc-thread');
  if(lastCards && !lastCards._revealed){
    lastCards._revealed=true;
    const grids=box.querySelectorAll('.book-grid');
    // 카드는 한 장씩 등장하며 그 카드로 화면을 따라 내려가게(한꺼번에 쑥 내려가지 않도록 즉시 스크롤은 생략)
    byeoliStagger(grids[grids.length-1], el=>{ if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'}); });
  } else if(th){
    const k=th.lastElementChild; if(k&&k.scrollIntoView) k.scrollIntoView({block:'nearest'});
  }
}

// 카드를 한 장씩 '톡, 톡' 추가하듯 순차 등장 — 처음엔 display:none으로 자리도 없이 숨겼다가
// 하나씩 칸이 생기며 떠오르게(진짜 한 권씩 나타나는 느낌). onStep마다 새 카드로 화면을 따라 스크롤.
function byeoliStagger(grid, onStep){
  if(!grid) return;
  const cards=[...grid.children];
  cards.forEach(el=>{ el.style.display='none'; el.style.opacity='0'; el.style.transform='translateY(14px)'; });
  const STEP=460;   // 카드 간격(ms) — 느긋하게 한 장씩
  cards.forEach((el,i)=>{
    setTimeout(()=>{
      el.style.display='';
      void el.offsetWidth;   // 리플로우 강제 → 트랜지션 발동
      el.style.transition='opacity .5s ease, transform .5s ease';
      el.style.opacity='1';
      el.style.transform='none';
      if(typeof onStep==='function') onStep(el);
    }, i*STEP);
  });
}

// 사용자 메시지 전송 → 별이 두뇌(library-brain)가 의도 라우팅:
//   info(운영정보)·other(잡담) → 별이가 KB로 바로 답 / books → ready면 추천 생성, 모호하면 되묻기
async function usChatSend(text){
  text=(text||'').trim();
  if(!text || US_CHAT_BUSY) return;
  US_CHAT.push({role:'user', content:text});
  US_CHAT_BUSY=true; usChatRender();
  try{
    const hist=US_CHAT.filter(m=>!m.kind).map(m=>({role:m.role, content:m.content}));
    const r=await sbFnPost(US_BRAIN_FN,{messages:hist},{anon:true});
    const d=await r.json();
    US_CHAT_BUSY=false;
    if(d.intent==='books' && d.ready!==false){
      // 책 의도 확정 → 짧은 확인 후 세명대 실소장 추천 생성
      US_CHAT.push({role:'assistant', content:d.reply||'좋아요, 골라볼게요 ✨'});
      await usChatRecommend(byeoliTopicOf(d.refinedTopic, text), '', text);   // text = 학생이 친 말 그대로(다듬은 주제로 못 찾을 때 재검색용)
      return;
    }
    // 운영정보 답변 / 잡담 안내 / 책 의도지만 모호(되묻기) → 별이 답변 + (운영정보면)도서관 링크 + 빠른답변 칩
    US_CHAT.push({role:'assistant', content:d.reply||'무엇을 도와드릴까요?', chips:Array.isArray(d.chips)?d.chips:[], link:d.link||'', linkLabel:d.linkLabel||''});
    byeoliLog({surface:'main',query:text,intent:d.intent||'',ready:d.ready,refined_topic:d.refinedTopic||'',kb_link:d.link||''});
    usChatRender();
  }catch(e){
    US_CHAT_BUSY=false;
    US_CHAT.push({role:'assistant', content:'잠시 문제가 생겼어요. 다시 한 번 말씀해 주세요.'});
    usChatRender();
  }
}

// 확정된 주제로 세명대 실소장 추천 생성(무거운 호출) → 카드 메시지로 스레드에 추가
// 통합검색 브리지 후보(종이책/논문)를 curate 후보 형태로 정규화 → 동일 카드/풀/소장 파이프라인 재사용.
//   isbn='sm-'+CATTOT키 → libDetail이 reckey=CATTOT로 인식해 loadHolding(소장/예약) 경로로 분기.
function findToCand(c){
  return {
    isbn:'sm-'+c.key, title:c.title||'', author:c.author||'', publisher:c.publisher||'',
    cover:c.cover||'', year:'', loan:null, description:c.description||'',
    smEbook:false, smEbookUrl:'', smEbookProvider:'',
    smPaper:true, smPaperStatus:'', smPaperUrl:c.detailUrl||('https://lib.semyung.ac.kr/search/detail/'+c.key),
    crema:false, cremaUrl:'', brcd:c.key,
    _material:c.material||'book', sim:c.similarity,
  };
}
async function usChatRecommend(topic, subtitleHint, rawWords){
  US_CHAT_BUSY=true; usChatRender();
  try{
    // 통합 책검색(전자책 curate + 종이/논문 find + 하이브리드 키워드) — 플로팅 위젯과 동일 엔진
    const fr=await byeoliFindBooks(topic, 'main', true, rawWords);
    US_CHAT_BUSY=false;
    if(fr.offtopic){
      US_CHAT.push({role:'assistant', content:fr.message||'책 주제를 조금 더 구체적으로 말씀해 주세요.'});
      usChatRender(); return;
    }
    if(!fr.results.length){
      US_CHAT.push({role:'assistant', content: fr.error
        ? '연결이 잠깐 불안정했어요. 잠시 후 다시 시도해 주세요.'
        : '아쉽지만 그 주제에 딱 맞는 책을 우리 도서관에서 못 찾았어요. 조금 다르게 말해볼까요?'});
      usChatRender(); return;
    }
    US_CHAT.push({role:'assistant', kind:'cards', cards:fr.results, subtitle:fr.subtitle||subtitleHint||'', note:fr.note||'', answer:fr.answer||null});
    usChatRender();
  }catch(e){
    US_CHAT_BUSY=false;
    US_CHAT.push({role:'assistant', content:'책을 고르다 문제가 생겼어요. 다시 시도해 주세요.'});
    usChatRender();
  }
}

// ── 별이 통합 책검색(메인 nl챗 + 플로팅 위젯 공용) ──
// curate(세명대 전자책 23,727 의미검색·리랭킹) + semyung-find(종이책/논문/비도서 85,609) 병렬 병합
// → 제목 dedup → 개인화(읽은책 제외·관심 위로) → LIB_POOL 등재(libDetail/lcBorrow가 isbn으로 찾음).
// 반환 {offtopic, message?, results, subtitle}. results는 curate 후보 형태(usFormBadges/libDetail 호환).
// 별이 질의 로그(fire-and-forget) — 약한/실패 질의 수집·분석용(byeoli_query_logs). 실패해도 UX 무영향.
function byeoliLog(o){
  try{
    sbWrite('POST','/byeoli_query_logs',o,{anon:true,prefer:'return=minimal'}).catch(()=>{});
  }catch(e){}
}
let US_CLICKMAP={};   // isbn→후보(현 검색결과). 카드 클릭 시 byeoliClickLog가 위치·소스·eventId 참조
// ── 별이 통합 책검색: 백엔드 단일 엔진(byeoli-search) 호출 ──
// 5소스 병렬호출 + RRF 융합 + 측정훅은 모두 서버(byeoli-search)가 수행. 클라는 호출 + 개인화 + 렌더만.
// (구 *ToCand 매퍼·인라인 병합 로직은 서버로 이전됨. findToCand 등은 호환 위해 남겨둠 = 죽은 코드)
// 개인화(학과·관심·읽은책)는 북스타 로컬 신호라 클라에 유지 — 서버 RRF 위에 얹는다.
// 9/1 사장님 지적('오디세이' 통합검색 48권 vs 별이 0건)의 진짜 원인:
//   별이 두뇌가 학생이 친 말 뒤에 짐작을 덧붙인다 — '오디세이' → '오디세이 - 고전 서사시' / '오디세이 - SF 소설'.
//   그 덧붙임이 제목 검색을 통째로 빗나가게 한다(실측: 덧붙이면 0~1건, 그대로 찾으면 4건 + 오디세이아·오디세이 1·2·3).
//   ▸ 덧붙이기만 한 것(학생 말로 시작)이면 → 학생 말 그대로 찾는다.
//   ▸ 말을 통째로 바꿔 준 것('위로받고 싶은 날 읽을 책' → '위로와 공감, 감정 치유 소설/에세이')은 검색에 도움이 되므로 그대로 쓴다.
function byeoliTopicOf(refined, text){
  const t=String(text||'').trim(), r=String(refined||'').trim();
  if(!r) return t;
  if(!t) return r;
  return (r!==t && r.indexOf(t)===0) ? t : r;
}
// 서버 호출 1회 — 원 응답을 그대로 돌려준다(네트워크/서버 실패는 null).
async function _byeoliSearchOnce(topic, surface, wantAnswer){
  let d=null;
  // 서버가 8~17s 걸리므로 멈춤(stall) 대비 30s 타임아웃/취소 — 없으면 busy 락이 안 풀려 로딩 점이 영원히 돈다.
  const ac=(typeof AbortController!=='undefined')?new AbortController():null;
  const to=ac?setTimeout(()=>{try{ac.abort();}catch(_){}} ,30000):null;
  try{
    // answer는 표시되는 표면에서만 요청(팔로업 등은 끔=불필요한 +3~4s Haiku 콜 절약). 기본 true.
    const r=await sbFnPost(US_SEARCH_FN,{query:topic, surface:surface||'api', count:12, config:{answer: wantAnswer!==false}},{anon:true, signal:ac?ac.signal:undefined});
    if(!r.ok) throw new Error('HTTP '+r.status);
    d=await r.json();
  }catch(e){ d=null; }
  finally{ if(to) clearTimeout(to); }
  return d;
}
// rawWords = 학생이 실제로 친 말. 별이 두뇌가 다듬은 주제로 못 찾으면 이 말 그대로 한 번 더 찾는다.
async function byeoliFindBooks(topic, surface, wantAnswer, rawWords){
  let d=await _byeoliSearchOnce(topic, surface, wantAnswer);
  // 9/1 사장님 지적: 통합검색에서 '오디세이'는 48권인데 별이는 0건이었다.
  //   두뇌가 '오디세이'를 '오디세이 - SF 소설'로 바꿔 보내면 제목 검색이 통째로 빗나간다(실측: 0건).
  //   제목·단어로 찾아 달라는 책은 반드시 보여야 하므로, 빈손이면 학생이 친 말 그대로 다시 찾는다.
  const _raw=String(rawWords||'').trim();
  if(_raw && _raw!==String(topic||'').trim() && (!d || d.offtopic || !((d.results||[]).length))){
    const d2=await _byeoliSearchOnce(_raw, surface, wantAnswer);
    if(d2 && !d2.offtopic && (d2.results||[]).length){ d=d2; topic=_raw; }
  }
  // 네트워크/서버 실패는 '못 찾았어요'(정상 무결과)와 구분해 error 플래그로 반환
  if(!d){ return {offtopic:false, error:true, results:[], subtitle:''}; }
  if(d.offtopic){ byeoliLog({surface:surface||'',query:topic,intent:'books',offtopic:true,result_count:0}); return {offtopic:true, message:d.message||'', results:[]}; }
  let results=(d.results||[]).filter(b=>b&&b.isbn&&b.title);
  // 측정훅(클릭 로깅용): 이 검색의 eventId/위치/소스를 후보에 부착
  const evId=(d.meta&&d.meta.eventId)||null;
  results.forEach((b,i)=>{ b._eventId=evId; b._pos=i; b._q=topic; b._surface=surface||''; });
  // 개인화(클라 신호) — 이미 읽은 책 제외 + 관심·전공 매칭 위로
  const prof=usMyProfile(); const pz=usPersonalize(results, prof);
  const pzAdopted=pz.list.length>0;            // 개인화 결과가 비면(전부 이미읽음 등) 원본 유지 → note도 안 붙임
  if(pzAdopted) results=pz.list;
  const note=(prof && pz.used && pzAdopted && (prof.dept||prof.interests.length))
    ? `${prof.name||'회원'}님${prof.dept?'('+prof.dept+')':''} 취향을 반영했어요`+(pz.excluded>0?` · 이미 읽은 ${pz.excluded}권 제외`:'')
    : '';
  // LIB_POOL 등재(libDetail/lcBorrow가 isbn으로 찾음). 논문 검색 제거(2026-07-02)로 결과는 책만.
  results.forEach(b=>{ if(b._kind!=='classic') curateToLibBook(b); });   // 북스타 고전(_kind classic)은 BOOKS/openDetail 경로 — 도서관 풀에 안 넣는다
  results.forEach((b,i)=>{ if(b&&b.isbn){ b._pos=i; US_CLICKMAP[String(b.isbn).replace(/'/g,'')]=b; } });   // 클릭 로깅 참조용(표시순 위치)
  // Answer — 서버는 {used,text}만 반환(cited 폐지). 혹시 남은 [n] 인용표식만 제거하고 본문 있으면 채택.
  let answer=(d.answer&&d.answer.used)?d.answer:null;
  if(answer){
    const atext=String(answer.text||'').replace(/\s*\[\d+\]/g,'').trim();
    answer = atext ? {...answer, text:atext} : null;
  }
  byeoliLog({surface:surface||'',query:topic,intent:'books',ready:true,refined_topic:topic,result_count:results.length,top_titles:results.slice(0,3).map(b=>b.title||'')});
  return {offtopic:false, results, subtitle:d.subtitle||'', note, answer};
}
// 측정훅 ② 클릭 로깅 — 어떤 결과를 눌렀나(위치·소스별 CTR=리랭킹 신호 + 영업지표). 실패해도 UX 무영향.
function byeoliClickLog(b){
  try{
    if(!b) return;
    sbWrite('POST','/byeoli_search_clicks',
      {event_id:b._eventId||null, surface:b._surface||'', query:b._q||'', isbn:b.isbn||'', title:b.title||'', position:(typeof b._pos==='number'?b._pos:null), source:b._source||'', kind:b._kind||''},
      {anon:true,prefer:'return=minimal'}).catch(()=>{});
  }catch(e){}
}

