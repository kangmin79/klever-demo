// 북스타 — 세명대 로그인 체인 공용 모듈 (lib 세션 → 전자도서관 개인세션)
//
// 8/8 실측으로 확정된 사실 2가지가 이 모듈의 존재 이유:
//  ① 포털이 발급한 school_no + portal_user_id 두 값만 있으면 **비밀번호 없이, 우리 서버에서**
//     lib 세션을 만들 수 있다(재현·재사용 확인). → 학생 비번을 받지 않고도 개인기능 대행 가능.
//  ② openapi(myloan/myreserve)의 uid는 **학번이 아니라 liid**(도서관 내부 회원번호, 예 0000020149413).
//     학번을 uid로 넣으면 "해당 이용자 정보가 없습니다"로 영구 실패. liid는 lib 세션에서만 얻는다.
//     → 종이책 개인기능조차 배너의 학번만으로는 불가능. 이 체인이 필수 경로.
//
// 쿠키는 Deno fetch에 저장소가 없으므로 요청마다 직접 들고 다닌다(CookieJar 최소 구현).

const LIB = "https://lib.semyung.ac.kr";
const PORTAL = "https://setopia.semyung.ac.kr";
export const EB = "https://ebook.semyung.ac.kr/elibrary-front";
export const LBRY = "20213";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export class Jar {
  private c = new Map<string, string>();
  absorb(r: Response) {
    const arr = (r.headers as any).getSetCookie?.() ?? [];
    for (const line of arr) {
      const m = /^([^=]+)=([^;]*)/.exec(line);
      if (m && m[2]) this.c.set(m[1].trim(), m[2]);
    }
  }
  header(): string {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(name: string) { return this.c.has(name); }
}

async function req(
  url: string,
  { jar, method = "GET", form, referer, ajax }: { jar: Jar; method?: string; form?: Record<string, string>; referer?: string; ajax?: boolean },
): Promise<{ res: Response; body: string }> {
  const headers: Record<string, string> = { "User-Agent": UA };
  const ck = jar.header();
  if (ck) headers.Cookie = ck;
  if (referer) headers.Referer = referer;
  if (ajax) headers["X-Requested-With"] = "XMLHttpRequest";
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const res = await fetch(url, {
    method, headers,
    body: form ? new URLSearchParams(form) : undefined,
    redirect: "manual",
  });
  jar.absorb(res);
  let body = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  // 302는 수동 추적(쿠키 유지) — 최대 3회
  let loc = res.headers.get("location");
  for (let i = 0; i < 3 && loc && res.status >= 300 && res.status < 400; i++) {
    const next = loc.startsWith("http") ? loc : new URL(loc, url).toString();
    const r2 = await fetch(next, { headers: { "User-Agent": UA, Cookie: jar.header() }, redirect: "manual" });
    jar.absorb(r2);
    body = new TextDecoder("utf-8").decode(await r2.arrayBuffer());
    loc = r2.headers.get("location");
  }
  return { res, body };
}

const attr = (html: string, name: string): string => {
  const re = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`);
  const m = re.exec(html);
  return m ? m[1] : "";
};

export interface PortalHandoff { school_no: string; portal_user_id: string }

// 테스트/검증 전용 — 포털 계정(id/pw)으로 직접 로그인해 연계값 획득.
// 운영에서는 학생 비번을 받지 않으므로 쓰지 않는다(배너가 연계값을 넘겨주는 것이 정상 경로).
export async function portalLogin(userId: string, password: string): Promise<PortalHandoff> {
  const jar = new Jar();
  const { body } = await req(`${PORTAL}/program/member/SSLLoginLibSMATEProc.jsp`, {
    jar, method: "POST", referer: `${LIB}/login`,
    form: { userId, password, cert_member_id: userId, cert_password: password },
  });
  const school_no = attr(body, "school_no");
  const portal_user_id = attr(body, "portal_user_id");
  if (!school_no || !portal_user_id) throw new Error("포털 로그인 실패(연계값 미발급)");
  return { school_no, portal_user_id };
}

// 포털 연계값 → lib 개인세션. ⚠️ 필드명 `returnUrl `의 끝 공백은 세명대 실제 폼 그대로(제거 금지).
export async function libLoginByPortal(h: PortalHandoff): Promise<Jar> {
  const jar = new Jar();
  await req(`${LIB}/login`, { jar }); // 세션쿠키 선발급
  const { body } = await req(`${LIB}/login`, {
    jar, method: "POST", referer: `${PORTAL}/`,
    form: { isSmateLogin: "Y", school_no: h.school_no, portal_user_id: h.portal_user_id, "returnUrl ": "/" },
  });
  if (!/logout/i.test(body)) throw new Error("lib SSO 핸드오프 실패");
  return jar;
}

// 관장님 계정(아이디/비번) lib 로그인 — 공유계정 폴백 경로
export async function libLoginByPassword(id: string, password: string): Promise<Jar> {
  const jar = new Jar();
  await req(`${LIB}/login`, { jar });
  const { body } = await req(`${LIB}/login`, { jar, method: "POST", form: { id, password } });
  if (!/logout/i.test(body)) throw new Error("lib 로그인 실패");
  return jar;
}

export interface EbookHandoff {
  liid: string; // openapi uid (도서관 회원번호) — 이 체인에서만 얻을 수 있는 값
  user_id: string; // 교보 규약 암호화 ID (lib=퓨처누리가 생성, 우리 직접생성 불가)
  user_name: string;
  user_position: string;
  user_positionName: string;
}

// lib 세션 → /relation/eBook 페이지에서 전자도서관 연계폼 + liid 추출
export async function fetchEbookHandoff(jar: Jar): Promise<EbookHandoff> {
  const { body } = await req(`${LIB}/relation/eBook`, { jar, referer: `${LIB}/` });
  const fm = /<form[^>]+id=["']frmEbook["'][\s\S]*?<\/form>/.exec(body);
  if (!fm) throw new Error("전자도서관 연계폼 없음(로그인 만료 가능)");
  const f = fm[0];
  const user_id = attr(f, "user_id");
  if (!user_id) throw new Error("연계 user_id 없음");
  // liid = "0000020149413;1005" 형태 (앞부분이 openapi uid)
  const liid = (attr(body, "liid").split(";")[0] || "").trim();
  return {
    liid,
    user_id,
    user_name: attr(f, "user_name"),
    user_position: attr(f, "user_position"),
    user_positionName: attr(f, "user_positionName"),
  };
}

// 연계폼 → 전자도서관 개인세션(mmbrLnkg = 미리 가입 없이 자동 회원연계+로그인)
export async function ebookSession(h: EbookHandoff): Promise<Jar> {
  const jar = new Jar();
  await req(`${EB}/frontapi/mmbrLnkg.ink`, {
    jar, method: "POST", referer: `${LIB}/relation/eBook`,
    form: {
      user_id: h.user_id, user_name: h.user_name,
      user_position: h.user_position, user_positionName: h.user_positionName,
      libraryCode: LBRY,
    },
  });
  const { body } = await req(`${EB}/main/userBorrowStatus.json`, { jar, referer: `${EB}/main.ink`, ajax: true });
  if (/"userBrwStatus"\s*:\s*null/.test(body)) throw new Error("전자도서관 개인세션 수립 실패");
  return jar;
}

// 전자도서관 API 헬퍼(개인세션·공유계정 공용)
export async function ebPost(jar: Jar, path: string, form: Record<string, string>): Promise<string> {
  const { body } = await req(`${EB}${path}`, { jar, method: "POST", form, referer: `${EB}/content/contentView.ink`, ajax: true });
  return body;
}
export async function ebGet(jar: Jar, path: string): Promise<string> {
  const { body } = await req(`${EB}${path}`, { jar, referer: `${EB}/main.ink`, ajax: true });
  return body;
}
export const xmlTag = (s: string, t: string): string => {
  const v = (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s) || [, ""])[1] || "";
  const c = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(v);
  return (c ? c[1] : v).trim();
};

// 학생 1명 전체 체인 — 연계값 → {liid, 전자도서관 개인세션}
export async function personalSession(h: PortalHandoff): Promise<{ liid: string; eb: Jar; name: string }> {
  const lib = await libLoginByPortal(h);
  const hand = await fetchEbookHandoff(lib);
  const eb = await ebookSession(hand);
  return { liid: hand.liid, eb, name: hand.user_name };
}
