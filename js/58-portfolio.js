/* ═══ 독서 포트폴리오 만들기 — 마이페이지 맨 아래 (10/28 사장님 요청, 명세: Desktop\독서포트폴리오 구현명세.pdf) ═══
   · '초안 다운로드' = 로그인한 학생의 '내가 쓴 글'(bookstar_writings)을 양식(files/portfolio_template.json = 초안.docx 를 풀어 둔 것)의
     "4. 내가 쓴 글" 자리에 끼워 넣어 .docx 로 만들어 내려준다. 서버 없이 브라우저에서 조립(학생 글은 본인 세션으로 이미 읽는 자료).
   · 자동으로 채우는 건 인적 사항(이름·학교·학번)과 4번 '내가 쓴 글'뿐. 제출 사유·나의 독서는 주황 "(여기에 작성)" 그대로 둔다.
     AI 생성 금지 — "직접 읽고 쓴 기록만 담는다"가 이 양식의 원칙(명세 5번).
   · '작성법과 예시 다운로드' = 고정 PDF(files/reading-portfolio-guide.pdf). */
const PF_TEMPLATE_URL='files/portfolio_template.json';
const PF_GUIDE_URL='files/reading-portfolio-guide.pdf';
const PF_KIND={essay:'독후감',review:'서평',question:'한줄질문',oneline:'한줄소감',impression:'한줄소감'};
const PF_ORDER=['essay','review','question','oneline'];   // 유형별 묶음 순서(명세 예시와 동일)
const PF_IC_DOC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';
const PF_IC_DOWN='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
const PF_IC_BOOK='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

function portfolioSectionHTML(){
  return `<div class="ag-sec-h"><h3>독서 포트폴리오 만들기 <span style="font-size:12px;color:var(--text-light);font-weight:600">취업·공모전·면접에서 활용하는 나의 독서 기록</span></h3></div>
    <div class="ag-card pf-card">
      <div class="pf-row">
        <div class="pf-ic">${PF_IC_DOC}</div>
        <div class="pf-body">
          <p class="pf-text">내가 쓴 독후감·서평이 채워진 <b>'초안'</b>을 다운로드하고, <b>'작성법과 예시'</b>를 참고해 인적 사항·제출 사유·나의 독서를 더하면 독서 포트폴리오가 완성됩니다. 어떤 책을 읽고 어떻게 생각했는지가 나의 관심 분야와 성장을 보여주고, 취업·공모전·면접에서 나를 설명하는 좋은 자료가 됩니다.</p>
          <div class="pf-acts">
            <button class="bm-btn fill pf-btn" onclick="portfolioDownloadDraft(this)">${PF_IC_DOWN} 초안 다운로드</button>
            <a class="bm-btn pf-btn" href="${PF_GUIDE_URL}" download="독서포트폴리오 작성법과 예시.pdf">${PF_IC_BOOK} 작성법과 예시 다운로드</a>
          </div>
          <div class="pf-note">내가 쓴 글(독후감·서평 등)은 자동으로 채워지고, 나머지는 직접 작성합니다.</div>
        </div>
      </div>
    </div>`;
}

