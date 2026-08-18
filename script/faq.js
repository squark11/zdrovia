/* =============================================================
   faq.js
   Buduje akordeon FAQ z danych i obsługuje rozwijanie/zwijanie
   w czystym JS (bez bibliotek). Animacja przez max-height liczoną
   z rzeczywistej wysokości treści. Pełna obsługa ARIA.
============================================================= */
(function () {
  "use strict";

  const root = document.getElementById("faq-accordion");
  if (!root || !window.Zdrovia) return;

  const { faq } = window.Zdrovia.data;

  /* --------- Budowa struktury akordeonu --------- */
  root.innerHTML = faq
    .map((item, i) => {
      const btnId   = `faq-btn-${i}`;
      const panelId = `faq-panel-${i}`;
      return `
        <div class="accordion__item">
          <h3>
            <button class="accordion__trigger" type="button"
                    id="${btnId}" aria-expanded="false" aria-controls="${panelId}">
              <span>${item.q}</span>
              <span class="accordion__icon" aria-hidden="true"></span>
            </button>
          </h3>
          <div class="accordion__panel" id="${panelId}" role="region"
               aria-labelledby="${btnId}">
            <div class="accordion__panel-inner">${item.a}</div>
          </div>
        </div>`;
    })
    .join("");

  /* --------- Otwieranie / zamykanie --------- */
  function closeItem(item) {
    const trigger = item.querySelector(".accordion__trigger");
    const panel   = item.querySelector(".accordion__panel");
    item.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    panel.style.maxHeight = null;
  }

  function openItem(item) {
    const trigger = item.querySelector(".accordion__trigger");
    const panel   = item.querySelector(".accordion__panel");
    item.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    // Ustawiamy max-height na rzeczywistą wysokość treści → płynna animacja.
    panel.style.maxHeight = panel.scrollHeight + "px";
  }

  /* Delegacja: jeden listener na cały akordeon. */
  root.addEventListener("click", function (e) {
    const trigger = e.target.closest(".accordion__trigger");
    if (!trigger) return;

    const item = trigger.closest(".accordion__item");
    const isOpen = item.classList.contains("is-open");

    // Zamykamy pozostałe pozycje (klasyczny akordeon — jedna otwarta).
    root.querySelectorAll(".accordion__item.is-open").forEach((el) => {
      if (el !== item) closeItem(el);
    });

    isOpen ? closeItem(item) : openItem(item);
  });

  /* Gdy zmienia się rozmiar okna, przeliczamy wysokość otwartego
     panelu (tekst mógł się przełamać inaczej). */
  window.addEventListener("resize", function () {
    const open = root.querySelector(".accordion__item.is-open .accordion__panel");
    if (open) open.style.maxHeight = open.scrollHeight + "px";
  });
})();
