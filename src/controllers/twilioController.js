// src/controllers/twilioController.js
const twilio = require("twilio");
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;
const { jwt: TwilioJwt } = twilio;
const AccessToken = TwilioJwt.AccessToken;
const { VoiceGrant } = AccessToken;

const User = require("../models/User");
const Call = require("../models/Call");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Contact = require("../models/Contact");
const VoiceMail = require("../models/VoiceMail");
const OptOut = require("../models/OptOut"); // if you have this model

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// --------------------- Helper: emit to user's room ---------------------
const emitToUser = (req, userId, event, payload) => {
  const io = req.app.get("io");
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
};

// --------------------- 1. Voice Access Token ---------------------------
exports.getAccessToken = async (req, res) => {
  try {
    const identity = String(req.user._id);
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity, ttl: 3600 }
    );
    const grant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    });
    token.addGrant(grant);
    res.json({ token: token.toJwt(), identity });
  } catch (err) {
    console.error("getAccessToken:", err);
    res.status(500).json({ error: "Token generation failed" });
  }
};

// --------------------- 2. Outgoing Call (with country allowlist) ------
const ALLOWED_COUNTRY_PREFIXES = ["+92", "+1", "+44", "+971"];

function isAllowedNumber(phoneNumber) {
  if (phoneNumber.startsWith("+")) {
    return ALLOWED_COUNTRY_PREFIXES.some(prefix => phoneNumber.startsWith(prefix));
  }
  return false; // require country code
}

exports.handleOutgoingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To, From, CallSid } = req.body;
  let user = null;
  let fromNumber = null;

  try {
    const callerId = From?.startsWith("client:") ? From.slice("client:".length) : null;
    user = callerId ? await User.findById(callerId) : null;
    fromNumber = user?.twilioNumber || process.env.TWILIO_FALLBACK_NUMBER;
    if (!fromNumber) throw new Error("No caller ID available");

    // Country security check
    if (/^\+?\d+$/.test(To)) {
      let normalizedTo = To;
      if (!normalizedTo.startsWith("+")) {
        throw new Error("International calls must include country code starting with +");
      }
      if (!isAllowedNumber(normalizedTo)) {
        twiml.say("Calls to this country are not allowed for security reasons.");
        return res.type("text/xml").send(twiml.toString());
      }
    }

    twiml.say({ voice: "alice" }, "This call may be recorded for quality and training purposes.");

    const dial = twiml.dial({
      callerId: fromNumber,
      answerOnBridge: true,
      record: "record-from-answer-dual",
      recordingStatusCallback: `${process.env.PUBLIC_URL}/api/twilio/status`,
    });

    if (/^\+?\d+$/.test(To)) {
      dial.number(To);
    } else {
      dial.client(To);
    }

    await Call.create({
      owner: user?._id || callerId,
      direction: "outgoing",
      from: From,
      to: To,
      status: "queued",
      twilioCallSid: CallSid,
      startedAt: new Date()
    });
  } catch (err) {
    console.error("handleOutgoingCall:", err);
    twiml.say("Sorry, an error occurred.");
  }
  res.type("text/xml").send(twiml.toString());
};

// --------------------- 3. Incoming PSTN Call (→ browser client) --------
exports.handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To, From, CallSid } = req.body;

  try {
    const owner = await User.findOne({ twilioNumber: To });
    if (!owner) {
      twiml.say("This number is not assigned to any agent.");
      return res.type("text/xml").send(twiml.toString());
    }

    const call = await Call.create({
      owner: owner._id,
      direction: "incoming",
      from: From,
      to: To,
      status: "ringing",
      twilioCallSid: CallSid,
      startedAt: new Date()
    });

    emitToUser(req, owner._id, "incoming-call", {
      callId: call._id,
      from: From,
      to: To,
      callSid: CallSid,
    });

    const dial = twiml.dial({
      timeout: 30,
      action: `${process.env.PUBLIC_URL}/api/twilio/voicemail`,
    });
    dial.client(String(owner._id));
  } catch (err) {
    console.error("handleIncomingCall:", err);
    twiml.say("Sorry, an internal error occurred.");
  }
  res.type("text/xml").send(twiml.toString());
};

