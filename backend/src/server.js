/* =============================================================
   server.js — punkt wejścia backendu Zdrovia.
   Montuje API pod /api, konfiguruje CORS (z obsługą cookies),
   serwuje statyczny frontend z tego samego origin (wygodne
   uruchomienie: jeden adres http://localhost:PORT), obsługuje błędy.
============================================================= */
"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { notFound, errorHandler } = require("./middleware/error.middleware");

// Inicjalizacja bazy (utworzenie schematu przy pierwszym imporcie).
require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

/* ---------- Parsery i CORS ---------- */
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Brak origin = żądanie same-origin / narzędzia (curl) → dozwolone.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true, // pozwól przesyłać ciasteczka (httpOnly token)
  })
);

/* ---------- API ---------- */
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/doctors", require("./routes/doctors.routes"));
app.use("/api/patients", require("./routes/patients.routes"));
app.use("/api/appointments", require("./routes/appointments.routes"));
app.use("/api/prescriptions", require("./routes/prescriptions.routes"));
app.use("/api/triage", require("./routes/triage.routes"));

// Lokalna atrapa n8n (tylko do testów; w produkcji N8N_WEBHOOK_URL wskazuje realny n8n).
app.post("/api/_mock-n8n", require("./mock/triage-mock").mockTriage);

// 404 dla nieznanych tras /api (zanim wejdzie statyka).
app.use("/api", notFound);

/* ---------- Statyczny frontend (ten sam origin) ---------- */
// Katalog frontendu = katalog nadrzędny względem /backend.
const FRONTEND_DIR = path.join(__dirname, "..", "..");

// Bezpieczeństwo: nie udostępniaj katalogu backendu (kod, .env, baza).
app.use((req, res, next) => {
  if (req.path.startsWith("/backend")) return res.status(404).send("Not found");
  next();
});
app.use(
  express.static(FRONTEND_DIR, {
    extensions: ["html"],
    // Tryb dev: wymuś rewalidację (świeży JS/CSS/HTML po zmianach).
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    },
  })
);

/* ---------- Obsługa błędów ---------- */
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Zdrovia API + frontend → http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  CORS origins: ${allowedOrigins.join(", ") || "(brak)"}\n`);
});

module.exports = app;
