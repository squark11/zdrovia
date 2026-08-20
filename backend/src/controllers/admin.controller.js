/* =============================================================
   controllers/admin.controller.js
   Panel administratora. Wszystkie trasy chronione requireRole('admin').
   Wizyty/recepty są tylko do WGLĄDU (dane medyczne) — brak edycji.
============================================================= */
"use strict";

const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");
const { publicDoctor } = require("../utils/mappers");

/* ---------- Weryfikacja lekarzy ---------- */

// GET /api/admin/doctors/pending?status=pending|approved|rejected
function pendingDoctors(req, res) {
  const status = ["pending", "approved", "rejected"].includes(req.query.status)
    ? req.query.status
    : "pending";
  const rows = db
    .prepare(
      `SELECT dp.*, u.email, u.created_at, u.is_suspended
       FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
       WHERE dp.verification_status = ?
       ORDER BY u.created_at DESC`
    )
    .all(status);
  const doctors = rows.map((r) => ({
    id: r.user_id,
    name: `dr ${r.first_name} ${r.last_name}`,
    email: r.email,
    specialization: r.specialization,
    pwzNumber: r.pwz_number,
    bio: r.bio,
    yearsExperience: r.years_experience,
    consultationPrice: r.consultation_price,
    city: r.city,
    verificationStatus: r.verification_status,
    verificationReason: r.verification_reason,
    createdAt: r.created_at,
    color: r.color,
  }));
  res.json({ doctors });
}

// PATCH /api/admin/doctors/:id/verify  { status, reason? }
function verifyDoctor(req, res) {
  const id = Number(req.params.id);
  const { status, reason } = req.body;
  const doc = db.prepare("SELECT user_id FROM doctor_profiles WHERE user_id = ?").get(id);
  if (!doc) throw new ApiError(404, "Lekarz nie istnieje");

  db.prepare("UPDATE doctor_profiles SET verification_status = ?, verification_reason = ? WHERE user_id = ?")
    .run(status, status === "rejected" ? reason || null : null, id);

  // Brak systemu e-mail → zapisujemy powiadomienie w logu (placeholder).
  console.log(`[ADMIN] Lekarz #${id} → ${status}${reason ? " (powód: " + reason + ")" : ""}`);

  res.json({ ok: true, id, status });
}

/* ---------- Użytkownicy ---------- */

