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

// 저자 매칭: 우리 책 저자의 토큰(2자+)이 결과 저자/본문에 있나
function authorMatch(mine, ctx){
  const toks=(mine||"").split(/[\s,·/]+/).filter(t=>t.length>=2);
  if(!toks.length) return true;            // 저자 모르면 통과
  return toks.some(t=>ctx.includes(t));
}
// 제목 정규화: [전자책] 제거 → 부제(:) 앞 본제목 → 괄호 문자만 제거(내용 유지) → 공백·구두점 제거
// "(개발자를 위한)쉬운 도커" == "개발자를 위한 쉬운 도커", "혼모노 : 성해나 소설집" == "혼모노"
const titleCore=s=>(s||"")
  .replace(/\[[^\]]*\]/g,"")
  .split(/[:：]/)[0]
  .replace(/[()（）\[\]]/g,"")
  .replace(/[\s\-·,.'"’“”]/g,"")
  .toLowerCase().trim();

let nPaper=0, nNo=0;
for(const it of all){
  const q=(it.title||"").split(/\s*[:\-(\[]/)[0].trim();   // 제목 핵심부로 검색
  let rec={paper:false, paperStatus:"", paperUrl:""};
  try{
    await pg.goto(`https://lib.semyung.ac.kr/search/tot/result?st=KWRD&si=TOTAL&q=${encodeURIComponent(q)}`,{waitUntil:"networkidle",timeout:30000});
    await pg.waitForTimeout(1800);
    const results=await pg.evaluate(()=>{
      const norm=s=>(s||"").replace(/\s+/g," ").trim();
      const seen=new Set(), out=[];
      for(const a of document.querySelectorAll('a[href*="/search/detail/CATTOT"]')){
        const title=norm(a.textContent); const href=a.getAttribute("href")||"";
        if(!title||seen.has(href))continue; seen.add(href);
        let box=a; for(let i=0;i<6;i++){ box=box.parentElement; if(!box)break; if(box.textContent.length>60 && /(단행본|컴퓨터파일|학위논문|연속간행물|비도서)/.test(box.textContent)) break; }
        const txt=norm(box?box.textContent:"");
        const type=(txt.match(/(단행본|컴퓨터파일|학위논문|연속간행물|비도서)/)||[])[1]||"";
        const status=/대출가능/.test(txt)?"대출가능":(/대출중|대출불가|예약/.test(txt)?"대출중":"");
        out.push({title, href:href.split("?")[0], type, status, ctx:txt.slice(0,200)});
        if(out.length>=15)break;
      }
      return out;
    });
    // 단행본(종이책) 중 '정확한 제목 일치' 우선, 저자 일치하면 더 확실(로마자 저자는 폴백 허용)
    const mineCore=titleCore(it.title);
    const exact=results.filter(r=>r.type==="단행본" && titleCore(r.title)===mineCore);
    const hit=exact.find(r=>authorMatch(it.author, r.ctx)) || exact[0];
    if(hit){ rec={paper:true, paperStatus:hit.status||"소장", paperUrl:"https://lib.semyung.ac.kr"+hit.href}; }
  }catch(e){}
  if(cache[it.brcd]) Object.assign(cache[it.brcd], rec);
  else cache[it.brcd]=Object.assign({isbn:"",desc:"",publisher:"",year:"",genre:"",src:"none"}, rec);
  if(rec.paper){ nPaper++; console.log(`O ${it.title}  종이책 · ${rec.paperStatus} · ${rec.paperUrl.slice(-20)}`); }
  else { nNo++; console.log(`- ${it.title}  종이책 매칭 없음`); }
}
await b.close();
cache._meta=Object.assign(cache._meta||{}, {holdingsBuilt:true, paper:nPaper, paperNone:nNo});
writeFileSync(CACHE, JSON.stringify(cache,null,1));
console.log(`\n종이책 소장 ${nPaper} / 미소장 ${nNo} / ${all.length}`);
console.log("→ books/semyung_enrich.json 병합 저장");
