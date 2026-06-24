// 세명대 종이책(단행본) 소장·대출상태 캐시 (Playwright, OPAC 제목검색)
//   lib.semyung.ac.kr 통합검색은 ISBN검색 0건 → 제목검색이 정답. 자료유형 단행본(N) 패싯 + 대출상태 파싱.
//   기존 books/semyung_enrich.json에 {paper, paperCount, paperStatus} 병합.
// ⚠️ Playwright 필요. 데모 전 재실행 권장(OPAC 구조 바뀌면 깨질 수 있음).
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
const pw = (await import(pathToFileURL('C:/Users/강동욱/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js').href)).default;

const ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
const SMBEST="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-best";
const CACHE=new URL("../books/semyung_enrich.json", import.meta.url);

async function smList(kind){
  try{ const r=await fetch(SMBEST+"?kind="+kind,{headers:{Authorization:"Bearer "+ANON,apikey:ANON}});
    const d=await r.json(); return (d&&d.books)||[]; }catch(e){ return []; }
}
const best=await smList("best"), nw=await smList("new");
const seen=new Set(), all=[];
[...best,...nw].forEach(b=>{ if(b&&b.brcd&&!seen.has(b.brcd)){ seen.add(b.brcd); all.push(b); } });

const cache=JSON.parse(readFileSync(CACHE,"utf8"));
const b=await pw.chromium.launch();
const pg=await b.newPage({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"});
console.log(`세명대 ${all.length}권 종이책 소장 조회…`);

let nPaper=0, nNo=0;
for(const it of all){
  const q=(it.title||"").split(/\s*[:\-(\[]/)[0].trim();   // 제목 핵심부만
  let rec={paper:false, paperCount:0, paperStatus:""};
  try{
    await pg.goto(`https://lib.semyung.ac.kr/search/tot/result?st=KWRD&si=TOTAL&q=${encodeURIComponent(q)}`,{waitUntil:"networkidle",timeout:30000});
    await pg.waitForTimeout(1800);
    rec=await pg.evaluate(()=>{
      const all=document.body.innerText.replace(/\s+/g," ");
      const fm=all.match(/단행본\((\d+)\)/);
      const cnt=fm?+fm[1]:0;
      // 첫 단행본 결과의 대출상태: '대출가능' 우선, 없으면 '대출중'
      let status="";
      if(/대출가능/.test(all)) status="대출가능";
      else if(/대출중|대출불가/.test(all)) status="대출중";
      return {paper:cnt>0, paperCount:cnt, paperStatus:cnt>0?status:""};
    });
  }catch(e){}
  if(cache[it.brcd]) Object.assign(cache[it.brcd], rec);
  else cache[it.brcd]=Object.assign({isbn:"",desc:"",publisher:"",year:"",genre:"",src:"none"}, rec);
  if(rec.paper){ nPaper++; console.log(`📖 ${it.title}  종이책 ${rec.paperCount}권 · ${rec.paperStatus||"소장"}`); }
  else { nNo++; console.log(`—  ${it.title}  종이책 없음(전자책만)`); }
}
await b.close();
cache._meta=Object.assign(cache._meta||{}, {holdingsBuilt:true, paper:nPaper, paperNone:nNo});
writeFileSync(CACHE, JSON.stringify(cache,null,1));
console.log(`\n종이책 소장 ${nPaper} / 미소장 ${nNo} / ${all.length}`);
console.log("→ books/semyung_enrich.json 병합 저장");
