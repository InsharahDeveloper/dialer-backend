const express = require("express");
const twilio = require("twilio");
const { protect } = require("../middleware/auth");
const ctrl = require("../controllers/twilioController");
const router = express.Router();
const rateLimit = require("express-rate-limit");

// Twilio signature validator — production mein validate:true karo
const validateTwilio = twilio.webhook({ validate: process.env.NODE_ENV === 'production' });

// SMS rate limiter (IP based, trust proxy if behind reverse proxy)
const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many SMS requests",
  // Agar cloudflare/nginx use kar rahe ho to:
  keyGenerator: (req) => req.ip, // express behind proxy sets req.ip if trust proxy is on
});

// ---------- Authenticated routes (user facing) ----------
router.get("/token", protect, ctrl.getAccessToken);
router.post("/sms", smsLimiter, protect, ctrl.sendSMS);
router.post("/voice-message", protect, ctrl.sendVoiceMessage);

// ---------- Twilio webhooks (public, but validated) ----------
router.post("/outgoing", validateTwilio, ctrl.handleOutgoingCall); // TwiML App voice URL set to /api/twilio/outgoing
router.post("/incoming", validateTwilio, ctrl.handleIncomingCall); // Incoming call webhook
router.post("/status", validateTwilio, ctrl.handleCallStatus);     // Call status & recording callback
router.post("/voicemail", validateTwilio, ctrl.handleVoicemail);   // When client doesn't answer
router.post("/voicemail-callback", validateTwilio, ctrl.handleVoicemailCallback); // ✅ Added missing route
router.post("/transcription", validateTwilio, ctrl.handleTranscription);
router.post("/sms-incoming", validateTwilio, ctrl.handleIncomingSMS);

module.exports = router;