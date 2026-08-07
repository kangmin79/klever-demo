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
