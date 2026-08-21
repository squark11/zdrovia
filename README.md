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
npm install                    # instalacja zależności
cp .env.example .env           # konfiguracja (uzupełnij sekrety — patrz niżej)
npm run seed                   # dane demo (12 lekarzy + pacjent)
npm run seed:admin             # konto administratora (z ADMIN_EMAIL/ADMIN_PASSWORD)
npm run dev                    # start serwera (nodemon) — http://localhost:4000
```

**WYMAGANE przed startem:** w `.env` ustaw `ENCRYPTION_KEY` (32 bajty = 64 znaki hex).
Bez niego serwer **nie wystartuje** (szyfruje sekrety konfiguracyjne — patrz
[Bezpieczeństwo sekretów](#bezpieczeństwo-sekretów-konfiguracyjnych)). Wygeneruj:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Następnie otwórz **http://localhost:4000** — backend serwuje jednocześnie API
(`/api/...`) i frontend z tego samego origin (dzięki temu ciasteczka sesji działają
bez konfiguracji CORS).

Alternatywnie `npm start` uruchamia serwer bez nodemona.

### Konta demo (po `npm run seed` / `npm run seed:admin`)

| Rola    | E-mail                       | Hasło       |
|---------|------------------------------|-------------|
| Pacjent | `pacjent@zdrovia.pl`         | `Haslo123!` |
| Lekarz  | `anna.kowalska@zdrovia.pl`   | `Haslo123!` |
| Admin   | `admin@zdrovia.pl` (`ADMIN_EMAIL`) | `Admin123!` (`ADMIN_PASSWORD`) |

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
├── style/                     # base / layout / components / sections / app / dashboard (CSS)
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

`users` (role `patient|doctor|admin`, `is_suspended`), `patient_profiles`,
`doctor_profiles` (`verification_status`), `appointments` (`reminder_sent`),
`prescriptions`, `availability`, `triage_conversations`, `platform_settings`
(klucz→wartość; sekrety szyfrowane) — szczegóły w
[`backend/src/db/index.js`](backend/src/db/index.js).

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
| `GET /config` | publiczny | Nie-sekretne flagi funkcji (real-time, dark mode) + nazwa aplikacji |
| `GET /triage` … | publiczny/zalogowany | AI Triage (proxy do n8n) — patrz sekcja niżej |
| `GET /admin/stats` | admin | Statystyki platformy |
| `GET /admin/users` `GET /admin/users/:id` | admin | Lista / szczegóły użytkowników |
| `PATCH /admin/users/:id/status` | admin | Zawieszenie / przywrócenie konta |
| `GET /admin/doctors/pending` `PATCH /admin/doctors/:id/verify` | admin | Weryfikacja lekarzy |
| `GET /admin/appointments` `GET /admin/prescriptions` | admin | Wgląd (bez edycji) |
| `GET /admin/settings` | admin | Ustawienia platformy (**sekrety zamaskowane**) |
| `PUT /admin/settings` | admin | Zapis ustawień (sekrety szyfrowane; puste pole = bez zmian) |
| `POST /admin/settings/test-smtp` | admin | Wysyłka testowego e-maila (rate limit 5/15 min) |

Powiadomienia e-mail (potwierdzenie wizyty, nowa e-recepta, przypomnienie o wizycie
na jutro — cron godzinowy) i aktualizacje **real-time** (Socket.io) wyzwalają się przy
`POST /appointments`, `PATCH /appointments/:id`, `POST /prescriptions`. Obie funkcje
respektują flagi z ustawień (`enable_email_notifications`, `enable_realtime`) i są
owinięte w `try/catch` — ich awaria **nie przerywa** głównej operacji.

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

## Bezpieczeństwo sekretów konfiguracyjnych

Ustawienia platformy (panel admina → **Ustawienia**) przechowują dane wrażliwe: hasło
SMTP oraz sekret webhooka n8n. Chronimy je warstwowo:

- **Szyfrowanie w spoczynku (AES-256-GCM).** Sekrety trafiają do tabeli `platform_settings`
  wyłącznie w formie zaszyfrowanej, w formacie `iv:authTag:ciphertext` (hex, losowe 96-bit IV
  na każdą wartość). Implementacja: [`backend/src/services/encryption.service.js`](backend/src/services/encryption.service.js).
- **Klucz tylko ze środowiska.** `ENCRYPTION_KEY` (32 bajty = 64 znaki hex) czytany jest
  **wyłącznie** ze zmiennej środowiskowej — nigdy z bazy ani z kodu. Bez poprawnego klucza
  serwer **nie startuje** (`process.exit(1)` z jasnym komunikatem — patrz
  [`backend/src/server.js`](backend/src/server.js)), aby nie działać po cichu bez szyfrowania.
- **Sekrety nie wracają do przeglądarki.** `GET /api/admin/settings` zwraca dla pól sekretnych
  jedynie `{ secret: true, isSet: <bool> }` — nigdy odszyfrowanej wartości. W UI pole jest
  zamaskowane (`••••••••`); puste pole przy zapisie **nie nadpisuje** zapisanego sekretu, a
  przycisk „Wyczyść" ustawia wartość na `NULL`.
- **Brak wycieków do logów.** Odszyfrowane sekrety nie trafiają do `console.log`, treści błędów
  ani odpowiedzi API. Błędy SMTP z testu są **kategoryzowane** (np. „błąd uwierzytelniania”,
  „brak połączenia”) bez ujawniania hasła.
- **Poza repozytorium.** `.env` oraz plik bazy SQLite (`data/`, `*.db*`) są w
  [`backend/.gitignore`](backend/.gitignore).

Wygenerowanie klucza: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Zmienne środowiskowe (w tym `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) opisuje
[`backend/.env.example`](backend/.env.example).

