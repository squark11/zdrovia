/* =============================================================
   realtime.js
   Kliencka warstwa Socket.io dla paneli pacjenta i lekarza.
   - Łączy się TYLKO gdy funkcja „Aktualizacje na żywo" jest włączona
     w ustawieniach platformy (GET /api/config).
   - Autoryzacja tokenem JWT (handshake.auth.token).
   - Udostępnia prosty rejestr zdarzeń: Zdrovia.realtime.on(event, cb).

   Klient Socket.io ładowany jest z serwera backendu (a nie ze ścieżki
   /socket.io/... względem strony), bo frontend bywa hostowany osobno —
   np. na GitHub Pages pod adresem /zdrovia/, gdzie taka ścieżka nie
   istnieje. Adres backendu daje config.js.

   Real-time to dodatek do UX — błędy połączenia są ciche i nie psują panelu.
============================================================= */
(function () {
  "use strict";

  window.Zdrovia = window.Zdrovia || {};
  const api = window.Zdrovia.api;
  const CFG = window.ZDROVIA_CONFIG || {};

  let socket = null;
  let clientPromise = null;
  const handlers = Object.create(null);
  const EVENTS = ["appointment:new", "appointment:updated", "prescription:new"];

  function on(event, cb) {
    (handlers[event] || (handlers[event] = [])).push(cb);
  }
  function fire(event, data) {
    (handlers[event] || []).forEach((cb) => { try { cb(data); } catch (_e) {} });
  }

  /* Dociąga bibliotekę klienta Socket.io z backendu (serwuje ją sam
     Socket.io pod /socket.io/socket.io.js). Jednorazowo — kolejne
     wywołania dostają tę samą obietnicę. */
  function loadClient() {
    if (typeof window.io === "function") return Promise.resolve(true);
    if (clientPromise) return clientPromise;

    const origin = CFG.socketOrigin || location.origin;
    clientPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = origin.replace(/\/+$/, "") + "/socket.io/socket.io.js";
      s.async = true;
      s.onload = () => resolve(typeof window.io === "function");
      s.onerror = () => resolve(false); // backend niedostępny — panel działa dalej
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  async function connect() {
    if (socket) return;

    // Nie nawiązuj połączenia, jeśli administrator wyłączył funkcję.
    // Sprawdzamy to PRZED pobraniem klienta, żeby nie ściągać go bez potrzeby.
    try {
      const cfg = await api.get("/config");
      if (!cfg.features || !cfg.features.realtime) return;
    } catch (_e) { return; }

    if (!(await loadClient())) return;
    if (socket) return; // zabezpieczenie przed równoległym connect()

    const token = api.getToken();
    // Domyślny transport (polling → upgrade do websocket) — najbardziej odporny.
    // withCredentials: przesyła httpOnly cookie, gdy front i API dzielą origin.
    const opts = { auth: { token }, withCredentials: true };
    socket = CFG.sameOrigin ? window.io(opts) : window.io(CFG.socketOrigin, opts);

    socket.on("connect_error", () => {}); // cicho — panel działa też bez real-time
    EVENTS.forEach((ev) => socket.on(ev, (data) => fire(ev, data)));
  }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null; }
  }

  window.Zdrovia.realtime = { connect, disconnect, on };
})();
