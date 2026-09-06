/* ════════ 내서재 ① 내 활동 그룹 (프로필·기록) — 실데이터. 8/29 별 포인트 폐지(별 내역·등급 삭제) ════════ */
const AG_IC_USER='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
const AG_NOTE_KIND={oneline:['한 줄 소감','ag-k-sg'],impression:['한 줄 소감','ag-k-sg'],question:['한 줄 질문','ag-k-q'],review:['서평','ag-k-rv'],essay:['독후감','ag-k-rv']};
let _agWritings=[], _agNoteFilter='all';
const _AGF_TTL=2000; const _agfCache=new Map();   // 마이페이지 진입 시 같은 path 중복 fetch 폭주 방지(2초 TTL + in-flight dedupe). path에 계정 id 포함되어 계정 간 오염 없음
async function _agFetch(path){
  const c=_agfCache.get(path);
  if(c && (Date.now()-c.t)<_AGF_TTL) return c.p;   // 캐시된 Promise 공유 → 동시/연속 동일요청 1회로
  const p=(async()=>{ try{ const r=await sbGet('/'+path); if(r.ok) return await r.json(); }catch(e){} return []; })();
  _agfCache.set(path,{t:Date.now(),p});
  return p;
}
function _agDate(iso){ try{ const d=new Date(iso); return (d.getMonth()+1)+'월 '+d.getDate()+'일'; }catch(e){ return ''; } }
async function renderActivityGroup(){
  const el=document.getElementById('actGroup'); if(!el) return;
  const grpHead='<div class="lib-grp first"><div class="lib-grp-ic">'+AG_IC_USER+'</div><div><div class="lib-grp-t">내 활동</div><div class="lib-grp-s">프로필 · 기록</div></div></div>';
  const s=bxStudent();
  if(!s){ el.innerHTML=grpHead+'<div class="ag-card"><div class="ag-empty">계정을 선택하면 내 활동이 만들어져요. <span class="favset" onclick="bxOpenPicker()">계정 선택</span></div></div>'; return; }
  const enc=encodeURIComponent(s.id);
  try{ await mbLoad(); }catch(e){}   // 내 기록의 책 제목(도서관 책 포함)용
  const [profA,writings,enroll]=await Promise.all([
    _agFetch(`bookstar_students?id=eq.${enc}&select=bio,favorite_book_id,emoji,name`),
    _agFetch(`bookstar_writings?student_id=eq.${enc}&school_id=eq.${CH_SCHOOL}&hidden=eq.false&select=activity,book_id,text,created_at&order=created_at.desc`),
    _agFetch(`bookstar_challenge_enroll?student_id=eq.${enc}&select=status`)
  ]);
  const prof=profA[0]||{};
  const emoji=prof.emoji||s.emoji||'📘', name=prof.name||s.name||'', bio=prof.bio||s.bio||'';
  const wCnt=a=>writings.filter(w=>w.activity===a).length;
  const nOne=wCnt('oneline')+wCnt('impression'), nQ=wCnt('question'), nRev=wCnt('review'), nEss=wCnt('essay');
  const nDone=_doneBooks().length, nEnroll=enroll.length, nEnrollDone=enroll.filter(e=>e.status==='done').length;
  // 내 기록 노트 (칩으로 필터)
  _agWritings=writings; _agNoteFilter='all';
  const hasNotes=writings.some(w=>AG_NOTE_KIND[w.activity]);
  el.innerHTML = grpHead
   +`<div class="ag-card">
      <div class="ag-ptop">
        <div class="ag-pav">${esc(emoji)}</div>
        <div style="flex:1;min-width:0"><div class="ag-pname">${esc(name)}</div><div class="ag-pstatus">${esc(bio||'상태메시지를 남겨보세요')}</div></div>
        <button class="ag-pedit" onclick="openProfileEdit()">편집</button>
      </div>
      <div class="ag-pstats">
        ${[[nOne,'한 줄 소감','s-sg'],[nQ,'한 줄 질문','s-q'],[nRev,'서평','s-rv'],[nEss,'독후감','s-rv'],[nEnroll,'참여 챌린지','s-ch'],[nEnrollDone,'완료 챌린지','s-cl']].map(s=>`<div class="ag-pstat ${s[2]}"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}
      </div>
    </div>`;
  // 8/29 사장님 지시: '내 기록' 블록(칩·카드 미리보기·전체 보기) 삭제 — 아래 '내 책 모음 › 내가 쓴 글'과 중복. (hasNotes/_agNotesHTML 은 남겨 둠)
  void hasNotes;
}
const AG_NOTE_FILTERS={soup:['oneline','impression'],q:['question'],rv:['review'],es:['essay']};
function _agNotesHTML(){
  let list=(_agWritings||[]).filter(w=>AG_NOTE_KIND[w.activity]);
  if(_agNoteFilter!=='all'){ const acts=AG_NOTE_FILTERS[_agNoteFilter]||[]; list=list.filter(w=>acts.indexOf(w.activity)>=0); }
  list=list.slice(0,12);
  if(!list.length) return `<div class="ag-empty">${_agNoteFilter==='all'?'아직 남긴 기록이 없어요. 책을 읽고 한 줄 소감을 남겨보세요.':'해당하는 기록이 아직 없어요.'}</div>`;
  return list.map(w=>{ const k=AG_NOTE_KIND[w.activity], b=(typeof _anyBook==='function')?_anyBook(w.book_id):_bookById(w.book_id), bt=b?cleanT(b.title):'', d=w.created_at?_agDate(w.created_at):''; return `<div class="ag-note"><div class="ag-nmeta"><span class="ag-kind ${k[1]}">${k[0]}</span>${bt?' '+esc(bt):''}${d?` · ${d}`:''}</div><p>${esc(w.text||'')}</p></div>`; }).join('');
}

/* ════════ 내서재 ③ 내 책 모음 그룹 (인생책·도서·책장) — 실데이터 ════════ */
const BM_IC_BOOK='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H18"/></svg>';
const IC_STAR_SM='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l2.9 6.3 6.8.7-5 4.6 1.4 6.7L12 17.8 5.9 21l1.4-6.7-5-4.6 6.8-.7z"/></svg>';
const IC_EDIT='<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>';
const IC_SHARE='<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';
const IC_PLUS='<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
let _bmShelves=[], _curFav={id:'',reason:''}, _bmPendBook=null, _bmPickSet={};
const BM_BOOK_LIMIT=10; let _bmBooksOpen=false;
function _bmCover(b,extra){ extra=extra||''; const inner=(b&&b.coverSrc)?`<img src="${esc(b.coverSrc)}" onerror="this.outerHTML='📕'">`:'📕'; return inner+extra; }
function bmToast(m){ let t=document.getElementById('bmToast'); if(!t){ t=document.createElement('div'); t.id='bmToast'; t.className='bm-toast'; document.body.appendChild(t); } t.textContent=m; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),1900); }
function bmCloseModal(){ const o=document.getElementById('bmOv'); if(o) o.classList.remove('on'); }
function _bmModal(html){
  let o=document.getElementById('bmOv');
  if(!o){ o=document.createElement('div'); o.id='bmOv'; o.className='bm-ov'; o.onclick=e=>{ if(e.target===o) bmCloseModal(); }; document.body.appendChild(o); }
  o.innerHTML=`<div class="bm-modal">${html}</div>`; o.classList.add('on');
}
async function _bmWrite(method,path,bodyObj){
  try{ const r=await sbWrite(method,'/'+path,bodyObj||undefined,{prefer:'return=minimal'}); return r.ok; }catch(e){ return false; }
}

/* ── 내 책(8/21 사장님 요청): 상세 페이지를 열어 본 책이 자동으로 담긴다 — bookstar_mybooks(학생별, 기기 무관).
   인생책·책장·글쓰기(⋮ 메뉴)의 공통 후보. 옛 _bookById는 고전(BOOKS)만 알아서 도서관 책 인생책이 안 보이던 버그의 원인 → _anyBook으로 통일 ── */
let _mbList=[], _mbTab='all', _mbLoadedFor='', _mbExtra={};
let _mbShowAll=false; const MB_PREVIEW=10;   // 8/30 사장님: 내 책은 처음엔 10권(두 줄)만, '전체 보기'로 펼침
function mbKey(b){ if(!b) return ''; const id=String(b.id||''); if(/^(gb|kr)-/.test(id)) return id; return String(b.isbn||id||''); }
function _mbNormRow(r){ return {id:String(r.book_id), title:cleanT(r.title||''), author:r.author||'', coverSrc:r.cover||'', isbn:r.isbn||'', kind:r.kind||'', last:r.last_seen||r.created_at||''}; }
function _mbNormCls(b){ return {id:b.id, title:cleanT(b.title||''), author:b.author||'', coverSrc:b.coverSrc||'', isbn:'', kind:String(b.id||'').indexOf('gb-')===0?'foreign':'korean', last:''}; }
function mbIsCls(b){ return /^(gb|kr)-/.test(String((b&&b.id)||'')); }
function _anyBook(id){ id=String(id||''); if(!id) return null; const m=_mbList.find(x=>x.id===id); if(m) return m; if(_mbExtra[id]) return _mbExtra[id]; const c=_bookById(id); return c?_mbNormCls(c):null; }
// 8/30 사장님 지적: 피드·프로필에서 도서관 책이 번호(sm-…/ISBN)로만 보였다 — 글의 책 키를 세명대 장서(semyung_tulip)에서 한 번에 찾아 제목·표지를 붙인다.
//   키 형식: sm-<바코드>(전자책) · sm-CATTOT<제어번호>(종이책) · <ISBN13>. 찾은 책은 LIB_POOL 에도 넣어 '책 보기'가 상세로 이어지게.
const _bxResolved=new Set();
async function bxResolveBooks(keys){
  const want=[...new Set((keys||[]).map(k=>String(k||'')).filter(k=>k&&!/^(gb|kr)-/.test(k)&&!_bxResolved.has(k)&&!_anyBook(k)))];
  if(!want.length) return;
  want.forEach(k=>_bxResolved.add(k));
  const bc=[],ct=[],isb=[];
  want.forEach(k=>{ let m; if((m=/^sm-CATTOT(\d+)$/.exec(k))) ct.push(m[1]); else if((m=/^sm-(\d+)$/.exec(k))) bc.push(m[1]); else if(/^\d{10,13}$/.test(k)) isb.push(k); });
  const ors=[]; if(bc.length) ors.push(`barcode.in.(${bc.join(',')})`); if(ct.length) ors.push(`ctrl.in.(${ct.join(',')})`); if(isb.length) ors.push(`isbn.in.(${isb.join(',')})`);
  if(!ors.length) return;
  try{
    const r=await sbGetAnon(`/semyung_tulip?select=ctrl,kind,title,author,isbn,barcode,cover_url,viewer_url&or=(${ors.join(',')})&limit=200`);
    if(!r.ok) return; const rows=await r.json(); if(!Array.isArray(rows)) return;
    rows.forEach(t=>{
      const cands=[]; if(t.barcode) cands.push('sm-'+t.barcode); if(t.kind==='paper'&&t.ctrl) cands.push('sm-CATTOT'+t.ctrl); if(t.isbn) cands.push(String(t.isbn));
      cands.filter(k=>want.includes(k)).forEach(k=>{
        if(_mbExtra[k]) return;
        const title=cleanT(String(t.title||'').replace(/\s*\[전자책\]\s*/g,' ').trim());
        _mbExtra[k]={id:k, title, author:t.author||'', coverSrc:t.cover_url||'', isbn:t.isbn||'', kind:t.kind==='ebook'?'ebook':'paper', last:''};
        try{ curateToLibBook({isbn:k, title, author:t.author||'', cover:t.cover_url||'', smEbook:t.kind==='ebook', smPaper:t.kind==='paper', smEbookUrl:t.viewer_url||'', brcd:t.barcode||t.ctrl||''}); }catch(e){}
      });
    });
  }catch(e){}
}
async function mbLoad(force){
  const s=bxStudent(); if(!s){ _mbList=[]; _mbLoadedFor=''; return _mbList; }
  if(!force && _mbLoadedFor===s.id) return _mbList;
  const rows=await _agFetch(`bookstar_mybooks?student_id=eq.${encodeURIComponent(s.id)}&select=book_id,title,author,cover,isbn,kind,created_at,last_seen&order=last_seen.desc&limit=300`);
  _mbList=(Array.isArray(rows)?rows:[]).map(_mbNormRow); _mbLoadedFor=s.id; return _mbList;
}
// 상세가 열릴 때 호출(libDetail·openDetail) — 서버 upsert + 로컬 목록 즉시 갱신
function mbTouch(b){
  try{
    const s=bxStudent(); if(!s||!b) return; const key=mbKey(b); if(!key) return;
    const it=bxItemOf(b);
    const row={school_id:CH_SCHOOL,student_id:s.id,book_id:key,title:cleanT(b.t||b.title||''),author:String(b.a||b.author||''),cover:String(b.cover||b.coverSrc||''),isbn:String(b.isbn||''),kind:it.item_type||'',last_seen:new Date().toISOString()};
    if(!row.title) return;
    sbWrite('POST',`/bookstar_mybooks?on_conflict=student_id,book_id`,row,{prefer:'resolution=merge-duplicates,return=minimal'}).catch(()=>{});
    if(_mbLoadedFor===s.id) _mbList=[_mbNormRow(row)].concat(_mbList.filter(x=>x.id!==key));
  }catch(e){}
}
function _mbAll(){   // 내 책 = 담긴 책 ∪ 완독 고전 ∪ 읽던 고전 (중복 제거, 최근 본 순)
  const seen={}, out=[]; const push=b=>{ if(b&&b.id&&!seen[b.id]){ seen[b.id]=1; out.push(b); } };
  _mbList.forEach(push); _doneBooks().forEach(b=>push(_mbNormCls(b))); _readingBooks().forEach(x=>push(_mbNormCls(x.b)));
  return out;
}
function mbOpen(id){   // 표지 클릭 → 고전은 상세, 도서관 책은 libDetail(풀에 없으면 최소 정보로 넣고 연다)
  const b=_anyBook(id); if(!b) return;
  if(mbIsCls(b)){ openDetail(b.id); return; }
  const isbn=b.isbn||b.id;
  if(!LIB_POOL.find(x=>x.isbn===isbn)) LIB_POOL.push({isbn, t:b.title, a:b.author, cover:b.coverSrc, _sm:/^sm-/.test(isbn)||undefined});
  libDetail(isbn);
}
async function mbRemove(id){
  const s=bxStudent(); if(!s) return;
  if(!confirm('내 책에서 뺄까요? (쓴 글은 지워지지 않아요)')) return;
  await _bmWrite('DELETE',`bookstar_mybooks?student_id=eq.${encodeURIComponent(s.id)}&book_id=eq.${encodeURIComponent(id)}`);
  _mbList=_mbList.filter(x=>x.id!==String(id)); bmCloseModal(); renderMyProfileTop();
}
function mbSetTab(t){ _mbTab=t; renderMyProfileTop(); }
function mbHideHint(){ try{ localStorage.setItem('bookstar-mb-hint','1'); }catch(e){} const h=document.getElementById('mbHint'); if(h) h.style.display='none'; }
const MB_DOTS='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
/* ── ⋮ 메뉴: 한 줄 소감 · 한 줄 질문 · 서평 · 독후감 (+ 책장 담기 · 인생책 · 빼기). opt.chId·opt.only = 챌린지 책(마이 챌린지 카드)에서 열 때 ── */
const WR_ICON={oneline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',question:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4"/><circle cx="12" cy="18" r=".6"/></svg>',review:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z"/></svg>',essay:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>'};
const WR_DESC={oneline:'읽고 느낀 생각을 한 줄로',question:'책에 던지고 싶은 질문을 한 줄로',review:'이 책을 남에게 소개하는 글',essay:'읽고 난 내 생각을 쓰는 글'};
const WR_INTRO={review:['서평은 <b>책 이야기</b>예요.','읽을 사람을 위해 쓰는 글이에요. 이 책이 어떤 책인지, 어떤 점이 좋고 아쉬웠는지, 누구에게 권하고 싶은지를 씁니다. 줄거리를 다 옮기기보다 읽고 나서 내린 판단과 그 이유를 담아 보세요.'],
  essay:['독후감은 <b>내 이야기</b>예요.','나를 위해 쓰는 글이에요. 어떤 대목이 마음에 남았는지, 그때 무슨 생각이 들었는지, 내 경험과 어떻게 이어졌는지를 씁니다. 잘 쓰려고 애쓰기보다 솔직하게 쓰면 됩니다.']};
function _mbHead(b,tag){ return `<div class="bm-mbook" style="margin-bottom:10px"><div class="cv" style="width:46px;height:64px">${_bmCover(b)}</div><div><b>${esc(b.title)}</b><br><span>${esc(b.author||'')}</span><br><span class="mb-tag">${tag||'내 책'}</span></div></div>`; }
function mbMenu(id,opt){
  opt=opt||{}; if(opt.book){ _mbExtra[String(opt.book.id)]=opt.book; }
  const b=_anyBook(id); if(!b){ bmToast('책 정보를 찾지 못했어요'); return; }
  const keys=opt.only||['oneline','question','review','essay'];
  const chArg=opt.chId?`'${esc(String(opt.chId))}'`:'null';
  const items=CH_MISSIONS.filter(x=>x.kind==='write'&&keys.indexOf(x.k)>=0).map(x=>`<div class="mb-mi" onclick="wrOpen('${esc(b.id)}','${x.k}',${chArg})"><span class="ic">${WR_ICON[x.k]}</span><div><b>${x.t.replace(' 쓰기','')}</b><span>${WR_DESC[x.k]}</span></div><i>›</i></div>`).join('');
  const extra=opt.chId?'':`<div class="mb-sep"></div>
    <div class="mb-mi sm" onclick="openAddShelf('${esc(b.id)}')"><span class="ic">${IC_PLUS}</span><div><b>책장에 담기</b></div><i>›</i></div>
    <div class="mb-mi sm" onclick="openLifeModal('${esc(b.id)}')"><span class="ic">${IC_STAR_SM}</span><div><b>인생책으로</b></div><i>›</i></div>
    <div class="mb-mi sm danger" onclick="mbRemove('${esc(b.id)}')"><span class="ic">×</span><div><b>내 책에서 빼기</b></div></div>`;
  _bmModal(`${_mbHead(b,opt.chId?'챌린지 책':'내 책')}${items||'<div class="ag-empty">이 챌린지엔 글쓰기 미션이 없어요.</div>'}${extra}`);
}
/* ── 글쓰기 에디터. 짧은 글(소감·질문)=120자 · 긴 글(서평 300자↑·독후감 800자↑). '다른 학생에게 공개'=is_public.
   8/29 별 포인트 폐지 — 챌린지 글·상시 글 모두 저장만 한다. ── */
let _wr=null;
function _wrDraftKey(){ return `bookstar-draft-${_bxSid()}-${_wr.k}-${_wr.bookId}`; }
async function wrOpen(bookId,k,chId){
  const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  const b=_anyBook(bookId); const def=CH_MISSIONS.find(x=>x.k===k); if(!b||!def) return;
  _wr={bookId:String(bookId),k,chId:chId||null,b,def};
  const enc=encodeURIComponent(s.id);
  let prev=null; try{ const rows=await _agFetch(`bookstar_writings?student_id=eq.${enc}&book_id=eq.${encodeURIComponent(bookId)}&activity=eq.${k}&select=text,is_public,challenge_id`); prev=(rows&&rows[0])||null; }catch(e){}
  let draft=''; try{ draft=localStorage.getItem(_wrDraftKey())||''; }catch(e){}
  const text=(prev&&prev.text)||draft||'';
  // 8/30 사장님: 새 글은 기본 공개(체크) — 이미 '나만 보기'로 저장한 글만 해제 상태로 열림
  const pubChk=`<label class="wr-pub"><input type="checkbox" id="wrPub" ${(!prev||prev.is_public!==false)?'checked':''}> 학우들에게 내 글을 공개해요<div style="font-size:11.5px;color:var(--text-light);margin-top:3px;font-weight:500;padding-left:20px">공개한 글만 독서챌린지 참여 기록으로 인정돼요</div></label>`;
  const backArg=chId?`,{chId:'${esc(String(chId))}'}`:'';
  const long=(k==='review'||k==='essay');
  if(!long){
    _bmModal(`${_mbHead(b,chId?'챌린지 책':'내 책')}<label style="margin-top:6px">${def.t}</label>
      <textarea id="wrTa" rows="3" maxlength="120" placeholder="${esc(def.ph)}">${esc(text)}</textarea>
      <div class="wr-foot"><span id="wrCnt">${text.length}/120자</span>${pubChk}</div>
      <button class="bm-btn fill wr-go" id="wrGo" onclick="wrSubmit()" ${text.trim().length<def.min?'disabled':''}>${prev?'수정해서 올리기':'올리기'}</button>
      <div class="wr-back" onclick="mbMenu('${esc(bookId)}'${backArg})">← 뒤로</div>`);
  } else {
    const intro=WR_INTRO[k];
    _bmModal(`<div class="wr-long">
      <div class="wr-lh"><div><div class="wr-lt">${def.t}</div><div class="wr-ls">${esc(b.title)} · ${esc(b.author||'')}</div></div><button class="bm-btn" onclick="bmCloseModal()">닫기</button></div>
      <div class="wr-intro"><div class="wr-it">${intro[0]}</div><div>${intro[1]}</div></div>
      <textarea id="wrTa" placeholder="여기에 글을 써 보세요." oninput="wrCount()">${esc(text)}</textarea>
      <div class="wr-foot"><span id="wrCnt"><b>${text.length}</b>자 / 최소 ${def.min}자</span>${pubChk}<span style="flex:1"></span><button class="bm-btn" onclick="wrSaveDraft()">저장</button><button class="bm-btn fill" id="wrGo" onclick="wrSubmit()" ${text.trim().length<def.min?'disabled':''}>${prev?'수정해서 올리기':'올리기'}</button></div>
    </div>`);
    const m=document.querySelector('#bmOv .bm-modal'); if(m) m.classList.add('wide');
  }
  const ta=document.getElementById('wrTa'); if(ta){ ta.addEventListener('input',wrCount); if(!prev) ta.addEventListener('input',()=>{ try{ localStorage.setItem(_wrDraftKey(), ta.value); }catch(e){} }); setTimeout(()=>ta.focus(),30); }
}
function wrCount(){
  if(!_wr) return; const ta=document.getElementById('wrTa'), c=document.getElementById('wrCnt'), go=document.getElementById('wrGo'); if(!ta) return;
  const n=ta.value.length, long=(_wr.k==='review'||_wr.k==='essay');
  if(c) c.innerHTML=long?`<b>${n}</b>자 / 최소 ${_wr.def.min}자`:`${n}/120자`;
  if(go) go.disabled=ta.value.trim().length<_wr.def.min;
}
function wrSaveDraft(){ const ta=document.getElementById('wrTa'); if(!ta||!_wr) return; try{ localStorage.setItem(_wrDraftKey(), ta.value); }catch(e){} bmToast('임시 저장했어요 (이 기기에만 남아요)'); }
async function wrSubmit(){
  if(!_wr) return; const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  const ta=document.getElementById('wrTa'); const v=((ta&&ta.value)||'').trim();
  const chk=bxWriteCheck(v,_wr.k,_wr.def.min);   // 측정 설계 §4 자동 미인정(글자수·연락처/링크·반복)
  if(!chk.ok){ bmToast(chk.msg); if(ta) ta.focus(); return; }
  const pub=!!(document.getElementById('wrPub')&&document.getElementById('wrPub').checked);
  const go=document.getElementById('wrGo'); if(go) go.disabled=true;
  let chId=_wr.chId;
  if(!chId){ try{ const c=chalForBook({id:_wr.bookId,isbn:_wr.b.isbn,title:_wr.b.title}); if(c&&appChalMission(c)[_wr.k]) chId=String(c.id); }catch(e){} }
  let ok=false;
  try{ const r=await sbWrite('POST',`/bookstar_writings?on_conflict=student_id,activity,book_id`,
    {student_id:s.id,school_id:CH_SCHOOL,challenge_id:chId||null,book_id:_wr.bookId,activity:_wr.k,text:v,is_public:pub},
    {prefer:'resolution=merge-duplicates,return=minimal'}); ok=r.ok; }catch(e){}
  if(!ok){ if(go) go.disabled=false; bmToast('저장에 실패했어요'); return; }
  bxEvent('activity',{sub:_wr.k, book:bxBookByKey(_wr.bookId), program_id:chId||null, ref_table:'bookstar_writings', ref_id:s.id+'|'+_wr.k+'|'+_wr.bookId, meta:{len:v.length,standing:!chId,is_public:pub}});
  try{ localStorage.removeItem(_wrDraftKey()); }catch(e){}
  bmCloseModal(); bmToast('올렸어요');
  try{ _agfCache.clear(); }catch(e){}
  _wrMine=null; renderMyProfileTop(); try{ renderActivityGroup(); }catch(e){} try{ renderQuestMap(); }catch(e){}
}
/* ── 내가 쓴 글 (bookstar_writings, 현재 학생) — 탭: 소감/질문/서평/독후감 ── */
let _wrMine=null, _wrTab='oneline';
const WR_TABS=[['oneline','한 줄 소감'],['question','한 줄 질문'],['review','서평'],['essay','독후감']];
async function wrLoadMine(){
  const s=bxStudent(); if(!s) return [];
  const rows=await _agFetch(`bookstar_writings?student_id=eq.${encodeURIComponent(s.id)}&hidden=eq.false&select=activity,book_id,text,created_at,is_public,challenge_id&order=created_at.desc`);
  _wrMine=Array.isArray(rows)?rows:[];
  try{ await bxResolveBooks(_wrMine.map(w=>w.book_id)); }catch(e){}   // 8/30 도서관 책 제목
  return _wrMine;
}
function wrSetTab(t){ _wrTab=t; const w=document.getElementById('wrList'); if(w) w.innerHTML=_wrListHTML(); document.querySelectorAll('#wrTabs .mb-tab').forEach(x=>x.classList.toggle('on',x.dataset.t===_wrTab)); }
function _wrListHTML(){
  const alias={oneline:['oneline','impression'],question:['question'],review:['review'],essay:['essay']}[_wrTab]||[_wrTab];
  const list=(_wrMine||[]).filter(w=>alias.indexOf(w.activity)>=0);
  if(!list.length) return `<div class="ag-empty" style="padding:16px 2px">아직 남긴 글이 없어요. 책 표지 오른쪽 위 ${MB_DOTS} 를 눌러 첫 글을 남겨보세요.</div>`;
  return list.map(w=>{ const b=_anyBook(w.book_id); const t=b?b.title:(w.book_id||''); const d=w.created_at?_agDate(w.created_at):'';
    return `<div class="wr-item"><div class="wr-im"><b>${esc(t)}</b>${d?` · ${d}`:''} · <span class="${w.is_public?'wr-pub-on':'wr-pub-off'}">${w.is_public?'공개':'나만 보기'}</span>${w.challenge_id?' · 챌린지':''}<span style="flex:1"></span><button class="bm-mini" style="flex:none;padding:4px 10px" onclick="wrOpen('${esc(w.book_id)}','${esc(w.activity==='impression'?'oneline':w.activity)}')">수정</button></div><p>${esc(w.text||'')}</p></div>`; }).join('');
}

async function renderMyProfileTop(){
  const el=document.getElementById('myProfileTop'); if(!el) return;
  const grpHead='<div class="lib-grp"><div class="lib-grp-ic">'+BM_IC_BOOK+'</div><div><div class="lib-grp-t">내 책 모음</div><div class="lib-grp-s">인생책 · 내 책 · 책장 · 내가 쓴 글</div></div></div>';
  const s=bxStudent(); const moreBtn=document.getElementById('myMoreBtn');
  if(!s){ el.innerHTML=grpHead+'<div class="ag-card"><div class="ag-empty">계정을 선택하면 내 서가가 만들어져요. <span class="favset" onclick="bxOpenPicker()">계정 선택</span></div></div>'; if(moreBtn) moreBtn.style.display='none'; return; }
  if(moreBtn) moreBtn.style.display='block';
  const enc=encodeURIComponent(s.id);
  const [profA,hist,shelves]=await Promise.all([
    _agFetch(`bookstar_students?id=eq.${enc}&select=favorite_book_id,favorite_reason`),
    _agFetch(`bookstar_life_history?student_id=eq.${enc}&select=book_id,reason,replaced_at&order=replaced_at.desc`),
    _agFetch(`bookstar_shelves?student_id=eq.${enc}&select=id,name,book_ids,created_at&order=created_at.desc`),
    mbLoad(), wrLoadMine()
  ]);
  const prof=profA[0]||{}; const favId=prof.favorite_book_id||''; const favReason=prof.favorite_reason||'';
  _curFav={id:favId,reason:favReason}; _bmShelves=Array.isArray(shelves)?shelves:[];
  const favBook=favId?_anyBook(favId):null;
  const all=_mbAll();
  // ── 내 인생책 (등록한 책·사유가 그대로 보이도록 — 도서관 책도 _anyBook으로 해석)
  const histRows=(Array.isArray(hist)&&hist.length)
    ? `<div class="bm-hist"><div class="bm-hist-h">지난 인생책</div>${hist.map(h=>{ const b=_anyBook(h.book_id); const t=b?b.title:(h.book_id||''); const a=b?(b.author||''):''; const d=h.replaced_at?_agDate(h.replaced_at):''; return `<div class="bm-hist-row"><div class="bm-hc">${b?_bmCover(b):'📕'}</div><div class="bm-hb"><div class="bm-ht">${esc(t)}${a?`<span class="ha">${esc(a)}</span>`:''}</div>${h.reason?`<div class="bm-hr">${esc(h.reason)}</div>`:''}</div><div class="bm-hd">${d}</div></div>`; }).join('')}</div>`
    : '';
  const lifeCard = favBook
    ? `<div class="bm-life"><div class="bm-cover" style="cursor:pointer" onclick="mbOpen('${esc(favBook.id)}')">${_bmCover(favBook)}</div><div style="flex:1;min-width:0">
        <div class="bm-life-k">${IC_STAR_SM} 내 인생책</div>
        <div class="bm-life-t">${esc(favBook.title)}</div><div class="bm-life-a">${esc(favBook.author||'')}</div>
        ${favReason?`<div class="bm-reason">${esc(favReason)}</div>`:'<div class="bm-reason" style="color:var(--text-light)">아직 이유를 안 적었어요. ‘인생책 바꾸기’로 한마디 남겨보세요.</div>'}
        <div class="bm-acts"><button class="bm-btn" onclick="openLifeModal('${esc(favBook.id)}')">${IC_EDIT} 이유 고치기</button><button class="bm-btn" onclick="openLifePicker()">${IC_STAR_SM} 인생책 바꾸기</button></div></div></div>${histRows}`
    : (favId
        ? `<div class="bm-life"><div class="bm-cover">📕</div><div style="flex:1;min-width:0"><div class="bm-life-k">${IC_STAR_SM} 내 인생책</div><div class="bm-life-t">${esc(favId)}</div>${favReason?`<div class="bm-reason">${esc(favReason)}</div>`:''}<div class="bm-acts"><button class="bm-btn" onclick="openLifePicker()">${IC_STAR_SM} 인생책 바꾸기</button></div></div></div>${histRows}`
        : `<div class="bm-life-empty"><div class="ph">${IC_STAR_SM.replace('width="13" height="13"','width="34" height="34"')}</div><div><div style="font-weight:800;color:var(--text);font-size:16px">아직 인생책을 안 골랐어요</div><div style="margin-top:5px">읽은 책 중 가장 인상 깊었던 한 권을 골라보세요.</div><div style="margin-top:12px"><button class="bm-btn fill" onclick="openLifePicker()">${IC_STAR_SM} 인생책 고르기</button></div></div></div>${histRows}`);
  // ── 내 책 (담긴 책 전체 / 책장별 탭) — 카드 ⋮ = 글쓰기 메뉴
  let showHint=true; try{ showHint=!localStorage.getItem('bookstar-mb-hint'); }catch(e){}
  const curShelf=_mbTab==='all'?null:_bmShelves.find(c=>String(c.id)===String(_mbTab));
  if(_mbTab!=='all'&&!curShelf) _mbTab='all';
  const shown=curShelf?(Array.isArray(curShelf.book_ids)?curShelf.book_ids:[]).map(_anyBook).filter(Boolean):all;
  const tabs=`<div class="mb-tabs"><span class="mb-tab${_mbTab==='all'?' on':''}" onclick="mbSetTab('all')">전체 ${all.length}</span>${_bmShelves.map(c=>`<span class="mb-tab${String(c.id)===String(_mbTab)?' on':''}" onclick="mbSetTab('${esc(String(c.id))}')">${esc(c.name||'제목 없음')} ${(Array.isArray(c.book_ids)?c.book_ids.length:0)}</span>`).join('')}<span class="mb-tab add" onclick="openNewShelf()">+ 책장 만들기</span></div>`;
  const shelfBar=curShelf?`<div class="mb-shelfbar"><span>책장 <b>${esc(curShelf.name||'')}</b> · ${shown.length}권</span><span style="flex:1"></span><button class="bm-btn" onclick="openShelfAdd('${esc(String(curShelf.id))}')">${IC_PLUS} 책 담기</button><button class="bm-btn" onclick="shelfDelete('${esc(String(curShelf.id))}')">책장 삭제</button></div>`:'';
  const bkCard = b => { const isFav=favBook&&b.id===favBook.id; return `<div class="bm-bk mb-bk"><div class="bm-bc" onclick="mbOpen('${esc(b.id)}')">${_bmCover(b, isFav?'<span class="favtag">인생책</span>':'')}</div><button class="mb-dots" title="글쓰기" onclick="event.stopPropagation();mbMenu('${esc(b.id)}')">${MB_DOTS}</button><div class="bm-bk-t">${esc(b.title)}</div><div class="bm-bk-a">${esc(b.author||'')}</div></div>`; };
  const _cut=(!_mbShowAll && shown.length>MB_PREVIEW);
  const _vis=_cut?shown.slice(0,MB_PREVIEW):shown;
  const _moreBtn=(shown.length>MB_PREVIEW)?`<div style="text-align:center;margin:14px 0 4px"><button class="bm-btn" onclick="_mbShowAll=!_mbShowAll;renderMyProfileTop()">${_cut?`전체 보기 · ${shown.length}권`:'접기'}</button></div>`:'';
  const booksGrid=shown.length
    ? `<div class="bm-bkgrid">${_vis.map(bkCard).join('')}</div>${_moreBtn}`
    : (curShelf?`<div class="ag-empty">아직 담은 책이 없어요. <b style="color:var(--primary);cursor:pointer" onclick="openShelfAdd('${esc(String(curShelf.id))}')">책 담기</b>로 내 책에서 골라 담아요.</div>`
               :'<div class="ag-empty">아직 내 책이 없어요. 책 상세 페이지를 열어 보면 여기에 담겨요.</div>');
  const hint=showHint?`<div class="mb-hint" id="mbHint"><span>표지를 누르면 이어 읽고, 오른쪽 위 ${MB_DOTS} 를 누르면 소감·질문·서평·독후감을 쓸 수 있어요.</span><b onclick="mbHideHint()">×</b></div>`:'';
  // ── 내가 쓴 글
  const cnt=k=>(_wrMine||[]).filter(w=>k==='oneline'?(w.activity==='oneline'||w.activity==='impression'):w.activity===k).length;
  const wrTabs=`<div class="mb-tabs" id="wrTabs">${WR_TABS.map(t=>`<span class="mb-tab${_wrTab===t[0]?' on':''}" data-t="${t[0]}" onclick="wrSetTab('${t[0]}')">${t[1]} ${cnt(t[0])}</span>`).join('')}</div>`;

  el.innerHTML = grpHead
   +`<div class="ag-sec-h"><h3>내 인생책</h3></div><div class="ag-card">${lifeCard}</div>
     <div class="ag-sec-h"><h3>내 책 <span style="font-size:12px;color:var(--text-light);font-weight:600">책 ${all.length}권 · 책장 ${_bmShelves.length}개</span></h3></div>${hint}${tabs}${shelfBar}${booksGrid}
     <div class="ag-sec-h"><h3>내가 쓴 글 <span style="font-size:12px;color:var(--text-light);font-weight:600">한 줄 소감 · 한 줄 질문 · 서평 · 독후감</span></h3></div>${wrTabs}<div id="wrList">${_wrListHTML()}</div>`;
}
/* ── 인생책 등록/바꾸기 (후보 = 내 책 전체) ── */
function _lifeCandidates(){ return _mbAll(); }
function openLifePicker(){
  const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  const cand=_lifeCandidates();
  if(!cand.length){ bmToast('먼저 책 상세를 열어 보세요 — 본 책이 내 책에 담겨요'); return; }
  const grid=cand.map(b=>`<div class="bm-pick${_curFav.id===b.id?' sel':''}" onclick="openLifeModal('${esc(b.id)}')"><div class="cv">${_bmCover(b)}</div><div class="pt">${esc(b.title)}</div></div>`).join('');
  _bmModal(`<h3>인생책 고르기</h3><div class="sub">내 책 중에서 한 권을 고른 뒤, 이유를 적어요.</div><div class="bm-pickgrid">${grid}</div><div class="bm-mact"><button class="bm-btn" onclick="bmCloseModal()">닫기</button></div>`);
}
function openLifeModal(id){
  _bmPendBook=String(id); const b=_anyBook(id); if(!b) return;
  const cur=(_curFav.id===String(id))?_curFav.reason:'';
  _bmModal(`<h3>인생책 등록</h3><div class="sub">이 책을 인생책으로 고른 이유를 적어주세요. 바꾸면 이전 인생책은 ‘지난 인생책’에 남아요.</div>
    <div class="bm-mbook"><div class="cv">${_bmCover(b)}</div><div><b>${esc(b.title)}</b><br><span>${esc(b.author||'')}</span></div></div>
    <label>인생책으로 고른 이유</label><textarea id="bmReason" rows="4" maxlength="300" placeholder="예) 이 책이 나에게 남긴 한 가지…">${esc(cur)}</textarea><div class="bm-cc"><span id="bmRc">${cur.length}</span>/300</div>
    <div class="bm-mact"><button class="bm-btn" onclick="bmCloseModal()">취소</button><button class="bm-btn fill" onclick="saveLifeBook()">인생책으로 등록</button></div>`);
  const ta=document.getElementById('bmReason'); if(ta){ ta.addEventListener('input',function(){ const c=document.getElementById('bmRc'); if(c) c.textContent=this.value.length; }); ta.focus(); }
}
async function saveLifeBook(){
  const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  const r=(document.getElementById('bmReason')?.value||'').trim();
  if(!r){ bmToast('이유를 입력해주세요'); return; }
  // 이전 인생책이 다른 책이면 히스토리에 보존
  if(_curFav.id && _curFav.id!==_bmPendBook){
    await _bmWrite('POST','bookstar_life_history',{school_id:CH_SCHOOL,student_id:s.id,book_id:_curFav.id,reason:_curFav.reason||''});
  }
  // 8/29 수리: 예전엔 PATCH(고치기)만 해서 학생 줄이 서버에 없으면 0건 수정 → 서버는 204(성공)라 답하고 아무것도 안 남았다.
  //   → 업서트(없으면 만들고 있으면 고침) + 서버가 돌려준 실제 저장값을 확인해서만 "등록했어요"라고 말한다.
  let ok=false;
  try{
    const res=await sbWrite('POST',`/bookstar_students?on_conflict=id`,
      {id:String(s.id),name:String(s.name||s.id),school_id:CH_SCHOOL,favorite_book_id:_bmPendBook,favorite_reason:r},
      {prefer:'resolution=merge-duplicates,return=representation'});
    const rows=res.ok?await res.json():[];
    ok=Array.isArray(rows)&&rows.length>0&&String(rows[0].favorite_book_id||'')===String(_bmPendBook);
  }catch(e){ ok=false; }
  bmCloseModal();
  if(ok){ bmToast('인생책으로 등록했어요'); } else { bmToast('저장에 실패했어요 — 잠시 후 다시 시도해 주세요'); }
  try{ _agfCache.clear(); }catch(e){}
  renderMyProfileTop();
}
/* ── 책장(큐레이션) 담기 ── */
function openAddShelf(bookId){
  _bmPendBook=String(bookId); const b=_anyBook(bookId); if(!b) return;
  const opts=_bmShelves.map((c,i)=>`<div class="bm-opt${i===0?' sel':''}" data-sid="${c.id}" onclick="bmPickShelf(this)">${esc(c.name||'제목 없음')} <span style="margin-left:auto;color:var(--text-light);font-size:12px">${(Array.isArray(c.book_ids)?c.book_ids.length:0)}권</span></div>`).join('');
  _bmModal(`<h3>책장에 담기</h3><div class="sub">담을 책장을 고르거나 새로 만드세요.</div>
    <div class="bm-mbook"><div class="cv">${_bmCover(b)}</div><div><b>${esc(b.title)}</b><br><span>${esc(b.author||'')}</span></div></div>
    ${opts||'<div class="ag-empty" style="padding:8px 2px">아직 만든 책장이 없어요. 아래에 이름을 적어 새로 만들어요.</div>'}
    <label style="margin-top:6px">또는 새 책장 이름</label><input id="bmNewName" maxlength="30" placeholder="예) 밑줄 긋고 싶은 문장들">
    <div class="bm-mact"><button class="bm-btn" onclick="bmCloseModal()">취소</button><button class="bm-btn fill" onclick="saveAddShelf()">담기</button></div>`);
}
function bmPickShelf(el){ document.querySelectorAll('#bmOv .bm-opt').forEach(o=>o.classList.remove('sel')); el.classList.add('sel'); }
async function saveAddShelf(){
  const s=bxStudent(); if(!s) return;
  const nm=(document.getElementById('bmNewName')?.value||'').trim();
  if(nm){
    const ok=await _bmWrite('POST','bookstar_shelves',{school_id:CH_SCHOOL,student_id:s.id,name:nm,book_ids:[_bmPendBook]});
    bmCloseModal(); bmToast(ok?`“${nm}”에 담았어요`:'저장 실패'); try{ _agfCache.clear(); }catch(e){} renderMyProfileTop(); return;
  }
  const sel=document.querySelector('#bmOv .bm-opt.sel'); if(!sel){ bmToast('책장을 고르거나 이름을 입력하세요'); return; }
  const sid=sel.getAttribute('data-sid'); const c=_bmShelves.find(x=>String(x.id)===String(sid)); if(!c){ bmCloseModal(); return; }
  const ids=Array.isArray(c.book_ids)?c.book_ids.slice():[]; if(ids.indexOf(_bmPendBook)<0) ids.push(_bmPendBook);
  const ok=await _bmWrite('PATCH',`bookstar_shelves?id=eq.${encodeURIComponent(c.id)}`,{book_ids:ids,updated_at:new Date().toISOString()});
  bmCloseModal(); bmToast(ok?`“${c.name}”에 담았어요`:'저장 실패'); try{ _agfCache.clear(); }catch(e){} renderMyProfileTop();
}
/* ── 책장에 여러 권 담기(책장 탭 → 책 담기) ── */
function openShelfAdd(sid){
  const c=_bmShelves.find(x=>String(x.id)===String(sid)); if(!c) return;
  const have=new Set((Array.isArray(c.book_ids)?c.book_ids:[]).map(String));
  const cand=_mbAll().filter(b=>!have.has(String(b.id)));
  _bmPickSet={};
  const grid=cand.length?cand.map(b=>`<div class="bm-pick" data-bid="${esc(b.id)}" onclick="bmTogglePick(this)"><div class="cv">${_bmCover(b)}</div><div class="pt">${esc(b.title)}</div></div>`).join('')
    :'<div class="ag-empty" style="padding:8px 2px">더 담을 책이 없어요. 책 상세를 열어 보면 내 책에 담겨요.</div>';
  _bmModal(`<h3>“${esc(c.name||'')}”에 책 담기</h3><div class="sub">내 책 중에서 골라 담아요 (여러 권 선택).</div><div class="bm-pickgrid">${grid}</div>
    <div class="bm-mact"><button class="bm-btn" onclick="bmCloseModal()">취소</button><button class="bm-btn fill" onclick="shelfAddMany('${esc(String(sid))}')">담기</button></div>`);
}
async function shelfAddMany(sid){
  const c=_bmShelves.find(x=>String(x.id)===String(sid)); if(!c) return;
  const add=Object.keys(_bmPickSet); if(!add.length){ bmToast('책을 골라주세요'); return; }
  const ids=(Array.isArray(c.book_ids)?c.book_ids.slice():[]); add.forEach(id=>{ if(ids.indexOf(id)<0) ids.push(id); });
  const ok=await _bmWrite('PATCH',`bookstar_shelves?id=eq.${encodeURIComponent(c.id)}`,{book_ids:ids,updated_at:new Date().toISOString()});
  bmCloseModal(); bmToast(ok?`${add.length}권 담았어요`:'저장 실패'); try{ _agfCache.clear(); }catch(e){} renderMyProfileTop();
}
async function shelfDelete(sid){
  const c=_bmShelves.find(x=>String(x.id)===String(sid)); if(!c) return;
  if(!confirm(`책장 “${c.name||''}”을(를) 지울까요? (책과 글은 그대로 남아요)`)) return;
  const ok=await _bmWrite('DELETE',`bookstar_shelves?id=eq.${encodeURIComponent(c.id)}`);
  _mbTab='all'; bmToast(ok?'책장을 지웠어요':'삭제 실패'); try{ _agfCache.clear(); }catch(e){} renderMyProfileTop();
}
/* ── 새 책장 만들기 (후보 = 내 책) ── */
function openNewShelf(){
  const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  _bmPickSet={}; const cand=_mbAll();
  const grid=cand.length?cand.map(b=>`<div class="bm-pick" data-bid="${esc(b.id)}" onclick="bmTogglePick(this)"><div class="cv">${_bmCover(b)}</div><div class="pt">${esc(b.title)}</div></div>`).join('')
    :'<div class="ag-empty" style="padding:8px 2px">책 상세를 열어 보면 내 책에 담기고, 여기서 고를 수 있어요. (이름만 정해 빈 책장을 만들 수도 있어요)</div>';
  _bmModal(`<h3>책장 만들기</h3><div class="sub">이름을 정하고, 담을 책을 골라보세요.</div>
    <label>책장 이름</label><input id="bmShelfName" maxlength="30" placeholder="예) 다시 읽고 싶은 책">
    <label style="margin-top:14px">책 고르기 <span style="color:var(--text-light);font-weight:400">(여러 권 선택)</span></label><div class="bm-pickgrid">${grid}</div>
    <div class="bm-mact"><button class="bm-btn" onclick="bmCloseModal()">취소</button><button class="bm-btn fill" onclick="makeShelf()">만들기</button></div>`);
  setTimeout(()=>{ const i=document.getElementById('bmShelfName'); if(i) i.focus(); },30);
}
function bmTogglePick(el){ const id=el.getAttribute('data-bid'); if(_bmPickSet[id]){ delete _bmPickSet[id]; el.classList.remove('sel'); } else { _bmPickSet[id]=1; el.classList.add('sel'); } }
async function makeShelf(){
  const s=bxStudent(); if(!s) return;
  const nm=(document.getElementById('bmShelfName')?.value||'').trim(); if(!nm){ bmToast('이름을 입력해주세요'); return; }
  const ids=Object.keys(_bmPickSet);
  const ok=await _bmWrite('POST','bookstar_shelves',{school_id:CH_SCHOOL,student_id:s.id,name:nm,book_ids:ids});
  bmCloseModal(); bmToast(ok?`“${nm}” 책장을 만들었어요 (${ids.length}권)`:'저장 실패'); try{ _agfCache.clear(); }catch(e){} renderMyProfileTop();
}

/* ════════ 내서재 ② 내 챌린지 그룹 (참여 중 / 완료 결과·복습) — 실데이터 ════════ */
const CG_IC='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/></svg>';
const IC_CHK='<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>';
let _cgDone=[], _cgLoaded={};
function _scQuizTotal(bookId){ const sc=(typeof CHALLENGE_SCENES!=='undefined')?CHALLENGE_SCENES[bookId]:null; if(!sc) return 0; return (sc.scenes||[]).reduce((s,x)=>s+((x.quiz||[]).length),0); }
async function renderChalGroup(rootId){
  // 내 챌린지는 내서재(#chalGroup) · 마이 챌린지(#chalGroupMy) 두 곳에 표시.
  // 내부 id(questMapBody 등) 충돌 방지 위해, 지금 보이는 화면 한 곳에만 그리고 반대쪽은 비움.
  const HOSTS=['chalGroup','chalGroupMy'];
  let target=rootId;
  if(!target){ const onMy=document.getElementById('page-mychal')?.classList.contains('active'); target=onMy?'chalGroupMy':'chalGroup'; }
  HOSTS.filter(h=>h!==target).forEach(h=>{ const o=document.getElementById(h); if(o) o.innerHTML=''; });
  const el=document.getElementById(target); if(!el) return;
  const head='<div class="lib-grp"><div class="lib-grp-ic">'+CG_IC+'</div><div><div class="lib-grp-t">내 챌린지</div><div class="lib-grp-s">참여 중 · 완료</div></div></div>';
  const s=bxStudent();
  if(!s){ el.innerHTML=head+'<div class="ag-card"><div class="ag-empty">계정을 선택하면 챌린지가 보여요. <span class="favset" onclick="bxOpenPicker()">계정 선택</span></div></div>'; return; }
  el.innerHTML = head
    + '<div class="ag-sec-h"><h3>참여 중인 챌린지</h3></div>'
    + '<div class="quest-map"><div id="questMapBody"></div></div>'
    + '<div class="ag-sec-h"><h3>완료한 챌린지</h3></div>'
    + '<div id="chalDoneBody"><div class="cg-empty">불러오는 중…</div></div>';
  try{ renderQuestMap(); }catch(e){}
  try{ await wrLoadMine(); renderQuestMap(); }catch(e){}   // 소장자료 책 진행(내 글) 반영
  const enc=encodeURIComponent(s.id);
  // 8/30 사장님 결정: 사서가 만든 챌린지는 미션을 다 끝내고(enroll done) **기간이 끝난 뒤** '완료한 챌린지'로 옮긴다. 기간 중엔 참여 중에 '완료 ✓'로 남는다.
  //   (전엔 고전 장면 챌린지만 집계돼 소장자료 챌린지는 완료해도 여기 안 왔다)
  const [results, enrollRows]=await Promise.all([
    _agFetch(`bookstar_challenge_results?student_id=eq.${enc}&select=book_id,impression,quiz_ok,quiz_total,score,submitted,updated_at&order=updated_at.desc`),
    _agFetch(`bookstar_challenge_enroll?student_id=eq.${enc}&status=eq.done&select=challenge_id,done_at`)
  ]);
  const hasScenes=(typeof CHALLENGE_SCENES!=='undefined');
  const done=(results||[]).filter(r=> hasScenes && CHALLENGE_SCENES[r.book_id] && (r.submitted || (r.quiz_ok>0)) );
  let doneChals=[];
  try{
    const ids=[...new Set((enrollRows||[]).map(e=>String(e.challenge_id||'')).filter(Boolean))];
    if(ids.length){
      const progs=await _agFetch(`library_programs?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,title,type,start_date,end_date,books`);
      const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);   // 오늘(현지) YYYY-MM-DD
      doneChals=(Array.isArray(progs)?progs:[]).filter(p=>p.end_date && p.end_date<today)
        .map(p=>({...p, done_at:((enrollRows||[]).find(e=>String(e.challenge_id)===String(p.id))||{}).done_at||''}))
        .sort((a,b)=>String(b.end_date).localeCompare(String(a.end_date)));
    }
  }catch(e){}
  _cgDoneChalIds=new Set(doneChals.map(p=>String(p.id)));
  try{ renderQuestMap(); }catch(e){}   // 완료한 챌린지로 옮긴 것은 참여 중 목록에서 뺀다
  const body=document.getElementById('chalDoneBody'); if(!body) return;
  const chalCards=doneChals.map(p=>{ const n=(Array.isArray(p.books)?p.books.length:0); const per=[p.start_date,p.end_date].filter(Boolean).map(d=>String(d).replace(/^\d{4}-/,'').replace('-','/')).join(' ~ ');
    return `<div class="ag-card" style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:10px"><div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:800">${esc(p.title||'')}</div><div style="font-size:12px;color:var(--text-light);margin-top:3px">${esc(p.type||'')}${n?` · ${n}권`:''}${per?` · ${esc(per)}`:''}${p.done_at?` · 완료 ${esc(_agDate(p.done_at))}`:''}</div></div><span style="font-size:12px;font-weight:800;color:#16a34a;background:rgba(22,163,74,.1);border-radius:99px;padding:4px 10px;flex:none">완료 ✓</span></div>`; }).join('');
  if(!done.length && !doneChals.length){ body.innerHTML='<div class="cg-empty">아직 완료한 챌린지가 없어요. 미션을 다 끝낸 챌린지는 기간이 끝나면 여기로 옮겨져요.</div>'; return; }
  _cgDoneRows=done; _cgDone=done.map(r=>r.book_id); _cgLoaded={}; _cgDoneOpen=false;
  _cgRenderDone();
  if(chalCards) body.insertAdjacentHTML('afterbegin', chalCards);
}
let _cgDoneChalIds=new Set();
const CG_DONE_LIMIT=4; let _cgDoneRows=[], _cgDoneOpen=false;
function _cgDoneCard(r,i){ const sc=CHALLENGE_SCENES[r.book_id]; const title=sc.bookTitle||cleanT((_bookById(r.book_id)||{}).title||r.book_id); const tot=r.quiz_total||_scQuizTotal(r.book_id); const d=r.updated_at?_agDate(r.updated_at):''; return `<div class="cg-done" onclick="cgToggleResult(${i})"><div class="cg-done-top"><span class="cg-badge">${IC_CHK} 완료</span><b>${esc(title)}</b><span class="cg-go" id="cggo-${i}">결과 보기 ▾</span></div><div class="cg-done-stats"><div><span>퀴즈 점수</span><b class="cg-v-score">${r.score||0}점</b></div><div><span>정답</span><b class="cg-v-ok">${r.quiz_ok||0} / ${tot}</b></div><div><span>한 줄 소감</span><b class="${r.impression?'cg-v-ok':'cg-v-muted'}">${r.impression?'작성 완료':'미작성'}</b></div><div><span>완료일</span><b>${d||'-'}</b></div></div></div><div class="cg-detail" id="cgdetail-${i}"></div>`; }
function _cgRenderDone(){
  const body=document.getElementById('chalDoneBody'); if(!body) return;
  const shown=_cgDoneOpen?_cgDoneRows:_cgDoneRows.slice(0,CG_DONE_LIMIT);
  _cgLoaded={};
  const more=_cgDoneRows.length>CG_DONE_LIMIT?`<div style="text-align:center;margin-top:6px"><button class="bm-btn" onclick="cgToggleDoneList()">${_cgDoneOpen?'접기 ▴':`완료 ${_cgDoneRows.length}개 전체 보기 ▾`}</button></div>`:'';
  body.innerHTML=shown.map((r,i)=>_cgDoneCard(r,i)).join('')+more;
}
function cgToggleDoneList(){ _cgDoneOpen=!_cgDoneOpen; _cgRenderDone(); }
async function cgToggleResult(i){
  const det=document.getElementById('cgdetail-'+i), go=document.getElementById('cggo-'+i);
  if(!det) return;
  const card=det.previousElementSibling;
  if(det.classList.contains('open')){ det.classList.remove('open'); if(card) card.classList.remove('active'); if(go) go.textContent='결과 보기 ▾'; return; }
  if(!_cgLoaded[i]){ det.innerHTML='<div class="cg-detail-inner"><div class="cg-empty" style="padding:6px 2px">불러오는 중…</div></div>'; const html=await _chalResultHTML(_cgDone[i], i); det.innerHTML=`<div class="cg-detail-inner">${html}</div>`; _cgLoaded[i]=true; }
  det.classList.add('open'); if(card) card.classList.add('active'); if(go) go.textContent='접기 ▴';
}
async function _chalResultHTML(bookId, ci){
  const sc=(typeof CHALLENGE_SCENES!=='undefined')?CHALLENGE_SCENES[bookId]:null; if(!sc) return '<div class="cg-empty">복습 데이터가 없어요.</div>';
  const s=bxStudent(); if(!s) return ''; const enc=encodeURIComponent(s.id);
  const [resA,qWrites]=await Promise.all([
    _agFetch(`bookstar_challenge_results?student_id=eq.${enc}&book_id=eq.${encodeURIComponent(bookId)}&select=ans,impression,quiz_ok,quiz_total,score,updated_at`),
    _agFetch(`bookstar_writings?student_id=eq.${enc}&book_id=eq.${encodeURIComponent(bookId)}&activity=eq.question&hidden=eq.false&select=text,created_at&order=created_at.desc`)
  ]);
  const res=(resA&&resA[0])||{}; const ans=res.ans||{}; const hasAns=Object.keys(ans).length>0;
  const items=[]; (sc.scenes||[]).forEach((scene,si)=>{ (scene.quiz||[]).forEach((q,qi)=>{ items.push({si,qi,scene,q}); }); });
  const tot=res.quiz_total||items.length;
  const ok=(res.quiz_ok!=null)?res.quiz_ok:items.filter(it=>{ const a=ans[it.si+'-'+it.qi]; return a&&a.ok; }).length;
  const pct=tot?Math.round(ok/tot*100):0;
  const circ='①②③④⑤⑥⑦⑧⑨⑩';
  const accs=items.map((it,idx)=>{ const key=it.si+'-'+it.qi; const a=ans[key]; const mine=a?a.pick:undefined; const isOk=a?!!a.ok:false;
    const opts=(it.q.opts||[]).map((o,oi)=>{ let cls='',mk=''; if(oi===it.q.correct){ cls=' correct'; mk=(oi===mine?'내 답 · 정답':'정답'); } else if(oi===mine){ cls=' wrong'; mk='내 답'; } return `<div class="cg-opt${cls}"><span class="on">${circ[oi]||(oi+1)+'.'}</span><span>${esc(o)}</span>${mk?`<span class="mk">${mk}</span>`:''}</div>`; }).join('');
    const st=esc(it.q.q); const k=ci+'-'+idx;
    const badge = a ? `<span class="cg-ox ${isOk?'cg-ox-o':'cg-ox-x'}">${isOk?'정답':'오답'}</span>` : `<span class="cg-ox cg-ox-n">해설</span>`;
    return `<div class="cg-acc" id="cgacc${k}"><div class="cg-acc-h" onclick="cgAccToggle('${k}')"><span class="num">${(idx+1<10?'0':'')+(idx+1)}</span><span class="at">${st}</span>${badge}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></div><div class="cg-acc-b"><div class="cg-review"><div class="cg-scene">${esc(it.scene.title||'')}</div>${it.scene.excerpt?`<div class="cg-quote">“${esc(it.scene.excerpt)}”</div>`:''}<div class="cg-q">Q. ${esc(it.q.q)}</div>${opts}${it.q.expl?`<div class="cg-bg"><b>배경 설명</b> ${esc(it.q.expl)}</div>`:''}</div></div></div>`;
  }).join('');
  const qqList=[]; if(res.impression) qqList.push({lab:'한 줄 소감',t:res.impression}); (qWrites||[]).forEach(w=>qqList.push({lab:'한 줄 질문',t:w.text}));
  const qq=qqList.length?qqList.map(x=>`<div class="cg-qq"><div><div style="font-size:12px;color:var(--text-light)">${x.lab}</div><div class="cg-qq-t">${esc(x.t)}</div></div></div>`).join(''):'<div class="cg-empty">이 책에 남긴 한 줄 글이 아직 없어요.</div>';
  const revLabel = hasAns
    ? `제목을 누르면 정답·내 답·배경 설명이 열려요. 총 ${items.length}문항.`
    : `이 회차는 문항별 채점 기록이 없어, 정답과 해설로 보여드려요. 총 ${items.length}문항.`;
  return `<div class="cg-gaugebox"><div class="cg-gauge" style="--p:${pct}"><div class="in"><div class="sc">${pct}</div><div class="sl">% 정답</div></div></div><div style="flex:1;min-width:180px"><div class="ag-subh" style="margin-bottom:6px">${hasAns?'문항별 복습':'문항 해설'} <span style="font-weight:600;color:var(--text-light);font-size:12px">· 퀴즈 ${ok}/${tot}</span></div><div style="font-size:12.5px;color:var(--text-light)">${revLabel}</div></div></div><div class="ag-div"></div>${accs||'<div class="cg-empty">복습할 문항이 없어요.</div>'}<div class="cg-qq-h">내가 남긴 한 줄</div>${qq}`;
}
function cgAccToggle(k){ const a=document.getElementById('cgacc'+k); if(a) a.classList.toggle('open'); }
async function openProfileEdit(){
  const s=bxStudent(); if(!s){ bxOpenPicker(); return; }
  let ov=document.getElementById('peOv');
  if(!ov){ ov=document.createElement('div'); ov.id='peOv'; ov.className='pe-ov'; ov.onclick=e=>{ if(e.target===ov) closeProfileEdit(); }; document.body.appendChild(ov); }
  let prof=null;
  try{ const r=await sbGet(`/bookstar_students?id=eq.${encodeURIComponent(s.id)}&select=bio,favorite_book_id`); if(r.ok){ const a=await r.json(); prof=Array.isArray(a)&&a[0]; } }catch(e){}
  _peEmoji=s.emoji||'📘'; const bio=(prof&&prof.bio)||'';
  ov.innerHTML=`<div class="pe">
    <div class="pe-h">프로필 편집</div>
    <div class="pe-lb">아바타</div>
    <div class="pe-emoji" id="peEmoji">${PE_EMOJI.map(e=>`<button class="pe-em${_peEmoji===e?' on':''}" onclick="peSetEmoji('${e}')">${e}</button>`).join('')}</div>
    <div class="pe-lb">상태메시지</div>
    <input class="pe-in" id="peBio" maxlength="60" placeholder="예: 오늘도 한 챕터씩" value="${esc(bio)}">
    <div class="pe-lb" style="color:var(--text-light);font-weight:500;margin-top:4px">인생책은 ‘내 책 모음 › 내 인생책’에서 골라요.</div>
    <div class="pe-btns">
      <button class="pe-btn cancel" onclick="closeProfileEdit()">취소</button>
      <button class="pe-btn save" onclick="saveProfile()">저장</button>
    </div>
  </div>`;
  ov.classList.add('on'); document.body.style.overflow='hidden';
}
function closeProfileEdit(){ const ov=document.getElementById('peOv'); if(ov) ov.classList.remove('on'); document.body.style.overflow=''; }
function peSetEmoji(e){ _peEmoji=e; document.querySelectorAll('#peEmoji .pe-em').forEach(b=>b.classList.toggle('on', b.textContent===e)); }
async function saveProfile(){
  const s=bxStudent(); if(!s) return;
  const bio=(document.getElementById('peBio')?.value||'').trim();
  try{ await sbWrite('PATCH',`/bookstar_students?id=eq.${encodeURIComponent(s.id)}`,{emoji:_peEmoji,bio},{prefer:'return=minimal'}); }catch(e){}
  s.emoji=_peEmoji; bxSetStudent(s);
  try{ const i=BX_STUDENTS.findIndex(x=>x.id===s.id); if(i>=0) BX_STUDENTS[i].emoji=_peEmoji; }catch(e){}
  closeProfileEdit();
  try{ bxRenderAccountChip(); }catch(e){}
  renderMyProfileTop();
  renderActivityGroup();
}
/* 마이페이지 — 내가 챌린지 미션으로 제출한 글 (bookstar_writings, 현재 학생) */
const WR_ACT={oneline:{t:'한 줄 소감',icon:'💬'},question:{t:'한 줄 질문',icon:'❓'},review:{t:'서평',icon:'📝'},essay:{t:'독후감',icon:'📜'},underline:{t:'핵심 문장',icon:'✏️'},recommend:{t:'책 추천',icon:'📚'}};
async function renderMyWritings(){
  const el=document.getElementById('myWritings'); if(!el) return;
  const stu=(typeof bxStudent==='function')&&bxStudent();
  if(!stu){ el.innerHTML=''; return; }
  let rows=[];
  try{
    const r=await sbGet(`/bookstar_writings?student_id=eq.${encodeURIComponent(stu.id)}&school_id=eq.${CH_SCHOOL}&hidden=eq.false&order=created_at.desc&select=*`);
    if(r.ok) rows=await r.json();
  }catch(e){}
  if(!Array.isArray(rows)||!rows.length){ el.innerHTML=''; return; }
  const bookTitle=id=>{
    const b=(typeof BOOKS!=='undefined')&&BOOKS.find(x=>x.id===id); if(b) return cleanT(b.title);
    try{ if(typeof CHAL_PUB!=='undefined') for(const c of CHAL_PUB){ const bk=(c.books||[]).find(x=>String(x.id)===String(id)); if(bk) return cleanT(bk.t||bk.title); } }catch(e){}
    return id;
  };
  el.innerHTML=`
    <div class="section-head" style="margin-top:40px"><div class="section-title"><em>내가 제출한 글</em> · 챌린지 미션 ${rows.length}건</div></div>
    <div class="mw-grid">${rows.map(w=>{
      const a=WR_ACT[w.activity]||{t:w.activity,icon:'📝'};
      const date=(w.created_at||'').slice(0,10);
      return `<div class="mw-card">
        <div class="mw-top"><span class="mw-badge">${a.icon} ${esc(a.t)}</span>
          <span class="mw-book">${esc(bookTitle(w.book_id))}</span>
          <span class="mw-date">${esc(date)}</span></div>
        <div class="mw-text">${esc(w.text||'')}</div></div>`;
    }).join('')}</div>`;
}
/* 마이페이지 — 별이 챌린지에서 남긴 한 줄 소감 + 점수 모음 */
function renderMyImpressions(){
  const el = document.getElementById('myImpressions');
  if(!el) return;
  const rows = [];
  for(const id of _chalAllIds()){   // 전체 책 기준(기존 CHALLENGE_SCENES 3권만 → 완독인증 소감 미표시 버그)
    const sv = _chalRead(id);
    if(!sv || !sv.impression) continue;
    const sc = (typeof CHALLENGE_SCENES !== 'undefined' && CHALLENGE_SCENES[id]) || null;
    const bk = (typeof BOOKS !== 'undefined' && BOOKS.find(b=>b.id===id)) || null;
    rows.push({title:(sc&&sc.bookTitle)||(bk&&bk.title)||id, author:(sc&&sc.author)||(bk&&bk.author)||'', impression:sv.impression, score:_chalBookScore(id)});
  }
  if(!rows.length){ el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="section-head" style="margin-top:48px;"><div class="section-title"><em>내가 남긴 생각</em> · 별이와 함께 읽으며</div></div>
    <div style="display:grid;gap:14px;">
      ${rows.map(r=>`
        <div style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid var(--gold,#b8860b);border-radius:14px;padding:18px 20px;">
          <div style="font-weight:800;font-size:14px;margin-bottom:9px;">${esc(r.title)} <span style="font-weight:500;color:var(--text-sub);font-size:13px;">· ${esc(r.author)}</span></div>
          <div style="font-size:15px;line-height:1.75;color:var(--text);">“${esc(r.impression)}”</div>
        </div>`).join('')}
    </div>`;
}

