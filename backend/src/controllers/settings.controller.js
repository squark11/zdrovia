/* =============================================================
   controllers/settings.controller.js
   Ustawienia platformy (tylko admin). Sekrety zawsze zamaskowane
   w odpowiedziach; odszyfrowane wartości nie opuszczają serwera.
============================================================= */
"use strict";

const { ApiError } = require("../middleware/error.middleware");
const settings = require("../services/settings.service");
const email = require("../services/email.service");

// GET /api/admin/settings — sekrety zamaskowane.
function getSettings(_req, res) {
  res.json({ settings: settings.getMasked() });
}

// PUT /api/admin/settings — zapis (sekrety szyfrowane; puste nie nadpisują).
function putSettings(req, res) {
  const { clear, ...values } = req.body;
  settings.setMany(values, req.user.id, clear);
  res.json({ ok: true, settings: settings.getMasked() });
}

/* Rate limit testu SMTP: max 5 / 15 min / admin. */
const testBuckets = new Map();
function checkTestRate(adminId) {
  const now = Date.now();
  const arr = (testBuckets.get(adminId) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (arr.length >= 5) { testBuckets.set(adminId, arr); return false; }
  arr.push(now);
  testBuckets.set(adminId, arr);
  return true;
}
function smtpErrorMessage(e) {
  const m = (e && e.message ? e.message : "").toLowerCase();
  if (m.includes("nie jest skonfigurowany")) return "host SMTP nie jest skonfigurowany.";
  if (m.includes("auth") || m.includes("credential") || m.includes("username") || m.includes("password") || m.includes("535")) return "błąd uwierzytelniania SMTP (sprawdź login/hasło).";
  if (m.includes("econnrefused") || m.includes("etimedout") || m.includes("enotfound") || m.includes("timeout") || m.includes("connection")) return "brak połączenia z serwerem SMTP (host/port).";
  return "sprawdź konfigurację SMTP.";
}

// POST /api/admin/settings/test-smtp — wysyła testowego e-maila.
async function testSmtp(req, res) {
  if (!checkTestRate(req.user.id)) {
    throw new ApiError(429, "Za dużo prób testu. Spróbuj ponownie za kilkanaście minut.");
  }
  const to = settings.get("support_email") || req.user.email;
  try {
    await email.sendTestEmail(to);
    res.json({ ok: true, to });
  } catch (err) {
    // Nigdy nie ujawniamy hasła — tylko kategoria błędu.
    throw new ApiError(400, "Nie udało się wysłać testu: " + smtpErrorMessage(err));
  }
}

module.exports = { getSettings, putSettings, testSmtp };
