/* =============================================================
   ui.js
   Interakcje interfejsu: menu mobilne (hamburger), sticky header,
   podświetlanie aktywnej pozycji nawigacji, przycisk „do góry".
   Płynne przewijanie realizuje CSS (scroll-behavior) + kotwice.
============================================================= */
(function () {
  "use strict";

  const header  = document.getElementById("site-header");
  const nav     = document.getElementById("main-nav");
  const toggle  = document.getElementById("nav-toggle");
  const toTop   = document.getElementById("to-top");
  const navLinks = Array.from(document.querySelectorAll(".main-nav__link"));

  /* -----------------------------------------------------------
     1. Menu mobilne
  ----------------------------------------------------------- */
  function openMenu() {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Zamknij menu");
    document.body.classList.add("no-scroll");
  }
  function closeMenu() {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Otwórz menu");
    document.body.classList.remove("no-scroll");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const isOpen = nav.classList.contains("is-open");
      isOpen ? closeMenu() : openMenu();
    });

    // Zamknij menu po kliknięciu linku (mobile).
    navLinks.forEach((link) => link.addEventListener("click", closeMenu));

    // Zamknij po klawiszu Escape.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        closeMenu();
        toggle.focus();
      }
    });

    // Po powrocie do desktopu wyczyść stan mobilny.
    const desktop = window.matchMedia("(min-width: 900px)");
    desktop.addEventListener("change", (e) => { if (e.matches) closeMenu(); });
  }

  /* -----------------------------------------------------------
     2. Sticky header (cień po przewinięciu) + przycisk „do góry".
     Jeden handler scroll, ograniczony przez requestAnimationFrame,
     aby nie wykonywać pracy przy każdym zdarzeniu (wydajność).
  ----------------------------------------------------------- */
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;

    if (header) header.classList.toggle("is-scrolled", y > 8);

    if (toTop) {
      const show = y > 600;
      toTop.classList.toggle("is-visible", show);
      // hidden zdejmujemy dopiero gdy trzeba pokazać (dostępność).
      if (show) toTop.hidden = false;
    }
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        window.requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );
  onScroll(); // stan początkowy

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* -----------------------------------------------------------
     3. Podświetlanie aktywnej pozycji nawigacji (scroll-spy).
     Obserwujemy sekcje wskazywane przez linki i oznaczamy tę,
     która jest aktualnie widoczna.
  ----------------------------------------------------------- */
  const sections = navLinks
    .map((link) => {
      const id = link.getAttribute("href");
      return id && id.startsWith("#") ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = "#" + entry.target.id;
          navLinks.forEach((l) =>
            l.classList.toggle("is-active", l.getAttribute("href") === id)
          );
        });
      },
      // Sekcja „aktywna", gdy jej górna część jest tuż pod headerem.
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }
})();
