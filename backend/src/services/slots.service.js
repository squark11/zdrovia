/* =============================================================
   services/slots.service.js
   Generowanie wolnych slotów wizyt na podstawie okien dostępności
   lekarza (availability) z pominięciem terminów już zajętych.
============================================================= */
"use strict";

const db = require("../db");

const STEP_MIN = 30; // długość slotu w minutach

const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const WEEKDAY_PL = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

/* Zwraca listę wolnych slotów lekarza na najbliższe `days` dni. */
function generateSlots(doctorId, days = 14, limit = 40) {
  const windows = db
    .prepare("SELECT weekday, start_time, end_time FROM availability WHERE doctor_id = ?")
    .all(doctorId);
  if (!windows.length) return [];

  const bookedRows = db
    .prepare("SELECT date, time FROM appointments WHERE doctor_id = ? AND status != 'anulowana'")
    .all(doctorId);
  const booked = new Set(bookedRows.map((r) => `${r.date} ${r.time}`));

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];

  for (let i = 0; i < days && out.length < limit; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const wd = d.getDay();
    const dateStr = ymd(d);

    for (const w of windows.filter((x) => x.weekday === wd)) {
      for (let m = toMin(w.start_time); m + STEP_MIN <= toMin(w.end_time); m += STEP_MIN) {
        const time = fromMin(m);
        if (i === 0 && m <= nowMin + 15) continue;       // pomiń przeszłe godziny dziś
        if (booked.has(`${dateStr} ${time}`)) continue;   // pomiń zajęte
        out.push({ date: dateStr, time, weekday: wd, weekdayLabel: WEEKDAY_PL[wd] });
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

/* Czy dany termin (date+time) jest poprawnym, wolnym slotem lekarza? */
function isSlotBookable(doctorId, date, time) {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const wd = d.getDay();

  const inWindow = db
    .prepare(
      `SELECT 1 FROM availability
       WHERE doctor_id = ? AND weekday = ? AND start_time <= ? AND end_time > ?`
    )
    .get(doctorId, wd, time, time);
  if (!inWindow) return false;

  // Nie w przeszłości.
  const now = new Date();
  const slotDate = new Date(`${date}T${time}:00`);
  if (slotDate.getTime() <= now.getTime()) return false;

  return true;
}

module.exports = { generateSlots, isSlotBookable };
