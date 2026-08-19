/* =============================================================
   controllers/auth.controller.js
   Rejestracja, logowanie, wylogowanie, dane zalogowanego usera.
   Token JWT wydawany w httpOnly cookie ORAZ zwracany w body
   (żeby front mógł wybrać httpOnly cookie lub localStorage — patrz README).
============================================================= */
"use strict";

const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, cookieOptions, COOKIE_NAME } = require("../utils/jwt");
const { ApiError } = require("../middleware/error.middleware");
const { meUser } = require("../utils/mappers");

const PALETTE = ["#0E9F8E", "#0B7A6D", "#F0913E", "#2E9E7B", "#E8734A", "#5AA9C4",
                 "#7C6BD6", "#D4649A", "#C4553F", "#3E8FA8"];

function getUserById(id) {
  return db.prepare("SELECT id, email, role, created_at FROM users WHERE id = ?").get(id);
}
function getProfile(userId, role) {
  const table = role === "doctor" ? "doctor_profiles" : "patient_profiles";
  return db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).get(userId);
}

/* Wydaje token, ustawia cookie, zwraca użytkownika. */
function issueSession(res, user, status = 200) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  const profile = getProfile(user.id, user.role);
  res.status(status).json({ token, user: meUser(user, profile) });
}

/* POST /api/auth/register */
function register(req, res) {
  const b = req.body;
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(b.email.toLowerCase());
  if (exists) throw new ApiError(409, "Ten adres e-mail jest już zajęty", { email: "E-mail już zajęty" });

  const passwordHash = bcrypt.hashSync(b.password, 10);

  // Transakcja: użytkownik + profil zależny od roli.
  const createUser = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)")
      .run(b.email.toLowerCase(), passwordHash, b.role);
    const userId = info.lastInsertRowid;

    if (b.role === "doctor") {
      const color = PALETTE[userId % PALETTE.length];
      db.prepare(
        `INSERT INTO doctor_profiles
           (user_id, first_name, last_name, specialization, pwz_number, bio,
            years_experience, consultation_price, avg_rating, reviews_count, city, languages, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?)`
      ).run(
        userId, b.firstName, b.lastName, b.specialization, b.pwzNumber,
        b.bio || "", b.yearsExperience || 0, b.consultationPrice || 99,
        b.city || "", JSON.stringify(["polski"]), color
      );
    } else {
      db.prepare(
        `INSERT INTO patient_profiles (user_id, first_name, last_name, phone, birth_date)
         VALUES (?, ?, ?, ?, ?)`
      ).run(userId, b.firstName, b.lastName, b.phone || null, b.birthDate || null);
    }
    return userId;
  });

  const userId = createUser();
  issueSession(res, getUserById(userId), 201);
}

/* POST /api/auth/login */
function login(req, res) {
  const { email, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new ApiError(401, "Nieprawidłowy e-mail lub hasło");
  }
  issueSession(res, { id: row.id, email: row.email, role: row.role, created_at: row.created_at });
}

/* POST /api/auth/logout */
function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
}

/* POST /api/auth/change-password  (zalogowany) */
function changePassword(req, res) {
  const { oldPassword, newPassword } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row) throw new ApiError(404, "Użytkownik nie istnieje");
  if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
    throw new ApiError(400, "Obecne hasło jest nieprawidłowe", { oldPassword: "Nieprawidłowe hasło" });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ ok: true });
}

/* GET /api/auth/me */
function me(req, res) {
  const user = getUserById(req.user.id);
  if (!user) throw new ApiError(404, "Użytkownik nie istnieje");
  const profile = getProfile(user.id, user.role);
  res.json({ user: meUser(user, profile) });
}

module.exports = { register, login, logout, me, changePassword };
