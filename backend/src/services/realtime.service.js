/* =============================================================
   services/realtime.service.js
   Cienka warstwa nad Socket.io. Przechowuje instancję `io` i pozwala
   kontrolerom emitować zdarzenia do konkretnego użytkownika (pokój
   `user:<id>`), bez importowania Socket.io w kontrolerach.

   - Emisja respektuje flagę enable_realtime (gdy wyłączona → cisza).
   - emitToUser nigdy nie rzuca — real-time to dodatek, nie może psuć
     głównej operacji (rezerwacji, recepty).
============================================================= */
"use strict";

const settings = require("./settings.service");

let io = null;

/** Podpięcie instancji Socket.io (wywoływane raz w server.js). */
function init(server) {
  io = server;
}

/** Emisja zdarzenia do wszystkich sesji danego użytkownika. */
function emitToUser(userId, event, payload) {
  try {
    if (!io || userId == null) return;
    if (!settings.getBool("enable_realtime")) return;
    io.to(`user:${userId}`).emit(event, payload);
  } catch (e) {
    console.error("[realtime] Błąd emisji:", e.message);
  }
}

module.exports = { init, emitToUser };
