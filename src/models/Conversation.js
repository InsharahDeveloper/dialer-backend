// src/models/Conversation.js
// Har contact ke saath alag conversation hogi
// Jaise WhatsApp mein har contact ki alag chat hoti hai

const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema(
  {
    // Yeh conversation kiske beech hai
    owner:     { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    contact:   { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true },

    // Last message preview — sidebar mein dikhayenge
    lastMessage: {
      text:      { type: String,  default: "" },
      type:      { type: String,  default: "text" }, // text/voice/image
      sentAt:    { type: Date,    default: null },
      senderId:  { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    // Unread count — badge ke liye
    unreadCount: { type: Number, default: 0 },

    // Conversation muted hai?
    isMuted: { type: Boolean, default: false },

    // Pinned conversations upar dikhenge
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ek user ka ek contact ke saath sirf ek conversation
ConversationSchema.index({ owner: 1, contact: 1 }, { unique: true });

// Frontend ke liye path
ConversationSchema.virtual("path").get(function () {
  return `/messages/${this._id}`;
});

ConversationSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Conversation", ConversationSchema);