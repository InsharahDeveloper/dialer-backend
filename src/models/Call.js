// src/models/Call.js
const mongoose = require("mongoose");

const CallSchema = new mongoose.Schema(
  {
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    contact:    { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null  }, // null = unknown number
    
    direction:  { type: String, enum: ["incoming", "outgoing"], required: true },
    status:     { type: String, enum: ["completed", "missed", "rejected", "busy"], default: "completed" },
    
    from:       { type: String, required: true }, // phone number
    to:         { type: String, required: true }, // phone number
    
    duration:   { type: Number, default: 0 }, // seconds mein
    
    // Twilio se aata hai
    twilioCallSid: { type: String, default: "" },
    recordingUrl:  { type: String, default: null },
    
    startedAt:  { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

// Call duration format helper (frontend ke liye)
CallSchema.virtual("durationFormatted").get(function () {
  if (!this.duration) return null;
  const m = Math.floor(this.duration / 60);
  const s = this.duration % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
});

// Frontend path virtual
CallSchema.virtual("path").get(function () {
  return `/calls/${this._id}`;
});

CallSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Call", CallSchema);
