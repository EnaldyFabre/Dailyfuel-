// Envía los avisos de "¿Y mi apetito?" que correspondan a esta hora.
const fs = require("fs");
const webpush = require("web-push");

const CFG = "state/config.json", SENT = "state/sent.json";
const WINDOW_MIN = 90; // si GitHub se atrasa, igual avisa hasta 90 min después

if (!fs.existsSync(CFG)) { console.log("Sin config.json"); process.exit(0); }
const cfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
const sent = fs.existsSync(SENT) ? JSON.parse(fs.readFileSync(SENT, "utf8")) : {};
if (!process.env.VAPID_PRIVATE_KEY) { console.error("Falta el secreto VAPID_PRIVATE_KEY"); process.exit(1); }
if (!cfg.subscription || !cfg.subscription.endpoint) { console.log("Notificaciones no activadas en la app"); process.exit(0); }

webpush.setVapidDetails("https://enaldyfabre.github.io/Dailyfuel-/", cfg.publicKey, process.env.VAPID_PRIVATE_KEY);

const tz = cfg.tz || "America/Santiago";
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"
}).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMin = (+parts.hour) * 60 + (+parts.minute);
const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];

async function send(payload) {
  try {
    await webpush.sendNotification(cfg.subscription, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    console.log("Enviado:", payload.label || "prueba");
    return true;
  } catch (e) {
    console.error("Error al enviar:", e.statusCode, e.body || e.message);
    if (e.statusCode === 404 || e.statusCode === 410) console.error("La suscripción expiró: vuelve a activar las notificaciones en la app.");
    return false;
  }
}

(async () => {
  let changed = false;
  if (process.env.PRUEBA === "true") await send({ test: true, meal: "prueba", label: "Prueba" });
  for (const r of cfg.reminders || []) {
    if (!r.on || !Array.isArray(r.days) || !r.days.includes(weekday)) continue;
    const [h, m] = String(r.time).split(":").map(Number);
    const t = h * 60 + m, diff = nowMin - t;
    if (diff < 0 || diff > WINDOW_MIN) continue;
    if (sent[r.meal] === today) continue;
    if (await send({ meal: r.meal, label: r.label })) { sent[r.meal] = today; changed = true; }
  }
  if (changed) fs.writeFileSync(SENT, JSON.stringify(sent, null, 1) + "\n");
  console.log(`Revisado ${today} ${parts.hour}:${parts.minute} (${tz}).`);
})();
