/* =============================================================
   utils/jwt.js
   Podpisywanie i weryfikacja access tokenów JWT.
============================================================= */
"use strict";

const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

// Nazwa ciasteczka z tokenem.
const COOKIE_NAME = "zdrovia_token";

/* Tworzy token dla użytkownika (payload: id + rola). */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

/* Weryfikuje token; rzuca wyjątek, gdy nieprawidłowy/wygasły. */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

/* Opcje ciasteczka httpOnly z tokenem.

   SameSite steruje tym, czy ciasteczko poleci przy żądaniu cross-site:
   - "lax" (domyślnie, ZALECANE) — ciasteczko działa, gdy backend serwuje
     też frontend (ten sam origin). Przy froncie na osobnym hoście
     (GitHub Pages) przeglądarka go nie wyśle i uwierzytelnienie opiera się
     na nagłówku `Authorization: Bearer` — tak jak opisuje README.
   - "none" — ciasteczko leci również cross-site, ale WYMAGA HTTPS i znosi
     wbudowaną ochronę przed CSRF. Ustawiaj tylko świadomie, razem
     z osobnym zabezpieczeniem CSRF.

   Flagę Secure wymuszamy zawsze, gdy serwer stoi na HTTPS, jest w trybie
   produkcyjnym albo gdy SameSite=None (przeglądarki odrzucają takie
   ciasteczko bez Secure). */
function cookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const isHttps = Boolean(process.env.SSL_PFX_FILE || process.env.SSL_CERT_FILE);
  return {
    httpOnly: true,                         // niedostępne dla JS → ochrona przed XSS
    sameSite,
    secure: sameSite === "none" || isHttps || process.env.NODE_ENV === "production",
    maxAge: 2 * 60 * 60 * 1000,             // 2h (spójne z JWT_EXPIRES_IN)
    path: "/",
  };
}

module.exports = { signToken, verifyToken, cookieOptions, COOKIE_NAME };
