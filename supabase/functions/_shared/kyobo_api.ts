// 북픽 — 교보문고 전자도서관 **정식 API** 호출 모듈 (2026-09-08, 446 개방 후)
//
// 두 갈래:
//   ① 조회 API(:446, JSON) — 대출내역·예약내역·콘텐츠정보(재고). 학교 방화벽이 우리 Vultr 중계서버 IP만 허용하므로
//      Supabase에서 직접 못 부르고 **중계(Caddy, 비밀 헤더 X-Relay-Key)**를 거친다. 규격: 세명대학교_전자도서관_연동규격서(요청사항).pdf
//   ② 처리 API(frontapi, :443, XML) — 반납·연장·예약취소. 어디서든 직접 호출 가능. barcode+user_id만으로 처리(9/6 교보 확인).
//      규격: 교보문고_전자도서관_연동규격서(세명대).pdf
//
// 원칙
//   - 화면(HTML) 긁기 0. 응답 코드를 그대로 해석하고, 모르는 건 throw → 호출측이 옛 경로로 폴백하거나 정직하게 실패한다.
//   - 시크릿(KYOBO_RELAY_URL·KYOBO_RELAY_KEY)이 없으면 조회 함수는 throw — 폴백이 살아 있어 배포 순서에 안전하다.
//   - 숫자는 문자열로 온다("2") → Number 로 바꿔 준다.
import { EB, Jar, LBRY } from "./semyung_session.ts";

const RELAY_URL = (Deno.env.get("KYOBO_RELAY_URL") || "").replace(/\/+$/, "");
const RELAY_KEY = Deno.env.get("KYOBO_RELAY_KEY") || "";
const TIMEOUT_MS = 12_000;

export interface KyoboRes<T = Record<string, unknown>> { resultCode: string; resultMsg: string; resultData: T }

