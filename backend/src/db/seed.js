/* =============================================================
   db/seed.js
   Wypełnia bazę przykładowymi danymi: 12 lekarzy (spójnych z
   frontendem) z profilami i dostępnością oraz konto demo pacjenta.
   Uruchomienie: npm run seed
============================================================= */
"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./index");

const DEMO_PASSWORD = "Haslo123!";
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

/* Transliteracja polskich znaków → adres e-mail. */
function slug(s) {
  const map = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c] || c)
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

const PALETTE = ["#0E9F8E", "#0B7A6D", "#F0913E", "#2E9E7B", "#E8734A", "#5AA9C4",
                 "#7C6BD6", "#D4649A", "#C4553F", "#3E8FA8"];

// Wzorce dostępności (weekday: 0=nd..6=sb) — różne, by pokryć najbliższe dni.
const AVAIL_PATTERNS = [
  [ [1, "09:00", "15:00"], [3, "09:00", "15:00"], [5, "09:00", "13:00"] ],
  [ [2, "10:00", "18:00"], [4, "10:00", "18:00"], [6, "09:00", "12:00"] ],
  [ [1, "08:00", "12:00"], [2, "08:00", "12:00"], [4, "14:00", "19:00"] ],
  [ [3, "12:00", "20:00"], [5, "09:00", "15:00"], [0, "10:00", "14:00"] ],
];

const doctors = [
  { first: "Anna", last: "Kowalska", spec: "internista", years: 12, city: "Warszawa", price: 99, rating: 4.9, reviews: 312, langs: ["polski", "angielski"],
    bio: "Specjalistka chorób wewnętrznych. Pomaga przy infekcjach, nadciśnieniu i chorobach przewlekłych, prowadzi też kontynuację leczenia i przedłużanie recept." },
  { first: "Piotr", last: "Nowak", spec: "internista", years: 9, city: "Kraków", price: 99, rating: 4.8, reviews: 208, langs: ["polski"],
    bio: "Internista z doświadczeniem w medycynie rodzinnej. Skupia się na profilaktyce, diagnostyce infekcji oraz wsparciu pacjentów z chorobami tarczycy." },
  { first: "Maria", last: "Wiśniewska", spec: "pediatra", years: 15, city: "Poznań", price: 109, rating: 5.0, reviews: 421, langs: ["polski", "angielski"],
    bio: "Pediatra z 15-letnim stażem. Spokojnie i z empatią prowadzi konsultacje dotyczące infekcji, gorączki, żywienia i bilansu zdrowia dziecka." },
  { first: "Tomasz", last: "Lewandowski", spec: "pediatra", years: 7, city: "Gdańsk", price: 109, rating: 4.7, reviews: 156, langs: ["polski", "niemiecki"],
    bio: "Pediatra i neonatolog. Doradza rodzicom w codziennych dolegliwościach dzieci, ze szczególnym uwzględnieniem alergii i szczepień." },
  { first: "Katarzyna", last: "Zając", spec: "dermatolog", years: 11, city: "Wrocław", price: 149, rating: 4.9, reviews: 289, langs: ["polski", "angielski"],
    bio: "Dermatolog. Diagnozuje zmiany skórne na podstawie zdjęć, leczy trądzik, egzemę i łuszczycę oraz doradza w pielęgnacji skóry." },
  { first: "Michał", last: "Wójcik", spec: "dermatolog", years: 6, city: "Łódź", price: 149, rating: 4.6, reviews: 98, langs: ["polski"],
    bio: "Dermatolog i wenerolog. Zajmuje się chorobami skóry, włosów i paznokci oraz teledermatoskopią zmian barwnikowych." },
  { first: "Agnieszka", last: "Duda", spec: "psychiatra", years: 14, city: "Warszawa", price: 169, rating: 5.0, reviews: 367, langs: ["polski", "angielski"],
    bio: "Psychiatra. Wspiera w leczeniu zaburzeń lękowych, depresji i problemów ze snem, w atmosferze zrozumienia i bez oceniania." },
  { first: "Rafał", last: "Mazur", spec: "psychiatra", years: 10, city: "Katowice", price: 169, rating: 4.8, reviews: 142, langs: ["polski"],
    bio: "Psychiatra z doświadczeniem w terapii zaburzeń nastroju i wypalenia zawodowego. Łączy farmakoterapię z praktycznymi zaleceniami." },
  { first: "Ewa", last: "Krawczyk", spec: "ginekolog", years: 13, city: "Szczecin", price: 149, rating: 4.9, reviews: 254, langs: ["polski", "angielski"],
    bio: "Ginekolog. Konsultuje kwestie antykoncepcji, cyklu i profilaktyki, wystawia recepty oraz kieruje na badania." },
  { first: "Barbara", last: "Szymańska", spec: "kardiolog", years: 18, city: "Lublin", price: 179, rating: 4.9, reviews: 331, langs: ["polski", "francuski"],
    bio: "Kardiolog z 18-letnim stażem. Pomaga w nadciśnieniu, kołataniu serca i interpretacji wyników badań." },
  { first: "Jan", last: "Kaczmarek", spec: "laryngolog", years: 8, city: "Bydgoszcz", price: 139, rating: 4.7, reviews: 187, langs: ["polski"],
    bio: "Laryngolog. Diagnozuje i leczy infekcje gardła, zatok i uszu, doradza przy przewlekłym katarze i problemach ze słuchem." },
  { first: "Zofia", last: "Grabowska", spec: "endokrynolog", years: 16, city: "Białystok", price: 159, rating: 4.8, reviews: 176, langs: ["polski", "angielski"],
    bio: "Endokrynolog. Specjalizuje się w chorobach tarczycy, zaburzeniach hormonalnych i insulinooporności." },
];

