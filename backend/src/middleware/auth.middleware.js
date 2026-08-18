/* =============================================================
   middleware/auth.middleware.js
   - requireAuth: weryfikuje JWT (z httpOnly cookie lub nagłówka
     Authorization: Bearer <token>) i ustawia req.user.
   - requireRole: sprawdza, czy zalogowany użytkownik ma daną rolę.
   - optionalAuth: ustawia req.user jeśli token jest, ale nie wymaga.
============================================================= */
"use strict";

const { verifyToken, COOKIE_NAME } = require("../utils/jwt");
const { ApiError } = require("./error.middleware");

/* Wyciąga token z ciasteczka lub nagłówka Authorization. */
function extractToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(new ApiError(401, "Wymagane zalogowanie"));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (_e) {
    next(new ApiError(401, "Sesja wygasła lub token jest nieprawidłowy"));
  }
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub, role: payload.role, email: payload.email };
    } catch (_e) {
      /* zignoruj — traktujemy jak gościa */
    }
  }
  next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Wymagane zalogowanie"));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Brak uprawnień do tej operacji"));
    }
    next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole };
