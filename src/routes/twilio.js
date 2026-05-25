const express = require("express");
const twilio = require("twilio");
const auth = require("../middleware/auth");
const ctrl = require("../controllers/twilioController");

const router = express.Router();

// Twilio signature validator for public webhooks
const validateTwilio = twilio.webhook({ validate: true });

// ---------- Authenticated app routes ----------
router.get("/token",          auth, ctrl.getAccessToken);
router.post("/sms",           auth, ctrl.sendSMS);
router.post("/voice-message", auth, ctrl.sendVoiceMessage);

// ---------- Public Twilio webhooks (signed) ----------
router.post("/voice",         validateTwilio, ctrl.handleOutgoingCall);   // browser → PSTN
router.post("/incoming",      validateTwilio, ctrl.handleIncomingCall);   // PSTN → browser
router.post("/status",        validateTwilio, ctrl.handleCallStatus);
router.post("/voicemail",     validateTwilio, ctrl.handleVoicemail);
router.post("/transcription", validateTwilio, ctrl.handleTranscription);
router.post("/sms-incoming",  validateTwilio, ctrl.handleIncomingSMS);

module.exports = router;
