/* =============================================================
   adblock-notice.js
   Wykrywa aktywny bloker reklam (blokery bywają przyczyną
   ERR_BLOCKED_BY_CLIENT — potrafią blokować czcionki lub zapytania)
   i pokazuje dyskretne, zamykane powiadomienie z prośbą o wyłączenie.
   Metoda: element-„przynęta" z klasami typowo blokowanymi przez
   listy filtrów — jeśli zostanie ukryty/usunięty, bloker jest aktywny.
============================================================= */
(function () {
  "use strict";

  // Uszanuj wcześniejsze zamknięcie (w obrębie sesji).
  if (sessionStorage.getItem("zdrovia_adblock_dismissed")) return;

  function runDetection() {
    const bait = document.createElement("div");
    // Klasy często blokowane przez filtry adblock.
    bait.className = "adsbox ad-banner ads ad-placement pub_300x250 adsbygoogle";
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText =
      "position:absolute!important;left:-9999px!important;top:-9999px!important;" +
      "height:20px!important;width:20px!important;pointer-events:none;";
    bait.innerHTML = "&nbsp;";
    document.body.appendChild(bait);

    // Daj blokerowi chwilę na zadziałanie.
    window.setTimeout(function () {
      const removed = !document.body.contains(bait);
      const style = removed ? null : window.getComputedStyle(bait);
      const blocked =
        removed ||
        bait.offsetParent === null ||
        bait.offsetHeight === 0 ||
        (style && (style.display === "none" || style.visibility === "hidden"));

      if (!removed) bait.remove();
      if (blocked) showNotice();
    }, 250);
  }

  function showNotice() {
    if (document.querySelector(".adblock-notice")) return;

    const box = document.createElement("div");
    box.className = "adblock-notice";
    box.setAttribute("role", "status");
    box.innerHTML =
      '<span class="adblock-notice__icon" aria-hidden="true">🛡️</span>' +
      '<div class="adblock-notice__text">' +
      "<strong>Wygląda na to, że masz włączony bloker reklam.</strong> " +
      "Może on blokować część funkcji Zdrovia (np. czcionki lub zapytania do serwera). " +
      "Wyłącz go dla tej strony i odśwież, aby wszystko działało poprawnie." +
      "</div>" +
      '<button class="adblock-notice__close" type="button" aria-label="Zamknij powiadomienie">&times;</button>';

    document.body.appendChild(box);
    box.querySelector(".adblock-notice__close").addEventListener("click", function () {
      box.remove();
      try { sessionStorage.setItem("zdrovia_adblock_dismissed", "1"); } catch (_e) {}
    });
  }

  if (document.body) runDetection();
  else document.addEventListener("DOMContentLoaded", runDetection);
})();