---

## Usprawnienia UX (ustawienia, e-mail, real-time, dark mode, szkieletony)

- **Ustawienia platformy** — sekcja w panelu admina: dane SMTP, integracja n8n, nazwa
  aplikacji, e-mail wsparcia oraz flagi funkcji (`enable_email_notifications`,
  `enable_realtime`, `enable_dark_mode_default`). Sekrety szyfrowane (wyżej); konfiguracja
  czytana w locie z 5-min cache, unieważnianym przy zapisie.
- **Powiadomienia e-mail** (Nodemailer) — potwierdzenie umówionej wizyty, powiadomienie o
  nowej e-recepcie oraz **przypomnienie o wizycie na jutro** (cron godzinowy,
  [`checkReminders.js`](backend/src/scripts/checkReminders.js); kolumna `reminder_sent`
  gwarantuje jednokrotną wysyłkę). Konfiguracja SMTP z ustawień; wysyłka poza ścieżką
  odpowiedzi HTTP i w `try/catch`.
- **Aktualizacje na żywo** (Socket.io) — po zalogowaniu klient dołącza do prywatnego pokoju
  `user:<id>` (autoryzacja tokenem JWT na handshake). Zdarzenia: `appointment:new`,
  `appointment:updated` (lekarz), `prescription:new` (pacjent) → toast + odświeżenie widoku
  bez przeładowania. Łączy się tylko, gdy funkcja jest włączona (`GET /api/config`).
- **Tryb ciemny** — kolory oparte o zmienne CSS (`:root` + `:root[data-theme="dark"]`, kontrast
  WCAG AA, nie surowa inwersja). Przełącznik (słońce/księżyc) w nagłówkach; wybór zapisywany
  w `localStorage`, odczytywany **wcześnie inline-skryptem w `<head>`** (brak mignięcia/FOUC).
  Priorytet: wybór użytkownika → `prefers-color-scheme` → domyślny motyw platformy. Kolory
  wykresów również z tokenów (adaptują się do motywu).
- **Szkieletony i puste stany** — treściowo dopasowane `.skeleton` (shimmer, wyłączany przy
  `prefers-reduced-motion`) zamiast spinnerów w listach; dopracowane puste stany z ikoną SVG
  i wezwaniem do działania (CTA).

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
- **Dashboardy**: stan ładowania (treściowe **szkieletony**), aktualizacje na żywo (Socket.io),
  tryb ciemny, spójne komunikaty błędów z API, kontrola dostępu po stronie klienta (guard)
  + realna po stronie serwera.
