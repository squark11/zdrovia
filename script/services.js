/* =============================================================
   services.js
   Wspólny katalog płatnych usług (jedno źródło dla kreatora
   rezerwacji i panelu pacjenta). Ikony to dedykowane, spójne
   line-SVG w kolorze marki (dziedziczą currentColor z CSS).
   Spójny z backendem: backend/src/utils/services.js.
============================================================= */
(function () {
  "use strict";

  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  const ICON = {
    // Stetoskop — konsultacja
    konsultacja: svg('<path d="M4 3v7a5 5 0 0 0 10 0V3"/><path d="M4 3H2.5M14 3h-1.5"/><path d="M9 20a4 4 0 0 0 4-4v-2.5"/><circle cx="18.5" cy="12" r="2.3"/>'),
    // Kapsułka / lek — e-recepta
    recepta: svg('<g transform="rotate(45 12 12)"><rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>'),
    // Dokument z „ptaszkiem" — e-zwolnienie (L4)
    zwolnienie: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 14.5l2.2 2.2 4.3-4.3"/>'),
    // Dokument ze strzałką — e-skierowanie
    skierowanie: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 15h6M12 12l3 3-3 3"/>'),
  };

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.SERVICES = [
    { key: "konsultacja", label: "E-konsultacja", price: null, icon: ICON.konsultacja,
      desc: "Rozmowa z lekarzem: diagnoza, zalecenia, w razie potrzeby e-recepta lub e-skierowanie." },
    { key: "recepta", label: "E-recepta", price: 59, icon: ICON.recepta,
      desc: "Kontynuacja leczenia — recepta na leki przyjmowane na stałe." },
    { key: "zwolnienie", label: "E-zwolnienie (L4)", price: 79, icon: ICON.zwolnienie,
      desc: "Zwolnienie lekarskie wysyłane automatycznie do ZUS i pracodawcy." },
    { key: "skierowanie", label: "E-skierowanie", price: 69, icon: ICON.skierowanie,
      desc: "Skierowanie na badania lub do specjalisty." },
  ];
})();
