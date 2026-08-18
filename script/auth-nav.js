/* =============================================================
   auth-nav.js
   Aktualizuje akcje konta w nagłówku strony głównej: jeśli
   użytkownik jest zalogowany, pokazuje link do panelu i wylogowanie.
============================================================= */
(function () {
  "use strict";

  const el = document.getElementById("nav-auth");
  if (!el || !window.Zdrovia || !window.Zdrovia.api) return;

  // Bez zapisanego tokenu traktujemy jako gościa (bez zbędnego 401 w konsoli).
  if (!window.Zdrovia.api.getToken()) return;

  window.Zdrovia.api
    .me()
    .then((res) => {
      const u = res.user;
      const dash = u.role === "doctor" ? "dashboard-doctor.html" : "dashboard-patient.html";
      el.innerHTML = `
        <a class="main-nav__login" href="${dash}">Mój panel</a>
        <button class="btn btn--ghost main-nav__cta" type="button" id="nav-logout">Wyloguj</button>`;
      document.getElementById("nav-logout").addEventListener("click", async () => {
        await window.Zdrovia.api.logout();
        window.location.href = "index.html";
      });
    })
    .catch(() => {
      /* gość — zostaw domyślne linki (Zaloguj się / Umów wizytę) */
    });
})();