- **Kreator rezerwacji** ([umow.html](umow.html)) — wieloetapowy formularz w stylu „Zaufanego
  Lekarza": usługa (E-konsultacja / E-recepta / E-zwolnienie L4 / E-skierowanie) → lekarz →
  termin i forma (wideo/czat/telefon) → powód + kwestionariusz zależny od usługi → **płatność**.
  Płatność jest **symulowana** (wybór BLIK/karta/przelew, bez pobierania prawdziwych danych
  karty) — to projekt demonstracyjny. Kwota i status opłacenia zapisują się przy wizycie.
- **Konta demo**: na stronie logowania dostępne jest **logowanie jednym kliknięciem** (pacjent
  lub lekarz), aby ułatwić przejrzenie projektu.

---

## Panel pacjenta ([dashboard-patient.html](dashboard-patient.html))

W pełni funkcjonalny, responsywny panel z nawigacją SPA (przełączanie widoków po hashu URL).

**Widoki:**
- **Przegląd** — powitanie, statystyki (nadchodzące / zrealizowane / recepty / aktywne recepty),
  karta najbliższej wizyty (z akcjami „Dołącz" i „Szczegóły") oraz skróty do kluczowych akcji.
- **Moje wizyty** — zakładki **Nadchodzące / Zrealizowane / Anulowane**, karty wizyt ze statusem,
  **anulowanie z modalem potwierdzenia** (PATCH do API, natychmiastowa aktualizacja bez przeładowania),
  podgląd szczegółów, stany puste z CTA.
- **Recepty** — lista e-recept ze statusem **aktywna/wygasła**, podgląd szczegółów w modalu.
- **Profil** — edycja danych osobowych (PATCH `/patients/me`, e-mail tylko do odczytu) oraz
  **zmiana hasła** (POST `/auth/change-password`, walidacja obecnego/nowego/powtórzonego hasła).

**Mechanika i UX:**
- **Ochrona dostępu**: przy wejściu sprawdzany jest token/sesja; brak sesji lub rola ≠ `patient`
  → przekierowanie do `login.html`. Wygaśnięcie sesji (401) w trakcie → toast + powrót do logowania.
- **Stany ładowania**: skeleton-loadery i spinnery przy każdym pobieraniu danych.
- **Toasty**: własny, lekki komponent powiadomień (sukces/błąd/info) — bez bibliotek.
- **Modale**: generyczny, dostępny modal (focus trap, Escape, klik w tło); na mobile **bottom-sheet**.
- **Dostępność**: `aria-label` na przyciskach ikonowych, widoczny focus, kontrast AA, focus trap w modalach.

**Responsywność** (testowana na 375 / 768 / 1440 px, brak poziomego scrolla):
- **Mobile (<768px)**: górny pasek z hamburgerem + **wysuwany sidebar** i **dolna nawigacja** z
  wyróżnionym przyciskiem „+"; karty w jednej kolumnie, przyciski dotykowe (min 44px).
- **Tablet (768–1023px)**: węższy, stały sidebar; siatki kart 2-kolumnowe.
- **Desktop (≥1024px)**: pełny sidebar; treść wyśrodkowana bez rozciągania.

Style panelu: [style/dashboard.css](style/dashboard.css); wspólne komponenty (toast, modal)
w [script/dash-common.js](script/dash-common.js) + [style/app.css](style/app.css).

---

## Panel lekarza ([dashboard-doctor.html](dashboard-doctor.html))

Ten sam design system i komponenty co panel pacjenta (sidebar + widoki SPA, toasty, modale,
skeletony, responsywność). Widoki:

- **Przegląd** — powitanie, statystyki (wizyty w tym tygodniu, unikalni pacjenci, średnia ocena,
  szacunkowy przychód z wizyt zrealizowanych), lista dzisiejszych wizyt („Rozpocznij"/„Szczegóły"),
  skróty akcji.
- **Kalendarz** — wszystkie wizyty pogrupowane po dacie, **filtr statusu** (zaplanowana/zrealizowana/
  anulowana) i **okresu** (dziś/tydzień/nadchodzące/cały okres), **zmiana statusu** na „zrealizowana"
  (PATCH, natychmiastowa aktualizacja), szczegóły w modalu, szybkie przejście do wystawienia recepty.
- **Dostępność** — **siatka godzin** (8:00–20:00) per dzień tygodnia; sloty zajęte przez nadchodzące
  wizyty są oznaczone i nieedytowalne, wolne — klikalne. Zapis przez `PATCH /doctors/:id/availability`
  (sloty scalane w okna). Na mobile: lista dni z zawijającymi się chipami godzin (bez poziomego scrolla).
