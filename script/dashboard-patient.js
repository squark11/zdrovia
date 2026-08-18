/* =============================================================
   dashboard-patient.js
   Panel pacjenta: wizyty, e-recepty oraz szybki dostęp do
   kreatora rezerwacji (umow.html). Dane z API.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia.api;
  const dash = window.Zdrovia.dash;
  const el = (id) => document.getElementById(id);

  const SPEC_LABEL = {
    internista: "Internista", pediatra: "Pediatra", dermatolog: "Dermatolog",
    psychiatra: "Psychiatra", ginekolog: "Ginekolog", kardiolog: "Kardiolog",
    laryngolog: "Laryngolog", endokrynolog: "Endokrynolog",
  };
  const SERVICES = window.Zdrovia.SERVICES; // wspólny katalog (script/services.js)

  init();

  async function init() {
    const user = await dash.guard("patient");
    if (!user) return;
    dash.mountUser(user);
    el("welcome").textContent = `Witaj, ${user.profile ? user.profile.firstName : ""}!`;

    renderServiceTiles();
    await Promise.all([refreshAppointments(), refreshPrescriptions()]);
  }

  /* Kafelki usług → kreator rezerwacji. */
  function renderServiceTiles() {
    el("dash-services").innerHTML = SERVICES.map(
      (s) => `
      <a class="service-tile" href="umow.html?service=${s.key}">
        <span class="service-tile__icon" aria-hidden="true">${s.icon}</span>
        <span class="service-tile__name">${s.label}</span>
        <span class="service-tile__price">${s.price ? s.price + " zł" : "cena zależna od lekarza"}</span>
      </a>`
    ).join("");
  }

  /* ---------- Wizyty ---------- */
  async function refreshAppointments() {
    try {
      const { appointments } = await api.get("/appointments");
      renderAppointments(appointments);
      updateStats(appointments);
    } catch (_e) {
      el("appointments-list").innerHTML = `<p class="empty">Nie udało się wczytać wizyt.</p>`;
    }
  }

  function renderAppointments(list) {
    const wrap = el("appointments-list");
    if (!list.length) {
      wrap.innerHTML = `<div class="empty"><div class="empty__icon">📅</div>Nie masz jeszcze wizyt. Umów pierwszą po prawej.</div>`;
      return;
    }
    wrap.innerHTML = list
      .map(
        (a) => `
      <div class="data-item">
        <span class="data-item__avatar" style="background:${a.doctor.color || "#0E9F8E"}">${dash.initials(a.doctor.name)}</span>
        <div class="data-item__main">
          <p class="data-item__title">${dash.esc(a.doctor.name)}</p>
          <p class="data-item__sub">${a.serviceLabel} • ${a.consultationType || "wideo"}${a.price ? " • " + a.price + " zł" + (a.paid ? " (opłacone)" : "") : ""}</p>
          <div class="data-item__meta">
            ${dash.statusBadge(a.status)}
            <span class="data-item__sub">${dash.fmtDate(a.date)}, godz. ${a.time}</span>
          </div>
          ${a.reason ? `<p class="data-item__sub" style="margin-top:.35rem">„${dash.esc(a.reason).split("\\n")[0]}"</p>` : ""}
        </div>
        <div class="data-item__actions">
          ${a.status === "zaplanowana" ? `<button class="btn btn--ghost" type="button" data-cancel="${a.id}">Anuluj</button>` : ""}
        </div>
      </div>`
      )
      .join("");

    wrap.querySelectorAll("[data-cancel]").forEach((btn) =>
      btn.addEventListener("click", () => cancelAppointment(btn.dataset.cancel, btn))
    );
  }

  async function cancelAppointment(id, btn) {
    btn.disabled = true;
    btn.textContent = "Anulowanie…";
    try {
      await api.patch(`/appointments/${id}`, { status: "anulowana" });
      await refreshAppointments();
    } catch (_e) {
      btn.disabled = false;
      btn.textContent = "Anuluj";
    }
  }

  function updateStats(list) {
    const upcoming = list.filter((a) => a.status === "zaplanowana");
    el("stat-upcoming").textContent = upcoming.length;
    el("stat-done").textContent = list.filter((a) => a.status === "zrealizowana").length;
    const nextA = upcoming.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    el("stat-next").textContent = nextA ? dash.fmtDate(nextA.date).replace(/^\w+\.\s/, "") : "—";
  }

  /* ---------- Recepty ---------- */
  async function refreshPrescriptions() {
    try {
      const { prescriptions } = await api.get("/prescriptions");
      el("stat-rx").textContent = prescriptions.length;
      const wrap = el("prescriptions-list");
      if (!prescriptions.length) {
        wrap.innerHTML = `<div class="empty"><div class="empty__icon">💊</div>Brak e-recept. Pojawią się tu po konsultacji.</div>`;
        return;
      }
      wrap.innerHTML = prescriptions
        .map(
          (p) => `
        <div class="data-item">
          <span class="data-item__avatar" style="background:#0B7A6D">Rx</span>
          <div class="data-item__main">
            <p class="data-item__title">${dash.esc(p.medication)}</p>
            <p class="data-item__sub">${dash.esc(p.dosage || "")}</p>
            <div class="data-item__meta">
              <span class="rx-code">${dash.esc(p.code)}</span>
              <span class="data-item__sub">wyst. ${dash.fmtDate((p.issuedAt || "").slice(0, 10))} • ${dash.esc(p.doctor.name)}</span>
            </div>
            ${p.notes ? `<p class="data-item__sub" style="margin-top:.35rem">${dash.esc(p.notes)}</p>` : ""}
          </div>
        </div>`
        )
        .join("");
    } catch (_e) {
      el("prescriptions-list").innerHTML = `<p class="empty">Nie udało się wczytać recept.</p>`;
    }
  }
})();
