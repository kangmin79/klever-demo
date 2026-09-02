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
// 대상(2회차): REST GET `{headers:BX_H}` 19곳 → sbGet(path). chalResolveFormats·bxLoadResultsFromDB·bxLoadReaderStats
//   ·mpHydrate·mpLoadQuiz(level 있음/없음)·_mpFetchScenes·_agFetch·openProfileEdit·renderMyWritings·usTulipSearch
//   ·_bxNames·loadFeedSocial·loadFeedItems·openStudentProfile(본인/남).  학생은 window.__SSO_STUDENT 로 심는다.
// 대상(3회차): 익명 키 GET 16곳 → sbGetAnon(path)  ·  REST 쓰기(POST/PATCH/DELETE) 25곳 → sbWrite(method,path,body,opts).
//   쓰기 본문의 시각(updated_at·last_seen·done_at 등 ISO)은 실행마다 달라 가린다. keepalive 도 기록한다.
// 헤더는 키 이름 순으로 정렬해 기록한다 — HTTP 헤더는 순서가 없으므로 객체 키 순서 차이는 동작 차이가 아니다.
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
  const mask = b => (typeof b === 'string') ? b.replace(/"session_id":"[^"]*"/g, '"session_id":"*"').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '*ISO*') : b;
  const sortH = h => { if (!h || typeof h !== 'object') return h || null; const o = {}; for (const k of Object.keys(h).sort()) o[k] = h[k]; return o; };
  const rec = (fn, u, o) => log.push({ fn, url: String(u), method: (o && o.method) || 'GET', headers: sortH(o && o.headers), body: mask((o && o.body) || null), keepalive: !!(o && o.keepalive) });
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

  // ── 2회차: REST GET(BX_H) 19곳 — 학생·현재 책·챌린지 목록을 심고 그 함수들을 순서대로 부른다 ──
  window.__SSO_STUDENT = { id: 'S1', name: '테스트', emoji: '📘' };
  currentBook = { id: 'gb-5921', title: '돈키호테' };
  CHAL_PUB = [{ books: [{ isbn: '9788937460449' }, { isbn: '9791162540640', tags: ['x'] }, { isbn: 'abc' }] }];   // 맨 ISBN 1개만 조회 대상
  for (const id of ['mpQuizBox', 'myWritings']) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
  const steps2 = [
    ['chalResolveFormats', () => chalResolveFormats()],
    ['bxLoadResultsFromDB', () => bxLoadResultsFromDB()],
    ['bxLoadReaderStats', () => bxLoadReaderStats()],
    ['mpHydrate(solo)', () => mpHydrate(null, { quiz: false }, bxStudent(), true)],
    ['mpLoadQuiz(level)', () => mpLoadQuiz({ quizType: '작품 이해', quizLevel: '상' })],
    ['mpLoadQuiz(level없음)', () => mpLoadQuiz({ quizType: '인문학' })],
    ['_mpFetchScenes', () => _mpFetchScenes()],
    ['_agFetch', () => _agFetch('bookstar_students?id=eq.S1&select=bio')],
    ['openProfileEdit', () => openProfileEdit()],
    ['renderMyWritings', () => renderMyWritings()],
    ['usTulipSearch', () => usTulipSearch('오디세이', [])],
    ['_bxNames', () => _bxNames()],
    ['loadFeedSocial', () => loadFeedSocial()],
    ['loadFeedItems', () => loadFeedItems()],
    ['openStudentProfile(본인)', () => openStudentProfile('S1')],
    ['openStudentProfile(남)', () => openStudentProfile('S2')],
  ];
  for (const [name, f] of steps2) { cur = name; try { await f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); } }

  // ── 3회차 ①: 익명 키 GET 16곳 — 공개 표(장서·프로그램·큐레이션 칸·서평·팝업·번역 제목) ──
  _progCache = null; _progCacheP = null; KR_TITLE_TR = null; _krTitleP = null;
  { const d = document.createElement('div'); d.id = 'lcdDesc'; document.body.appendChild(d); }
  const steps3 = [
    ['_smNewTable', () => _smNewTable()],
    ['_smLoanRank', () => _smLoanRank()],
    ['fetchProgramsCached', () => fetchProgramsCached()],
    ['tulipPaperKey(isbn)', () => tulipPaperKey('9788937460449', '돈키호테', '세르반테스')],
    ['tulipPaperKey(제목만)', () => tulipPaperKey('', '오디세이아', '호메로스')],
    ['pruneDeadChals', () => pruneDeadChals()],
    ['loadCommunityPosts', () => loadCommunityPosts()],
    ['loadSections', () => loadSections()],
    ['loadAreaSections', () => loadAreaSections('고전 컬렉션')],
    ['_pvLoadPub', () => _pvLoadPub()],
    ['tulipEbookBarcode', () => tulipEbookBarcode('돈키호테')],
    ['loadDesc(종이책)', () => loadDesc('CATTOT123', true, {})],
    ['loadDesc(전자책)', () => loadDesc('9788937460449', false, {})],
    ['bxResolveBooks', () => bxResolveBooks(['sm-12345', 'sm-CATTOT678', '9788937460449', 'gb-5921'])],
    ['rvFetch', () => rvFetch('select=*&order=created_at.desc&limit=3')],
    // 사서 팝업은 로드 시 1회 도는 IIFE — 같은 파일을 script 로 다시 꽂아 재실행
    ['popup(92)', () => new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/92-library-popup.js?probe=1'; s.onload = res; s.onerror = () => rej(new Error('92 로드 실패')); document.head.appendChild(s); })],
    ['loadKrTitles', () => loadKrTitles()],
  ];
  for (const [name, f] of steps3) { cur = name; try { await f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); } }

  // ── 3회차 ②: REST 쓰기 25곳 — 학생 세션(BX_H)·익명 두 갈래, POST/PATCH/DELETE, Prefer 변형, keepalive ──
  window.mpProgress = () => ({ done: 1, total: 1 });   // 미션 진행 계산은 관심 밖 — 완주 갈래(enroll done)도 지나가게
  window.joinedChals = () => []; window._saveJoinedChals = () => {};
  CHAL_PUB = [{ id: 'C1', title: '챌린지', books: [] }];
  _mpCtx = { student: 'S1', school: 'semyung', chId: 'C1', bookId: 'gb-5921', done: new Set(), ans: { q1: { ok: true } }, quizCount: 1, m: {}, solo: false, complete: false };
  _wr = { k: 'review', bookId: 'gb-5921', b: { isbn: '', title: '돈키호테' }, def: { min: 5 }, chId: 'C1' };
  _curFav = { id: 'gb-1', reason: '이전 인생책' }; _bmPendBook = 'gb-5921';
  rvCtx = { bookId: 'gb-5921', bookTitle: '돈키호테', rating: 4 };
  const TXT = '이 책은 정말 좋았습니다. 다시 읽고 싶어요.';
  const mk = (tag, id, val) => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag); e.id = id; document.body.appendChild(e); } if (val != null) e.value = val; return e; };   // 화면에 이미 있는 요소(서평 모달 등)면 그걸 씀
  mk('textarea', 'wrTa', TXT); mk('input', 'bmReason', '이유'); mk('textarea', 'peBio', '소개'); mk('textarea', 'mp_ta_review', TXT); mk('textarea', 'rvmBody', TXT);
  mk('input', 'rvmBookInput', '').style.display = 'none';
  const likeEl = document.createElement('div'); likeEl.innerHTML = '<b>3</b>'; document.body.appendChild(likeEl);
  const likeBtn = document.createElement('button'); likeBtn.innerHTML = '<span class="fl-c">0</span>'; document.body.appendChild(likeBtn);
  const folBtn = document.createElement('button'), folBtn2 = document.createElement('button'); document.body.append(folBtn, folBtn2);
  const steps4 = [
    ['chalJoin', () => chalJoin('C1', { silent: true })],
    ['bxEvent', () => bxEvent('view', { item_type: 'book', item_key: 'gb-1', item_title: '책' })],
    ['bxEvent(beacon)', () => bxEvent('view', { item_type: 'book', item_key: 'gb-2', item_title: '책2', beacon: true })],
    ['bxUpsertRead', () => bxUpsertRead('gb-5921', 55, 120)],
    ['bxUpsertRead(sec없음)', () => bxUpsertRead('gb-5921', 55)],
    ['bxUpsertResult', () => bxUpsertResult('gb-5921', { ans: { a: { ok: true } }, impression: '좋다', submitted: true })],
    ['bxUpsertReaderStats', async () => { bxUpsertReaderStats(); await new Promise(r => setTimeout(r, 1700)); }],
    ['_rsFlushNow', () => { bxUpsertReaderStats(); _rsFlushNow(); }],
    ['_bmWrite(POST)', () => _bmWrite('POST', 'bookstar_life_history', { a: 1 })],
    ['_bmWrite(DELETE)', () => _bmWrite('DELETE', 'bookstar_life_history?id=eq.1')],
    ['mbTouch', () => mbTouch({ id: 'gb-5921', t: '돈키호테', a: '세르반테스', isbn: '', cover: '' })],
    ['wrSubmit', () => wrSubmit()],
    ['saveLifeBook', () => saveLifeBook()],
    ['saveProfile', () => saveProfile()],
    ['mpSubmitWrite', () => mpSubmitWrite('review', 5)],
    ['mpSaveProgress', () => mpSaveProgress()],
    ['mpCheckComplete', () => { _mpCtx.complete = false; return mpCheckComplete(); }],
    ['bxEnsureStudentRow', () => bxEnsureStudentRow({ id: 'S1', name: '테스트', emoji: '📘' })],
    ['likeReview', () => likeReview(7, likeEl)],
    ['submitReview', () => submitReview()],
    ['byeoliLog', () => byeoliLog({ surface: 's', query: 'q', intent: 'books' })],
    ['byeoliClickLog', () => byeoliClickLog({ isbn: '1', title: 't', _eventId: 'e1', _surface: 's', _q: 'q', _pos: 0, _source: 'x', _kind: 'k' })],
    ['feedLike(추가)', () => feedLike(likeBtn, 'k1')],
    ['feedLike(취소)', () => feedLike(likeBtn, 'k1')],
    ['feedFollow(추가)', () => feedFollow(folBtn, 'S2')],
    ['feedFollow(취소)', () => feedFollow(folBtn, 'S2')],
    ['profileFollow(추가)', () => profileFollow(folBtn2, 'S3')],
    ['profileFollow(취소)', () => profileFollow(folBtn2, 'S3')],
  ];
  for (const [name, f] of steps4) { cur = name; try { await f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); } }
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
