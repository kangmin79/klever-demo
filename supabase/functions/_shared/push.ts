// 북스타 — 웹푸시 발송 공용 모듈
//
// 앱을 열지 않아도 알게 하는 유일한 경로가 웹푸시다(학생 이메일·전화번호를 받지 않기 때문).
// web-push 라이브러리는 **암호화·서명(generateRequestDetails)까지만** 쓰고 전송은 fetch로 한다.
// 라이브러리의 전송부는 node:https를 쓰는데 엣지 런타임에서 불안정해서다.
//
// VAPID 키는 시크릿(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).
// 공개키는 브라우저 구독에도 필요해서 앱에 그대로 노출된다(원래 공개용).
import webpush from "npm:web-push@3.6.7";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let ready = false;
function init() {
  if (ready) return;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const prv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const sub = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@bookstar.co.kr";
  if (!pub || !prv) throw new Error("VAPID 키 미설정");
  webpush.setVapidDetails(sub, pub, prv);
  ready = true;
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** 구독이 영구히 죽었다(브라우저 삭제·권한 해제) — 즉시 비활성화해야 하는 경우 */
  gone: boolean;
  body: string;
}

/** 한 구독에 알림 하나를 보낸다. 절대 throw 하지 않는다 — 한 명 실패가 배치를 멈추면 안 된다. */
export async function sendPush(sub: PushSub, payload: unknown, ttlSec = 12 * 3600): Promise<PushResult> {
  try {
    init();
    const d = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: ttlSec, contentEncoding: "aes128gcm" },
    );
    const r = await fetch(d.endpoint, {
      method: "POST",
      headers: d.headers as Record<string, string>,
      body: d.body as unknown as BodyInit,
    });
    const body = r.ok ? "" : (await r.text()).slice(0, 200);
    // 404/410 = 구독이 사라짐(브라우저에서 삭제·권한 철회). 재시도해도 영원히 실패한다.
    return { ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410, body };
  } catch (e) {
    return { ok: false, status: 0, gone: false, body: String(e).slice(0, 200) };
  }
}