function checkSceneQuiz(el, si, qi, oi){
  const sc = (typeof CHALLENGE_SCENES !== 'undefined') ? CHALLENGE_SCENES[currentBook.id] : null;
  if(!sc) return;
  if(el.parentElement.querySelector('.correct, .wrong')) return; // 재응시 차단
  const q = sc.scenes[si].quiz[qi];
  const ok = (q.correct === oi);
  _sc.ans[si+'-'+qi] = {pick:oi, ok:ok};
  _scSave();
  if(ok){
    addScore(10, '장면 퀴즈', `${sc.bookTitle} 장면${si+1} Q${qi+1}`);
    el.classList.add('correct');
    quizFeedback(el, true, `🎉 정답! <b>+10점</b> · 누적 ${(SCORE_BASE+chalEarned()).toLocaleString()}점`);
  } else {
    el.classList.add('wrong');
    setTimeout(()=>{
      el.parentElement.querySelectorAll('.quiz-opt')[q.correct].classList.add('correct');
      quizFeedback(el, false, '아쉽네요 — 정답은 표시된 항목이에요 (재응시 불가)');
    }, 150);
  }
}
function sceneGo(d){
  const sc = (typeof CHALLENGE_SCENES !== 'undefined') ? CHALLENGE_SCENES[currentBook.id] : null;
  if(!sc) return;
  _sc.idx = Math.max(0, Math.min(sc.scenes.length, _sc.idx + d));
  renderViewer();
  const vb = document.getElementById('viewerBody');
  if(vb){ vb.scrollTop = 0; vb.querySelectorAll('.viewer-pane').forEach(p=>p.scrollTop=0); }
}
function submitSceneImpression(){
  const t = document.getElementById('scImpression');
  if(!t) return;
  const v = t.value.trim();
  if(v.length < 5){ readerToast('소감을 5자 이상 적어 주세요'); return; }
  const firstSubmit = !_sc.submitted;
  _sc.impression = v; _sc.submitted = true; _scSave();
  if(firstSubmit) bxEvent('activity',{sub:'oneline', book:currentBook, ref_table:'bookstar_challenge_results', ref_id:_bxSid()+'|'+currentBook.id, meta:{len:v.length, via:'scene'}});   // 측정: 활동(장면 챌린지 소감)
  const sc = CHALLENGE_SCENES[currentBook.id];
  const total = sc.scenes.reduce((s,x)=>s+x.quiz.length, 0);
  const okCnt = Object.values(_sc.ans).filter(a=>a.ok).length;
  if(firstSubmit){
    addScore(50, '한 줄 소감', sc.bookTitle);
    bsCelebrate({
      title:`『${esc(sc.bookTitle)}』<br>결정적 장면 챌린지 완료!`,
      sub:'퀴즈 결과와 소감은 성장 리포트의 재료가 됩니다',
      rows:[
        `장면 퀴즈 정답 ${okCnt}/${total} <b>+${okCnt*10}점</b>`,
        `한 줄 소감 <b>+50점</b>`,
        `누적 <b>${(SCORE_BASE+chalEarned()).toLocaleString()}점</b> — 마이페이지에서 확인`,
      ],
    });
  } else {
    readerToast('소감이 수정 저장되었어요');
  }
  renderViewer();
  try{ renderQuestMap(); renderChalScore(); renderMyImpressions(); }catch(e){}
}

