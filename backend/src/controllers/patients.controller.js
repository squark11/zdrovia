/* =============================================================
   controllers/patients.controller.js
   Odczyt i edycja własnego profilu pacjenta.
============================================================= */
"use strict";

const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");

function profileOf(userId) {
  const row = db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    birthDate: row.birth_date,
  };
}

/* GET /api/patients/me */
function getMe(req, res) {
  const profile = profileOf(req.user.id);
  if (!profile) throw new ApiError(404, "Profil pacjenta nie istnieje");
  res.json({ patient: { email: req.user.email, ...profile } });
}

/* PATCH /api/patients/me */
function updateMe(req, res) {
  const b = req.body;
  const map = {
    first_name: b.firstName,
    last_name: b.lastName,
    phone: b.phone,
    birth_date: b.birthDate,
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
    params.push(req.user.id);
    db.prepare(`UPDATE patient_profiles SET ${sets.join(", ")} WHERE user_id = ?`).run(...params);
  }
  res.json({ patient: { email: req.user.email, ...profileOf(req.user.id) } });
}

module.exports = { getMe, updateMe };
