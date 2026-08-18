/* =============================================================
   specialties.js
   Renderuje siatkę kart specjalizacji. Kliknięcie karty ustawia
   filtr w sekcji „Lekarze" i przewija do niej (integracja przez
   zdarzenie CustomEvent, luźne powiązanie modułów).
============================================================= */
(function () {
  "use strict";

  const grid = document.getElementById("specialty-grid");
  if (!grid || !window.Zdrovia) return;

  const specialties = window.Zdrovia.data.specialties;
  let counts = {}; // liczba lekarzy wg specjalizacji (z danych API)

  /* Ile lekarzy w danej specjalizacji — do podpisu na karcie. */
  function countDoctors(key) {
    return counts[key] || 0;
  }

  /* Budujemy pojedynczą kartę. Używamy <button> wewnątrz <li>,
     bo karta jest interaktywna (dostępność z klawiatury za darmo). */
  function renderCard(spec) {
    const count = countDoctors(spec.key);
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="specialty-card" type="button"
              data-spec="${spec.key}"
              aria-label="Zobacz lekarzy: ${spec.name}">
        <span class="specialty-card__icon" aria-hidden="true">${spec.icon}</span>
        <span class="specialty-card__name">${spec.name}</span>
        <span class="specialty-card__count">${count} ${count === 1 ? "lekarz" : "lekarzy"}</span>
      </button>`;
    return li;
  }

  /* Renderujemy karty po pobraniu lekarzy (liczniki z API; fallback
     do danych mockowych obsługuje api.js). DocumentFragment = mniej
     operacji na DOM. */
  window.Zdrovia.loadDoctors().then((docs) => {
    counts = {};
    docs.forEach((d) => (counts[d.spec] = (counts[d.spec] || 0) + 1));
    const fragment = document.createDocumentFragment();
    specialties.forEach((s) => fragment.appendChild(renderCard(s)));
    grid.replaceChildren(fragment);
  });

  /* Delegacja zdarzeń: jeden listener zamiast wielu. */
  grid.addEventListener("click", function (e) {
    const card = e.target.closest(".specialty-card");
    if (!card) return;
    const spec = card.dataset.spec;

    // Informujemy moduł lekarzy, że ma ustawić filtr.
    document.dispatchEvent(new CustomEvent("zdrovia:filter", { detail: { spec } }));

    // Płynne przewinięcie do sekcji lekarzy.
    document.getElementById("lekarze").scrollIntoView({ behavior: "smooth" });
  });
})();
