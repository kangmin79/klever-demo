/* ═══════════════════════════════════════════════════════════
   SVG 아이콘 (Lucide 스타일 — viewBox 24)
   ═══════════════════════════════════════════════════════════ */
// BODIES_SENT / KR_SENT 는 위(정적 bodies 로드 전)에서 var 전역으로 미리 선언함 — 선언 순서 버그 수정.
//  · BODIES_SENT: 문장정렬 데이터(상호 하이라이트) — bodies_*.js가 채움. 없으면 문단 단위 폴백.
//  · KR_SENT: 한국 고전 평행 리더(한국어↔다국어). KR_SENT[id]={zh|vi|en|ja:[[ [ko,tr] ],...]}
let KR_LANG = 'zh';                       // 현재 선택된 평행 번역 언어 (중→베→영→일 기본 중국어)
const KR_LANG_NAMES = {zh:'中文', vi:'Tiếng Việt', en:'English', ja:'日本語'};
const KR_BODY_P = {};
function krSlug(b){ const m=((b&&b.coverSrc)||'').match(/([^/]+)\.webp/); return m?m[1]:null; }
function ensureKrBody(b){                  // 평행 번역 bodies 지연 로드 (해외 ensureForeignBody의 한국 고전판)
  const id=b&&b.id, slug=krSlug(b);
  if(!id||!id.startsWith('kr-')||!slug) return Promise.resolve();
  if(KR_SENT[id]) return Promise.resolve();
  if(KR_BODY_P[id]) return KR_BODY_P[id];
  KR_BODY_P[id]=new Promise(res=>{ const s=document.createElement('script');
    s.src='bodies_'+slug+'.js'+(typeof BODIES_VER!=='undefined'?'?b='+BODIES_VER:'');
    s.onload=res;
    s.onerror=()=>{ delete KR_BODY_P[id]; s.remove(); res(); };   // 실패분 캐시 삭제 — 다음 열기 때 재시도
    document.head.appendChild(s); });
  return KR_BODY_P[id];
}
// 속표지 '이 책은' 칸의 다국어 소개글(218KB) — 첫 화면 로딩을 늦추지 않게 읽기 화면에서 처음 필요할 때만 받는다
let _sumMLP=null;
function ensureSummaryML(){
  if(typeof CLASSIC_SUMMARY_ML!=='undefined') return Promise.resolve();
  if(_sumMLP) return _sumMLP;
  _sumMLP=new Promise(res=>{ const s=document.createElement('script');
    s.src='data/classics_summaries_multi.js?v=260902e';   // 소개글 파일이 바뀌면 이 숫자를 올린다(본문 파일 캐시와 별개). 9/2e 해외 고전분 추가
    s.onload=res;
    s.onerror=()=>{ _sumMLP=null; s.remove(); res(); };   // 실패해도 한국어 소개글로 폴백되므로 그냥 진행
    document.head.appendChild(s); });
  return _sumMLP;
}
function applyKrLang(id){                  // 선택 언어를 BODIES_SENT에 주입 → 기존 sentHtml 평행 렌더 재사용
  const d=KR_SENT[id]; if(!d) return;
  const lang=d[KR_LANG]?KR_LANG:(Object.keys(d)[0]); KR_LANG=lang;
  if(d[lang]) BODIES_SENT[id]=d[lang];
}
function setKrLang(lang){                  // 뷰어 언어 셀렉터 → 언어 전환 + 재렌더
  KR_LANG=lang;
  // 재렌더로 pane이 새로 만들어지므로 setMode와 동일 체인으로 전부 재초기화
  // (기존: applyReaderPrefs만 → 스크롤 리스너·형광펜·읽던 위치·TOC가 죽던 버그)
  // 9/2: 재렌더 뒤 restoreScrollPos는 "마지막 저장 위치"로 가므로(저장은 디바운스) 바꾸기 직전 지금 자리를 먼저 저장 — 언어 바꿀 때 자리 튐 방지
  if(currentBook){ saveScrollPos(); applyKrLang(currentBook.id); renderViewer();
    setTimeout(()=>{ applyReaderPrefs(); buildTOC(); restoreHighlights(); restoreScrollPos(); updateModeClass(); attachScrollListener(); updatePaneToggleVisibility(); if(pgEligible()){ _pg.on=false; enterPageMode(); } }, 0); }
}
const SVG = {
  user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bookOpen:    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  library:     '<path d="M16 6l4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  sparkles:    '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3l.6 1.8L21 5l-1.4.2L19 7l-.6-1.8L17 5l1.4-.2z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8z"/>',
  target:      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trophy:      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55.47.98.97 1.21C12.15 18.75 13 20.24 13 22"/><path d="M14 14.66V17c0 .55-.47.98-.97 1.21C11.85 18.75 11 20.24 11 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  flame:       '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  search:      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  building:    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01"/><path d="M12 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/>',
  globe:       '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  bell:        '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon:        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>',
  check:       '<polyline points="20 6 9 17 4 12"/>',
  lock:        '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  arrowRight:  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  arrowLeft:   '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  x:           '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>',
  pen:         '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  fileText:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  award:       '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  list:        '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  bookmark:    '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  columns:     '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>',
  volume:      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  maximize:    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  contrast:    '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12z"/>',
  type:        '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
};

const ic = (name, cls='icon') => `<svg class="${cls}" viewBox="0 0 24 24">${SVG[name]||''}</svg>`;

