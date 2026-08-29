// 북스타 — 세명대 도서관 SSO(자동로그인) 접수 서버
// 도서관 홈페이지 배너(또는 테스트 폼)가 로그인된 학생 정보를 POST로 보냄
//  → ①school 검증 ②(연계값이 오면) lib 체인으로 liid 확보 ③서버 세션 저장 ④앱으로 리다이렉트
//
// POST (application/x-www-form-urlencoded):
//   school=semyung.ac.kr  client_userid=<학번>  client_username=<이름>          ← 아이티고식 기본 3필드
//   [+ school_no=<암호화> portal_user_id=<암호화>]                              ← 개인기능용 연계값(요청 예정)
//   [+ portal_id=&portal_pw=]                                                   ← 테스트 계정 전용(운영 미사용)
//
// ⚠️ 학번(client_userid)은 도서관 openapi의 uid가 **아니다**(8/8 실측). openapi uid는 liid(회원번호)이며
//    오직 lib 세션에서만 얻을 수 있다. 따라서 연계값이 없으면 개인기능(대출현황·연장·예약·전자책)은
//    작동하지 않고 "이름만 표시되는 게스트" 상태로 진행한다. 전자책은 기존 공유계정으로 폴백.
//
// 응답: 302 → https://bookstar.co.kr/app?sso_uid=…&sso_name=…&sso_dept=…&sso_token=…&sso_personal=1|0#ourlib
import { signSsoToken } from "../_shared/sso_token.ts";
import { loadLatestByHakbun, newSid, saveSession } from "../_shared/sso_store.ts";
import { personalSession, portalLogin, type PortalHandoff } from "../_shared/semyung_session.ts";

const ALLOWED_SCHOOL = "semyung.ac.kr";
// 8/13 도메인 분리 — 앱은 semyung.bookstar.co.kr, bookstar.co.kr은 랜딩(회사 소개)만.
// ⚠️ 로그인 후 돌아오는 주소라 여기가 틀리면 학생이 랜딩 페이지로 튕긴다.
// 참나루 본체가 루트로 옮겨졌다(8/13) — /app 아니라 / 이다.
const APP_URL = "https://semyung.bookstar.co.kr/";
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
const ADMIN_H = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "content-type": "application/json" };
async function ensureAuthUser(hakbun: string, name: string): Promise<void> {
  const email = `${hakbun.toLowerCase()}@${SSO_EMAIL_DOMAIN}`;
  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: ADMIN_H,
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { hakbun, name, school: ALLOWED_SCHOOL, via: "sso" },
      app_metadata: { hakbun, school: ALLOWED_SCHOOL },
    }),
  });
  // 201=신규 생성, 422/409=이미 존재(정상). 그 외는 로그만(로그인 흐름은 계속 — 계정은 부가자산).
  if (!r.ok && r.status !== 422 && r.status !== 409) {
    console.error("ensureAuthUser fail", r.status, (await r.text()).slice(0, 200));
  }
}

// 8/29 신원 잠금: 앱이 쓰는 학생 신원 = Supabase Auth 세션(JWT)으로 통일.
//   JWT의 app_metadata.hakbun 은 서버(여기)만 쓸 수 있고 학생이 못 바꾼다 → DB RLS가 "본인 행만" 조건을 이걸로 건다.
//   흐름: 1회용 magiclink 해시(token_hash) 발급 → 앱이 /auth/v1/verify 로 교환 → 세션(access/refresh) 보관.
//   실패하면 빈 문자열 — 앱은 이 값이 없으면 로그인으로 치지 않는다(학번을 URL에서 믿던 옛 방식 폐기).
async function issueAuthHandoff(hakbun: string, name: string): Promise<string> {
  const email = `${hakbun.toLowerCase()}@${SSO_EMAIL_DOMAIN}`;
  const r = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: "POST", headers: ADMIN_H,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!r.ok) { console.error("generate_link fail", r.status, (await r.text()).slice(0, 200)); return ""; }
  const j = await r.json();
  const uid = j?.id || j?.user?.id || "";
  const th = j?.hashed_token || j?.properties?.hashed_token || "";
  if (!uid || !th) { console.error("generate_link shape", JSON.stringify(j).slice(0, 200)); return ""; }
  // 학번·이름을 서버 전용 칸(app_metadata)에 고정 — 기존 계정도 매 로그인마다 최신화(이름은 도서관 등록명 우선)
  const u = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, {
    method: "PUT", headers: ADMIN_H,
    body: JSON.stringify({ app_metadata: { hakbun, school: ALLOWED_SCHOOL }, user_metadata: { hakbun, name, school: ALLOWED_SCHOOL, via: "sso" } }),
  });
  if (!u.ok) { console.error("app_metadata fail", u.status, (await u.text()).slice(0, 200)); return ""; }
  return th;
}

