// src/routes/twilio.js
const express  = require("express");
const router   = express.Router();
const { protect } = require("../middleware/auth");

const {
  generateAccessToken,
  handleOutgoingCall,
  handleIncomingCall,
  handleCallStatus,
  handleVoicemail,
  handleTranscription,
} = require("../controllers/twilioController");

// Protected — frontend ke liye
router.get("/token",    protect, generateAccessToken);

// Webhooks — Twilio directly call karta hai, protect nahi
// Twilio ka apna signature verification hoga (production mein)
router.post("/voice",         handleOutgoingCall);
router.post("/incoming",      handleIncomingCall);
router.post("/status",        handleCallStatus);
router.post("/voicemail",     handleVoicemail);
router.post("/transcription", handleTranscription);

module.exports = router;