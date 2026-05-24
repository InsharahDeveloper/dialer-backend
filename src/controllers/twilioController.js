// src/controllers/twilioController.js
const twilio     = require("twilio");
const { getTwilioClient } = require("../config/twilio");
const Call       = require("../models/Call");
const VoiceMail  = require("../models/VoiceMail");
const Contact    = require("../models/Contact");
const Conversation = require("../models/Conversation");

// ─── POST /api/twilio/token ───────────────────────────────────────────────────
// Frontend ko access token do — browser calling ke liye
const generateAccessToken = (req, res) => {
  try {
    const AccessToken    = twilio.jwt.AccessToken;
    const VoiceGrant     = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow:          true,
    });

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,       // alag se banenge
      process.env.TWILIO_API_SECRET,    // alag se banenge
      { identity: String(req.user._id) }
    );

    token.addGrant(voiceGrant);

    res.json({
      success: true,
      token:   token.toJwt(),
      identity: String(req.user._id),
    });
  } catch (err) {
    console.error("Token generate error:", err);
    res.status(500).json({ message: "Token generate nahi hua" });
  }
};

// ─── POST /api/twilio/voice ───────────────────────────────────────────────────
// Outgoing call — TwiML response
const handleOutgoingCall = (req, res) => {
  try {
    const { To } = req.body; // frontend se number aayega
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml         = new VoiceResponse();

    if (!To) {
      twiml.say("Number nahi diya gaya.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const dial = twiml.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER,
      record:   "record-from-answer",
    });

    // Browser-to-phone
    if (To.startsWith("client:")) {
      dial.client(To.replace("client:", ""));
    } else {
      dial.number(To);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("Outgoing call error:", err);
    res.status(500).json({ message: "Call handle nahi hua" });
  }
};

// ─── POST /api/twilio/incoming ────────────────────────────────────────────────
// Incoming call webhook — Twilio yahan call karta hai
const handleIncomingCall = async (req, res) => {
  try {
    const { From, CallSid } = req.body;
    const VoiceResponse     = twilio.twiml.VoiceResponse;
    const twiml             = new VoiceResponse();

    // Caller ko hold pe rakho — agent ka browser ring karao
    const dial = twiml.dial();
    // Sabhi online agents ko ring karo — simplest approach
    dial.client("agent"); // frontend identity match karni hogi

    // Voicemail — agar koi na uthaye
    twiml.say("Koi available nahi hai. Beep ke baad message chhod dein.");
    twiml.record({
      action:       `${process.env.SERVER_URL}/api/twilio/voicemail`,
      maxLength:    120,
      playBeep:     true,
      transcribe:   true,
      transcribeCallback: `${process.env.SERVER_URL}/api/twilio/transcription`,
    });

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("Incoming call error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/twilio/status ──────────────────────────────────────────────────
// Call status webhook — call end hone pe Twilio yahan aata hai
const handleCallStatus = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,   // completed / no-answer / busy / failed
      From,
      To,
      CallDuration, // seconds
      Direction,
    } = req.body;

    // Call DB mein save karo
    // Owner dhundho — To number se (incoming) ya From se (outgoing)
    const phoneToSearch = Direction === "inbound" ? To : From;

    // Koi bhi user jiska yeh number ho
    // Simple approach — sirf ek user hai abhi
    // Multi-user ke liye alag logic chahiye hoga
    const contact = await Contact.findOne({ phone: From });

    await Call.create({
      owner:         contact?.owner || null,
      contact:       contact?._id  || null,
      direction:     Direction === "inbound" ? "incoming" : "outgoing",
      status:        CallStatus === "completed" ? "completed" : "missed",
      from:          From,
      to:            To,
      duration:      Number(CallDuration) || 0,
      twilioCallSid: CallSid,
      startedAt:     CallDuration ? new Date(Date.now() - CallDuration * 1000) : new Date(),
      endedAt:       new Date(),
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Call status error:", err);
    res.sendStatus(500);
  }
};

// ─── POST /api/twilio/voicemail ───────────────────────────────────────────────
// Recording complete webhook
const handleVoicemail = async (req, res) => {
  try {
    const {
      From,
      RecordingUrl,
      RecordingDuration,
      CallSid,
      RecordingSid,
    } = req.body;

    // Contact dhundho
    const contact = await Contact.findOne({ phone: From });

    // Conversation dhundho ya banao
    let conversation = null;
    if (contact) {
      conversation = await Conversation.findOne({
        owner:   contact.owner,
        contact: contact._id,
      });

      if (!conversation) {
        conversation = await Conversation.create({
          owner:   contact.owner,
          contact: contact._id,
        });
      }

      // unreadCount badhaao — yeh incoming hai, owner ke liye
      await Conversation.findByIdAndUpdate(conversation._id, {
        lastMessage: {
          text:    `🎤 Voice message (${RecordingDuration || 0}s)`,
          type:    "voice",
          sentAt:  new Date(),
        },
        $inc: { unreadCount: 1 }, // ✅ Incoming — sahi hai yahan
      });
    }

    const voiceMail = await VoiceMail.create({
      owner:              contact?.owner      || null,
      contact:            contact?._id        || null,
      conversation:       conversation?._id   || null,
      from:               From,
      fromName:           contact?.name       || From,
      audioUrl:           `${RecordingUrl}.mp3`,
      audioDuration:      Number(RecordingDuration) || 0,
      twilioCallSid:      CallSid,
      twilioRecordingSid: RecordingSid,
      status:             "unread",
    });

    // Socket se real-time notify
    const io = req.app.get("io");
    if (io && conversation) {
      io.to(`conversation-${conversation._id}`).emit("new-voicemail", {
        voiceMail,
        conversationId: conversation._id,
      });

      // Personal room mein bhi
      if (contact?.owner) {
        io.to(`user-${contact.owner}`).emit("voicemail-notification", {
          voiceMail,
          from: From,
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Voicemail error:", err);
    res.sendStatus(500);
  }
};

// ─── POST /api/twilio/transcription ──────────────────────────────────────────
// Transcription complete webhook
const handleTranscription = async (req, res) => {
  try {
    const { RecordingSid, TranscriptionText } = req.body;

    if (RecordingSid && TranscriptionText) {
      await VoiceMail.findOneAndUpdate(
        { twilioRecordingSid: RecordingSid },
        { transcript: TranscriptionText }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Transcription error:", err);
    res.sendStatus(500);
  }
};

module.exports = {
  generateAccessToken,
  handleOutgoingCall,
  handleIncomingCall,
  handleCallStatus,
  handleVoicemail,
  handleTranscription,
};