const express  = require("express");
const twilio   = require("twilio");
const { protect } = require("../middleware/auth"); // ← destructure karo
const ctrl     = require("../controllers/twilioController");
const router   = express.Router();
const rateLimit = require("express-rate-limit");

// Twilio signature validator — development mein validate:false rakho
const validateTwilio = twilio.webhook({ validate: false }); // ← false abhi

const smsLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 SMS per minute per IP
  message: "Too many SMS requests"
});

// ---------- Authenticated routes ----------
router.get("/token",          protect, ctrl.getAccessToken);
router.post("/sms", smsLimiter ,  protect, ctrl.sendSMS);
router.post("/voice-message", protect, ctrl.sendVoiceMessage);

// ---------- Public Twilio webhooks ----------
router.post("/voice",         validateTwilio, ctrl.handleOutgoingCall);
router.post("/incoming",      validateTwilio, ctrl.handleIncomingCall);
router.post("/status",        validateTwilio, ctrl.handleCallStatus);
router.post("/voicemail",     validateTwilio, ctrl.handleVoicemail);
router.post("/transcription", validateTwilio, ctrl.handleTranscription);
router.post("/sms-incoming",  validateTwilio, ctrl.handleIncomingSMS);

module.exports = router;