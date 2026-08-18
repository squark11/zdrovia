/* =============================================================
   data.js
   Mockowane dane aplikacji (bez backendu). W realnym produkcie
   pochodziłyby z API. Wystawiamy je w globalnym obiekcie
   `window.Zdrovia` — prosty „namespace", by uniknąć kolizji nazw.
============================================================= */
(function () {
  "use strict";

  /* Zestaw ikon SVG (jako ciągi znaków) używanych w kartach specjalizacji.
     Trzymanie ich w jednym miejscu ułatwia utrzymanie spójności. */
  const icons = {
    internista:  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v7a5 5 0 0 0 10 0V3"/><path d="M9 21a4 4 0 0 0 4-4v-3"/><circle cx="19" cy="12" r="2.4"/></svg>',
    pediatra:    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21a6 6 0 0 1 12 0"/><path d="M9 8h.01M15 8h.01"/></svg>',
    dermatolog:  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 9h.01M15 8h.01M9 15h.01M16 14h.01M13 12h.01"/></svg>',
    psychiatra:  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3a5 5 0 0 0-3 9c0 2 .5 3 .5 4H14s.5-2 .5-4a5 5 0 0 0-2-9Z"/><path d="M9 20h4v1a2 2 0 0 1-4 0Z"/><path d="M17 8h4M19 6v4"/></svg>',
    ginekolog:   '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg>',
    kardiolog:   '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 6.6a5 5 0 0 0-8.8-2A5 5 0 0 0 3.2 6.6C1.9 9.7 4 13 12 19c8-6 10.1-9.3 8.8-12.4Z"/><path d="M4 12h4l1.5-3 2.5 6 1.5-3H20" stroke-width="1.4"/></svg>',
    laryngolog:  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 4-3 5-3 8a3 3 0 0 1-6 0"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    endokrynolog:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3c-1 3-3 4-3 7 0 4 3 5 3 8"/><path d="M16 3c1 3 3 4 3 7 0 4-3 5-3 8"/><path d="M8 8h8M7 14h10"/></svg>',
  };

  /* -----------------------------------------------------------
     Specjalizacje — key musi pasować do pola `spec` lekarzy,
     aby filtrowanie działało poprawnie.
  ----------------------------------------------------------- */
  const specialties = [
    { key: "internista",   name: "Internista",   icon: icons.internista },
    { key: "pediatra",     name: "Pediatra",     icon: icons.pediatra },
    { key: "dermatolog",   name: "Dermatolog",   icon: icons.dermatolog },
    { key: "psychiatra",   name: "Psychiatra",   icon: icons.psychiatra },
    { key: "ginekolog",    name: "Ginekolog",    icon: icons.ginekolog },
    { key: "kardiolog",    name: "Kardiolog",    icon: icons.kardiolog },
    { key: "laryngolog",   name: "Laryngolog",   icon: icons.laryngolog },
    { key: "endokrynolog", name: "Endokrynolog", icon: icons.endokrynolog },
  ];

  /* -----------------------------------------------------------
     Lekarze — dane przykładowe. Kolory awatarów dobrane z palety
     marki, aby lista wyglądała spójnie.
  ----------------------------------------------------------- */
  const doctors = [
    { name: "dr Anna Kowalska",     spec: "internista",   rating: 4.9, reviews: 312, availability: "dziś 14:30",  soon: true,  price: 99,  color: "#0E9F8E", experience: 12, city: "Warszawa",  languages: ["polski", "angielski"],
      bio: "Specjalistka chorób wewnętrznych. Pomaga przy infekcjach, nadciśnieniu i chorobach przewlekłych, prowadzi też kontynuację leczenia i przedłużanie recept na leki stałe." },
    { name: "dr Piotr Nowak",       spec: "internista",   rating: 4.8, reviews: 208, availability: "dziś 16:00",  soon: true,  price: 99,  color: "#0B7A6D", experience: 9,  city: "Kraków",    languages: ["polski"],
      bio: "Internista z doświadczeniem w medycynie rodzinnej. Skupia się na profilaktyce, diagnostyce infekcji oraz wsparciu pacjentów z chorobami tarczycy i cukrzycą." },
    { name: "dr Maria Wiśniewska",  spec: "pediatra",     rating: 5.0, reviews: 421, availability: "dziś 15:15",  soon: true,  price: 109, color: "#F0913E", experience: 15, city: "Poznań",    languages: ["polski", "angielski"],
      bio: "Pediatra z 15-letnim stażem. Spokojnie i z empatią prowadzi konsultacje dotyczące infekcji, gorączki, żywienia i bilansu zdrowia dziecka." },
    { name: "dr Tomasz Lewandowski", spec: "pediatra",    rating: 4.7, reviews: 156, availability: "jutro 09:00", soon: false, price: 109, color: "#2E9E7B", experience: 7,  city: "Gdańsk",    languages: ["polski", "niemiecki"],
      bio: "Pediatra i neonatolog. Doradza rodzicom w codziennych dolegliwościach niemowląt i dzieci, ze szczególnym uwzględnieniem alergii i szczepień." },
    { name: "dr Katarzyna Zając",   spec: "dermatolog",   rating: 4.9, reviews: 289, availability: "dziś 17:45",  soon: true,  price: 149, color: "#E8734A", experience: 11, city: "Wrocław",   languages: ["polski", "angielski"],
      bio: "Dermatolog. Diagnozuje zmiany skórne na podstawie zdjęć, leczy trądzik, egzemę i łuszczycę oraz doradza w pielęgnacji skóry problematycznej." },
    { name: "dr Michał Wójcik",     spec: "dermatolog",   rating: 4.6, reviews: 98,  availability: "jutro 11:30", soon: false, price: 149, color: "#5AA9C4", experience: 6,  city: "Łódź",      languages: ["polski"],
      bio: "Dermatolog i wenerolog. Zajmuje się chorobami skóry, włosów i paznokci, a także teledermatoskopią zmian barwnikowych." },
    { name: "dr Agnieszka Duda",    spec: "psychiatra",   rating: 5.0, reviews: 367, availability: "dziś 18:20",  soon: true,  price: 169, color: "#7C6BD6", experience: 14, city: "Warszawa",  languages: ["polski", "angielski"],
      bio: "Psychiatra. Wspiera w leczeniu zaburzeń lękowych, depresji i problemów ze snem. Prowadzi konsultacje w atmosferze zrozumienia i bez oceniania." },
    { name: "dr Rafał Mazur",       spec: "psychiatra",   rating: 4.8, reviews: 142, availability: "jutro 10:00", soon: false, price: 169, color: "#0E9F8E", experience: 10, city: "Katowice",  languages: ["polski"],
      bio: "Psychiatra z doświadczeniem w terapii zaburzeń nastroju i wypalenia zawodowego. Łączy farmakoterapię z praktycznymi zaleceniami dla pacjenta." },
    { name: "dr Ewa Krawczyk",      spec: "ginekolog",    rating: 4.9, reviews: 254, availability: "dziś 13:00",  soon: true,  price: 149, color: "#D4649A", experience: 13, city: "Szczecin",  languages: ["polski", "angielski"],
      bio: "Ginekolog. Konsultuje kwestie antykoncepcji, cyklu i profilaktyki, wystawia recepty oraz kieruje na badania, dbając o komfort pacjentki." },
    { name: "dr Barbara Szymańska", spec: "kardiolog",    rating: 4.9, reviews: 331, availability: "jutro 08:30", soon: false, price: 179, color: "#C4553F", experience: 18, city: "Lublin",    languages: ["polski", "francuski"],
      bio: "Kardiolog z 18-letnim stażem. Pomaga w nadciśnieniu, kołataniu serca i interpretacji wyników badań, ustala plan leczenia i dalszej diagnostyki." },
    { name: "dr Jan Kaczmarek",     spec: "laryngolog",   rating: 4.7, reviews: 187, availability: "dziś 19:00",  soon: true,  price: 139, color: "#3E8FA8", experience: 8,  city: "Bydgoszcz", languages: ["polski"],
      bio: "Laryngolog. Diagnozuje i leczy infekcje gardła, zatok i uszu, doradza przy przewlekłym katarze oraz problemach ze słuchem." },
    { name: "dr Zofia Grabowska",   spec: "endokrynolog", rating: 4.8, reviews: 176, availability: "jutro 12:15", soon: false, price: 159, color: "#0B7A6D", experience: 16, city: "Białystok", languages: ["polski", "angielski"],
      bio: "Endokrynolog. Specjalizuje się w chorobach tarczycy, zaburzeniach hormonalnych i insulinooporności. Prowadzi pacjentów kompleksowo i długofalowo." },
  ];

  /* -----------------------------------------------------------
     Opinie pacjentów.
  ----------------------------------------------------------- */
  const reviews = [
    { quote: "E-receptę dostałam w niecałe 10 minut, bez wychodzenia z domu. Lekarz był bardzo rzeczowy i miły. Polecam każdemu!", name: "Magdalena T.", role: "Warszawa", rating: 5, color: "#0E9F8E" },
    { quote: "Syn dostał gorączki w nocy — pediatra oddzwonił w kwadrans i uspokoił nas, dając jasne zalecenia. Ogromna wygoda.", name: "Krzysztof P.", role: "Kraków", rating: 5, color: "#F0913E" },
    { quote: "Wreszcie nie musiałem brać wolnego, żeby przedłużyć receptę na stałe leki. Wszystko online i bardzo intuicyjnie.", name: "Andrzej W.", role: "Gdańsk", rating: 5, color: "#7C6BD6" },
    { quote: "Konsultacja u dermatologa na podstawie zdjęć — konkretna diagnoza i recepta tego samego dnia. Duży plus za punktualność.", name: "Natalia K.", role: "Wrocław", rating: 5, color: "#E8734A" },
    { quote: "Bałam się teleporady, ale okazało się to prostsze niż myślałam. Lekarz poświęcił mi mnóstwo czasu i wszystko wyjaśnił.", name: "Joanna M.", role: "Poznań", rating: 5, color: "#D4649A" },
    { quote: "Świetny kontakt, jasny cennik i błyskawiczne e-zwolnienie. Aplikacja działa płynnie także na telefonie.", name: "Marek Z.", role: "Łódź", rating: 5, color: "#0B7A6D" },
  ];

  /* -----------------------------------------------------------
     FAQ.
  ----------------------------------------------------------- */
  const faq = [
    { q: "Czy e-recepta ze Zdrovia jest pełnoprawna?", a: "Tak. E-recepty wystawiają lekarze z aktualnym prawem wykonywania zawodu, a dokument trafia do systemu e-zdrowie (P1) — dokładnie tak samo jak recepta z gabinetu. Kod zrealizujesz w dowolnej aptece w Polsce." },
    { q: "Ile czeka się na konsultację?", a: "Większość konsultacji odbywa się tego samego dnia, a na przedłużenie recepty na leki stałe czeka się średnio około 15 minut. Dokładny, najbliższy wolny termin widać przy każdym lekarzu." },
    { q: "Jak wygląda płatność?", a: "Płacisz z góry, wygodnie przez BLIK, kartą lub szybkim przelewem. Cenę znasz przed rozpoczęciem wizyty — nie ma żadnych ukrytych opłat ani abonamentów." },
    { q: "Co, jeśli lekarz nie wystawi recepty?", a: "Jeśli po konsultacji lekarz uzna, że recepta nie jest wskazana ze względów medycznych, zwracamy 100% kosztów wizyty. Twoje bezpieczeństwo jest zawsze najważniejsze." },
    { q: "Czy mogę dostać e-zwolnienie (L4)?", a: "Tak, jeśli po konsultacji lekarz stwierdzi wskazania medyczne. E-zwolnienie trafia automatycznie do ZUS oraz Twojego pracodawcy — nie musisz nic dostarczać." },
    { q: "Czy moje dane są bezpieczne?", a: "Wszystkie dane medyczne są szyfrowane i przetwarzane zgodnie z RODO oraz wymogami dla dokumentacji medycznej. Dostęp do nich ma wyłącznie Ty i lekarz prowadzący konsultację." },
  ];


  /* -----------------------------------------------------------
     Opinie o konkretnym lekarzu — generowane deterministycznie
     z puli, aby modal profilu prezentował spójne, powtarzalne dane
     (w realnym produkcie pochodziłyby z API dla danego lekarza).
  ----------------------------------------------------------- */
  const reviewSnippets = [
    "Bardzo rzeczowa i konkretna konsultacja. Wszystko jasno wytłumaczone, bez pośpiechu.",
    "Ogromna empatia i cierpliwość. Poczułam się naprawdę zaopiekowana.",
    "E-receptę dostałem w kilkanaście minut. Profesjonalnie i sprawnie.",
    "Świetny kontakt, dokładny wywiad i trafna diagnoza. Polecam z całego serca.",
    "Miła rozmowa, konkretne zalecenia na piśmie. Czuć duże doświadczenie.",
    "Punktualnie, uprzejmie i bardzo pomocnie. Rozwiał wszystkie moje wątpliwości.",
    "Wreszcie lekarz, który słucha. Poświęcił mi mnóstwo czasu.",
    "Konsultacja online okazała się prostsza niż myślałam. Wszystko super.",
    "Fachowo i spokojnie — dostałam jasny plan leczenia i odpowiedzi na pytania.",
  ];
  const reviewAuthors = [
    { name: "Magdalena T.", city: "Warszawa" }, { name: "Krzysztof P.", city: "Kraków" },
    { name: "Andrzej W.", city: "Gdańsk" },     { name: "Natalia K.", city: "Wrocław" },
    { name: "Joanna M.", city: "Poznań" },      { name: "Marek Z.", city: "Łódź" },
    { name: "Ewa S.", city: "Szczecin" },       { name: "Paweł R.", city: "Lublin" },
    { name: "Aleksandra B.", city: "Katowice" },{ name: "Tomasz L.", city: "Białystok" },
  ];
  const reviewDates = ["2 dni temu", "5 dni temu", "tydzień temu", "2 tygodnie temu", "3 tygodnie temu", "miesiąc temu"];

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* Zwraca 3 opinie dla danego lekarza (stałe dla tego samego lekarza). */
  function getDoctorReviews(doctor) {
    const seed = hashStr(doctor.name);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const snip = reviewSnippets[(seed + i * 3) % reviewSnippets.length];
      const auth = reviewAuthors[(seed + i * 7) % reviewAuthors.length];
      const rating = i === 2 && doctor.rating < 4.85 ? 4 : 5;
      out.push({ text: snip, name: auth.name, city: auth.city, rating: rating, date: reviewDates[(seed + i) % reviewDates.length] });
    }
    return out;
  }

  /* Eksport do przestrzeni nazw aplikacji */
  window.Zdrovia = window.Zdrovia || {};
  window.Zdrovia.data = { specialties, doctors, reviews, faq };
  window.Zdrovia.getDoctorReviews = getDoctorReviews;
})();
