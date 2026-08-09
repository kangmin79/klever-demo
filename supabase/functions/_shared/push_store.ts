// 북스타 — 웹푸시 구독 저장소(push_subs). RLS 잠금, service_role 전용.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "content-type": "application/json" };

export interface PushRow {
  endpoint: string;
  sid: string;
  hakbun: string;
  p256dh: string;
  auth: string;
  last_sent_at: string | null;
  last_key: string | null;
  fail_count: number;
  active: boolean;
}

/** 구독 등록(같은 브라우저가 다시 켜면 endpoint가 같으므로 덮어쓴다) */
export async function saveSub(row: Pick<PushRow, "endpoint" | "sid" | "hakbun" | "p256dh" | "auth">): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/push_subs`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates" },
    // 재구독은 되살아나는 것 — 이전에 죽어서 꺼둔 구독이면 실패 카운트를 지우고 다시 켠다
    body: JSON.stringify({ ...row, active: true, fail_count: 0 }),
  });
  if (!r.ok) throw new Error("구독 저장 실패: " + (await r.text()).slice(0, 160));
}

export async function dropSub(endpoint: string): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE", headers: H });
}

export async function getSub(endpoint: string): Promise<PushRow | null> {
  const r = await fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}&select=*`, { headers: H });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as PushRow : null;
}

export async function listActive(): Promise<PushRow[]> {
  const r = await fetch(`${SB_URL}/rest/v1/push_subs?active=is.true&select=*`, { headers: H });
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows as PushRow[] : [];
}

export async function markSent(endpoint: string, key: string): Promise<void> {
  await patch(endpoint, { last_sent_at: new Date().toISOString(), last_key: key, fail_count: 0 });
}

/** 발송 실패 누적 — 5회 연속이면 끈다(연계값이 죽었거나 구독이 사라진 것) */
export async function markFail(endpoint: string, n: number, gone: boolean): Promise<void> {
  if (gone) { await dropSub(endpoint); return; }
  await patch(endpoint, { fail_count: n + 1, active: n + 1 < 5 });
}

async function patch(endpoint: string, body: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
}
