/* =============================================================
   controllers/triage.controller.js
   „Wstępna kwalifikacja objawów" — proxy do n8n + zapis rozmowy.

   BEZPIECZEŃSTWO/ETYKA:
   - Wynik zapisujemy jako `suggested_specialty` (SUGESTIA), nigdy jako
     diagnozę. To nie jest porada medyczna.
   - Przy isUrgent=true zwracamy flagę natychmiast (front pokazuje 112/SOR).
   - TODO (RODO): rozmowy sesji niezalogowanych (patient_id IS NULL)
     starsze niż 24h powinny być czyszczone/anonimizowane (cron/skrypt).
============================================================= */
"use strict";

const db = require("../db");
const { ApiError } = require("../middleware/error.middleware");
const { callTriageWebhook } = require("../services/triage.service");

/* --- Prosty rate limiter w pamięci: max 20 wiadomości / sesję / godzinę --- */
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const buckets = new Map(); // sessionId -> [timestamps]

function withinRateLimit(sessionId) {
  const now = Date.now();
  const arr = (buckets.get(sessionId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    buckets.set(sessionId, arr);
    return false;
  }
  arr.push(now);
  buckets.set(sessionId, arr);
  return true;
}
// Okresowe sprzątanie pustych koszyków, by mapa nie rosła w nieskończoność.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const kept = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (kept.length) buckets.set(k, kept);
    else buckets.delete(k);
  }
}, RATE_WINDOW_MS).unref();

/* POST /api/triage/chat */
async function chat(req, res) {
  const { sessionId, message, history } = req.body;

  if (!withinRateLimit(sessionId)) {
    throw new ApiError(429, "Zbyt wiele wiadomości w tej sesji. Spróbuj ponownie za jakiś czas.");
  }

  const patientId = req.user ? req.user.id : null; // dopuszczamy rozmowę przed rejestracją

  // Wczytaj istniejącą rozmowę (do wznowienia kontekstu).
  const conv = db.prepare("SELECT * FROM triage_conversations WHERE session_id = ?").get(sessionId);
  const prior = conv ? safeParse(conv.messages) : [];

  // Jeśli poprzednio oznaczono pilność — nie kontynuujemy wątku.
  if (conv && conv.is_urgent) {
    return res.json({
      reply: "Ta rozmowa została zakończona ze względu na możliwy stan pilny. W razie potrzeby zadzwoń na 112 lub udaj się na SOR.",
      suggestedSpecialty: conv.suggested_specialty || null,
      isUrgent: true,
      shouldEndConversation: true,
    });
  }

  // Wywołanie n8n (AI Agent).
  const ai = await callTriageWebhook({
    sessionId,
    message,
    history: history && history.length ? history : prior,
    patientId,
  });

  // Dopisz wymianę do historii.
  const nowIso = new Date().toISOString();
  const messages = prior.concat([
    { role: "user", content: message, timestamp: nowIso },
    { role: "assistant", content: ai.reply, timestamp: new Date().toISOString() },
  ]);
  const isUrgent = ai.isUrgent ? 1 : 0;

  if (conv) {
    db.prepare(
      `UPDATE triage_conversations
         SET messages = ?, suggested_specialty = ?, is_urgent = ?,
             patient_id = COALESCE(patient_id, ?), updated_at = ?
       WHERE session_id = ?`
    ).run(JSON.stringify(messages), ai.suggestedSpecialty, isUrgent, patientId, nowIso, sessionId);
  } else {
    db.prepare(
      `INSERT INTO triage_conversations
         (patient_id, session_id, messages, suggested_specialty, is_urgent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(patientId, sessionId, JSON.stringify(messages), ai.suggestedSpecialty, isUrgent, nowIso);
  }

  res.json({
    reply: ai.reply,
    suggestedSpecialty: ai.suggestedSpecialty,
    isUrgent: ai.isUrgent,
    shouldEndConversation: ai.shouldEndConversation,
  });
}

/* GET /api/triage/:sessionId — wznowienie rozmowy po odświeżeniu strony */
function getConversation(req, res) {
  const conv = db
    .prepare("SELECT session_id, messages, suggested_specialty, is_urgent, created_at FROM triage_conversations WHERE session_id = ?")
    .get(req.params.sessionId);
  if (!conv) return res.json({ conversation: null });
  res.json({
    conversation: {
      sessionId: conv.session_id,
      messages: safeParse(conv.messages),
      suggestedSpecialty: conv.suggested_specialty || null,
      isUrgent: !!conv.is_urgent,
      createdAt: conv.created_at,
    },
  });
}

function safeParse(s) {
  try { return JSON.parse(s) || []; } catch (_e) { return []; }
}

module.exports = { chat, getConversation };
