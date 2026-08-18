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

/* Opcje ciasteczka httpOnly z tokenem. */
function cookieOptions() {
  return {
    httpOnly: true,                         // niedostępne dla JS → ochrona przed XSS
    sameSite: "lax",                        // ochrona przed CSRF dla żądań cross-site
    secure: process.env.NODE_ENV === "production", // tylko HTTPS w produkcji
    maxAge: 2 * 60 * 60 * 1000,             // 2h (spójne z JWT_EXPIRES_IN)
    path: "/",
  };
}

module.exports = { signToken, verifyToken, cookieOptions, COOKIE_NAME };
