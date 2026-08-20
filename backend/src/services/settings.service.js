/* =============================================================
   services/settings.service.js
   Ustawienia platformy przechowywane w tabeli platform_settings.
   Sekrety szyfrowane (encryption.service). Odszyfrowana konfiguracja
   cache'owana w pamięci na 5 min, inwalidowana po zapisie.
   NIGDY nie zwracamy odszyfrowanych sekretów na zewnątrz (maskowanie).
============================================================= */
"use strict";

const db = require("../db");
const enc = require("./encryption.service");

// Definicje pól: secret? bool? oraz wartość początkowa (z .env — tylko przy seedzie).
const DEF = [
  { key: "app_name",        secret: false, def: () => process.env.APP_NAME || "Zdrovia" },
  { key: "support_email",   secret: false, def: () => process.env.SUPPORT_EMAIL || "kontakt@zdrovia.pl" },
  { key: "smtp_host",       secret: false, def: () => process.env.SMTP_HOST || "" },
  { key: "smtp_port",       secret: false, def: () => process.env.SMTP_PORT || "587" },
  { key: "smtp_user",       secret: false, def: () => process.env.SMTP_USER || "" },
  { key: "smtp_password",   secret: true,  def: () => process.env.SMTP_PASSWORD || "" },
  { key: "smtp_from",       secret: false, def: () => process.env.SMTP_FROM || "Zdrovia <no-reply@zdrovia.pl>" },
  { key: "n8n_webhook_url", secret: false, def: () => process.env.N8N_WEBHOOK_URL || "" },
  { key: "n8n_webhook_secret", secret: true, def: () => process.env.N8N_WEBHOOK_SECRET || "" },
  { key: "enable_email_notifications", secret: false, bool: true, def: () => "false" },
  { key: "enable_realtime",            secret: false, bool: true, def: () => "true" },
  { key: "enable_dark_mode_default",   secret: false, bool: true, def: () => "false" },
];
const BY_KEY = Object.fromEntries(DEF.map((d) => [d.key, d]));

let cache = null;
let cacheTime = 0;
const TTL = 5 * 60 * 1000;

/* Seed brakujących kluczy wartościami z .env (tylko przy pierwszym starcie). */
function seedDefaults() {
  const existing = new Set(db.prepare("SELECT key FROM platform_settings").all().map((r) => r.key));
  const now = new Date().toISOString();
  const ins = db.prepare("INSERT INTO platform_settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)");
  DEF.forEach((d) => {
    if (existing.has(d.key)) return;
    let v = d.def();
    if (d.secret) v = v && enc.isConfigured() ? enc.encrypt(String(v)) : null;
    ins.run(d.key, v == null ? null : String(v), d.secret ? 1 : 0, now);
  });
}

function loadRaw() {
  return db.prepare("SELECT key, value, is_secret FROM platform_settings").all();
}

function safeDecrypt(v) {
  try { return enc.decrypt(v); }
  catch (_e) { console.warn("[settings] Nie udało się odszyfrować sekretu (zły klucz?)."); return ""; }
}

/* Mapa odszyfrowana (do użytku wewnętrznego: e-mail, n8n). Cache 5 min. */
function getDecryptedMap() {
  if (cache && Date.now() - cacheTime < TTL) return cache;
  const map = {};
  loadRaw().forEach((r) => {
    map[r.key] = r.is_secret ? (r.value ? safeDecrypt(r.value) : "") : r.value;
  });
  cache = map;
  cacheTime = Date.now();
  return map;
}

function get(key) { return getDecryptedMap()[key]; }
function getBool(key) { const v = get(key); return v === "true" || v === true || v === "1"; }
function invalidate() { cache = null; cacheTime = 0; }

/* Widok dla frontendu: sekrety zamaskowane (isSet), reszta jawnie. */
function getMasked() {
  const rows = Object.fromEntries(loadRaw().map((r) => [r.key, r]));
  const out = {};
  DEF.forEach((d) => {
    const r = rows[d.key];
    if (d.secret) out[d.key] = { secret: true, isSet: !!(r && r.value) };
    else out[d.key] = r ? r.value : d.def();
  });
  return out;
}

/* Zapis: sekrety szyfrowane; puste/nieobecne pole sekretu NIE nadpisuje
   istniejącej wartości. clearKeys → wyczyszczenie sekretu (value=NULL). */
function setMany(values, adminId, clearKeys) {
  const now = new Date().toISOString();
  const up = db.prepare(
    `INSERT INTO platform_settings (key, value, is_secret, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  );
  DEF.forEach((d) => {
    if (!(d.key in values)) return;
    let v = values[d.key];
    if (d.secret) {
      if (v == null || v === "") return; // nie nadpisuj istniejącego sekretu pustką
      v = enc.encrypt(String(v));
    } else if (d.bool) {
      v = (v === true || v === "true" || v === 1 || v === "1") ? "true" : "false";
    } else {
      v = v == null ? "" : String(v);
    }
    up.run(d.key, v, d.secret ? 1 : 0, now, adminId);
  });
  (clearKeys || []).forEach((key) => {
    const d = BY_KEY[key];
    if (d && d.secret) up.run(key, null, 1, now, adminId);
  });
  invalidate();
}

module.exports = { DEF, BY_KEY, seedDefaults, getMasked, setMany, get, getBool, getDecryptedMap, invalidate };
