#!/usr/bin/env node
/* semyung_loan_rank(종이책 대출랭킹) 줄거리 보강 — isbn13(종이책 ISBN)→알라딘 ItemLookUp → description 컬럼.
   왜: 종이책은 semyung_books(전자책)에 없어 모달 줄거리 공백. loan_rank는 isbn13 100% 보유 + 알라딘 종이ISBN 수율 높음.
       build_semyung_loan_rank.py가 매일 description을 리셋하므로 그 직후 재실행(멱등, 빈 행만).
   쓰기: service_role PostgREST 개별 PATCH(upsert는 NOT NULL 위반 → 금지). 출처=알라딘.
   키: env(SUPABASE_SERVICE_ROLE/ALADIN_TTBKEY) 우선, 없으면 ~/Desktop/클레버/api_keys.md. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function readKeys(){ for(const p of [path.join(__dirname,'..','api_keys.md'), path.join(os.homedir(),'Desktop','클레버','api_keys.md')]){ try{return fs.readFileSync(p,'utf8');}catch{} } return ''; }
const KEYS=readKeys();
const fromFile=re=>{ const m=KEYS.match(re); return m?m[1].replace(/`/g,''):''; };
const SVC=process.env.SUPABASE_SERVICE_ROLE || fromFile(/\bSERVICE_ROLE=(ey[\w.\-]+)/);
const TTB=process.env.ALADIN_TTBKEY || fromFile(/TTBKey[^`]*`(ttb[a-z0-9]+)`/i) || fromFile(/(ttb[a-z0-9]{10,})/i);
if(!SVC){ console.error('❌ SUPABASE_SERVICE_ROLE 없음 (env 또는 api_keys.md)'); process.exit(1); }
if(!TTB){ console.error('❌ ALADIN_TTBKEY 없음'); process.exit(1); }
const REF="gkujptyfrzqrjrvovbnc";
const BASE=`https://${REF}.supabase.co/rest/v1`;
const H={apikey:SVC, Authorization:'Bearer '+SVC};
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
async function getEmpty(){
  const u=`${BASE}/semyung_loan_rank?select=brcd,isbn13,title&isbn13=not.is.null&isbn13=neq.&or=(description.is.null,description.eq.)&limit=5000`;
  const r=await fetch(u,{headers:H}); const t=await r.text(); if(!r.ok)throw new Error('GET '+t.slice(0,200)); return JSON.parse(t);
}
async function patch(brcd,description){
  const u=`${BASE}/semyung_loan_rank?brcd=eq.${encodeURIComponent(brcd)}`;
  const r=await fetch(u,{method:'PATCH',headers:{...H,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({description})});
  if(!r.ok)throw new Error('PATCH '+(await r.text()).slice(0,200));
}
async function aladin(isbn){try{const _it=(String(isbn).replace(/[^0-9Xx]/g,'').length===10)?'ISBN':'ISBN13';const r=await fetch(`https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${TTB}&itemIdType=${_it}&ItemId=${isbn}&output=js&Version=20131101`,{headers:{'User-Agent':UA}});let t=(await r.text()).trim().replace(/;$/,'');const j=JSON.parse(t);const it=(j.item||[])[0];return it?clean(it.description):'';}catch(e){return '';}}
(async()=>{
  const rows=await getEmpty();
  console.log(`대상 ${rows.length}권 (isbn13 보유 · 줄거리 빈 것)`);
  let hit=0;
  for(const r of rows){ const d=await aladin(r.isbn13); if(d){hit++; await patch(r.brcd,d.slice(0,1000)); console.log(`  ✓ [${d.length}자] ${r.title}`);} else console.log(`  ✗ ${r.title}`); await sleep(130); }
  console.log(`✅ 보강 ${hit}/${rows.length}`);
})();
