/* =============================================================
   services/email.service.js
   Wysyłka e-maili (Nodemailer). Konfiguracja SMTP pochodzi z
   platform_settings (odszyfrowana w locie), NIE z process.env.
   Powiadomienia respektują flagę enable_email_notifications i są
   owinięte w try/catch (błąd e-maila nie wywala głównej operacji).
   NIGDY nie logujemy haseł/sekretów.
============================================================= */
"use strict";

const nodemailer = require("nodemailer");
const settings = require("./settings.service");

const BRAND = "#0E9F8E";

/* Buduje link do panelu pacjenta. Frontend bywa hostowany osobno od API
   (GitHub Pages), więc adres bierzemy z PUBLIC_FRONTEND_URL; bez niej
   wracamy do PUBLIC_APP_URL (backend serwuje też statyki), a w ostatniej
   kolejności do lokalnego serwera deweloperskiego. */
function frontendUrl(pathWithHash) {
  const base = String(
    process.env.PUBLIC_FRONTEND_URL || process.env.PUBLIC_APP_URL || "http://localhost:4000"
  ).replace(new RegExp("/+$"), "");
  return base + "/" + String(pathWithHash).replace(new RegExp("^/+"), "");
}

function buildTransport() {
  const host = settings.get("smtp_host");
  const port = parseInt(settings.get("smtp_port"), 10) || 587;
  const user = settings.get("smtp_user");
  const pass = settings.get("smtp_password");
  if (!host) throw new Error("Host SMTP nie jest skonfigurowany.");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS
    auth: user ? { user, pass } : undefined,
  });
}

async function send(to, subject, html) {
  const from = settings.get("smtp_from") || "Zdrovia <no-reply@zdrovia.pl>";
  const transport = buildTransport();
  const info = await transport.sendMail({ from, to, subject, html });
  // Podgląd tylko dla kont testowych Ethereal (w produkcji zwraca false).
  // To publiczny URL podglądu, NIE sekret — pomaga w developmentcie.
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log("[email] Podgląd (Ethereal):", preview);
  return info;
}

/* Szablon bazowy — prosty, responsywny, inline CSS, spójny z brandingiem. */
function layout(title, bodyHtml) {
  const app = settings.get("app_name") || "Zdrovia";
  return `<!doctype html><html><body style="margin:0;background:#f6faf9;font-family:Arial,Helvetica,sans-serif;color:#14312d">
    <div style="max-width:520px;margin:0 auto;padding:24px">
      <div style="text-align:center;padding:8px 0 16px"><span style="font-weight:800;font-size:20px;color:${BRAND}">${esc(app)}</span></div>
      <div style="background:#fff;border:1px solid #e2ece9;border-radius:14px;overflow:hidden">
        <div style="background:${BRAND};color:#fff;padding:16px 20px;font-size:16px;font-weight:700">${esc(title)}</div>
        <div style="padding:20px;font-size:14px;line-height:1.6">${bodyHtml}</div>
      </div>
      <p style="text-align:center;color:#64756f;font-size:12px;margin:16px 0">
        To wiadomość automatyczna. W nagłych przypadkach dzwoń 112 lub jedź na SOR.
      </p>
    </div></body></html>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function row(k, v) {
  return `<tr><td style="padding:6px 0;color:#64756f">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:700">${esc(v)}</td></tr>`;
}
function table(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0">${rows}</table>`;
}
function btn(href, label) {
  return `<div style="text-align:center;margin:18px 0"><a href="${esc(href)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">${esc(label)}</a></div>`;
}

/* ---------- Szablony ---------- */
function tplAppointment(appt, patient, doctor, heading) {
  return layout(heading, `
    <p>Cześć ${esc(patient.firstName || "")},</p>
    <p>${esc(heading)}:</p>
    ${table(
      row("Lekarz", doctor.name) +
      row("Usługa", appt.serviceLabel || appt.service || "Konsultacja") +
      row("Termin", `${appt.date}, godz. ${appt.time}`) +
      row("Forma", appt.consultationType || "wideo")
    )}
    ${btn(frontendUrl("dashboard-patient.html#wizyty"), "Zobacz w panelu")}`);
}

function tplPrescription(presc, patient, doctor) {
  return layout("Nowa e-recepta", `
    <p>Cześć ${esc(patient.firstName || "")},</p>
    <p>Lekarz ${esc(doctor.name)} wystawił Ci e-receptę:</p>
    ${table(
      row("Lek", presc.medication) +
      row("Dawkowanie", presc.dosage || "—") +
      row("Kod e-recepty", presc.code) +
      row("Ważna do", presc.validUntil || "—")
    )}
    ${btn(frontendUrl("dashboard-patient.html#recepty"), "Zobacz receptę")}`);
}

/* ---------- API ---------- */
async function sendTestEmail(to) {
  await send(to, "Test konfiguracji e-mail — Zdrovia",
    layout("Test konfiguracji SMTP", "<p>To testowa wiadomość potwierdzająca, że konfiguracja SMTP w panelu administratora działa poprawnie. 🎉</p>"));
}

async function notify(taskFn) {
  if (!settings.getBool("enable_email_notifications")) return { skipped: true };
  try { await taskFn(); return { sent: true }; }
  catch (e) { console.error("[email] Błąd wysyłki powiadomienia:", e.message); return { error: true }; }
}

const sendAppointmentConfirmation = (appt, patient, doctor) =>
  notify(() => send(patient.email, "Potwierdzenie wizyty — Zdrovia", tplAppointment(appt, patient, doctor, "Twoja wizyta została umówiona")));

const sendAppointmentReminder = (appt, patient, doctor) =>
  notify(() => send(patient.email, "Przypomnienie o jutrzejszej wizycie — Zdrovia", tplAppointment(appt, patient, doctor, "Przypominamy o jutrzejszej wizycie")));

const sendNewPrescriptionNotification = (presc, patient, doctor) =>
  notify(() => send(patient.email, "Nowa e-recepta — Zdrovia", tplPrescription(presc, patient, doctor)));

module.exports = {
  sendTestEmail,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendNewPrescriptionNotification,
};
