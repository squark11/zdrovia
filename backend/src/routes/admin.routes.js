/* admin.routes.js — /api/admin (wszystko chronione requireRole('admin')) */
"use strict";

const router = require("express").Router();
const c = require("../controllers/admin.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../middleware/error.middleware");
const { adminVerifySchema, adminUserStatusSchema, settingsUpdateSchema } = require("../utils/validators");
const settingsCtrl = require("../controllers/settings.controller");

// Każde żądanie musi być od zalogowanego administratora.
router.use(requireAuth, requireRole("admin"));

// Ustawienia platformy
router.get("/settings", settingsCtrl.getSettings);
router.put("/settings", validate(settingsUpdateSchema), settingsCtrl.putSettings);
router.post("/settings/test-smtp", asyncHandler(settingsCtrl.testSmtp));

// Weryfikacja lekarzy
router.get("/doctors/pending", c.pendingDoctors);
router.patch("/doctors/:id/verify", validate(adminVerifySchema), c.verifyDoctor);

// Użytkownicy
router.get("/users", c.listUsers);
router.get("/users/:id", c.userDetails);
router.patch("/users/:id/status", validate(adminUserStatusSchema), c.userStatus);

// Wgląd (bez edycji)
router.get("/appointments", c.appointments);
router.get("/prescriptions", c.prescriptions);

// Statystyki
router.get("/stats", c.stats);

module.exports = router;
