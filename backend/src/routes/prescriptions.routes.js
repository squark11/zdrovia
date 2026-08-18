/* prescriptions.routes.js — /api/prescriptions */
"use strict";

const router = require("express").Router();
const c = require("../controllers/prescriptions.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { prescriptionCreateSchema } = require("../utils/validators");

router.get("/", requireAuth, c.list);
router.post("/", requireAuth, requireRole("doctor"), validate(prescriptionCreateSchema), c.create);

module.exports = router;
