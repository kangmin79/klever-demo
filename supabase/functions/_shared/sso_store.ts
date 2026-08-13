// 북스타 — SSO 세션 저장소(sso_sessions 테이블)
// liid(도서관 회원번호)와 포털 연계값(school_no·portal_user_id)은 사실상 자격증명이라
// 브라우저·URL·토큰 페이로드에 절대 싣지 않는다. 토큰엔 랜덤 sid만, 실제 값은 이 표에만.
// RLS 잠금 + service_role 전용.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "content-type": "application/json" };

export interface SsoRow {
  sid: string;
  hakbun: string;
  name: string | null;
  liid: string | null;
  school_no: string | null;
  portal_user_id: string | null;
  expires_at: string;
}

export function newSid(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function saveSession(row: Omit<SsoRow, "expires_at"> & { ttlSec?: number }): Promise<void> {
  const { ttlSec = 7 * 24 * 3600, ...rest } = row;
  const r = await fetch(`${SB_URL}/rest/v1/sso_sessions`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ ...rest, expires_at: new Date(Date.now() + ttlSec * 1000).toISOString() }),
  });
  if (!r.ok) throw new Error("세션 저장 실패: " + (await r.text()).slice(0, 160));
}

export async function loadSession(sid: string): Promise<SsoRow | null> {
  if (!sid) return null;
  const r = await fetch(`${SB_URL}/rest/v1/sso_sessions?sid=eq.${encodeURIComponent(sid)}&select=*`, { headers: H });
  if (!r.ok) return null;
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null; // 만료
  return row as SsoRow;
}

/** 학번으로 '연계값이 살아 있는' 가장 최근 세션을 찾는다 — 테스트용 자동 진입(배너 대역) 전용.
 *  한 번 포털 로그인으로 받아 둔 school_no·portal_user_id가 있으면 비밀번호 없이 세션을 다시 만들 수 있다.
 *  (배너가 넘겨주는 값과 같은 것이라, 배너가 설치되면 이 경로는 필요 없어진다) */
export async function loadLatestByHakbun(hakbun: string): Promise<SsoRow | null> {
  if (!hakbun) return null;
  const q = `hakbun=eq.${encodeURIComponent(hakbun)}&portal_user_id=not.is.null&order=expires_at.desc&limit=1&select=*`;
  const r = await fetch(`${SB_URL}/rest/v1/sso_sessions?${q}`, { headers: H });
  if (!r.ok) return null;
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) ? rows[0] as SsoRow : null;
}

/** 만료를 무시하고 읽는다 — 알림 발송 배치 전용.
 *  알림을 켠 학생은 앱을 안 열어도 매일 도서관을 대신 확인해 줘야 하는데,
 *  7일 만료를 그대로 적용하면 "일주일 안 들어오면 알림이 끊긴다"가 되어 기능이 무의미해진다.
 *  대신 조회가 성공할 때마다 touchSession으로 만료를 밀어 준다(포털 연계값이 죽으면 조회가
 *  실패하므로, 죽은 세션이 영원히 남지는 않는다 — push_subs.fail_count 5회면 구독이 꺼진다). */
export async function loadSessionAny(sid: string): Promise<SsoRow | null> {
  if (!sid) return null;
  const r = await fetch(`${SB_URL}/rest/v1/sso_sessions?sid=eq.${encodeURIComponent(sid)}&select=*`, { headers: H });
  if (!r.ok) return null;
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) ? rows[0] as SsoRow : null;
}

/** 만료 연장 — 알림 조회가 실제로 성공했을 때만 부른다 */
export async function touchSession(sid: string, ttlSec = 30 * 24 * 3600): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/sso_sessions?sid=eq.${encodeURIComponent(sid)}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ expires_at: new Date(Date.now() + ttlSec * 1000).toISOString() }),
  });
}
