// 서버 호출 창구(S7) 동등성 프로브 — 2026-09-02
//   fetch 를 가로채 "어떤 URL·헤더로 나가는가"만 기록한다(진짜 서버엔 안 감).
//   S7 전(기준)과 후에 각각 돌려 기록 파일이 바이트 동일하면 = 호출부 치환이 동작을 못 바꿨다는 증명.
//
//   node scripts/smoke/api_equiv_probe.mjs --out=_smoke_out/api_calls_before.json
//   node scripts/smoke/api_equiv_probe.mjs --out=_smoke_out/api_calls_after.json
//   fc /b  (또는 git diff --no-index) 두 파일
//
// 대상(1회차): semyung-ebook-borrow 10곳 — shelfReturn·loadEbookStock·ebReserve·smEbookLoans·smEbookReserves
//   ·ebDropReserve·ebOpen·ebExtend·ebReturn·smEbookBorrowOpen.  컨텍스트 2개(PC·토큰없음 / 폰·토큰있음)로
//   smHeaders() 두 갈래와 SM_DEV 두 갈래를 모두 지나게 한다.
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice(6) : '_smoke_out/api_calls.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); return rq.end(); }
      rq.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

// 브라우저 안에서 실행: fetch 가로채기 + 부작용 함수 무력화 + 10개 함수 순서대로 호출
async function runInPage(token) {
  const log = [];
  // session_id 는 페이지 로드마다 난수 → 전/후 비교에서 가린다
  const mask = b => (typeof b === 'string') ? b.replace(/"session_id":"[^"]*"/g, '"session_id":"*"') : b;
  const rec = (fn, u, o) => log.push({ fn, url: String(u), method: (o && o.method) || 'GET', headers: (o && o.headers) || null, body: mask((o && o.body) || null) });
  let cur = '';
  window.fetch = async (u, o) => { rec(cur, u, o); return { ok: true, status: 200, json: async () => ({ ok: false }), text: async () => '' }; };
  window.confirm = () => true; window.alert = () => {}; window.open = () => ({ document: { write() {}, close() {} }, close() {}, location: {} });
  try { if (token) localStorage.setItem('bx_sso_token', token); else localStorage.removeItem('bx_sso_token'); localStorage.setItem('bx_sso_personal', '1'); } catch (e) {}
  // 화면 재렌더·서재 저장은 이 프로브의 관심 밖 — 무력화(기록에 다른 fetch 가 섞이지 않게)
  window.renderMyLibStatus = () => {}; window.renderMyShelf = () => {}; window.shelfSave = () => {}; window.readerToast = () => {}; window.smLoginGuide = () => {};
  window.shelfLoad = () => [{ key: 'sm-B001', loanSrmb: 'L001', t: '테스트 책' }];
  const tag = document.createElement('div'); tag.id = 'ebStockTag'; document.body.appendChild(tag);
  const steps = [
    ['shelfReturn', () => shelfReturn('sm-B001')],
    ['loadEbookStock', () => loadEbookStock('B002')],
    ['ebReserve', () => ebReserve('B003')],
    ['smEbookLoans', () => smEbookLoans()],
    ['smEbookReserves', () => smEbookReserves()],
    ['ebDropReserve', () => ebDropReserve('P004')],
    ['ebOpen', () => ebOpen('L005', 'B005', '제목')],
    ['ebExtend', () => ebExtend('L006', 'B006')],
    ['ebReturn', () => ebReturn('L007', 'B007', '제목')],
    ['smEbookBorrowOpen', () => smEbookBorrowOpen('B008', window.open(), { t: '제목' })],
    // 인자 빈 값 갈래(brcd||'')
    ['ebOpen(brcd없음)', () => ebOpen('L009', undefined, '')],
    ['ebExtend(brcd없음)', () => ebExtend('L010')],
    ['ebReturn(brcd없음)', () => ebReturn('L011')],
  ];
  const errs = [];
  for (const [name, f] of steps) { cur = name; try { await f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); } }
  return { log, errs };
}

const { srv, base } = await startServer();
const browser = await chromium.launch();
const out = {};
for (const [label, ctxOpt, token] of [
  ['pc-no-token', {}, ''],
  ['mobile-token', { ...devices['iPhone 13'] }, 'TESTTOKEN.abc'],
]) {
  const ctx = await browser.newContext(ctxOpt);
  await ctx.addInitScript(() => { try { localStorage.setItem('bookstar-theme', 'light'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.route(/supabase\.co\//, r => r.abort());   // 부팅 중 진짜 서버 호출 차단
  await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(runInPage, token);
  out[label] = r;
  console.log(`[${label}] 기록 ${r.log.length}건, 예외 ${r.errs.length}건${r.errs.length ? ' → ' + r.errs.join(' | ') : ''}`);
  for (const l of r.log) console.log(`   ${l.fn.padEnd(20)} ${l.method} ${l.url}  ${JSON.stringify(l.headers)}`);
  await ctx.close();
}
await browser.close(); srv.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('저장:', path.relative(ROOT, OUT));
