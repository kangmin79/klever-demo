// 북스타 — 세명대 전자도서관 구매 전자책 "대출/반납" 라이브 대행
//
// 🎉 8/8 개편: **학생 개인세션** 방식 도입. 포털 연계값(school_no·portal_user_id)이 있으면
//    lib → /relation/eBook → mmbrLnkg 체인으로 학생 본인 전자도서관 세션을 만들어 대출한다.
//    mmbrLnkg가 미리가입 없이 자동 회원연계까지 해주므로 교보 회원등록 API가 필요 없다.
//    → 각자 5권 한도·각자 대출현황. 공유계정의 "남의 대출 자동반납" 리스크 소멸.
//
// 🔒 8/9 개편: **공유계정 폴백 폐지**. 연계값이 없는 이용자(=도서관 계정 미연결)는
//    대출·반납·연장·예약·대출현황 전부 거부(409 needsPersonal)하고 로그인 안내를 받는다.
//    이유: 폴백은 관장님 계정 한 칸을 익명 방문자가 쓰는 구조라 ①관장님 실명으로 대출기록이 남고
//    ②5칸이 차면 "가장 오래된 1권 강제 반납"이 돌아 남이 읽던 책이 끊겼다.
//    공개는 재고(stock) 하나뿐 — "지금 빌릴 수 있나"는 로그인 없이도 보여야 하므로.
//
// GET ?action=borrow&brcd=…   → 대출 (loanSrmb·viewerUrl 반환)
//     ?action=return&brcd=…&loanSrmb=… → 반납
//     ?action=extend&loanSrmb=…   → 대출 연장
//     ?action=reserve&brcd=…      → 예약 (전권 대출중일 때)
//     ?action=cancelReserve&brcd=… → 예약 취소
//     ?action=status              → 현재 대출 현황
//     ?action=stock&brcd=…        → 재고(대출중/보유/예약자수) — 공개, 인증 불필요
//     ?action=returnAll&key=…     → (관리자 전용) 공유계정에 남은 대출 전부 반납
// 인증: Authorization: Bearer <sso_token> 필수. 없으면 stock 외 전부 409.
import { sessionFromRequest } from "../_shared/sso_token.ts";
import { loadSession } from "../_shared/sso_store.ts";
import { EB, LBRY, Jar, ebGet, ebPost, ebookSession, fetchEbookHandoff, libLoginByPortal, listEbookLoans, xmlTag } from "../_shared/semyung_session.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// ── 공유계정(폴백) 전용: 전자도서관 AES 로그인 (aes.js의 mysqlAES 재현) ──
// AES-128-ECB, key="freedom"+널(16B), PKCS7, 대문자 hex
async function aesHex(plain: string): Promise<string> {
  const keyBytes = new Uint8Array(16); // "freedom" + 9 null
  const ks = "freedom";
  for (let i = 0; i < ks.length; i++) keyBytes[i] = ks.charCodeAt(i);
  const data = new TextEncoder().encode(plain); // 우리 id/pw는 ASCII
  const z = Math.floor(data.length / 16);
  const n = 16 * (z + 1) - data.length; // PKCS7 (블록정렬이면 16블록 추가)
  const padded = new Uint8Array(data.length + n);
  padded.set(data);
  padded.fill(n, data.length);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const iv0 = new Uint8Array(16);
  const out = new Uint8Array(padded.length);
  for (let off = 0; off < padded.length; off += 16) {
    // ECB(block) = AES-CBC(block, IV=0)의 첫 16바이트
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv0 }, key, padded.slice(off, off + 16)));
    out.set(enc.slice(0, 16), off);
  }
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function sharedAccountSession(): Promise<Jar> {
  const id = Deno.env.get("SEMYUNG_LIB_ID") || "";
  const pw = Deno.env.get("SEMYUNG_LIB_PW") || "";
  if (!id || !pw) throw new Error("계정 미설정");
  const jar = new Jar();
  const r = await fetch(`${EB}/member/loginProcess.json`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Referer: `${EB}/member/memberLogin.ink` },
    body: new URLSearchParams({ mmbrId: await aesHex(id), pwd: await aesHex(pw), idSave: "false", autoLogin: "false" }),
    redirect: "manual",
  });
  jar.absorb(r);
  const txt = await r.text();
  if (!jar.has("JSESSIONID") || !/"rtnCode"\s*:\s*"T"/.test(txt)) throw new Error("전자도서관 로그인 실패");
  return jar;
}

