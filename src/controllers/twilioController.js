const twilio = require("twilio");
const { jwt: TwilioJwt } = twilio;
const AccessToken = TwilioJwt.AccessToken;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

const User = require("../models/User");
const Call = require("../models/Call");
const Message = require("../models/Message");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// helper – emit to a single user's room
const emitToUser = (req, userId, event, payload) => {
  const io = req.app.get("io");
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
};

// ---------------------------------------------
// 1. Voice access token (per user, identity = userId)
// ---------------------------------------------
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

// ---------------------------------------------
// 2. Outgoing call TwiML (browser → PSTN)
// Twilio calls /voice with { To, From: 'client:<userId>' }
// ---------------------------------------------
exports.handleOutgoingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To, From, CallSid} = req.body;

  try {
    // From = "client:<userId>"
    const callerId = From?.startsWith("client:")
      ? From.slice("client:".length)
      : null;

    const user = callerId ? await User.findById(callerId) : null;
    const fromNumber = user?.twilioNumber || process.env.TWILIO_FALLBACK_NUMBER;

  twiml.say(
  { voice: "alice" },
  "This call may be recorded for quality and training purposes."
);

    const dial = twiml.dial({
      callerId: fromNumber,
      answerOnBridge: true,
      record: "record-from-answer-dual",
      recordingStatusCallback: `${process.env.PUBLIC_URL}/api/twilio/status`,
    });

    if (/^\+?\d+$/.test(To)) {
      dial.number(To);
    } else {
      dial.client(To); // browser → browser
    }
  } catch (err) {
    console.error("handleOutgoingCall:", err);
    twiml.say("Sorry, an error occurred.");
  }

const userId = req.body.userId || req.user?._id; 
// userId frontend se TwiML param ya JWT se nikalein

await Call.create({
      owner : owner._id,
      direction: "incoming",
      from: From,
      to: To,
      status: "queued",
      twilioCallSid: req.body.CallSid,
      startedAt : newDate()
    });


  res.type("text/xml").send(twiml.toString());
};

// ---------------------------------------------
// 3. Incoming PSTN call → ring the owning user's browser
// Twilio calls /incoming with { To: <twilioNumber>, From: <callerNumber> }
// ---------------------------------------------
exports.handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To, From } = req.body;

  try {
    const owner = await User.findOne({ twilioNumber: To });

    if (!owner) {
      twiml.say("This number is not assigned to any agent.");
      return res.type("text/xml").send(twiml.toString());
    }

    // Persist
    const call = await Call.create({
      owner : owner._id,
      direction: "incoming",
      from: From,
      to: To,
      status: "ringing",
      twilioCallSid: req.body.CallSid,
      startedAt : newDate()
    });

    emitToUser(req, owner._id, "incoming-call", {
      callId: call._id,
      from: From,
      to: To,
      callSid: req.body.CallSid,
    });

    const dial = twiml.dial({
      timeout: 30,
      action: `${process.env.PUBLIC_URL}/api/twilio/voicemail`,
    });
    dial.client(String(owner._id)); // identity must match access token identity
  } catch (err) {
    console.error("handleIncomingCall:", err);
    twiml.say("Sorry, an internal error occurred.");
  }

  res.type("text/xml").send(twiml.toString());
};

// ---------------------------------------------
// 4. Call status callback
// Direction decides whether To or From belongs to the user
// ---------------------------------------------
exports.handleCallStatus = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      Direction,           // "inbound" | "outbound-api" | "outbound-dial"
      To,
      From,
      CallDuration,
      RecordingUrl,
      RecordingSid,
    } = req.body;

    // owner lookup based on direction
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

    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

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

// ---------------------------------------------
// 5. Voicemail (no answer) — owner = User.findOne({ twilioNumber: To })
// ---------------------------------------------
exports.handleVoicemail = async (req, res) => {
  const twiml = new VoiceResponse();
  const { To } = req.body;

  try {
    const owner = await User.findOne({ twilioNumber: To });
    twiml.say("Please leave a message after the beep.");
twiml.record({
  action: "/api/twilio/voicemail",   // ✅ alag endpoint
  transcribe: true,
  transcribeCallback: `${process.env.PUBLIC_URL}/api/twilio/transcription?ownerId=${owner?._id || ""}`,
  maxLength: 60,
  playBeep: true
});
    twiml.hangup();
  } catch (err) {
    console.error("handleVoicemail:", err);
  }

  res.type("text/xml").send(twiml.toString());
};

