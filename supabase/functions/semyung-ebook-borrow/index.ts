// 북스타 — 세명대 전자도서관 구매 전자책 "대출/반납" 라이브 대행
// 도서관장 계정으로 서버가 로그인(전자도서관은 AES 암호화 로그인) → 대출/반납을 북스타 안에서.
// ⚠️ 구매 전자책=동시이용 제한 + 단일 공유계정 → 데모/소수 전용. 대출 14일 점유.
// 읽기(뷰어)는 교보/예스24 DRM 웹뷰어 — 별도(브라우저). 여기선 대출 처리 + 뷰어세션(sessionId)까지.
//
// GET ?action=borrow&brcd=4808954682152   → 대출 (loanSrmb 반환)
//     ?action=return&brcd=...&loanSrmb=... → 반납
//     ?action=status                       → 현재 대출 현황
const EB = "https://ebook.semyung.ac.kr/elibrary-front";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const LBRY = "20213";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
const xmlTag = (s: string, t: string) => {
  const v = (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s) || [, ""])[1] || "";
  const c = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(v);
  return (c ? c[1] : v).trim();
};

// ── 전자도서관 전용 AES (aes.js의 mysqlAES 재현): AES-128-ECB, key="freedom"+널(16B), PKCS7, 대문자 hex ──
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

function pickJsession(r: Response): string {
  const arr = (r.headers as any).getSetCookie ? (r.headers as any).getSetCookie() : [];
  for (const c of arr) { const m = /^(JSESSIONID)=([^;]+)/.exec(c); if (m) return `${m[1]}=${m[2]}`; }
  return "";
}

async function login(): Promise<string> {
  const id = Deno.env.get("SEMYUNG_LIB_ID") || "";
  const pw = Deno.env.get("SEMYUNG_LIB_PW") || "";
  if (!id || !pw) throw new Error("계정 미설정");
  const body = new URLSearchParams({
    mmbrId: await aesHex(id), pwd: await aesHex(pw), idSave: "false", autoLogin: "false",
  });
  const r = await fetch(`${EB}/member/loginProcess.json`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Referer: `${EB}/member/memberLogin.ink` },
    body, redirect: "manual",
  });
  const cookie = pickJsession(r);
  const txt = await r.text();
  if (!cookie || !/"rtnCode"\s*:\s*"T"/.test(txt)) throw new Error("전자도서관 로그인 실패");
  return cookie;
}

async function postXml(path: string, cookie: string, fields: Record<string, string>): Promise<string> {
  const r = await fetch(`${EB}${path}`, {
    method: "POST",
    headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Referer: `${EB}/content/contentView.ink` },
    body: new URLSearchParams(fields),
  });
  return new TextDecoder("utf-8").decode(await r.arrayBuffer());
}

