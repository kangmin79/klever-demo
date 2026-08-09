// 북스타 — 웹푸시 구독 등록/해제/테스트
//
// 알림은 "앱을 안 열어도 반납일을 알게 하는" 것이 목적이라 도서관 계정이 연결된 학생만 켤 수 있다.
// (연결이 없으면 도서관에서 대출 정보를 가져올 수가 없어서 보낼 내용 자체가 없다)
//
// POST {action:"subscribe", subscription:{endpoint, keys:{p256dh, auth}}}
// POST {action:"unsubscribe", endpoint}
// POST {action:"test", endpoint}   → 그 자리에서 확인용 알림 1건
import { sessionFromRequest } from "../_shared/sso_token.ts";
import { loadSession } from "../_shared/sso_store.ts";
import { dropSub, getSub, saveSub } from "../_shared/push_store.ts";
import { sendPush } from "../_shared/push.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const ses = await sessionFromRequest(req);
    if (!ses) return json({ ok: false, error: "로그인이 필요해요" }, 401);
    const row = await loadSession(ses.sid);
    if (!row?.school_no || !row?.portal_user_id) {
      return json({ ok: false, needsPersonal: true, error: "도서관 계정 연결이 필요해요" }, 409);
    }

    const b = await req.json().catch(() => ({})) as {
      action?: string;
      endpoint?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };
    const action = b.action || "subscribe";

    if (action === "subscribe") {
      const s = b.subscription || {};
      const endpoint = s.endpoint || "";
      const p256dh = s.keys?.p256dh || "";
      const auth = s.keys?.auth || "";
      if (!endpoint || !p256dh || !auth) return json({ ok: false, error: "구독 정보가 불완전해요" }, 400);
      await saveSub({ endpoint, sid: ses.sid, hakbun: ses.hakbun || row.hakbun || "", p256dh, auth });
      return json({ ok: true, action });
    }

    if (action === "unsubscribe") {
      if (!b.endpoint) return json({ ok: false, error: "endpoint 필요" }, 400);
      await dropSub(b.endpoint);
      return json({ ok: true, action });
    }

    if (action === "test") {
      const sub = b.endpoint ? await getSub(b.endpoint) : null;
      if (!sub) return json({ ok: false, error: "등록된 구독이 아니에요" }, 404);
      // 남의 구독에 테스트 알림을 쏘지 못하게 — 내 세션의 구독인지 확인
      if (sub.sid !== ses.sid) return json({ ok: false, error: "권한이 없습니다" }, 403);
      const r = await sendPush(sub, {
        title: "알림이 켜졌어요",
        body: "반납일이 다가오거나 예약한 책이 도착하면 여기로 알려드릴게요.",
        tag: "bx-test",
        url: "/app#mylib",
      });
      return json({ ok: r.ok, action, status: r.status, error: r.ok ? undefined : r.body });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 200);
  }
});
