// 관리자 화면 서버 호출 창구(S8-3) 동등성 프로브 — 2026-09-02
//   fetch 를 가로채 "어떤 URL·헤더·본문으로 나가는가"만 기록한다(진짜 서버엔 안 감).
//   S8-3 전(기준)과 후에 각각 돌려 기록 파일이 바이트 동일하면 = 호출부 치환이 동작을 못 바꿨다는 증명.
//
//   node scripts/smoke/api_equiv_probe_admin.mjs --out=_smoke_out/admin_calls_before.json
//   node scripts/smoke/api_equiv_probe_admin.mjs --out=_smoke_out/admin_calls_after.json
//   cmp (또는 git diff --no-index) 두 파일
//
// 대상 24곳 = js/admin 23 + 게이트 1:
//   익명 REST GET 14 → sbGetAnon: loadSections·loadClassicsPool·fillHeld(100개 단위 2페이지)·secSearch(sm갈래)
//     ·secSearchSemyung·aicLoadUsage·aicLoadDescAdmin·loadServerPrograms·loadInventory·loadChallenges
//     ·loadNotices·loadPopups·loadCommPosts·renderCommReviews
//   서버 함수 POST 6 → sbFnPost({anon}): 게이트 lgTry·adminSave·secLookupISBN(INFO_FN)·secSearch(nat갈래 CURATE_FN)
//     ·aicSend·aicRunGenerate(소장 모드/고전 pool 모드 두 갈래)
//   RPC POST 1 → sbWrite: renderMsApp(minsong_app_stats)
//   storage 업로드 2 → sbUpload: rtUpload·rtUploadFile(content-type 있음/빈 값 두 갈래)
//   Range 페이징 1 → sbGetAnon({range}): loadWritings→fetchAllRows(writings+reviews, Range·Range-Unit 헤더)
// 헤더는 키 이름 순으로 정렬해 기록 — HTTP 헤더는 순서가 없으므로 객체 키 순서 차이는 동작 차이가 아니다.
// storage 경로의 Date.now()+난수, 날짜(오늘 기준 프리셋)는 실행마다 달라 가린다(fdFrom/fdTo 는 고정값을 심는다).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice(6) : '_smoke_out/admin_calls.json');

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

