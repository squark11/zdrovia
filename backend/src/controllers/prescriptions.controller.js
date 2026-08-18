/* =============================================================
   controllers/prescriptions.controller.js
   Recepty: lista (zależna od roli) oraz wystawianie (tylko lekarz,
   powiązane z konkretną wizytą i pacjentem).
============================================================= */
"use strict";

const crypto = require("crypto");
const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");

const SELECT_PRESC = `
  SELECT p.*,
         dp.first_name AS doctor_first, dp.last_name AS doctor_last,
         dp.specialization AS doctor_spec,
         pp.first_name AS patient_first, pp.last_name AS patient_last
  FROM prescriptions p
  JOIN doctor_profiles  dp ON dp.user_id = p.doctor_id
  JOIN patient_profiles pp ON pp.user_id = p.patient_id
`;

function mapPresc(r) {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    medication: r.medication,
    dosage: r.dosage,
    notes: r.notes,
    code: r.code,
    issuedAt: r.issued_at,
    validUntil: r.valid_until,
    doctor: { id: r.doctor_id, name: `dr ${r.doctor_first} ${r.doctor_last}`, specialization: r.doctor_spec },
    patient: { id: r.patient_id, name: `${r.patient_first} ${r.patient_last}` },
  };
}

/* Generuje 12-znakowy kod e-recepty (grupy po 4). */
function generateCode() {
  const n = crypto.randomInt(0, 1_000_000_000_000).toString().padStart(12, "0");
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}

/* GET /api/prescriptions  (pacjent: swoje; lekarz: wystawione) */
function list(req, res) {
  const col = req.user.role === "doctor" ? "p.doctor_id" : "p.patient_id";
  const rows = db
    .prepare(`${SELECT_PRESC} WHERE ${col} = ? ORDER BY p.issued_at DESC`)
    .all(req.user.id);
  res.json({ prescriptions: rows.map(mapPresc) });
}

/* POST /api/prescriptions  (tylko lekarz) */
function create(req, res) {
  const { appointmentId, medication, dosage, notes, validUntil } = req.body;

  const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(appointmentId);
  if (!appt) throw new ApiError(404, "Powiązana wizyta nie istnieje");
  if (appt.doctor_id !== req.user.id) {
    throw new ApiError(403, "Możesz wystawić receptę tylko do własnej wizyty");
  }

  // Domyślny termin ważności: 30 dni, jeśli nie podano.
  const validTo =
    validUntil ||
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO prescriptions
           (appointment_id, patient_id, doctor_id, medication, dosage, notes, valid_until, code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(appt.id, appt.patient_id, req.user.id, medication, dosage || null, notes || null, validTo, generateCode());
    // Wystawienie recepty domyślnie oznacza wizytę jako zrealizowaną.
    db.prepare("UPDATE appointments SET status = 'zrealizowana' WHERE id = ?").run(appt.id);
    return info.lastInsertRowid;
  });

  const id = tx();
  const row = db.prepare(`${SELECT_PRESC} WHERE p.id = ?`).get(id);
  res.status(201).json({ prescription: mapPresc(row) });
}

module.exports = { list, create };
