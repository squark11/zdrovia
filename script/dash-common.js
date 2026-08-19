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
      // Podepnij wszystkie przyciski wylogowania (może być kilka: sidebar, topbar).
      document.querySelectorAll("[data-logout], #logout-btn").forEach((btn) =>
        btn.addEventListener("click", () => dash.logout())
      );
    },

    /* Wylogowanie: czyści sesję i wraca na stronę główną. */
    async logout() {
      try { await api.logout(); } catch (_e) {}
      window.location.href = "index.html";
    },

    /* -----------------------------------------------------------
       Toast — proste, własne powiadomienia (bez bibliotek).
       type: "success" | "error" | "info"
    ----------------------------------------------------------- */
    _toastRoot: null,
    toast(message, type = "success", ms = 3800) {
      if (!this._toastRoot) {
        const r = document.createElement("div");
        r.className = "toast-root";
        r.setAttribute("aria-live", "polite");
        document.body.appendChild(r);
        this._toastRoot = r;
      }
      const icon = type === "error" ? "⚠️" : type === "info" ? "ℹ️" : "✓";
      const t = document.createElement("div");
      t.className = "toast toast--" + type;
      t.setAttribute("role", type === "error" ? "alert" : "status");
      t.innerHTML =
        `<span class="toast__icon" aria-hidden="true">${icon}</span>` +
        `<span class="toast__msg"></span>` +
        `<button class="toast__close" type="button" aria-label="Zamknij powiadomienie">&times;</button>`;
      t.querySelector(".toast__msg").textContent = message;
      this._toastRoot.appendChild(t);
      requestAnimationFrame(() => t.classList.add("is-in"));
      const remove = () => { t.classList.remove("is-in"); setTimeout(() => t.remove(), 250); };
      const timer = setTimeout(remove, ms);
      t.querySelector(".toast__close").addEventListener("click", () => { clearTimeout(timer); remove(); });
      return t;
    },

    /* -----------------------------------------------------------
       Generyczny, dostępny modal (focus trap, Escape, klik w tło).
       Zwraca { close, root }.
    ----------------------------------------------------------- */
    openModal(html, opts = {}) {
      const root = document.createElement("div");
      root.className = "dmodal";
      root.innerHTML =
        '<div class="dmodal__backdrop" data-close></div>' +
        '<div class="dmodal__dialog" role="dialog" aria-modal="true"' +
        (opts.label ? ` aria-label="${opts.label}"` : "") + ">" +
        '<button class="dmodal__close" type="button" data-close aria-label="Zamknij okno">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        "</button>" +
        '<div class="dmodal__body"></div></div>';
      root.querySelector(".dmodal__body").innerHTML = html;
      document.body.appendChild(root);
      document.body.classList.add("no-scroll");
      const prevFocus = document.activeElement;
      requestAnimationFrame(() => root.classList.add("is-open"));

      const focusables = () =>
        root.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        if (e.key !== "Tab") return;
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", onKey);

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        root.classList.remove("is-open");
        document.removeEventListener("keydown", onKey);
        document.body.classList.remove("no-scroll");
        setTimeout(() => root.remove(), 220);
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
        if (opts.onClose) opts.onClose();
      }
      root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
      setTimeout(() => { const f = focusables(); (f[1] || f[0]) && (f[1] || f[0]).focus(); }, 40);
      return { close, root };
    },

    /* Modal potwierdzenia → Promise<boolean>. */
    confirm({ title, message, confirmText = "Potwierdź", cancelText = "Anuluj", danger = false }) {
      return new Promise((resolve) => {
        const html =
          `<div class="confirm"><h3 class="confirm__title">${this.esc(title)}</h3>` +
          `<p class="confirm__msg">${this.esc(message)}</p>` +
          '<div class="confirm__actions">' +
          `<button class="btn btn--ghost" type="button" data-act="cancel">${this.esc(cancelText)}</button>` +
          `<button class="btn ${danger ? "btn--danger" : "btn--primary"}" type="button" data-act="ok">${this.esc(confirmText)}</button>` +
          "</div></div>";
        const m = this.openModal(html, { label: title, onClose: () => resolve(false) });
        m.root.addEventListener("click", (e) => {
          const b = e.target.closest("[data-act]");
          if (!b) return;
          // Rozwiąż PRZED close() — close() wywołuje onClose→resolve(false),
          // które zostanie zignorowane, bo Promise jest już rozwiązany.
          resolve(b.dataset.act === "ok");
          m.close();
        });
      });
    },
  };

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.dash = dash;
})();
