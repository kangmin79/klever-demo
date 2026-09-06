/* ═══ 문장 인용 카드 (본문 선택 → canvas 이미지 카드로 공유·저장) ═══ */
const QC_THEMES=[
  {id:'night', label:'네이비',   bg:['#1a2544','#0e1730'], fg:'#f4f1e8', accent:'#e0b64a', rule:'rgba(224,182,74,.55)'},
  {id:'cream', label:'크림',     bg:['#f7f1e1','#efe6cf'], fg:'#3a3222', accent:'#a9791f', rule:'rgba(169,121,31,.45)'},
  {id:'forest',label:'포레스트', bg:['#12362c','#0b241d'], fg:'#eef3ec', accent:'#8fd0a7', rule:'rgba(143,208,167,.5)'},
  {id:'ink',   label:'잉크',     bg:['#22242a','#111318'], fg:'#f2f2f2', accent:'#c9a227', rule:'rgba(201,162,39,.55)'},
];
let _qc={text:'', alt:'', theme:'night'};
function _qcPair(){   // 선택이 문장정렬 span 안이면 반대 언어 짝을 반환(원문·번역 함께 담기용)
  try{
    const sel=window.getSelection();
    const r=_lastSelectionRange || (sel&&sel.rangeCount?sel.getRangeAt(0):null); if(!r) return null;
    let el=r.startContainer; el=el.nodeType===1?el:el.parentElement;
    const span=el&&el.closest('span.psent'); if(!span) return null;
    const grp=((typeof BODIES_SENT!=='undefined'&&BODIES_SENT[currentBook.id])||[])[+span.dataset.pi];
    const g=grp&&grp[+span.dataset.sg]; if(!g) return null;
    const inLeft=!!span.closest('.viewer-pane.left');
    const self=((inLeft?g[0]:g[1])||'').trim(), alt=((inLeft?g[1]:g[0])||'').trim();
    return self?{self,alt}:null;
  }catch(e){ return null; }
}
function openQuoteCard(){
  if(!currentBook) return;
  const sel=window.getSelection();
  let text=((_lastSelectionRange?_lastSelectionRange.toString():(sel?sel.toString():''))||'').trim();
  const pair=_qcPair();
  if(pair){ text=pair.self; _qc.alt=pair.alt; } else { _qc.alt=''; }
  if(!text){ readerToast('먼저 카드로 담을 문장을 드래그해 주세요'); return; }
  if(text.length>300) text=text.slice(0,300).replace(/\s+\S*$/,'')+'…';
  if(_qc.alt.length>300) _qc.alt=_qc.alt.slice(0,300).replace(/\s+\S*$/,'')+'…';   // 번역쪽도 컷 — 긴 문장쌍이 푸터·브랜딩 침범 방지
  _qc.text=text;
  const hp=document.getElementById('hlPopup'); if(hp) hp.style.display='none';
  document.getElementById('qcBiWrap').style.display=_qc.alt?'flex':'none';
  document.getElementById('qcBi').checked=false;
  document.getElementById('qcThemes').innerHTML=QC_THEMES.map(t=>
    `<span class="qc-theme${t.id===_qc.theme?' on':''}" data-t="${t.id}" title="${t.label}" style="background:linear-gradient(135deg,${t.bg[0]},${t.bg[1]})" onclick="setQuoteTheme('${t.id}')"></span>`).join('');
  { const _sb=document.getElementById('qcShareBtn'); if(_sb) _sb.style.display='none'; }   // 공유 버튼 삭제(8/18)
  document.getElementById('qcOverlay').classList.add('open');
  renderQuoteCard();
}
function setQuoteTheme(id){ _qc.theme=id; document.querySelectorAll('.qc-theme').forEach(e=>e.classList.toggle('on',e.dataset.t===id)); renderQuoteCard(); }
function closeQuoteCard(){ document.getElementById('qcOverlay').classList.remove('open'); }
function _qcClip(s,n){ s=(s||'').trim(); return s.length>n?s.slice(0,n)+'…':s; }
function _qcFilename(){ return '북픽_'+((_qcClip(currentBook.title,16)||'인용').replace(/[\\/:*?"<>|]/g,''))+'.png'; }
function _qcWrap(ctx,text,maxW){   // 공백 기준 줄바꿈, 공백 없는 긴 토큰(한국어)은 글자단위로
  const lines=[];
  (text||'').split('\n').forEach(para=>{
    let line=''; const push=()=>{ lines.push(line); line=''; };
    para.split(/(\s+)/).forEach(tok=>{
      if(tok==='') return;
      if(ctx.measureText(tok).width>maxW){
        for(const ch of tok){ if(line!==''&&ctx.measureText(line+ch).width>maxW) push(); line+=ch; }
        return;
      }
      if(line.trim()!==''&&ctx.measureText(line+tok).width>maxW){ push(); if(/^\s+$/.test(tok)) return; }
      line+=tok;
    });
    push();
  });
  return lines.map(l=>l.trim()).filter((l,i,a)=>l!==''||a.length===1);
}
function renderQuoteCard(){
  const cv=document.getElementById('qcCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'); const W=cv.width, H=cv.height;
  const t=QC_THEMES.find(x=>x.id===_qc.theme)||QC_THEMES[0];
  const bi=document.getElementById('qcBi').checked && !!_qc.alt;
  const grad=ctx.createLinearGradient(0,0,W,H); grad.addColorStop(0,t.bg[0]); grad.addColorStop(1,t.bg[1]);
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  const PAD=96, cw=W-PAD*2;
  ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  // 여는 따옴표(배경 장식)
  ctx.fillStyle=t.accent; ctx.globalAlpha=.30; ctx.font='700 230px Georgia,serif';
  ctx.fillText('“', PAD-18, PAD+160); ctx.globalAlpha=1;
  const serifFont=s=>`600 ${s}px "Noto Serif KR","Nanum Myeongjo",Georgia,serif`;
  const primary=_qc.text, len=primary.length;
  let fs=len<40?60:len<80?52:len<140?44:len<210?37:31;
  const footerH=210, avail=H-PAD*2-footerH-56;   // 텍스트 시작(y=246)~괘선(y=868) 실측 622px에 맞춤
  let pLines,aLines,afs,alh,lhF,totalH;
  for(;;){
    lhF=fs*1.5; afs=Math.max(20,Math.round(fs*0.62)); alh=afs*1.5;
    ctx.font=serifFont(fs); pLines=_qcWrap(ctx,primary,cw);
    aLines=[]; if(bi){ ctx.font=serifFont(afs); aLines=_qcWrap(ctx,_qc.alt,cw); }
    totalH=pLines.length*lhF+(bi?(28+aLines.length*alh):0);
    if(totalH<=avail||fs<=22) break;
    fs-=3;
  }
  // 최소 크기(fs=22)로도 안 들어가면 번역 줄을 잘라내 푸터 침범·캔버스 밖 잘림 방지
  if(totalH>avail && bi && aLines.length){
    const maxA=Math.max(1, Math.floor((avail-pLines.length*lhF-28)/alh));
    if(aLines.length>maxA){
      aLines=aLines.slice(0,maxA);
      aLines[maxA-1]=aLines[maxA-1].replace(/\s*\S{0,2}$/,'')+'…';
      totalH=pLines.length*lhF+28+aLines.length*alh;
    }
  }
  let y=PAD+150+Math.max(0,(avail-totalH)/2);
  ctx.fillStyle=t.fg; ctx.font=serifFont(fs);
  pLines.forEach(l=>{ ctx.fillText(l,PAD,y); y+=lhF; });
  if(bi&&aLines.length){
    y+=10; ctx.fillStyle=t.accent; ctx.globalAlpha=.92; ctx.font=serifFont(afs);
    aLines.forEach(l=>{ ctx.fillText(l,PAD,y); y+=alh; }); ctx.globalAlpha=1;
  }
  // 출처 + 브랜딩
  const by=H-PAD-92;
  ctx.strokeStyle=t.rule; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(PAD,by-24); ctx.lineTo(PAD+92,by-24); ctx.stroke();
  ctx.fillStyle=t.fg; ctx.font='700 34px "Noto Serif KR",Georgia,serif';
  ctx.fillText('『'+_qcClip(currentBook.title,20)+'』', PAD, by+24);
  if(currentBook.author){ ctx.fillStyle=t.accent; ctx.globalAlpha=.85; ctx.font='500 27px "Noto Sans KR",sans-serif';
    ctx.fillText(_qcClip(currentBook.author,26), PAD, by+64); ctx.globalAlpha=1; }
  ctx.textAlign='right'; ctx.fillStyle=t.accent; ctx.font='800 28px "Noto Sans KR",sans-serif';
  ctx.fillText('북픽', W-PAD, by+24);
  ctx.fillStyle=t.fg; ctx.globalAlpha=.55; ctx.font='500 22px "Noto Sans KR",sans-serif';
  ctx.fillText('bookstar.co.kr', W-PAD, by+58); ctx.globalAlpha=1;
  ctx.textAlign='left';
}
function saveQuoteCard(){
  document.getElementById('qcCanvas').toBlob(async b=>{
    if(!b){ readerToast('이미지 생성에 실패했어요'); return; }
    // iOS(특히 카톡·인스타 인앱 브라우저)는 a.download가 조용히 무시됨 → 공유 시트로 '사진에 저장' 유도
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
    if(ios && navigator.canShare && navigator.share){
      try{
        const file=new File([b],_qcFilename(),{type:'image/png'});
        if(navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return; }
      }catch(e){ if(e&&e.name==='AbortError') return; }   // 사용자가 시트를 닫음 — 그대로 종료
    }
    const url=URL.createObjectURL(b), a=document.createElement('a');
    a.href=url; a.download=_qcFilename(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000); readerToast('이미지를 저장했어요');
  },'image/png');
}
function shareQuoteCard(){
  document.getElementById('qcCanvas').toBlob(async b=>{
    if(!b){ readerToast('이미지 생성에 실패했어요'); return; }
    const file=new File([b],_qcFilename(),{type:'image/png'});
    try{
      if(navigator.canShare&&navigator.canShare({files:[file]})) await navigator.share({files:[file], text:'『'+currentBook.title+'』 — 북픽'});
      else saveQuoteCard();
    }catch(e){ if(!e||e.name!=='AbortError') saveQuoteCard(); }   // 공유 불가(권한 소멸 등)면 저장으로 폴백 — "눌렀는데 무반응" 방지
  },'image/png');
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&document.getElementById('qcOverlay')?.classList.contains('open')){ e.stopPropagation(); closeQuoteCard(); }},true);

