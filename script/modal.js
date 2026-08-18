/* =============================================================
   modal.js
   Dostępny modal (popup) z profilem lekarza i opiniami.
   Otwierany po kliknięciu karty lekarza (delegacja na #doctor-grid).
   Obsługuje: focus trap, zamknięcie klawiszem Escape i kliknięciem
   w tło, przywrócenie fokusu do elementu wywołującego, blokadę
   przewijania tła oraz poprawne atrybuty ARIA.
============================================================= */
(function () {
  "use strict";

  const grid  = document.getElementById("doctor-grid");
  const modal = document.getElementById("doctor-modal");
  const body  = document.getElementById("doctor-modal-body");
  if (!grid || !modal || !body || !window.Zdrovia) return;

  const specialties = window.Zdrovia.data.specialties;
  const getReviews = window.Zdrovia.getDoctorReviews;

  // Aktualna lista lekarzy (z API; fallback do danych mockowych).
  const docs = () =>
    window.Zdrovia.doctors || (window.Zdrovia.data && window.Zdrovia.data.doctors) || [];

  const specName = specialties.reduce((acc, s) => ((acc[s.key] = s.name), acc), {});

  let lastFocused = null; // element, do którego wracamy po zamknięciu
  let currentDoc = null;  // aktualnie wyświetlany lekarz

  /* ---------- Pomocnicze ---------- */
  function initials(fullName) {
    const parts = fullName.replace(/^dr\s+/i, "").split(" ");
    return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }
  const starFill = (r) => (r / 5) * 100;
  const yearsWord = (n) => {
    const t = n % 10, h = n % 100;
    if (n === 1) return "rok";
    if (t >= 2 && t <= 4 && !(h >= 12 && h <= 14)) return "lata";
    return "lat";
  };

  /* ---------- Budowa treści profilu ---------- */
  function reviewHTML(rev) {
    return `
      <li class="p-review">
        <div class="p-review__top">
          <span class="p-review__avatar" aria-hidden="true">${initials(rev.name)}</span>
          <div>
            <p class="p-review__name">${rev.name}</p>
            <p class="p-review__meta">${rev.city} • ${rev.date}</p>
          </div>
          <span class="stars stars--sm" style="--fill:${starFill(rev.rating)}%"
                role="img" aria-label="Ocena ${rev.rating} na 5"></span>
        </div>
        <p class="p-review__text">„${rev.text}"</p>
      </li>`;
  }

  function profileHTML(doc) {
    const reviews = typeof getReviews === "function" ? getReviews(doc) : [];
    const badgeClass = doc.soon ? "badge--today" : "badge--soon";
    const langs = (doc.languages || []).join(", ");

    return `
      <div class="profile">
        <header class="profile__head">
          <span class="profile__avatar" style="background:${doc.color}" aria-hidden="true">
            ${initials(doc.name)}
          </span>
          <div class="profile__ident">
            <h2 class="profile__name" id="doctor-modal-name">${doc.name}</h2>
            <p class="profile__spec">${specName[doc.spec] || doc.spec}</p>
            <div class="profile__rating">
              <span class="stars" style="--fill:${starFill(doc.rating)}%"
                    role="img" aria-label="Ocena ${doc.rating.toFixed(1)} na 5"></span>
              <strong>${doc.rating.toFixed(1)}</strong>
              <span class="profile__reviews-count">(${doc.reviews} opinii)</span>
            </div>
          </div>
        </header>

        <ul class="profile__facts">
          <li><span class="profile__fact-k">Doświadczenie</span>
              <span class="profile__fact-v">${doc.experience} ${yearsWord(doc.experience)}</span></li>
          <li><span class="profile__fact-k">Lokalizacja</span>
              <span class="profile__fact-v">${doc.city}</span></li>
          <li><span class="profile__fact-k">Języki</span>
              <span class="profile__fact-v">${langs || "polski"}</span></li>
          <li><span class="profile__fact-k">Cena wizyty</span>
              <span class="profile__fact-v">${doc.price} zł</span></li>
        </ul>

        <p class="profile__bio">${doc.bio || ""}</p>

        <div class="profile__cta">
          <span class="badge ${badgeClass}">
            <span class="dot" aria-hidden="true"></span>Najbliższy termin: ${doc.availability}
          </span>
          <button class="btn btn--primary btn--lg" type="button" data-book>
            Umów wizytę
          </button>
        </div>

        <section class="profile__reviews" aria-label="Opinie o lekarzu">
          <h3 class="profile__reviews-title">Opinie pacjentów</h3>
          <ul class="p-reviews">
            ${reviews.map(reviewHTML).join("")}
          </ul>
        </section>
      </div>`;
  }

  /* ---------- Focus trap ---------- */
  const FOCUSABLE =
    'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const items = modal.querySelectorAll(FOCUSABLE);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- Otwieranie / zamykanie ---------- */
  function open(doc, opener) {
    lastFocused = opener || document.activeElement;
    currentDoc = doc;

    // Deep-link: odzwierciedl otwartego lekarza w URL (link do udostępnienia).
    const idx = docs().indexOf(doc);
    if (idx >= 0 && history.replaceState) {
      history.replaceState(null, "", "#lekarz=" + idx);
    }

    body.innerHTML = profileHTML(doc);
    modal.hidden = false;
    // wymuś reflow, by zadziałała animacja wejścia
    void modal.offsetWidth;
    modal.classList.add("is-open");
    document.body.classList.add("no-scroll");

    document.addEventListener("keydown", onKeydown);

    // Fokus na przycisk zamknięcia (pierwszy sensowny cel).
    const closeBtn = modal.querySelector(".modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    document.removeEventListener("keydown", onKeydown);

    // Usuń deep-link z URL, by odświeżenie nie otwierało modala ponownie.
    if (/^#lekarz=/.test(location.hash) && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }

    // Poczekaj na animację, potem ukryj i wyczyść.
    const finalize = () => {
      modal.hidden = true;
      body.innerHTML = "";
      modal.removeEventListener("transitionend", finalize);
    };
    // Fallback, gdyby transitionend nie zaskoczył (reduced-motion).
    modal.addEventListener("transitionend", finalize);
    setTimeout(finalize, 300);

    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else {
      trapFocus(e);
    }
  }

  /* ---------- Zdarzenia ---------- */

  // Kliknięcie karty lekarza (delegacja) → otwórz modal.
  grid.addEventListener("click", function (e) {
    const card = e.target.closest(".doctor-card");
    if (!card) return;
    const idx = parseInt(card.dataset.idx, 10);
    const doc = docs()[idx];
    if (!doc) return;
    // Element, do którego wróci fokus: klikany przycisk CTA lub karta.
    const opener = e.target.closest(".doctor-card__cta") || card;
    open(doc, opener);
  });

  // Zamknięcie: przyciski/tło z atrybutem data-close.
  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) close();
    // „Umów wizytę" w modalu:
    // - gdy lekarz z API (ma id) → przejdź do panelu pacjenta z rezerwacją,
    // - w trybie offline (dane mockowe) → przewiń do formularza kontaktowego.
    if (e.target.closest("[data-book]")) {
      if (currentDoc && currentDoc.id != null) {
        window.location.href = "umow.html?doctor=" + currentDoc.id;
        return;
      }
      close();
      const contact = document.getElementById("kontakt");
      if (contact) setTimeout(() => contact.scrollIntoView({ behavior: "smooth" }), 60);
    }
  });

  /* ---------- Deep-link (#lekarz=<idx>) ---------- */
  function openFromHash() {
    const m = /^#lekarz=(\d+)$/.exec(location.hash);
    if (!m) return;
    const doc = docs()[parseInt(m[1], 10)];
    if (doc) open(doc, null);
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash(); // obsłuż wejście z linkiem bezpośrednim
})();
