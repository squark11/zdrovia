/* =============================================================
   config.js
   Wybór adresu backendu dla frontendu Zdrovia.

   Frontend trafia dokładnie w dwa miejsca:
     - hosting statyczny (GitHub Pages) — API jest wtedy na innym origin,
     - sam backend, który obok /api serwuje też te pliki — wtedy API leży
       pod tym samym adresem co strona.

   Ten plik ładuje się PRZED api.js i ustala jeden wspólny origin używany
   zarówno przez REST (api.js), jak i Socket.io (realtime.js).

   Kolejność rozstrzygania:
     1. window.ZDROVIA_API_ORIGIN ustawione ręcznie przed tym skryptem,
     2. ?api=<origin> w adresie URL — doraźne przełączenie w przeglądarce,
     3. strona z dysku (file:) lub z portu serwera deweloperskiego → DEV_API_ORIGIN,
     4. host z STATIC_HOSTS → PRODUCTION_API_ORIGIN (inny origin),
     5. każdy inny przypadek → ten sam origin co strona.

   Punkt 5 jest celowo domyślny: skoro strona przyszła skądś, co nie jest
   hostingiem statycznym, to serwował ją backend — więc API jest tam samo.
   Dzięki temu panel działa pod localhost, pod adresem LAN i pod nazwą
   publiczną, także zanim backend dostanie certyfikat i stoi jeszcze na HTTP.
============================================================= */
(function () {
  "use strict";

  /* --- ZMIEŃ TU, jeśli zmieni się adres backendu albo hosting frontendu --- */
  var PRODUCTION_API_ORIGIN = "https://oferty.elmax.net:45003";
  var DEV_API_ORIGIN = "http://localhost:4000";

  // Hosty, które serwują wyłącznie statyki i nie mają przy sobie API.
  var STATIC_HOSTS = ["squark11.github.io"];

  // Porty typowych serwerów statycznych w developmencie (README podaje
  // `python -m http.server 8123`).
  var DEV_STATIC_PORTS = ["8123", "5500", "5173", "3000", "8080"];

  /* Obcina końcowy ukośnik, żeby sklejanie z "/api" nie dało "//api". */
  function trimSlash(s) {
    return String(s || "").replace(/\/+$/, "");
  }

  var origin = null;
  var sameOrigin = false;

  // 1. Ręczne nadpisanie (ma pierwszeństwo nad wszystkim).
  if (window.ZDROVIA_API_ORIGIN) {
    origin = trimSlash(window.ZDROVIA_API_ORIGIN);
  }

  // 2. ?api=... — wygodne przy testowaniu innego backendu bez zmiany kodu.
  if (!origin) {
    try {
      var q = new URLSearchParams(location.search).get("api");
      // Akceptujemy wyłącznie pełny adres http(s) — nie chcemy ścieżek
      // względnych ani innych schematów wstrzykniętych przez link.
      if (q && /^https?:\/\//i.test(q)) origin = trimSlash(q);
    } catch (_e) { /* starsza przeglądarka — pomijamy */ }
  }

  if (!origin) {
    var isDevStatic =
      location.protocol === "file:" ||
      ((location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
        DEV_STATIC_PORTS.indexOf(location.port) >= 0);

    if (isDevStatic) {
      // 3. Strona z dysku lub z osobnego serwera statycznego — API stoi obok.
      origin = DEV_API_ORIGIN;
    } else if (STATIC_HOSTS.indexOf(location.hostname) >= 0) {
      // 4. Hosting statyczny — API na osobnym origin.
      origin = PRODUCTION_API_ORIGIN;
    } else {
      // 5. Stronę serwuje backend — używamy ścieżek relatywnych.
      origin = trimSlash(location.origin);
      sameOrigin = true;
    }
  }

  // Nadpisanie ręczne lub ?api= też może wskazywać na własny origin.
  if (!sameOrigin && origin === trimSlash(location.origin)) sameOrigin = true;

  window.ZDROVIA_CONFIG = {
    // Pusty string = same-origin. Używane do budowy adresów REST.
    apiOrigin: sameOrigin ? "" : origin,
    // Pełny origin (zawsze niepusty) — Socket.io nie przyjmuje pustego adresu.
    socketOrigin: origin || trimSlash(location.origin),
    sameOrigin: sameOrigin,
    apiBase: (sameOrigin ? "" : origin) + "/api",
  };
})();