// 대출 1회 시도
async function doBorrow(cookie: string, brcd: string) {
  const xml = await postXml("/process/contentBorrowProc.xml", cookie, { lbryCode: LBRY, brcd, epdeBrcd: "", dvsnCode: "W" });
  return {
    ok: xmlTag(xml, "result") === "True",
    loanSrmb: xmlTag(xml, "loanSrmb"),
    ents: xmlTag(xml, "entsDvsnCode"),
    msg: (xmlTag(xml, "msg") || "대출 실패").replace(/<br\s*\/?>/gi, " "),
  };
}
// 현재 대출 목록(loanSrmb) — 대출현황 페이지(/myLib/myBorrowList.ink) 반납 버튼에서 추출
async function listLoans(cookie: string): Promise<{ loanSrmb: string; title: string }[]> {
  const r = await fetch(`${EB}/myLib/myBorrowList.ink`, { headers: { "User-Agent": UA, Cookie: cookie, Referer: `${EB}/main.ink` } });
  const html = new TextDecoder("utf-8").decode(await r.arrayBuffer());
  const out: { loanSrmb: string; title: string }[] = [];
  const re = /gFnContentReturnProc\('[^']*','(\d+)'\s*,\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ loanSrmb: m[1], title: m[2] });
  return out;
}
// 전 대출 반납 — 공유계정(데모) 슬롯 비우기
async function returnAll(cookie: string): Promise<{ returned: number; items: any[] }> {
  const loans = await listLoans(cookie);
  const items: any[] = [];
  for (const l of loans) {
    const xml = await postXml("/process/contentReturnProc.xml", cookie, { lbryCode: LBRY, loanSrmb: l.loanSrmb });
    items.push({ loanSrmb: l.loanSrmb, title: l.title, ok: xmlTag(xml, "result") === "True" });
  }
  return { returned: items.filter((i) => i.ok).length, items };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "borrow";
    const brcd = (url.searchParams.get("brcd") || "").replace(/[^0-9A-Za-z]/g, "");
    const cookie = await login();

    if (action === "status") {
      const r = await fetch(`${EB}/main/userBorrowStatus.json`, { headers: { "User-Agent": UA, Cookie: cookie } });
      return json({ ok: true, action, status: await r.json() });
    }

    if (action === "returnAll") {
      return json({ ok: true, action, ...(await returnAll(cookie)) });
    }

    if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);

    if (action === "borrow") {
      let res = await doBorrow(cookie, brcd);
      let autoReturned = 0;
      // 데모 공유계정 대출한도(5권) 초과 → 가장 오래된 1권만 반납 후 재시도(전부 반납=blind 금지: 동시 데모 보호).
      if (!res.ok && /초과|권수|limit/i.test(res.msg)) {
        const loans = await listLoans(cookie);
        if (loans.length) {
          const oldest = loans.reduce((a, b) => Number(a.loanSrmb) <= Number(b.loanSrmb) ? a : b);
          await postXml("/process/contentReturnProc.xml", cookie, { lbryCode: LBRY, loanSrmb: oldest.loanSrmb });
          autoReturned = 1;
        }
        res = await doBorrow(cookie, brcd);
      }
      const loanSrmb = res.loanSrmb;
      const ents = res.ents; // KB=교보 / YS=예스24
      if (!res.ok) return json({ ok: false, action, message: res.msg, autoReturned });
      // 뷰어 세션 발급 → 뷰어 URL 생성(토큰 내장, 쿠키 없이 단독 실행되는 교보/예스24 DRM 뷰어)
      let viewerUrl = "";
      try {
        await postXml("/process/sessionAddProc.xml", cookie, { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "", cttsDvsnCode: "001", fileDvsnCode: "", mmbrNum: "", ifType: "W" });
        const wr = await fetch(`${EB}/process/webViewerProc.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&brcd=${brcd}&epdeBrcd=&type=web`, {
          headers: { "User-Agent": UA, Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
        });
        const wx = new TextDecoder("utf-8").decode(await wr.arrayBuffer());
        if (xmlTag(wx, "result") === "True") {
          const wvUrl = xmlTag(wx, "webViewrUrl");
          const token = xmlTag(wx, "token").replace(/\//g, "-"); // 네이티브와 동일: '/'→'-'
          const title = xmlTag(wx, "title");
          viewerUrl = `${EB}/popup/popWebviewer.ink?webViewrUrl=${wvUrl}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(token)}`;
        }
      } catch (_) { /* 뷰어URL 실패해도 대출은 유효 */ }
      return json({ ok: true, action, loanSrmb, entsDvsnCode: ents, viewerUrl, message: "대출 완료 — 대출기간 14일, 읽고 나면 반납해 주세요" });
    }

    if (action === "return") {
      const loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb) return json({ ok: false, action, error: "loanSrmb 필요" }, 400);
      const xml = await postXml("/process/contentReturnProc.xml", cookie, { lbryCode: LBRY, loanSrmb });
      return json({ ok: xmlTag(xml, "result") === "True", action, loanSrmb });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
