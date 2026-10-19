// 북픽 — 학교 서버(세명대) 통신을 **전부 Vultr 중계서버로** 보내는 fetch 래퍼 (2026-10-19)
//
// 배경: 10/19 실측 — Supabase(AWS 싱가포르) 발신 IP에서 lib.semyung.ac.kr·ebook.semyung.ac.kr(:443) 모두 시간초과.
//   같은 시각 Vultr(158.247.239.108, 학교가 허용한 IP)에서는 0.1초. 즉 학교 쪽이 클라우드 IP를 막은 것.
//   10/16 밤까지는 교보 문장이 돌아왔으니(bookstar_events) 그 뒤에 막혔다. 종이책 대출목록·전자책 대출·반납·연장·뷰어가 전부 조용히 죽는 상황.
//
// 방식: 이 모듈을 import 하면 globalThis.fetch 가 감싸져서, 학교 호스트로 가는 요청은
//   https://<중계>/eb/...  (ebook.semyung.ac.kr)   /lib/... (lib.semyung.ac.kr)   /portal/... (setopia.semyung.ac.kr)
//   로 바뀌고 비밀 헤더 X-Relay-Key 가 붙는다. 중계(Caddy)는 업스트림 Location 도 중계 경로로 고쳐 주므로
//   자동 리다이렉트 추적도 학교로 직행하지 않는다. 쿠키(Set-Cookie/Cookie)는 그대로 지나간다(도메인 속성은 Jar 가 무시).
//   ebook.semyung.ac.kr:446(교보 조회 API)은 kyobo_api.kyoboQuery 가 이미 /api 로 보내므로 여기 대상이 아니다(host 에 포트 포함 → 불일치).
//
// 시크릿(KYOBO_RELAY_URL·KYOBO_RELAY_KEY)이 없으면 아무것도 하지 않는다 — 로컬 실행·다른 프로젝트에 안전.
// 끄기: 시크릿 SCHOOL_RELAY_OFF=1 (학교가 다시 열어 주면 되돌릴 때. 학교와 합의된 IP 가 Vultr 뿐이라 평소엔 켜 둔다)
const RELAY_URL = (Deno.env.get("KYOBO_RELAY_URL") || "").replace(/\/+$/, "");
const RELAY_KEY = Deno.env.get("KYOBO_RELAY_KEY") || "";
const OFF = Deno.env.get("SCHOOL_RELAY_OFF") === "1";
const MAP: Record<string, string> = { "ebook.semyung.ac.kr": "/eb", "lib.semyung.ac.kr": "/lib", "setopia.semyung.ac.kr": "/portal" };

/** 학교 주소면 중계 주소로, 아니면 "" */
export function viaRelay(u: string): string {
  if (OFF || !RELAY_URL || !RELAY_KEY) return "";
  try {
    const x = new URL(u);
    const p = MAP[x.host];   // host 는 포트 포함 → :446 은 제외
    return p ? `${RELAY_URL}${p}${x.pathname}${x.search}` : "";
  } catch { return ""; }
}

type G = typeof globalThis & { __schoolNetWrapped?: boolean };
if (!OFF && RELAY_URL && RELAY_KEY && !(globalThis as G).__schoolNetWrapped) {
  (globalThis as G).__schoolNetWrapped = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request)?.url || "";
    const relayed = viaRelay(url);
    if (!relayed) return orig(input, init);
    const req = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? req?.headers ?? undefined);
    headers.set("X-Relay-Key", RELAY_KEY);
    const base: RequestInit = req ? { method: req.method, body: req.body, redirect: req.redirect, signal: req.signal } : {};
    return orig(relayed, { ...base, ...init, headers });
  }) as typeof fetch;
}
