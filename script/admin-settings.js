/* =============================================================
   admin-settings.js
   Widok „Ustawienia platformy" w panelu admina. Sekrety są
   zamaskowane — pole puste = bez zmian; „Wyczyść" kasuje sekret.
   Odszyfrowane wartości NIGDY nie trafiają do przeglądarki.
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia.api;
  const dash = window.Zdrovia.dash;
  const el = (id) => document.getElementById(id);

  const GENERAL = [
    { key: "app_name", label: "Nazwa platformy", type: "text" },
    { key: "support_email", label: "E-mail wsparcia", type: "email" },
  ];
  const SMTP = [
    { key: "smtp_host", label: "Host SMTP", type: "text", ph: "np. smtp.mailtrap.io" },
    { key: "smtp_port", label: "Port", type: "number", ph: "587" },
    { key: "smtp_user", label: "Użytkownik", type: "text" },
    { key: "smtp_password", label: "Hasło", type: "secret" },
    { key: "smtp_from", label: "Nadawca (From)", type: "text", ph: "Zdrovia <no-reply@…>" },
  ];
  const INTEGRATIONS = [
    { key: "n8n_webhook_url", label: "n8n Webhook URL", type: "text" },
    { key: "n8n_webhook_secret", label: "n8n Webhook Secret", type: "secret" },
  ];
  const FLAGS = [
    { key: "enable_email_notifications", label: "Powiadomienia e-mail", hint: "Wysyłka potwierdzeń wizyt i recept." },
    { key: "enable_realtime", label: "Aktualizacje na żywo", hint: "Powiadomienia bez odświeżania (Socket.io)." },
    { key: "enable_dark_mode_default", label: "Ciemny motyw domyślnie", hint: "Dla nowych użytkowników." },
  ];

  let data = {};
  const clearSet = new Set();

  async function render() {
    const root = el("settings-root");
    root.innerHTML = '<div class="loading-row"><span class="spinner"></span> Wczytywanie…</div>';
    try {
      const res = await api.get("/admin/settings");
      data = res.settings;
    } catch (e) {
      root.innerHTML = '<p class="empty">Nie udało się wczytać ustawień.</p>';
      return;
    }
    clearSet.clear();
    root.innerHTML =
      card("Ogólne", GENERAL.map(fieldHtml).join("")) +
      card("Konfiguracja e-mail (SMTP)",
        SMTP.map(fieldHtml).join("") +
        '<button class="btn btn--ghost" type="button" id="test-smtp">Wyślij testowy e-mail</button>') +
      card("Integracje", INTEGRATIONS.map(fieldHtml).join("")) +
      card("Funkcje platformy", '<div class="switches">' + FLAGS.map(switchHtml).join("") + "</div>") +
      '<div class="settings-save"><button class="btn btn--primary btn--lg" type="button" id="settings-save">Zapisz ustawienia</button></div>';

    wire();
  }

  function card(title, body) {
    return `<section class="panel settings-card"><div class="panel__head"><h2 class="panel__title">${title}</h2></div><div class="panel__body">${body}</div></section>`;
  }

  function fieldHtml(f) {
    const val = data[f.key];
    if (f.type === "secret") {
      const isSet = val && val.isSet;
      return `<div class="field" data-key="${f.key}">
        <label class="field__label" for="set-${f.key}">${f.label}</label>
        <div class="secret-field">
          <input class="field__input" type="password" id="set-${f.key}" autocomplete="new-password"
                 placeholder="${isSet ? "••••••••" : "— nie ustawiono —"}" />
          <button class="secret-field__eye" type="button" data-eye="${f.key}" aria-label="Pokaż wpisywaną wartość">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="secret-field__row">
          <span class="field__hint" id="hint-${f.key}">${isSet ? "Sekret ustawiony — wpisz, aby zmienić." : "Nie ustawiono."}</span>
          ${isSet ? `<button class="secret-clear" type="button" data-clear="${f.key}">Wyczyść</button>` : ""}
        </div>
      </div>`;
    }
    const v = val == null ? "" : String(val);
    return `<div class="field">
      <label class="field__label" for="set-${f.key}">${f.label}</label>
      <input class="field__input" type="${f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}"
             id="set-${f.key}" value="${escAttr(v)}" ${f.ph ? `placeholder="${f.ph}"` : ""} />
    </div>`;
  }

  function switchHtml(f) {
    const on = data[f.key] === true || data[f.key] === "true";
    return `<label class="switch">
      <input type="checkbox" id="set-${f.key}" ${on ? "checked" : ""} />
      <span class="switch__track" aria-hidden="true"></span>
      <span class="switch__text"><strong>${f.label}</strong><small>${f.hint || ""}</small></span>
    </label>`;
  }

  function escAttr(s) { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  function wire() {
    // Podgląd wpisywanej wartości sekretu.
    el("settings-root").querySelectorAll("[data-eye]").forEach((b) =>
      b.addEventListener("click", () => {
        const inp = el("set-" + b.dataset.eye);
        inp.type = inp.type === "password" ? "text" : "password";
      })
    );
    // Wyczyść sekret (z potwierdzeniem).
    el("settings-root").querySelectorAll("[data-clear]").forEach((b) =>
      b.addEventListener("click", async () => {
        const key = b.dataset.clear;
        const ok = await dash.confirm({
          title: "Wyczyścić sekret?",
          message: "Zapisana wartość zostanie usunięta po zapisaniu ustawień.",
          confirmText: "Wyczyść", danger: true,
        });
        if (!ok) return;
        clearSet.add(key);
        const inp = el("set-" + key);
        inp.value = ""; inp.disabled = true; inp.placeholder = "— zostanie wyczyszczone —";
        el("hint-" + key).textContent = "Do wyczyszczenia przy zapisie.";
        b.remove();
      })
    );
    el("test-smtp").addEventListener("click", testSmtp);
    el("settings-save").addEventListener("click", save);
  }

  async function save() {
    const btn = el("settings-save");
    btn.disabled = true; btn.textContent = "Zapisywanie…";
    const values = {};
    [...GENERAL, ...SMTP, ...INTEGRATIONS].forEach((f) => {
      const inp = el("set-" + f.key);
      if (!inp || inp.disabled) return;
      if (f.type === "secret") {
        if (inp.value) values[f.key] = inp.value; // tylko jeśli coś wpisano
      } else if (f.type === "number") {
        if (inp.value !== "") values[f.key] = Number(inp.value);
      } else {
        values[f.key] = inp.value.trim();
      }
    });
    FLAGS.forEach((f) => (values[f.key] = el("set-" + f.key).checked));
    if (clearSet.size) values.clear = [...clearSet];

    try {
      const res = await api.put("/admin/settings", values);
      data = res.settings;
      dash.toast("Ustawienia zapisane.", "success");
      // Zastosuj natychmiast domyślny motyw, jeśli zmieniono (feature 3).
      if (window.Zdrovia.theme) window.Zdrovia.theme.onSettings(values);
      render(); // przerysuj (maski, ukryte „Wyczyść")
    } catch (err) {
      if (err.details) {
        const first = Object.keys(err.details)[0];
        dash.toast(`Błąd pola „${first}": ${err.details[first]}`, "error");
      } else dash.toast(err.message || "Nie udało się zapisać.", "error");
      btn.disabled = false; btn.textContent = "Zapisz ustawienia";
    }
  }

  async function testSmtp() {
    const btn = el("test-smtp");
    btn.disabled = true; btn.textContent = "Wysyłanie…";
    try {
      const res = await api.post("/admin/settings/test-smtp", {});
      dash.toast("Testowy e-mail wysłany na " + res.to, "success");
    } catch (err) {
      dash.toast(err.message || "Nie udało się wysłać testu.", "error");
    } finally {
      btn.disabled = false; btn.textContent = "Wyślij testowy e-mail";
    }
  }

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.adminSettings = { render };
})();