/** 조회 API 한 번 — 중계 경유. 네트워크·403·비JSON 은 throw. */
export async function kyoboQuery<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<KyoboRes<T>> {
  if (!RELAY_URL || !RELAY_KEY) throw new Error("kyobo relay 미설정(KYOBO_RELAY_URL/KEY)");
  const qs = new URLSearchParams({ ...params, libraryCode: LBRY });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${RELAY_URL}/api/${path}?${qs}`, { headers: { "X-Relay-Key": RELAY_KEY }, signal: ctl.signal });
    if (!r.ok) throw new Error(`kyobo relay http ${r.status}`);
    const j = await r.json();
    if (!j || typeof j.resultCode !== "string") throw new Error("kyobo 응답 형식 아님");
    return j as KyoboRes<T>;
  } finally { clearTimeout(t); }
}

// ── ① 콘텐츠정보(재고) ───────────────────────────────────────────
export interface KyoboStock { loaned: number; total: number; reserved: number; available: boolean; reservable: boolean; btn: string }
/** 재고. 없는 상품(9998)이면 null. 그 외 비정상 코드는 throw(호출측 폴백). ※ 우선예약이면 대출·예약 건수가 1씩 늘어 온다(규격 주석). */
export async function kyoboStock(brcd: string): Promise<KyoboStock | null> {
  const j = await kyoboQuery<{ licCount: string; brwCount: string; revCount: string }>("contentInfo.ink", { barcode: brcd });
  if (j.resultCode === "9998") return null;
  if (j.resultCode !== "0000") throw new Error(`contentInfo ${j.resultCode} ${j.resultMsg}`);
  const total = Number(j.resultData.licCount || 0), loaned = Number(j.resultData.brwCount || 0), reserved = Number(j.resultData.revCount || 0);
  const available = loaned < total;
  return { loaned, total, reserved, available, reservable: !available, btn: available ? "대출" : "예약" };
}

// ── ② 대출내역 ───────────────────────────────────────────────────
// 앱이 쓰던 EbLoan 모양(semyung_session.listEbookLoans)과 같은 키를 유지 + 정식 API가 더 주는 것(출판사·표지·종류·공급사)을 덧붙인다.
export interface KyoboLoan {
  loanSrmb: string;   // 정식 API엔 대출번호가 없다 → "" (반납·연장은 barcode+user_id 로 되므로 불필요. 뷰어 열기만 서버가 그때 찾는다)
  brcd: string; title: string; author: string; publisher: string;
  loanDate: string; dueDate: string; extendable: boolean;
  kind: "ebook" | "audio" | "video"; vendor: "KB" | "YS" | string; cover: string;
}
const KIND: Record<string, KyoboLoan["kind"]> = { "001": "ebook", "002": "audio", "003": "video" };
const s = (v: unknown) => String(v ?? "").trim();
export async function kyoboBorrowList(userId: string): Promise<KyoboLoan[]> {
  const j = await kyoboQuery<{ totCount: string; results: Record<string, string>[] }>("userBorrowList.ink", { user_id: userId });
  if (j.resultCode === "9999") return [];                                // 대출 내역 없음
  if (j.resultCode !== "0000") throw new Error(`userBorrowList ${j.resultCode} ${j.resultMsg}`);
  return (j.resultData.results || []).map((r) => ({
    loanSrmb: "", brcd: s(r.brcd), title: s(r.ctts_hngl_name), author: s(r.sntn_auth_name), publisher: s(r.pbcm_name),
    loanDate: s(r.loan_dttm), dueDate: s(r.rturn_schd_dttm), extendable: s(r.exon_yn) === "Y",
    kind: KIND[s(r.ctts_dvsn_code)] || "ebook", vendor: s(r.ents_dvsn_code), cover: s(r.lrge_imth),
  }));
}

// ── ③ 예약내역 ───────────────────────────────────────────────────
export interface KyoboReserve {
  prenSrmb: string;   // 정식 API엔 예약번호가 없다 → "" (취소는 barcode+user_id)
  brcd: string; title: string; author: string; publisher: string;
  rank: string; reserveDate: string; priority: boolean;   // priority = 우선예약(use_dvsn_code 1)
  kind: KyoboLoan["kind"]; vendor: string; cover: string;
}
export async function kyoboReserveList(userId: string): Promise<KyoboReserve[]> {
  const j = await kyoboQuery<{ totCount: string; results: Record<string, string>[] }>("userReserveList.ink", { user_id: userId });
  if (j.resultCode === "9999") return [];
  if (j.resultCode !== "0000") throw new Error(`userReserveList ${j.resultCode} ${j.resultMsg}`);
  return (j.resultData.results || []).map((r) => ({
    prenSrmb: "", brcd: s(r.brcd), title: s(r.ctts_hngl_name), author: s(r.sntn_auth_name), publisher: s(r.pbcm_name),
    rank: s(r.pren_prrt_rnkn), reserveDate: s(r.pren_dttm), priority: s(r.use_dvsn_code) === "1",
    kind: KIND[s(r.ctts_dvsn_code)] || "ebook", vendor: s(r.ents_dvsn_code), cover: s(r.lrge_imth),
  }));
}

// ── ④ 처리 API(frontapi, XML) — 대출·반납·연장·예약·예약취소·회원등록 ────────────────
// 응답: <channel><result>True|False</result><msgcode>…</msgcode><msg><![CDATA[…]]></msg>[<borrowid>…</borrowid>]</channel>
// 🔑 user_id = **학번 그대로**(암호화·0채움 없음). 교보 9/23 답 + 10/2 실측(20149410 → 0000, 0000020149410 → 9998, 연계폼 암호값 → 9998).
export type FrontName = "contentReturnProc" | "contentExtendProc" | "contentReserveCancelProc" | "contentBorrowProc" | "contentReserveProc" | "memberSync";
export interface FrontRes { ok: boolean; msgcode: string; msg: string; raw: string; borrowId: string }
const tag = (x: string, t: string) => {
  const v = (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(x) || [, ""])[1] || "";
  const c = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(v);
  return (c ? c[1] : v).trim();
};
export async function frontApi(name: FrontName, params: Record<string, string>): Promise<FrontRes> {
  const qs = new URLSearchParams({ libraryCode: LBRY, ...params });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${EB}/frontapi/${name}.xml?${qs}`, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 BookPick/1.0" } });
    const raw = await r.text();
    if (!r.ok) return { ok: false, msgcode: `HTTP_${r.status}`, msg: "", raw, borrowId: "" };
    return { ok: tag(raw, "result") === "True", msgcode: tag(raw, "msgcode"), msg: tag(raw, "msg").replace(/<br\s*\/?>/gi, " "), raw, borrowId: tag(raw, "borrowid") };
  } finally { clearTimeout(t); }
}
/** 교보에 회원이 없다는 응답인가 — 전자도서관에 한 번도 안 들어온 학생(배너 로그인만 한 경우) */
export const isNoMember = (r: FrontRes) => /ERROR_NOT_EXIST_USER_ID|MSG_ERROR_0039/.test(r.msgcode) || /회원이 존재하지/.test(r.msg);
/** 회원 등록(규격 1.6, cmd=I). 이미 있으면 교보가 알아서 처리. 비밀번호는 아이디로 대체(규격). */
export const kyoboMemberSync = (userId: string, name: string) => frontApi("memberSync", { cmd: "I", user_id: userId, user_name: name || userId });

