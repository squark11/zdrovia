/* =============================================================
   dash-common.js
   Wspólne narzędzia dla dashboardów: strażnik autoryzacji (guard),
   montowanie nagłówka użytkownika + wylogowanie, formatery.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia && window.Zdrovia.api;
  if (!api) return;

  const WD = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
  const pad = (n) => String(n).padStart(2, "0");

  const dash = {
    /* Wymaga zalogowania (opcjonalnie z konkretną rolą).
       Zwraca usera lub przekierowuje do logowania / właściwego panelu. */
    async guard(role) {
      // Bez tokenu → od razu na logowanie (bez zbędnego 401).
      if (!api.getToken()) {
        const next = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
        window.location.href = "login.html?next=" + next;
        return null;
      }
      try {
        const { user } = await api.me();
        if (role && user.role !== role) {
          window.location.href =
            user.role === "doctor" ? "dashboard-doctor.html" : "dashboard-patient.html";
          return null;
        }
        return user;
      } catch (_e) {
        const next = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
        window.location.href = "login.html?next=" + next;
        return null;
      }
    },

    initials(name) {
      return String(name || "")
        .replace(/^dr\s+/i, "")
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
    },

    esc(s) {
      return String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
      );
    },

    fmtDate(ymd) {
      if (!ymd) return "";
      const d = new Date(ymd + "T00:00:00");
      return `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    },

    statusBadge(status) {
      return `<span class="status status--${status}">${status}</span>`;
    },

    /* Montuje nazwę użytkownika w nagłówku i podpina wylogowanie. */
    mountUser(user) {
      const nameEl = document.getElementById("header-user");
      if (nameEl) {
        const label =
          user.role === "doctor" && user.profile
            ? user.profile.name
            : user.profile
            ? `${user.profile.firstName} ${user.profile.lastName}`
            : user.email;
        nameEl.textContent = label;
      }
      const logout = document.getElementById("logout-btn");
      if (logout) {
        logout.addEventListener("click", async () => {
          await api.logout();
          window.location.href = "index.html";
        });
      }
    },
  };

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.dash = dash;
})();
