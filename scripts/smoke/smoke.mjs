// 북스타 스모크 테스트 — 리팩터링 세션마다 "안 깨졌다"를 증명하는 도구 (2026-09-02 S1)
//
//   node scripts/smoke/smoke.mjs                 로컬(정적 서버 자동 기동) · 서버 호출 시나리오 포함
//   node scripts/smoke/smoke.mjs --live          운영(https://semyung.bookstar.co.kr)
//   node scripts/smoke/smoke.mjs --no-net        ② 별이 검색(LLM 비용) 건너뜀
//   node scripts/smoke/smoke.mjs --shots         스크린샷 기준선 저장 (_smoke_baseline/)
//   node scripts/smoke/smoke.mjs --compare       기준선과 픽셀 비교 (CSS 분리 등 시각 무변화 증명)
//
// 안전장치: 운영 DB에 흔적을 남기지 않는다 —
//   rest/v1 쓰기(POST/PATCH/PUT/DELETE)는 전부 차단, 학생 신원은 브라우저 localStorage에만 심는다.
//   functions/v1 는 ②(byeoli-search)만 허용. 그 외 functions 호출은 --no-net 이면 차단.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const LIVE = args.has('--live');
const NO_NET = args.has('--no-net');
const SHOTS = args.has('--shots');
const COMPARE = args.has('--compare');
const BASE_DIR = path.join(ROOT, '_smoke_baseline');
const OUT_DIR = path.join(ROOT, '_smoke_out');

const STUDENT = { id: 'smoke-bot', name: '스모크봇', emoji: '🤖', dept: 'QA' };
const DQ_ID = 'gb-5921';          // 돈키호테 (bodies_gb5921.js)
const DQ_TOC_EXPECT = 122;        // 9/2 기준선 속표지 목차 항목 수 — 달라지면 회귀(또는 의도된 본문 수정 → 여기 갱신)
const KR_ID = 'kr-이효석-메밀꽃-필-무렵';     // 메밀꽃 필 무렵 (bodies_kr-memilkkot.js)

// ── 로컬 정적 서버 (python 의존 없이) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
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

// ── 결과 수집 ──
const results = [];
function ok(name, detail = '') { results.push({ name, pass: true, detail }); console.log(`  ✔ ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail = '') { results.push({ name, pass: false, detail }); console.log(`  ✘ ${name}${detail ? ' — ' + detail : ''}`); }
function warn(name, detail = '') { results.push({ name, pass: true, warn: true, detail }); console.log(`  ⚠ ${name}${detail ? ' — ' + detail : ''}`); }

async function newPage(ctx, label) {
  const page = await ctx.newPage();
  const errs = []; const cerrs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
  // 쓰기 차단 + functions 통제
  await page.route(/supabase\.co\/rest\/v1\//, r => (r.request().method() === 'GET' || r.request().method() === 'HEAD') ? r.continue() : r.abort());
  await page.route(/supabase\.co\/functions\/v1\//, r => {
    const u = r.request().url();
    if (!NO_NET && /byeoli-search/.test(u)) return r.continue();
    if (/curate|semyung-|library-brain|chat|recommend|push-register|notify-due|evaluate|find-in-library|bookinfo/.test(u)) return r.abort();
    return r.continue();
  });
  page._errs = errs; page._cerrs = cerrs; page._label = label;
  return page;
}
function pageErrReport(page) {
  // 우리가 route로 끊은 요청이 내는 "Failed to fetch"류는 앱 결함이 아니라 테스트 장치 흔적 → 경고로만
  const netRe = /ERR_FAILED|Failed to fetch|NetworkError|net::|ERR_ABORTED|the server responded with a status/;
  const e = page._errs.filter(t => !netRe.test(t)), c = page._cerrs.filter(t => !netRe.test(t)).concat(page._errs.filter(t => netRe.test(t)).map(t => '(차단된 요청) ' + t));
  return { hard: e, soft: c };
}

async function shot(page, name) {
  const dir = SHOTS ? BASE_DIR : OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  await page.screenshot({ path: f, fullPage: false });
  if (COMPARE) {
    const bf = path.join(BASE_DIR, name + '.png');
    if (!fs.existsSync(bf)) return warn(`스크린샷 ${name}`, '기준선 없음 (--shots 먼저)');
    const { PNG } = await import('pngjs');
    const pixelmatch = (await import('pixelmatch')).default;
    const a = PNG.sync.read(fs.readFileSync(bf)), b = PNG.sync.read(fs.readFileSync(f));
    if (a.width !== b.width || a.height !== b.height) return fail(`스크린샷 ${name}`, `크기 다름 ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const ratio = n / (a.width * a.height);
    fs.writeFileSync(path.join(OUT_DIR, name + '.diff.png'), PNG.sync.write(diff));
    if (ratio <= 0.001) ok(`스크린샷 ${name}`, `차이 ${(ratio * 100).toFixed(3)}%`);
    else fail(`스크린샷 ${name}`, `차이 ${(ratio * 100).toFixed(2)}% (허용 0.1%) → _smoke_out/${name}.diff.png`);
  }
}

