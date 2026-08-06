// 세명대 전자책 "바로 읽기" 릴레이
// 북스타(https)는 세명대 전자책 서버(http:8082)를 직접 호출할 수 없음(CORS+mixed content).
// 이 Edge Function이 서버에서 yes24_ebook_open.asp를 호출 → goViewer 토큰 추출 →
// 예스24 웹뷰어 최종 URL을 조립해 돌려줌. 북스타는 그 URL을 새 탭으로 열기만 하면
// 예스24 "보기 방법 선택" 화면을 건너뛰고 바로 책 리더로 진입한다.
//
// 호출: POST { user_id, goods_id }  →  { ok, url }
// 보안: 데모 단계. 실서비스에선 user_id를 로그인 세션에서 서버가 결정해야 함(클라 신뢰 금지).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EBOOK_BASE = "http://ebook.semyung.ac.kr:8082";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { user_id, goods_id } = await req.json();
    if (!user_id || !goods_id) {
      return json({ ok: false, error: "user_id, goods_id 필수" }, 400);
    }

    // 1) 토큰 발급소(asp) 호출 — 세션 쿠키 없이 user_id+goods_id 만으로 응답함(실측)
    const openUrl = `${EBOOK_BASE}/api/yes24_ebook_open.asp?user_id=${encodeURIComponent(user_id)}&goods_id=${encodeURIComponent(goods_id)}`;
    const r = await fetch(openUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" },
    });
    if (!r.ok) return json({ ok: false, error: `asp ${r.status}` }, 502);
    const html = await r.text();

    // 2) goViewer('domain','code','subcode','token') 인자 추출
    const m = html.match(/goViewer\('([^']*)','([^']*)','([^']*)','([^']*)'\)/);
    if (!m) {
      // 대출 안 된 책 등으로 토큰이 없을 때 → 상세 페이지로 폴백
      return json({
        ok: false,
        error: "no_token",
        fallback: `${EBOOK_BASE}/elibrary-front/content/contentView.ink?cttsDvsnCode=001&brcd=${encodeURIComponent(goods_id)}`,
      }, 200);
    }
    const [, domain, code, subcode, s] = m;

    // 3) webview.js의 goViewer 로직 그대로 재현: '/'→'-' 치환 후 encodeURIComponent
    const enc = encodeURIComponent(s.split("/").join("-"));
    const url = `${domain}${code}/${subcode}/${enc}`;

    return json({ ok: true, url });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