/** 세션 행 → 교보 user_id(학번). liid(도서관 이용자번호, 13자리 0채움 학번 "0000020149410")에서 0을 벗긴다.
 *  배너 로그인은 client_userid(=school_no=학번)를 liid로 0채움 저장하므로 같은 길로 나온다. 둘 다 없으면 "" → 옛 세션 경로. */
export function kyoboIdFromSession(row: { liid?: string | null; hakbun?: string | null } | null): string {
  if (!row) return "";
  const l = String(row.liid || "").split(";")[0].replace(/^0+/, "");
  if (/^\d+$/.test(l)) return l;
  const h = String(row.hakbun || "");
  return /^\d{5,}$/.test(h) ? h : "";
}

/** 뷰어 진입 링크(규격 1.7). PC: viewIf.ink는 스스로 팝업을 또 열어 차단되므로 앱이 선택화면(viewIfChoice)에 폼 POST로 들어간다(8/25·10/2 실측).
 *  폰: mobileViewIf.ink(user_id BASE64 + device). YES24 책도 같은 창구(규격 주석). */
export function kyoboViewerLinks(userId: string, brcd: string, mobile: boolean, ua: string) {
  if (mobile) {
    const device = /ipad/i.test(ua) ? "ipad" : /iphone|ipod/i.test(ua) ? "ios" : "android";
    return { viewerUrl: `${EB}/frontapi/mobileViewIf.ink?libraryCode=${LBRY}&barcode=${encodeURIComponent(brcd)}&user_id=${encodeURIComponent(btoa(userId))}&device=${device}`, viewerPost: null as null | { url: string; fields: Record<string, string> } };
  }
  return {
    viewerUrl: `${EB}/frontapi/viewIf.ink?libraryCode=${LBRY}&user_id=${encodeURIComponent(userId)}&barcode=${encodeURIComponent(brcd)}`,
    viewerPost: { url: `${EB}/frontapi/viewIfChoice.ink`, fields: { libraryCode: LBRY, user_id: userId, barcode: brcd } },
  };
}

/** 선택창(바로보기 / 다운보기)의 '바로보기'를 서버가 대신 눌러 **뷰어 주소를 바로** 만든다 — 교보(KB) 책 전용.
 *
 *  10/15 사장님 신고: 10/2 정식 뷰어(viewIfChoice·mobileViewIf)로 바꾼 뒤 학생 폰에 교보 선택창이 한 번 더 뜬다("전에는 없었는데").
 *  선택창 페이지를 읽어 보니(10/17 실측) '바로보기' = 그 페이지가 심어 둔 값(loanSrmb·mmbrNum 등)으로
 *    폰: licenseCheck → webViewerProc(type=mobile) / PC: sessionAddProc(ifType=I) → webViewerProc(type=web)
 *  을 부르고 popWebviewer.ink 로 가는 것뿐이다. 선택창을 연 쿠키(JSESSIONID)만 있으면 되고 포털·lib 로그인은 필요 없다.
 *  그래서 같은 순서를 서버가 밟아 popWebviewer 주소를 만들어 준다 — 10/2 이전과 똑같이 학생은 바로 책이 열린다.
 *  (만든 주소는 쿠키 없이 열려야 한다 — 10/17 실측 ✔, 두 번 열어도 같은 응답)
 *
 *  규칙: 어디서든 어긋나면 "" 를 돌려 호출측이 선택창 링크를 그대로 준다 — 못 여는 것보다 한 번 더 누르는 게 낫다(8/21 원칙).
 *  ⛔ YES24(YS) 책엔 쓰지 않는다 — 8/24 실측: 선택창을 건너뛰면 콘텐츠 서버가 403. 호출측이 vendor==="KB" 일 때만 부른다.
 *  선택창이 '바로보기'를 안 내주는 책(checkSupplyWebViewerInfo 가 Y/Y 가 아님 = 웹뷰어 미지원)도 "" — 선택창이 알아서 다운보기로 안내한다. */
