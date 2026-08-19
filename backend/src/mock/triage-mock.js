/* =============================================================
   mock/triage-mock.js
   Lokalna atrapa workflow n8n (do testów bez prawdziwego n8n).
   Naśladuje AI Agent regułami: wykrywa „red flags" → isUrgent,
   w innym wypadku po kilku pytaniach sugeruje specjalizację.
   W produkcji zastępuje ją prawdziwy n8n (N8N_WEBHOOK_URL).
============================================================= */
"use strict";

const SPEC_LABELS = {
  internista: "Internista", pediatra: "Pediatra", dermatolog: "Dermatolog",
  psychiatra: "Psychiatra", ginekolog: "Ginekolog", kardiolog: "Kardiolog",
  laryngolog: "Laryngolog", endokrynolog: "Endokrynolog",
};

// Objawy alarmowe (red flags) → pilny kontakt.
const RED_FLAGS = [
  "ból w klatce", "klatce piersiowej", "ucisk w klatce", "duszno", "nie mogę oddychać",
  "brak tchu", "krwotok", "silne krwawienie", "utrata przytomności", "zemdl",
  "straciłem przytomność", "straciłam przytomność", "samobój", "nie chcę żyć",
  "nie chce mi się żyć", "odebrać sobie życie", "udar", "niedowład", "paraliż", "drgawki",
];

const SPEC_KEYWORDS = [
  [["skór", "wysyp", "trądzik", "pieprzyk", "znamię", "świąd", "łuszczyc", "egzem"], "dermatolog"],
  [["dziecko", "dziecka", "niemowl", "synek", "córka"], "pediatra"],
  [["lęk", "depres", "bezsenn", "nie mogę spać", "stres", "panik", "nastrój", "smutek"], "psychiatra"],
  [["serce", "kołata", "arytmi", "ciśnien", "nadciśn"], "kardiolog"],
  [["gardło", "migdał", " ucho", "zatok", "katar", "chrypk", "przełykani"], "laryngolog"],
  [["tarczyc", "hormon", "insulinoop", "niedoczynn", "nadczynn"], "endokrynolog"],
  [["miesiączk", "antykoncep", "cykl", "ginek", "ciąż"], "ginekolog"],
];

function mockTriage(req, res) {
  // Weryfikacja sekretu (jak zrobiłby to węzeł w n8n).
  const expected = process.env.N8N_WEBHOOK_SECRET || "";
  if (expected && req.get("X-Webhook-Secret") !== expected) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }

  const body = req.body || {};
  const message = String(body.message || "");
  const history = Array.isArray(body.history) ? body.history : [];
  const lower = message.toLowerCase();

  // 1) Red flags → pilne.
  if (RED_FLAGS.some((k) => lower.includes(k))) {
    return res.json({
      reply:
        "Opisane objawy mogą świadczyć o stanie nagłym. Nie zwlekaj — zadzwoń na 112 lub udaj się na najbliższy SOR. To nie jest diagnoza; teraz liczy się szybka pomoc.",
      suggestedSpecialty: null,
      isUrgent: true,
      shouldEndConversation: true,
    });
  }

  // 2) Dopasowanie specjalizacji z całej rozmowy.
  const allText = (history.map((m) => m.content || "").join(" ") + " " + message).toLowerCase();
  let spec = "internista";
  for (const [keys, s] of SPEC_KEYWORDS) {
    if (keys.some((k) => allText.includes(k))) { spec = s; break; }
  }

  const userTurns = history.filter((m) => m.role === "user").length + 1;

  // 3) Pierwsza tura → dopytanie; kolejna → sugestia specjalizacji.
  if (userTurns < 2) {
    return res.json({
      reply:
        "Dziękuję. Od jak dawna występują te objawy i czy towarzyszą im inne dolegliwości (np. gorączka, ból, osłabienie)?",
      suggestedSpecialty: null,
      isUrgent: false,
      shouldEndConversation: false,
    });
  }
  return res.json({
    reply:
      `Dziękuję za informacje. Na podstawie opisu warto skonsultować się ze specjalistą: ${SPEC_LABELS[spec] || spec}. ` +
      "To wstępna sugestia, a nie diagnoza — lekarz oceni Twój stan podczas wizyty.",
    suggestedSpecialty: spec,
    isUrgent: false,
    shouldEndConversation: true,
  });
}

module.exports = { mockTriage };