- **Pacjenci** — lista pacjentów wyliczona z wizyt, **wyszukiwanie** po nazwisku, **historia**
  pacjenta (wizyty + recepty) w modalu.
- **Recepty** — formularz wystawienia (wizyta/pacjent → lek → dawkowanie → uwagi → ważność) z
  walidacją i `POST /prescriptions` (recepta od razu widoczna u pacjenta), oraz **historia recept**
  z filtrowaniem i statusem aktywna/wygasła.
- **Statystyki** — **wykres słupkowy SVG** (wizyty w ostatnich 4 tygodniach, skalowalny `viewBox`)
  i **rozkład wg statusu** (paski proporcji) — bez zewnętrznych bibliotek, liczone z API.
- **Profil zawodowy** — edycja specjalizacji, lat doświadczenia, ceny, miasta i bio
  (`PATCH /doctors/:id`) z **żywym podglądem** karty lekarza tak, jak widzą ją pacjenci.

Ochrona dostępu (rola `doctor`), obsługa 401 (wygasła sesja), toasty i modale — jak w panelu pacjenta.
Responsywność przetestowana na 375 / 768 / 1440 px (brak poziomego scrolla).
Logika: [script/dashboard-doctor.js](script/dashboard-doctor.js); style współdzielone z panelem pacjenta
([style/dashboard.css](style/dashboard.css)).

---

## AI Triage — „Wstępna kwalifikacja objawów" (czatbot + n8n)

Czatbot dostępny dla pacjenta **przed umówieniem wizyty** (widget na landing page i w panelu
pacjenta). Zbiera opis objawów, rozpoznaje stany pilne (red flags) i sugeruje specjalizację —
**nie stawia diagnozy**.

### Architektura (backend jako proxy — front NIGDY nie łączy się z n8n)

```
Widget czatu → POST /api/triage/chat (backend) → webhook n8n (AI Agent)
             ← zapis rozmowy w bazie ← odpowiedź JSON ←
```

- **Nowa tabela** `triage_conversations`: `id, patient_id (NULL = przed rejestracją), session_id,
  messages (JSON), suggested_specialty (SUGESTIA, nie diagnoza), is_urgent, created_at, updated_at`.
- **`POST /api/triage/chat`** — body `{ sessionId, message, history? }`; waliduje wejście (długość
  ≤ 1000), rate limit **20 wiadomości / sesję / godzinę**, wywołuje webhook n8n z nagłówkiem
  `X-Webhook-Secret` i **timeoutem 15 s** (czytelny błąd, gdy n8n nie odpowiada), zapisuje rozmowę,
  zwraca `{ reply, suggestedSpecialty, isUrgent, shouldEndConversation }`. Przy `isUrgent` wątek jest
  zamykany (flaga wraca natychmiast).
- **`GET /api/triage/:sessionId`** — historia rozmowy (wznowienie po odświeżeniu strony).
- **Zmienne w `.env`**: `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`.

### Konfiguracja n8n (workflow tworzony w UI n8n, nie w tym repo)

Przykładowy szkielet w [n8n/triage-workflow-example.json](n8n/triage-workflow-example.json)
(referencja struktury węzłów — bez podłączonych credentiali). Węzły:

1. **Webhook** (trigger, `POST`, np. ścieżka `/triage`) — punkt wejścia.
2. **IF / walidacja sekretu** — sprawdza nagłówek `X-Webhook-Secret`; brak/niepoprawny → odrzucenie
   (np. Respond to Webhook 401).
3. **AI Agent** (Chat Model OpenAI/Anthropic) z **systemowym promptem**: rola = zebranie informacji
   o objawach, **NIGDY nie stawia diagnozy**; rozpoznaje **red flags** (ból w klatce piersiowej,
   trudności w oddychaniu, silne krwawienie, utrata przytomności, myśli samobójcze, objawy udaru…)
   → `isUrgent=true`; w przeciwnym razie po kilku pytaniach sugeruje **jedną** z dostępnych na
   platformie specjalizacji (internista, pediatra, dermatolog, psychiatra, ginekolog, kardiolog,
   laryngolog, endokrynolog).
