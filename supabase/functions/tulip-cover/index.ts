// tulip-cover — semyung_tulip 표지 지연 조달 (P2, 2026-08-06)
// POST {ctrls: string[]} (최대 30개) → {covers: {ctrl: url|null}}
//
// 동작: cover_url 있으면 그대로 반환. 종이책이고 cover_url null + ISBN 있으면
// 알라딘 ISBN 직조회(오매칭 없음) → cover_url에 캐시 후 반환.
// 실패는 ''로 마킹해 재조회 방지 (''과 null 모두 클라이언트엔 null = 타이포 표지).
// 알라딘 일 한도(기본키 5,000/일) 보호: 요청당 조회 30건 제한 + 화면 노출분만 호출하는 전제.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ALADIN_KEY = Deno.env.get("ALADIN_TTBKEY") || "ttbbgtrfvcdewsx771056001";

function coverOf(item: { cover?: string }): string {
  return (item.cover || "").replace(/\\\//g, "/").replace("/coversum/", "/cover200/");
}
function descOf(item: { description?: string }): string {
  return (item.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
}

async function aladinByIsbn(isbn: string): Promise<{ cover: string; desc: string }> {
  for (const target of ["Book", "eBook"]) {
    try {
      const u = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_KEY}` +
        `&itemIdType=ISBN13&ItemId=${isbn}&SearchTarget=${target}&output=js&Version=20131101`;
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const items = d.item || [];
      if (items.length && coverOf(items[0])) return { cover: coverOf(items[0]), desc: descOf(items[0]) };
    } catch { /* 다음 타겟 */ }
  }
  return { cover: "", desc: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { ctrls } = await req.json();
    if (!Array.isArray(ctrls) || !ctrls.length) throw new Error("ctrls 배열 필요");
    const list = ctrls.slice(0, 30).map(String);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rows, error } = await sb.from("semyung_tulip")
      .select("ctrl,kind,isbn,cover_url").in("ctrl", list);
    if (error) throw error;

    const covers: Record<string, string | null> = {};
    for (const c of list) covers[c] = null;

    for (const r of rows || []) {
      if (r.cover_url) { covers[r.ctrl] = r.cover_url; continue; }
      // ''=이미 시도·실패 → 재조회 안 함 / 전자책 null은 enrich·covers-yes24 배치 몫
      if (r.cover_url === "" || r.kind !== "paper" || !r.isbn) continue;
      const { cover: cov, desc } = await aladinByIsbn(r.isbn);
      covers[r.ctrl] = cov || null;
      const patch: Record<string, unknown> = { cover_url: cov, updated_at: new Date().toISOString() };
      if (desc) patch.description = desc;   // 표지와 같은 응답에 온 줄거리도 캐시(모달 lazy 조회용)
      await sb.from("semyung_tulip").update(patch).eq("ctrl", r.ctrl);
    }
    return new Response(JSON.stringify({ covers }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
