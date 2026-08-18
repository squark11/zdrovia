/* =============================================================
   reviews.js
   Renderuje siatkę opinii pacjentów z ocenami (gwiazdki).
============================================================= */
(function () {
  "use strict";

  const grid = document.getElementById("review-grid");
  if (!grid || !window.Zdrovia) return;

  const { reviews } = window.Zdrovia.data;

  /* Inicjały pacjenta (np. „Magdalena T." -> „MT"). */
  function initials(name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .replace(/\./g, "")
      .slice(0, 2)
      .toUpperCase();
  }

  function renderReview(r) {
    const fill = (r.rating / 5) * 100;
    return `
      <li class="review-card">
        <span class="stars" style="--fill:${fill}%"
              role="img" aria-label="Ocena ${r.rating} na 5"></span>
        <p class="review-card__quote">„${r.quote}"</p>
        <div class="review-card__foot">
          <span class="review-card__avatar" style="background:${r.color}" aria-hidden="true">
            ${initials(r.name)}
          </span>
          <div>
            <p class="review-card__name">${r.name}</p>
            <p class="review-card__role">${r.role}</p>
          </div>
        </div>
      </li>`;
  }

  grid.innerHTML = reviews.map(renderReview).join("");
})();
