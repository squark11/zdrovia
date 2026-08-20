/* =============================================================
   realtime.js
   Kliencka warstwa Socket.io dla paneli pacjenta i lekarza.
   - Łączy się TYLKO gdy funkcja „Aktualizacje na żywo" jest włączona
     w ustawieniach platformy (GET /api/config).
   - Autoryzacja tokenem JWT (handshake.auth.token).
   - Udostępnia prosty rejestr zdarzeń: Zdrovia.realtime.on(event, cb).
   Real-time to dodatek do UX — błędy połączenia są ciche i nie psują panelu.
============================================================= */
(function () {
  "use strict";

  window.Zdrovia = window.Zdrovia || {};
  const api = window.Zdrovia.api;

  let socket = null;
  const handlers = Object.create(null);
  const EVENTS = ["appointment:new", "appointment:updated", "prescription:new"];

  function on(event, cb) {
    (handlers[event] || (handlers[event] = [])).push(cb);
  }
  function fire(event, data) {
    (handlers[event] || []).forEach((cb) => { try { cb(data); } catch (_e) {} });
  }

  async function connect() {
    if (socket || typeof window.io !== "function") return;
    // Nie nawiązuj połączenia, jeśli administrator wyłączył funkcję.
    try {
      const cfg = await api.get("/config");
      if (!cfg.features || !cfg.features.realtime) return;
    } catch (_e) { return; }

    const token = api.getToken();
    // Domyślny transport (polling → upgrade do websocket) — najbardziej odporny.
    socket = window.io({ auth: { token } });
    socket.on("connect_error", () => {}); // cicho — panel działa też bez real-time
    EVENTS.forEach((ev) => socket.on(ev, (data) => fire(ev, data)));
  }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null; }
  }

  window.Zdrovia.realtime = { connect, disconnect, on };
})();
