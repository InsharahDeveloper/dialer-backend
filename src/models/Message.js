// src/models/Message.js
// Har message ek conversation ka hissa hota hai

const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    // Yeh message kis conversation mein hai
    conversation: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Conversation",
      required: true,
      index:    true,
    },

    // Kisne bheja
    sender: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // Message content
    text:    { type: String,  default: "" },
    type:    {
      type:    String,
      enum:    ["text", "voice", "image", "file", "system"],
      default: "text",
    },

    // Voice message ke liye (Twilio recording ya uploaded audio)
    audioUrl:     { type: String, default: null },
    audioDuration:{ type: Number, default: 0 }, // seconds

    // Image/File ke liye
    fileUrl:  { type: String, default: null },
    fileName: { type: String, default: "" },

    // Read status
    // Array isliye kyunki future mein group chat bhi ho sakti hai
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Kisi message ka reply
    replyTo: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Message",
      default: null,
    },

    // Message delete hua?
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);