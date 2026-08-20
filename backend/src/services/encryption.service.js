/* =============================================================
   services/encryption.service.js
   Symetryczne szyfrowanie sekretów konfiguracyjnych (AES-256-GCM).
   Klucz WYŁĄCZNIE ze zmiennej środowiskowej ENCRYPTION_KEY
   (64 znaki hex = 32 bajty). Nigdy w bazie ani w kodzie.
   Format zapisu: "iv:authTag:ciphertext" (wszystko hex), losowe IV.
============================================================= */
"use strict";

const crypto = require("crypto");

// Klucz czytany LENIWIE ze zmiennej środowiskowej (nie przy imporcie modułu),
// aby kolejność `require` względem dotenv.config() nie miała znaczenia
// (np. w skryptach CLI). Nadal wyłącznie z env — nigdy z bazy ani z kodu.
let _key; // undefined = jeszcze nie sprawdzono; null = brak/niepoprawny
function getKey() {
  if (_key === undefined) {
    const hex = process.env.ENCRYPTION_KEY || "";
    _key = /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
  }
  return _key;
}

/** Czy klucz szyfrujący jest poprawnie skonfigurowany. */
function isConfigured() {
  return getKey() !== null;
}

function encrypt(text) {
  const KEY = getKey();
  if (!KEY) throw new Error("ENCRYPTION_KEY nie jest ustawiony — szyfrowanie niedostępne.");
  const iv = crypto.randomBytes(12); // 96-bit IV zalecane dla GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(payload) {
  const KEY = getKey();
  if (!KEY) throw new Error("ENCRYPTION_KEY nie jest ustawiony — deszyfrowanie niedostępne.");
  const parts = String(payload).split(":");
  if (parts.length !== 3) throw new Error("Nieprawidłowy format zaszyfrowanej wartości.");
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

module.exports = { isConfigured, encrypt, decrypt };
