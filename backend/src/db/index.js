/* =============================================================
   db/index.js
   Połączenie z bazą SQLite (better-sqlite3) + inicjalizacja schematu.
   better-sqlite3 działa synchronicznie — prosto i szybko dla API
   o umiarkowanym ruchu, bez zewnętrznej infrastruktury.
============================================================= */
"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Ścieżka do pliku bazy (z .env; domyślnie ./data/zdrovia.db).
const dbUrl = process.env.DATABASE_URL || "./data/zdrovia.db";
const dbPath = path.isAbsolute(dbUrl)
  ? dbUrl
  : path.join(__dirname, "..", "..", dbUrl);

// Utwórz katalog na bazę, jeśli nie istnieje.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Pragmy: WAL (lepsza współbieżność) + egzekwowanie kluczy obcych.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* -------------------------------------------------------------
   Schemat — tworzony idempotentnie przy starcie.
------------------------------------------------------------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('patient','doctor')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patient_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    phone       TEXT,
    birth_date  TEXT
  );

  CREATE TABLE IF NOT EXISTS doctor_profiles (
    user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name         TEXT NOT NULL,
    last_name          TEXT NOT NULL,
    specialization     TEXT NOT NULL,
    pwz_number         TEXT,
    bio                TEXT,
    years_experience   INTEGER DEFAULT 0,
    consultation_price INTEGER DEFAULT 0,
    avg_rating         REAL DEFAULT 5.0,
    reviews_count      INTEGER DEFAULT 0,
    city               TEXT,
    languages          TEXT,          -- JSON: ["polski","angielski"]
    color              TEXT DEFAULT '#0E9F8E'
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date              TEXT NOT NULL,        -- YYYY-MM-DD
    time              TEXT NOT NULL,        -- HH:MM
    status            TEXT NOT NULL DEFAULT 'zaplanowana'
                        CHECK (status IN ('zaplanowana','zrealizowana','anulowana')),
    consultation_type TEXT DEFAULT 'wideo', -- wideo | czat | telefon
    service           TEXT DEFAULT 'konsultacja', -- rodzaj usługi (recepta/zwolnienie/…)
    reason            TEXT,                 -- powód / objawy
    price             INTEGER,              -- cena usługi w zł
    paid              INTEGER DEFAULT 0,    -- 0/1 (płatność symulowana)
    payment_method    TEXT,                 -- blik | karta | przelew
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (doctor_id, date, time)          -- jeden lekarz = jeden slot na termin
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medication     TEXT NOT NULL,
    dosage         TEXT,
    notes          TEXT,
    issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
    valid_until    TEXT,
    code           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS availability (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday    INTEGER NOT NULL,           -- 0 = niedziela ... 6 = sobota
    start_time TEXT NOT NULL,              -- HH:MM
    end_time   TEXT NOT NULL               -- HH:MM
  );

  CREATE TABLE IF NOT EXISTS triage_conversations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id          INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = rozmowa przed rejestracją
    session_id          TEXT NOT NULL UNIQUE,
    messages            TEXT NOT NULL DEFAULT '[]',  -- JSON: [{role, content, timestamp}]
    suggested_specialty TEXT,                        -- SUGESTIA, nie diagnoza (świadomie taka nazwa)
    is_urgent           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
  CREATE INDEX IF NOT EXISTS idx_appt_doctor  ON appointments(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_presc_patient ON prescriptions(patient_id);
  CREATE INDEX IF NOT EXISTS idx_presc_doctor  ON prescriptions(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_avail_doctor  ON availability(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_triage_session ON triage_conversations(session_id);
`);

/* -------------------------------------------------------------
   Lekka migracja: dodaj brakujące kolumny w istniejących bazach
   (SQLite: ALTER TABLE ADD COLUMN). Idempotentne.
------------------------------------------------------------- */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn("appointments", "service", "TEXT DEFAULT 'konsultacja'");
ensureColumn("appointments", "reason", "TEXT");
ensureColumn("appointments", "price", "INTEGER");
ensureColumn("appointments", "paid", "INTEGER DEFAULT 0");
ensureColumn("appointments", "payment_method", "TEXT");

module.exports = db;
