/* =============================================================
   controllers/doctors.controller.js
   Lista lekarzy (publiczna, z filtrem), szczegóły, edycja własnego
   profilu, odczyt i zapis dostępności, wolne sloty.
============================================================= */
"use strict";

const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");
const { publicDoctor } = require("../utils/mappers");
const { generateSlots } = require("../services/slots.service");

function getDoctorRow(id) {
  return db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(id);
}

/* GET /api/doctors?specialization=&search= */
function list(req, res) {
  const { specialization, search } = req.query;
  let sql = "SELECT * FROM doctor_profiles";
  // Publicznie widoczni tylko lekarze zatwierdzeni przez admina i nie zawieszeni.
  const where = [
    "verification_status = 'approved'",
    "user_id NOT IN (SELECT id FROM users WHERE is_suspended = 1)",
  ];
  const params = [];

  if (specialization && specialization !== "all") {
    where.push("specialization = ?");
    params.push(specialization);
  }
  if (search) {
    where.push("(first_name LIKE ? OR last_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY avg_rating DESC, reviews_count DESC";

  const rows = db.prepare(sql).all(...params);
  const doctors = rows.map((row) => {
    const doc = publicDoctor(row);
    const next = generateSlots(row.user_id, 14, 1)[0] || null; // najbliższy wolny termin
    doc.nextAvailable = next;
    return doc;
  });

  res.json({ doctors, total: doctors.length });
}

/* GET /api/doctors/:id */
function getOne(req, res) {
  const row = getDoctorRow(Number(req.params.id));
  if (!row) throw new ApiError(404, "Lekarz nie znaleziony");

  const doctor = publicDoctor(row);
  doctor.availability = db
    .prepare("SELECT weekday, start_time AS startTime, end_time AS endTime FROM availability WHERE doctor_id = ? ORDER BY weekday, start_time")
    .all(row.user_id);
  doctor.upcomingSlots = generateSlots(row.user_id, 14, 12);
  res.json({ doctor });
}

/* PATCH /api/doctors/:id  (tylko właściciel) */
function update(req, res) {
  const id = Number(req.params.id);
  if (req.user.id !== id) throw new ApiError(403, "Możesz edytować tylko własny profil");
  const row = getDoctorRow(id);
  if (!row) throw new ApiError(404, "Profil lekarza nie istnieje");

  const b = req.body;
  const map = {
    bio: b.bio,
    consultation_price: b.consultationPrice,
    years_experience: b.yearsExperience,
    city: b.city,
    specialization: b.specialization,
  };
  const sets = [];
  const params = [];
  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (sets.length) {
    params.push(id);
    db.prepare(`UPDATE doctor_profiles SET ${sets.join(", ")} WHERE user_id = ?`).run(...params);
  }
  res.json({ doctor: publicDoctor(getDoctorRow(id)) });
}

/* GET /api/doctors/:id/availability  → okna + wygenerowane wolne sloty */
function getAvailability(req, res) {
  const id = Number(req.params.id);
  if (!getDoctorRow(id)) throw new ApiError(404, "Lekarz nie znaleziony");

  const windows = db
    .prepare("SELECT weekday, start_time AS startTime, end_time AS endTime FROM availability WHERE doctor_id = ? ORDER BY weekday, start_time")
    .all(id);
  const slots = generateSlots(id, 14, 40);
  res.json({ windows, slots });
}

/* PATCH /api/doctors/:id/availability  (tylko właściciel) — zastępuje okna */
function setAvailability(req, res) {
  const id = Number(req.params.id);
  if (req.user.id !== id) throw new ApiError(403, "Możesz edytować tylko własną dostępność");
  if (!getDoctorRow(id)) throw new ApiError(404, "Profil lekarza nie istnieje");

  const tx = db.transaction((slots) => {
    db.prepare("DELETE FROM availability WHERE doctor_id = ?").run(id);
    const insert = db.prepare(
      "INSERT INTO availability (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)"
    );
    for (const s of slots) {
      if (s.startTime >= s.endTime) continue; // pomiń błędne okna
      insert.run(id, s.weekday, s.startTime, s.endTime);
    }
  });
  tx(req.body.slots);

  const windows = db
    .prepare("SELECT weekday, start_time AS startTime, end_time AS endTime FROM availability WHERE doctor_id = ? ORDER BY weekday, start_time")
    .all(id);
  res.json({ windows });
}

module.exports = { list, getOne, update, getAvailability, setAvailability };
