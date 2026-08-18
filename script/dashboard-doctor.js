/* =============================================================
   dashboard-doctor.js
   Panel lekarza: lista wizyt (oznaczanie zrealizowanych),
   wystawianie e-recept, edycja dostępności i profilu. Dane z API.
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
  // Dni tygodnia w kolejności pon→niedz (weekday wg API: 0=niedz..6=sob).
  const DAYS = [[1, "Poniedziałek"], [2, "Wtorek"], [3, "Środa"], [4, "Czwartek"],
                [5, "Piątek"], [6, "Sobota"], [0, "Niedziela"]];

  let me = null;
  let appointments = [];

  init();

  async function init() {
    me = await dash.guard("doctor");
    if (!me) return;
    dash.mountUser(me);
    el("welcome").textContent = `Witaj, ${me.profile ? me.profile.name : ""}!`;

    renderAvailabilityEditor();
    prefillProfile();
    await Promise.all([refreshAppointments(), refreshPrescriptions(), loadAvailability()]);

    wireRxForm();
    wireAvailability();
    wireProfile();
  }

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /* ---------- Wizyty ---------- */
  async function refreshAppointments() {
    try {
      const res = await api.get("/appointments");
      appointments = res.appointments;
      renderAppointments();
      populateRxAppointments();
      updateStats();
    } catch (e) {
      el("appointments-list").innerHTML = `<p class="empty">Nie udało się wczytać wizyt.</p>`;
    }
  }

  function renderAppointments() {
    const wrap = el("appointments-list");
    if (!appointments.length) {
      wrap.innerHTML = `<div class="empty"><div class="empty__icon">📅</div>Nie masz jeszcze umówionych wizyt.</div>`;
      return;
    }
    wrap.innerHTML = appointments
      .map(
        (a) => `
      <div class="data-item">
        <span class="data-item__avatar" style="background:#0E9F8E">${dash.initials(a.patient.name)}</span>
        <div class="data-item__main">
          <p class="data-item__title">${dash.esc(a.patient.name)}</p>
          <p class="data-item__sub">${a.serviceLabel} • ${a.consultationType || "wideo"} • ${dash.fmtDate(a.date)}, ${a.time}</p>
          <div class="data-item__meta">${dash.statusBadge(a.status)}${a.paid ? ' <span class="status status--zrealizowana">opłacone</span>' : ""}</div>
          ${a.reason ? `<p class="data-item__sub" style="margin-top:.35rem">„${dash.esc(a.reason).split("\\n")[0]}"</p>` : ""}
        </div>
        <div class="data-item__actions">
          ${a.status === "zaplanowana"
            ? `<button class="btn btn--ghost" type="button" data-done="${a.id}">Zrealizowana</button>
               <button class="btn btn--primary" type="button" data-rx="${a.id}">Wystaw receptę</button>`
            : a.status === "zrealizowana"
            ? `<button class="btn btn--primary" type="button" data-rx="${a.id}">Wystaw receptę</button>`
            : ""}
        </div>
      </div>`
      )
      .join("");

    wrap.querySelectorAll("[data-done]").forEach((b) =>
      b.addEventListener("click", () => markDone(b.dataset.done, b))
    );
    wrap.querySelectorAll("[data-rx]").forEach((b) =>
      b.addEventListener("click", () => {
        el("rx-appointment").value = b.dataset.rx;
        el("rx-title").scrollIntoView({ behavior: "smooth", block: "center" });
        el("rx-medication").focus();
      })
    );
  }

  async function markDone(id, btn) {
    btn.disabled = true;
    btn.textContent = "…";
    try {
      await api.patch(`/appointments/${id}`, { status: "zrealizowana" });
      await refreshAppointments();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Zrealizowana";
    }
  }

  function updateStats() {
    const t = todayStr();
    el("stat-today").textContent = appointments.filter((a) => a.date === t && a.status !== "anulowana").length;
    el("stat-upcoming").textContent = appointments.filter((a) => a.status === "zaplanowana").length;
    el("stat-done").textContent = appointments.filter((a) => a.status === "zrealizowana").length;
  }

  /* ---------- Recepty ---------- */
  async function refreshPrescriptions() {
    try {
      const { prescriptions } = await api.get("/prescriptions");
      el("stat-rx").textContent = prescriptions.length;
    } catch (e) { /* pomiń */ }
  }

  function populateRxAppointments() {
    const sel = el("rx-appointment");
    const current = sel.value;
    sel.innerHTML = '<option value="">— wybierz wizytę —</option>';
    appointments
      .filter((a) => a.status !== "anulowana")
      .forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = `${a.patient.name} — ${dash.fmtDate(a.date)} ${a.time}`;
        sel.appendChild(o);
      });
    if (current) sel.value = current;
  }

  function wireRxForm() {
    el("rx-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      el("rx-alert").hidden = true;
      el("rx-success").hidden = true;

      const appointmentId = el("rx-appointment").value;
      const medication = el("rx-medication").value.trim();
      if (!appointmentId) return fail("Wybierz wizytę.");
      if (medication.length < 2) return fail("Podaj nazwę leku.");

      const payload = {
        appointmentId: Number(appointmentId),
        medication,
        dosage: el("rx-dosage").value.trim() || undefined,
        notes: el("rx-notes").value.trim() || undefined,
        validUntil: el("rx-valid").value || undefined,
      };
      const btn = el("rx-submit");
      btn.disabled = true;
      btn.textContent = "Wystawianie…";
      try {
        const { prescription } = await api.post("/prescriptions", payload);
        el("rx-success").textContent = `Recepta wystawiona. Kod: ${prescription.code}`;
        el("rx-success").hidden = false;
        el("rx-form").reset();
        await Promise.all([refreshAppointments(), refreshPrescriptions()]);
      } catch (err) {
        fail(err.message || "Nie udało się wystawić recepty.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Wystaw receptę";
      }
    });

    function fail(msg) {
      el("rx-alert").textContent = msg;
      el("rx-alert").hidden = false;
    }
  }

  /* ---------- Dostępność ---------- */
  function renderAvailabilityEditor() {
    el("avail-rows").innerHTML = DAYS.map(
      ([wd, label]) => `
      <div class="field field--check" style="align-items:center;grid-template-columns:auto 1fr;margin-bottom:.5rem">
        <input class="field__checkbox" type="checkbox" id="av-${wd}-on" />
        <label class="field__consent" for="av-${wd}-on" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <strong style="min-width:6.5rem;display:inline-block">${label}</strong>
          <input class="field__input" type="time" id="av-${wd}-from" value="09:00" style="width:auto;padding:.4rem .6rem" />
          <span>–</span>
          <input class="field__input" type="time" id="av-${wd}-to" value="15:00" style="width:auto;padding:.4rem .6rem" />
        </label>
      </div>`
    ).join("");
  }

  async function loadAvailability() {
    try {
      const { windows } = await api.get(`/doctors/${me.id}/availability`);
      windows.forEach((w) => {
        const on = el(`av-${w.weekday}-on`);
        if (on) {
          on.checked = true;
          el(`av-${w.weekday}-from`).value = w.startTime;
          el(`av-${w.weekday}-to`).value = w.endTime;
        }
      });
    } catch (e) { /* pomiń */ }
  }

  function wireAvailability() {
    el("avail-save").addEventListener("click", async () => {
      const slots = [];
      DAYS.forEach(([wd]) => {
        if (el(`av-${wd}-on`).checked) {
          const from = el(`av-${wd}-from`).value;
          const to = el(`av-${wd}-to`).value;
          if (from && to && from < to) slots.push({ weekday: wd, startTime: from, endTime: to });
        }
      });
      const btn = el("avail-save");
      btn.disabled = true;
      btn.textContent = "Zapisywanie…";
      try {
        await api.patch(`/doctors/${me.id}/availability`, { slots });
        el("avail-success").textContent = "Dostępność zapisana.";
        el("avail-success").hidden = false;
        setTimeout(() => (el("avail-success").hidden = true), 3000);
      } catch (e) { /* pomiń */ }
      finally {
        btn.disabled = false;
        btn.textContent = "Zapisz dostępność";
      }
    });
  }

  /* ---------- Profil ---------- */
  function prefillProfile() {
    if (!me.profile) return;
    el("pf-city").value = me.profile.city || "";
    el("pf-price").value = me.profile.consultationPrice || "";
    el("pf-bio").value = me.profile.bio || "";
  }

  function wireProfile() {
    el("profile-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      el("profile-success").hidden = true;
      const payload = {
        city: el("pf-city").value.trim() || undefined,
        consultationPrice: el("pf-price").value || undefined,
        bio: el("pf-bio").value.trim() || undefined,
      };
      try {
        await api.patch(`/doctors/${me.id}`, payload);
        el("profile-success").textContent = "Profil zaktualizowany.";
        el("profile-success").hidden = false;
        setTimeout(() => (el("profile-success").hidden = true), 3000);
      } catch (e) { /* pomiń */ }
    });
  }
})();
