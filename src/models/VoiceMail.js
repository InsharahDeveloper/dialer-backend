// src/models/VoiceMail.js — Updated with real-time support

const mongoose = require("mongoose");

const VoiceMailSchema = new mongoose.Schema(
  {
    // Kiska voicemail hai
    owner:   { type: mongoose.Schema.Types.ObjectId, ref: "User",         required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact",      default: null  },

    // ── NEW: Per-contact thread ke liye ──────────────────────────────────────
    // Conversation se link — Ali ke saath chat aur voicemail ek hi thread mein
conversation: { 
  type: mongoose.Schema.Types.ObjectId, 
  ref: "Conversation", 
  default: null, 
  index: true   // ← ye line add karo
},
    // Sender info
    from:     { type: String, required: true }, // phone number
    fromName: { type: String, default: ""    }, // display name
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // agar app user hai

    // Audio
    audioUrl:      { type: String, default: null  }, // Twilio ya uploaded file URL
    audioDuration: { type: Number, default: 0     }, // seconds mein
    transcript:    { type: String, default: ""    }, // Twilio transcription (optional)

    // Status
    status:   { type: String, enum: ["unread", "read"], default: "unread" },
    isPlayed: { type: Boolean, default: false }, // audio suna gaya?

    // Twilio specific
    twilioCallSid:    { type: String, default: "" },
    twilioRecordingSid:{ type: String, default: "" },
  },
  { timestamps: true }
);

// Frontend path
VoiceMailSchema.virtual("path").get(function () {
  return `/voice-mails/${this._id}`;
});

VoiceMailSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("VoiceMail", VoiceMailSchema);


