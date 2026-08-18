/* =============================================================
   umow.js
   Wieloetapowy kreator rezerwacji / zamówienia płatnej usługi:
   1) usługa → 2) lekarz → 3) termin + forma → 4) szczegóły
   (powód + kwestionariusz) → 5) płatność (SYMULOWANA) → sukces.
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

  // Katalog usług (wspólny — script/services.js; spójny z backendem).
  const SERVICES = window.Zdrovia.SERVICES;
  const svc = (key) => SERVICES.find((s) => s.key === key);

  const PAY_LABEL = { blik: "BLIK", karta: "Karta", przelew: "Szybki przelew" };

  let doctors = [];
  let step = 1;
  const state = {
    service: null, doctorId: null, doctor: null,
    consultationType: "wideo", date: null, time: null,
    reason: "", paymentMethod: null, q: {},
  };

  init();

  async function init() {
    const user = await dash.guard("patient");
    if (!user) return;
    dash.mountUser(user);

    renderServices();
    try {
      const res = await api.get("/doctors");
      doctors = res.doctors;
    } catch (_e) { doctors = []; }
    populateSpecFilter();
    wireNav();
    preselectFromQuery();
    updateNav();
  }

  /* ---------- KROK 1: usługi ---------- */
  function renderServices() {
    el("service-tiles").innerHTML = SERVICES.map(
      (s) => `
      <button class="service-tile" type="button" data-service="${s.key}" aria-pressed="false">
        <span class="service-tile__icon" aria-hidden="true">${s.icon}</span>
        <span class="service-tile__name">${s.label}</span>
        <span class="service-tile__price">${s.price ? s.price + " zł" : "cena zależna od lekarza"}</span>
        <span class="service-tile__desc">${s.desc}</span>
      </button>`
    ).join("");

    el("service-tiles").querySelectorAll(".service-tile").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.service = btn.dataset.service;
        el("service-tiles").querySelectorAll(".service-tile")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        updateNav();
      })
    );
  }

  /* ---------- KROK 2: lekarz ---------- */
  function populateSpecFilter() {
    const specs = [...new Set(doctors.map((d) => d.specialization))];
    const sel = el("wiz-spec");
    specs.forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = SPEC_LABEL[s] || s;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => renderDoctorCards(sel.value));
  }

  function renderDoctorCards(spec) {
    const list = doctors.filter((d) => spec === "all" || d.specialization === spec);
    const wrap = el("doctor-cards");
    if (!list.length) { wrap.innerHTML = `<p class="empty">Brak lekarzy w tej specjalizacji.</p>`; return; }
    wrap.innerHTML = list
      .map(
        (d) => `
      <button class="doctor-pick" type="button" data-id="${d.id}" aria-pressed="${state.doctorId === d.id}">
        <span class="doctor-pick__avatar" style="background:${d.color}">${dash.initials(d.name)}</span>
        <span class="doctor-pick__main">
          <span class="doctor-pick__name">${dash.esc(d.name)}</span>
          <span class="doctor-pick__sub">${SPEC_LABEL[d.specialization] || d.specialization} • ${d.city || ""}</span>
          <span class="doctor-pick__sub">★ ${Number(d.rating).toFixed(1)} • ${d.consultationPrice} zł / konsultacja</span>
        </span>
      </button>`
      )
      .join("");

    wrap.querySelectorAll(".doctor-pick").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.doctorId = Number(btn.dataset.id);
        state.doctor = doctors.find((d) => d.id === state.doctorId);
        wrap.querySelectorAll(".doctor-pick").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        // reset wyboru terminu przy zmianie lekarza
        state.date = state.time = null;
        updateNav();
      })
    );
  }

  /* ---------- KROK 3: termin + forma ---------- */
  function wireConsultationType() {
    el("ctype-row").querySelectorAll(".choice").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.consultationType = btn.dataset.ctype;
        el("ctype-row").querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      })
    );
  }

  async function loadSlots() {
    const area = el("wizard-slots");
    area.innerHTML = `<div class="loading-row"><span class="spinner"></span> Wczytywanie terminów…</div>`;
    try {
      const { slots } = await api.get(`/doctors/${state.doctorId}/availability`);
      if (!slots.length) { area.innerHTML = `<p class="empty">Brak wolnych terminów w najbliższym czasie.</p>`; return; }
      const byDate = {};
      slots.slice(0, 24).forEach((s) => (byDate[s.date] = byDate[s.date] || []).push(s));
      area.innerHTML = Object.entries(byDate)
        .map(
          ([date, items]) => `
        <div class="slot-day">
          <p class="slot-day__label">${dash.fmtDate(date)}</p>
          <div class="slot-grid">
            ${items.map((s) => `<button class="slot-btn" type="button" data-date="${s.date}" data-time="${s.time}" aria-pressed="${state.date === s.date && state.time === s.time}">${s.time}</button>`).join("")}
          </div>
        </div>`
        )
        .join("");
      area.querySelectorAll(".slot-btn").forEach((btn) =>
        btn.addEventListener("click", () => {
          area.querySelectorAll(".slot-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
          btn.setAttribute("aria-pressed", "true");
          state.date = btn.dataset.date;
          state.time = btn.dataset.time;
          updateNav();
        })
      );
    } catch (_e) {
      area.innerHTML = `<p class="empty">Nie udało się wczytać terminów.</p>`;
    }
  }

  /* ---------- KROK 4: kwestionariusz zależny od usługi ---------- */
  function renderQuestionnaire() {
    const q = el("questionnaire");
    const s = state.service;
    let html = "";
    if (s === "recepta") {
      html = `
        <div class="field">
          <label class="field__label" for="q-med">Nazwa leku</label>
          <input class="field__input" id="q-med" placeholder="np. Euthyrox 50 µg" />
        </div>
        <div class="field field--check">
          <input class="field__checkbox" type="checkbox" id="q-chronic" checked />
          <label class="field__consent" for="q-chronic">To lek, który przyjmuję na stałe.</label>
        </div>`;
    } else if (s === "zwolnienie") {
      html = `
        <div class="two-col">
          <div class="field"><label class="field__label" for="q-from">Zwolnienie od</label>
            <input class="field__input" type="date" id="q-from" /></div>
          <div class="field"><label class="field__label" for="q-to">do</label>
            <input class="field__input" type="date" id="q-to" /></div>
        </div>
        <div class="field"><label class="field__label" for="q-work">Miejsce pracy / NIP pracodawcy (opcjonalnie)</label>
          <input class="field__input" id="q-work" placeholder="np. 000-00-00-000" /></div>`;
    } else if (s === "skierowanie") {
      html = `
        <div class="field"><label class="field__label" for="q-ref">Na jakie badanie / do jakiego specjalisty?</label>
          <input class="field__input" id="q-ref" placeholder="np. USG jamy brzusznej" /></div>`;
    } else {
      html = `<p class="data-item__sub">Podczas konsultacji lekarz zbierze szczegółowy wywiad.</p>`;
    }
    q.innerHTML = html;
  }

  function collectQuestionnaire() {
    const g = (id) => (el(id) ? el(id).value.trim() : "");
    const parts = [];
    if (state.service === "recepta") {
      if (g("q-med")) parts.push(`Lek: ${g("q-med")}${el("q-chronic") && el("q-chronic").checked ? " (przyjmowany na stałe)" : ""}`);
    } else if (state.service === "zwolnienie") {
      if (g("q-from") || g("q-to")) parts.push(`Okres L4: ${g("q-from") || "?"} – ${g("q-to") || "?"}`);
      if (g("q-work")) parts.push(`Pracodawca: ${g("q-work")}`);
    } else if (state.service === "skierowanie") {
      if (g("q-ref")) parts.push(`Skierowanie: ${g("q-ref")}`);
    }
    return parts.join("\n");
  }

  /* ---------- KROK 5: podsumowanie + płatność ---------- */
  function priceOf() {
    const s = svc(state.service);
    return s.price != null ? s.price : (state.doctor ? state.doctor.consultationPrice : 0);
  }

  function renderSummary() {
    const s = svc(state.service);
    el("order-summary").innerHTML = `
      <div class="sum-row"><span>Usługa</span><strong>${s.label}</strong></div>
      <div class="sum-row"><span>Lekarz</span><strong>${dash.esc(state.doctor.name)}</strong></div>
      <div class="sum-row"><span>Termin</span><strong>${dash.fmtDate(state.date)}, ${state.time}</strong></div>
      <div class="sum-row"><span>Forma</span><strong>${state.consultationType}</strong></div>
      <div class="sum-row sum-row--total"><span>Do zapłaty</span><strong>${priceOf()} zł</strong></div>`;
    el("pay-btn").textContent = `Zapłać ${priceOf()} zł`;
  }

  function wirePayment() {
    el("pay-row").querySelectorAll(".choice").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.paymentMethod = btn.dataset.pay;
        el("pay-row").querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        el("pay-btn").disabled = false;
      })
    );
    el("pay-btn").addEventListener("click", pay);
  }

  async function pay() {
    if (!state.paymentMethod) return;
    const btn = el("pay-btn");
    btn.disabled = true;
    btn.textContent = "Przetwarzanie płatności…";
    el("wizard-alert").hidden = true;

    // Powód = objawy + podsumowanie kwestionariusza.
    const extra = collectQuestionnaire();
    const reason = [state.reason, extra].filter(Boolean).join("\n");

    try {
      // Symulacja opóźnienia płatności.
      await new Promise((r) => setTimeout(r, 700));
      await api.post("/appointments", {
        doctorId: state.doctorId,
        date: state.date,
        time: state.time,
        service: state.service,
        consultationType: state.consultationType,
        reason,
        paymentMethod: state.paymentMethod,
      });
      showSuccess();
    } catch (err) {
      el("wizard-alert").textContent = err.message || "Nie udało się dokończyć rezerwacji.";
      el("wizard-alert").hidden = false;
      btn.disabled = false;
      btn.textContent = `Zapłać ${priceOf()} zł`;
    }
  }

  function showSuccess() {
    document.querySelectorAll(".wizard__step").forEach((s) => (s.hidden = true));
    el("stepper").style.display = "none";
    el("wizard-nav").style.display = "none";
    el("success-text").textContent =
      `${svc(state.service).label} u ${state.doctor.name} — ${dash.fmtDate(state.date)}, godz. ${state.time}. ` +
      `Opłacono ${priceOf()} zł (${PAY_LABEL[state.paymentMethod]}). Szczegóły znajdziesz w panelu.`;
    el("success").hidden = false;
    el("success").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- Nawigacja między krokami ---------- */
  function wireNav() {
    wireConsultationType();
    wirePayment();
    el("back-btn").addEventListener("click", () => goTo(step - 1));
    el("next-btn").addEventListener("click", () => {
      if (validateStep(step)) goTo(step + 1);
    });
  }

  function goTo(n) {
    if (n < 1 || n > 5) return;
    step = n;
    document.querySelectorAll(".wizard__step").forEach((s) => {
      s.hidden = Number(s.dataset.step) !== n;
    });
    el("stepper").querySelectorAll(".stepper__item").forEach((it) => {
      const s = Number(it.dataset.s);
      it.classList.toggle("is-active", s === n);
      it.classList.toggle("is-done", s < n);
    });

    // Akcje wejścia w krok.
    if (n === 2 && !el("doctor-cards").children.length) renderDoctorCards(el("wiz-spec").value);
    if (n === 3 && state.doctorId) loadSlots();
    if (n === 4) renderQuestionnaire();
    if (n === 5) renderSummary();

    updateNav();
    const title = document.querySelector(`.wizard__step[data-step="${n}"] .wizard__title`);
    if (title) title.setAttribute("tabindex", "-1"), title.focus();
  }

  /* Włącza/wyłącza „Dalej" i pokazuje „Zapłać" na ostatnim kroku. */
  function updateNav() {
    el("back-btn").disabled = step === 1;
    const next = el("next-btn");
    if (step === 5) {
      next.style.display = "none";
    } else {
      next.style.display = "";
      next.disabled = !canAdvance(step);
    }
  }

  function canAdvance(s) {
    if (s === 1) return !!state.service;
    if (s === 2) return !!state.doctorId;
    if (s === 3) return !!(state.date && state.time);
    if (s === 4) return true; // walidacja pełna w validateStep
    return true;
  }

  function validateStep(s) {
    if (s === 4) {
      const reason = el("wiz-reason").value.trim();
      state.reason = reason;
      let ok = true;
      if (reason.length < 5) {
        el("wiz-reason-error").textContent = "Opisz krótko powód (min. 5 znaków).";
        el("wiz-reason").closest(".field").classList.add("has-error");
        ok = false;
      } else {
        el("wiz-reason-error").textContent = "";
        el("wiz-reason").closest(".field").classList.remove("has-error");
      }
      if (!el("wiz-consent").checked) {
        el("wiz-consent-error").textContent = "Zaznacz oświadczenie.";
        ok = false;
      } else {
        el("wiz-consent-error").textContent = "";
      }
      return ok;
    }
    return canAdvance(s);
  }

  /* Preselekcja z parametrów ?service= i ?doctor= */
  function preselectFromQuery() {
    const p = new URLSearchParams(location.search);
    const s = p.get("service");
    const d = p.get("doctor");
    if (s && svc(s)) {
      state.service = s;
      const tile = document.querySelector(`.service-tile[data-service="${s}"]`);
      if (tile) tile.setAttribute("aria-pressed", "true");
    }
    if (d) {
      const doc = doctors.find((x) => String(x.id) === String(d));
      if (doc) {
        state.doctorId = doc.id;
        state.doctor = doc;
        el("wiz-spec").value = doc.specialization;
        renderDoctorCards(doc.specialization);
      }
    }
  }
})();
