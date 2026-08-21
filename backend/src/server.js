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

// Klucz szyfrowania sekretów jest WYMAGANY — bez niego nie startujemy
// (żeby nie działać cicho bez szyfrowania konfiguracji SMTP/n8n).
const encryption = require("./services/encryption.service");
if (!encryption.isConfigured()) {
  console.error("\n[FATAL] Brak lub nieprawidłowy ENCRYPTION_KEY (wymagane 64 znaki hex = 32 bajty).");
  console.error('        Wygeneruj: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error("        Ustaw ENCRYPTION_KEY w backend/.env i uruchom ponownie.\n");
  process.exit(1);
}

// Inicjalizacja bazy (utworzenie schematu przy pierwszym imporcie) + seed ustawień.
require("./db");
require("./services/settings.service").seedDefaults();

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

// Publiczna konfiguracja dla frontendu — WYŁĄCZNIE nie-sekretne flagi
// i nazwa aplikacji (nigdy dane SMTP/n8n). Używane przez real-time i dark mode.
app.get("/api/config", (_req, res) => {
  const s = require("./services/settings.service");
  res.json({
    appName: s.get("app_name") || "Zdrovia",
    features: {
      realtime: s.getBool("enable_realtime"),
      darkModeDefault: s.getBool("enable_dark_mode_default"),
    },
  });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/doctors", require("./routes/doctors.routes"));
app.use("/api/patients", require("./routes/patients.routes"));
app.use("/api/appointments", require("./routes/appointments.routes"));
app.use("/api/prescriptions", require("./routes/prescriptions.routes"));
app.use("/api/triage", require("./routes/triage.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

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

/* ---------- Serwer HTTP + Socket.io (real-time) ----------
   Aktualizacje na żywo: nowe wizyty, zmiany statusu, nowe recepty.
   Autoryzacja socketa przez JWT (z handshake.auth.token lub cookie),
   każdy klient dołącza do prywatnego pokoju `user:<id>`. */
const http = require("http");
const { Server } = require("socket.io");
const { verifyToken, COOKIE_NAME } = require("./utils/jwt");
const realtime = require("./services/realtime.service");

const https = require("https");
const fs = require("fs");

/* Wczytuje materiał TLS ze zmiennych środowiskowych.
   Obsługiwane są dwa formaty:
   - PFX/PKCS#12 (SSL_PFX_FILE + SSL_PFX_PASSPHRASE) — naturalny na Windows,
     bo taki plik wyeksportujesz wprost z magazynu certyfikatów systemu,
   - para PEM (SSL_CERT_FILE + SSL_KEY_FILE).
   Zwraca null, gdy nic nie skonfigurowano → serwer wstaje po HTTP.
   Błąd odczytu przerywa start: cichy fallback na HTTP wystawiłby tokeny
   i dane medyczne nieszyfrowanym łączem. */
function loadTlsOptions() {
  const pfx = process.env.SSL_PFX_FILE;
  const cert = process.env.SSL_CERT_FILE;
  const key = process.env.SSL_KEY_FILE;

  try {
    if (pfx) {
      return { pfx: fs.readFileSync(pfx), passphrase: process.env.SSL_PFX_PASSPHRASE || undefined };
    }
    if (cert && key) {
      return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
    }
  } catch (e) {
    console.error("");
    console.error(`[FATAL] Nie udało się wczytać certyfikatu TLS: ${e.message}`);
    console.error("        Sprawdź SSL_PFX_FILE / SSL_CERT_FILE / SSL_KEY_FILE w backend/.env.");
    console.error("");
    process.exit(1);
  }

  if (cert || key) {
    console.error("");
    console.error("[FATAL] Podano tylko jedną z SSL_CERT_FILE / SSL_KEY_FILE — potrzebne obie.");
    console.error("");
    process.exit(1);
  }
  return null;
}

const tls = loadTlsOptions();
const server = tls ? https.createServer(tls, app) : http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

// Uwierzytelnienie połączenia — bez ważnego tokenu odrzucamy handshake.
io.use((socket, next) => {
  try {
    let token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      const raw = socket.handshake.headers.cookie || "";
      const m = raw.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]+)"));
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) return next(new Error("unauthorized"));
    const p = verifyToken(token);
    socket.userId = p.sub;
    socket.userRole = p.role;
    next();
  } catch (_e) {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  // Prywatny pokój użytkownika — emisje kierujemy po id.
  socket.join(`user:${socket.userId}`);
});

realtime.init(io);

// HOST: domyślnie 0.0.0.0 (wszystkie interfejsy). Ustaw 127.0.0.1, jeśli serwer
// ma być widoczny wyłącznie lokalnie (np. gdy stoi za odwrotnym proxy).
const HOST = process.env.HOST || "0.0.0.0";
const scheme = tls ? "https" : "http";
// Adres publiczny — przy HTTPS musi to być nazwa widniejąca w certyfikacie,
// a nie localhost ani gołe IP, inaczej przeglądarka odrzuci połączenie.
const publicUrl = String(process.env.PUBLIC_APP_URL || `${scheme}://localhost:${PORT}`)
  .replace(new RegExp("/+$"), "");

server.listen(PORT, HOST, () => {
  console.log("");
  console.log(`  Zdrovia API + frontend → ${publicUrl}`);
  console.log(`  Nasłuch:  ${HOST}:${PORT}  (${tls ? "HTTPS" : "HTTP"})`);
  console.log(`  Health:   ${publicUrl}/api/health`);
  console.log(`  Real-time (Socket.io): aktywne`);
  console.log(`  CORS origins: ${allowedOrigins.join(", ") || "(brak)"}`);
  console.log("");
  if (!tls) {
    console.log("  [uwaga] Brak TLS. Frontend serwowany po HTTPS (np. GitHub Pages) nie");
    console.log("          połączy się z tym API — przeglądarka zablokuje mixed content.");
    console.log("");
  }
});

/* ---------- Przypomnienia o wizytach (cron godzinowy) ----------
   Co godzinę sprawdzamy wizyty na jutro i wysyłamy przypomnienia
   (idempotentnie — patrz appointments.reminder_sent). Wysyłka
   respektuje flagę enable_email_notifications i nie przerywa serwera. */
const cron = require("node-cron");
const { runReminders } = require("./scripts/checkReminders");
cron.schedule("0 * * * *", () => {
  runReminders()
    .then((r) => { if (r.sent) console.log(`[reminders] wysłano ${r.sent} przypomnień na ${r.date}`); })
    .catch((e) => console.error("[reminders] błąd:", e.message));
});

module.exports = app;
