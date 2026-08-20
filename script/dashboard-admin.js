/* =============================================================
   dashboard-admin.js
   Panel administratora (SPA po hashu). Widoki: Panel główny,
   Weryfikacja lekarzy, Użytkownicy, Wizyty, Recepty, Statystyki,
   Ustawienia. Dane z /api/admin/* (chronione rolą admin).
============================================================= */
(function () {
  "use strict";

  const api = window.Zdrovia.api;
  const dash = window.Zdrovia.dash;
  const el = (id) => document.getElementById(id);

  const VIEWS = ["przeglad", "weryfikacja", "uzytkownicy", "wizyty", "recepty", "statystyki", "ustawienia"];
  const SPEC_LABEL = {
    internista: "Internista", pediatra: "Pediatra", dermatolog: "Dermatolog",
    psychiatra: "Psychiatra", ginekolog: "Ginekolog", kardiolog: "Kardiolog",
    laryngolog: "Laryngolog", endokrynolog: "Endokrynolog",
  };
  const ROLE_LABEL = { patient: "Pacjent", doctor: "Lekarz", admin: "Admin" };

  let me = null;
  let verifyStatus = "pending";
  let userFilter = { role: "", search: "", page: 1 };
  let searchTimer = null;

  init();

  async function init() {
    me = await dash.guard("admin");
    if (!me) return;
    dash.mountUser(me);
    el("side-user-name").textContent = me.email;
    el("side-avatar").textContent = "AD";
    setupNavigation();
    setupVerifyTabs();
    setupUserControls();
    setupApptFilters();
    showView((location.hash || "#przeglad").slice(1));

    await Promise.all([loadOverview(), loadStats()]);
  }

  function handleApiError(err, fallback) {
    if (err && err.status === 401) {
      dash.toast("Sesja wygasła — zaloguj się ponownie.", "error");
      api.setToken(null);
      setTimeout(() => (window.location.href = "login.html?next=dashboard-admin.html"), 1300);
      return;
    }
    if (err && err.status === 403) {
      window.location.href = "login.html";
      return;
    }
    dash.toast(fallback || (err && err.message) || "Wystąpił błąd.", "error");
  }
  const skel = (n) => Array.from({ length: n }, () => '<div class="skeleton skel-card"></div>').join("");

  /* ---------- PANEL GŁÓWNY ---------- */
  async function loadOverview() {
    try {
      const s = await api.get("/admin/stats");
      el("stat-patients").textContent = s.usersByRole.patient || 0;
      el("stat-doctors").textContent = s.doctorsByStatus.approved || 0;
      el("stat-pending").textContent = s.doctorsByStatus.pending || 0;
      el("stat-today").textContent = s.appointmentsToday || 0;
      if (s.doctorsByStatus.pending > 0) {
        el("tile-pending").classList.add("stat-tile--alert");
        el("nav-pending-badge").textContent = s.doctorsByStatus.pending;
        el("nav-pending-badge").hidden = false;
      } else {
        el("tile-pending").classList.remove("stat-tile--alert");
        el("nav-pending-badge").hidden = true;
      }
    } catch (e) { /* obsłużone niżej */ }
    await loadOverviewPending();
  }

  async function loadOverviewPending() {
    const box = el("overview-pending");
    try {
      const { doctors } = await api.get("/admin/doctors/pending?status=pending");
      if (!doctors.length) { box.innerHTML = '<p class="empty">Brak lekarzy oczekujących na weryfikację. 🎉</p>'; return; }
      box.innerHTML = '<div class="verify-list">' + doctors.slice(0, 3).map(verifyCard).join("") + "</div>";
      wireVerifyButtons(box);
    } catch (e) { box.innerHTML = '<p class="empty">Nie udało się wczytać.</p>'; }
  }

  /* ---------- WERYFIKACJA ---------- */
  function setupVerifyTabs() {
    document.querySelectorAll("#view-weryfikacja .tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        verifyStatus = tab.dataset.vstatus;
        document.querySelectorAll("#view-weryfikacja .tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        loadVerify();
      })
    );
  }

  async function loadVerify() {
    const box = el("verify-list");
    box.innerHTML = skel(2);
    try {
      const { doctors } = await api.get("/admin/doctors/pending?status=" + verifyStatus);
      if (!doctors.length) {
        box.innerHTML = '<div class="empty"><div class="empty__ico">' + icoShield() + "</div><p>" +
          (verifyStatus === "pending" ? "Brak oczekujących zgłoszeń." : verifyStatus === "approved" ? "Brak zatwierdzonych lekarzy." : "Brak odrzuconych zgłoszeń.") + "</p></div>";
        return;
      }
      box.innerHTML = doctors.map(verifyCard).join("");
      wireVerifyButtons(box);
    } catch (e) { handleApiError(e, "Nie udało się wczytać lekarzy."); }
  }

  function verifyCard(d) {
    const st = d.verificationStatus;
    const actions = st === "pending"
      ? `<button class="btn btn--primary" type="button" data-approve="${d.id}">Zatwierdź</button>
         <button class="btn btn--danger" type="button" data-reject="${d.id}">Odrzuć</button>`
      : st === "rejected" && d.verificationReason
      ? `<span class="verify-card__reason">Powód: ${dash.esc(d.verificationReason)}</span>`
      : "";
    return `<article class="verify-card">
      <div class="verify-card__head">
        <span class="verify-card__avatar" style="background:${d.color || "#0E9F8E"}">${dash.initials(d.name)}</span>
        <div><p class="verify-card__name">${dash.esc(d.name)}</p>
        <p class="verify-card__sub">${SPEC_LABEL[d.specialization] || d.specialization} • ${dash.esc(d.city || "")}</p></div>
        <span class="status status--${st === "approved" ? "aktywna" : st === "rejected" ? "anulowana" : "zaplanowana"}">${st}</span>
      </div>
      <dl class="verify-card__facts">
        <div><dt>PWZ</dt><dd>${dash.esc(d.pwzNumber || "—")}</dd></div>
        <div><dt>Doświadczenie</dt><dd>${d.yearsExperience || 0} lat</dd></div>
        <div><dt>Cena</dt><dd>${d.consultationPrice || 0} zł</dd></div>
        <div><dt>E-mail</dt><dd>${dash.esc(d.email)}</dd></div>
      </dl>
      ${d.bio ? `<p class="verify-card__bio">${dash.esc(d.bio)}</p>` : ""}
      <div class="verify-card__foot">${actions}</div>
    </article>`;
  }

  function wireVerifyButtons(scope) {
    scope.querySelectorAll("[data-approve]").forEach((b) =>
      b.addEventListener("click", () => decide(Number(b.dataset.approve), "approved", b)));
    scope.querySelectorAll("[data-reject]").forEach((b) =>
      b.addEventListener("click", () => rejectFlow(Number(b.dataset.reject))));
  }

  async function decide(id, status, btn, reason) {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      await api.patch(`/admin/doctors/${id}/verify`, { status, reason });
      dash.toast(status === "approved" ? "Lekarz zatwierdzony." : "Zgłoszenie odrzucone.", "success");
      await loadVerify();
      await loadOverview();
    } catch (e) { handleApiError(e, "Nie udało się zapisać decyzji."); }
  }

  function rejectFlow(id) {
    const html =
      '<h3 class="confirm__title">Odrzucić zgłoszenie?</h3>' +
      '<p class="confirm__msg">Podaj powód (będzie zapisany przy zgłoszeniu).</p>' +
      '<div class="field"><label class="field__label" for="reject-reason">Powód</label>' +
      '<textarea class="field__input" id="reject-reason" rows="3" placeholder="np. Nieczytelny numer PWZ"></textarea></div>' +
      '<div class="confirm__actions"><button class="btn btn--ghost" type="button" data-x>Anuluj</button>' +
      '<button class="btn btn--danger" type="button" data-ok>Odrzuć</button></div>';
    const m = dash.openModal(html, { label: "Odrzuć zgłoszenie" });
    m.root.addEventListener("click", (e) => {
      if (e.target.closest("[data-x]")) m.close();
      if (e.target.closest("[data-ok]")) {
        const reason = m.root.querySelector("#reject-reason").value.trim();
        m.close();
        decide(id, "rejected", null, reason);
      }
    });
  }

  /* ---------- UŻYTKOWNICY ---------- */
  function setupUserControls() {
    document.querySelectorAll("#role-filter .chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        userFilter.role = chip.dataset.role;
        userFilter.page = 1;
        document.querySelectorAll("#role-filter .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        loadUsers();
      })
    );
    el("user-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { userFilter.search = e.target.value.trim(); userFilter.page = 1; loadUsers(); }, 300);
    });
    el("users-pagination").addEventListener("click", (e) => {
      const b = e.target.closest("[data-page]");
      if (b && !b.disabled) { userFilter.page = Number(b.dataset.page); loadUsers(); window.scrollTo({ top: 0 }); }
    });
  }

  async function loadUsers() {
    const box = el("users-list");
    box.innerHTML = skel(4);
    try {
      const q = new URLSearchParams({ page: userFilter.page, pageSize: 10 });
      if (userFilter.role) q.set("role", userFilter.role);
      if (userFilter.search) q.set("search", userFilter.search);
      const res = await api.get("/admin/users?" + q.toString());
      if (!res.users.length) {
        box.innerHTML = '<div class="empty"><div class="empty__ico">' + icoUsers() + "</div><p>" +
          (userFilter.search ? "Brak użytkowników pasujących do wyszukiwania." : "Brak użytkowników.") + "</p></div>";
        el("users-pagination").innerHTML = "";
        return;
      }
      box.innerHTML = '<div class="user-list">' + res.users.map(userCard).join("") + "</div>";
      box.querySelectorAll("[data-suspend]").forEach((b) =>
        b.addEventListener("click", () => toggleSuspend(Number(b.dataset.suspend), b.dataset.to === "1")));
      box.querySelectorAll("[data-details]").forEach((b) =>
        b.addEventListener("click", () => showUserDetails(Number(b.dataset.details))));
      renderPagination(res.page, res.pages);
    } catch (e) { handleApiError(e, "Nie udało się wczytać użytkowników."); }
  }

  function userCard(u) {
    const canSuspend = u.role !== "admin";
    return `<div class="user-row ${u.isSuspended ? "is-suspended" : ""}">
      <span class="patient-row__avatar" style="background:${u.role === "doctor" ? "#0B7A6D" : u.role === "admin" ? "#7C6BD6" : "#0E9F8E"}">${dash.initials(u.name)}</span>
      <div class="patient-row__main">
        <p class="patient-row__name">${dash.esc(u.name)} ${u.isSuspended ? '<span class="status status--anulowana">zawieszony</span>' : ""}</p>
        <p class="patient-row__sub">${dash.esc(u.email)}</p>
      </div>
      <span class="role-badge role-badge--${u.role}">${ROLE_LABEL[u.role]}${u.role === "doctor" && u.verificationStatus && u.verificationStatus !== "approved" ? " • " + u.verificationStatus : ""}</span>
      <div class="user-row__actions">
        <button class="btn btn--ghost" type="button" data-details="${u.id}">Szczegóły</button>
        ${canSuspend ? `<button class="btn ${u.isSuspended ? "btn--primary" : "btn--danger"}" type="button" data-suspend="${u.id}" data-to="${u.isSuspended ? 0 : 1}">${u.isSuspended ? "Odblokuj" : "Zawieś"}</button>` : ""}
      </div>
    </div>`;
  }

  async function toggleSuspend(id, suspend) {
    const ok = await dash.confirm({
      title: suspend ? "Zawiesić konto?" : "Odblokować konto?",
      message: suspend ? "Użytkownik nie będzie mógł się zalogować, dopóki nie odblokujesz konta." : "Użytkownik odzyska możliwość logowania.",
      confirmText: suspend ? "Zawieś" : "Odblokuj",
      danger: suspend,
    });
    if (!ok) return;
    try {
      await api.patch(`/admin/users/${id}/status`, { suspended: suspend });
      dash.toast(suspend ? "Konto zawieszone." : "Konto odblokowane.", "success");
      loadUsers();
    } catch (e) { handleApiError(e, "Nie udało się zmienić statusu."); }
  }

  async function showUserDetails(id) {
    try {
      const { user } = await api.get("/admin/users/" + id);
      const a = user.activity || {};
      const rows = [
        ["Rola", ROLE_LABEL[user.role]],
        ["E-mail", user.email],
        ["Status", user.isSuspended ? "zawieszony" : "aktywny"],
        ["Dołączył", dash.fmtDate((user.createdAt || "").slice(0, 10))],
      ];
      if (user.role === "doctor" && user.profile) {
        rows.push(["Specjalizacja", SPEC_LABEL[user.profile.specialization] || user.profile.specialization]);
        rows.push(["Weryfikacja", user.profile.verificationStatus]);
      }
      let activity = "";
      if (a.appointments != null) {
        activity = '<p class="data-item__sub" style="margin:var(--space-3) 0 .4rem">Aktywność</p>' +
          '<ul class="profile__facts">' +
          `<li><span class="profile__fact-k">Wizyty</span><span class="profile__fact-v">${a.appointments}</span></li>` +
          `<li><span class="profile__fact-k">Zrealizowane</span><span class="profile__fact-v">${a.realized}</span></li>` +
          `<li><span class="profile__fact-k">Anulowane</span><span class="profile__fact-v">${a.cancelled}</span></li>` +
          `<li><span class="profile__fact-k">Recepty</span><span class="profile__fact-v">${a.prescriptions}</span></li>` +
          (a.patients != null ? `<li><span class="profile__fact-k">Pacjenci</span><span class="profile__fact-v">${a.patients}</span></li>` : "") +
          "</ul>";
      }
      const name = user.profile ? (user.profile.name || `${user.profile.firstName} ${user.profile.lastName}`) : user.email;
      dash.openModal(`<h3 class="detail__title">${dash.esc(name)}</h3><div class="detail__list">` +
        rows.map((r) => `<div class="detail__row"><span>${r[0]}</span><strong>${dash.esc(r[1])}</strong></div>`).join("") +
        "</div>" + activity, { label: "Szczegóły użytkownika" });
    } catch (e) { handleApiError(e, "Nie udało się wczytać szczegółów."); }
  }

  function renderPagination(page, pages) {
    const p = el("users-pagination");
    if (pages <= 1) { p.innerHTML = ""; return; }
    let html = `<button class="pagination__btn" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Poprzednia">‹</button>`;
    for (let i = 1; i <= pages; i++) html += `<button class="pagination__btn${i === page ? " is-current" : ""}" data-page="${i}"${i === page ? ' aria-current="page"' : ""}>${i}</button>`;
    html += `<button class="pagination__btn" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Następna">›</button>`;
    p.innerHTML = html;
  }

  /* ---------- WIZYTY / RECEPTY (wgląd) ---------- */
  function setupApptFilters() {
    el("appt-status").addEventListener("change", loadAppts);
    el("appt-date").addEventListener("change", loadAppts);
    el("rx-date").addEventListener("change", loadRx);
  }

  async function loadAppts() {
    const box = el("appts-view");
    box.innerHTML = skel(3);
    try {
      const q = new URLSearchParams();
      if (el("appt-status").value) q.set("status", el("appt-status").value);
      if (el("appt-date").value) q.set("date", el("appt-date").value);
      const { appointments } = await api.get("/admin/appointments?" + q.toString());
      if (!appointments.length) { box.innerHTML = '<div class="empty"><div class="empty__ico">' + icoCal() + "</div><p>Brak wizyt dla wybranych filtrów.</p></div>"; return; }
      box.innerHTML = tableWrap(
        ["Data", "Godz.", "Pacjent", "Lekarz", "Usługa", "Status"],
        appointments.map((a) => [dash.fmtDate(a.date), a.time, dash.esc(a.patient), dash.esc(a.doctor), a.service, dash.statusBadge(a.status)])
      );
    } catch (e) { handleApiError(e, "Nie udało się wczytać wizyt."); }
  }

  async function loadRx() {
    const box = el("rx-view");
    box.innerHTML = skel(3);
    try {
      const q = new URLSearchParams();
      if (el("rx-date").value) q.set("date", el("rx-date").value);
      const { prescriptions } = await api.get("/admin/prescriptions?" + q.toString());
      if (!prescriptions.length) { box.innerHTML = '<div class="empty"><div class="empty__ico">' + icoRx() + "</div><p>Brak recept dla wybranych filtrów.</p></div>"; return; }
      box.innerHTML = tableWrap(
        ["Data", "Lek", "Pacjent", "Lekarz", "Kod"],
        prescriptions.map((p) => [dash.fmtDate((p.issuedAt || "").slice(0, 10)), dash.esc(p.medication), dash.esc(p.patient), dash.esc(p.doctor), `<span class="rx-code">${dash.esc(p.code)}</span>`])
      );
    } catch (e) { handleApiError(e, "Nie udało się wczytać recept."); }
  }

  function tableWrap(headers, rows) {
    return '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
      headers.map((h) => `<th>${h}</th>`).join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }

  /* ---------- STATYSTYKI ---------- */
  async function loadStats() {
    try {
      const s = await api.get("/admin/stats");
      el("stats-tiles").innerHTML = [
        ["Wszyscy użytkownicy", s.totals.users],
        ["Pacjenci", s.usersByRole.patient || 0],
        ["Lekarze (zatw.)", s.doctorsByStatus.approved || 0],
        ["Wskaźnik anulowań", s.cancellationRate + "%"],
      ].map(([l, v]) => `<li class="stat-tile"><div class="stat-tile__value">${v}</div><div class="stat-tile__label">${l}</div></li>`).join("");

      renderVisitsChart(s.visitsByDay);
      renderSpecialtyChart(s.specialtyPopularity);
    } catch (e) { /* obsłużone w loadOverview */ }
  }

  function renderVisitsChart(days) {
    const W = 640, H = 160, base = 130;
    const max = Math.max(1, ...days.map((d) => d.count));
    const bw = W / days.length;
    const bars = days.map((d, i) => {
      const h = (d.count / max) * 105;
      const x = i * bw + 1;
      return `<rect x="${x}" y="${base - h}" width="${bw - 2}" height="${Math.max(h, 1)}" rx="1.5" class="chart-bar"></rect>`;
    }).join("");
    const firstLbl = days[0].date.slice(5).replace("-", ".");
    const lastLbl = days[days.length - 1].date.slice(5).replace("-", ".");
    el("chart-visits").innerHTML =
      `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Wizyty w ostatnich 30 dniach">
         <line x1="0" y1="${base}" x2="${W}" y2="${base}" class="chart-axis"/>${bars}
         <text x="0" y="152" class="chart-label">${firstLbl}</text>
         <text x="${W}" y="152" text-anchor="end" class="chart-label">${lastLbl}</text></svg>`;
  }

  function renderSpecialtyChart(counts) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) { el("chart-specialties").innerHTML = '<p class="empty">Brak danych.</p>'; return; }
    const max = Math.max(...entries.map((e) => e[1]));
    el("chart-specialties").innerHTML = entries.map(([spec, n]) => {
      const pct = Math.round((n / max) * 100);
      return `<div class="distrib"><div class="distrib__top"><span>${SPEC_LABEL[spec] || spec}</span><strong>${n}</strong></div>
        <div class="distrib__track"><div class="distrib__bar" style="width:${pct}%;background:var(--c-primary)"></div></div></div>`;
    }).join("");
  }

  /* ---------- Ikony pustych stanów (SVG) ---------- */
  const icoShield = () => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
  const icoUsers = () => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-3-4.9"/></svg>';
  const icoCal = () => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>';
  const icoRx = () => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

  /* ---------- ROUTING / DRAWER ---------- */
  const loadedViews = new Set(["przeglad"]);
  function ensureView(name) {
    if (loadedViews.has(name)) return;
    loadedViews.add(name);
    if (name === "weryfikacja") loadVerify();
    else if (name === "uzytkownicy") loadUsers();
    else if (name === "wizyty") loadAppts();
    else if (name === "recepty") loadRx();
    else if (name === "ustawienia" && window.Zdrovia.adminSettings) window.Zdrovia.adminSettings.render(me);
    else if (name === "ustawienia") el("settings-root").innerHTML = '<p class="empty">Moduł ustawień niedostępny.</p>';
  }

  function showView(name) {
    if (!VIEWS.includes(name)) name = "przeglad";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll(".side-nav__link, .bottom-nav__link").forEach((l) =>
      l.classList.toggle("is-active", l.dataset.view === name));
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    ensureView(name);
    closeDrawer();
    window.scrollTo({ top: 0 });
  }

  function setupNavigation() {
    window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
    const sideNav = el("side-nav"), scrim = el("side-scrim"), toggle = el("side-toggle");
    window.__closeDrawer = () => { sideNav.classList.remove("is-open"); scrim.hidden = true; toggle.setAttribute("aria-expanded", "false"); document.body.classList.remove("no-scroll"); };
    const open = () => { sideNav.classList.add("is-open"); scrim.hidden = false; toggle.setAttribute("aria-expanded", "true"); document.body.classList.add("no-scroll"); };
    toggle.addEventListener("click", () => sideNav.classList.contains("is-open") ? window.__closeDrawer() : open());
    scrim.addEventListener("click", window.__closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sideNav.classList.contains("is-open")) window.__closeDrawer(); });
  }
  function closeDrawer() { if (window.__closeDrawer) window.__closeDrawer(); }
})();
