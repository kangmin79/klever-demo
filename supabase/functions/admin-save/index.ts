// 관리자 저장 프록시 (2026-08-15 큐레이션 RLS 잠금)
// library_sections·library_programs의 anon 쓰기 정책을 제거한 뒤, 관리자 페이지의 쓰기는 전부 이 함수만 통과한다.
// 인증: 요청 body.secret == 환경변수 ADMIN_SECRET (관리자 로그인 비밀번호와 동일)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const J = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return J({ error: 'method not allowed' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return J({ error: 'bad json' }, 400); }

  const secret = Deno.env.get('ADMIN_SECRET') || '';
  if (!secret || String(body.secret || '') !== secret) return J({ error: 'unauthorized' }, 401);

  const REST = Deno.env.get('SUPABASE_URL') + '/rest/v1';
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };
  const op = String(body.op || '');

  if (op === 'ping') return J({ ok: true });

  if (op === 'sections_upsert') {
    const rows = body.rows;
    if (!Array.isArray(rows) || !rows.length) return J({ error: 'rows required' }, 400);
    const r = await fetch(`${REST}/library_sections?on_conflict=school,slot`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  }

  if (op === 'sections_delete') {
    const school = String(body.school || ''), slot = String(body.slot || '');
    if (!school || !slot) return J({ error: 'school/slot required' }, 400);
    const r = await fetch(
      `${REST}/library_sections?school=eq.${encodeURIComponent(school)}&slot=eq.${encodeURIComponent(slot)}`,
      { method: 'DELETE', headers: H },
    );
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  }

  if (op === 'programs_insert') {
    const rows = Array.isArray(body.rows) ? body.rows : [body.rows];
    if (!rows.length || !rows[0]) return J({ error: 'rows required' }, 400);
    const r = await fetch(`${REST}/library_programs`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    if (!r.ok) return J({ ok: false, status: r.status }, 500);
    return J({ ok: true, rows: await r.json() });
  }

  if (op === 'programs_delete') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => String(x)).filter(Boolean);
    if (!ids.length) return J({ error: 'ids required' }, 400);
    const r = await fetch(
      `${REST}/library_programs?id=in.(${ids.map(encodeURIComponent).join(',')})`,
      { method: 'DELETE', headers: H },
    );
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  }

  // ── 2026-08-15 계약 전 잠금 2차: 관리자 콘텐츠 테이블 확장 ──
  // 공통: id 기반 단건 PATCH/DELETE (patch는 op별 허용 컬럼만 통과 — secret 검증 뒤의 이중 방어)
  const patchById = async (table: string, id: unknown, patch: Record<string, unknown>) => {
    const r = await fetch(`${REST}/${table}?id=eq.${encodeURIComponent(String(id))}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  };
  const deleteById = async (table: string, id: unknown) => {
    const r = await fetch(`${REST}/${table}?id=eq.${encodeURIComponent(String(id))}`, {
      method: 'DELETE', headers: H,
    });
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  };
  const insertRow = async (table: string, row: unknown) => {
    if (!row || typeof row !== 'object') return J({ error: 'row required' }, 400);
    const r = await fetch(`${REST}/${table}`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row),
    });
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  };
  const pick = (src: unknown, keys: string[]) => {
    const o = (src && typeof src === 'object') ? src as Record<string, unknown> : {};
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in o) out[k] = o[k];
    return out;
  };

  if (op === 'notices_insert') return insertRow('library_notices', body.row);

  if (op === 'books_upsert') {
    const rows = body.rows;
    if (!Array.isArray(rows) || !rows.length) return J({ error: 'rows required' }, 400);
    const r = await fetch(`${REST}/library_books?on_conflict=school,isbn`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    return J({ ok: r.ok, status: r.status }, r.ok ? 200 : 500);
  }

  if (op === 'popups_insert') return insertRow('minsong_popups', body.row);
  if (op === 'popups_patch') return patchById('minsong_popups', body.id, pick(body.patch, ['active']));
  if (op === 'popups_delete') return deleteById('minsong_popups', body.id);

  if (op === 'comm_insert') return insertRow('community_posts', body.row);
  if (op === 'comm_patch')
    return patchById('community_posts', body.id, pick(body.row, ['kind', 'tag', 'title', 'meta1', 'meta2', 'body']));
  if (op === 'comm_delete') return deleteById('community_posts', body.id);

  if (op === 'reviews_delete') return deleteById('reviews', body.id);

  // 학생 글 모더레이션: featured/hidden만 (본문 text는 관리자도 이 경로로 수정 불가)
  if (op === 'writings_patch') return patchById('bookstar_writings', body.id, pick(body.patch, ['featured', 'hidden']));

  return J({ error: 'unknown op' }, 400);
});
