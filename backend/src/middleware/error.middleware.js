/* =============================================================
   middleware/error.middleware.js
   Spójny format błędów API: { error: { message, details? } }.
   ApiError — klasa do rzucania błędów ze statusem HTTP.
============================================================= */
"use strict";

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/* Opakowanie handlerów async — przekazuje odrzucone Promisy do Express. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* 404 dla nieznanych tras API. */
function notFound(req, res, next) {
  next(new ApiError(404, `Nie znaleziono zasobu: ${req.method} ${req.originalUrl}`));
}

/* Centralny handler błędów. */
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const payload = { error: { message: err.message || "Błąd serwera" } };
  if (err.details) payload.error.details = err.details;

  if (status >= 500) {
    // Loguj tylko błędy serwera (nie zaśmiecaj logów walidacją 4xx).
    console.error("[API ERROR]", err);
  }
  res.status(status).json(payload);
}

module.exports = { ApiError, asyncHandler, notFound, errorHandler };
