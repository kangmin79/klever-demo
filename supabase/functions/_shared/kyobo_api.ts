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
import { EB, LBRY } from "./semyung_session.ts";

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

// ── ④ 처리 API(frontapi, XML) — 반납·연장·예약취소 ────────────────
// 응답: <channel><result>True|False</result><msgcode>…</msgcode><msg><![CDATA[…]]></msg></channel>
export interface FrontRes { ok: boolean; msgcode: string; msg: string; raw: string }
const tag = (x: string, t: string) => {
  const v = (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(x) || [, ""])[1] || "";
  const c = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(v);
  return (c ? c[1] : v).trim();
};
export async function frontApi(name: "contentReturnProc" | "contentExtendProc" | "contentReserveCancelProc", params: Record<string, string>): Promise<FrontRes> {
  const qs = new URLSearchParams({ libraryCode: LBRY, ...params });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${EB}/frontapi/${name}.xml?${qs}`, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 BookPick/1.0" } });
    const raw = await r.text();
    if (!r.ok) return { ok: false, msgcode: `HTTP_${r.status}`, msg: "", raw };
    return { ok: tag(raw, "result") === "True", msgcode: tag(raw, "msgcode"), msg: tag(raw, "msg").replace(/<br\s*\/?>/gi, " "), raw };
  } finally { clearTimeout(t); }
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
