/* =============================================================
   utils/services.js
   Katalog płatnych usług telemedycznych (jak na platformach typu
   „Zaufany Lekarz"). Cena „konsultacja" = cena danego lekarza,
   pozostałe usługi mają cenę stałą.
============================================================= */
"use strict";

const SERVICES = {
  konsultacja: { label: "E-konsultacja", kind: "doctor" },
  recepta:     { label: "E-recepta",           price: 59 },
  zwolnienie:  { label: "E-zwolnienie (L4)",    price: 79 },
  skierowanie: { label: "E-skierowanie",        price: 69 },
};

const SERVICE_KEYS = Object.keys(SERVICES);

/* Cena usługi: dla konsultacji bierzemy cenę lekarza. */
function priceFor(service, doctorPrice) {
  const s = SERVICES[service];
  if (!s) return null;
  return s.kind === "doctor" ? doctorPrice : s.price;
}

module.exports = { SERVICES, SERVICE_KEYS, priceFor };
