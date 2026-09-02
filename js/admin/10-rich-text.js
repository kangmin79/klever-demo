/* ===== 리치 텍스트 에디터 (자체 contenteditable, 의존성 0) — 공지/커뮤니티 공용 ===== */
// 허용 태그 화이트리스트 (sanitize 기준) — 공지·커뮤니티 본문에서 쓰는 것만
const RT_ALLOW={B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,H3:1,H4:1,P:1,BR:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,A:1,IMG:1,SPAN:1,DIV:1,HR:1,FONT:1,
  TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1,CAPTION:1,COLGROUP:1,COL:1,FIGURE:1,IFRAME:1};
// 동영상 임베드 허용 출처(유튜브/비메오 embed만)
const RT_EMBED_OK=/^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)[\w\-?=&;%.]+$/;
// 살아남는 클래스 화이트리스트(표·동영상·파일 스타일용)
const RT_CLASS_OK={'rt-table':1,'rt-embed':1,'rt-file':1};
// 허용 CSS 속성(색·정렬·강조만). url()/expression/javascript 차단
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
    [...node.childNodes].forEach(clean);              // 자식 먼저(후위 순회)
    if(node.nodeType===8){node.remove();return;}      // 주석 제거
    if(node.nodeType!==1)return;                        // 텍스트는 그대로
    const tag=node.tagName;
    if(!RT_ALLOW[tag]){
      if(/^(SCRIPT|STYLE|OBJECT|EMBED|LINK|META|FORM|INPUT|SVG)$/.test(tag)){node.remove();return;}
      const p=node.parentNode; if(p){while(node.firstChild)p.insertBefore(node.firstChild,node);p.removeChild(node);} return; // 그 외는 껍데기만 벗김
    }
    if(tag==='IFRAME'){ // 동영상 임베드: 허용 출처만, 안전 속성만
      const src=node.getAttribute('src')||'';
      if(!RT_EMBED_OK.test(src)){node.remove();return;}
      [...node.attributes].forEach(a=>{ if(!/^(src|allow|allowfullscreen|loading)$/.test(a.name.toLowerCase()))node.removeAttribute(a.name); });
      return;
    }
    [...node.attributes].forEach(a=>{
      const an=a.name.toLowerCase(), av=a.value||'';
      if(tag==='A'&&an==='href'){ if(/^\s*(javascript|data):/i.test(av)){node.removeAttribute(a.name);} }
      else if(tag==='IMG'&&an==='src'){ if(/^\s*javascript:/i.test(av)){node.removeAttribute(a.name);} }
      else if(tag==='IMG'&&an==='alt'){ /* keep */ }
      else if((tag==='TD'||tag==='TH')&&(an==='colspan'||an==='rowspan')){ if(!/^\d{1,2}$/.test(av))node.removeAttribute(a.name); }
      else if(tag==='FONT'&&an==='color'){ if(/[<>"]|javascript:/i.test(av))node.removeAttribute(a.name); } // 구형 색 태그
      else if(an==='class'){ const ok=av.split(/\s+/).filter(c=>RT_CLASS_OK[c]); if(ok.length){node.setAttribute('class',ok.join(' '));}else{node.removeAttribute('class');} }
      else if(an==='style'){ const s=safeStyle(av); if(s){node.setAttribute('style',s);}else{node.removeAttribute('style');} } // 안전한 색·정렬만
      else { node.removeAttribute(a.name); }            // class·on* 등 나머지 제거
    });
    if(tag==='A'){ node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); }
  })(box);
  return box.innerHTML.trim();
}
let RT_CUR=null;                                          // 현재 포커스된 에디터
let RT_RANGE=null;                                        // 마지막 커서 위치(파일창 열려 포커스 빠져도 복원)
function rtSaveRange(){const s=window.getSelection();if(s&&s.rangeCount&&RT_CUR&&RT_CUR.contains(s.anchorNode))RT_RANGE=s.getRangeAt(0).cloneRange();}
function rtFocusRange(ed){ if(ed)ed.focus(); if(RT_RANGE&&ed&&ed.contains(RT_RANGE.commonAncestorContainer)){const s=window.getSelection();s.removeAllRanges();s.addRange(RT_RANGE);} }
// 에디터 초기화: host(<div id=...>)에 툴바+편집영역 주입. 반환=편집영역 element
function rtInit(host, placeholder, initialHtml){
  if(typeof host==='string')host=el(host);
  host.classList.add('rt-wrap');
  const SV=(p)=>`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${p}</svg>`;
  const ICO={
    left:SV('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>'),
    center:SV('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>'),
    right:SV('<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/>'),
    link:SV('<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-2 2"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l2-2"/>'),
    image:SV('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5L5 20"/>'),
    video:SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>'),
    file:SV('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    table:SV('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>'),
    eraser:SV('<path d="M4 15l7-7 7 7-5 5H9z"/><line x1="4" y1="20" x2="20" y2="20"/>'),
  };
  const tools=[
    ['bold','<b>가</b>','굵게'],['italic','<i>가</i>','기울임'],['underline','<u>가</u>','밑줄'],['strike','<s>가</s>','취소선'],['|'],
    ['color','<b style="color:#c0392b">가</b>','글자색'],['hilite','<b style="background:#fff3a3;padding:0 3px;border-radius:3px">가</b>','형광펜'],['size','글자 크기 ▾','글자 크기'],['|'],
    ['h3','제목','소제목'],['p','본문','본문'],['|'],
    ['left',ICO.left,'왼쪽 정렬'],['center',ICO.center,'가운데 정렬'],['right',ICO.right,'오른쪽 정렬'],['|'],
    ['ul','• 목록','글머리 목록'],['ol','1. 목록','번호 목록'],['quote','❝ 인용','인용'],['table',ICO.table+' 표','표 삽입·편집'],['hr','─ 구분선','구분선'],['|'],
    ['link',ICO.link+' 링크','링크'],['image',ICO.image+' 이미지','이미지'],['video',ICO.video+' 동영상','동영상(유튜브)'],['file',ICO.file+' 파일','파일 첨부'],['|'],
    ['clear',ICO.eraser+' 서식지우기','서식 지우기'],
  ];
  const tb=tools.map(t=>t[0]==='|'?'<span class="rt-sep"></span>'
    :`<button type="button" data-cmd="${t[0]}" title="${t[2]}" onmousedown="event.preventDefault()" onclick="rtDo('${t[0]}',this)">${t[1]}</button>`).join('');
  host.innerHTML=`<div class="rt-tb">${tb}</div><div class="rt-ed" contenteditable="true" data-ph="${esc(placeholder||'내용을 입력하세요')}"></div>`;
  const ed=host.querySelector('.rt-ed');
  ed.innerHTML = initialHtml ? sanitizeHtml(initialHtml) : '';
  ed.addEventListener('focus',()=>{RT_CUR=ed;host.classList.add('focus');try{document.execCommand('defaultParagraphSeparator',false,'p');document.execCommand('styleWithCSS',false,true);}catch(e){}});
  ed.addEventListener('blur',()=>host.classList.remove('focus'));
  ['keyup','mouseup','input'].forEach(ev=>ed.addEventListener(ev,rtSaveRange)); // 커서 위치 추적
  // 붙여넣기: 이미지면 업로드, 텍스트면 plain 으로
  ed.addEventListener('paste',e=>{
    const items=[...(e.clipboardData?.items||[])];
    const img=items.find(it=>it.type&&it.type.startsWith('image/'));
    if(img){e.preventDefault();const f=img.getAsFile();if(f)rtUploadInsert(ed,f);return;}
    e.preventDefault();
    const text=(e.clipboardData||window.clipboardData).getData('text/plain');
    document.execCommand('insertText',false,text);
  });
  // 드래그&드롭 이미지
  ed.addEventListener('dragover',e=>{e.preventDefault();ed.classList.add('drag');});
  ed.addEventListener('dragleave',()=>ed.classList.remove('drag'));
  ed.addEventListener('drop',e=>{
    e.preventDefault();ed.classList.remove('drag');RT_CUR=ed;
    const f=[...(e.dataTransfer?.files||[])].find(x=>x.type.startsWith('image/'));
    if(f)rtUploadInsert(ed,f);
  });
  return ed;
}
function rtGet(host){ if(typeof host==='string')host=el(host); const ed=host.querySelector('.rt-ed'); return ed?sanitizeHtml(ed.innerHTML):''; }
function rtSet(host, html){ if(typeof host==='string')host=el(host); const ed=host.querySelector('.rt-ed'); if(ed)ed.innerHTML=sanitizeHtml(html||''); }
// 본문이 사실상 비었는지(태그만 있고 글자·이미지 없음)
function rtEmpty(host){ const h=rtGet(host); const t=document.createElement('div'); t.innerHTML=h; return !(t.textContent.trim()||t.querySelector('img')); }
const RT_TEXT_COLORS=['#1a2942','#c0392b','#e8590c','#d4a93b','#2e7d57','#2563c9','#7c3aed','#64748b'];
const RT_HILITE_COLORS=['#fff3a3','#ffd6e7','#c8f7d4','#cfe8ff','#ffe0b3','#e9d5ff'];
function rtDo(cmd,btn){
  const ed=RT_CUR; if(!ed){ if(cmd!=='image'){toast('내용 칸을 먼저 클릭해주세요');return;} }
  if(ed){ed.focus();try{document.execCommand('styleWithCSS',false,true);}catch(e){}}
  if(cmd==='bold')document.execCommand('bold');
  else if(cmd==='italic')document.execCommand('italic');
  else if(cmd==='underline')document.execCommand('underline');
  else if(cmd==='strike')document.execCommand('strikeThrough');
  else if(cmd==='h3')document.execCommand('formatBlock',false,'h3');
  else if(cmd==='p')document.execCommand('formatBlock',false,'p');
  else if(cmd==='left')document.execCommand('justifyLeft');
  else if(cmd==='center')document.execCommand('justifyCenter');
  else if(cmd==='right')document.execCommand('justifyRight');
  else if(cmd==='ul')document.execCommand('insertUnorderedList');
  else if(cmd==='ol')document.execCommand('insertOrderedList');
  else if(cmd==='quote')document.execCommand('formatBlock',false,'blockquote');
  else if(cmd==='hr')document.execCommand('insertHorizontalRule');
  else if(cmd==='clear'){document.execCommand('removeFormat');document.execCommand('formatBlock',false,'p');}
  else if(cmd==='color')rtPalette('color',btn);
  else if(cmd==='hilite')rtPalette('hilite',btn);
  else if(cmd==='size')rtSizeMenu(btn);
  else if(cmd==='table')rtTable(btn);
  else if(cmd==='video')rtVideo();
  else if(cmd==='file')rtFile();
  else if(cmd==='link'){
    const hadSel = RT_RANGE && !RT_RANGE.collapsed && String(RT_RANGE).trim();
    const u=prompt(hadSel? '선택한 글자에 걸 링크 주소 (https://...)' : '링크 주소 (선택한 글자 없으면 주소가 그대로 글자로 들어가요)');
    if(u){
      const url=/^https?:\/\//i.test(u)?u:'https://'+u;
      rtFocusRange(ed);
      if(hadSel){ document.execCommand('createLink',false,url); }
      else { document.execCommand('insertHTML',false,`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`); }
    }
  }
  else if(cmd==='image'){rtPickImage();}
}
/* ── 표 ── */
function rtCurTable(){const s=window.getSelection();let n=s&&s.anchorNode;while(n&&n!==document.body){if(n.nodeType===1&&n.tagName==='TABLE'&&RT_CUR&&RT_CUR.contains(n))return n;n=n.parentNode;}return null;}
function rtCurCell(){const s=window.getSelection();let n=s&&s.anchorNode;while(n&&n!==document.body){if(n.nodeType===1&&(n.tagName==='TD'||n.tagName==='TH'))return n;n=n.parentNode;}return null;}
function rtTable(btn){
  const ed=RT_CUR; if(!ed){toast('내용 칸을 먼저 클릭해주세요');return;}
  if(rtCurTable())rtTableMenu(btn); else rtTableGrid(btn);
}
function rtTableGrid(btn){
  const pop=rtPop(); pop.className='rt-pop tbl';
  let cells=''; for(let r=1;r<=6;r++)for(let c=1;c<=6;c++)
    cells+=`<i data-r="${r}" data-c="${c}" onmouseover="rtTblHover(${r},${c})" onmousedown="event.preventDefault()" onclick="rtTblInsert(${r},${c})"></i>`;
  pop.innerHTML=`<div class="rt-tblgrid">${cells}</div><div class="rt-tbllbl" id="rtTblLbl">표 크기를 고르세요</div>`;
  rtPopAt(pop,btn);
}
function rtTblHover(r,c){const pop=el('rtPalette');if(!pop)return;[...pop.querySelectorAll('.rt-tblgrid i')].forEach(i=>i.classList.toggle('on',(+i.dataset.r<=r&&+i.dataset.c<=c)));const l=el('rtTblLbl');if(l)l.textContent=c+' × '+r;}
function rtTblInsert(r,c){
  const ed=RT_CUR; rtFocusRange(ed);
  let h='<table class="rt-table"><tbody>';
  for(let i=0;i<r;i++){h+='<tr>';for(let j=0;j<c;j++)h+=(i===0?'<th>제목</th>':'<td>내용</td>');h+='</tr>';}
  h+='</tbody></table><p><br></p>';
  document.execCommand('insertHTML',false,h);
  const pop=el('rtPalette'); if(pop)pop.classList.remove('on');
}
function rtTableMenu(btn){
  const pop=rtPop(); pop.className='rt-pop list';
  pop.innerHTML=[['rowAdd','행 추가(아래)'],['colAdd','열 추가(오른쪽)'],['rowDel','행 삭제'],['colDel','열 삭제'],['del','표 삭제']].map(o=>
    `<div class="rt-mi" onmousedown="event.preventDefault()" onclick="rtTblOp('${o[0]}')">${o[1]}</div>`).join('');
  rtPopAt(pop,btn);
}
function rtTblOp(op){
  const tbl=rtCurTable(), cell=rtCurCell();
  const pop=el('rtPalette'); if(pop)pop.classList.remove('on');
  if(!tbl){return;}
  const rows=[...tbl.rows]; const ci=cell?cell.cellIndex:0; const ri=cell?cell.parentNode.rowIndex:0;
  if(op==='del'){tbl.remove();return;}
  if(op==='rowAdd'){const cols=rows[0]?rows[0].cells.length:1;const tr=tbl.insertRow(ri+1);for(let j=0;j<cols;j++){tr.insertCell(j).textContent='내용';}}
  else if(op==='colAdd'){rows.forEach((row,i)=>{const td=document.createElement(i===0?'th':'td');td.textContent=i===0?'제목':'내용';row.insertBefore(td,row.cells[ci+1]||null);});}
  else if(op==='rowDel'){if(rows.length>1)tbl.deleteRow(ri);else toast('마지막 행은 지울 수 없어요');}
  else if(op==='colDel'){if(rows[0]&&rows[0].cells.length>1)rows.forEach(row=>{if(row.cells[ci])row.deleteCell(ci);});else toast('마지막 열은 지울 수 없어요');}
  if(RT_CUR)RT_CUR.focus();
}
/* ── 동영상(유튜브) ── */
function ytId(u){const m=String(u).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);return m?m[1]:'';}
function rtVideo(){
  const ed=RT_CUR; if(!ed){toast('내용 칸을 먼저 클릭해주세요');return;}
  const u=prompt('유튜브 영상 주소를 붙여넣으세요\n예: https://youtu.be/...');
  if(!u)return; const id=ytId(u);
  if(!id){toast('유튜브 주소를 인식하지 못했어요');return;}
  rtFocusRange(ed);
  const h=`<div class="rt-embed"><iframe src="https://www.youtube.com/embed/${id}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p><br></p>`;
  document.execCommand('insertHTML',false,h);
}
/* ── 파일 첨부 ── */
function rtFile(){
  const ed=RT_CUR; if(!ed){toast('내용 칸을 먼저 클릭해주세요');return;}
  let inp=el('rtFileAttach');
  if(!inp){inp=document.createElement('input');inp.type='file';inp.id='rtFileAttach';inp.style.display='none';document.body.appendChild(inp);}
  inp.value=''; inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)rtUploadFile(ed,f);};
  inp.click();
}
async function rtUploadFile(ed, file){
  if(file.size>20*1024*1024){toast('파일은 20MB 이하만 가능해요');return;}
  ed.focus();
  toast('파일 올리는 중…');
  try{
    const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';
    const path='file/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
    const r=await sbUpload(RT_BUCKET, path, file, file.type||'application/octet-stream');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const url=`${SB_PROJ}/storage/v1/object/public/${RT_BUCKET}/${path}`;
    const kb=file.size<1048576?Math.max(1,Math.round(file.size/1024))+'KB':(file.size/1048576).toFixed(1)+'MB';
    rtFocusRange(ed);
    document.execCommand('insertHTML',false,`<a class="rt-file" href="${url}" target="_blank" rel="noopener noreferrer">${esc(file.name)} <span style="color:#94a3b8">(${kb})</span></a><p><br></p>`);
    toast('파일이 첨부됐어요');
  }catch(e){toast('파일 업로드 실패 — '+(e&&e.message||'연결 확인'));}
}
// 공용 팝오버 노드(색/형광펜/글자크기) — 단일 #rtPalette 재사용
function rtPop(){
  let pop=el('rtPalette');
  if(!pop){pop=document.createElement('div');pop.id='rtPalette';pop.className='rt-pop';document.body.appendChild(pop);
    document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-cmd]');const c=b&&b.dataset.cmd;
      if(pop.classList.contains('on')&&!pop.contains(e.target)&&!(c==='color'||c==='hilite'||c==='size'||c==='table'))pop.classList.remove('on');});}
  return pop;
}
function rtPopAt(pop,btn){const r=btn.getBoundingClientRect();pop.style.left=(window.scrollX+r.left)+'px';pop.style.top=(window.scrollY+r.bottom+4)+'px';pop.classList.add('on');}
// 색·형광펜 팔레트
function rtPalette(type,btn){
  const pop=rtPop(); pop.className='rt-pop grid';
  const colors=type==='color'?RT_TEXT_COLORS:RT_HILITE_COLORS;
  pop.innerHTML=colors.map(c=>`<span class="rt-sw" style="background:${c}" title="${c}" onmousedown="event.preventDefault()" onclick="rtApplyColor('${type}','${c}')"></span>`).join('')
    +`<span class="rt-sw rt-sw-x" title="색 지우기" onmousedown="event.preventDefault()" onclick="rtApplyColor('${type}','none')">✕</span>`;
  rtPopAt(pop,btn);
}
// 글자 크기 메뉴
function rtSizeMenu(btn){
  const pop=rtPop(); pop.className='rt-pop list';
  pop.innerHTML=[['2','작게'],['3','보통'],['5','크게'],['6','아주 크게']].map(s=>
    `<div class="rt-mi" onmousedown="event.preventDefault()" onclick="rtSize('${s[0]}')">${s[1]}</div>`).join('');
  rtPopAt(pop,btn);
}
function rtSize(v){
  const ed=RT_CUR; if(ed)ed.focus();
  try{document.execCommand('styleWithCSS',false,true);}catch(e){}
  document.execCommand('fontSize',false,v);
  const pop=el('rtPalette'); if(pop)pop.classList.remove('on');
}
function rtApplyColor(type,c){
  const ed=RT_CUR; if(ed)ed.focus();
  try{document.execCommand('styleWithCSS',false,true);}catch(e){}
  if(type==='color')document.execCommand('foreColor',false,c==='none'?'#1a2942':c);
  else{ // 형광펜
    if(c==='none'){document.execCommand('hiliteColor',false,'transparent');document.execCommand('backColor',false,'transparent');}
    else{ if(!document.execCommand('hiliteColor',false,c))document.execCommand('backColor',false,c); }
  }
  const pop=el('rtPalette'); if(pop)pop.style.display='none';
}
function rtPickImage(){
  const ed=RT_CUR; if(!ed){toast('내용 칸을 먼저 클릭해주세요');return;}
  let inp=el('rtFileInput');
  if(!inp){inp=document.createElement('input');inp.type='file';inp.id='rtFileInput';inp.accept='image/*';inp.style.display='none';document.body.appendChild(inp);}
  inp.value='';
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)rtUploadInsert(ed,f);};
  inp.click();
}
// 이미지 업로드 → 자리표시 → 완료되면 실제 URL 교체
async function rtUploadInsert(ed, file){
  if(!file.type.startsWith('image/')){toast('이미지 파일만 넣을 수 있어요');return;}
  if(file.size>5*1024*1024){toast('이미지는 5MB 이하만 가능해요');return;}
  rtFocusRange(ed);
  const ph='rtimg_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
  // 미리보기(로컬) 먼저 삽입 — 업로드 중 표시
  const local=URL.createObjectURL(file);
  document.execCommand('insertHTML',false,`<img class="up" id="${ph}" src="${local}" alt="">`);
  try{
    const url=await rtUpload(file);
    const img=el(ph); if(img){img.src=url;img.classList.remove('up');img.removeAttribute('id');}
    URL.revokeObjectURL(local);
  }catch(e){
    const img=el(ph); if(img)img.remove();
    toast('이미지 업로드 실패 — '+(e&&e.message||'연결 확인'));
  }
}
async function rtUpload(file){
  const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png';
  const path='notice/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
  const r=await sbUpload(RT_BUCKET, path, file, file.type);
  if(!r.ok)throw new Error('HTTP '+r.status);
  return `${SB_PROJ}/storage/v1/object/public/${RT_BUCKET}/${path}`;
}
function calcStatus(from,to){const t=new Date().toISOString().slice(0,10);if(from&&t<from)return '예정';if(to&&t>to)return '종료';return '진행중';}
