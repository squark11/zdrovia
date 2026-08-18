# Zdrovia — platforma telemedyczna (full-stack)

Koncepcja nowoczesnej platformy do **e-konsultacji, e-recept i e-zwolnień online**.
Projekt składa się z:

- **Frontendu** — statyczna, responsywna strona (landing page) + strony logowania/
  rejestracji i **dashboardy pacjenta oraz lekarza**. Czysty **HTML/CSS/JavaScript**,
  bez frameworków.
- **Backendu** — **REST API** (Node.js + Express + SQLite) z autentykacją JWT,
  hashowaniem haseł (bcrypt), walidacją (zod) i kontrolą ról.

> „Zdrovia" to fikcyjna, autorska marka stworzona na potrzeby zadania rekrutacyjnego.
> Dane lekarzy, opinie i konta są przykładowe. To projekt demonstracyjny — **nie**
> integruje się z realnym systemem e-zdrowie (P1) ani z operatorem płatności.

---

## Szybki start

Wymagania: **Node.js ≥ 18** (testowane na 22).

```bash
cd backend
npm install        # instalacja zależności
npm run seed       # wypełnienie bazy danymi demo (12 lekarzy + pacjent)
npm run dev        # start serwera (nodemon) — http://localhost:4000
```

Następnie otwórz **http://localhost:4000** — backend serwuje jednocześnie API
(`/api/...`) i frontend z tego samego origin (dzięki temu ciasteczka sesji działają
bez konfiguracji CORS).

Alternatywnie `npm start` uruchamia serwer bez nodemona.

### Konta demo (po `npm run seed`)

| Rola    | E-mail                       | Hasło       |
|---------|------------------------------|-------------|
| Pacjent | `pacjent@zdrovia.pl`         | `Haslo123!` |
| Lekarz  | `anna.kowalska@zdrovia.pl`   | `Haslo123!` |

Wszyscy lekarze mają hasło `Haslo123!` i e-mail w formacie
`imie.nazwisko@zdrovia.pl` (np. `maria.wisniewska@zdrovia.pl`).

### Uruchomienie frontendu osobno (opcjonalnie)

Frontend można też serwować z innego serwera statycznego (np. `python -m http.server 8123`
w katalogu głównym). Backend ma skonfigurowany **CORS** (`CLIENT_ORIGIN` w `.env`) i akceptuje
token również w nagłówku `Authorization: Bearer` — landing page działa nawet bez backendu
(wtedy lista lekarzy pochodzi z danych mockowych w `script/data.js`).

---

## Struktura projektu

```
zdrowie24.pl/
├── index.html                 # Landing page
├── login.html / register.html # Autentykacja (rejestracja z przełącznikiem roli)
├── dashboard-patient.html     # Panel pacjenta (wizyty, recepty, usługi)
├── dashboard-doctor.html      # Panel lekarza (wizyty, recepty, dostępność, profil)
├── umow.html                  # Kreator rezerwacji / płatnej usługi (e-recepta, L4, skierowanie)
├── style/                     # base / layout / components / sections / app (CSS)
├── script/
│   ├── data.js                # Dane mockowe (fallback landing page)
│   ├── api.js                 # Klient REST API (fetch + JWT)
│   ├── specialties.js, doctors.js, modal.js, reviews.js, faq.js, form.js,
│   │   ui.js, main.js, auth-nav.js   # Logika landing page
│   ├── login.js, register.js         # Autentykacja
│   ├── dash-common.js                # Wspólne narzędzia dashboardów (guard, formatery)
│   └── dashboard-patient.js, dashboard-doctor.js
├── images/ , assets/
└── backend/
    ├── package.json           # Skrypty: dev / start / seed
    ├── .env.example           # Wzorzec konfiguracji (JWT_SECRET, PORT, DATABASE_URL…)
    └── src/
        ├── server.js          # Wejście: CORS, montowanie API, statyczny frontend
        ├── db/                # index.js (schemat SQLite) + seed.js
        ├── routes/            # auth / doctors / patients / appointments / prescriptions
        ├── controllers/       # logika endpointów
        ├── middleware/        # auth (JWT + role), validate (zod), error (spójny format)
        ├── services/          # slots.service.js (generowanie wolnych terminów)
        └── utils/             # jwt.js, validators.js (schematy zod), mappers.js
```

