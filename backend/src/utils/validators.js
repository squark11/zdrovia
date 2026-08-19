/* =============================================================
   utils/validators.js
   Schematy walidacji danych wejściowych (zod). Używane przez
   middleware `validate` w warstwie tras.
============================================================= */
"use strict";

const { z } = require("zod");

const email = z.string().trim().email("Nieprawidłowy adres e-mail");
const password = z.string().min(8, "Hasło musi mieć co najmniej 8 znaków");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Format godziny: HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format daty: RRRR-MM-DD");

/* --- Rejestracja: wspólne pola + zależne od roli --- */
const registerSchema = z
  .object({
    email,
    password,
    role: z.enum(["patient", "doctor"]),
    firstName: z.string().trim().min(2, "Podaj imię"),
    lastName: z.string().trim().min(2, "Podaj nazwisko"),
    // Pacjent
    phone: z.string().trim().min(9, "Podaj numer telefonu").optional(),
    birthDate: date.optional(),
    // Lekarz
    specialization: z.string().trim().min(2).optional(),
    pwzNumber: z.string().trim().min(3, "Podaj numer PWZ").optional(),
    bio: z.string().trim().max(600).optional(),
    yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
    consultationPrice: z.coerce.number().int().min(0).max(100000).optional(),
    city: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    // Pola wymagane zależnie od roli.
    if (data.role === "doctor") {
      if (!data.specialization)
        ctx.addIssue({ path: ["specialization"], code: "custom", message: "Podaj specjalizację" });
      if (!data.pwzNumber)
        ctx.addIssue({ path: ["pwzNumber"], code: "custom", message: "Podaj numer PWZ" });
    } else {
      if (!data.phone)
        ctx.addIssue({ path: ["phone"], code: "custom", message: "Podaj numer telefonu" });
    }
  });

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Podaj hasło"),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Podaj obecne hasło"),
  newPassword: password,
});

const patientUpdateSchema = z.object({
  firstName: z.string().trim().min(2).optional(),
  lastName: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(9).optional(),
  birthDate: date.optional(),
});

const doctorUpdateSchema = z.object({
  bio: z.string().trim().max(600).optional(),
  consultationPrice: z.coerce.number().int().min(0).max(100000).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  city: z.string().trim().optional(),
  specialization: z.string().trim().min(2).optional(),
});

const availabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        startTime: time,
        endTime: time,
      })
    )
    .max(50),
});

const appointmentCreateSchema = z.object({
  doctorId: z.coerce.number().int().positive(),
  date,
  time,
  service: z.enum(["konsultacja", "recepta", "zwolnienie", "skierowanie"]).default("konsultacja"),
  consultationType: z.enum(["wideo", "czat", "telefon"]).default("wideo"),
  reason: z.string().trim().min(5, "Opisz krótko powód wizyty").max(1000),
  paymentMethod: z.enum(["blik", "karta", "przelew"]).optional(),
});

const appointmentUpdateSchema = z.object({
  status: z.enum(["zaplanowana", "zrealizowana", "anulowana"]),
});

const prescriptionCreateSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
  medication: z.string().trim().min(2, "Podaj nazwę leku"),
  dosage: z.string().trim().optional(),
  notes: z.string().trim().max(600).optional(),
  validUntil: date.optional(),
});

const triageChatSchema = z.object({
  sessionId: z.string().trim().min(8, "Nieprawidłowy identyfikator sesji").max(100),
  message: z.string().trim().min(1, "Wpisz wiadomość").max(1000, "Wiadomość jest za długa (maks. 1000 znaków)"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(50)
    .optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  triageChatSchema,
  patientUpdateSchema,
  doctorUpdateSchema,
  availabilitySchema,
  appointmentCreateSchema,
  appointmentUpdateSchema,
  prescriptionCreateSchema,
};
