/* Service Worker: zeigt Erinnerungen an und setzt die Zahl auf dem App-Symbol. Kein Caching. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  const jobs = [self.registration.showNotification(d.title || "DE: Karteikarten", {
    body: d.body || "Zeit für deine Wörter", tag: "review", renotify: true, data: { url: "./" }
  })];
  if (typeof d.count === "number" && self.navigator.setAppBadge) jobs.push(self.navigator.setAppBadge(d.count).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
