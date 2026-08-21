/* =============================================================
   config.js
   Wybór adresu backendu dla frontendu Zdrovia.

   Frontend jest hostowany osobno (GitHub Pages), a backend stoi na
   własnym serwerze — dlatego adres API nie może być relatywny.
   Ten plik ładuje się PRZED api.js i ustala jeden wspólny origin
   używany zarówno przez REST (api.js), jak i Socket.io (realtime.js).

   Kolejność rozstrzygania:
     1. window.ZDROVIA_API_ORIGIN ustawione ręcznie przed tym skryptem
        (np. inline w HTML podczas testów) — ma pierwszeństwo,
     2. ?api=<origin> w adresie URL — doraźne przełączenie w przeglądarce,
     3. localhost / 127.0.0.1 → lokalny backend deweloperski,
     4. dowolny inny host → PRODUCTION_API_ORIGIN.

   Gdy wyliczony origin pokrywa się z originem strony (backend serwuje
   też statyki), przechodzimy na ścieżki relatywne — dzięki temu żądania
   są same-origin i działa httpOnly cookie zamiast tokenu z localStorage.
============================================================= */
(function () {
  "use strict";

  /* --- ZMIEŃ TU, jeśli backend zmieni adres --- */
  var PRODUCTION_API_ORIGIN = "https://oferty.elmax.net:45003";
  var DEV_API_ORIGIN = "http://localhost:4000";

  /* Obcina końcowy ukośnik, żeby sklejanie z "/api" nie dało "//api". */
  function trimSlash(s) {
    return String(s || "").replace(/\/+$/, "");
  }

  var origin = null;

  // 1. Ręczne nadpisanie (ma pierwszeństwo nad wszystkim).
  if (window.ZDROVIA_API_ORIGIN) {
    origin = trimSlash(window.ZDROVIA_API_ORIGIN);
  }

  // 2. ?api=... — wygodne przy testowaniu innego backendu bez zmiany kodu.
  if (!origin) {
    try {
      var q = new URLSearchParams(location.search).get("api");
      // Akceptujemy wyłącznie pełny adres http(s) — nie chcemy ścieżek względnych
      // ani innych schematów wstrzykniętych przez link.
      if (q && /^https?:\/\//i.test(q)) origin = trimSlash(q);
    } catch (_e) { /* starsza przeglądarka — pomijamy */ }
  }

  // Porty serwerów statycznych używanych w developmencie (README podaje
  // `python -m http.server 8123`). Strona podana z takiego portu NIE ma przy
  // sobie API — trzeba ją skierować na osobny backend deweloperski.
  var DEV_STATIC_PORTS = ["8123", "5500", "5173", "3000", "8080"];

  // 3./4. Automatyczny wybór na podstawie hosta.
  if (!origin) {
    var host = location.hostname;
    var isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

    if (location.protocol === "file:") {
      // Strona otwarta wprost z dysku — nie ma własnego originu.
      origin = DEV_API_ORIGIN;
    } else if (isLocal) {
      // Backend serwuje również statyki, więc strona otwarta z jego portu ma
      // API pod tym samym adresem — bez znaczenia, czy to 4000, czy 45003.
      origin = DEV_STATIC_PORTS.indexOf(location.port) >= 0
        ? DEV_API_ORIGIN
        : trimSlash(location.origin);
    } else {
      origin = PRODUCTION_API_ORIGIN;
    }
  }

  // Backend serwuje również ten frontend → wracamy na ścieżki relatywne.
  var sameOrigin = origin === trimSlash(location.origin);

  window.ZDROVIA_CONFIG = {
    // Pusty string = same-origin. Używane do budowy adresów REST.
    apiOrigin: sameOrigin ? "" : origin,
    // Pełny origin (zawsze niepusty) — potrzebny Socket.io, który
    // nie przyjmuje pustego adresu.
    socketOrigin: origin || trimSlash(location.origin),
    sameOrigin: sameOrigin,
    apiBase: (sameOrigin ? "" : origin) + "/api",
  };
})();