4. **Structured Output Parser / Function** — wymusza JSON:
   `{ reply: string, suggestedSpecialty: string|null, isUrgent: boolean, shouldEndConversation: boolean }`.
5. **Respond to Webhook** — zwraca powyższy JSON do backendu.

### Podłączenie prawdziwego n8n

1. Zbuduj workflow jak wyżej i skopiuj **Production URL** webhooka.
2. W `.env` ustaw `N8N_WEBHOOK_URL` na ten adres oraz `N8N_WEBHOOK_SECRET` (ten sam sekret sprawdzaj
   w węźle IF w n8n).
3. Zrestartuj backend.

### Tryb testowy (bez n8n)

Repo zawiera **lokalną atrapę** n8n: `POST /api/_mock-n8n`
([backend/src/mock/triage-mock.js](backend/src/mock/triage-mock.js)) — regułowo wykrywa red flags i
sugeruje specjalizację. Domyślny `.env` wskazuje `N8N_WEBHOOK_URL` właśnie na tę atrapę, dzięki czemu
cały przepływ (widget → backend → webhook → zapis) działa od razu po `npm run dev`.

### Bezpieczeństwo i etyka

- Wynik zapisujemy jako **`suggested_specialty`** (sugestia), **nigdy** jako diagnozę.
- **Disclaimer** widoczny w widgecie przez całą rozmowę: „To nie jest diagnoza medyczna. W nagłych
  przypadkach dzwoń 112 lub jedź na SOR."
- `isUrgent` → wyraźny czerwony alert w czacie i zablokowanie dalszej rozmowy.
- **TODO (RODO):** rozmowy sesji niezalogowanych (`patient_id IS NULL`) starsze niż 24 h powinny być
  czyszczone/anonimizowane (np. zadanie cron) — zaznaczone w kodzie kontrolera.

---

## Pełny przepływ (przetestowany)

Rejestracja pacjenta → auto-login → umówienie wizyty (wybór lekarza → wolny slot) →
logowanie lekarza → panel lekarza (wizyta widoczna) → wystawienie e-recepty →
status wizyty zmienia się na „zrealizowana" → recepta widoczna u pacjenta.
Sprawdzone też: podwójna rezerwacja → `409`, brak uprawnień → `403`, walidacja → `422`.

---

---

## Wdrożenie: frontend na GitHub Pages + backend na własnym serwerze

Docelowy podział: **statyki na GitHub Pages**, **API i n8n na serwerze**.
Front i backend są wtedy na różnych originach, co narzuca kilka wymagań.

### Adres API — `script/config.js`

Frontend nie zna adresu backendu z originu strony, więc ustala go
[`script/config.js`](script/config.js), ładowany przed `api.js` w każdym HTML-u.
Kolejność rozstrzygania:

1. `window.ZDROVIA_API_ORIGIN` ustawione ręcznie przed skryptem,
2. parametr `?api=https://...` w adresie (doraźne testy innego backendu),
3. `file://` lub port typowego serwera statycznego (`8123`, `5173`, …) → `DEV_API_ORIGIN`,
4. inny port na `localhost` → **ten sam origin** (backend serwuje też statyki),
5. dowolny inny host → `PRODUCTION_API_ORIGIN`.

Zmiana adresu produkcyjnego API = edycja jednej stałej na górze tego pliku.

### HTTPS jest wymagany, nie opcjonalny

GitHub Pages serwuje wyłącznie po HTTPS. Strona z `https://` **nie wykona**
żądania do `http://` — przeglądarka zablokuje je jako *mixed content*, bez
możliwości obejścia po stronie kodu. Backend musi więc mieć:

