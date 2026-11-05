// DailyFuel service worker: funciona sin internet y recibe los avisos de "¿Y mi apetito?".
const CACHE = "dailyfuel-v4";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== "df-state").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Red primero (para recibir actualizaciones), caché si no hay conexión.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

/* ---------- ¿Y mi apetito? ---------- */
const pad = n => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const n0 = v => Math.round(v).toLocaleString("es-CL");

async function readState(){
  try{
    const c = await caches.open("df-state");
    const r = await c.match("state.json");
    return r ? await r.json() : null;
  }catch(e){ return null; }
}

self.addEventListener("push", e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){}
  const meal = d.meal || "comida", label = d.label || "tu comida";
  e.waitUntil((async () => {
    const st = await readState();
    const fresh = st && st.date === todayISO();
    const done = fresh && Array.isArray(st.meals) && st.meals.includes(meal);
    let title, body;
    if (d.test) {
      title = "¿Y mi apetito?";
      body = "Prueba recibida. Los avisos están funcionando.";
    } else if (done) {
      title = `${label} registrado ✓`;
      body = st.goal ? `Llevas ${n0(st.total)} de ${n0(st.goal)} kcal hoy.` : `Llevas ${n0(st.total)} kcal hoy.`;
    } else {
      title = "¿Y mi apetito?";
      body = `Hora de ${label.toLowerCase()}. Toca para registrarlo.` + (fresh && st.goal ? ` Llevas ${n0(st.total)} de ${n0(st.goal)} kcal.` : "");
    }
    await self.registration.showNotification(title, {
      body, icon: "icon-192.png", badge: "icon-192.png", tag: "apetito-" + meal,
      data: { meal: done ? null : meal }, vibrate: [120, 60, 120]
    });
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const meal = e.notification.data && e.notification.data.meal;
  const target = new URL(meal ? `./#agregar-${meal}` : "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        if (meal) c.postMessage({ type: "agregar", meal });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
