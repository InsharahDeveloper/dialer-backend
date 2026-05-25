const express  = require("express");
const twilio   = require("twilio");
const { protect } = require("../middleware/auth"); // ← destructure karo
const ctrl     = require("../controllers/twilioController");
const router   = express.Router();

// Twilio signature validator — development mein validate:false rakho
const validateTwilio = twilio.webhook({ validate: false }); // ← false abhi

// ---------- Authenticated routes ----------
router.get("/token",          protect, ctrl.getAccessToken);
router.post("/sms",           protect, ctrl.sendSMS);
router.post("/voice-message", protect, ctrl.sendVoiceMessage);

// ---------- Public Twilio webhooks ----------
router.post("/voice",         validateTwilio, ctrl.handleOutgoingCall);
router.post("/incoming",      validateTwilio, ctrl.handleIncomingCall);
router.post("/status",        validateTwilio, ctrl.handleCallStatus);
router.post("/voicemail",     validateTwilio, ctrl.handleVoicemail);
router.post("/transcription", validateTwilio, ctrl.handleTranscription);
router.post("/sms-incoming",  validateTwilio, ctrl.handleIncomingSMS);

module.exports = router;