// --------------------- 4. Call Status Callback -------------------------
exports.handleCallStatus = async (req, res) => {
  try {
    const {
      CallSid, CallStatus, Direction, To, From,
      CallDuration, RecordingUrl, RecordingSid
    } = req.body;

    const ownerNumber = Direction === "inbound" ? To : From;
    const owner = await User.findOne({ twilioNumber: ownerNumber });

    const update = { status: CallStatus };
    if (CallDuration) update.duration = Number(CallDuration);
    if (RecordingUrl) update.recordingUrl = RecordingUrl;
    if (RecordingSid) update.recordingSid = RecordingSid;
    if (["completed","busy","no-answer","failed","canceled"].includes(CallStatus)) {
      update.endedAt = new Date();
    }
    if (CallStatus === "no-answer") update.status = "missed";

    const call = await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      update,
      { new: true }
    );

    if (call && owner) {
      emitToUser(req, owner._id, "call-status", {
        callId: call._id,
        status: CallStatus,
        duration: call.duration,
      });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("handleCallStatus:", err);
    res.sendStatus(500);
  }
};

// --------------------- 5. Voicemail (no answer) — initial TwiML -------
exports.handleVoicemail = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To } = req.body;

  try {
    const owner = await User.findOne({ twilioNumber: To });
    twiml.say("Please leave a message after the beep.");
    twiml.record({
      action: `${process.env.PUBLIC_URL}/api/twilio/voicemail-callback`,
      transcribe: true,
      transcribeCallback: `${process.env.PUBLIC_URL}/api/twilio/transcription?ownerId=${owner?._id || ""}`,
      maxLength: 60,
      playBeep: true
    });
  } catch (err) {
    console.error("handleVoicemail:", err);
    twiml.hangup();
  }
  res.type("text/xml").send(twiml.toString());
};

// --------------------- 6. Voicemail recording callback -----------------
exports.handleVoicemailCallback = async (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Thank you. Your message has been recorded.");
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
};

// --------------------- 7. Transcription callback (voicemail save) -----
exports.handleTranscription = async (req, res) => {
  try {
    const { CallSid, TranscriptionText, RecordingUrl, From, To } = req.body;
    const ownerId = req.query.ownerId;

    let owner;
    if (ownerId) {
      owner = await User.findById(ownerId);
    } else {
      owner = await User.findOne({ twilioNumber: To });
    }
    if (!owner) {
      console.warn("Voicemail from unknown number:", To);
      return res.sendStatus(200);
    }

    // Find or create contact from caller number
    let contact = await Contact.findOne({ owner: owner._id, phone: From });
    if (!contact) {
      contact = await Contact.create({
        owner: owner._id,
        name: From,
        phone: From,
      });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      owner: owner._id,
      contact: contact._id,
    });
    if (!conversation) {
      conversation = await Conversation.create({
        owner: owner._id,
        contact: contact._id,
      });
    }

    // Create VoiceMail record
    const voiceMail = await VoiceMail.create({
      owner: owner._id,
      contact: contact._id,
      conversation: conversation._id,
      from: From,
      fromName: contact.name,
      fromUser: null,
      audioUrl: RecordingUrl ? `${RecordingUrl}.mp3` : null,
      transcript: TranscriptionText || "",
      status: "unread",
      isPlayed: false,
      twilioCallSid: CallSid,
    });

    // Update conversation lastMessage & unreadCount
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: `🎤 Voice message${TranscriptionText ? " (with transcript)" : ""}`,
        type: "voice",
        sentAt: new Date(),
        senderId: null,
      },
      $inc: { unreadCount: 1 },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${owner._id}`).emit("new-voicemail", {
        voiceMail,
        conversationId: conversation._id,
        contact: { id: contact._id, name: contact.name, phone: contact.phone },
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("handleTranscription:", err);
    res.sendStatus(500);
  }
};

// --------------------- 8. Incoming SMS (save to Message + conversation) -
exports.handleIncomingSMS = async (req, res) => {
  const twiml = new MessagingResponse();
  const { To, From, Body, MessageSid, NumMedia, MediaUrl0 } = req.body;
  const text = (Body || "").trim();
  const STOP_WORDS = ["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"];
  const START_WORDS = ["START","UNSTOP","YES"];

  // Opt-out handling
  if (STOP_WORDS.includes(text.toUpperCase())) {
    await OptOut.updateOne({ phone: From }, { phone: From, optedOut: true }, { upsert: true });
    twiml.message("You have been unsubscribed. Reply START to opt back in.");
    return res.type("text/xml").send(twiml.toString());
  }
  if (START_WORDS.includes(text.toUpperCase())) {
    await OptOut.updateOne({ phone: From }, { optedOut: false });
    twiml.message("You are resubscribed.");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const owner = await User.findOne({ twilioNumber: To });
    if (!owner) {
      console.warn(`Incoming SMS for unowned number ${To}`);
      return res.type("text/xml").send(twiml.toString());
    }

    // Find or create contact
    let contact = await Contact.findOne({ owner: owner._id, phone: From });
    if (!contact) {
      contact = await Contact.create({
        owner: owner._id,
        name: From,
        phone: From,
      });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      owner: owner._id,
      contact: contact._id,
    });
    if (!conversation) {
      conversation = await Conversation.create({
        owner: owner._id,
        contact: contact._id,
      });
    }

    const isAudio = Number(NumMedia) > 0 && MediaUrl0;
    const message = await Message.create({
      conversation: conversation._id,
      sender: null,               // null = incoming from contact
      text: text || "",
      type: isAudio ? "voice" : "text",
      audioUrl: isAudio ? MediaUrl0 : null,
      twilioSid: MessageSid,
      direction: "incoming",
      readBy: [],                  // owner hasn't read it yet
    });

    // Update conversation
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: text || (isAudio ? "🎤 Voice message" : "📎 Media"),
        type: isAudio ? "voice" : "text",
        sentAt: new Date(),
        senderId: null,
      },
      $inc: { unreadCount: 1 },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${owner._id}`).emit("new-message", {
        conversationId: conversation._id,
        message,
        contact: { id: contact._id, name: contact.name, phone: contact.phone },
      });
      io.to(`conversation-${conversation._id}`).emit("new-message", { message, conversationId: conversation._id });
    }

    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("handleIncomingSMS:", err);
    res.type("text/xml").send(twiml.toString());
  }
};

