/* Servisni radnik: omogućava instalaciju i brže otvaranje.
   Podaci (Firestore, prijava) ne prolaze kroz keš, uvek idu na mrežu. */
const CACHE = "warehouse-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // samo naši fajlovi

  if (req.mode === "navigate") {
    // Stranica: prvo mreža (da se uvek vidi nova verzija), keš samo kad nema mreže
    e.respondWith(
      fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put("./", c)); return res; })
        .catch(() => caches.match("./"))
    );
    return;
  }
  // Ostali fajlovi (JS, CSS, ikone): iz keša, a u pozadini osveži
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
