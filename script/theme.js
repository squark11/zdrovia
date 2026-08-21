/* =============================================================
   theme.js
   Przełączanie jasny/ciemny motyw. Priorytety:
   1) wybór użytkownika (localStorage 'zdrovia_theme') — najwyższy,
   2) w jego braku: prefers-color-scheme systemu,
   3) opcjonalnie domyślny motyw platformy (enable_dark_mode_default
      z /api/config) — tylko gdy użytkownik sam nie wybrał.

   Atrybut data-theme jest ustawiany wcześnie inline-skryptem w <head>
   (patrz każda strona), aby uniknąć mignięcia (FOUC). Ten moduł
   obsługuje przełącznik, zapis wyboru i uzgodnienie z ustawieniami.
============================================================= */
(function () {
  "use strict";

  const KEY = "zdrovia_theme";
  const root = document.documentElement;

  function stored() { try { return localStorage.getItem(KEY); } catch (_e) { return null; } }
  function systemPref() {
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function current() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }

  function apply(theme, persist) {
    const t = theme === "dark" ? "dark" : "light";
    // Wyłącz transycje na czas zmiany motywu → natychmiastowe przełączenie
    // (bez animacji kolorów całej strony), przywróć w kolejnej klatce.
    root.classList.add("theme-no-transition");
    root.setAttribute("data-theme", t);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-no-transition")));
    if (persist) { try { localStorage.setItem(KEY, t); } catch (_e) {} }
    syncButtons();
  }

  function toggle() { apply(current() === "dark" ? "light" : "dark", true); }

  function syncButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      const dark = current() === "dark";
      b.setAttribute("aria-pressed", dark ? "true" : "false");
      b.setAttribute("aria-label", dark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw");
      b.title = dark ? "Jasny motyw" : "Ciemny motyw";
    });
  }

  function wire() {
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      if (b.__themeWired) return;
      b.__themeWired = true;
      b.addEventListener("click", toggle);
    });
    syncButtons();
  }

  /* Uzgodnienie z domyślnym motywem platformy — tylko gdy użytkownik
     nie dokonał własnego wyboru (wtedy jego decyzja jest nadrzędna). */
  async function reconcileDefault() {
    if (stored()) return;
    try {
      const api = window.Zdrovia && window.Zdrovia.api;
      if (!api) return;
      const cfg = await api.get("/config");
      if (cfg.features && cfg.features.darkModeDefault && systemPref() !== "dark") {
        apply("dark", false); // domyślnie ciemny, ale bez zapisu (nie „przypinamy")
      }
    } catch (_e) { /* brak configu → zostaw stan z inline-skryptu */ }
  }

  /* Wywoływane z panelu admina po zapisie ustawień (natychmiastowy podgląd
     zmiany domyślnego motywu — o ile użytkownik nie ma własnego wyboru). */
  function onSettings(values) {
    if (values && typeof values.enable_dark_mode_default === "boolean" && !stored()) {
      apply(values.enable_dark_mode_default ? "dark" : "light", false);
    }
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(() => { wire(); reconcileDefault(); });

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.theme = { apply, toggle, current, onSettings, wire };
})();