---

## Architektura backendu

- **Warstwy**: `routes → middleware (auth/validate) → controllers → db`. Każdy plik ma
  jedną odpowiedzialność.
- **Baza**: SQLite przez `better-sqlite3` (synchronicznie, bez zewnętrznej infrastruktury).
  Schemat tworzony idempotentnie przy starcie; klucze obce egzekwowane (`PRAGMA foreign_keys`).
- **Autentykacja**: JWT podpisywany sekretem z `.env`. Token wydawany przy rejestracji/
  logowaniu, weryfikowany w `requireAuth`; `requireRole('doctor'|'patient')` chroni endpointy.
- **Hasła**: hashowane `bcrypt` (bcryptjs) z solą (10 rund).
- **Walidacja**: schematy `zod` w `utils/validators.js`; middleware zwraca `422` z mapą
  błędów pól.
- **Błędy**: spójny format `{ error: { message, details? } }` (klasa `ApiError`).
- **Terminy**: `availability` definiuje okna (dzień tygodnia + godziny). `slots.service.js`
  generuje z nich wolne 30-minutowe sloty na najbliższe dni, pomijając zajęte. Podwójna
  rezerwacja jest niemożliwa (`UNIQUE(doctor_id, date, time)` → `409`).

### Model danych (tabele)

`users`, `patient_profiles`, `doctor_profiles`, `appointments`, `prescriptions`,
`availability` — zgodnie ze specyfikacją zadania (szczegóły w `backend/src/db/index.js`).

### Endpointy API (prefiks `/api`)

| Metoda + ścieżka | Dostęp | Opis |
|---|---|---|
| `POST /auth/register` | publiczny | Rejestracja (`role: patient\|doctor`) + auto-login |
| `POST /auth/login` | publiczny | Logowanie |
| `POST /auth/logout` | publiczny | Wylogowanie (czyści cookie) |
| `GET /auth/me` | zalogowany | Dane bieżącego użytkownika |
| `GET /doctors` | publiczny | Lista lekarzy (+ filtr `?specialization=`) |
| `GET /doctors/:id` | publiczny | Szczegóły lekarza |
| `PATCH /doctors/:id` | lekarz (właściciel) | Edycja profilu |
| `GET /doctors/:id/availability` | publiczny | Okna + wolne sloty |
| `PATCH /doctors/:id/availability` | lekarz (właściciel) | Zapis dostępności |
| `GET /patients/me` `PATCH /patients/me` | pacjent | Profil pacjenta |
| `GET /appointments` | zalogowany | Wizyty (pacjent: swoje, lekarz: przypisane) |
| `POST /appointments` | pacjent | Umówienie wizyty w wolnym slocie |
| `PATCH /appointments/:id` | pacjent/lekarz | Anulowanie / oznaczenie „zrealizowana" |
| `GET /prescriptions` | zalogowany | Recepty (wg roli) |
| `POST /prescriptions` | lekarz | Wystawienie e-recepty do wizyty |

---

## Bezpieczeństwo tokenu: httpOnly cookie vs localStorage

Backend wydaje token na **oba sposoby** (w ciasteczku **oraz** w treści odpowiedzi),
a `requireAuth` akceptuje token z ciasteczka **lub** nagłówka `Authorization`.

- **httpOnly cookie** (używane domyślnie, gdy front i API są na tym samym origin) —
  **bezpieczniejsze**: token jest niedostępny dla JavaScriptu, więc **XSS nie może go
  wykraść**. Wymaga ochrony przed CSRF (tu: `SameSite=Lax`).