async function runInPage() {
  const log = [];
  // storage 경로의 시각+난수, ISO 시각은 실행마다 달라 가린다
  const maskS = s => String(s)
    .replace(/(file|notice)\/\d+-[a-z0-9]+\./g, '$1/*TS*.')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '*ISO*');
  const sortH = h => { if (!h || typeof h !== 'object') return h || null; const o = {}; for (const k of Object.keys(h).sort()) o[k] = h[k]; return o; };
  const rec = (fn, u, o) => log.push({ fn, url: maskS(u), method: (o && o.method) || 'GET', headers: sortH(o && o.headers),
    body: (o && o.body != null) ? (typeof o.body === 'string' ? maskS(o.body) : '[' + (o.body.constructor && o.body.constructor.name || 'obj') + ' ' + (o.body.size != null ? o.body.size + 'B' : '') + ']') : null });
  let cur = '';
  let reply = [];   // 가짜 응답 — 시나리오마다 바꿔 분기를 지나가게 한다
  window.fetch = async (u, o) => { rec(cur, u, o); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(reply)), text: async () => '' }; };
  window.confirm = () => true; window.alert = () => {};

  const mk = (tag, id, val) => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag); e.id = id; document.body.appendChild(e); } if (val != null) e.value = val; return e; };
  const errs = [];
  const run = async (name, f) => { cur = name; try { await f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); } };

  // ── 게이트 + adminSave (시크릿 없음/있음 두 갈래) ──
  try { sessionStorage.removeItem('bs_admin_secret'); } catch (e) {}
  await run('adminSave(시크릿없음)', () => adminSave({ op: 'probe' }));
  mk('input', 'lgPw', 'probe-pw');
  await run('lgTry', () => lgTry());   // 가짜 ok → 시크릿 저장 + 게이트 숨김
  await run('adminSave(시크릿있음)', () => adminSave({ op: 'probe2', rows: [{ a: 1 }] }));

  // ── storage 업로드 2곳 ──
  const ed = document.createElement('div'); ed.contentEditable = 'true'; document.body.appendChild(ed);
  await run('rtUpload', () => rtUpload(new File([new Uint8Array(9)], 'p.png', { type: 'image/png' })));
  await run('rtUploadFile', () => rtUploadFile(ed, new File([new Uint8Array(9)], 'p.pdf', { type: 'application/pdf' })));
  await run('rtUploadFile(type없음)', () => rtUploadFile(ed, new File([new Uint8Array(9)], 'p.bin', { type: '' })));   // octet-stream 갈래

  // ── 익명 REST GET 14곳 ──
  reply = [];
  await run('loadSections', () => loadSections());
  await run('loadClassicsPool', () => loadClassicsPool());
  await run('fillHeld(101권=2페이지)', () => fillHeld(Array.from({ length: 101 }, (_, i) => ({ isbn: String(9788900000000 + i), title: '책' + i }))));
  await run('loadServerPrograms', () => loadServerPrograms());
  await run('loadInventory', () => loadInventory());
  await run('loadChallenges', () => loadChallenges());
  await run('loadNotices', () => loadNotices());
  await run('loadPopups', () => loadPopups());
  await run('loadCommPosts', () => loadCommPosts());
  await run('renderCommReviews', () => renderCommReviews());
  mk('span', 'aicUsage');
  await run('aicLoadUsage', () => aicLoadUsage());
  mk('p', 'aicDtDesc');
  await run('aicLoadDescAdmin(isbn만)', () => aicLoadDescAdmin({ isbn: '9788937460449' }));
  await run('aicLoadDescAdmin(brcd)', () => aicLoadDescAdmin({ brcd: 'BR1', isbn: 'sm-BR1' }));
  mk('input', 'secQ', '돈키호테');
  await run('secSearchSemyung', () => secSearchSemyung());
  await run('secSearchSemyung(특수문자)', () => { el('secQ').value = '돈(키)호테*'; return secSearchSemyung(); });

  // ── 통합검색 nat 갈래(익명 GET + CURATE POST 병렬) · ISBN 조회 ──
  scTab = 'nat'; el('secQ').value = '마음이 따뜻해지는 소설';
  reply = { candidates: [] };
  CUR_FORMAT = 'both';
  await run('secSearch(both)', () => secSearch());
  CUR_FORMAT = 'ebook';
  await run('secSearch(ebook)', () => secSearch());
  CUR_FORMAT = 'both';
  scTab = 'isbn'; el('secQ').value = '9788937460449';
  reply = { info: {} };
  await run('secLookupISBN', () => secSearch());   // scTab=isbn → secLookupISBN

  // ── AI 큐레이션: 대화 1건 + 생성 2갈래 ──
  AIC_BUSY = false; reply = { ready: false, chips: ['소설'] };   // ready:false → 생성으로 안 이어짐(fetch 1건)
  await run('aicSend', () => aicSend('여행 에세이'));
  AIC_BUSY = false; reply = { candidates: [], monthCount: 3 };
  await run('aicRunGenerate(소장)', () => aicRunGenerate('바다 이야기', false));
  AIC_CTX = 'foreign'; CLASSICS_POOL.length = 0; CLASSICS_POOL.push({ id: 'gb-1', title: '오디세이아', author: '호메로스', origin: 'foreign' });
  AIC_BUSY = false;
  await run('aicRunGenerate(고전pool)', () => aicRunGenerate('그리스 고전', false));
  AIC_CTX = '';

  // ── RPC 1곳 ──
  reply = { totals: {}, today: {} };
  await run('renderMsApp', () => renderMsApp());

  // ── Range 페이징(fetchAllRows ×2) — 날짜는 고정값(프리셋이 오늘 기준이라) ──
  mk('input', 'fdFrom', '2026-08-01'); mk('input', 'fdTo', '2026-08-31');
  reply = [];
  await run('loadWritings', () => loadWritings());

  return { log, errs };
}

const { srv, base } = await startServer();
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.route(/supabase\.co\//, r => r.abort());   // 부팅 중 진짜 서버 호출 차단
await page.goto(base + '/admin/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(800);
const r = await page.evaluate(runInPage);
console.log(`기록 ${r.log.length}건, 예외 ${r.errs.length}건${r.errs.length ? ' → ' + r.errs.join(' | ') : ''}`);
for (const l of r.log) console.log(`   ${l.fn.padEnd(24)} ${l.method} ${l.url}`);
await browser.close(); srv.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
console.log('저장:', path.relative(ROOT, OUT));
