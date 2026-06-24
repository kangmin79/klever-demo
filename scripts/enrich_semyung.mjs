// 세명대 전자책 정보 보강 캐시 빌드
//   세명대 brcd → 교보 미리보기 cverBarcd(종이 ISBN) → 국중(정보나루) 줄거리·출판사·연도·장르
//   실패 시 → 세명대 상세페이지(contentView.ink)에서 줄거리·출판사·출간일 폴백
// 출력: books/semyung_enrich.json  { [brcd]: {isbn, desc, publisher, year, genre, cover, src} }
// ⚠️ 국중 API는 호출 IP 등록 필요 → 등록된 IP(사장님 PC)에서 실행할 것.
import { writeFileSync, readFileSync } from 'node:fs';

const ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
const SMBEST="https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-best";
const NL_KEY="b6b219379c6c9809d2254684e51feed41837c4e034a0c36d40a54ef9253dcad9";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const LBRY=20213;

const decode=s=>(s||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").trim();
const strip=s=>decode((s||"").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();

async function smList(kind){
  try{ const r=await fetch(SMBEST+"?kind="+kind,{headers:{Authorization:"Bearer "+ANON,apikey:ANON}});
    const d=await r.json(); return (d&&d.books)||[]; }catch(e){ return []; }
}
// 교보 미리보기에서 진짜 ISBN(978/979) 추출. 480-내부바코드는 거름.
async function kyoboIsbn(brcd){
  try{
    const r=await fetch(`https://ebook-product.kyobobook.co.kr/dig/preview/${brcd}?chl=lib`,{headers:{"User-Agent":UA}});
    if(!r.ok) return null;
    const h=await r.text();
    const m=h.match(/value="(\d{13})"\s+id="cverBarcd"/);
    if(m && /^97[89]/.test(m[1])) return m[1];
    return null;
  }catch(e){ return null; }
}
// 국중(정보나루) 상세
async function nlBook(isbn){
  try{
    const r=await fetch(`https://data4library.kr/api/srchDtlList?authKey=${NL_KEY}&isbn13=${isbn}&format=json`);
    const j=await r.json();
    if(j.response&&j.response.errCode) return null;
    const b=j.response&&j.response.detail&&j.response.detail[0]&&j.response.detail[0].book;
    if(!b||!b.bookname) return null;
    const genre=(b.class_nm||"").replace(/\s*>\s*>?\s*$/,"").trim();
    return {desc:decode(b.description), publisher:(b.publisher||"").trim(), year:(b.publication_year||"").trim(), genre:genre&&genre!==">"?genre:"" };
  }catch(e){ return null; }
}
// 세명대 상세페이지 폴백 — 콘텐츠소개(줄거리)·출판사·출간일
async function smDetail(brcd){
  try{
    const r=await fetch(`https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=${LBRY}&brcd=${brcd}`,{headers:{"User-Agent":UA}});
    if(!r.ok) return null;
    const h=await r.text();
    const out={};
    const pub=h.match(/출판사\s*:\s*([^<\n]{1,40}?)\s*출간일\s*:\s*([0-9.\-]{4,12})/);
    if(pub){ out.publisher=pub[1].trim(); out.year=(pub[2]||"").slice(0,4); }
    // 콘텐츠소개 본문: "콘텐츠소개" 라벨 뒤 첫 긴 문단 (앞쪽 탭 라벨 제거)
    let i=h.indexOf("콘텐츠소개");
    if(i>=0){ let seg=strip(h.slice(i+5, i+1800));
      seg=seg.replace(/^(저자소개|목차|출판사\s*서평|독자\s*리뷰|콘텐츠\s*소개|책소개|\s)+/,'').trim();
      if(seg.length>40) out.desc=seg.slice(0,500); }
    return (out.desc||out.publisher)?out:null;
  }catch(e){ return null; }
}

// 제목 정규화(괄호·부제·구두점 무시)
const titleCore=s=>(s||"").replace(/\[[^\]]*\]/g,"").split(/[:：]/)[0].replace(/[()（）\[\]]/g,"").replace(/[\s\-·,.'"’“”]/g,"").toLowerCase().trim();
// YES24 크레마클럽 공개검색 — 세명대 구독(무제한). 제목 일치 결과의 BookClub/Detail/{id} 반환.
async function cremaCheck(title){
  try{
    const r=await fetch(`https://cremaclub.yes24.com/BookClub/Search?query=${encodeURIComponent((title||"").split(/\s*[:\[(]/)[0].trim())}`,{headers:{"User-Agent":UA}});
    if(!r.ok) return null;
    const h=await r.text();
    const mine=titleCore(title);
    const re=/BookClub\/Detail\/(\d+)"[^>]*>\s*([^<]{1,80})/g; let m;
    while((m=re.exec(h))){
      const id=m[1], t=m[2].replace(/\s+/g," ").trim(); const tc=titleCore(t);
      if(tc && (tc===mine || tc.startsWith(mine) || mine.startsWith(tc)))
        return {cremaUrl:`https://cremaclub.yes24.com/BookClub/Detail/${id}`};
    }
    return null;
  }catch(e){ return null; }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const best=await smList("best"), nw=await smList("new");
const seen=new Set(), all=[];
[...best,...nw].forEach(b=>{ if(b&&b.brcd&&!seen.has(b.brcd)){ seen.add(b.brcd); all.push(b); } });
console.log(`세명대 라이브 ${all.length}권 보강 시작…`);

// 기존 캐시를 읽어 병합(종이책 paper 필드 보존) — enrich/holdings 실행 순서 무관
const CACHE=new URL("../books/semyung_enrich.json", import.meta.url);
let cache={}; try{ cache=JSON.parse(readFileSync(CACHE,"utf8")); }catch(e){ cache={}; }
let nNl=0, nSm=0, nFail=0, nCrema=0;
for(const b of all){
  const isbn=await kyoboIsbn(b.brcd);
  let rec=null, src=null, usedIsbn=isbn||"";
  if(isbn){ const nl=await nlBook(isbn); if(nl){ rec=nl; src="nl"; } }
  if(!rec){ const sm=await smDetail(b.brcd); if(sm){ rec=sm; src="sm"; } }
  const cr=await cremaCheck(b.title);              // 크레마클럽 구독 여부
  const e=cache[b.brcd]||(cache[b.brcd]={});
  if(rec){
    Object.assign(e, {isbn:usedIsbn, desc:rec.desc||"", publisher:rec.publisher||"", year:rec.year||"", genre:rec.genre||"", src});
    if(src==="nl")nNl++; else nSm++;
  }else{ if(usedIsbn)e.isbn=usedIsbn; nFail++; }
  e.crema=!!cr; e.cremaUrl=cr?cr.cremaUrl:"";
  if(cr)nCrema++;
  console.log(`${rec?"✅":"❌"} ${b.title}  ${rec?`[${src}] 줄거리${(rec.desc||"").length}자`:"보강실패"}${cr?" · 크레마⭕":""}`);
  await sleep(120);
}
cache._meta=Object.assign(cache._meta||{}, {builtFrom:"semyung-best(best+new)", total:all.length, nl:nNl, sm:nSm, fail:nFail, crema:nCrema});
writeFileSync(CACHE, JSON.stringify(cache,null,1));
console.log(`\n완료: 국중 ${nNl} + 세명대상세 ${nSm} + 실패 ${nFail} / ${all.length} · 크레마 ${nCrema}`);
console.log("→ books/semyung_enrich.json 저장");
