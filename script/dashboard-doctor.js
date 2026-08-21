/* =============================================================
   dashboard-doctor.js
   Panel lekarza (SPA po hashu URL). Widoki: Przegląd, Kalendarz,
   Dostępność, Pacjenci, Recepty, Statystyki, Profil.
   Dane z REST API; listę pacjentów i statystyki wyliczamy po stronie
   klienta z /appointments i /prescriptions.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia.api;
  const dash = window.Zdrovia.dash;
  const el = (id) => document.getElementById(id);

  const VIEWS = ["przeglad", "kalendarz", "dostepnosc", "pacjenci", "recepty", "statystyki", "profil"];
  const SPEC_LABEL = {
    internista: "Internista", pediatra: "Pediatra", dermatolog: "Dermatolog",
    psychiatra: "Psychiatra", ginekolog: "Ginekolog", kardiolog: "Kardiolog",
    laryngolog: "Laryngolog", endokrynolog: "Endokrynolog",
  };
  const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8:00 … 19:00
  const DAYS = [[1, "Poniedziałek"], [2, "Wtorek"], [3, "Środa"], [4, "Czwartek"],
                [5, "Piątek"], [6, "Sobota"], [0, "Niedziela"]];

  const CAL = '<svg class="ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>';
  const ICO_CAL = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>';
  const ICO_USERS = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-3-4.9"/></svg>';
  const ICO_PILL = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(45 12 12)"><rect x="4" y="8.5" width="16" height="7" rx="3.5"/><path d="M12 8.5v7"/></g></svg>';
  const emptyIco = (svg) => `<div class="empty__ico">${svg}</div>`;

  let me = null;
  let appointments = [];
  let prescriptions = [];
  let calStatus = "all";
  let calPeriod = "all";
  const availSelected = new Set();
  const availOccupied = new Set();

  init();

  async function init() {
    me = await dash.guard("doctor");
    if (!me) return;
    dash.mountUser(me);
    mountSideUser();
    setupNavigation();
    setupCalendarControls();
    setupRxForm();
    setupProfile();
    setupPatientSearch();
    setupRxFilter();
    el("avail-save").addEventListener("click", saveAvailability);

    showView((location.hash || "#przeglad").slice(1));
    await loadAll();
    setupRealtime();
  }

  /* Aktualizacje na żywo (Socket.io): nowa wizyta / zmiana statusu przez pacjenta. */
  function setupRealtime() {
    const rt = window.Zdrovia.realtime;
    if (!rt) return;
    rt.on("appointment:new", () => {
      dash.toast("Nowa wizyta w Twoim kalendarzu.", "success");
      loadAll(true);
    });
    rt.on("appointment:updated", () => {
      dash.toast("Pacjent zmienił wizytę.", "info");
      loadAll(true);
    });
    rt.connect();
  }

  /* ---------- Pomocnicze ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  function startOfWeek() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // poniedziałek
    return d;
  }
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const rxActive = (p) => !p.validUntil || p.validUntil >= todayStr();

  function mountSideUser() {
    const name = me.profile ? me.profile.name : me.email;
    el("side-user-name").textContent = name;
    el("side-avatar").textContent = dash.initials(name);
    el("welcome-sub").textContent = `Witaj, ${me.profile ? me.profile.name : ""}! 👋`;
  }

  function handleApiError(err, fallback) {
    if (err && err.status === 401) {
      dash.toast("Sesja wygasła — zaloguj się ponownie.", "error");
      api.setToken(null);
      setTimeout(() => { window.location.href = "login.html?next=dashboard-doctor.html"; }, 1300);
      return true;
    }
    dash.toast(fallback || (err && err.message) || "Wystąpił błąd.", "error");
    return false;
  }
  const skeletons = (n) => Array.from({ length: n }, () => '<div class="skeleton skel-card"></div>').join("");

  /* ---------- Ładowanie ---------- */
  async function loadAll(quiet) {
    if (!quiet) {
      el("today-list").innerHTML = skeletons(2);
      el("cal-list").innerHTML = skeletons(3);
    }
    try {
      const [a, p] = await Promise.all([api.get("/appointments"), api.get("/prescriptions")]);
      appointments = a.appointments;
      prescriptions = p.prescriptions;
    } catch (err) {
      if (err.status === 401) return handleApiError(err);
      el("global-alert").textContent = "Nie udało się połączyć z serwerem. Odśwież stronę lub spróbuj ponownie później.";
      el("global-alert").hidden = false;
      el("today-list").innerHTML = el("cal-list").innerHTML = '<p class="empty">Brak danych.</p>';
      return;
    }
    el("global-alert").hidden = true;
    renderStats();
    renderToday();
    renderCalendar();
    renderPatients();
    populateRxSelect();
    renderRxHistory();
    renderCharts();
    prefillProfile();
    renderPreview();
    await loadAvailability();
  }

  /* ---------- PRZEGLĄD ---------- */
  function renderStats() {
    const mon = startOfWeek();
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const inWeek = (a) => a.date >= ymd(mon) && a.date <= ymd(sun);
    el("stat-week").textContent = appointments.filter((a) => a.status !== "anulowana" && inWeek(a)).length;
    el("stat-patients").textContent = new Set(appointments.map((a) => a.patient.id)).size;
    el("stat-rating").textContent = me.profile && me.profile.rating ? Number(me.profile.rating).toFixed(1) : "—";
    const revenue = appointments.filter((a) => a.status === "zrealizowana").reduce((s, a) => s + (a.price || 0), 0);
    el("stat-revenue").textContent = revenue.toLocaleString("pl-PL") + " zł";
  }

  function renderToday() {
    const t = todayStr();
    const list = appointments.filter((a) => a.date === t && a.status !== "anulowana")
      .sort((a, b) => a.time.localeCompare(b.time));
    const box = el("today-list");
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + emptyIco(ICO_CAL) + "<p>Brak wizyt zaplanowanych na dziś.</p></div>";
      return;
    }
    box.innerHTML = '<div class="data-list">' + list.map((a) => `
      <div class="data-item">
        <span class="data-item__avatar" style="background:#0E9F8E">${dash.initials(a.patient.name)}</span>
        <div class="data-item__main">
          <p class="data-item__title">${a.time} • ${dash.esc(a.patient.name)}</p>
          <p class="data-item__sub">${a.serviceLabel} • ${a.consultationType || "wideo"}</p>
          <div class="data-item__meta">${dash.statusBadge(a.status)}</div>
        </div>
        <div class="data-item__actions">
          <button class="btn btn--primary" type="button" data-start="${a.id}">Rozpocznij</button>
          <button class="btn btn--ghost" type="button" data-detail="${a.id}">Szczegóły</button>
        </div>
      </div>`).join("") + "</div>";
    box.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () =>
      dash.toast("Wideokonsultacja rozpocznie się w tym oknie (wersja demo).", "info", 4500)));
    box.querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () =>
      openApptDetail(appointments.find((x) => x.id === Number(b.dataset.detail)))));
  }

  /* ---------- KALENDARZ ---------- */
  function setupCalendarControls() {
    document.querySelectorAll("#view-kalendarz .tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        calStatus = tab.dataset.status;
        document.querySelectorAll("#view-kalendarz .tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        renderCalendar();
      })
    );
    el("cal-period").addEventListener("change", (e) => { calPeriod = e.target.value; renderCalendar(); });
  }

  function renderCalendar() {
    const t = todayStr();
    const mon = ymd(startOfWeek());
    const sunD = new Date(startOfWeek()); sunD.setDate(sunD.getDate() + 6);
    const sun = ymd(sunD);

    let list = appointments.slice();
    if (calStatus !== "all") list = list.filter((a) => a.status === calStatus);
    if (calPeriod === "today") list = list.filter((a) => a.date === t);
    else if (calPeriod === "upcoming") list = list.filter((a) => a.date >= t && a.status !== "anulowana");
    else if (calPeriod === "week") list = list.filter((a) => a.date >= mon && a.date <= sun);

    const box = el("cal-list");
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + emptyIco(ICO_CAL) + "<p>Brak wizyt dla wybranych filtrów.</p></div>";
      return;
    }
    // Grupowanie po dacie (malejąco).
    const byDate = {};
    list.forEach((a) => (byDate[a.date] = byDate[a.date] || []).push(a));
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    box.innerHTML = dates.map((date) => {
      const items = byDate[date].sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="cal-day"><h3 class="cal-day__label">${dash.fmtDate(date)}</h3>` +
        '<div class="appt-grid">' + items.map(calCard).join("") + "</div></div>";
    }).join("");

    box.querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", () => markDone(Number(b.dataset.done))));
    box.querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () =>
      openApptDetail(appointments.find((x) => x.id === Number(b.dataset.detail)))));
    box.querySelectorAll("[data-rx]").forEach((b) => b.addEventListener("click", () => startPrescription(Number(b.dataset.rx))));
  }

  function calCard(a) {
    return `<article class="appt-card">
      <div class="appt-card__head">
        <span class="appt-card__avatar" style="background:#0E9F8E">${dash.initials(a.patient.name)}</span>
        <div><p class="appt-card__name">${dash.esc(a.patient.name)}</p>
        <p class="appt-card__spec">${a.serviceLabel} • ${a.consultationType || "wideo"}</p></div>
      </div>
      <div class="appt-card__row">${dash.statusBadge(a.status)}<span class="ico-txt">${CAL}${a.time}</span></div>
      <div class="appt-card__foot">
        <button class="btn btn--ghost" type="button" data-detail="${a.id}">Szczegóły</button>
        ${a.status === "zaplanowana" ? `<button class="btn btn--primary" type="button" data-done="${a.id}">Zrealizowana</button>` : ""}
        ${a.status !== "anulowana" ? `<button class="btn btn--ghost" type="button" data-rx="${a.id}">Recepta</button>` : ""}
      </div></article>`;
  }

  async function markDone(id) {
    try {
      const res = await api.patch(`/appointments/${id}`, { status: "zrealizowana" });
      const a = appointments.find((x) => x.id === id);
      if (a) Object.assign(a, res.appointment);
      renderStats(); renderToday(); renderCalendar(); renderCharts(); populateRxSelect(); renderAvailDays();
      dash.toast("Wizyta oznaczona jako zrealizowana.", "success");
    } catch (err) { handleApiError(err, "Nie udało się zmienić statusu wizyty."); }
  }

  function openApptDetail(a) {
    if (!a) return;
    const rows = [
      ["Pacjent", a.patient.name],
      ["E-mail", a.patient.email || "—"],
      ["Usługa", a.serviceLabel],
      ["Forma", a.consultationType || "wideo"],
      ["Termin", `${dash.fmtDate(a.date)}, godz. ${a.time}`],
      ["Status", a.status],
      a.price ? ["Cena", `${a.price} zł${a.paid ? " (opłacone)" : ""}`] : null,
    ].filter(Boolean);
    const html = `<h3 class="detail__title">Szczegóły wizyty</h3><div class="detail__list">` +
      rows.map((r) => `<div class="detail__row"><span>${r[0]}</span><strong>${dash.esc(r[1])}</strong></div>`).join("") +
      "</div>" + (a.reason ? `<div class="detail__note"><strong>Powód / notatki:</strong><br>${dash.esc(a.reason).replace(/\n/g, "<br>")}</div>` : "");
    dash.openModal(html, { label: "Szczegóły wizyty" });
  }

  /* ---------- DOSTĘPNOŚĆ ---------- */
  async function loadAvailability() {
    availSelected.clear();
    availOccupied.clear();
    // Sloty zajęte = nadchodzące zaplanowane wizyty (weekday + godzina).
    appointments.filter((a) => a.status === "zaplanowana").forEach((a) => {
      const wd = new Date(a.date + "T00:00:00").getDay();
      const h = parseInt(a.time, 10);
      if (h >= 8 && h < 20) { availOccupied.add(wd + "-" + h); availSelected.add(wd + "-" + h); }
    });
    try {
      const { windows } = await api.get(`/doctors/${me.id}/availability`);
      windows.forEach((w) => {
        const sh = Math.max(8, parseInt(w.startTime, 10));
        const eh = Math.min(20, parseInt(w.endTime, 10));
        for (let h = sh; h < eh; h++) availSelected.add(w.weekday + "-" + h);
      });
    } catch (_e) { /* pomiń */ }
    renderAvailDays();
  }

  function renderAvailDays() {
    el("avail-days").innerHTML = DAYS.map(([wd, label]) => {
      const chips = HOURS.map((h) => {
        const key = wd + "-" + h;
        const sel = availSelected.has(key), busy = availOccupied.has(key);
        return `<button type="button" class="avail-slot${sel ? " is-selected" : ""}${busy ? " is-busy" : ""}"
                  data-key="${key}" ${busy ? 'disabled aria-disabled="true"' : ""} aria-pressed="${sel}"
                  aria-label="${label} ${h}:00${busy ? " — zajęte przez wizytę" : ""}">${h}:00</button>`;
      }).join("");
      return `<div class="avail-day"><div class="avail-day__head"><strong>${label}</strong>
        <button type="button" class="avail-day__all" data-wd="${wd}">Zaznacz cały dzień</button></div>
        <div class="avail-day__slots">${chips}</div></div>`;
    }).join("");

    el("avail-days").querySelectorAll(".avail-slot:not([disabled])").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.key;
        if (availSelected.has(k)) availSelected.delete(k); else availSelected.add(k);
        b.classList.toggle("is-selected");
        b.setAttribute("aria-pressed", String(availSelected.has(k)));
      })
    );
    el("avail-days").querySelectorAll(".avail-day__all").forEach((b) =>
      b.addEventListener("click", () => {
        const wd = b.dataset.wd;
        const keys = HOURS.map((h) => wd + "-" + h).filter((k) => !availOccupied.has(k));
        const allSel = keys.every((k) => availSelected.has(k));
        keys.forEach((k) => (allSel ? availSelected.delete(k) : availSelected.add(k)));
        renderAvailDays();
      })
    );
  }

  async function saveAvailability() {
    const slots = [];
    DAYS.forEach(([wd]) => {
      const hrs = HOURS.filter((h) => availSelected.has(wd + "-" + h)).sort((a, b) => a - b);
      let i = 0;
      while (i < hrs.length) {
        let j = i;
        while (j + 1 < hrs.length && hrs[j + 1] === hrs[j] + 1) j++;
        slots.push({ weekday: wd, startTime: pad2(hrs[i]) + ":00", endTime: pad2(hrs[j] + 1) + ":00" });
        i = j + 1;
      }
    });
    const btn = el("avail-save");
    btn.disabled = true; btn.textContent = "Zapisywanie…";
    try {
      await api.patch(`/doctors/${me.id}/availability`, { slots });
      dash.toast("Dostępność zapisana.", "success");
    } catch (err) { handleApiError(err, "Nie udało się zapisać dostępności."); }
    finally { btn.disabled = false; btn.textContent = "Zapisz dostępność"; }
  }

  /* ---------- PACJENCI ---------- */
  function derivePatients() {
    const map = new Map();
    appointments.forEach((a) => {
      const p = a.patient;
      if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, email: p.email, visits: 0, last: "" });
      const e = map.get(p.id);
      e.visits++;
      if (a.date > e.last) e.last = a.date;
    });
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }

  function setupPatientSearch() {
    el("patient-search").addEventListener("input", (e) => renderPatients(e.target.value.trim().toLowerCase()));
  }

  function renderPatients(filter) {
    const list = derivePatients().filter((p) => !filter || p.name.toLowerCase().includes(filter));
    const box = el("patient-list");
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + emptyIco(ICO_USERS) +
        `<p>${filter ? "Brak pacjentów pasujących do wyszukiwania." : "Nie masz jeszcze pacjentów."}</p></div>`;
      return;
    }
    box.innerHTML = list.map((p) => `
      <div class="patient-row">
        <span class="patient-row__avatar" style="background:#0E9F8E">${dash.initials(p.name)}</span>
        <div class="patient-row__main">
          <p class="patient-row__name">${dash.esc(p.name)}</p>
          <p class="patient-row__sub">${dash.esc(p.email || "")}</p>
        </div>
        <div class="patient-row__meta">
          <span class="patient-row__count">${p.visits} ${p.visits === 1 ? "wizyta" : "wizyt"}</span>
          <span class="patient-row__sub">ostatnia: ${dash.fmtDate(p.last)}</span>
        </div>
        <button class="btn btn--ghost" type="button" data-hist="${p.id}">Historia</button>
      </div>`).join("");
    box.querySelectorAll("[data-hist]").forEach((b) =>
      b.addEventListener("click", () => openPatientHistory(Number(b.dataset.hist))));
  }

  function openPatientHistory(pid) {
    const appts = appointments.filter((a) => a.patient.id === pid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const rxs = prescriptions.filter((p) => p.patient.id === pid);
    const name = appts[0] ? appts[0].patient.name : "Pacjent";
    const html =
      `<h3 class="detail__title">Historia: ${dash.esc(name)}</h3>` +
      `<p class="data-item__sub" style="margin-bottom:.5rem">Wizyty (${appts.length})</p>` +
      (appts.length ? '<div class="data-list">' + appts.map((a) => `
        <div class="data-item">
          <div class="data-item__main">
            <p class="data-item__title">${a.serviceLabel} • ${a.consultationType || "wideo"}</p>
            <p class="data-item__sub">${dash.fmtDate(a.date)}, ${a.time}</p>
            <div class="data-item__meta">${dash.statusBadge(a.status)}</div>
          </div>
        </div>`).join("") + "</div>" : '<p class="empty">Brak wizyt.</p>') +
      `<p class="data-item__sub" style="margin:var(--space-4) 0 .5rem">Recepty (${rxs.length})</p>` +
      (rxs.length ? '<div class="data-list">' + rxs.map((p) => `
        <div class="data-item">
          <div class="data-item__main">
            <p class="data-item__title">${dash.esc(p.medication)}</p>
            <p class="data-item__sub">${dash.esc(p.dosage || "")} • <span class="rx-code">${dash.esc(p.code)}</span></p>
          </div>
        </div>`).join("") + "</div>" : '<p class="empty">Brak recept.</p>');
    dash.openModal(html, { label: "Historia pacjenta" });
  }

  /* ---------- RECEPTY ---------- */
  function populateRxSelect() {
    const sel = el("rx-appointment");
    const cur = sel.value;
    sel.innerHTML = '<option value="">— wybierz wizytę —</option>';
    appointments.filter((a) => a.status !== "anulowana")
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = `${a.patient.name} — ${dash.fmtDate(a.date)} ${a.time}`;
        sel.appendChild(o);
      });
    if (cur) sel.value = cur;
  }

  function startPrescription(apptId) {
    populateRxSelect();
    el("rx-appointment").value = apptId;
    showView("recepty");
    setTimeout(() => el("rx-medication").focus(), 60);
  }

  function fieldError(id, msg) {
    const err = el(id + "-error");
    const wrap = el(id).closest(".field");
    if (err) err.textContent = msg || "";
    if (wrap) wrap.classList.toggle("has-error", Boolean(msg));
    return Boolean(msg);
  }

  function setupRxForm() {
    el("rx-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const appointmentId = el("rx-appointment").value;
      const medication = el("rx-medication").value.trim();
      let bad = false;
      bad = fieldError("rx-appointment", appointmentId ? "" : "Wybierz wizytę") || bad;
      bad = fieldError("rx-medication", medication.length < 2 ? "Podaj nazwę leku" : "") || bad;
      if (bad) return;

      const btn = el("rx-submit");
      btn.disabled = true; btn.textContent = "Wystawianie…";
      try {
        const { prescription } = await api.post("/prescriptions", {
          appointmentId: Number(appointmentId),
          medication,
          dosage: el("rx-dosage").value.trim() || undefined,
          notes: el("rx-notes").value.trim() || undefined,
          validUntil: el("rx-valid").value || undefined,
        });
        // Recepta i zmiana statusu wizyty → odśwież powiązane widoki.
        const [ap, pr] = await Promise.all([api.get("/appointments"), api.get("/prescriptions")]);
        appointments = ap.appointments; prescriptions = pr.prescriptions;
        el("rx-form").reset();
        renderStats(); renderToday(); renderCalendar(); renderRxHistory(); populateRxSelect(); renderPatients(); renderCharts();
        dash.toast(`Recepta wystawiona. Kod: ${prescription.code}`, "success");
      } catch (err) {
        if (err.details && err.details.appointmentId) fieldError("rx-appointment", err.details.appointmentId);
        handleApiError(err, "Nie udało się wystawić recepty.");
      } finally {
        btn.disabled = false; btn.textContent = "Wystaw receptę";
      }
    });
  }

  function setupRxFilter() {
    el("rx-filter").addEventListener("input", (e) => renderRxHistory(e.target.value.trim().toLowerCase()));
  }

  function renderRxHistory(filter) {
    let list = prescriptions.slice();
    if (filter) list = list.filter((p) =>
      (p.patient.name + " " + p.medication).toLowerCase().includes(filter));
    const box = el("rx-history");
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + emptyIco(ICO_PILL) +
        `<p>${filter ? "Brak recept pasujących do filtra." : "Nie wystawiłeś jeszcze żadnej recepty."}</p></div>`;
      return;
    }
    box.innerHTML = list.map((p) => {
      const active = rxActive(p);
      return `<div class="data-item">
        <span class="data-item__avatar" style="background:#0B7A6D">Rx</span>
        <div class="data-item__main">
          <p class="data-item__title">${dash.esc(p.medication)}</p>
          <p class="data-item__sub">${dash.esc(p.patient.name)} • ${dash.fmtDate((p.issuedAt || "").slice(0, 10))}</p>
          <div class="data-item__meta">
            <span class="status status--${active ? "aktywna" : "wygasla"}">${active ? "aktywna" : "wygasła"}</span>
            <span class="rx-code">${dash.esc(p.code)}</span>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- STATYSTYKI ---------- */
  function renderCharts() {
    // Wizyty w ostatnich 4 tygodniach (kolumny).
    const mon = startOfWeek();
    const buckets = [0, 0, 0, 0];
    appointments.forEach((a) => {
      if (a.status === "anulowana") return;
      const d = new Date(a.date + "T00:00:00");
      const wi = Math.floor((d - mon) / (7 * 86400000)); // 0 = ten tydzień, -1 poprzedni…
      const idx = wi + 3;
      if (idx >= 0 && idx <= 3) buckets[idx]++;
    });
    const labels = ["3 tyg.", "2 tyg.", "tydzień", "ten tydz."];
    const max = Math.max(1, ...buckets);
    const W = 320, slotW = W / 4, bw = 46;
    let bars = "";
    buckets.forEach((v, i) => {
      const h = (v / max) * 118;
      const x = i * slotW + (slotW - bw) / 2;
      const y = 150 - h;
      bars += `<rect class="chart-bar" x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 2)}" rx="6"></rect>` +
              `<text class="chart-val" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="13">${v}</text>` +
              `<text class="chart-label" x="${x + bw / 2}" y="170" text-anchor="middle">${labels[i]}</text>`;
    });
    el("chart-weeks").innerHTML =
      `<svg class="chart" viewBox="0 0 ${W} 180" role="img" aria-label="Wizyty w ostatnich 4 tygodniach">
         <line class="chart-axis" x1="0" y1="150" x2="${W}" y2="150"/>${bars}</svg>`;

    // Rozkład wg statusu (paski proporcji).
    const c = { zrealizowana: 0, zaplanowana: 0, anulowana: 0 };
    appointments.forEach((a) => { if (c[a.status] != null) c[a.status]++; });
    const total = Math.max(1, appointments.length);
    const rows = [
      ["zrealizowana", "Zrealizowane", "var(--c-chart-ok)"],
      ["zaplanowana", "Zaplanowane", "var(--c-chart-info)"],
      ["anulowana", "Anulowane", "var(--c-chart-danger)"],
    ];
    el("chart-status").innerHTML = rows.map(([k, label, color]) => {
      const v = c[k], pct = Math.round((v / total) * 100);
      return `<div class="distrib"><div class="distrib__top"><span>${label}</span><strong>${v} (${pct}%)</strong></div>
        <div class="distrib__track"><div class="distrib__bar" style="width:${pct}%;background:${color}"></div></div></div>`;
    }).join("");
  }

  /* ---------- PROFIL ---------- */
  function prefillProfile() {
    const p = me.profile || {};
    if (p.specialization) el("pf-spec").value = p.specialization;
    el("pf-years").value = p.yearsExperience != null ? p.yearsExperience : "";
    el("pf-price").value = p.consultationPrice != null ? p.consultationPrice : "";
    el("pf-city").value = p.city || "";
    el("pf-bio").value = p.bio || "";
  }

  function setupProfile() {
    ["pf-spec", "pf-years", "pf-price", "pf-city", "pf-bio"].forEach((id) =>
      el(id).addEventListener("input", renderPreview));

    el("profile-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const years = el("pf-years").value;
      const price = el("pf-price").value;
      let bad = false;
      bad = fieldError("pf-years", years !== "" && (+years < 0 || +years > 70) ? "0–70" : "") || bad;
      bad = fieldError("pf-price", price !== "" && (+price < 0 || +price > 100000) ? "Nieprawidłowa cena" : "") || bad;
      if (bad) return;

      const btn = el("profile-save");
      btn.disabled = true; btn.textContent = "Zapisywanie…";
      try {
        const res = await api.patch(`/doctors/${me.id}`, {
          specialization: el("pf-spec").value,
          yearsExperience: years !== "" ? Number(years) : undefined,
          consultationPrice: price !== "" ? Number(price) : undefined,
          city: el("pf-city").value.trim() || undefined,
          bio: el("pf-bio").value.trim() || undefined,
        });
        me.profile = Object.assign(me.profile || {}, res.doctor);
        mountSideUser();
        renderStats();
        dash.toast("Profil zaktualizowany.", "success");
      } catch (err) { handleApiError(err, "Nie udało się zapisać profilu."); }
      finally { btn.disabled = false; btn.textContent = "Zapisz profil"; }
    });
  }

  function renderPreview() {
    const p = me.profile || {};
    const spec = el("pf-spec").value || p.specialization;
    const years = el("pf-years").value || p.yearsExperience || 0;
    const price = el("pf-price").value || p.consultationPrice || 0;
    const city = el("pf-city").value || p.city || "";
    const bio = el("pf-bio").value || p.bio || "";
    const rating = p.rating != null ? Number(p.rating).toFixed(1) : "5.0";
    const fill = (Number(rating) / 5) * 100;
    el("doc-preview").innerHTML = `
      <div class="prevcard">
        <div class="prevcard__head">
          <span class="prevcard__avatar" style="background:${p.color || "#0E9F8E"}">${dash.initials(p.name || "")}</span>
          <div>
            <p class="prevcard__name">${dash.esc(p.name || "")}</p>
            <p class="prevcard__spec">${SPEC_LABEL[spec] || spec}</p>
          </div>
        </div>
        <div class="prevcard__meta">
          <span class="rating"><span class="stars" style="--fill:${fill}%"></span>${rating}</span>
          <span class="prevcard__muted">${dash.esc(city)} • ${years} lat dośw.</span>
        </div>
        <p class="prevcard__bio">${dash.esc((bio || "").slice(0, 120))}${bio.length > 120 ? "…" : ""}</p>
        <div class="prevcard__foot">
          <span class="prevcard__price">${price} zł <span>/ wizyta</span></span>
        </div>
      </div>`;
  }

  /* ---------- NAWIGACJA / DRAWER ---------- */
  function showView(name) {
    if (!VIEWS.includes(name)) name = "przeglad";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll(".side-nav__link, .bottom-nav__link").forEach((l) =>
      l.classList.toggle("is-active", l.dataset.view === name));
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    closeDrawer();
    window.scrollTo({ top: 0 });
  }

  function setupNavigation() {
    window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
    const sideNav = el("side-nav"), scrim = el("side-scrim"), toggle = el("side-toggle");
    window.__closeDrawer = () => {
      sideNav.classList.remove("is-open"); scrim.hidden = true;
      toggle.setAttribute("aria-expanded", "false"); document.body.classList.remove("no-scroll");
    };
    const open = () => {
      sideNav.classList.add("is-open"); scrim.hidden = false;
      toggle.setAttribute("aria-expanded", "true"); document.body.classList.add("no-scroll");
    };
    toggle.addEventListener("click", () => sideNav.classList.contains("is-open") ? window.__closeDrawer() : open());
    scrim.addEventListener("click", window.__closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sideNav.classList.contains("is-open")) window.__closeDrawer();
    });
  }
  function closeDrawer() { if (window.__closeDrawer) window.__closeDrawer(); }
})();
