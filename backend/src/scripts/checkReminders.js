/* =============================================================
   scripts/checkReminders.js
   Wysyła przypomnienia o wizytach zaplanowanych na JUTRO.
   Uruchamiany cyklicznie (node-cron w server.js) oraz możliwy
   do odpalenia ręcznie: `node src/scripts/checkReminders.js`.

   Idempotencja: kolumna appointments.reminder_sent gwarantuje, że
   dana wizyta dostanie przypomnienie tylko raz (mimo godzinowego cyklu).
   Respektuje flagę enable_email_notifications (przez email.service).
============================================================= */
"use strict";

const db = require("../db");
const email = require("../services/email.service");
const { SERVICES } = require("../utils/services");

/* Lokalna data (YYYY-MM-DD) przesunięta o `offsetDays` dni. */
function ymd(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

const SELECT_DUE = `
  SELECT a.id, a.date, a.time, a.consultation_type, a.service,
         pp.first_name AS patient_first, pu.email AS patient_email,
         dp.first_name AS doctor_first, dp.last_name AS doctor_last
  FROM appointments a
  JOIN patient_profiles pp ON pp.user_id = a.patient_id
  JOIN users            pu ON pu.id      = a.patient_id
  JOIN doctor_profiles  dp ON dp.user_id = a.doctor_id
  WHERE a.date = ? AND a.status = 'zaplanowana' AND a.reminder_sent = 0
`;

/* Główna procedura — zwraca liczbę wysłanych przypomnień. */
async function runReminders() {
  const tomorrow = ymd(1);
  const due = db.prepare(SELECT_DUE).all(tomorrow);
  const markSent = db.prepare("UPDATE appointments SET reminder_sent = 1 WHERE id = ?");

  let sent = 0;
  for (const r of due) {
    const appt = {
      date: r.date,
      time: r.time,
      service: r.service,
      serviceLabel: (SERVICES[r.service] && SERVICES[r.service].label) || "E-konsultacja",
      consultationType: r.consultation_type,
    };
    const result = await email.sendAppointmentReminder(
      appt,
      { firstName: r.patient_first, email: r.patient_email },
      { name: `dr ${r.doctor_first} ${r.doctor_last}` }
    );
    // Oznacz jako wysłane tylko, gdy realnie poszło (nie: pominięte flagą / błąd).
    if (result && result.sent) { markSent.run(r.id); sent++; }
  }
  return { date: tomorrow, candidates: due.length, sent };
}

module.exports = { runReminders };

/* Uruchomienie bezpośrednie z CLI. */
if (require.main === module) {
  require("dotenv").config();
  runReminders()
    .then((r) => { console.log(`[reminders] ${r.date}: ${r.sent}/${r.candidates} wysłano.`); process.exit(0); })
    .catch((e) => { console.error("[reminders] Błąd:", e.message); process.exit(1); });
}
