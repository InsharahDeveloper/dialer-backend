// src/controllers/messagesController.js

const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const Contact      = require("../models/Contact");

// ─── GET /api/messages ────────────────────────────────────────────────────────
// Logged-in user ki saari conversations (sidebar list)
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ owner: req.user._id })
      .populate("contact", "name phone avatar") // contact ka naam aayega
      .sort({ "lastMessage.sentAt": -1 });       // latest pehle

    res.json({
      success:       true,
      count:         conversations.length,
      conversations,
    });
  } catch (err) {
    console.error("getConversations error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/messages/:conversationId ───────────────────────────────────────
// Ek conversation ke saare messages (chat history)
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Pehle verify karo — yeh conversation is user ki hai?
    const conversation = await Conversation.findOne({
      _id:   conversationId,
      owner: req.user._id,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation nahi mili" });
    }

    // Messages load karo — oldest first (chat style)
    const messages = await Message.find({ conversation: conversationId })
      .populate("sender",  "name avatar")
      .populate("replyTo", "text sender type")
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Unread messages read mark karo
    await Message.updateMany(
      {
        conversation: conversationId,
        readBy:       { $nin: [req.user._id] }, // jo abhi read nahi hue
      },
      { $addToSet: { readBy: req.user._id } }
    );

    // Conversation ka unread count reset karo
    await Conversation.findByIdAndUpdate(conversationId, { unreadCount: 0 });

    res.json({
      success:      true,
      count:        messages.length,
      conversation,
      messages,
    });
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Naya message bhejo
// ─── POST /api/messages/:conversationId ──────────────────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, type = "text", audioUrl, audioDuration, replyTo } = req.body;

    if (!text && !audioUrl) {
      return res.status(400).json({ message: "Text ya audio required hai" });
    }

    const conversation = await Conversation.findOne({
      _id:   conversationId,
      owner: req.user._id,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation nahi mili" });
    }

    const message = await Message.create({
      conversation:  conversationId,
      sender:        req.user._id,
      text:          text          || "",
      type,
      audioUrl:      audioUrl      || null,
      audioDuration: audioDuration || 0,
      replyTo:       replyTo       || null,
      readBy:        [req.user._id],
    });

    await message.populate("sender",  "name avatar");
    await message.populate("replyTo", "text sender type");

    // ✅ FIX: Check karo — kya sender ne conversation already kholi hui hai?
    // Agar sender hi owner hai aur woh active hai, unreadCount mat badhao
    // Lekin is model mein hum yeh track nahi kar sakte directly.
    //
    // Simplest correct approach: 
    // Owner (sender) ka unread kabhi nahi badhta — 
    // kyunki yeh conversation SIRF owner ki hai (owner: req.user._id)
    // Dusri taraf contact ka unread separately track nahi ho raha is model mein.
    //
    // Isliye: sendMessage pe unreadCount increment BILKUL MAT KARO
    // Sirf tab increment karo jab INCOMING message aaye (contact ne bheja ho)

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text:     text || (type === "voice" ? "🎤 Voice message" : "📎 File"),
        type,
        sentAt:   new Date(),
        senderId: req.user._id,
      },
      // ✅ unreadCount increment NAHI — sender khud bhej raha hai
      // unreadCount sirf tab badhega jab incoming message aayega
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation-${conversationId}`).emit("new-message", {
        message,
        conversationId,
      });
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/messages/conversation ─────────────────────────────────────────
// Naya conversation start karo (ya existing dhundho)
const getOrCreateConversation = async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: "contactId required hai" });
    }

    // Contact verify karo
    const contact = await Contact.findOne({
      _id:   contactId,
      owner: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

    // Existing conversation dhundho — nahi mila toh banao
    let conversation = await Conversation.findOne({
      owner:   req.user._id,
      contact: contactId,
    }).populate("contact", "name phone avatar");

    if (!conversation) {
      conversation = await Conversation.create({
        owner:   req.user._id,
        contact: contactId,
      });
      await conversation.populate("contact", "name phone avatar");
    }

    res.json({
      success:      true,
      conversation,
    });
  } catch (err) {
    console.error("getOrCreateConversation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/messages/:conversationId/message/:messageId ─────────────────
// Message delete karo
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findOne({
      _id:    messageId,
      sender: req.user._id, // sirf apna message delete kar sakte hain
    });

    if (!message) {
      return res.status(404).json({ message: "Message nahi mila" });
    }

    // Soft delete — text hata do
    message.isDeleted = true;
    message.text      = "";
    message.audioUrl  = null;
    await message.save();

    // Socket.io se notify karo
    const io = req.app.get("io");
    if (io) {
      io.to(`conversation-${message.conversation}`).emit("message-deleted", {
        messageId,
        conversationId: message.conversation,
      });
    }

    res.json({ success: true, message: "Message delete ho gaya" });
  } catch (err) {
    console.error("deleteMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  getOrCreateConversation,
  deleteMessage,
};