/* =============================================================
   services/triage.service.js
   Pośrednik do workflow n8n (AI Agent). Backend NIGDY nie odsłania
   n8n frontendowi — front rozmawia tylko z /api/triage/chat.
   Wywołanie webhooka z limitem czasu i nagłówkiem sekretu.
============================================================= */
"use strict";

const { ApiError } = require("../middleware/error.middleware");

const TIMEOUT_MS = 15000; // 15 s — po tym czasie zwracamy czytelny błąd

/* Wywołuje webhook n8n i normalizuje odpowiedź do oczekiwanego kształtu:
   { reply, suggestedSpecialty, isUrgent, shouldEndConversation }. */
async function callTriageWebhook(payload) {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET || "";
  if (!url) {
    throw new ApiError(503, "Asystent nie jest skonfigurowany (brak N8N_WEBHOOK_URL).");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // n8n powinien odrzucać żądania bez poprawnego sekretu.
        "X-Webhook-Secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      throw new ApiError(504, "Asystent nie odpowiada. Spróbuj ponownie za chwilę.");
    }
    throw new ApiError(502, "Nie udało się połączyć z asystentem. Spróbuj później.");
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new ApiError(502, "Asystent chwilowo niedostępny. Spróbuj później.");
  }

  let data;
  try {
    data = await res.json();
  } catch (_e) {
    throw new ApiError(502, "Otrzymano nieprawidłową odpowiedź od asystenta.");
  }

  // Normalizacja + twarde typy (n8n mógłby zwrócić coś niekompletnego).
  return {
    reply: typeof data.reply === "string" && data.reply.trim() ? data.reply : "Przepraszam, nie udało się przygotować odpowiedzi.",
    suggestedSpecialty: data.suggestedSpecialty || null,
    isUrgent: Boolean(data.isUrgent),
    shouldEndConversation: Boolean(data.shouldEndConversation),
  };
}

module.exports = { callTriageWebhook };