/*  10/19 추가 — YES24(YS) 책: 교보 선택창의 '바로보기'는 교보 웹뷰어로 가는데 YES24 콘텐츠는 거기서 **DRM 403**(sessionAddProc "라이선스 오류" → Vultr 실측).
 *  즉 10/2 이후 YES24 책은 선택창에서 '바로보기'를 눌러도 안 열렸다. 도서관 PC 화면의 진짜 경로 = popupInfo.xml 이 주는 apiUrl
 *  (`ebook.semyung.ac.kr:8082/api/yes24_ebook_open.asp?user_id=학번&goods_id=바코드` — YES24 자체 선택 화면, 쿠키 없이 열림, 8/21 검증 경로).
 *  선택창 세션(JSESSIONID)으로 popupInfo 를 부르면 포털·lib 로그인 없이도 나온다(10/19 실측). vendor==="YS" 면 그 주소를 돌려준다. */
export async function kyoboDirectViewerUrl(userId: string, brcd: string, mobile: boolean, ua: string, vendor = "KB"): Promise<string> {
  const UA = mobile
    ? (/iphone|ipad|ipod/i.test(ua) ? ua : "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
    : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const jar = new Jar();
  const hit = async (path: string, form?: Record<string, string>, referer?: string): Promise<string> => {
    const headers: Record<string, string> = { "User-Agent": UA };
    const ck = jar.header(); if (ck) headers.Cookie = ck;
    if (referer) headers.Referer = referer;
    if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (path.includes(".xml")) headers["X-Requested-With"] = "XMLHttpRequest";
    // 302 는 수동 추적 — 자동 추적이면 중간 응답의 Set-Cookie(JSESSIONID)가 사라진다(semyung_session.req 와 같은 이유)
    let r = await fetch(`${EB}${path}`, { method: form ? "POST" : "GET", headers, body: form ? new URLSearchParams(form) : undefined, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    jar.absorb(r);
    let body = await r.text();
    for (let i = 0; i < 3 && r.status >= 300 && r.status < 400 && r.headers.get("location"); i++) {
      const next = new URL(r.headers.get("location")!, `${EB}${path}`).toString();
      const h2: Record<string, string> = { "User-Agent": UA }; const ck2 = jar.header(); if (ck2) h2.Cookie = ck2; if (referer) h2.Referer = referer;
      r = await fetch(next, { headers: h2, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      jar.absorb(r);
      body = await r.text();
    }
    if (!r.ok) throw new Error(`${path.split("?")[0]} http ${r.status}`);
    return body;
  };
  const js = (html: string, key: string) => (new RegExp(`${key}\\s*:\\s*"([^"]*)"`).exec(html) || [, ""])[1];
  try {
    // 1) 선택창 열기 — 이 응답의 스크립트에 대출번호 등이 박혀 있고, 쿠키(JSESSIONID)가 뷰어 세션이 된다
    const chooserPath = mobile
      ? `/frontapi/mobileViewIf.ink?libraryCode=${LBRY}&barcode=${encodeURIComponent(brcd)}&user_id=${encodeURIComponent(btoa(userId))}&device=${/ipad/i.test(ua) ? "ipad" : /iphone|ipod/i.test(ua) ? "ios" : "android"}`
      : `/frontapi/viewIfChoice.ink`;
    const html = mobile ? await hit(chooserPath) : await hit(chooserPath, { libraryCode: LBRY, user_id: userId, barcode: brcd });
    const loanSrmb = js(html, "loanSrmb");
    if (!/^\d+$/.test(loanSrmb)) { console.error("directViewer: 선택창에 대출번호 없음", brcd, html.replace(/\s+/g, " ").slice(0, 160)); return ""; }
    const epdeBrcd = js(html, "epdeBrcd"), cttsDvsnCode = js(html, "cttsDvsnCode") || "001", fileDvsnCode = js(html, "fileDvsnCode"), mmbrNum = js(html, "mmbrNum");
    const referer = `${EB}${chooserPath.split("?")[0]}`;
    if (vendor === "YS") {
      // YES24: 도서관이 주는 타사 연동 주소(YES24 선택 화면)가 곧 입구. 교보 웹뷰어 토큰을 만들면 안 된다(DRM 403)
      const pi = await hit(`/process/popupInfo.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&ifType=W`, undefined, referer);
      const apiUrl = tag(pi, "apiUrl");
      if (!(tag(pi, "result") === "True" && /^https?:\/\//.test(apiUrl))) {
        console.error("directViewer(YS): popupInfo apiUrl 없음", brcd, tag(pi, "result"), tag(pi, "msgcode"), tag(pi, "msg").slice(0, 80));
        return "";
      }
      // ⛔ 10/20 되돌림 — YES24 선택 화면 건너뛰기(goViewer 주소 미리 계산)는 **세 번째로 실패**했다(8/24 · 10/19 저녁 · 10/20 학교 신고 403 "동일 도서 1개 창").
      //   10/19 저녁의 "3/3 성공"은 curl 이 301까지만 보고 멈춘 오판 — 실제 /ePubViewer 페이지가 403을 낸다(10/20 크로미움 실측: 첫 창·새 브라우저·창 닫은 뒤 전부 403).
      //   선택 화면에서 사람이 '바로보기'를 눌러야만 열리는 구조(window.open 출처 검사로 추정). 서버·브라우저 어느 쪽에서도 흉내 낼 수 없다.
      //   ⛔ 다시 시도하지 말 것. YES24 책은 선택 화면(apiUrl)까지만 안내한다 — 거기서 '바로보기' 한 번은 공급사 절차.
      return apiUrl;
    }
    // 2) 선택창과 같은 판정 — 웹뷰어(바로보기) 지원 책인가
    const sup = await hit(`/process/checkSupplyWebViewerInfo.xml?lbryCode=${LBRY}&brcd=${encodeURIComponent(brcd)}`, undefined, referer);
    if (!(tag(sup, "result") === "True" && tag(sup, "webViewrUsno") === "Y" && tag(sup, "webViewrYsno") === "Y" && tag(sup, "cttsLyot") !== "F")) {
      console.error("directViewer: 웹뷰어 미지원 책 → 선택창", brcd, tag(sup, "result"), tag(sup, "webViewrUsno"), tag(sup, "webViewrYsno"), tag(sup, "cttsLyot")); return "";
    }
    // 3) 라이선스 — 폰: licenseCheck / PC: sessionAddProc(ifType=I). 결과 <result>는 반드시 본다(8/21 규칙 ①)
    const lic = mobile
      ? await hit("/process/licenseCheck.xml", { lbryCode: LBRY, brcd, epdeBrcd }, referer)
      : await hit("/process/sessionAddProc.xml", { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd, cttsDvsnCode, fileDvsnCode, mmbrNum, ifType: "I" }, referer);
    if (tag(lic, "result") !== "True") { console.error("directViewer: 라이선스 False", brcd, tag(lic, "msgcode"), tag(lic, "msg").slice(0, 80)); return ""; }
    // 4) 뷰어 토큰 → popWebviewer 주소(도서관 JS와 동일: token의 '/'→'-')
    const wx = await hit(`/process/webViewerProc.xml?${new URLSearchParams({ lbryCode: LBRY, loanSrmb, brcd, epdeBrcd, type: mobile ? "mobile" : "web" })}`, undefined, referer);
    if (tag(wx, "result") !== "True") { console.error("directViewer: webViewerProc False", brcd, tag(wx, "msgcode"), tag(wx, "msg").slice(0, 80)); return ""; }
    const wvUrl = tag(wx, "webViewrUrl"), token = tag(wx, "token").replace(/\//g, "-"), title = tag(wx, "title");
    if (!wvUrl || !token) { console.error("directViewer: 토큰 비어 있음", brcd); return ""; }
    return `${EB}/popup/popWebviewer.ink?webViewrUrl=${wvUrl}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(token)}`;
  } catch (e) { console.error("directViewer err", brcd, String(e).slice(0, 120)); return ""; }
}
/** 도서관 문장이 비어 있을 때 쓸 우리말 — 규격서 에러코드 정의표(52종) 중 학생이 만날 만한 것만 */
export const KYOBO_MSG: Record<string, string> = {
  MSG_ERROR_0013: "예약 대기 중인 학생이 있어 연장할 수 없어요",
  MSG_ERROR_0015: "연장 횟수를 다 썼어요",
  MSG_ERROR_0023: "이미 반납된 책이에요",
  MSG_ERROR_0024: "이미 반납된 책이라 연장할 수 없어요",
  MSG_ERROR_0026: "이미 취소된 예약이에요",
  MSG_ERROR_0029: "이미 자동 반납됐어요",
  MSG_ERROR_0030: "이미 자동으로 예약이 취소됐어요",
  MSG_ERROR_0038: "대출 정보가 없어요",
  MSG_ERROR_0039: "도서관 회원 정보를 찾지 못했어요",
  MSG_ERROR_0042: "이미 예약이 취소됐어요",
  ERROR_NOT_EXIST_BORROW_ID: "대출 정보가 없어요",
  ERROR_NOT_EXIST_RESERVE_ID: "예약 정보가 없어요",
  ERROR_NOT_EXIST_USER_ID: "도서관 회원 정보를 찾지 못했어요",
};
export const frontMsg = (r: FrontRes, fallback: string) => r.msg || KYOBO_MSG[r.msgcode] || (r.msgcode ? `${fallback} (${r.msgcode})` : fallback);
