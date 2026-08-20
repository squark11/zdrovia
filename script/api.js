/* =============================================================
   api.js
   Klient REST API backendu Zdrovia. Obsługuje:
   - automatyczny wybór adresu API (ten sam origin :4000 albo dev),
   - JWT: httpOnly cookie (credentials: include) ORAZ token w
     nagłówku Authorization jako fallback (np. gdy front jest
     serwowany z innego origin niż API) — patrz README (bezpieczeństwo),
   - spójne parsowanie błędów z API,
   - loadDoctors(): pobranie i zmapowanie lekarzy (z fallbackiem do
     danych mockowych, gdy backend jest niedostępny).
============================================================= */
(function () {
  "use strict";

  // Jeśli frontend serwuje backend (port 4000) → ten sam origin.
  const SAME_ORIGIN = location.port === "4000";
  const API_BASE = SAME_ORIGIN ? "/api" : "http://localhost:4000/api";
  const TOKEN_KEY = "zdrovia_token";

  const getToken = () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_e) { return null; }
  };
  const setToken = (t) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
    catch (_e) {}
  };

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: "include", // przesyłaj httpOnly cookie
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch (_e) { /* brak treści */ }

    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || `Błąd ${res.status}`);
      err.status = res.status;
      err.details = data && data.error && data.error.details;
      throw err;
    }
    return data;
  }

  /* Zamiana lekarza z API na kształt używany przez UI landing page. */
  function localYMD(d) {
    return (
      d.getFullYear() +
      "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0")
    );
  }
  function availabilityText(next) {
    if (!next) return { text: "wkrótce", soon: false };
    const today = localYMD(new Date());
    const tomorrow = localYMD(new Date(Date.now() + 86400000));
    let text;
    if (next.date === today) text = "dziś " + next.time;
    else if (next.date === tomorrow) text = "jutro " + next.time;
    else {
      const [, m, d] = next.date.split("-");
      text = `${d}.${m} ${next.time}`;
    }
    return { text, soon: next.date === today || next.date === tomorrow };
  }
  function mapDoctor(d) {
    const a = availabilityText(d.nextAvailable);
    return {
      id: d.id,
      name: d.name,
      spec: d.specialization,
      rating: d.rating,
      reviews: d.reviewsCount,
      availability: a.text,
      soon: a.soon,
      price: d.consultationPrice,
      color: d.color,
      experience: d.yearsExperience,
      city: d.city,
      bio: d.bio,
      languages: d.languages,
      nextAvailable: d.nextAvailable,
    };
  }

  let doctorsPromise = null;
  /* Pobiera lekarzy z API; przy błędzie używa danych mockowych. */
  function loadDoctors() {
    if (doctorsPromise) return doctorsPromise;
    doctorsPromise = request("GET", "/doctors")
      .then((res) => {
        const list = res.doctors.map(mapDoctor);
        window.Zdrovia.doctors = list;
        window.Zdrovia.usingApi = true;
        return list;
      })
      .catch((_e) => {
        // Fallback: backend nieuruchomiony → dane mockowe (landing działa offline).
        const fallback = (window.Zdrovia.data && window.Zdrovia.data.doctors) || [];
        window.Zdrovia.doctors = fallback;
        window.Zdrovia.usingApi = false;
        return fallback;
      });
    return doctorsPromise;
  }

  const api = {
    base: API_BASE,
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    put: (p, b) => request("PUT", p, b),
    patch: (p, b) => request("PATCH", p, b),
    async register(payload) {
      const d = await request("POST", "/auth/register", payload);
      if (d.token) setToken(d.token);
      return d;
    },
    async login(email, password) {
      const d = await request("POST", "/auth/login", { email, password });
      if (d.token) setToken(d.token);
      return d;
    },
    async logout() {
      try { await request("POST", "/auth/logout"); } catch (_e) {}
      setToken(null);
    },
    me: () => request("GET", "/auth/me"),
    getToken,
    setToken,
  };

  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.api = api;
  window.Zdrovia.loadDoctors = loadDoctors;
})();