// GET /api/admin/users?role=&search=&page=&pageSize=
function listUsers(req, res) {
  const role = ["patient", "doctor", "admin"].includes(req.query.role) ? req.query.role : null;
  const search = (req.query.search || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(req.query.pageSize, 10) || 10));

  const where = [];
  const params = [];
  if (role) { where.push("u.role = ?"); params.push(role); }
  if (search) {
    where.push("(u.email LIKE ? OR COALESCE(pp.first_name, dp.first_name) LIKE ? OR COALESCE(pp.last_name, dp.last_name) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const base = `
    FROM users u
    LEFT JOIN patient_profiles pp ON pp.user_id = u.id
    LEFT JOIN doctor_profiles  dp ON dp.user_id = u.id
    ${whereSql}`;

  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.is_suspended, u.created_at,
              COALESCE(pp.first_name, dp.first_name) AS first_name,
              COALESCE(pp.last_name, dp.last_name)  AS last_name,
              dp.specialization AS specialization,
              dp.verification_status AS verification_status
       ${base}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  const users = rows.map(mapUserRow);
  res.json({ users, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
}

function mapUserRow(r) {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    name: r.first_name ? `${r.first_name} ${r.last_name}` : r.email,
    isSuspended: !!r.is_suspended,
    specialization: r.specialization || null,
    verificationStatus: r.verification_status || null,
    createdAt: r.created_at,
  };
}

// PATCH /api/admin/users/:id/status  { suspended: bool }
function userStatus(req, res) {
  const id = Number(req.params.id);
  const { suspended } = req.body;
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!user) throw new ApiError(404, "Użytkownik nie istnieje");
  if (user.role === "admin") throw new ApiError(403, "Nie można zawiesić konta administratora");
  if (id === req.user.id) throw new ApiError(403, "Nie możesz zmienić statusu własnego konta");

  db.prepare("UPDATE users SET is_suspended = ? WHERE id = ?").run(suspended ? 1 : 0, id);
  res.json({ ok: true, id, isSuspended: !!suspended });
}

// GET /api/admin/users/:id  (szczegóły + aktywność)
function userDetails(req, res) {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT id, email, role, is_suspended, created_at FROM users WHERE id = ?").get(id);
  if (!user) throw new ApiError(404, "Użytkownik nie istnieje");

  const out = {
    id: user.id, email: user.email, role: user.role,
    isSuspended: !!user.is_suspended, createdAt: user.created_at,
  };

  if (user.role === "patient") {
    const p = db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(id);
    out.profile = p ? { firstName: p.first_name, lastName: p.last_name, phone: p.phone, birthDate: p.birth_date } : null;
    const appts = db.prepare("SELECT status FROM appointments WHERE patient_id = ?").all(id);
    out.activity = {
      appointments: appts.length,
      realized: appts.filter((a) => a.status === "zrealizowana").length,
      cancelled: appts.filter((a) => a.status === "anulowana").length,
      prescriptions: db.prepare("SELECT COUNT(*) AS n FROM prescriptions WHERE patient_id = ?").get(id).n,
    };
  } else if (user.role === "doctor") {
    const d = db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(id);
    out.profile = d ? publicDoctor(d) : null;
    const appts = db.prepare("SELECT status FROM appointments WHERE doctor_id = ?").all(id);
    out.activity = {
      appointments: appts.length,
      realized: appts.filter((a) => a.status === "zrealizowana").length,
      cancelled: appts.filter((a) => a.status === "anulowana").length,
      patients: db.prepare("SELECT COUNT(DISTINCT patient_id) AS n FROM appointments WHERE doctor_id = ?").get(id).n,
      prescriptions: db.prepare("SELECT COUNT(*) AS n FROM prescriptions WHERE doctor_id = ?").get(id).n,
    };
  }
  res.json({ user: out });
}

/* ---------- Wgląd: wizyty i recepty (bez edycji) ---------- */

// GET /api/admin/appointments?status=&date=&doctorId=
function appointments(req, res) {
  const where = [];
  const params = [];
  if (["zaplanowana", "zrealizowana", "anulowana"].includes(req.query.status)) { where.push("a.status = ?"); params.push(req.query.status); }
  if (req.query.date) { where.push("a.date = ?"); params.push(req.query.date); }
  if (req.query.doctorId) { where.push("a.doctor_id = ?"); params.push(Number(req.query.doctorId)); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = db.prepare(
    `SELECT a.id, a.date, a.time, a.status, a.service, a.consultation_type, a.price, a.paid,
            dp.first_name AS df, dp.last_name AS dl, dp.specialization AS spec,
            pp.first_name AS pf, pp.last_name AS pl
     FROM appointments a
     JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
     JOIN patient_profiles pp ON pp.user_id = a.patient_id
     ${whereSql}
     ORDER BY a.date DESC, a.time DESC
     LIMIT 300`
  ).all(...params);
  res.json({
    appointments: rows.map((r) => ({
      id: r.id, date: r.date, time: r.time, status: r.status,
      service: r.service, consultationType: r.consultation_type, price: r.price, paid: !!r.paid,
      doctor: `dr ${r.df} ${r.dl}`, specialization: r.spec, patient: `${r.pf} ${r.pl}`,
    })),
  });
}

// GET /api/admin/prescriptions?doctorId=&date=&search=
function prescriptions(req, res) {
  const where = [];
  const params = [];
  if (req.query.doctorId) { where.push("p.doctor_id = ?"); params.push(Number(req.query.doctorId)); }
  if (req.query.date) { where.push("date(p.issued_at) = ?"); params.push(req.query.date); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = db.prepare(
    `SELECT p.id, p.medication, p.dosage, p.code, p.issued_at, p.valid_until,
            dp.first_name AS df, dp.last_name AS dl,
            pp.first_name AS pf, pp.last_name AS pl
     FROM prescriptions p
     JOIN doctor_profiles dp ON dp.user_id = p.doctor_id
     JOIN patient_profiles pp ON pp.user_id = p.patient_id
     ${whereSql}
     ORDER BY p.issued_at DESC
     LIMIT 300`
  ).all(...params);
  res.json({
    prescriptions: rows.map((r) => ({
      id: r.id, medication: r.medication, dosage: r.dosage, code: r.code,
      issuedAt: r.issued_at, validUntil: r.valid_until,
      doctor: `dr ${r.df} ${r.dl}`, patient: `${r.pf} ${r.pl}`,
    })),
  });
}

/* ---------- Statystyki platformy ---------- */

// GET /api/admin/stats
function stats(req, res) {
  const usersByRole = {};
  db.prepare("SELECT role, COUNT(*) AS n FROM users GROUP BY role").all().forEach((r) => (usersByRole[r.role] = r.n));

  const doctorsByStatus = { pending: 0, approved: 0, rejected: 0 };
  db.prepare("SELECT verification_status AS s, COUNT(*) AS n FROM doctor_profiles GROUP BY verification_status")
    .all().forEach((r) => (doctorsByStatus[r.s] = r.n));

  // Wizyty w ostatnich 30 dniach (per dzień).
  const rows = db.prepare("SELECT date, status FROM appointments").all();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, count: 0 });
  }
  const dayIndex = {};
  days.forEach((d, i) => (dayIndex[d.date] = i));
  let total = 0, cancelled = 0;
  const specialtyCounts = {};
  rows.forEach((r) => {
    total++;
    if (r.status === "anulowana") cancelled++;
    if (dayIndex[r.date] != null && r.status !== "anulowana") days[dayIndex[r.date]].count++;
  });

  // Popularność specjalizacji (wg liczby wizyt).
  db.prepare(
    `SELECT dp.specialization AS spec, COUNT(*) AS n
     FROM appointments a JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
     GROUP BY dp.specialization ORDER BY n DESC`
  ).all().forEach((r) => (specialtyCounts[r.spec] = r.n));

  const todayStr = days[days.length - 1].date;
  const appointmentsToday = rows.filter((r) => r.date === todayStr && r.status !== "anulowana").length;

  res.json({
    usersByRole,
    doctorsByStatus,
    appointmentsToday,
    visitsByDay: days,
    specialtyPopularity: specialtyCounts,
    cancellationRate: total ? Math.round((cancelled / total) * 100) : 0,
    totals: { users: Object.values(usersByRole).reduce((a, b) => a + b, 0), appointments: total },
  });
}

module.exports = {
  pendingDoctors, verifyDoctor,
  listUsers, userStatus, userDetails,
  appointments, prescriptions, stats,
};
