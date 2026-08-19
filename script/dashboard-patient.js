/* =============================================================
   dashboard-patient.js
   Panel pacjenta (SPA-owe przełączanie widoków po hashu URL).
   Widoki: Przegląd / Moje wizyty / Recepty / Profil.
   Dane pobierane z REST API (script/api.js). Samo umawianie wizyt
   odbywa się w dedykowanym kreatorze umow.html.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia.api;
  const dash = window.Zdrovia.dash;
  const el = (id) => document.getElementById(id);

  const VIEWS = ["przeglad", "wizyty", "recepty", "profil"];
  const TAB_STATUS = { upcoming: "zaplanowana", done: "zrealizowana", cancelled: "anulowana" };

  // Ikona kalendarza (SVG, dziedziczy kolor z currentColor).
  const CAL =
    '<svg class="ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>';

  // Duże ikony do stanów pustych (w kafelku, kolor marki).
  const ICO_CAL =
    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>';
  const ICO_PILL =
    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(45 12 12)"><rect x="4" y="8.5" width="16" height="7" rx="3.5"/><path d="M12 8.5v7"/></g></svg>';
  const emptyIco = (svg) => `<div class="empty__ico">${svg}</div>`;

  let user = null;
  let appointments = [];
  let prescriptions = [];
  let currentTab = "upcoming";

  init();

  async function init() {
    user = await dash.guard("patient");     // ochrona dostępu (rola patient)
    if (!user) return;
    dash.mountUser(user);
    mountSideUser();
    setupNavigation();
    setupTabs();
    setupProfileForms();
    prefillProfile();

    // Widok z hasha (np. wejście z #recepty).
    showView((location.hash || "#przeglad").slice(1));

    await loadAll();
  }

  /* ---------- Pomocnicze ---------- */
  function mountSideUser() {
    const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
    const nameEl = el("side-user-name");
    if (nameEl) nameEl.textContent = name;
    const av = el("side-avatar");
    if (av) av.textContent = dash.initials(name);
    el("welcome-sub").textContent = `Witaj, ${user.profile ? user.profile.firstName : ""}! 👋`;
    el("v1-title").textContent = "Twój panel zdrowia";
  }

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const rxActive = (p) => !p.validUntil || p.validUntil >= todayStr();

  /* Obsługa błędów API: 401 → wygasła sesja → logowanie. */
  function handleApiError(err, fallback) {
    if (err && err.status === 401) {
      dash.toast("Sesja wygasła — zaloguj się ponownie.", "error");
      api.setToken(null);
      setTimeout(() => { window.location.href = "login.html?next=dashboard-patient.html"; }, 1300);
      return true;
    }
    dash.toast(fallback || (err && err.message) || "Wystąpił błąd.", "error");
    return false;
  }

  function skeletons(n) {
    return Array.from({ length: n }, () => '<div class="skeleton skel-card"></div>').join("");
  }

  /* ---------- Ładowanie danych ---------- */
  async function loadAll() {
    el("appt-grid").innerHTML = skeletons(4);
    el("rx-grid").innerHTML = skeletons(3);
    el("next-visit").innerHTML = '<div class="loading-row"><span class="spinner"></span> Wczytywanie…</div>';
    try {
      const [a, p] = await Promise.all([api.get("/appointments"), api.get("/prescriptions")]);
      appointments = a.appointments;
      prescriptions = p.prescriptions;
    } catch (err) {
      if (err.status === 401) { handleApiError(err); return; }
      el("global-alert").textContent = "Nie udało się połączyć z serwerem. Odśwież stronę lub spróbuj ponownie później.";
      el("global-alert").hidden = false;
      el("appt-grid").innerHTML = el("rx-grid").innerHTML = "";
      el("next-visit").innerHTML = '<p class="empty">Brak danych.</p>';
      return;
    }
    el("global-alert").hidden = true;
    renderStats();
    renderNextVisit();
    renderAppointments();
    renderPrescriptions();
  }

  /* ---------- PRZEGLĄD ---------- */
  function renderStats() {
    el("stat-upcoming").textContent = appointments.filter((a) => a.status === "zaplanowana").length;
    el("stat-done").textContent = appointments.filter((a) => a.status === "zrealizowana").length;
    el("stat-rx").textContent = prescriptions.length;
    el("stat-active-rx").textContent = prescriptions.filter(rxActive).length;
  }

  function nextUpcoming() {
    return appointments
      .filter((a) => a.status === "zaplanowana")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  }

  function renderNextVisit() {
    const a = nextUpcoming();
    const box = el("next-visit");
    if (!a) {
      box.innerHTML =
        '<div class="empty">' + emptyIco(ICO_CAL) +
        "<p>Nie masz zaplanowanych wizyt.</p>" +
        '<a class="btn btn--primary" href="umow.html" style="margin-top:var(--space-3)">Umów pierwszą wizytę</a></div>';
      return;
    }
    box.innerHTML =
      '<div class="nv">' +
      `<span class="nv__avatar" style="background:${a.doctor.color || "#0E9F8E"}">${dash.initials(a.doctor.name)}</span>` +
      "<div>" +
      `<p class="nv__name">${dash.esc(a.doctor.name)}</p>` +
      `<p class="nv__meta">${a.serviceLabel} • ${a.consultationType || "wideo"}</p>` +
      `<span class="nv__when">${CAL}${dash.fmtDate(a.date)}, godz. ${a.time}</span>` +
      '<div class="nv__actions">' +
      `<button class="btn btn--primary" type="button" data-join="${a.id}">Dołącz</button>` +
      `<button class="btn btn--ghost" type="button" data-detail="${a.id}">Szczegóły</button>` +
      "</div></div></div>";
    box.querySelector("[data-join]").addEventListener("click", () =>
      dash.toast("Link do wideokonsultacji pojawi się tutaj na 5 minut przed wizytą (wersja demo).", "info", 5000)
    );
    box.querySelector("[data-detail]").addEventListener("click", () => openAppointmentDetail(a));
  }

  /* ---------- MOJE WIZYTY ---------- */
  function setupTabs() {
    document.querySelectorAll(".tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        currentTab = tab.dataset.tab;
        document.querySelectorAll(".tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        renderAppointments();
      })
    );
  }

  function renderAppointments() {
    const grid = el("appt-grid");
    const list = appointments
      .filter((a) => a.status === TAB_STATUS[currentTab])
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    if (!list.length) {
      const isUpcoming = currentTab === "upcoming";
      grid.innerHTML =
        '<div class="empty" style="grid-column:1/-1">' + emptyIco(ICO_CAL) +
        `<p>${isUpcoming ? "Nie masz nadchodzących wizyt." : currentTab === "done" ? "Brak zrealizowanych wizyt." : "Brak anulowanych wizyt."}</p>` +
        (isUpcoming ? '<a class="btn btn--primary" href="umow.html" style="margin-top:var(--space-3)">Umów pierwszą wizytę</a>' : "") +
        "</div>";
      return;
    }

    grid.innerHTML = list.map(apptCard).join("");
    grid.querySelectorAll("[data-cancel]").forEach((b) =>
      b.addEventListener("click", () => cancelAppointment(Number(b.dataset.cancel)))
    );
    grid.querySelectorAll("[data-detail]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = appointments.find((x) => x.id === Number(b.dataset.detail));
        if (a) openAppointmentDetail(a);
      })
    );
  }

  function apptCard(a) {
    const canCancel = a.status === "zaplanowana";
    return (
      '<article class="appt-card">' +
      '<div class="appt-card__head">' +
      `<span class="appt-card__avatar" style="background:${a.doctor.color || "#0E9F8E"}">${dash.initials(a.doctor.name)}</span>` +
      `<div><p class="appt-card__name">${dash.esc(a.doctor.name)}</p>` +
      `<p class="appt-card__spec">${a.serviceLabel} • ${a.consultationType || "wideo"}</p></div>` +
      "</div>" +
      `<div class="appt-card__row">${dash.statusBadge(a.status)}<span class="ico-txt">${CAL}${dash.fmtDate(a.date)}, ${a.time}</span></div>` +
      (a.price ? `<div class="appt-card__row"><strong>${a.price} zł</strong>${a.paid ? " • opłacone" : ""}</div>` : "") +
      '<div class="appt-card__foot">' +
      `<button class="btn btn--ghost" type="button" data-detail="${a.id}">Szczegóły</button>` +
      (canCancel ? `<button class="btn btn--danger" type="button" data-cancel="${a.id}">Anuluj</button>` : "") +
      "</div></article>"
    );
  }

  async function cancelAppointment(id) {
    const a = appointments.find((x) => x.id === id);
    if (!a) return;
    const ok = await dash.confirm({
      title: "Anulować wizytę?",
      message: `Wizyta u ${a.doctor.name} — ${dash.fmtDate(a.date)}, godz. ${a.time}. Tej operacji nie można cofnąć.`,
      confirmText: "Tak, anuluj",
      cancelText: "Wróć",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.patch(`/appointments/${id}`, { status: "anulowana" });
      // Natychmiastowa aktualizacja widoku bez przeładowania.
      Object.assign(a, res.appointment);
      renderStats();
      renderNextVisit();
      renderAppointments();
      dash.toast("Wizyta została anulowana.", "success");
    } catch (err) {
      handleApiError(err, "Nie udało się anulować wizyty.");
    }
  }

  function openAppointmentDetail(a) {
    const rows = [
      ["Lekarz", a.doctor.name],
      ["Usługa", a.serviceLabel],
      ["Forma", a.consultationType || "wideo"],
      ["Termin", `${dash.fmtDate(a.date)}, godz. ${a.time}`],
      ["Status", a.status],
      a.price ? ["Cena", `${a.price} zł${a.paid ? " (opłacone)" : ""}`] : null,
    ].filter(Boolean);
    const html =
      `<h3 class="detail__title">Szczegóły wizyty</h3>` +
      '<div class="detail__list">' +
      rows.map((r) => `<div class="detail__row"><span>${r[0]}</span><strong>${dash.esc(r[1])}</strong></div>`).join("") +
      "</div>" +
      (a.reason ? `<div class="detail__note"><strong>Powód / objawy:</strong><br>${dash.esc(a.reason).replace(/\n/g, "<br>")}</div>` : "");
    dash.openModal(html, { label: "Szczegóły wizyty" });
  }

  /* ---------- RECEPTY ---------- */
  function renderPrescriptions() {
    const grid = el("rx-grid");
    if (!prescriptions.length) {
      grid.innerHTML =
        '<div class="empty" style="grid-column:1/-1">' + emptyIco(ICO_PILL) +
        "<p>Nie masz jeszcze e-recept. Pojawią się tutaj po konsultacji z lekarzem.</p>" +
        '<a class="btn btn--primary" href="umow.html" style="margin-top:var(--space-3)">Zamów e-receptę</a></div>';
      return;
    }
    grid.innerHTML = prescriptions.map(rxCard).join("");
    grid.querySelectorAll("[data-rx]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = prescriptions.find((x) => x.id === Number(b.dataset.rx));
        if (p) openRxDetail(p);
      })
    );
  }

  function rxCard(p) {
    const active = rxActive(p);
    return (
      '<article class="rx-card">' +
      '<div class="rx-card__head">' +
      '<span class="rx-card__avatar" style="background:#0B7A6D">Rx</span>' +
      `<div><p class="rx-card__name">${dash.esc(p.medication)}</p>` +
      `<p class="rx-card__sub">${dash.esc(p.dosage || "—")}</p></div>` +
      "</div>" +
      `<div class="appt-card__row"><span class="status status--${active ? "aktywna" : "wygasla"}">${active ? "aktywna" : "wygasła"}</span>` +
      `<span class="rx-code">${dash.esc(p.code)}</span></div>` +
      `<p class="rx-card__sub">Wystawił: ${dash.esc(p.doctor.name)} • ${dash.fmtDate((p.issuedAt || "").slice(0, 10))}</p>` +
      '<div class="appt-card__foot">' +
      `<button class="btn btn--ghost" type="button" data-rx="${p.id}">Szczegóły</button>` +
      "</div></article>"
    );
  }

  function openRxDetail(p) {
    const active = rxActive(p);
    const rows = [
      ["Lek", p.medication],
      ["Dawkowanie", p.dosage || "—"],
      ["Kod e-recepty", p.code],
      ["Lekarz", p.doctor.name],
      ["Data wystawienia", dash.fmtDate((p.issuedAt || "").slice(0, 10))],
      ["Ważna do", p.validUntil ? dash.fmtDate(p.validUntil) : "—"],
      ["Status", active ? "aktywna" : "wygasła"],
    ];
    const html =
      `<h3 class="detail__title">Szczegóły e-recepty</h3>` +
      '<div class="detail__list">' +
      rows.map((r) => `<div class="detail__row"><span>${r[0]}</span><strong>${dash.esc(r[1])}</strong></div>`).join("") +
      "</div>" +
      (p.notes ? `<div class="detail__note"><strong>Uwagi lekarza:</strong><br>${dash.esc(p.notes)}</div>` : "");
    dash.openModal(html, { label: "Szczegóły e-recepty" });
  }

  /* ---------- PROFIL ---------- */
  function prefillProfile() {
    const p = user.profile || {};
    el("pf-first").value = p.firstName || "";
    el("pf-last").value = p.lastName || "";
    el("pf-phone").value = p.phone || "";
    el("pf-birth").value = p.birthDate || "";
    el("pf-email").value = user.email || "";
  }

  function fieldError(id, msg) {
    const err = el(id + "-error");
    const wrap = el(id).closest(".field");
    if (err) err.textContent = msg || "";
    if (wrap) wrap.classList.toggle("has-error", Boolean(msg));
    return Boolean(msg);
  }

  function setupProfileForms() {
    // Zapis danych osobowych.
    el("profile-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const firstName = el("pf-first").value.trim();
      const lastName = el("pf-last").value.trim();
      const phone = el("pf-phone").value.trim();
      const birthDate = el("pf-birth").value;

      let bad = false;
      bad = fieldError("pf-first", firstName.length < 2 ? "Podaj imię" : "") || bad;
      bad = fieldError("pf-last", lastName.length < 2 ? "Podaj nazwisko" : "") || bad;
      bad = fieldError("pf-phone", phone && phone.replace(/[\s()+-]/g, "").length < 9 ? "Podaj poprawny numer" : "") || bad;
      if (bad) return;

      const btn = el("profile-save");
      btn.disabled = true; btn.textContent = "Zapisywanie…";
      try {
        const payload = { firstName, lastName };
        if (phone) payload.phone = phone;
        if (birthDate) payload.birthDate = birthDate;
        const res = await api.patch("/patients/me", payload);
        // Zaktualizuj lokalny stan + nagłówki.
        user.profile = Object.assign(user.profile || {}, {
          firstName: res.patient.firstName, lastName: res.patient.lastName,
          phone: res.patient.phone, birthDate: res.patient.birthDate,
        });
        mountSideUser();
        dash.toast("Dane zapisane.", "success");
      } catch (err) {
        if (err.details) Object.entries(err.details).forEach(([k, m]) => {
          const map = { firstName: "pf-first", lastName: "pf-last", phone: "pf-phone", birthDate: "pf-birth" };
          if (map[k]) fieldError(map[k], m);
        });
        handleApiError(err, "Nie udało się zapisać danych.");
      } finally {
        btn.disabled = false; btn.textContent = "Zapisz zmiany";
      }
    });

    // Zmiana hasła.
    el("password-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const oldPassword = el("pw-old").value;
      const newPassword = el("pw-new").value;
      const repeat = el("pw-rep").value;

      let bad = false;
      bad = fieldError("pw-old", oldPassword.length < 1 ? "Podaj obecne hasło" : "") || bad;
      bad = fieldError("pw-new", newPassword.length < 8 ? "Nowe hasło musi mieć min. 8 znaków" : "") || bad;
      bad = fieldError("pw-rep", repeat !== newPassword ? "Hasła nie są takie same" : "") || bad;
      if (bad) return;

      const btn = el("password-save");
      btn.disabled = true; btn.textContent = "Zmienianie…";
      try {
        await api.post("/auth/change-password", { oldPassword, newPassword });
        el("password-form").reset();
        dash.toast("Hasło zostało zmienione.", "success");
      } catch (err) {
        if (err.details && err.details.oldPassword) fieldError("pw-old", err.details.oldPassword);
        handleApiError(err, "Nie udało się zmienić hasła.");
      } finally {
        btn.disabled = false; btn.textContent = "Zmień hasło";
      }
    });
  }

  /* ---------- NAWIGACJA / ROUTING / DRAWER ---------- */
  function showView(name) {
    if (!VIEWS.includes(name)) name = "przeglad";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll(".side-nav__link, .bottom-nav__link").forEach((l) =>
      l.classList.toggle("is-active", l.dataset.view === name)
    );
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    closeDrawer();
    window.scrollTo({ top: 0 });
  }

  function setupNavigation() {
    window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

    // Drawer (mobile)
    const sideNav = el("side-nav");
    const scrim = el("side-scrim");
    const toggle = el("side-toggle");
    window.__closeDrawer = () => {
      sideNav.classList.remove("is-open");
      scrim.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("no-scroll");
    };
    function openDrawer() {
      sideNav.classList.add("is-open");
      scrim.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("no-scroll");
    }
    toggle.addEventListener("click", () =>
      sideNav.classList.contains("is-open") ? window.__closeDrawer() : openDrawer()
    );
    scrim.addEventListener("click", window.__closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sideNav.classList.contains("is-open")) window.__closeDrawer();
    });
  }

  function closeDrawer() {
    if (window.__closeDrawer) window.__closeDrawer();
  }
})();
