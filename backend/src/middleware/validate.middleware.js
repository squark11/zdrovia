/* =============================================================
   middleware/validate.middleware.js
   Waliduje req.body wg schematu zod. Po sukcesie podmienia
   req.body na dane po parsowaniu (z domyślnymi/skonwertowanymi).
============================================================= */
"use strict";

const { ApiError } = require("./error.middleware");

function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Zbierz błędy pól w czytelną mapę { pole: komunikat }.
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        if (!details[key]) details[key] = issue.message;
      }
      return next(new ApiError(422, "Nieprawidłowe dane wejściowe", details));
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
