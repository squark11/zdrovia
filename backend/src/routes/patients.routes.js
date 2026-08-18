/* patients.routes.js — /api/patients */
"use strict";

const router = require("express").Router();
const c = require("../controllers/patients.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { patientUpdateSchema } = require("../utils/validators");

router.get("/me", requireAuth, requireRole("patient"), c.getMe);
router.patch("/me", requireAuth, requireRole("patient"), validate(patientUpdateSchema), c.updateMe);

module.exports = router;