(async () => {
  let srv = null, base;
  if (LIVE) base = 'https://semyung.bookstar.co.kr';
  else { const s = await startServer(); srv = s.srv; base = s.base; }
  console.log(`\n북스타 스모크 — 대상: ${base}${NO_NET ? ' (서버 호출 건너뜀)' : ''}${SHOTS ? ' (기준선 저장)' : ''}${COMPARE ? ' (기준선 비교)' : ''}\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bookstar-theme', 'light'); } catch (e) {} });
  // 8/29 신원 잠금: 부팅 때 Auth 세션 없으면 localStorage 학생을 지운다(정상). 그래서 로드 뒤 __SSO_STUDENT 로 심는다 —
  //   bxStudent()가 이걸 먼저 보므로 뷰어 게이트를 통과. 진짜 로그인이 아니고 쓰기는 route로 차단되어 DB 흔적 없음.
  const plantStudent = page => page.evaluate(s => { window.__SSO_STUDENT = s; }, STUDENT);

  // ① 홈(우리 도서관) 로드
  {
    const page = await newPage(ctx, 'home');
    try {
      await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#page-ourlib.active', { timeout: 20000 });
      await page.waitForFunction(() => (document.getElementById('libCurationGrid') || {}).childElementCount > 0, null, { timeout: 20000 });
      const n = await page.evaluate(() => document.getElementById('libCurationGrid').childElementCount);
      const r = pageErrReport(page);
      if (r.hard.length) fail('① 홈 로드', 'JS 예외: ' + r.hard[0]); else ok('① 홈 로드', `큐레이션 ${n}구역, JS 예외 0`);
      if (r.soft.length) warn('① console.error', r.soft.slice(0, 2).join(' | '));
      await page.waitForTimeout(1500);
      await shot(page, 'home');
    } catch (e) { fail('① 홈 로드', String(e.message).split('\n')[0]); }
    await page.close();
  }

  // ② 별이 통합 검색 "오디세이" (서버 byeoli-search — LLM 비용 발생)
  if (!NO_NET) {
    const page = await newPage(ctx, 'search');
    try {
      await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => typeof byeoliFindBooks === 'function', null, { timeout: 20000 });
      const res = await page.evaluate(async () => {
        const r = await byeoliFindBooks('오디세이', 'smoke', false, ['오디세이']);
        return r ? { n: (r.results || []).length, off: !!r.offtopic, first: (r.results || [])[0]?.title || '' } : null;
      });
      if (!res) warn('② 별이 검색', '서버 응답 없음(네트워크/서버) — 합격 판정 제외');
      else if (res.n >= 1) ok('② 별이 검색 "오디세이"', `${res.n}건, 첫 결과 "${res.first}"`);
      else warn('② 별이 검색 "오디세이"', `0건 (LLM 변동 가능 — 두 번 연속이면 회귀 의심)`);
    } catch (e) { warn('② 별이 검색', String(e.message).split('\n')[0]); }
    await page.close();
  } else warn('② 별이 검색', '--no-net 으로 건너뜀');

  // ③ 해외 고전 뷰어 — 돈키호테 속표지 목차
  {
    const page = await newPage(ctx, 'dq');
    try {
      await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => typeof openViewer === 'function' && typeof BOOKS !== 'undefined', null, { timeout: 20000 });
      await plantStudent(page);
      await page.evaluate(id => openViewer(id, 'full'), DQ_ID);
      await page.waitForSelector('#viewerOverlay.open', { timeout: 20000 });
      await page.waitForFunction(() => document.querySelectorAll('.bf-toc .bf-ch').length >= 1, null, { timeout: 90000 });
      await page.waitForTimeout(800);
      const n = await page.evaluate(() => document.querySelectorAll('.bf-toc .bf-ch').length);
      const r = pageErrReport(page);
      if (r.hard.length) fail('③ 돈키호테 속표지', 'JS 예외: ' + r.hard[0]);
      else if (n === DQ_TOC_EXPECT) ok('③ 돈키호테 속표지 목차', `${n}항목`);
      else fail('③ 돈키호테 속표지 목차', `${n}항목 (기준선 ${DQ_TOC_EXPECT})`);
      await shot(page, 'viewer-front-dq');
      await page.evaluate(() => frontGoRead());
      await page.waitForFunction(() => document.querySelectorAll('#viewerBody p').length >= 10, null, { timeout: 30000 });
      const np = await page.evaluate(() => document.querySelectorAll('#viewerBody p').length);
      ok('③ 돈키호테 본문 렌더', `문단 ${np}`);
      await page.waitForTimeout(800);
      await shot(page, 'viewer-body-dq');
    } catch (e) { fail('③ 돈키호테 뷰어', String(e.message).split('\n')[0]); }
    await page.close();
  }

  // ④ 국내 고전 뷰어 — 메밀꽃 필 무렵
  {
    const page = await newPage(ctx, 'kr');
    try {
      await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => typeof openViewer === 'function' && typeof BOOKS !== 'undefined', null, { timeout: 20000 });
      await plantStudent(page);
      await page.evaluate(id => openViewer(id, 'full'), KR_ID);
      await page.waitForSelector('#viewerOverlay.open', { timeout: 20000 });
      await page.waitForSelector('.book-front', { timeout: 60000 });   // 단편은 목차 항목이 없을 수 있어 속표지 자체만 확인
      await page.waitForTimeout(500);
      await page.evaluate(() => frontGoRead());
      await page.waitForFunction(() => document.querySelectorAll('#viewerBody p').length >= 10, null, { timeout: 30000 });
      const np = await page.evaluate(() => document.querySelectorAll('#viewerBody p').length);
      const r = pageErrReport(page);
      if (r.hard.length) fail('④ 국내 고전 뷰어', 'JS 예외: ' + r.hard[0]); else ok('④ 국내 고전 본문 렌더', `문단 ${np}`);
    } catch (e) { fail('④ 국내 고전 뷰어', String(e.message).split('\n')[0]); }
    await page.close();
  }

  // ⑤ 관리자 화면 로드 (로그인 게이트까지)
  {
    const page = await newPage(ctx, 'admin');
    try {
      await page.goto(base + '/admin/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#loginGate', { timeout: 20000 });
      const vis = await page.evaluate(() => { const g = document.getElementById('loginGate'); return !!g && getComputedStyle(g).display !== 'none'; });
      const r = pageErrReport(page);
      if (r.hard.length) fail('⑤ 관리자 로드', 'JS 예외: ' + r.hard[0]);
      else if (vis) ok('⑤ 관리자 로드', '로그인 게이트 표시, JS 예외 0');
      else warn('⑤ 관리자 로드', '로그인 게이트가 숨김 상태(세션 잔존?)');
    } catch (e) { fail('⑤ 관리자 로드', String(e.message).split('\n')[0]); }
    await page.close();
  }

  // ⑥ 관리자 로그인 뒤 화면 (S8용, 9/2) — 게이트는 sessionStorage 에 비밀번호가 "있기만 하면" 숨겨지므로 가짜 값을 심는다.
  //   진짜 비밀번호 아님 → 저장 요청은 서버(admin-save)가 거절하고, 어차피 route 가 쓰기를 전부 차단. 읽기(GET)만 실제로 나간다.
  {
    const actx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR', deviceScaleFactor: 1 });
    await actx.addInitScript(() => { try { sessionStorage.setItem('bs_admin_secret', 'smoke-fake'); localStorage.setItem('bs_admin_mode', 'web'); } catch (e) {} });
    const page = await newPage(actx, 'admin-in');
    try {
      await page.goto(base + '/admin/', { waitUntil: 'load', timeout: 60000 });
      const gateHidden = await page.evaluate(() => { const g = document.getElementById('loginGate'); return !!g && getComputedStyle(g).display === 'none'; });
      if (!gateHidden) throw new Error('로그인 게이트가 안 숨겨짐');
      await page.waitForFunction(() => typeof go === 'function' && typeof setMode === 'function', null, { timeout: 20000 });
      // 대시보드(첫 화면) — 기간·시트 요약 줄
      await page.waitForFunction(() => ((document.getElementById('dbSumLine') || {}).textContent || '').length > 0, null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      await shot(page, 'admin-dash');
      // 우리도서관 칸 목록(설정 페이지, library_sections 읽기 → 렌더)
      await page.evaluate(() => { const n = document.querySelector('.navi'); go(n, 'settings'); });
      await page.waitForFunction(() => (document.getElementById('secList') || {}).childElementCount > 0, null, { timeout: 30000 });
      const nSec = await page.evaluate(() => document.getElementById('secList').childElementCount);
      await page.waitForTimeout(1500);
      await shot(page, 'admin-settings');
      // 사이드 메뉴 전 페이지 순회 — 렌더 함수가 전부 예외 없이 도는지
      const pages = ['stats', 'chstat', 'writings', 'history', 'make', 'notice', 'settings', 'comm', 'popup', 'dash'];
      for (const pg of pages) {
        await page.evaluate(p => { const n = document.querySelector('.navi') || document.body; go(n, p); }, pg);
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => { const n = document.querySelector('.navi'); go(n, 'make'); });
      await page.waitForFunction(() => (document.getElementById('chalList') || {}).childElementCount > 0, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await shot(page, 'admin-make');
      const r = pageErrReport(page);
      if (r.hard.length) fail('⑥ 관리자 로그인 뒤', 'JS 예외: ' + r.hard[0]);
      else ok('⑥ 관리자 로그인 뒤', `칸 ${nSec}개, 페이지 ${pages.length}개 순회, JS 예외 0`);
      if (r.soft.length) warn('⑥ console.error', r.soft.slice(0, 2).join(' | '));
    } catch (e) { fail('⑥ 관리자 로그인 뒤', String(e.message).split('\n')[0]); }
    await page.close(); await actx.close();
  }

  await browser.close();
  if (srv) srv.close();

  const nf = results.filter(r => !r.pass).length, nw = results.filter(r => r.warn).length;
  console.log(`\n결과: 통과 ${results.length - nf - nw} · 경고 ${nw} · 실패 ${nf}\n`);
  process.exit(nf ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
