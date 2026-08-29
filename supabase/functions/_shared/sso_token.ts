// 북스타 SSO 세션토큰 — HMAC-SHA256 서명 (발급=sso-login, 검증=개인기능 Edge Fn 공용)
// 형식: base64url(JSON{h:학번, n:이름, e:만료epoch초}) + "." + base64url(HMAC서명)
// 목적: 개인기능(대출조회·연장·예약·전자책)이 클라이언트가 보낸 평문 학번을 절대 신뢰하지 않게.
//   토큰 없이는 위조 불가 — 시크릿(SSO_TOKEN_SECRET)은 서버(Edge Fn)에만 존재.
// ⚠️ 입구(sso-login에 오는 배너 POST) 위조 방어는 별개 — 퓨처누리 HMAC 배너 서명(보강②)으로 해결 예정.

const te = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SSO_TOKEN_SECRET") || "";
  if (!secret) throw new Error("SSO_TOKEN_SECRET 미설정");
  return crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface SsoSession {
  hakbun: string;
  name: string;
  sid: string; // sso_sessions 행 핸들(랜덤). liid·포털 연계값은 이 행에만 있고 브라우저엔 안 나감
  exp: number; // epoch초
}

// 발급 — ttlSec 기본 7일 (배너 재클릭으로 자동 갱신되므로 짧게 유지)
export async function signSsoToken(hakbun: string, name: string, sid = "", ttlSec = 7 * 24 * 3600): Promise<string> {
  const payload = te.encode(JSON.stringify({ h: hakbun, n: name, s: sid, e: Math.floor(Date.now() / 1000) + ttlSec }));
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return `${b64url(payload)}.${b64url(sig)}`;
}

// 검증 — 실패(형식/서명/만료)는 전부 null. 예외 안 던짐(호출부 단순화).
export async function verifySsoToken(token: string): Promise<SsoSession | null> {
  try {
    const [p, s] = (token || "").split(".");
    if (!p || !s) return null;
    const payload = b64urlDecode(p);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(s), payload);
    if (!ok) return null;
    const j = JSON.parse(new TextDecoder().decode(payload));
    if (!j.h || typeof j.e !== "number") return null;
    if (j.e < Math.floor(Date.now() / 1000)) return null; // 만료
    return { hakbun: String(j.h), name: String(j.n || ""), sid: String(j.s || ""), exp: j.e };
  } catch {
    return null;
  }
}

// 요청에서 토큰 꺼내기(Authorization: Bearer / ?sso_token= / body.sso_token 순)
export async function sessionFromRequest(req: Request, bodyToken?: string): Promise<SsoSession | null> {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const url = new URL(req.url);
  // 8/29: Authorization 에 게이트웨이용 anon JWT 가 실려 오는 함수(evaluate 등)는 헤더 토큰이 실패하면 쿼리·본문 토큰을 이어서 본다
  for (const tok of [m && m[1], url.searchParams.get("sso_token"), bodyToken]) {
    if (!tok) continue;
    const s = await verifySsoToken(tok);
    if (s) return s;
  }
  return null;
}
