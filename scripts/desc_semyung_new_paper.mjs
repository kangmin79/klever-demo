#!/usr/bin/env node
/* semyung_new(신착) 종이책 줄거리 보강 — isbn13(종이책 ISBN)→알라딘 ItemLookUp → summary 컬럼.
   왜: 종이책 신착은 brcd=CATTOT(전자도서관 semyung_books에 없음)+summary 전부 빈값 → 모달 줄거리 공백.
       isbn13 100% 보유 + 알라딘 종이ISBN 수율 높음. build_semyung_new_paper.py가 매일 summary를 리셋하므로 그 직후 재실행.
   멱등: summary 빈 행만. 출처=알라딘 우선, 빈 건 국중(정보나루) 폴백.
   키: env(SUPABASE_PAT/ALADIN_TTBKEY/NL_AUTHKEY) 우선, 없으면 ~/Desktop/클레버/api_keys.md. ⚠️국중은 IP등록제(이 PC에서만)→CI에선 알라딘만. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function readKeys(){ for(const p of [path.join(__dirname,'..','api_keys.md'), path.join(os.homedir(),'Desktop','클레버','api_keys.md')]){ try{return fs.readFileSync(p,'utf8');}catch{} } return ''; }
const KEYS=readKeys();
const fromFile=re=>{ const m=KEYS.match(re); return m?m[1].replace(/`/g,''):''; };
const PAT=process.env.SUPABASE_PAT || fromFile(/SUPABASE_PAT\s*=\s*(\S+)/);
const TTB=process.env.ALADIN_TTBKEY || fromFile(/TTBKey[^`]*`(ttb[a-z0-9]+)`/i) || fromFile(/(ttb[a-z0-9]{10,})/i);
const AUTH=process.env.NL_AUTHKEY || fromFile(/data4library[\s\S]*?API Key\*\*:\s*`([0-9a-f]{40,})`/) || fromFile(/`([0-9a-f]{64})`/);
if(!PAT){ console.error('❌ SUPABASE_PAT 없음 (env 또는 api_keys.md)'); process.exit(1); }
if(!TTB){ console.error('❌ ALADIN_TTBKEY 없음'); process.exit(1); }
const REF="gkujptyfrzqrjrvovbnc";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const Q=s=>"'"+String(s??'').replace(/'/g,"''")+"'";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sql=async q=>{const r=await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`,{method:"POST",headers:{Authorization:"Bearer "+PAT,"Content-Type":"application/json","User-Agent":UA},body:JSON.stringify({query:q})});const t=await r.text();if(!r.ok)throw new Error('SQL '+t.slice(0,200));return JSON.parse(t);};
const clean=s=>(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ').trim();
async function aladin(isbn){try{const r=await fetch(`https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${TTB}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101`,{headers:{'User-Agent':UA}});let t=(await r.text()).trim().replace(/;$/,'');const j=JSON.parse(t);const it=(j.item||[])[0];return it?clean(it.description):'';}catch(e){return '';}}
async function nl(isbn){if(!AUTH)return '';try{const r=await fetch(`http://data4library.kr/api/srchDtlList?authKey=${AUTH}&isbn13=${isbn}&format=json&loaninfoYN=N`,{headers:{'User-Agent':UA}});if(!r.ok)return '';const j=JSON.parse(await r.text());const d=((j.response||{}).detail||[])[0];const book=d&&d.book;return book?clean(book.description||''):'';}catch(e){return '';}}
(async()=>{
  const rows=await sql(`select brcd,isbn13,title from public.semyung_new where kind='종이책' and isbn13 is not null and isbn13<>'' and (summary is null or summary='');`);
  console.log(`대상 ${rows.length}권 (종이책 신착 · isbn13 보유 · summary 빈 것)`);
  let hitA=0,hitN=0; const buf=[];
  const flush=async()=>{ if(!buf.length)return; const b=buf.splice(0,buf.length); const vals=b.map(x=>`(${Q(x.brcd)},${Q(x.desc)})`).join(','); await sql(`update public.semyung_new as t set summary=v.d from (values ${vals}) as v(brcd,d) where t.brcd=v.brcd;`); };
  for(const r of rows){
    let src='', d=await aladin(r.isbn13); if(d){src='알라딘';hitA++;}
    else { d=await nl(r.isbn13); if(d){src='국중';hitN++;} await sleep(40); }
    if(d){ buf.push({brcd:r.brcd,desc:d.slice(0,1000)}); console.log(`  ✓ [${src} ${d.length}자] ${r.title}`); }
    else console.log(`  ✗ ${r.title}`);
    if(buf.length>=20)await flush(); await sleep(130);
  }
  await flush();
  console.log(`✅ 보강 ${hitA+hitN}/${rows.length} (알라딘 ${hitA} + 국중 ${hitN})`);
})();
