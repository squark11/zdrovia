/* =============================================================
   login.js — obsługa formularza logowania.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia && window.Zdrovia.api;
  const form = document.getElementById("login-form");
  const alertBox = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");
  if (!api || !form) return;

  const dashFor = (role) =>
    role === "admin" ? "dashboard-admin.html"
    : role === "doctor" ? "dashboard-doctor.html"
    : "dashboard-patient.html";

  // Cel przekierowania po zalogowaniu (?next=...), np. z modala/rezerwacji.
  const params = new URLSearchParams(location.search);
  const next = params.get("next");

  // Jeśli już zalogowany (jest token) → od razu do panelu.
  if (api.getToken()) {
    api.me()
      .then((res) => { window.location.href = next || dashFor(res.user.role); })
      .catch(() => api.setToken(null)); // token nieważny → pokaż formularz
  }

  function showError(msg) {
    alertBox.textContent = msg;
    alertBox.hidden = false;
  }
  function setFieldError(id, msg) {
    const err = document.getElementById(id + "-error");
    const wrap = document.getElementById(id).closest(".field");
    if (err) err.textContent = msg || "";
    if (wrap) wrap.classList.toggle("has-error", Boolean(msg));
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    alertBox.hidden = true;
    setFieldError("email", "");
    setFieldError("password", "");

    const email = form.email.value.trim();
    const password = form.password.value;
    let bad = false;
    if (!email) { setFieldError("email", "Podaj adres e-mail"); bad = true; }
    if (!password) { setFieldError("password", "Podaj hasło"); bad = true; }
    if (bad) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Logowanie…";
    try {
      const res = await api.login(email, password);
      window.location.href = next || dashFor(res.user.role);
    } catch (err) {
      showError(err.message || "Nie udało się zalogować.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Zaloguj się";
    }
  });

  // Szybkie logowanie kontem demo (jeden klik).
  document.querySelectorAll("[data-demo-email]").forEach((btn) =>
    btn.addEventListener("click", () => {
      form.email.value = btn.dataset.demoEmail;
      form.password.value = "Haslo123!";
      form.requestSubmit();
    })
  );
})();
