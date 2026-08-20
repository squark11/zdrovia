/* =============================================================
   utils/mappers.js
   Zamiana wierszy bazy na kształt odpowiedzi API (camelCase,
   parsowanie pól JSON, ukrywanie danych wrażliwych).
============================================================= */
"use strict";

function parseLanguages(raw) {
  if (!raw) return ["polski"];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : ["polski"];
  } catch (_e) {
    return ["polski"];
  }
}

/* Publiczny profil lekarza (dla listy i szczegółów). */
function publicDoctor(row) {
  return {
    id: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `dr ${row.first_name} ${row.last_name}`,
    specialization: row.specialization,
    bio: row.bio,
    yearsExperience: row.years_experience,
    consultationPrice: row.consultation_price,
    rating: row.avg_rating,
    reviewsCount: row.reviews_count,
    city: row.city,
    languages: parseLanguages(row.languages),
    color: row.color,
    verificationStatus: row.verification_status,
  };
}

/* Zalogowany użytkownik + jego profil (dla /auth/me, /patients/me). */
function meUser(user, profile) {
  const base = { id: user.id, email: user.email, role: user.role, createdAt: user.created_at };
  if (user.role === "doctor" && profile) {
    base.profile = publicDoctor({ ...profile, user_id: user.id });
    base.profile.pwzNumber = profile.pwz_number;
  } else if (profile) {
    base.profile = {
      firstName: profile.first_name,
      lastName: profile.last_name,
      phone: profile.phone,
      birthDate: profile.birth_date,
    };
  }
  return base;
}

module.exports = { publicDoctor, meUser, parseLanguages };