const reset = db.transaction(() => {
  // Wyczyść dane (kolejność wg zależności kluczy obcych).
  db.exec(`
    DELETE FROM prescriptions;
    DELETE FROM appointments;
    DELETE FROM availability;
    DELETE FROM doctor_profiles;
    DELETE FROM patient_profiles;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN
      ('users','appointments','prescriptions','availability');
  `);

  const insertUser = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'doctor')");
  const insertDoc = db.prepare(
    `INSERT INTO doctor_profiles
       (user_id, first_name, last_name, specialization, pwz_number, bio,
        years_experience, consultation_price, avg_rating, reviews_count, city, languages, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAvail = db.prepare(
    "INSERT INTO availability (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)"
  );

  doctors.forEach((d, i) => {
    const email = `${slug(d.first)}.${slug(d.last)}@zdrovia.pl`;
    const info = insertUser.run(email, passwordHash);
    const id = info.lastInsertRowid;
    const pwz = String(1000000 + i * 7919).slice(0, 7); // fikcyjny numer PWZ (7 cyfr)

    insertDoc.run(
      id, d.first, d.last, d.spec, pwz, d.bio, d.years, d.price,
      d.rating, d.reviews, d.city, JSON.stringify(d.langs), PALETTE[i % PALETTE.length]
    );

    for (const [wd, from, to] of AVAIL_PATTERNS[i % AVAIL_PATTERNS.length]) {
      insertAvail.run(id, wd, from, to);
    }
  });

  // Konto demo pacjenta.
  const patientEmail = "pacjent@zdrovia.pl";
  const pInfo = db
    .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'patient')")
    .run(patientEmail, passwordHash);
  const patientId = pInfo.lastInsertRowid;
  db.prepare(
    "INSERT INTO patient_profiles (user_id, first_name, last_name, phone, birth_date) VALUES (?, ?, ?, ?, ?)"
  ).run(patientId, "Jan", "Kowalski", "+48 600 100 200", "1990-05-12");

  // Przykładowe wizyty i recepta demo — by dashboardy miały treść od startu.
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const annaId = 1;  // dr Anna Kowalska (pierwszy wstawiony lekarz)
  const mariaId = 3; // dr Maria Wiśniewska

  const apptIns = db.prepare(
    `INSERT INTO appointments
       (patient_id, doctor_id, date, time, status, consultation_type, service, reason, price, paid, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  const pastAppt = apptIns.run(
    patientId, annaId, day(-6), "10:00", "zrealizowana", "czat", "recepta",
    "Przedłużenie recepty na leki przyjmowane na stałe (nadciśnienie).", 59, "blik"
  );
  apptIns.run(
    patientId, mariaId, day(3), "11:00", "zaplanowana", "wideo", "konsultacja",
    "Utrzymujący się kaszel i stan podgorączkowy u dziecka od 3 dni.", 109, "karta"
  );

  db.prepare(
    `INSERT INTO prescriptions
       (appointment_id, patient_id, doctor_id, medication, dosage, notes, valid_until, code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pastAppt.lastInsertRowid, patientId, annaId,
    "Ibuprom 200 mg", "1 tabletka co 8 godzin w razie bólu",
    "Maksymalnie 3 dni. W razie utrzymywania się objawów — kontrola.",
    day(24), "1042-7788-3159"
  );

  // --- Dodatkowi pacjenci + bogaty grafik dla dr Anny Kowalskiej (do demo panelu lekarza) ---
  const extraPatients = [
    { first: "Katarzyna", last: "Nowak",    phone: "600 200 201", birth: "1988-03-14" },
    { first: "Marek",     last: "Zieliński", phone: "600 200 202", birth: "1979-11-02" },
    { first: "Alicja",    last: "Wójcik",    phone: "600 200 203", birth: "1995-07-21" },
  ];
  const extraIds = extraPatients.map((p) => {
    const u = db
      .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'patient')")
      .run(`${slug(p.first)}.${slug(p.last)}@example.com`, passwordHash);
    db.prepare(
      "INSERT INTO patient_profiles (user_id, first_name, last_name, phone, birth_date) VALUES (?, ?, ?, ?, ?)"
    ).run(u.lastInsertRowid, p.first, p.last, p.phone, p.birth);
    return u.lastInsertRowid;
  });
  const pool = [patientId, ...extraIds];

  const rxIns = db.prepare(
    `INSERT INTO prescriptions
       (appointment_id, patient_id, doctor_id, medication, dosage, notes, valid_until, code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const meds = ["Amoksycylina 500 mg", "Ibuprom 200 mg", "Euthyrox 50 µg", "Amlodypina 5 mg"];

  // [offset dni, godzina, status, forma, usługa, cena, indeks pacjenta]
  const annaSchedule = [
    [-22, "09:00", "zrealizowana", "wideo",   "konsultacja", 99,  0],
    [-20, "11:30", "zrealizowana", "czat",    "recepta",     59,  1],
    [-15, "14:00", "zrealizowana", "wideo",   "konsultacja", 99,  2],
    [-12, "10:30", "anulowana",    "wideo",   "konsultacja", 99,  1],
    [-8,  "16:00", "zrealizowana", "telefon", "zwolnienie",  79,  3],
    [-3,  "12:00", "zrealizowana", "wideo",   "konsultacja", 99,  2],
    [-1,  "09:30", "zrealizowana", "czat",    "recepta",     59,  0],
    [1,   "10:00", "zaplanowana",  "wideo",   "konsultacja", 99,  0],
    [2,   "13:30", "zaplanowana",  "wideo",   "recepta",     59,  1],
    [4,   "15:00", "zaplanowana",  "czat",    "konsultacja", 99,  3],
  ];
  annaSchedule.forEach((row, i) => {
    const [off, time, status, ctype, service, price, pi] = row;
    const pid = pool[pi % pool.length];
    const info = apptIns.run(
      pid, annaId, day(off), time, status, ctype, service,
      "Konsultacja — dolegliwości opisane w wywiadzie.", price, "blik"
    );
    if (status === "zrealizowana" && (service === "recepta" || i % 3 === 0)) {
      rxIns.run(
        info.lastInsertRowid, pid, annaId,
        meds[i % meds.length], i % 2 ? "1 tabletka 2× dziennie" : "1 tabletka co 8 godzin",
        "Przyjmować po posiłku.", day(20 + i),
        `${1000 + i}-${2000 + i}-${3000 + i}`
      );
    }
  });

  return { doctors: doctors.length, patientEmail };
});

const result = reset();

console.log("\n  ✓ Baza wypełniona danymi demo:");
console.log(`    • ${result.doctors} lekarzy (hasło dla wszystkich: ${DEMO_PASSWORD})`);
console.log(`      przykład logowania lekarza: anna.kowalska@zdrovia.pl`);
console.log(`    • 1 pacjent demo: ${result.patientEmail} / ${DEMO_PASSWORD}\n`);
