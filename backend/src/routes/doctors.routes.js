/* doctors.routes.js — /api/doctors */
"use strict";

const router = require("express").Router();
const c = require("../controllers/doctors.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { doctorUpdateSchema, availabilitySchema } = require("../utils/validators");

// Publiczne
router.get("/", c.list);
router.get("/:id", c.getOne);
router.get("/:id/availability", c.getAvailability);

// Chronione (tylko lekarz-właściciel)
router.patch("/:id", requireAuth, requireRole("doctor"), validate(doctorUpdateSchema), c.update);
router.patch(
  "/:id/availability",
  requireAuth,
  requireRole("doctor"),
  validate(availabilitySchema),
  c.setAvailability
);

module.exports = router;
