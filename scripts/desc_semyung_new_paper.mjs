#!/usr/bin/env node
/* semyung_new(신착) 종이책 줄거리 보강 — isbn13(종이책 ISBN)→알라딘 ItemLookUp → summary 컬럼.
   왜: 종이책 신착은 brcd=CATTOT(전자도서관 semyung_books에 없음)+summary 전부 빈값 → 모달 줄거리 공백.
       build_semyung_new_paper.py가 매일 summary를 리셋하므로 그 직후 재실행(멱등, 빈 행만).
   쓰기: service_role PostgREST 개별 PATCH(upsert는 NOT NULL 위반 → 금지). 출처=알라딘 우선, 빈 건 국중(정보나루) 폴백.
   키: env(SUPABASE_SERVICE_ROLE/ALADIN_TTBKEY/NL_AUTHKEY) 우선, 없으면 ~/Desktop/클레버/api_keys.md.
       ⚠️국중은 IP등록제(이 PC에서만)→CI(US 러너)에선 알라딘만, 잔여는 PC에서 보충. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function readKeys(){ for(const p of [path.join(__dirname,'..','api_keys.md'), path.join(os.homedir(),'Desktop','클레버','api_keys.md')]){ try{return fs.readFileSync(p,'utf8');}catch{} } return ''; }
const KEYS=readKeys();
const fromFile=re=>{ const m=KEYS.match(re); return m?m[1].replace(/`/g,''):''; };
const SVC=process.env.SUPABASE_SERVICE_ROLE || fromFile(/\bSERVICE_ROLE=(ey[\w.\-]+)/);
const TTB=process.env.ALADIN_TTBKEY || fromFile(/TTBKey[^`]*`(ttb[a-z0-9]+)`/i) || fromFile(/(ttb[a-z0-9]{10,})/i);
const AUTH=process.env.NL_AUTHKEY || fromFile(/data4library[\s\S]*?API Key\*\*:\s*`([0-9a-f]{40,})`/) || fromFile(/`([0-9a-f]{64})`/);
if(!SVC){ console.error('❌ SUPABASE_SERVICE_ROLE 없음 (env 또는 api_keys.md)'); process.exit(1); }
if(!TTB){ console.error('❌ ALADIN_TTBKEY 없음'); process.exit(1); }
const REF="gkujptyfrzqrjrvovbnc";
const BASE=`https://${REF}.supabase.co/rest/v1`;
const H={apikey:SVC, Authorization:'Bearer '+SVC};
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ').trim();
async function getEmpty(){
  const u=`${BASE}/semyung_new?select=brcd,isbn13,title&kind=eq.${encodeURIComponent('종이책')}&isbn13=not.is.null&isbn13=neq.&or=(summary.is.null,summary.eq.)&limit=5000`;
  const r=await fetch(u,{headers:H}); const t=await r.text(); if(!r.ok)throw new Error('GET '+t.slice(0,200)); return JSON.parse(t);
}
async function patch(brcd,summary){
  const u=`${BASE}/semyung_new?brcd=eq.${encodeURIComponent(brcd)}`;
  const r=await fetch(u,{method:'PATCH',headers:{...H,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({summary})});
  if(!r.ok)throw new Error('PATCH '+(await r.text()).slice(0,200));
}
async function aladin(isbn){try{const r=await fetch(`https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${TTB}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101`,{headers:{'User-Agent':UA}});let t=(await r.text()).trim().replace(/;$/,'');const j=JSON.parse(t);const it=(j.item||[])[0];return it?clean(it.description):'';}catch(e){return '';}}
async function nl(isbn){if(!AUTH)return '';try{const r=await fetch(`http://data4library.kr/api/srchDtlList?authKey=${AUTH}&isbn13=${isbn}&format=json&loaninfoYN=N`,{headers:{'User-Agent':UA}});if(!r.ok)return '';const j=JSON.parse(await r.text());const d=((j.response||{}).detail||[])[0];const book=d&&d.book;return book?clean(book.description||''):'';}catch(e){return '';}}
(async()=>{
  const rows=await getEmpty();
  console.log(`대상 ${rows.length}권 (종이책 신착 · isbn13 보유 · summary 빈 것)`);
  let hitA=0,hitN=0;
  for(const r of rows){
    let src='', d=await aladin(r.isbn13); if(d){src='알라딘';hitA++;}
    else { d=await nl(r.isbn13); if(d){src='국중';hitN++;} await sleep(40); }
    if(d){ await patch(r.brcd,d.slice(0,1000)); console.log(`  ✓ [${src} ${d.length}자] ${r.title}`); }
    else console.log(`  ✗ ${r.title}`);
    await sleep(130);
  }
  console.log(`✅ 보강 ${hitA+hitN}/${rows.length} (알라딘 ${hitA} + 국중 ${hitN})`);
})();