- certyfikat **publicznie zaufany** (Let's Encrypt lub komercyjny; self-signed
  nie wystarczy — `fetch` odrzuci go bez możliwości kliknięcia „kontynuuj"),
- adres zgodny z nazwą w certyfikacie — **nie gołe IP**, bo certyfikaty
  Let's Encrypt wystawiane są na nazwy domenowe.

Konfiguracja w `.env` — jeden z dwóch wariantów:

```
# PEM (typowe dla Let's Encrypt / certbota)
SSL_CERT_FILE=C:/certs/zdrovia/cert.pem
SSL_KEY_FILE=C:/certs/zdrovia/key.pem

# albo PFX/PKCS#12 (wygodne na Windows)
SSL_PFX_FILE=C:/certs/zdrovia/zdrovia.pfx
SSL_PFX_PASSPHRASE=...
```

Bez tych zmiennych serwer wstaje po HTTP i wypisuje ostrzeżenie w logu.
Błąd odczytu certyfikatu **przerywa start** — nie ma cichego fallbacku na HTTP,
żeby nie wystawić tokenów i danych medycznych nieszyfrowanym łączem.

### Ciasteczka a inny origin

Przy froncie na osobnym hoście przeglądarka **nie wyśle** ciasteczka
`SameSite=Lax`, więc uwierzytelnienie opiera się na nagłówku
`Authorization: Bearer` (token z `localStorage`) — patrz sekcja
[Bezpieczeństwo tokenu](#bezpieczeństwo-tokenu-httponly-cookie-vs-localstorage).
`COOKIE_SAMESITE=none` przywróciłoby ciasteczka cross-site, ale **znosi wbudowaną
ochronę przed CSRF** — ustawiaj tylko razem z osobnym zabezpieczeniem CSRF.

### CORS

`CLIENT_ORIGIN` przyjmuje **sam origin**, bez ścieżki. Dla GitHub Pages jest to
`https://uzytkownik.github.io`, a **nie** `https://uzytkownik.github.io/repo/`.
Origin spoza listy nie dostaje nagłówka `Access-Control-Allow-Origin`
i przeglądarka odrzuca odpowiedź.

### Publikacja frontendu

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) publikuje
statyki przy każdym pushu do gałęzi `deploy/github-pages`. `main` pozostaje
gałęzią kodu — wdrożeniem steruje osobna gałąź, żeby publikacja nie zależała
od każdego commita w main. Do `_site/` trafiają wyłącznie HTML, `script/`,
`style/`, `images/` i `assets/` — katalog `backend/` jest wykluczony, a osobny krok
przerywa build, jeśli w katalogu publikacji pojawi się `.env`, `*.pem`, `*.pfx` lub `*.db`.

Jednorazowo w repozytorium: **Settings → Pages → Source: GitHub Actions**.

Nawigacja w projekcie jest w całości relatywna (`login.html`, a nie `/login.html`),
więc podkatalog `/<repo>/` na Pages działa bez zmian w kodzie.

### Socket.io przy dwóch originach

Klient Socket.io jest **doładowywany dynamicznie** z originu backendu przez
[`script/realtime.js`](script/realtime.js). Wcześniej dashboardy ładowały go
z `/socket.io/socket.io.js`, czyli ścieżki względnej wobec strony — na Pages
taki adres nie istnieje.

### n8n

Backend woła n8n **po stronie serwera**, więc n8n nie musi być wystawiony
publicznie. Gdy działa na tej samej maszynie, wystarczy pętla zwrotna:

```
N8N_WEBHOOK_URL=http://127.0.0.1:5678/webhook/triage
```

Ruch nie opuszcza wtedy serwera, a edytor n8n pozostaje dostępny wyłącznie
lokalnie lub przez LAN/VPN — to najmniejsza możliwa powierzchnia ataku.

### Uruchamianie jako usługa (Windows)

[`backend/tools/start-zdrovia.ps1`](backend/tools/start-zdrovia.ps1) startuje serwer
i pisze log do `backend/logs/backend-RRRR-MM-DD.log` (starsze niż 14 dni są
kasowane przy starcie). Rejestracja w harmonogramie zadań:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Sklep\zdrovia\backend\tools\start-zdrovia.ps1"'
$trigger = New-ScheduledTaskTrigger -AtStartup
$princ   = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$set     = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName 'Zdrovia Backend' -Action $action -Trigger $trigger -Principal $princ -Settings $set
```

### Uwaga o portach na Windows (HTTP.sys)

Jeśli port jest zajęty przez IIS, Node zwróci **`EACCES`**, a nie `EADDRINUSE` —
HTTP.sys rezerwuje go na poziomie jądra, także dla bindingów z nagłówkiem hosta.
Listę rezerwacji pokazuje:

```
netsh int ipv4 show excludedportrange protocol=tcp
```

Port z tej listy jest nie do użycia przez Node — trzeba wybrać inny albo
postawić przed aplikacją odwrotne proxy (IIS z ARR + URL Rewrite).

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
