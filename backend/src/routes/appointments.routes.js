/* appointments.routes.js — /api/appointments */
"use strict";

const router = require("express").Router();
const c = require("../controllers/appointments.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { appointmentCreateSchema, appointmentUpdateSchema } = require("../utils/validators");

router.get("/", requireAuth, c.list);
router.post("/", requireAuth, requireRole("patient"), validate(appointmentCreateSchema), c.create);
router.patch("/:id", requireAuth, validate(appointmentUpdateSchema), c.update);

module.exports = router;
