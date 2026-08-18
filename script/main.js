/* =============================================================
   main.js
   Punkt wejścia / spoiwo: animacje pojawiania się przy scrollu
   (Intersection Observer), animowany licznik w pasku zaufania,
   drobne inicjalizacje (rok w stopce).
   Ładowany jako ostatni — pozostałe moduły już zbudowały DOM.
============================================================= */
(function () {
  "use strict";

  window.Zdrovia = window.Zdrovia || {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -----------------------------------------------------------
     1. Rok w stopce.
  ----------------------------------------------------------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -----------------------------------------------------------
     2. Animacje pojawiania się (reveal).
     Udostępniamy funkcję observeReveal, by moduły renderujące
     dynamiczne treści (np. karty lekarzy) mogły dołączać elementy.
  ----------------------------------------------------------- */
  let revealObserver = null;

  if ("IntersectionObserver" in window && !reduceMotion) {
    revealObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target); // animujemy tylko raz
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll("[data-reveal]").forEach((el) => revealObserver.observe(el));
  } else {
    // Brak IO lub użytkownik woli mniej ruchu → pokaż wszystko od razu.
    document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
  }

  // Eksport dla innych modułów (np. doctors.js po przefiltrowaniu listy).
  window.Zdrovia.observeReveal = function (el) {
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add("is-visible");
  };

  /* -----------------------------------------------------------
     3. Animowany licznik (np. „52 000+ wizyt").
     Uruchamiany, gdy pasek zaufania wejdzie w widok.
  ----------------------------------------------------------- */
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    if (Number.isNaN(target)) return;

    if (reduceMotion) {
      el.textContent = target.toLocaleString("pl-PL") + suffix;
      return;
    }

    const duration = 1600;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic — szybko startuje, łagodnie zwalnia.
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(eased * target);
      el.textContent = value.toLocaleString("pl-PL") + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const counters = document.querySelectorAll("[data-count]");
  if (counters.length) {
    if ("IntersectionObserver" in window) {
      const countObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.6 }
      );
      counters.forEach((el) => countObserver.observe(el));
    } else {
      counters.forEach(animateCount);
    }
  }
})();
