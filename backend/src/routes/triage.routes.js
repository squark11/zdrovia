/* triage.routes.js — /api/triage (Wstępna kwalifikacja objawów) */
"use strict";

const router = require("express").Router();
const c = require("../controllers/triage.controller");
const { validate } = require("../middleware/validate.middleware");
const { optionalAuth } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../middleware/error.middleware");
const { triageChatSchema } = require("../utils/validators");

// Rozmowa możliwa też przed rejestracją → optionalAuth (patient_id gdy zalogowany).
router.post("/chat", optionalAuth, validate(triageChatSchema), asyncHandler(c.chat));
router.get("/:sessionId", c.getConversation);

module.exports = router;
