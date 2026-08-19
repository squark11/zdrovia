/* auth.routes.js — /api/auth */
"use strict";

const router = require("express").Router();
const c = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate.middleware");
const { requireAuth } = require("../middleware/auth.middleware");
const { registerSchema, loginSchema, changePasswordSchema } = require("../utils/validators");

router.post("/register", validate(registerSchema), c.register);
router.post("/login", validate(loginSchema), c.login);
router.post("/logout", c.logout);
router.get("/me", requireAuth, c.me);
router.post("/change-password", requireAuth, validate(changePasswordSchema), c.changePassword);

module.exports = router;