// ---------------------------------------------
// 6. Transcription callback
// ---------------------------------------------
exports.handleTranscription = async (req, res) => {
  try {
    const { CallSid, TranscriptionText, RecordingUrl, From, To } = req.body;
    const ownerId = req.query.ownerId;

    const owner = ownerId
      ? await User.findById(ownerId)
      : await User.findOne({ twilioNumber: To });

    const call = await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        transcription: TranscriptionText,
        voicemailUrl: RecordingUrl ? `${RecordingUrl}.mp3` : undefined,
      },
      { new: true }
    );

    if (owner) {
      emitToUser(req, owner._id, "voicemail-received", {
        callId: call?._id,
        from: From,
        transcription: TranscriptionText,
        url: call?.voicemailUrl,
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("handleTranscription:", err);
    res.sendStatus(500);
  }
};

// ---------------------------------------------
// 7. Outbound SMS (authenticated user)
// ---------------------------------------------
exports.sendSMS = async (req, res) => {

  const blocked = await OptOut.findOne({ phone: to, optedOut: true });
  if (blocked) throw new Error("Recipient has opted out");


  try {
    const { to, body } = req.body;
    const user = await User.findById(req.user._id);
    if (!user?.twilioNumber)
      return res.status(400).json({ error: "No Twilio number assigned to this user" });

    const msg = await client.messages.create({
      to,
      from: user.twilioNumber,
      body,
      statusCallback: `${process.env.PUBLIC_URL}/api/twilio/sms-status`,
    });

    const saved = await Message.create({
      sender: user._id,
      from: user.twilioNumber,
      to,
      body,
      type: "text",
      twilioSid: msg.sid,
      direction: "outgoing",
    });

    res.json({ message: saved });
  } catch (err) {
    console.error("sendSMS:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------
// 8. Outbound voice message (MMS audio)
// ---------------------------------------------
exports.sendVoiceMessage = async (req, res) => {
  try {
    const { to, audioUrl } = req.body;
    const user = await User.findById(req.user._id);
    if (!user?.twilioNumber)
      return res.status(400).json({ error: "No Twilio number assigned to this user" });

    const msg = await client.messages.create({
      to,
      from: user.twilioNumber,
      mediaUrl: [audioUrl],
    });

    const saved = await Message.create({
      sender: user._id,
      from: user.twilioNumber,
      to,
      type: "audio",
      audioUrl,
      twilioSid: msg.sid,
      direction: "outgoing",
    });

    res.json({ message: saved });
  } catch (err) {
    console.error("sendVoiceMessage:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------
// 9. Incoming SMS webhook — owner = User.findOne({ twilioNumber: To })
// ---------------------------------------------
exports.handleIncomingSMS = async (req, res) => {
  const twiml = new MessagingResponse();

  const STOP_WORDS = ["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"];
  const START_WORDS = ["START","UNSTOP","YES"];

   if (STOP_WORDS.includes(text)) {
    await OptOut.updateOne(
      { phone: From },
      { phone: From, optedOut: true, updatedAt: new Date() },
      { upsert: true }
    );
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("You have been unsubscribed. Reply START to opt back in.");
    return res.type("text/xml").send(twiml.toString());
  }

  if (START_WORDS.includes(text)) {
    await OptOut.updateOne({ phone: From }, { optedOut: false });
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("You are resubscribed.");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const { To, From, Body, MessageSid, NumMedia, MediaUrl0 } = req.body;

    const owner = await User.findOne({ twilioNumber: To });
    if (!owner) {
      console.warn(`Incoming SMS for unowned number ${To}`);
      return res.type("text/xml").send(twiml.toString());
    }

    const isAudio = Number(NumMedia) > 0 && MediaUrl0;

    const saved = await Message.create({
      recipient: owner._id,
      from: From,
      to: To,
      body: Body,
      type: isAudio ? "audio" : "text",
      audioUrl: isAudio ? MediaUrl0 : undefined,
      twilioSid: MessageSid,
      direction: "incoming",
    });

    emitToUser(req, owner._id, "new-message", saved);

    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("handleIncomingSMS:", err);
    res.type("text/xml").send(twiml.toString());
  }
};
