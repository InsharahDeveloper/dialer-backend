// src/routes/voiceMails.js

const express = require("express");
const router  = express.Router();

const {
  getVoiceMails,
  createVoiceMail,
  getVoiceMail,
  markAsPlayed,
  markAllAsRead,
  deleteVoiceMail,
} = require("../controllers/voiceMailsController");

const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/",                getVoiceMails);   // GET    /api/voice-mails
router.post("/",               createVoiceMail); // POST   /api/voice-mails
router.patch("/read-all",      markAllAsRead);   // PATCH  /api/voice-mails/read-all
router.get("/:id",             getVoiceMail);    // GET    /api/voice-mails/:id
router.patch("/:id/played",    markAsPlayed);    // PATCH  /api/voice-mails/:id/played
router.delete("/:id",          deleteVoiceMail); // DELETE /api/voice-mails/:id

module.exports = router;