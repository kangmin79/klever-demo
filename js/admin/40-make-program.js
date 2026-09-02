/* ====== 프로그램 만들기 ====== */
// curate 함수 주소·anon 키 → ../js/00-config.js 의 US_CURATE_FN·COVER_ANON 공유 (9/2 S8-3 — 값이 같았다)
const DEMO_CAND=[{t:'소년이 온다',a:'한강 · 창비',isbn:'9788936434120',loan:2313},{t:'모순',a:'양귀자 · 쓰다',isbn:'9788998441012',loan:2103},{t:'채식주의자',a:'한강 · 창비',isbn:'9788936434595',loan:1416},{t:'급류',a:'정대건 · 민음사',isbn:'9788937473401',loan:1469}];
const CLASSICS=[{t:'돈키호테',a:'세르반테스',loan:0},{t:'햄릿',a:'셰익스피어',loan:0},{t:'로빈슨 크루소',a:'대니얼 디포',loan:0},{t:'군주론',a:'마키아벨리',loan:0},{t:'국부론',a:'애덤 스미스',loan:0},{t:'위대한 개츠비',a:'피츠제럴드',loan:0},{t:'1984',a:'조지 오웰',loan:0},{t:'변신',a:'프란츠 카프카',loan:0},{t:'노인과 바다',a:'헤밍웨이',loan:0},{t:'데미안',a:'헤르만 헤세',loan:0}];
const EX_HOLD=['6월 신입생 가볍게 읽을 문학','시험 끝, 머리 식히는 책','요즘 많이 읽는 한국소설','심리학 입문'];
const EX_CLASSIC=['삶의 지혜를 주는 고전','처음 읽는 서양 고전','짧고 강한 고전 명작'];
// INFO_FN(bookinfo) → ../js/00-config.js 공유 (값 동일)
let MK={type:null,books:[],mission:{quiz:false,quizN:5,review:false,question:false},loc:[]};
let CHALLENGES=[],ORIG_CHAL_IDS=[];   // 챌린지 카테고리 목록(우리도서관 칸과 유사 구조)
let LIB_INV=new Set();        // 우리 도서관 소장 ISBN 집합
let LIB_BOOKS=[];             // 소장 도서 목록(도서관 내 탭)
async function loadInventory(){
  try{
    const r=await sbGetAnon(`/library_books?select=isbn,title,author,cover,rating,loan&order=added_at.desc`);
    if(!r.ok)return; const rows=await r.json(); if(!Array.isArray(rows))return;
    LIB_BOOKS=rows.map(x=>({t:x.title,a:x.author||'',isbn:x.isbn,cover:x.cover||'',rating:x.rating,loan:x.loan||0}));
    LIB_INV=new Set(LIB_BOOKS.map(b=>b.isbn));
  }catch(e){}
}
async function upsertInventory(books){
  const rows=books.filter(b=>b.isbn).map(b=>({school:'한국대학교',isbn:b.isbn,title:b.t||b.title||'',author:b.a||b.author||'',cover:b.cover||'',rating:(b.rating!=null?b.rating:null),loan:(b.loan||null)}));
  if(!rows.length)return;
  try{ const r=await adminSave({op:'books_upsert',rows}); if(r.ok) rows.forEach(x=>LIB_INV.add(x.isbn)); }catch(e){}
}

// 위치 칩은 제목을 보여주되 slot(고정 ID)을 저장 → 카테고리 이름 바꿔도 연결 유지
function locLabel(x){const s=SECTIONS.find(v=>v.slot===x);return s?s.title:x;}
function buildLoc(){el('locChips').innerHTML=SECTIONS.filter(s=>aOf(s)==='우리도서관').map(s=>`<span class="locchip ${MK.loc.includes(s.slot)?'on':''}" onclick="toggleLoc('${s.slot}')">${esc(s.title)}</span>`).join('');}
function toggleLoc(slot){const i=MK.loc.indexOf(slot);if(i<0)MK.loc.push(slot);else MK.loc.splice(i,1);buildLoc();syncPreview();}
function setQuizN(n){MK.mission.quizN=n;el('quizN').innerHTML=[3,5,7,10].map(x=>`<span class="${x===n?'on':''}" onclick="setQuizN(${x})">${x}개</span>`).join('');syncPreview();}
function scoreText(){
  const m=MK.mission;if(!m.quiz&&!m.review&&!m.question)return '미션을 1개 이상 선택하세요.';
  if(MK.type==='고전챌린지'){
    const opt=(m.review?1:0)+(m.question?1:0);const q=opt===2?80:opt===1?90:100;
    let s=`<b>퀴즈 ${q}점</b>`;if(m.review)s+=' + 한줄소감 10점';if(m.question)s+=' + 질문하기 10점';
    return s+' = <b>100점 만점</b><br>한줄소감·질문하기: 작성 10점 / 미작성 0점';
  }
  let parts=[];if(m.quiz)parts.push(`퀴즈 ${m.quizN}문항`);if(m.review)parts.push('한 줄 소감');if(m.question)parts.push('질문 만들기');
  return '선택 미션: <b>'+parts.join(' · ')+'</b>';
}
function syncPreview(){
  MK.title=el('mkTitle').value.trim();MK.intro=el('mkIntro').value.trim();
  MK.from=el('mkFrom').value;MK.to=el('mkTo').value;
  const t=MK.type;const typeLabel=t==='큐레이션'?'큐레이션':t==='고전챌린지'?'고전 컬렉션 챌린지':'소장자료 챌린지';
  const isChal=t!=='큐레이션';
  if(isChal)el('scoreBox').innerHTML=scoreText();
  el('pvCard').innerHTML=`
    <div class="pv-top"><span class="pv-type">${typeLabel}</span>
      <h4>${esc(MK.title||'제목을 입력하세요')}</h4>
      <div class="pv-meta">${MK.from||'시작일'} ~ ${MK.to||'종료일'}</div></div>
    <div class="pv-body">
      ${MK.intro?`<div class="pv-intro">${esc(MK.intro)}</div>`:''}
      ${MK.books.length?`<div class="pv-books">${MK.books.map(b=>`<div class="pv-bk"><div class="cv">${b.cover?`<img src="${esc(b.cover)}" onerror="this.parentNode.textContent='📕'">`:'📕'}</div><div class="t">${esc(b.t)}</div></div>`).join('')}</div>`:'<div class="pv-empty">담은 책이 여기에 표시돼요.</div>'}
      ${isChal&&(MK.mission.quiz||MK.mission.review||MK.mission.question)?`<div class="pv-mission">${MK.mission.quiz?`<span>퀴즈 ${MK.mission.quizN}문항</span>`:''}${MK.mission.review?'<span>한 줄 소감</span>':''}${MK.mission.question?'<span>질문 만들기</span>':''}</div>`:''}
      <div class="pv-loc">📍 ${MK.loc.length?esc(MK.loc.map(locLabel).join(' · ')):'위치 미지정'}</div>
    </div>`;
}

