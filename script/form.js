/* =============================================================
   form.js
   Walidacja formularza zapisu po stronie przeglądarki (bez backendu).
   Waliduje na „submit" oraz czyści błąd, gdy użytkownik poprawia pole.
   Komunikaty dostępne dla czytników ekranu (aria-live + aria-invalid).
============================================================= */
(function () {
  "use strict";

  const form = document.getElementById("signup-form");
  if (!form) return;

  const successBox = document.getElementById("form-success");

  /* Reguły walidacji dla poszczególnych pól. Każda zwraca komunikat
     błędu (string) lub "" gdy wartość jest poprawna. */
  const rules = {
    name(value) {
      if (!value.trim()) return "Podaj imię i nazwisko.";
      if (value.trim().length < 3) return "Wpisz co najmniej 3 znaki.";
      return "";
    },
    email(value) {
      if (!value.trim()) return "Podaj adres e-mail.";
      // Prosty, pragmatyczny wzorzec — nie próbujemy objąć całego RFC.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()))
        return "Podaj poprawny adres e-mail.";
      return "";
    },
    phone(value) {
      const digits = value.replace(/[\s()+-]/g, "");
      if (!digits) return "Podaj numer telefonu.";
      if (!/^\d{9,12}$/.test(digits)) return "Podaj poprawny numer telefonu.";
      return "";
    },
    consent(_value, field) {
      // Dla checkboxa liczy się stan „checked".
      if (!field.checked) return "Zaznacz zgodę, aby kontynuować.";
      return "";
    },
  };

  /* Pokazuje / czyści błąd dla danego pola. */
  function setError(field, message) {
    const wrap  = field.closest(".field");
    const errEl = document.getElementById(field.id + "-error");
    if (!wrap || !errEl) return Boolean(message);

    if (message) {
      wrap.classList.add("has-error");
      field.setAttribute("aria-invalid", "true");
      errEl.textContent = message;
    } else {
      wrap.classList.remove("has-error");
      field.removeAttribute("aria-invalid");
      errEl.textContent = "";
    }
    return Boolean(message);
  }

  /* Waliduje pojedyncze pole; zwraca true, jeśli jest błąd. */
  function validateField(field) {
    const rule = rules[field.name];
    if (!rule) return false;
    const message = rule(field.value, field);
    return setError(field, message);
  }

  /* Walidacja przy poprawianiu — dopiero gdy pole miało już błąd,
     żeby nie „krzyczeć" na użytkownika przy pierwszym wpisywaniu. */
  form.addEventListener("input", function (e) {
    const field = e.target;
    if (!field.name || !rules[field.name]) return;
    if (field.closest(".field")?.classList.contains("has-error")) {
      validateField(field);
    }
  });

  /* Obsługa wysłania. */
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const fields = Array.from(form.elements).filter((el) => rules[el.name]);
    let hasError = false;
    let firstInvalid = null;

    fields.forEach((field) => {
      const invalid = validateField(field);
      if (invalid && !firstInvalid) firstInvalid = field;
      hasError = hasError || invalid;
    });

    if (hasError) {
      successBox.hidden = true;
      // Przenosimy fokus na pierwsze błędne pole (dostępność).
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    /* Lejek: przekaż dane do rejestracji, gdzie użytkownik dokończy
       zakładanie konta (pola zostaną wstępnie uzupełnione). */
    const fullName = document.getElementById("name").value.trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const params = new URLSearchParams({
      firstName: firstName || "",
      lastName: rest.join(" "),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
    });
    window.location.href = "register.html?" + params.toString();
  });
})();
