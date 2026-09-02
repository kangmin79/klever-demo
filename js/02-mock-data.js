/* ═══════════════════════════════════════════════════════════
   Mock 데이터
   ═══════════════════════════════════════════════════════════ */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 서지 텍스트에 박혀오는 HTML 엔티티(&#40;=( &amp;=& 등) 방어 디코드 — esc() 직전에 한 번. 깨끗한 텍스트엔 무영향.
const _ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decEnt = (s) => String(s ?? '')
  .replace(/&#x([0-9a-fA-F]+);/g,(_,h)=>String.fromCodePoint(parseInt(h,16)))
  .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(parseInt(d,10)))
  .replace(/&([a-zA-Z]+);/g,(_,n)=>_ENT[n.toLowerCase()]??`&${n};`);
const escD = (s) => esc(decEnt(s)); // 디코드 후 안전 인코딩(서지 표시용)
// 챗 말풍선용 경량 마크다운: **굵게**만 <b>로(LLM이 가끔 markdown을 씀). 나머지는 esc 그대로(줄바꿈은 CSS pre-wrap이 처리).
const mdLite = (s) => esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

/* ===== 리치 본문 sanitize (관리자 에디터와 동일 화이트리스트) — 공지/커뮤니티 본문 렌더용 ===== */
const RT_ALLOW={B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,H3:1,H4:1,P:1,BR:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,A:1,IMG:1,SPAN:1,DIV:1,HR:1,FONT:1,
  TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1,CAPTION:1,COLGROUP:1,COL:1,FIGURE:1,IFRAME:1};
const RT_EMBED_OK=/^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)[\w\-?=&;%.]+$/;
const RT_CLASS_OK={'rt-table':1,'rt-embed':1,'rt-file':1};
const RT_STYLE_OK=/^(color|background-color|background|text-align|font-weight|font-style|font-size|text-decoration|text-decoration-line)$/;
function safeStyle(v){
  return String(v||'').split(';').map(s=>s.trim()).filter(Boolean).filter(d=>{
    const i=d.indexOf(':'); if(i<0)return false;
    const prop=d.slice(0,i).trim().toLowerCase(), val=d.slice(i+1).trim().toLowerCase();
    if(!RT_STYLE_OK.test(prop))return false;
    if(/url\(|expression|javascript:|@import|<|>/.test(val))return false;
    return true;
  }).join('; ');
}
function sanitizeHtml(html){
  const box=document.createElement('div'); box.innerHTML=String(html||'');
  (function clean(node){
    [...node.childNodes].forEach(clean);
    if(node.nodeType===8){node.remove();return;}
    if(node.nodeType!==1)return;
    const tag=node.tagName;
    if(!RT_ALLOW[tag]){
      if(/^(SCRIPT|STYLE|OBJECT|EMBED|LINK|META|FORM|INPUT|SVG)$/.test(tag)){node.remove();return;}
      const p=node.parentNode; if(p){while(node.firstChild)p.insertBefore(node.firstChild,node);p.removeChild(node);} return;
    }
    if(tag==='IFRAME'){
      const src=node.getAttribute('src')||'';
      if(!RT_EMBED_OK.test(src)){node.remove();return;}
      [...node.attributes].forEach(a=>{ if(!/^(src|allow|allowfullscreen|loading)$/.test(a.name.toLowerCase()))node.removeAttribute(a.name); });
      return;
    }
    [...node.attributes].forEach(a=>{
      const an=a.name.toLowerCase(), av=a.value||'';
      if(tag==='A'&&an==='href'){ if(/^\s*(javascript|data):/i.test(av)){node.removeAttribute(a.name);} }
      else if(tag==='IMG'&&an==='src'){ if(/^\s*javascript:/i.test(av)){node.removeAttribute(a.name);} }
      else if(tag==='IMG'&&an==='alt'){ }
      else if((tag==='TD'||tag==='TH')&&(an==='colspan'||an==='rowspan')){ if(!/^\d{1,2}$/.test(av))node.removeAttribute(a.name); }
      else if(tag==='FONT'&&an==='color'){ if(/[<>"]|javascript:/i.test(av))node.removeAttribute(a.name); }
      else if(an==='class'){ const ok=av.split(/\s+/).filter(c=>RT_CLASS_OK[c]); if(ok.length){node.setAttribute('class',ok.join(' '));}else{node.removeAttribute('class');} }
      else if(an==='style'){ const s=safeStyle(av); if(s){node.setAttribute('style',s);}else{node.removeAttribute('style');} }
      else { node.removeAttribute(a.name); }
    });
    if(tag==='A'){ node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); }
  })(box);
  return box.innerHTML.trim();
}

const Student = {
  name:'김민서', school:'한국대학교', score:1842, streak:7,
  booksDone:4, quizzes:12, reviews:3, rank:14, hours:14.5,
};

