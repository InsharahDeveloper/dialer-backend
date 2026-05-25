// routes/auth.js
const express   = require("express");
const router    = express.Router();
const rateLimit = require("express-rate-limit");

const { register, login, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// ✅ Rate limiter — sirf login pe
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              5,               // 5 attempts
  message: {
    success: false,
    message: "Bahut zyada login attempts. 15 minute baad try karein.",
  },
  standardHeaders: true,
  legacyHeaders:   false,
});


router.post("/login",    loginLimiter, login); // ← limiter sirf yahan

router.get("/me", protect, getMe);

module.exports = router;