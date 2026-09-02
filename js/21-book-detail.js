/* ═══════════════════════════════════════════════════════════
   도서 상세
   ═══════════════════════════════════════════════════════════ */
// 퀴즈가 한 문제도 없는 세계고전 11권 (2026-09-02 bookstar_quiz_items 실측). 대부분 수필·우화·철학서 모음.
const QUIZLESS_GB = new Set(['gb-23639','gb-1080','gb-57342','gb-21','gb-56463','gb-2130','gb-30201','gb-83b','gb-2434','gb-36151','gb-9198']);
function openDetail(bookId){
  const b = BOOKS.find(x=>x.id===bookId);
  if(!b) return;
  bxEvent('view',{book:b});   // 측정: 조회(고전 상세 열림)
  try{ mbTouch(b); }catch(e){}   // 8/21: 상세를 연 책은 내서재 '내 책'에 담긴다
  // 체감 속도↑: 상세 보는 동안 '전문 바로읽기' 본문을 백그라운드로 미리 당겨옴(await 안 함, 클릭 시 즉시 표시)
  try{
    if(bookId.startsWith('gb-')) ensureClassicBody(bookId);          // Supabase 원문+번역 데움(대용량 JS는 번역 없을 때만 openViewer에서)
    else if(b.hasTrans && bookId.startsWith('kr-')){ ensureKrBody(b); if(classicFetchId(bookId)) ensureClassicBody(bookId); }
    else if(classicFetchId(bookId)) ensureClassicBody(bookId);
  }catch(e){}
  const ov = document.getElementById('lcDetail');
  if(!ov){ nav('detail'); return; }
  const cover = b.coverSrc
    ? `<img src="${esc(b.coverSrc)}" alt="${esc(b.title)}" onerror="this.style.display='none'">`
    : ncCover(b);
  const others = BOOKS.filter(x=>x.author===b.author&&x.id!==b.id).length;
  const chips = [b.minumsa?'★ 민음사':'', b.category, b.period, b.intl?'🌏 International OK':'']
    .filter(Boolean).map(c=>`<span class="lcd-chip">${esc(c)}</span>`).join('');
  const summary = (typeof CLASSIC_SUMMARY!=='undefined' && CLASSIC_SUMMARY[b.id]) ? CLASSIC_SUMMARY[b.id] : '';
  const intro = summary || `${b.author}의 ${b.period} 시대 ${b.category} 정전입니다. 저작권이 만료된 공개 작품(PD)으로, 북스타 표준 격조체 본문으로 바로 읽을 수 있어요.`;
  // 8/29 사장님 지시: 국내(한국) 고전에는 퀴즈가 한 문제도 없다(퀴즈 3,880문항 전부 세계고전 것).
  // 지금까지는 눌러도 뷰어만 열리고 '퀴즈가 준비되지 않았어요'로 끝나는 헛걸음이었다 → 국내 고전에서만 이 칸을 숨긴다.
  // ⚠️ 이 상세 팝업은 세계고전과 함께 쓰는 하나뿐인 화면이다. 조건 없이 지우면 세계고전 194권의 퀴즈 입구까지 사라진다.
  //    화면 탭 상태가 아니라 '책 자체'의 국내/해외 표시로 판정해야 한다(피드·검색에서 열어도 정확하도록).
  // 9/2 실측: 세계고전 205권 중 194권에 두 유형 10문항씩(3,880문항) 있음. 아래 11권만 없음 → 같은 규칙으로 숨긴다.
  //    (퀴즈를 만들어 넣으면 이 목록에서 빼면 된다)
  const isKrClassic = (b.locale==='modern') || String(b.id||'').startsWith('kr-');
  const noQuiz = QUIZLESS_GB.has(b.id);
  const quizBlock = (isKrClassic || noQuiz) ? '' : `<div class="lcd-quiz">
      <div class="lcd-quiz-h">퀴즈로 바로 읽기<span class="lcd-quiz-s">핵심 문장과 배경 설명을 읽고 풀어요</span></div>
      <div class="lcd-qcard" onclick="openQuizDirect('${b.id}','작품 이해')">
        <div class="qt">작품 이해 퀴즈</div><div class="qn">10장면 · 10문항</div>
        <div class="qd">사건과 인물을 이해하게 되고, 작품 한 권을 이야기할 수 있게 돼요</div></div>
      <div class="lcd-qcard" onclick="openQuizDirect('${b.id}','인문 성찰')">
        <div class="qt">인문 성찰 퀴즈</div><div class="qn">10장면 · 10문항</div>
        <div class="qd">인문학적 질문에 답을 찾다 보면, 사람과 삶을 보는 내 기준이 생겨요</div></div>
    </div>`;
  ov.querySelector('.lcd').innerHTML = `<span class="lcd-x" onclick="closeLc()">×</span>
    <div class="lcd-top">
      <div class="lcd-cv">${cover}</div>
      <div class="lcd-i"><h2>${esc(b.title)}</h2><div class="au">${esc(b.author)}${b.period?` · ${esc(b.period)}`:''}</div>
        <div class="lcd-chips">${chips}</div></div>
    </div>
    <p class="lcd-desc${summary?' has-sum':''}">${esc(intro)}</p>
    <div class="lcd-acts">
      <!-- 8/14 사장님 수정요청: '전문 바로 읽기·북스타 표준 본문' → '전자책 바로 읽기'(용어 통일)
           8/20 사장님 수정요청: '이렇게 읽어요' 라벨 삭제 + 아래에 '퀴즈로 바로 읽기' 부활
             (8/14엔 '퀴즈로 깊이 읽기' 한 줄을 지웠지만, 이번엔 작품 이해·인문 성찰 두 종을 항상 보이게 — 챌린지 참여 없이도 열린다) -->
      <div class="lcd-btn primary" onclick="closeLc();openViewer('${b.id}','full')">전자책 바로 읽기<span class="ar">›</span></div>
      ${(()=>{const WT={'kr-김동인-붉은-산':['/webtoon_redmt.html','linear-gradient(135deg,#7a2417,#c0341c)'],'gb-74222':['/webtoon_demian.html','linear-gradient(135deg,#1a2452,#3a2a6a)'],'gb-64317':['/webtoon_gatsby.html','linear-gradient(135deg,#0f3d3e,#1f6f6f)'],'gb-158':['/webtoon_emma.html','linear-gradient(135deg,#a85c84,#d199b8)'],'kr-현진건-운수-좋은-날':['/webtoon_unsu.html','linear-gradient(135deg,#3a4452,#5a6675)'],'kr-이효석-메밀꽃-필-무렵':['/webtoon_memil.html','linear-gradient(135deg,#2a3566,#5566a8)']};const w=WT[b.id];return w?`<a class="lcd-btn" style="text-decoration:none;background:${w[1]};color:#fff;border:0" href="${w[0]}">🎬 웹툰으로 줄거리 보기 <span style="font-size:10px;background:rgba(255,255,255,.25);padding:1px 6px;border-radius:8px;margin-left:2px">NEW</span><span class="ar" style="opacity:.8">›</span></a>`:'';})()}
    </div>
    ${quizBlock}
    <div class="lcd-src">본문 북스타 표준 격조체 제공${others?` · ${esc(b.author)} 다른 책 ${others}권`:''}</div>
    <div id="lcdReviews"></div>`;
  ov.classList.add('on');
  lcdDescMark(ov.querySelector('.lcd-desc'));   // 8/14: 고전 상세도 설명 잘림 시 '더 보기'
  renderDetailReviews(b.id, b.title);
}

