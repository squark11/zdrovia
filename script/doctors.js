/* =============================================================
   doctors.js
   Renderuje listę lekarzy z:
   - filtrowaniem po specjalizacji (bez przeładowania strony),
   - doładowywaniem „Pokaż więcej" (append w dół, styl AJAX) zamiast
     numerowanej paginacji lub nieskończonego scrolla,
   - klikalną kartą, która otwiera modal profilu (obsługa w modal.js).
   Na desktopie (≥ 940px) pokazujemy od razu wszystkich lekarzy;
   na mniejszych ekranach startujemy od kilku i doładowujemy porcjami.
============================================================= */
(function () {
  "use strict";

  const grid    = document.getElementById("doctor-grid");
  const filters = document.getElementById("doctor-filters");
  const countEl = document.getElementById("doctor-count");
  const emptyEl = document.getElementById("doctor-empty");
  const pagerEl = document.getElementById("doctor-pagination");
  if (!grid || !window.Zdrovia) return;

  const specialties = window.Zdrovia.data.specialties;
  let doctors = [];            // wypełniane z API (fallback: dane mockowe)

  const ALL = "all";           // klucz filtra „wszyscy"
  const MOBILE_INITIAL = 3;    // ile kart na start (mobile/tablet)
  const STEP = 3;              // ile doładowujemy na klik
  const desktopMq = window.matchMedia("(min-width: 940px)");

  let activeFilter = ALL;      // aktualnie wybrana specjalizacja

  /* Mapa key -> ładna nazwa specjalizacji. */
  const specName = specialties.reduce((acc, s) => {
    acc[s.key] = s.name;
    return acc;
  }, {});

  const doctorWord = (n) => (n === 1 ? "lekarza" : "lekarzy");

  function initials(fullName) {
    const parts = fullName.replace(/^dr\s+/i, "").split(" ");
    return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  const starFill = (rating) => (rating / 5) * 100;

  /* Lista lekarzy po zastosowaniu filtra. */
  function getFiltered() {
    return activeFilter === ALL
      ? doctors
      : doctors.filter((d) => d.spec === activeFilter);
  }

  /* Ile kart pokazać na starcie danego widoku. */
  const baseCount = (len) => (desktopMq.matches ? len : Math.min(MOBILE_INITIAL, len));

  /* --------- Chipy filtra --------- */
  function renderFilters() {
    const buttons = [{ key: ALL, name: "Wszyscy" }].concat(
      specialties.map((s) => ({ key: s.key, name: s.name }))
    );
    filters.innerHTML = buttons
      .map(
        (b) => `
        <button class="chip" type="button"
                data-filter="${b.key}"
                aria-pressed="${b.key === activeFilter}">
          ${b.name}
        </button>`
      )
      .join("");
  }

  /* --------- Karta lekarza (klikalna → modal profilu) --------- */
  function renderDoctor(doc) {
    const idx = doctors.indexOf(doc);           // stały identyfikator dla modala
    const badgeClass = doc.soon ? "badge--today" : "badge--soon";
    return `
      <li class="doctor-card" data-idx="${idx}">
        <div class="doctor-card__head">
          <span class="doctor-card__avatar" style="background:${doc.color}" aria-hidden="true">
            ${initials(doc.name)}
          </span>
          <div>
            <p class="doctor-card__name">${doc.name}</p>
            <p class="doctor-card__spec">${specName[doc.spec] || doc.spec}</p>
          </div>
        </div>

        <div class="doctor-card__meta">
          <span class="rating">
            <span class="stars" style="--fill:${starFill(doc.rating)}%"
                  role="img" aria-label="Ocena ${doc.rating.toFixed(1)} na 5"></span>
            ${doc.rating.toFixed(1)}
          </span>
          <span class="doctor-card__rating-count">(${doc.reviews} opinii)</span>
        </div>

        <div class="doctor-card__foot">
          <span class="badge ${badgeClass}">
            <span class="dot" aria-hidden="true"></span>${doc.availability}
          </span>
        </div>

        <div class="doctor-card__foot">
          <span class="doctor-card__price">${doc.price} zł <span>/ wizyta</span></span>
          <!-- Przycisk = dostępny z klawiatury sposób otwarcia profilu -->
          <button class="btn btn--primary doctor-card__cta" type="button"
                  data-idx="${idx}"
                  aria-label="Zobacz profil i umów wizytę: ${doc.name}">
            Umów
          </button>
        </div>
      </li>`;
  }

  /* Zwraca HTML dla wycinka listy [from, to). */
  const cardsHTML = (list, from, to) =>
    list.slice(from, to).map(renderDoctor).join("");

  /* Obejmij animacją pojawiania tylko NOWE karty (bez [data-reveal]). */
  function observeReveals() {
    grid.querySelectorAll(".doctor-card:not([data-reveal])").forEach((el) => {
      el.setAttribute("data-reveal", "");
      // Jeśli observeReveal jeszcze nie istnieje (init przed main.js),
      // main.js sam obejmie wszystkie [data-reveal] przy starcie.
      if (window.Zdrovia.observeReveal) window.Zdrovia.observeReveal(el);
    });
  }

  /* Aktualizuje licznik, przycisk „Pokaż więcej" i animacje. */
  function finish() {
    const list = getFiltered();
    const shown = grid.querySelectorAll(".doctor-card").length;
    const isEmpty = list.length === 0;

    emptyEl.hidden = !isEmpty;
    grid.hidden = isEmpty;

    const label =
      activeFilter === ALL ? "wszystkich specjalizacji" : specName[activeFilter];
    countEl.textContent = isEmpty
      ? ""
      : `Znaleziono ${list.length} ${doctorWord(list.length)} — ${label}.` +
        (shown < list.length ? ` Pokazano ${shown} z ${list.length}.` : "");

    const remaining = list.length - shown;
    pagerEl.innerHTML =
      remaining > 0
        ? `<button class="btn btn--ghost load-more" type="button" id="load-more-btn">
             Pokaż więcej lekarzy
             <span class="load-more__count">+${Math.min(STEP, remaining)}</span>
           </button>`
        : "";

    observeReveals();
  }

  /* Pełne renderowanie (reset do porcji startowej) — filtr/init/resize. */
  function renderAll() {
    const list = getFiltered();
    grid.innerHTML = cardsHTML(list, 0, baseCount(list.length));
    finish();
  }

  /* Doładowanie kolejnej porcji (append w dół). */
  function loadMore() {
    const list = getFiltered();
    const from = grid.querySelectorAll(".doctor-card").length;
    const to = Math.min(from + STEP, list.length);
    grid.insertAdjacentHTML("beforeend", cardsHTML(list, from, to));
    finish();
  }

  /* --------- Filtr --------- */
  function setFilter(key) {
    activeFilter = key;
    filters.querySelectorAll(".chip").forEach((chip) => {
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === key));
    });
    renderAll();
  }

  /* --------- Zdarzenia --------- */
  filters.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (chip) setFilter(chip.dataset.filter);
  });

  pagerEl.addEventListener("click", function (e) {
    if (e.target.closest("#load-more-btn")) loadMore();
  });

  // Filtr z zewnątrz (kliknięcie karty specjalizacji).
  document.addEventListener("zdrovia:filter", function (e) {
    setFilter(e.detail && e.detail.spec ? e.detail.spec : ALL);
  });

  // Zmiana trybu desktop/mobile → przywróć porcję startową dla nowego układu.
  desktopMq.addEventListener("change", renderAll);

  /* --------- Start --------- */
  renderFilters();
  countEl.textContent = "Wczytywanie lekarzy…";

  // Pobierz lekarzy z API (z fallbackiem do danych mockowych w api.js).
  window.Zdrovia.loadDoctors().then((list) => {
    doctors = list;
    renderAll();
  });
})();