/* ── 초안 다운로드 ── */
async function portfolioDownloadDraft(btn){
  const s=(typeof bxStudent==='function')?bxStudent():null;
  if(!s){ if(typeof bxOpenPicker==='function') bxOpenPicker(); return; }
  const old=btn.innerHTML; btn.disabled=true; btn.textContent='초안 만드는 중…';
  try{
    const ver=(typeof APP_BUILD!=='undefined')?APP_BUILD:Date.now();
    const [tpl,rows]=await Promise.all([
      fetch(PF_TEMPLATE_URL+'?b='+ver,{cache:'no-store'}).then(r=>{ if(!r.ok) throw new Error('template '+r.status); return r.json(); }),
      (typeof _wrMine!=='undefined'&&_wrMine)?Promise.resolve(_wrMine):wrLoadMine()
    ]);
    const list=Array.isArray(rows)?rows:[];
    const xml=_pfBuildDocumentXml(tpl['word/document.xml'], s, list);
    const parts=Object.assign({}, tpl, {'word/document.xml':xml});
    const blob=_pfZip(parts);
    const fname='독서포트폴리오 초안_'+String(s.name||s.id).replace(/[\\/:*?"<>|]/g,'')+'.docx';
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname; a.style.display='none';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} }, 5000);
    try{ bxEvent('portfolio',{sub:'draft', meta:{n:list.length}}); }catch(e){}
    if(!list.length && typeof bmToast==='function') bmToast('아직 남긴 글이 없어 빈 초안을 내려받았어요. 독후감·서평을 쓰면 자동으로 채워져요.');
  }catch(e){
    console.error('portfolio draft', e);
    if(typeof bmToast==='function') bmToast('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }finally{ btn.disabled=false; btn.innerHTML=old; }
}

/* ── 양식 document.xml 채우기 ── */
function _pfX(s){   // XML 텍스트 이스케이프 + 제어문자 제거
  return String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const _PF_RUN_BLACK='<w:rPr><w:color w:val="1A1A1A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
const _PF_RUN_ORANGE='<w:rPr><w:color w:val="C8622D"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
const _PF_T=t=>`<w:t xml:space="preserve">${_pfX(t)}</w:t>`;
// 인적 사항 한 줄: "라벨 : (여기에 작성)"의 주황 칸을 값(검정)으로. tail 이 있으면 값 뒤에 주황 "(여기에 작성)"을 남긴다(학과처럼 모르는 부분).
function _pfField(xml,label,value,keepTail){
  const re=new RegExp('(<w:t xml:space="preserve">'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' : </w:t></w:r><w:r>)<w:rPr><w:color w:val="C8622D"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">\\(여기에 작성\\)</w:t>');
  if(!re.test(xml)) return xml;
  const tail=keepTail?`</w:r><w:r>${_PF_RUN_ORANGE}${_PF_T('(여기에 작성)')}`:'';
  return xml.replace(re,(m,head)=>head+_PF_RUN_BLACK+_PF_T(value)+tail);
}
function _pfPara(runs,pPr){ return `<w:p><w:pPr>${pPr||'<w:spacing w:after="120" w:line="288"/>'}</w:pPr>${runs}</w:p>`; }
function _pfBodyParas(text){
  // 빈 줄 = 문단 나눔, 줄바꿈 = 같은 문단 안 줄바꿈(<w:br/>)
  const blocks=String(text||'').replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  if(!blocks.length) return '';
  return blocks.map(b=>{
    const lines=b.split('\n');
    const runs=lines.map((l,i)=>`<w:r>${_PF_RUN_BLACK}${i?'<w:br/>':''}${_PF_T(l)}</w:r>`).join('');
    return _pfPara(runs,'<w:spacing w:after="140" w:line="288"/>');
  }).join('');
}
function _pfBuildDocumentXml(xml, s, rows){
  // ① 인적 사항 — 이름·학교·학번은 자동, 학과는 모름(주황 남김), 나머지 주황 그대로
  xml=_pfField(xml,'이름',String(s.name||s.id||''));
  xml=_pfField(xml,'학교 · 학과',(s.dept&&/대학교|대학$/.test(s.dept)?s.dept:'세명대학교')+' · ',true);
  xml=_pfField(xml,'학번',String(s.id||''));
  // ② 4. 내가 쓴 글 — 안내 문단(주황) 자리에 학생 글 삽입
  const marker='내가 독서 플랫폼에 남긴 독후감';
  const at=xml.indexOf(marker);
  if(at<0) return xml;   // 양식이 바뀌어 자리를 못 찾으면 양식 그대로(깨뜨리지 않음)
  const pStart=xml.lastIndexOf('<w:p>',at), pEnd=xml.indexOf('</w:p>',at)+6;
  const kinds=rows.map(w=>PF_KIND[w.activity]).filter(Boolean);
  const byKind={}; kinds.forEach(k=>{ byKind[k]=(byKind[k]||0)+1; });
  let out='';
  if(!rows.length){
    out=_pfPara(`<w:r>${_PF_RUN_ORANGE}${_PF_T('(아직 북스타에 남긴 글이 없습니다. 독후감·서평·한줄질문·한줄소감을 쓰면 여기에 자동으로 채워집니다.)')}</w:r>`,'<w:spacing w:after="160" w:line="288"/>');
  }else{
    const summary=`작성 기록 ${rows.length} 편 (${['독후감','서평','한줄질문','한줄소감'].filter(k=>byKind[k]).map(k=>k+' '+byKind[k]).join(' · ')})`;
    out+=_pfPara(`<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1A1A1A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>${_PF_T(summary)}</w:r>`,'<w:spacing w:after="200"/>');
    const norm=a=>a==='impression'?'oneline':a;
    const sorted=rows.slice().sort((a,b)=>{ const d=PF_ORDER.indexOf(norm(a.activity))-PF_ORDER.indexOf(norm(b.activity)); return d||String(b.created_at||'').localeCompare(String(a.created_at||'')); });
    sorted.forEach(w=>{
      const b=(typeof _anyBook==='function')?_anyBook(w.book_id):null;
      const title=b?(typeof cleanT==='function'?cleanT(b.title||''):(b.title||'')):String(w.book_id||'');
      const author=b?String(b.author||b.a||''):'';
      const meta=[author,PF_KIND[w.activity]||''].filter(Boolean).join(' · ');
      out+=_pfPara(
        `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1A1A1A"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>${_PF_T(title)}</w:r>`
        +(meta?`<w:r><w:rPr><w:color w:val="777777"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>${_PF_T('  '+meta)}</w:r>`:''),
        '<w:keepNext/><w:spacing w:after="80" w:before="240"/>');
      const shown=(typeof wrDisplayText==='function')?wrDisplayText(w.activity,w.text):(w.text||'');
      out+=_pfBodyParas(shown);
    });
  }
  return xml.slice(0,pStart)+out+xml.slice(pEnd);
}

/* ── 최소 ZIP(무압축, UTF-8 이름) — .docx 는 zip 묶음이라 외부 라이브러리 없이 조립 ── */
let _pfCrcT=null;
function _pfCrc(u8){
  if(!_pfCrcT){ _pfCrcT=new Int32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); _pfCrcT[n]=c; } }
  let c=-1; for(let i=0;i<u8.length;i++) c=_pfCrcT[(c^u8[i])&0xFF]^(c>>>8);
  return (c^-1)>>>0;
}
function _pfZip(parts){
  const enc=new TextEncoder(); const names=Object.keys(parts);
  const now=new Date();
  const dosTime=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xFFFF;
  const dosDate=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
  const local=[], central=[]; let off=0;
  names.forEach(name=>{
    const nb=enc.encode(name), data=enc.encode(parts[name]), crc=_pfCrc(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,dosTime,true); lh.setUint16(12,dosDate,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,nb.length,true); lh.setUint16(28,0,true);
    local.push(new Uint8Array(lh.buffer),nb,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true);
    ch.setUint16(12,dosTime,true); ch.setUint16(14,dosDate,true); ch.setUint32(16,crc,true);
    ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,nb.length,true);
    ch.setUint16(30,0,true); ch.setUint16(32,0,true); ch.setUint16(34,0,true); ch.setUint16(36,0,true); ch.setUint32(38,0,true); ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer),nb);
    off+=30+nb.length+data.length;
  });
  const cdSize=central.reduce((n,c)=>n+c.length,0);
  const eo=new DataView(new ArrayBuffer(22));
  eo.setUint32(0,0x06054b50,true); eo.setUint16(4,0,true); eo.setUint16(6,0,true); eo.setUint16(8,names.length,true); eo.setUint16(10,names.length,true);
  eo.setUint32(12,cdSize,true); eo.setUint32(16,off,true); eo.setUint16(20,0,true);
  return new Blob([...local,...central,new Uint8Array(eo.buffer)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