// 대출 1회 시도
async function doBorrow(jar: Jar, brcd: string) {
  const xml = await ebPost(jar, "/process/contentBorrowProc.xml", { lbryCode: LBRY, brcd, epdeBrcd: "", dvsnCode: "W" });
  return {
    ok: xmlTag(xml, "result") === "True",
    loanSrmb: xmlTag(xml, "loanSrmb"),
    ents: xmlTag(xml, "entsDvsnCode"),
    msg: (xmlTag(xml, "msg") || "대출 실패").replace(/<br\s*\/?>/gi, " "),
  };
}
// 현재 대출 목록 — 파서는 _shared/semyung_session.ts에 공용으로 있다(알림 배치와 동일 코드 사용)
const listLoans = listEbookLoans;

// 내가 예약한 전자책 — 취소 버튼(gFnContentReserveCancelProc)에서 예약번호를 뽑는다.
// 대출목록과 같은 구조: 취소 버튼이 항목 끝에 오고 그 앞 구간에 서지·순번이 있다.
interface EbReserve { prenSrmb: string; brcd: string; title: string; rank: string }
async function listReserves(jar: Jar): Promise<EbReserve[]> {
  const html = await ebGet(jar, "/myLib/myReserveList.ink");
  const out: EbReserve[] = [];
  const re = /gFnContentReserveCancelProc\('([^']*)','(\d+)'\s*,\s*'([^']*)'/g;
  let m: RegExpExecArray | null, prev = 0;
  while ((m = re.exec(html))) {
    const raw = html.slice(prev, m.index);
    prev = m.index + m[0].length;
    out.push({
      prenSrmb: m[2], title: m[3],
      brcd: (/fnContentClick\([^)]*?'(\d{6,13})'/.exec(raw) || [, ""])[1] || "",
      rank: (/(\d+)\s*번/.exec(raw.replace(/<[^>]+>/g, " ")) || [, ""])[1] || "",
    });
  }
  return out;
}

// 뷰어 URL 발급 — 도서관 '보기' 버튼(process.js gFnEBookFileChoicePopup)과 **같은 순서**로 간다.
//
// 🚨 8/21 사고: 세명대 전자책은 교보문고·YES24 두 공급사인데(실측 55:45) 예전 코드는 popupInfo를 건너뛰고
//    무조건 교보 뷰어 URL을 만들었다 → YES24 책은 대출은 되는데 열면 "DRM 인증 처리에 문제(403)".
//    게다가 sessionAddProc가 <result>False</result> "라이선스 오류"를 돌려줘도 읽지 않고 통과시켜
//    깨진 URL을 '성공'으로 앱에 넘겼다. 절반의 책이 조용히 안 열리고 있었다.
//
// 규칙(재발 방지):
//   ① 도서관 XML의 <result>는 빠짐없이 검사한다. False면 도서관이 준 <msg>를 그대로 올린다 — 우리가 지어내지 않는다.
//   ② 파라미터는 추측하지 않는다. popupInfo.xml이 주는 값(barcode·seqBarcode·userId·productCD·useCondition·comCode)을 쓴다.
//   ③ 실패는 {url:""} + error로 돌려 호출부가 학생에게 이유를 말하게 한다. 빈 문자열만 돌려주고 끝내지 않는다.
// YES24: 도서관이 주는 apiUrl은 '바로보기 / 뷰어보기'를 고르라는 **선택 화면**이다.
//   학생 입장에선 읽기까지 한 번 더 누르는 마찰이라(원칙: 찾고→읽기 마찰 < 밀리), 그 화면의 '바로보기'가
//   만들어 내는 주소를 서버가 미리 계산해서 바로 건넨다. 계산식은 도서관 webview.js의 goViewer()와 글자 그대로 동일:
//     url = 도메인 + code + "/" + subcode + "/" + encodeURIComponent(암호문.replace(/\//g,"-"))
//   ⚠️ 암호문은 발급 때마다 꼬리가 달라진다(8/21 재실측 — 앞부분만 같음). 그래서 저장해 두고 재사용하면 안 되고,
//     지금처럼 열 때마다 선택 화면을 새로 읽어 그 자리에서 뽑는다. 세션 쿠키는 안 쓰므로(연결 자체가 무쿠키) 발급자·사용자 IP가 달라도 된다.
//   파싱이 어긋나면 빈 값을 돌려 호출부가 선택 화면 주소를 그대로 쓰게 한다 — 못 여는 것보다 한 번 더 누르는 게 낫다.
//   📌 8/21 아침 실측: b2bwv.yes24.com(웹리더)·www.yes24.com이 SK망(SKT LTE·SKB)에서 통째로 시간초과 — YES24측/구간 장애.
//     같은 시각 교보·네이버·yes24 CDN은 정상, AWS에서는 b2bwv도 정상. 이런 증상이 또 오면 우리 코드가 아니라 회선↔공급사부터 의심할 것.
async function yes24DirectUrl(apiUrl: string): Promise<string> {
  try {
    const r = await fetch(apiUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    const html = new TextDecoder("euc-kr").decode(await r.arrayBuffer());
    const m = /goViewer\('([^']+)','([^']+)','([^']+)','([^']+)'\)/.exec(html);
    if (!m) return "";
    return m[1] + m[2] + "/" + m[3] + "/" + encodeURIComponent(m[4].split("/").join("-"));
  } catch (_) { return ""; }
}

interface ViewerRes { url: string; vendor: "external" | "kyobo" | ""; error?: string }
// mobile=true(솔숲 앱 등 폰): 도서관 모바일 사이트(mobileProcess.js)와 같은 순서 — licenseCheck + type=mobile.
//   type=web 토큰을 폰에서 열면 PC용 뷰어가 나와 레이아웃이 깨진다(8/21 실기기 비교: 도서관 모바일=정돈된 폰 뷰어 vs 우리=깨짐).
async function viewerUrlFor(jar: Jar, loanSrmb: string, brcdHint: string, mobile = false): Promise<ViewerRes> {
  // 1) popupInfo — 공급사 분기 + 교보용 정확한 값. 도서관 버튼이 제일 먼저 부르는 것
  const pi = await ebGet(jar, `/process/popupInfo.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&ifType=W`);
  if (xmlTag(pi, "result") !== "True") {
    return { url: "", vendor: "", error: xmlTag(pi, "msgcode") || "도서관이 열람 정보를 주지 않았어요" };
  }
  // 2) 외부 공급사(YES24 등): 도서관이 준 주소가 곧 뷰어 진입점. 교보 토큰을 만들면 안 된다.
  //    PC는 선택 화면을 건너뛰고 '바로보기'로 직행 — 실패하면 선택 화면이라도 준다.
  //    ⚠️ 폰(mobile)은 직행시키지 않는다(8/21 저녁 실기기): 우리가 미리 계산하는 주소는 /Gun/(PC 리더) 고정인데
  //      YES24에는 /GunMobile/(폰 리더)이 따로 있고, 어느 쪽으로 보낼지는 **선택 화면 자신이** 판단한다
  //      (그 페이지에 iPadOS·모바일 감지 스크립트가 들어 있다 — location.pathname.indexOf("/GunMobile/") 분기).
  //      직행시키면 그 판단을 통째로 건너뛰어 폰에 PC 리더가 나가고 "정상적인 접근이 아니므로" 404가 뜬다.
  //      도서관 모바일 사이트가 apiUrl을 그대로 넘기는 이유가 이것 — 마찰(한 번 더 누르기)보다 열리는 게 먼저다.
  const apiUrl = xmlTag(pi, "apiUrl");
  if (apiUrl) return { url: mobile ? apiUrl : ((await yes24DirectUrl(apiUrl)) || apiUrl), vendor: "external" };

  // 3) 교보: 라이선스(웹세션) 등록 → 결과 반드시 확인.
  //    ⚠️ 파라미터 조합은 '기존 방식(빈값)'을 먼저 쓴다 — 8/21 이전에 교보 책이 열리던 경로를 절대 바꾸지 않기 위함(회귀 방지).
  //    빈값이 False면 그때만 popupInfo가 준 값으로 재시도한다. 둘 다 False면 도서관 메시지를 그대로 올린다.
  const brcd = xmlTag(pi, "barcode") || brcdHint;
  const epdeBrcd = xmlTag(pi, "seqBarcode");
  if (mobile) {
    // 모바일 공식 순서(mobileProcess.js gFnWebViewerProc): licenseCheck → webViewerProc?type=mobile
    const lc = await ebPost(jar, "/process/licenseCheck.xml", { lbryCode: LBRY, brcd, epdeBrcd });
    if (xmlTag(lc, "result") !== "True") {
      return { url: "", vendor: "kyobo", error: xmlTag(lc, "msg").replace(/<br\s*\/?>/gi, " ") || "라이선스 확인에 실패했어요" };
    }
  } else {
    const legacy = { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "", cttsDvsnCode: "001", fileDvsnCode: "", mmbrNum: "", ifType: "W" };
    let sa = await ebPost(jar, "/process/sessionAddProc.xml", legacy);
    if (xmlTag(sa, "result") !== "True") {
      const full = { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd, cttsDvsnCode: xmlTag(pi, "productCD") || "001", fileDvsnCode: xmlTag(pi, "useCondition"), mmbrNum: xmlTag(pi, "userId"), ifType: "W" };
      sa = await ebPost(jar, "/process/sessionAddProc.xml", full);
      if (xmlTag(sa, "result") !== "True") {
        return { url: "", vendor: "kyobo", error: xmlTag(sa, "msg").replace(/<br\s*\/?>/gi, " ") || "라이선스 등록에 실패했어요" };
      }
    }
  }
  // 4) 웹뷰어 토큰 (모바일이면 type=mobile — 교보가 폰용 뷰어를 내준다)
  const wx = await ebGet(jar, `/process/webViewerProc.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&brcd=${brcd}&epdeBrcd=${mobile ? encodeURIComponent(epdeBrcd) : ""}&type=${mobile ? "mobile" : "web"}`);
  if (xmlTag(wx, "result") !== "True") {
    return { url: "", vendor: "kyobo", error: xmlTag(wx, "msg") || "뷰어 토큰을 받지 못했어요" };
  }
  const wvUrl = xmlTag(wx, "webViewrUrl");
  const token = xmlTag(wx, "token").replace(/\//g, "-"); // 도서관 JS와 동일: '/'→'-'
  const title = xmlTag(wx, "title");
  return { url: `${EB}/popup/popWebviewer.ink?webViewrUrl=${wvUrl}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(token)}`, vendor: "kyobo" };
}

// 전자책 재고 — 상세페이지가 `[ 대출 : 0/1 예약 : 0 ]`으로 노출한다(로그인 불필요).
// 교보가 "별도 개발"이라던 재고 API 대신 쓰는 경로. ⚠️ 정식 API가 아니라 화면 파싱이므로
// 페이지 개편 시 깨질 수 있다 — 못 읽으면 null을 돌려주고 앱은 재고 표시를 생략한다.
async function fetchStock(brcd: string) {
  const r = await fetch(`${EB}/content/contentView.ink?lbryCode=${LBRY}&brcd=${brcd}`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const html = await r.text();
  const m = /대출\s*:\s*(\d+)\s*\/\s*(\d+)[\s\S]{0,120}?예약\s*:\s*(\d+)/.exec(html.replace(/<[^>]+>/g, " "));
  if (!m) return null;
  const loaned = +m[1], total = +m[2], reserved = +m[3];
  // 버튼이 도서관의 최종 판정 — 빌릴 수 있으면 brwBtn("대출"), 전권 나갔으면 reveBtn("예약")이 뜬다.
  // (둘은 서로 배타적으로 렌더되므로 어느 쪽이 있는지가 곧 대출 가능 여부다)
  const btn = (/name="(?:brwBtn|reveBtn)"[^>]*value="([^"]*)"/.exec(html) || [, ""])[1].trim();
  return {
    loaned, total, reserved,
    available: btn ? btn.includes("대출") : loaned < total,
    reservable: btn === "예약",
    btn,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "borrow";
    const brcd = (url.searchParams.get("brcd") || "").replace(/[^0-9A-Za-z]/g, "");

    // 재고는 공개 정보 — 로그인·세션 없이 바로 응답(게스트도 "지금 빌릴 수 있나"를 본다)
    if (action === "stock") {
      if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
      const st = await fetchStock(brcd);
      return json(st ? { ok: true, action, ...st } : { ok: false, action, error: "재고를 읽지 못했어요" });
    }

    // 관리자 전용 — 폴백 시절 공유계정에 남은 대출을 비우는 청소용. 키는 서버 시크릿과 대조한다.
    // (예전엔 누구나 부를 수 있어 관장님 대출을 통째로 반납시킬 수 있었다)
    if (action === "returnAll") {
      const admin = Deno.env.get("SEMYUNG_ADMIN_KEY") || "";
      if (!admin || url.searchParams.get("key") !== admin) return json({ ok: false, action, error: "권한이 없습니다" }, 403);
      const shared = await sharedAccountSession();
      const items: unknown[] = [];
      for (const l of await listLoans(shared)) {
        const xml = await ebPost(shared, "/process/contentReturnProc.xml", { lbryCode: LBRY, loanSrmb: l.loanSrmb });
        items.push({ loanSrmb: l.loanSrmb, title: l.title, ok: xmlTag(xml, "result") === "True" });
      }
      return json({ ok: true, action, returned: items.filter((i) => (i as { ok: boolean }).ok).length, items });
    }

    // 개인세션 — SSO 토큰의 sid로 저장된 포털 연계값을 꺼내 학생 본인 세션을 만든다.
    // 여기서 못 만들면 그대로 막는다. 공유계정으로 대신 처리하지 않는다(위 헤더 주석 참고).
    let jar: Jar | null = null;
    const ses = await sessionFromRequest(req);
    if (ses) {
      const row = await loadSession(ses.sid);
      if (row?.school_no && row?.portal_user_id) {
        try {
          const lib = await libLoginByPortal({ school_no: row.school_no, portal_user_id: row.portal_user_id });
          jar = await ebookSession(await fetchEbookHandoff(lib));
        } catch (e) { console.error("personal ebook session fail", String(e)); }
      }
    }
    if (!jar) {
      return json({
        ok: false, action, personal: false, needsPersonal: true,
        error: "도서관 계정 연결이 필요해요",
      }, 409);
    }
    const personal = true;

    if (action === "status") {
      const body = await ebGet(jar, "/main/userBorrowStatus.json");
      return json({ ok: true, action, personal, status: JSON.parse(body || "{}") });
    }

    // 내가 빌린 전자책 — 우리 도서관 화면이 종이책과 함께 한 줄로 보여주기 위한 목록
    if (action === "myLoans") {
      return json({ ok: true, action, personal, items: await listLoans(jar) });
    }

    // 이미 빌린 책 다시 열기 — 도서관 사이트의 '바로보기'에 해당.
    // 대출 때 받은 viewerUrl은 그 순간의 세션에 묶여 있어 재사용이 안 된다. 그래서 매번 새로 만든다.
    // ⚠️ 이게 없으면 탭을 한 번 닫는 순간 북스타 안에서 그 책을 다시 열 길이 사라진다(5일 대출인데).
    if (action === "viewer") {
      const loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb) return json({ ok: false, action, error: "loanSrmb 필요" }, 400);
      // 내 대출 목록에 있는 책만 연다 — 남의 대출번호를 넣어 여는 걸 막고,
      // 이미 반납·만료된 책은 "왜 안 열리지" 대신 이유를 말해 준다.
      const mine = (await listLoans(jar)).find((l) => l.loanSrmb === loanSrmb);
      if (!mine) {
        return json({ ok: false, action, personal, message: "대출 목록에 없는 책이에요 — 기간이 끝났거나 이미 반납됐어요" });
      }
      const v = await viewerUrlFor(jar, loanSrmb, mine.brcd || brcd, (url.searchParams.get("device") || "") === "m");
      if (!v.url) {
        console.error("viewer fail", loanSrmb, v.vendor, v.error);
        return json({ ok: false, action, personal, vendor: v.vendor, message: `뷰어를 열지 못했어요 — ${v.error || "잠시 후 다시 시도해 주세요"}` });
      }
      return json({ ok: true, action, personal, loanSrmb, viewerUrl: v.url, vendor: v.vendor, dueDate: mine.dueDate || "" });
    }

    // 반납은 loanSrmb만으로 성립 — brcd 요구는 borrow에만.
    // (구버전은 return에도 brcd를 요구해 앱의 반납 버튼이 400으로 실패하고 있었음)
    if (action === "borrow" && !brcd) return json({ ok: false, error: "brcd 필요" }, 400);

    if (action === "borrow") {
      // 한도(5권) 초과여도 자동반납은 하지 않는다 — 본인 책이므로 안내만 하고 직접 고르게 한다.
      // (공유계정 시절의 "가장 오래된 1권 강제 반납"은 남이 읽던 책을 끊어서 8/9에 폐지)
      const res = await doBorrow(jar, brcd);
      if (!res.ok) return json({ ok: false, action, personal, message: res.msg });
      // 뷰어URL 실패해도 대출은 유효 — 다만 왜 못 열었는지는 viewerError로 같이 보내 앱이 말하게 한다(8/21: 조용한 실패 금지)
      let viewerUrl = "", vendor = "", viewerError = "";
      try { const v = await viewerUrlFor(jar, res.loanSrmb, brcd, (url.searchParams.get("device") || "") === "m"); viewerUrl = v.url; vendor = v.vendor; viewerError = v.error || ""; }
      catch (e) { viewerError = "뷰어 발급 중 오류: " + String(e).slice(0, 80); }
      if (!viewerUrl) console.error("borrow ok but viewer fail", res.loanSrmb, vendor, viewerError);
      // 반납예정일은 도서관이 정한 값을 그대로 읽어 온다.
      // ⚠️ 예전엔 "대출기간 14일"이라고 박아 뒀는데 **실측 5일**이었다(8/9: 8/9 대출 → 8/14 반납예정).
      //    기간은 도서관 정책이라 우리가 알 수 없다 — 숫자를 짐작하지 말고 실제 날짜를 보여준다.
      let dueDate = "";
      try { dueDate = (await listLoans(jar)).find((l) => l.loanSrmb === res.loanSrmb)?.dueDate || ""; }
      catch (_) { /* 못 읽으면 날짜 없이 안내 */ }
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
      return json({
        ok: true, action, personal, loanSrmb: res.loanSrmb, entsDvsnCode: res.ents, viewerUrl, vendor, viewerError, dueDate,
        message: dm
          ? `대출 완료 — ${+dm[2]}월 ${+dm[3]}일까지 읽을 수 있어요`
          : "대출 완료 — 읽고 나면 반납해 주세요",
      });
    }

    if (action === "return" || action === "extend") {
      const loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb) return json({ ok: false, action, error: "loanSrmb 필요" }, 400);
      const path = action === "return" ? "/process/contentReturnProc.xml" : "/process/contentExtendProc.xml";
      const xml = await ebPost(jar, path, { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "" });
      return json({
        ok: xmlTag(xml, "result") === "True", action, personal, loanSrmb,
        message: (xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " "),
      });
    }

    // 내가 예약한 전자책 — 취소에 필요한 예약번호(prenSrmb)가 여기서만 나온다
    if (action === "myReserves") {
      return json({ ok: true, action, personal, items: await listReserves(jar) });
    }

    // 전권 대출중인 전자책 예약 — 반납되면 순번대로 (여기까지 온 요청은 이미 개인세션)
    if (action === "reserve" || action === "cancelReserve") {
      let xml: string;
      if (action === "reserve") {
        if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
        // ⚠️ dvsnCode:"W"(웹) 필수 — 빼면 조용히 실패한다(도서관 스크립트 실측)
        xml = await ebPost(jar, "/process/contentReserveProc.xml", { lbryCode: LBRY, brcd, epdeBrcd: "", dvsnCode: "W" });
      } else {
        // 취소는 바코드가 아니라 예약번호로 한다. 안 주면 이 책의 예약을 목록에서 찾아 쓴다.
        let prenSrmb = (url.searchParams.get("prenSrmb") || "").replace(/[^0-9]/g, "");
        if (!prenSrmb) {
          const mine = (await listReserves(jar)).find((x) => !brcd || x.brcd === brcd);
          prenSrmb = mine?.prenSrmb || "";
        }
        if (!prenSrmb) return json({ ok: false, action, error: "예약 내역을 찾지 못했어요" });
        xml = await ebPost(jar, "/process/contentReserveCancelProc.xml", { lbryCode: LBRY, prenSrmb });
      }
      return json({
        ok: xmlTag(xml, "result") === "True", action, personal,
        message: (xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " "),
      });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