function closeViewer(){
  _quizWanted = null;   // 상세 모달에서 고른 퀴즈 유형은 이번 뷰어 세션까지만(8/20)
  if(_scrollSaveTimer){ clearTimeout(_scrollSaveTimer); _scrollSaveTimer=null; }   // 대기 중 위치저장 디바운스 해제 — 닫힌 화면에서 발화하면 위치 오염
  if(_scnIO){ _scnIO.disconnect(); _scnIO=null; } _scnCur=-1; _scnMarkP=null;   // 장면 동기화 옵저버 정리
  if(_pg.on){ pgSave(); _pg.on=false; const pv=document.getElementById('pagedView'); if(pv) pv.style.display='none'; document.getElementById('viewerBody')?.classList.remove('pg-active'); }
  saveScrollPos();
  readerSessionEnd();
  try{ bxReadFlush(false); }catch(e){}   // 측정: 이번 읽기 세션 1줄
  closeSearch();
  closeNoteBox();
  const _hp=document.getElementById('hlPopup'); if(_hp) _hp.style.display='none';
  closeDict();
  document.getElementById('tocDrawer')?.classList.remove('open');
  document.getElementById('notesDrawer')?.classList.remove('open');
  if(document.fullscreenElement) document.exitFullscreen?.();
  document.querySelector('.viewer-shell')?.classList.remove('maxed');
  document.getElementById('viewerOverlay').classList.remove('open');
  try{ if(typeof renderQuestMap==='function') renderQuestMap(); }catch(e){}   // 8/18: '챌린지 닫기' 직후 내 챌린지 카드(퀴즈 n/N·점수) 즉시 반영
}

function finishChallenge(){
  bsCelebrate({
    title:'챌린지 수행 완료!',
    rows:[
      `선택 문장 <b>+50점</b>`,
      `퀴즈 만들기 <b>+100점</b> (AI 표절 검사 통과)`,
      `한 줄 소감 <b>+50점</b>`,
      `총 <b>+200점</b> 획득!`,
    ],
  });
  closeViewer();
}