- **localStorage + `Authorization: Bearer`** (fallback, np. gdy front jest na innym
  origin) — **wygodniejsze**, ale token jest dostępny dla JS, więc **podatny na kradzież
  przy ataku XSS**.

Frontend zapisuje token także w `localStorage`, aby działać w obu trybach; w produkcji
zalecane jest oparcie się wyłącznie o httpOnly cookie + ochronę CSRF.

---

## Frontend — decyzje projektowe

- **Vanilla JS w modułach IIFE**, luźno powiązanych zdarzeniami (`CustomEvent`); wspólny
  „namespace" `window.Zdrovia`.
- **Landing page podłączony do API**: lista lekarzy i liczniki specjalizacji pochodzą z
  `GET /api/doctors` (z automatycznym fallbackiem do danych mockowych, gdy backend nie działa).
- **Paleta i UX**: miętowo-turkusowy kolor główny + ciepły akcent, karty, delikatne cienie.
  Design tokens w zmiennych CSS. Nazewnictwo klas **BEM**. Mobile-first, WCAG AA
  (kontrast, `aria-*`, focus states, `prefers-reduced-motion`).
- **Interakcje**: filtrowanie i doładowywanie listy lekarzy („Pokaż więcej"), modal profilu
  lekarza z opiniami (focus trap, Escape, deep-link `#lekarz=`), akordeon FAQ, scroll-spy,
  animacje `IntersectionObserver`, walidacje formularzy, responsywne menu.
- **Dashboardy**: stan ładowania (spinnery), spójne komunikaty błędów z API, kontrola dostępu
  po stronie klienta (guard) + realna po stronie serwera.
- **Kreator rezerwacji** ([umow.html](umow.html)) — wieloetapowy formularz w stylu „Zaufanego
  Lekarza": usługa (E-konsultacja / E-recepta / E-zwolnienie L4 / E-skierowanie) → lekarz →
  termin i forma (wideo/czat/telefon) → powód + kwestionariusz zależny od usługi → **płatność**.
  Płatność jest **symulowana** (wybór BLIK/karta/przelew, bez pobierania prawdziwych danych
  karty) — to projekt demonstracyjny. Kwota i status opłacenia zapisują się przy wizycie.
- **Konta demo**: na stronie logowania dostępne jest **logowanie jednym kliknięciem** (pacjent
  lub lekarz), aby ułatwić przejrzenie projektu.

---

## Pełny przepływ (przetestowany)

Rejestracja pacjenta → auto-login → umówienie wizyty (wybór lekarza → wolny slot) →
logowanie lekarza → panel lekarza (wizyta widoczna) → wystawienie e-recepty →
status wizyty zmienia się na „zrealizowana" → recepta widoczna u pacjenta.
Sprawdzone też: podwójna rezerwacja → `409`, brak uprawnień → `403`, walidacja → `422`.

---

## Czego brakuje do wersji produkcyjnej

- **Integracja z e-zdrowie (P1)** — realne wystawianie e-recept, e-skierowań i e-zwolnień (L4).
- **Płatności** — operator (BLIK/karta), potwierdzenia, faktury; obecnie brak etapu płatności.
- **Wideokonsultacje** (WebRTC), czat w czasie rzeczywistym.
- **Bezpieczeństwo**: refresh tokeny + rotacja, ochrona CSRF, **rate limiting** i lockout
  logowania, nagłówki bezpieczeństwa (helmet), HTTPS, audyt zależności.
- **RODO**: zgody, retencja i szyfrowanie danych medycznych, rejestr czynności, prawo do
  bycia zapomnianym.
- **Baza**: migracja na PostgreSQL, migracje wersjonowane, kopie zapasowe.
- **Jakość**: testy jednostkowe i e2e (Playwright), CI/CD, logowanie i monitoring, obsługa
  stref czasowych, paginacja i wyszukiwanie po stronie API.
- **Produkcja frontendu**: minifikacja, self-hosting fontu, nagłówki cache, budowanie assetów.
```
