// 북스타 서비스워커 — **푸시 알림 전용**
//
// ⚠️ fetch 핸들러를 절대 넣지 말 것.
//    app.html은 CSS·JS가 전부 인라인된 단일 파일이라, 서비스워커가 응답을 캐시하기 시작하면
//    배포해도 옛 앱이 계속 뜨는 사고가 난다(되돌리기도 어렵다).
//    fetch를 안 잡으면 브라우저는 늘 서버에서 받아온다 — 캐시 위험 0.
//
// 하는 일: ①푸시 수신해 알림 띄우기 ②알림 클릭 시 내 도서관 열기 뿐.

self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: (event.data && event.data.text()) || "" }; }
  const title = d.title || "북스타";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 같은 tag면 새 알림이 이전 것을 덮어쓴다 — 연체 알림이 며칠 쌓여 목록을 채우지 않게
    tag: d.tag || "bookstar",
    renotify: true,
    data: { url: d.url || "/app#mylib" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app#mylib";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // 북스타가 이미 열려 있으면 새 탭을 만들지 않고 그 창을 앞으로 — 탭이 계속 늘어나지 않게
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ("navigate" in w) { try { await w.navigate(url); } catch (_) { /* 포커스만 해도 충분 */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
