/* =============================================================
   triage.js
   Widget „Wstępna kwalifikacja objawów" — czat AI (przez backend
   → n8n). Samodzielny: sam tworzy pływający przycisk i panel.
   sessionId trzymany w sessionStorage (przetrwa odświeżenie).
   To NIE jest diagnoza — wyraźny disclaimer zawsze widoczny.
============================================================= */
(function () {
  "use strict";

  const SPEC_LABEL = {
    internista: "Internista", pediatra: "Pediatra", dermatolog: "Dermatolog",
    psychiatra: "Psychiatra", ginekolog: "Ginekolog", kardiolog: "Kardiolog",
    laryngolog: "Laryngolog", endokrynolog: "Endokrynolog",
  };
  const SS_KEY = "zdrovia_triage_session";

  const api = () => window.Zdrovia && window.Zdrovia.api;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let sessionId = "";
  let messages = [];       // {role, content}
  let locked = false;      // po urgent — blokada dalszej rozmowy
  let opened = false;
  let restored = false;

  function getSession() {
    try {
      let s = sessionStorage.getItem(SS_KEY);
      if (!s) {
        s = (crypto.randomUUID ? crypto.randomUUID() : "sess-" + Date.now() + "-" + Math.random().toString(16).slice(2));
        sessionStorage.setItem(SS_KEY, s);
      }
      return s;
    } catch (_e) {
      return "sess-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }
  }

  /* ---------- Budowa DOM ---------- */
  function build() {
    const fab = document.createElement("button");
    fab.className = "triage-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Otwórz wstępną kwalifikację objawów");
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>' +
      '<span class="triage-fab__label">Kwalifikacja objawów</span>';
    document.body.appendChild(fab);

    const panel = document.createElement("div");
    panel.className = "triage-panel";
    panel.id = "triage-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Wstępna kwalifikacja objawów");
    panel.hidden = true;
    panel.innerHTML =
      '<header class="triage-panel__head">' +
        '<div class="triage-panel__title"><span class="triage-panel__dot" aria-hidden="true"></span>' +
          '<div><strong>Wstępna kwalifikacja objawów</strong><small>Asystent AI • odpowiada w kilka sekund</small></div></div>' +
        '<button class="triage-panel__close" type="button" aria-label="Zamknij czat">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      "</header>" +
      '<p class="triage-disclaimer">⚠️ To nie jest diagnoza medyczna. W nagłych przypadkach dzwoń <strong>112</strong> lub jedź na <strong>SOR</strong>.</p>' +
      '<div class="triage-messages" id="triage-messages" aria-live="polite"></div>' +
      '<div class="triage-suggest" id="triage-suggest" hidden></div>' +
      '<form class="triage-input" id="triage-form">' +
        '<label class="visually-hidden" for="triage-text">Twoja wiadomość</label>' +
        '<textarea id="triage-text" rows="1" placeholder="Opisz swoje objawy…" maxlength="1000"></textarea>' +
        '<button class="triage-send" type="submit" aria-label="Wyślij wiadomość">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg></button>' +
      "</form>";
    document.body.appendChild(panel);

    fab.addEventListener("click", toggle);
    panel.querySelector(".triage-panel__close").addEventListener("click", close);
    panel.querySelector("#triage-form").addEventListener("submit", onSubmit);
    const ta = panel.querySelector("#triage-text");
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
    });
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && opened) close(); });
  }

  const msgBox = () => document.getElementById("triage-messages");

  /* ---------- Otwieranie / zamykanie ---------- */
  function toggle() { opened ? close() : open(); }
  async function open() {
    opened = true;
    document.querySelector(".triage-fab").classList.add("is-hidden");
    const panel = document.getElementById("triage-panel");
    panel.hidden = false;
    void panel.offsetWidth; // wymuś reflow → pewne odpalenie animacji (bez zależności od rAF)
    panel.classList.add("is-open");
    if (!restored) { restored = true; await restore(); }
    setTimeout(() => { const t = document.getElementById("triage-text"); if (t && !locked) t.focus(); }, 60);
  }
  function close() {
    opened = false;
    const panel = document.getElementById("triage-panel");
    panel.classList.remove("is-open");
    panel.hidden = true;
    document.querySelector(".triage-fab").classList.remove("is-hidden");
  }

  /* ---------- Wiadomości ---------- */
  function addBubble(role, content) {
    const div = document.createElement("div");
    div.className = "triage-msg triage-msg--" + role;
    div.innerHTML = `<div class="triage-bubble">${esc(content).replace(/\n/g, "<br>")}</div>`;
    msgBox().appendChild(div);
    scrollDown();
  }
  function scrollDown() { const b = msgBox(); b.scrollTop = b.scrollHeight; }

  function showTyping() {
    const d = document.createElement("div");
    d.className = "triage-msg triage-msg--assistant";
    d.id = "triage-typing";
    d.innerHTML = '<div class="triage-bubble triage-typing"><span></span><span></span><span></span></div>';
    msgBox().appendChild(d);
    scrollDown();
  }
  function hideTyping() { const t = document.getElementById("triage-typing"); if (t) t.remove(); }

  function greeting() {
    addBubble("assistant",
      "Cześć! Pomogę wstępnie ocenić Twoje objawy i podpowiem, do jakiego specjalisty się umówić. " +
      "Opisz, co Cię niepokoi. Pamiętaj — to nie zastępuje wizyty u lekarza.");
  }

  /* Wznowienie rozmowy z backendu (po odświeżeniu strony). */
  async function restore() {
    if (!api()) { greeting(); return; }
    try {
      const { conversation } = await api().get("/triage/" + encodeURIComponent(sessionId));
      if (conversation && conversation.messages && conversation.messages.length) {
        messages = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
        messages.forEach((m) => addBubble(m.role, m.content));
        if (conversation.isUrgent) { showUrgent(); }
        else if (conversation.suggestedSpecialty) { showSuggest(conversation.suggestedSpecialty); }
        return;
      }
    } catch (_e) { /* brak historii / offline — pokaż powitanie */ }
    greeting();
  }

  /* ---------- Wysyłka ---------- */
  async function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (locked) return;
    const ta = document.getElementById("triage-text");
    const text = ta.value.trim();
    if (!text) return;

    ta.value = ""; ta.style.height = "auto";
    addBubble("user", text);
    messages.push({ role: "user", content: text });
    setSending(true);
    showTyping();

    try {
      if (!api()) throw new Error("offline");
      const res = await api().post("/triage/chat", {
        sessionId,
        message: text,
        history: messages.slice(0, -1).slice(-20), // kontekst bez ostatniej (backend ją dołoży)
      });
      hideTyping();
      addBubble("assistant", res.reply);
      messages.push({ role: "assistant", content: res.reply });

      if (res.isUrgent) { showUrgent(); }
      else if (res.shouldEndConversation && res.suggestedSpecialty) { showSuggest(res.suggestedSpecialty); }
    } catch (err) {
      hideTyping();
      const msg = (err && err.message && err.status) ? err.message : "Chwilowo niedostępne — spróbuj ponownie za chwilę.";
      addBubble("assistant", msg);
    } finally {
      if (!locked) setSending(false);
    }
  }

  function setSending(on) {
    const btn = document.querySelector(".triage-send");
    const ta = document.getElementById("triage-text");
    if (btn) btn.disabled = on;
    if (ta) ta.disabled = on;
    if (!on && ta) ta.focus();
  }

  /* ---------- Stany specjalne ---------- */
  function showUrgent() {
    locked = true;
    const box = msgBox();
    const div = document.createElement("div");
    div.className = "triage-urgent";
    div.setAttribute("role", "alert");
    div.innerHTML =
      '<strong>⚠️ Możliwy stan pilny</strong>' +
      "<p>Twoje objawy mogą wymagać natychmiastowej pomocy. Zadzwoń na <a href=\"tel:112\">112</a> lub udaj się na najbliższy <strong>SOR</strong>.</p>";
    box.appendChild(div);
    scrollDown();
    // Zablokuj dalszą rozmowę w tym wątku.
    const form = document.getElementById("triage-form");
    if (form) form.style.display = "none";
  }

  function showSuggest(spec) {
    const wrap = document.getElementById("triage-suggest");
    if (!wrap) return;
    const label = SPEC_LABEL[spec] || spec;
    wrap.hidden = false;
    wrap.innerHTML =
      '<p class="triage-suggest__label">Sugerowana specjalizacja</p>' +
      `<div class="triage-suggest__row"><strong>${esc(label)}</strong>` +
      `<a class="btn btn--primary" href="umow.html?spec=${encodeURIComponent(spec)}">Umów wizytę</a></div>` +
      '<p class="triage-suggest__note">To wstępna sugestia, nie diagnoza.</p>';
    scrollDown();
  }

  /* ---------- Start ---------- */
  sessionId = getSession();
  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
