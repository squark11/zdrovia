/* =============================================================
   controllers/appointments.controller.js
   Wizyty: lista (zależna od roli), umawianie (pacjent),
   zmiana statusu (anulowanie / oznaczenie zrealizowanej).
============================================================= */
"use strict";

const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");
const { isSlotBookable } = require("../services/slots.service");
const { SERVICES, priceFor } = require("../utils/services");
const email = require("../services/email.service");
const realtime = require("../services/realtime.service");

/* Wzbogacony wiersz wizyty (z danymi lekarza i pacjenta). */
const SELECT_APPT = `
  SELECT a.*,
         dp.first_name AS doctor_first, dp.last_name AS doctor_last,
         dp.specialization AS doctor_spec, dp.consultation_price AS doctor_price,
         dp.color AS doctor_color,
         pp.first_name AS patient_first, pp.last_name AS patient_last,
         pu.email AS patient_email
  FROM appointments a
  JOIN doctor_profiles  dp ON dp.user_id = a.doctor_id
  JOIN patient_profiles pp ON pp.user_id = a.patient_id
  JOIN users            pu ON pu.id      = a.patient_id
`;

function mapAppt(r) {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    status: r.status,
    consultationType: r.consultation_type,
    service: r.service || "konsultacja",
    serviceLabel: (SERVICES[r.service] && SERVICES[r.service].label) || "E-konsultacja",
    reason: r.reason,
    price: r.price,
    paid: !!r.paid,
    paymentMethod: r.payment_method,
    createdAt: r.created_at,
    doctor: {
      id: r.doctor_id,
      name: `dr ${r.doctor_first} ${r.doctor_last}`,
      specialization: r.doctor_spec,
      price: r.doctor_price,
      color: r.doctor_color,
    },
    patient: {
      id: r.patient_id,
      name: `${r.patient_first} ${r.patient_last}`,
      email: r.patient_email,
    },
  };
}

/* GET /api/appointments  (pacjent: swoje; lekarz: przypisane) */
function list(req, res) {
  const col = req.user.role === "doctor" ? "a.doctor_id" : "a.patient_id";
  const rows = db
    .prepare(`${SELECT_APPT} WHERE ${col} = ? ORDER BY a.date DESC, a.time DESC`)
    .all(req.user.id);
  res.json({ appointments: rows.map(mapAppt) });
}

/* POST /api/appointments  (tylko pacjent) */
function create(req, res) {
  const { doctorId, date, time, consultationType, service, reason, paymentMethod } = req.body;

  const doctor = db
    .prepare("SELECT user_id, consultation_price FROM doctor_profiles WHERE user_id = ?")
    .get(doctorId);
  if (!doctor) throw new ApiError(404, "Wybrany lekarz nie istnieje");

  if (!isSlotBookable(doctorId, date, time)) {
    throw new ApiError(400, "Wybrany termin jest niedostępny lub minął");
  }

  const price = priceFor(service, doctor.consultation_price);
  // Płatność symulowana: gdy podano metodę, oznaczamy jako opłacone.
  const paid = paymentMethod ? 1 : 0;

  try {
    const info = db
      .prepare(
        `INSERT INTO appointments
           (patient_id, doctor_id, date, time, consultation_type, service, reason, price, paid, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.id, doctorId, date, time, consultationType || "wideo",
           service || "konsultacja", reason || null, price, paid, paymentMethod || null);
    const row = db.prepare(`${SELECT_APPT} WHERE a.id = ?`).get(info.lastInsertRowid);
    const appt = mapAppt(row);
    res.status(201).json({ appointment: appt });

    // Real-time: powiadom lekarza o nowej wizycie w jego kalendarzu.
    realtime.emitToUser(doctorId, "appointment:new", { appointment: appt });

    // Powiadomienie e-mail (poza ścieżką odpowiedzi — nie blokuje ani nie psuje
    // rezerwacji, jeśli SMTP zawiedzie; notify() sam łapie błędy i sprawdza flagę).
    email
      .sendAppointmentConfirmation(
        appt,
        { firstName: row.patient_first, email: row.patient_email },
        { name: appt.doctor.name }
      )
      .catch(() => {});
  } catch (e) {
    // UNIQUE(doctor_id,date,time) → slot właśnie zajęty.
    if (String(e.message).includes("UNIQUE")) {
      throw new ApiError(409, "Ten termin został właśnie zarezerwowany. Wybierz inny.");
    }
    throw e;
  }
}

/* PATCH /api/appointments/:id  (pacjent anuluje, lekarz oznacza zrealizowaną) */
function update(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body;
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
  if (!appt) throw new ApiError(404, "Wizyta nie istnieje");

  const isOwnerPatient = req.user.role === "patient" && appt.patient_id === req.user.id;
  const isOwnerDoctor = req.user.role === "doctor" && appt.doctor_id === req.user.id;
  if (!isOwnerPatient && !isOwnerDoctor) throw new ApiError(403, "Brak dostępu do tej wizyty");

  // Reguły przejść statusu wg roli.
  if (status === "anulowana" && !isOwnerPatient && !isOwnerDoctor) {
    throw new ApiError(403, "Nie możesz anulować tej wizyty");
  }
  if (status === "zrealizowana" && !isOwnerDoctor) {
    throw new ApiError(403, "Tylko lekarz może oznaczyć wizytę jako zrealizowaną");
  }

  db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, id);
  const row = db.prepare(`${SELECT_APPT} WHERE a.id = ?`).get(id);
  const mapped = mapAppt(row);
  res.json({ appointment: mapped });

  // Real-time: powiadom drugą stronę (tę, która NIE wykonała zmiany).
  const other = req.user.id === mapped.patient.id ? mapped.doctor.id : mapped.patient.id;
  realtime.emitToUser(other, "appointment:updated", { appointment: mapped });
}

module.exports = { list, create, update };