// --------------------- 9. Outbound SMS (authenticated) -----------------
exports.sendSMS = async (req, res) => {
  try {
    const { to, body } = req.body;
    const blocked = await OptOut.findOne({ phone: to, optedOut: true });
    if (blocked) {
      return res.status(400).json({ error: "Recipient has opted out" });
    }

    const user = await User.findById(req.user._id);
    if (!user?.twilioNumber) {
      return res.status(400).json({ error: "No Twilio number assigned to this user" });
    }

    const msg = await client.messages.create({
      to,
      from: user.twilioNumber,
      body,
      statusCallback: `${process.env.PUBLIC_URL}/api/twilio/sms-status`,
    });

    // Find or create conversation & contact for this outgoing message
    let contact = await Contact.findOne({ owner: user._id, phone: to });
    if (!contact) {
      contact = await Contact.create({ owner: user._id, name: to, phone: to });
    }
    let conversation = await Conversation.findOne({ owner: user._id, contact: contact._id });
    if (!conversation) {
      conversation = await Conversation.create({ owner: user._id, contact: contact._id });
    }

    const saved = await Message.create({
      conversation: conversation._id,
      sender: user._id,
      text: body,
      type: "text",
      twilioSid: msg.sid,
      direction: "outgoing",
      readBy: [user._id],
    });

    // Update conversation lastMessage (no unreadCount increment for outgoing)
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: body,
        type: "text",
        sentAt: new Date(),
        senderId: user._id,
      },
    });

    res.json({ message: saved });
  } catch (err) {
    console.error("sendSMS:", err);
    res.status(500).json({ error: err.message });
  }
};

// --------------------- 10. Outbound voice message (MMS audio) ---------
exports.sendVoiceMessage = async (req, res) => {
  try {
    const { to, audioUrl } = req.body;
    const user = await User.findById(req.user._id);
    if (!user?.twilioNumber) {
      return res.status(400).json({ error: "No Twilio number assigned to this user" });
    }

    const msg = await client.messages.create({
      to,
      from: user.twilioNumber,
      mediaUrl: [audioUrl],
    });

    // Create contact/conversation (similar to SMS)
    let contact = await Contact.findOne({ owner: user._id, phone: to });
    if (!contact) {
      contact = await Contact.create({ owner: user._id, name: to, phone: to });
    }
    let conversation = await Conversation.findOne({ owner: user._id, contact: contact._id });
    if (!conversation) {
      conversation = await Conversation.create({ owner: user._id, contact: contact._id });
    }

    const saved = await Message.create({
      conversation: conversation._id,
      sender: user._id,
      type: "voice",
      audioUrl,
      twilioSid: msg.sid,
      direction: "outgoing",
      readBy: [user._id],
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: "🎤 Voice message",
        type: "voice",
        sentAt: new Date(),
        senderId: user._id,
      },
    });

    res.json({ message: saved });
  } catch (err) {
    console.error("sendVoiceMessage:", err);
    res.status(500).json({ error: err.message });
  }
};