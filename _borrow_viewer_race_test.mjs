// semyung-ebook-borrow 실측 — "대출 직후 뷰어가 표지만 보이고 안 열리다가 재시도하면 열린다"는 사용자 신고 진단.
// 대출→즉시 viewer 재발급(action=viewer)과, 몇 초 뒤 viewer 재발급을 비교해 응답 차이가 있는지 본다.
// 끝나면 반드시 반납(정리)한다. 사용: node _borrow_viewer_race_test.mjs
import fs from 'node:fs';
const SB = 'https://gkujptyfrzqrjrvovbnc.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc';
const BRCD = '4808901056272';   // 비타민 혁명 — 총 2부·대출 0(실측 확인)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function login() {
  const r = await fetch(`${SB}/functions/v1/sso-login`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'school=semyung.ac.kr&client_userid=book&client_username=&portal_id=book&portal_pw=semyung7002' });
  const loc = r.headers.get('location') || '';
  const m = loc.match(/sso_token=([^&]+)/); if (!m) throw new Error('login fail ' + r.status);
  return decodeURIComponent(m[1]);
}
async function eb(tok, action, extra = {}) {
  const u = new URL(`${SB}/functions/v1/semyung-ebook-borrow`);
  u.searchParams.set('action', action);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } });
  return { status: r.status, ...(await r.json()) };
}
// popWebviewer.ink 실체 확인(8/22 실측): 정적 페이지가 아니라 JS로 window.location.href = webViewrUrl+"/"+token 를
// 실행하는 클라이언트 리다이렉트다(fetch의 redirect:'follow'로는 안 잡힘 — HTTP 리다이렉트가 아니라 JS다).
// 그래서 그 최종 주소를 직접 다시 떠야 진짜 콘텐츠 서버 응답을 본다.
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
async function probeContent(viewerUrl) {
  try {
    const r0 = await fetch(viewerUrl, { headers: { 'User-Agent': UA } });
    const html = await r0.text();
    const m = /var webViewrUrl = "([^"]+)";\s*var token = "([^"]+)"/.exec(html);
    if (!m) return { step: 'popup', status: r0.status, len: html.length, snippet: html.replace(/\s+/g, ' ').slice(0, 200) };
    const finalUrl = m[1] + '/' + m[2];
    const r1 = await fetch(finalUrl, { headers: { 'User-Agent': UA, Referer: viewerUrl }, redirect: 'follow' });
    const txt = await r1.text();
    return { step: 'content', finalUrl: r1.url, status: r1.status, len: txt.length, snippet: txt.replace(/\s+/g, ' ').slice(0, 300) };
  } catch (e) { return { error: String(e).slice(0, 150) }; }
}

const tok = await login(); log('로그인 성공');

log('=== 1) 대출 ===');
const b = await eb(tok, 'borrow', { brcd: BRCD });
log('borrow 결과:', JSON.stringify({ ok: b.ok, vendor: b.vendor, viewerError: b.viewerError, message: b.message, loanSrmb: b.loanSrmb }));
if (!b.ok) { log('대출 실패 — 중단'); process.exit(1); }
const loanSrmb = b.loanSrmb;

log('앱이 실제로 여는 전체 URL:', b.viewerUrl);

log('=== 2) 대출 직후(0초) — 그 URL을 모바일 UA로 그대로 요청 ===');
const p0 = await probeContent(b.viewerUrl);
log(JSON.stringify(p0));

log('=== 3) 3초 대기 후 — 같은 URL 재요청(토큰 재사용) ===');
await new Promise((r) => setTimeout(r, 3000));
const p1 = await probeContent(b.viewerUrl);
log(JSON.stringify(p1));

log('=== 4) 3초 더 대기(총 6초) 후 — viewer 액션으로 토큰 새로 재발급 + 그 URL 요청 ===');
await new Promise((r) => setTimeout(r, 3000));
const v2 = await eb(tok, 'viewer', { loanSrmb });
log('viewer(재발급) 결과:', JSON.stringify({ ok: v2.ok, vendor: v2.vendor, message: v2.message }));
if (v2.ok) {
  log('재발급 URL 이전과 같은가?', v2.viewerUrl === b.viewerUrl, v2.viewerUrl);
  const p2 = await probeContent(v2.viewerUrl);
  log(JSON.stringify(p2));
}

log('=== 5) 정리 — 반납 ===');
const ret = await eb(tok, 'return', { loanSrmb, brcd: BRCD });
log('반납 결과:', JSON.stringify(ret));
