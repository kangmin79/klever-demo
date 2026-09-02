// 북스타 고전(자체 본문) 임베딩 — index.html의 BOOKS 구성 규칙을 그대로 재현해 목록을 만들고 text-embedding-3-small로 벡터 생성 → JSON 저장
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path";
const ROOT = "C:/Users/강동욱/Desktop/북스타/klever_demo";
const ctx = { window: {} }; vm.createContext(ctx);
// 데이터 파일은 top-level const라 vm 컨텍스트 프로퍼티로 안 잡힘 → const/let → var 로 바꿔 평가
for (const f of ["classics_kr_data.js", "classics_foreign_data.js", "classics_ko_titles.js", "classics_summaries.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "data", f), "utf8").replace(/^(const|let)\s+/gm, "var "), ctx);
const KR = ctx.BOOKS_CLASSICS_KR || ctx.window.BOOKS_CLASSICS_KR || [];
const FO = ctx.BOOKS_CLASSICS_FOREIGN || ctx.window.BOOKS_CLASSICS_FOREIGN || [];
const KOT = ctx.window.CLASSICS_KO || ctx.CLASSICS_KO || {};
const SUM = ctx.window.CLASSIC_SUMMARY || {};
// index.html:3188 DROP_IDS / 3213 hasTrans 필터 그대로
const DROP_IDS = new Set(["k13313590","k13313606","k13313608","k13313607","k9001059","k9001047","k9001048","k9001052","k9001060","k9001035","k9020973","k9032975","k9000607","k9031445","k9032996","k9032995","k9032994","k9032993","k13313736","k13313731","k13313732","k13313735","k13313734","k13313733"]);
const FOREIGN_LIT_GENRE = {'gb-21':'동화·우화','gb-16':'동화·우화','gb-11':'동화·우화','gb-14838':'동화·우화','gb-500':'동화·우화','gb-1597':'동화·우화','gb-52521':'동화·우화','gb-29021':'동화·우화','gb-27805':'동화·우화','gb-36462':'신화·전설','gb-1251':'신화·전설','gb-5160':'신화·전설','gb-56644':'신화·전설','gb-51252':'신화·전설','gb-10148':'신화·전설','gb-597':'신화·전설','gb-23639':'사상·철학','gb-57342':'사상·철학','gb-2130':'사상·철학','gb-30201':'사상·철학','gb-2434':'사상·철학','gb-2085':'사상·철학','gb-1080':'에세이·자서전','gb-9198':'에세이·자서전','gb-36151':'에세이·자서전','gb-56463':'에세이·자서전'};
const BOOKS = KR.concat(FO).filter(b => !DROP_IDS.has(b.id)).filter(b => !(b.locale === 'foreign' && !b.hasTrans)).map(b => {
  const o = { ...b };
  if (b.locale === 'foreign') o.litGenre = FOREIGN_LIT_GENRE[b.id] || '소설';
  if (b.id && b.id.startsWith('gb-') && KOT[b.id]) { o.titleEn = b.title; o.title = KOT[b.id]; }
  return o;
});
console.log("BOOKS", BOOKS.length, "kr", BOOKS.filter(b => b.id.startsWith('kr-')).length, "gb", BOOKS.filter(b => b.id.startsWith('gb-')).length, "with summary", BOOKS.filter(b => SUM[b.id]).length);
const textOf = (b) => {
  const genre = b.litGenre || b.category || "";
  const head = [b.title, b.titleEn ? `(${b.titleEn})` : "", "—", b.author || "", "."].join(" ").replace(/\s+/g, " ").trim();
  const meta = [genre, b.period, b.locale === 'foreign' ? "세계문학 고전" : "한국 고전"].filter(Boolean).join(" · ");
  const sum = SUM[b.id] || "";
  return `${head} ${meta}. ${sum}`.replace(/\s+/g, " ").trim().slice(0, 1800);
};
const OPENAI = (fs.readFileSync("C:/Users/강동욱/Desktop/hwik-web/.env", "utf8").match(/^\s*OPENAI_API_KEY\s*=\s*(\S+)/m) || [])[1]?.replace(/["']/g, "");
if (!OPENAI) { console.error("no OPENAI key"); process.exit(1); }
const out = [];
for (let i = 0; i < BOOKS.length; i += 50) {
  const batch = BOOKS.slice(i, i + 50);
  const r = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: "Bearer " + OPENAI, "content-type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map(textOf) }) });
  const d = await r.json();
  if (!d.data) { console.error("embed fail", JSON.stringify(d).slice(0, 300)); process.exit(1); }
  d.data.forEach((e, j) => { const b = batch[j]; out.push({ id: b.id, title: b.title, title_en: b.titleEn || "", author: b.author || "", genre: b.litGenre || b.category || "", period: b.period || "", locale: b.locale || (b.id.startsWith('kr-') ? 'kr' : 'foreign'), cover: b.coverSrc || "", embed_text: textOf(b), embedding: e.embedding }); });
  console.log("embedded", out.length);
}
fs.writeFileSync(path.join(process.cwd(), "classic_embeddings.json"), JSON.stringify(out));
console.log("saved", out.length, "sample:", out[0].id, out[0].title, out[0].embed_text.slice(0, 120));
