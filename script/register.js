/* =============================================================
   register.js — rejestracja z przełącznikiem roli, walidacją
   front-end i obsługą błędów z API (np. „e-mail zajęty").
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia && window.Zdrovia.api;
  const form = document.getElementById("register-form");
  const alertBox = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");
  const roleInput = document.getElementById("role");
  const segBtns = document.querySelectorAll(".segmented__btn");
  const roleGroups = document.querySelectorAll(".role-fields");
  if (!api || !form) return;

  let role = "patient";

  const dashFor = (r) => (r === "doctor" ? "dashboard-doctor.html" : "dashboard-patient.html");

  /* --- Przełączanie roli --- */
  function setRole(newRole) {
    role = newRole;
    roleInput.value = newRole;
    segBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === newRole)));
    roleGroups.forEach((g) => (g.hidden = g.dataset.role !== newRole));
  }
  segBtns.forEach((b) => b.addEventListener("click", () => setRole(b.dataset.role)));

  /* --- Walidacja pól --- */
  function setFieldError(id, msg) {
    const err = document.getElementById(id + "-error");
    const field = document.getElementById(id);
    const wrap = field && field.closest(".field");
    if (err) err.textContent = msg || "";
    if (wrap) wrap.classList.toggle("has-error", Boolean(msg));
  }
  function clearErrors() {
    alertBox.hidden = true;
    form.querySelectorAll(".field.has-error").forEach((f) => f.classList.remove("has-error"));
    form.querySelectorAll(".field__error").forEach((e) => (e.textContent = ""));
  }

  function validate(data) {
    let firstBad = null;
    const fail = (id, msg) => {
      setFieldError(id, msg);
      if (!firstBad) firstBad = id;
    };
    if (data.firstName.length < 2) fail("firstName", "Podaj imię");
    if (data.lastName.length < 2) fail("lastName", "Podaj nazwisko");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) fail("email", "Podaj poprawny e-mail");
    if (data.password.length < 8) fail("password", "Hasło musi mieć min. 8 znaków");

    if (role === "patient") {
      if (!data.phone || data.phone.replace(/[\s()+-]/g, "").length < 9)
        fail("phone", "Podaj poprawny numer telefonu");
    } else {
      if (!data.specialization) fail("specialization", "Wybierz specjalizację");
      if (!data.pwzNumber || data.pwzNumber.length < 3) fail("pwzNumber", "Podaj numer PWZ");
    }
    if (!document.getElementById("consent").checked)
      fail("consent", "Zaakceptuj regulamin");

    return firstBad;
  }

  /* --- Zbudowanie payloadu wg roli --- */
  function collect() {
    const g = (id) => (document.getElementById(id)?.value || "").trim();
    const base = {
      role,
      firstName: g("firstName"),
      lastName: g("lastName"),
      email: g("email"),
      password: document.getElementById("password").value,
    };
    if (role === "patient") {
      base.phone = g("phone");
      if (g("birthDate")) base.birthDate = g("birthDate");
    } else {
      base.specialization = g("specialization");
      base.pwzNumber = g("pwzNumber");
      if (g("city")) base.city = g("city");
      if (g("yearsExperience")) base.yearsExperience = g("yearsExperience");
      if (g("consultationPrice")) base.consultationPrice = g("consultationPrice");
      if (g("bio")) base.bio = g("bio");
    }
    return base;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    const data = collect();
    const firstBad = validate(data);
    if (firstBad) {
      document.getElementById(firstBad).focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Tworzenie konta…";
    try {
      const res = await api.register(data);
      // Auto-login (token/cookie ustawione) → przekierowanie do panelu.
      window.location.href = dashFor(res.user.role);
    } catch (err) {
      // Błędy walidacji z API (422) → przypisz do pól.
      if (err.details && typeof err.details === "object") {
        Object.entries(err.details).forEach(([field, msg]) => setFieldError(field, msg));
      }
      alertBox.textContent = err.message || "Nie udało się utworzyć konta.";
      alertBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Załóż konto";
    }
  });

  // Jeśli już zalogowany (jest token) → przejdź do panelu.
  if (api.getToken()) {
    api.me()
      .then((res) => { window.location.href = dashFor(res.user.role); })
      .catch(() => api.setToken(null));
  }

  // Wstępne uzupełnienie pól z lejka na stronie głównej (?firstName=&email=…).
  (function prefill() {
    const q = new URLSearchParams(location.search);
    ["firstName", "lastName", "email", "phone"].forEach((k) => {
      const v = q.get(k);
      const field = document.getElementById(k);
      if (v && field) field.value = v;
    });
  })();

  setRole("patient");
})();
