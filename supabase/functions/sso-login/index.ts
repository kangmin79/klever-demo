// 북스타 — 세명대 도서관 SSO(자동로그인) 접수 서버
// 도서관 홈페이지 배너(또는 테스트 폼)가 로그인된 학생의 [학번+이름]을 POST로 보냄
//  → 이 함수가 ①school 검증 ②Supabase 정식 계정을 학번으로 생성/조회(자산 확보)
//    ③앱으로 리다이렉트하며 학생정보 전달 → app.html이 __SSO_STUDENT 세팅해 로그인
//
// 규격서(북스타_SSO_연동규격서 v0.4) '기본 단순 방식(아이티고식)' 구현.
// ⚠️ 테스트 단계: 단순 방식은 학번+이름만으로 위조 가능(referer 확인이 유일 방어).
//    실배포 전 보강②(HMAC 서명) 또는 Auth verifyOtp 정식세션으로 격상할 것.
//
// POST (application/x-www-form-urlencoded):
//   school=semyung.ac.kr  client_userid=<학번>  client_username=<이름>
// 응답: 302 → https://bookstar.co.kr/app?sso_uid=<학번>&sso_name=<이름>&sso_dept=세명대학교#ourlib

const ALLOWED_SCHOOL = "semyung.ac.kr";
const APP_URL = "https://bookstar.co.kr/app";
// 가상 이메일 도메인(실제 발송 안 됨) — 학번당 1계정 결정론적 매핑
const SSO_EMAIL_DOMAIN = "sso.semyung.bookstar.internal";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errPage(msg: string, code = 400): Response {
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#334">
    <h3 style="color:#c0392b">로그인 연동 오류</h3><p>${msg}</p>
    <p style="font-size:13px;color:#889">창을 닫고 도서관 홈페이지에서 다시 시도해 주세요.</p></body>`;
  return new Response(html, { status: code, headers: { ...CORS, "content-type": "text/html; charset=utf-8" } });
}

// Supabase Auth Admin — 학번 이메일로 계정 생성(있으면 조용히 무시). 정식 계정 자산 확보.
async function ensureAuthUser(hakbun: string, name: string): Promise<void> {
  const email = `${hakbun.toLowerCase()}@${SSO_EMAIL_DOMAIN}`;
  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "content-type": "application/json" },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { hakbun, name, school: ALLOWED_SCHOOL, via: "sso" },
    }),
  });
  // 201=신규 생성, 422/409=이미 존재(정상). 그 외는 로그만(로그인 흐름은 계속 — 계정은 부가자산).
  if (!r.ok && r.status !== 422 && r.status !== 409) {
    console.error("ensureAuthUser fail", r.status, (await r.text()).slice(0, 200));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return errPage("잘못된 접근입니다.", 405);

  try {
    const ct = req.headers.get("content-type") || "";
    let school = "", uid = "", uname = "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const f = await req.formData();
      school = String(f.get("school") || "").trim();
      uid = String(f.get("client_userid") || "").trim();
      uname = String(f.get("client_username") || "").trim();
    } else {
      const j = await req.json().catch(() => ({}));
      school = String(j.school || "").trim();
      uid = String(j.client_userid || "").trim();
      uname = String(j.client_username || "").trim();
    }

    // ① 필수값
    if (!school || !uid) return errPage("필수 항목(학교/학번)이 누락되었습니다.");
    // ② 등록된 학교인지
    if (school !== ALLOWED_SCHOOL) return errPage("등록되지 않은 학교입니다.");
    // 학번 형식 방어(영숫자만, 과도 길이 차단)
    const hakbun = uid.replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
    if (!hakbun) return errPage("학번 형식이 올바르지 않습니다.");
    const name = (uname || hakbun).slice(0, 40);

    // ③ 정식 계정 자산 확보(실패해도 로그인은 진행)
    try { await ensureAuthUser(hakbun, name); } catch (e) { console.error("ensureAuthUser err", String(e)); }

    // ④ 앱으로 리다이렉트하며 학생정보 전달 → app.html이 __SSO_STUDENT 세팅
    const q = new URLSearchParams({ sso_uid: hakbun, sso_name: name, sso_dept: "세명대학교" });
    const dest = `${APP_URL}?${q.toString()}#ourlib`;
    return new Response(null, { status: 302, headers: { ...CORS, Location: dest } });
  } catch (e) {
    return errPage("처리 중 오류가 발생했습니다. (" + String(e).slice(0, 120) + ")", 500);
  }
});
