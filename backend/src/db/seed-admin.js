/* =============================================================
   db/seed-admin.js
   Tworzy JEDNO konto administratora z danych w .env
   (ADMIN_EMAIL, ADMIN_PASSWORD). Konta admina NIE powstają przez
   publiczny formularz rejestracji. Idempotentny — można uruchamiać
   wielokrotnie (aktualizuje hasło/rolę istniejącego konta).
   Uruchomienie: npm run seed:admin
============================================================= */
"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./index");

const email = (process.env.ADMIN_EMAIL || "admin@zdrovia.pl").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "Admin123!";
const hash = bcrypt.hashSync(password, 10);

const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', is_suspended = 0 WHERE id = ?")
    .run(hash, existing.id);
  console.log(`\n  ✓ Konto administratora zaktualizowane: ${email}\n`);
} else {
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(email, hash);
  console.log(`\n  ✓ Konto administratora utworzone: ${email} / ${password}\n`);
}