// 연계값 → (liid 확보 → 세션 저장 → 앱으로 302) 공통 마무리.
// 배너 POST와 테스트용 GET이 똑같은 길을 타야 "테스트에선 됐는데 배너에선 안 되네"가 안 생긴다.
// 8/22 앱 SSO: 앱은 학교 로그인 화면을 '시스템 인증 브라우저'로 열고, 끝나면 앱 주소로 돌아와야 한다(카카오 로그인 방식).
//   ret= 로 돌아갈 주소를 받되 허용 목록만 — 아무 주소로나 토큰을 흘리면 안 된다.
//   solsup://(정식 앱) · exp:// exps://(Expo Go 개발) · https://semyung.bookstar.co.kr/(웹·앱 링크)
function appReturn(ret: string): string {
  const r = String(ret || "").trim();
  if (!r) return "";
  if (/^(solsup:\/\/|exp:\/\/|exps:\/\/|https:\/\/semyung\.bookstar\.co\.kr\/)/i.test(r) && !/[\s<>"']/.test(r)) return r.slice(0, 400);
  return "";
}
async function issue(hakbun: string, nameIn: string, handoff: PortalHandoff | null, ret = ""): Promise<Response> {
  let name = nameIn;

  // ④ lib 체인으로 liid 확보(실패해도 로그인 자체는 진행 — 개인기능만 비활성)
  let liid = "";
  if (handoff) {
    try {
      const ps = await personalSession(handoff);
      liid = ps.liid;
      if (ps.name) name = ps.name.slice(0, 40); // 도서관 등록명이 더 정확
    } catch (e) { console.error("personalSession fail", String(e)); }
  }

  // ⑤ 서버 세션 저장 — liid·연계값은 여기에만(브라우저엔 sid도 아닌 서명토큰만 나감)
  // 저장이 실패하면 개인기능은 실제로 안 열린다(sid 행이 없으니 liid를 못 꺼냄).
  // 그런데 sso_personal=1로 보내면 앱이 "연결됨"이라 믿는 거짓 상태가 되므로, 저장 성공까지 확인한다.
  const sid = newSid();
  let saved = false;
  try {
    await saveSession({
      sid, hakbun, name,
      liid: liid || null,
      school_no: handoff?.school_no ?? null,
      portal_user_id: handoff?.portal_user_id ?? null,
    });
    saved = true;
  } catch (e) { console.error("saveSession fail", String(e)); }

  // ⑥ 정식 계정 + 앱 신원 세션 핸드오프(8/29). 이게 없으면 웹 앱은 로그인 실패로 처리한다.
  let authHandoff = "";
  try { await ensureAuthUser(hakbun, name); } catch (e) { console.error("ensureAuthUser err", String(e)); }
  try { authHandoff = await issueAuthHandoff(hakbun, name); } catch (e) { console.error("issueAuthHandoff err", String(e)); }
  if (!authHandoff) return errPage("계정 세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);

  // ⑦ 앱으로 리다이렉트 → 앱이 sso_auth 를 세션으로 교환해 로그인 확정 (sso_uid·sso_name 은 표시·앱(솔숲) 호환용, 신원 근거 아님)
  const q = new URLSearchParams({
    sso_uid: hakbun, sso_name: name, sso_dept: "세명대학교",
    sso_token: await signSsoToken(hakbun, name, sid),
    sso_personal: liid && saved ? "1" : "0", // 1=대출현황·연장·예약·개인 전자책 대출 가능
    sso_auth: authHandoff,
  });
  const back = appReturn(ret);
  if (back) return new Response(null, { status: 302, headers: { ...CORS, Location: `${back}${back.includes("?") ? "&" : "?"}${q}` } });
  return new Response(null, { status: 302, headers: { ...CORS, Location: `${APP_URL}?${q}#ourlib` } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── 테스트용 자동 진입 = '배너를 클릭한 것처럼' ────────────────────────────
  // GET ?dev=<SSO_DEV_KEY>&client_userid=<학번>
  //   한 번 포털 로그인을 해 둔 학번이면, 저장된 연계값으로 세션을 다시 만들어 앱으로 돌려보낸다.
  //   → 링크 하나 여는 것만으로 로그인된 상태로 진입. 아이디·비번 다시 안 물어본다.
  // ⚠️ 계약 전 개발 편의 장치. 배너가 설치되면 이 블록째로 지운다.
  //    SSO_DEV_KEY 시크릿이 없으면 완전히 비활성(기본값 없음 — 실수로 열려 있는 일 방지).
  if (req.method === "GET") {
    const u = new URL(req.url);
    const devKey = Deno.env.get("SSO_DEV_KEY") || "";
    const given = u.searchParams.get("dev") || "";
    if (!devKey || given !== devKey) return errPage("잘못된 접근입니다.", 405);
    const hakbun = (u.searchParams.get("client_userid") || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
    if (!hakbun) return errPage("학번이 없습니다.");
    const row = await loadLatestByHakbun(hakbun);
    if (!row?.school_no || !row?.portal_user_id) {
      return errPage("이 학번으로 저장된 연계값이 없습니다. 포털 아이디로 한 번만 로그인해 주세요.", 404);
    }
    return await issue(hakbun, (row.name || hakbun).slice(0, 40), {
      school_no: row.school_no, portal_user_id: row.portal_user_id,
    });
  }

  if (req.method !== "POST") return errPage("잘못된 접근입니다.", 405);

  try {
    const ct = req.headers.get("content-type") || "";
    let g: (k: string) => string;
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const f = await req.formData();
      g = (k) => String(f.get(k) ?? "").trim();
    } else {
      const j = await req.json().catch(() => ({} as Record<string, unknown>));
      g = (k) => String((j as Record<string, unknown>)[k] ?? "").trim();
    }

    // ① 필수값 ② 등록된 학교인지
    const school = g("school"), uid = g("client_userid"), uname = g("client_username");
    if (!school || !uid) return errPage("필수 항목(학교/학번)이 누락되었습니다.");
    if (school !== ALLOWED_SCHOOL) return errPage("등록되지 않은 학교입니다.");
    // 학번 형식 방어(영숫자만, 과도 길이 차단)
    const hakbun = uid.replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
    if (!hakbun) return errPage("학번 형식이 올바르지 않습니다.");
    let name = (uname || hakbun).slice(0, 40);

    // ③ 개인기능 자격 — 배너가 연계값을 주면 그대로, 테스트 폼이면 포털 로그인으로 획득
    let handoff: PortalHandoff | null = null;
    if (g("school_no") && g("portal_user_id")) {
      handoff = { school_no: g("school_no"), portal_user_id: g("portal_user_id") };
    } else if (g("portal_id") && g("portal_pw")) {
      try { handoff = await portalLogin(g("portal_id"), g("portal_pw")); }
      catch (e) { console.error("portalLogin fail", String(e)); }
    } else {
      // 8/22: 배너는 기본 3필드(학교·학번·이름)만 보낸다 → 이 학번이 전에 포털 로그인으로 남긴 연계값이 있으면
      // 그걸로 개인기능을 연다. (GET 테스트 경로엔 있었는데 POST엔 빠져 있어 "이름은 뜨는데 빌린 책이 안 보이는" 상태였음)
      // 8/29 잠금: 이 "학번만으로 로그인" 길은 학교 배너가 비밀키(banner_key)를 함께 보낼 때만 연다.
      //   SSO_BANNER_SECRET 시크릿이 비어 있으면 완전히 닫힘 — 학번만 아는 남이 남으로 로그인하던 구멍.
      //   배너 설치 시 학교와 합의한 키를 시크릿에 넣고, 배너 폼에 <input type=hidden name=banner_key> 로 실어 보낸다.
      const bannerKey = Deno.env.get("SSO_BANNER_SECRET") || "";
      if (!bannerKey || g("banner_key") !== bannerKey) {
        return errPage("학교 인증 정보가 없습니다. 도서관 홈페이지의 로그인 배너 또는 포털 로그인으로 들어와 주세요.", 403);
      }
      try {
        const row = await loadLatestByHakbun(hakbun);
        if (row?.school_no && row?.portal_user_id) {
          handoff = { school_no: row.school_no, portal_user_id: row.portal_user_id };
          if (!uname && row.name) name = row.name.slice(0, 40);
        }
      } catch (e) { console.error("loadLatestByHakbun fail", String(e)); }
    }

    // ④~⑦ 공통 마무리(연계값 → liid → 세션 저장 → 앱으로 302)
    return await issue(hakbun, name, handoff, g("ret"));   // ret=앱 복귀 주소(8/22)
  } catch (e) {
    return errPage("처리 중 오류가 발생했습니다. (" + String(e).slice(0, 120) + ")", 500);
  }
});
