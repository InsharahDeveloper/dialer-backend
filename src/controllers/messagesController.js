// src/controllers/messagesController.js
const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const Contact      = require("../models/Contact");

// ─── GET /api/messages ────────────────────────────────────────────────────────
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ owner: req.user._id })
      .populate("contact", "name phone avatar")
      .sort({ "lastMessage.sentAt": -1 });

    res.json({
      success: true,
      count:   conversations.length,
      conversations,
    });
  } catch (err) {
    console.error("getConversations error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/messages/:conversationId ───────────────────────────────────────
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await Conversation.findOne({
      _id:   conversationId,
      owner: req.user._id,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation nahi mili" });
    }

    // Messages load karo
    const messages = await Message.find({ conversation: conversationId })
      .populate("sender",  "name avatar")
      .populate("replyTo", "text sender type")
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // ✅ Improvement 1: sirf agar unread messages hain to mark read + reset unreadCount
    const unreadMessages = await Message.countDocuments({
      conversation: conversationId,
      readBy: { $nin: [req.user._id] },
    });

    if (unreadMessages > 0) {
      await Message.updateMany(
        {
          conversation: conversationId,
          readBy: { $nin: [req.user._id] },
        },
        { $addToSet: { readBy: req.user._id } }
      );

      // Agar unreadCount pehle se 0 nahi hai to reset karo
      if (conversation.unreadCount > 0) {
        await Conversation.findByIdAndUpdate(conversationId, { unreadCount: 0 });
      }
    }

    res.json({
      success: true,
      count:   messages.length,
      conversation,
      messages,
    });
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

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
      text:          text || "",
      type,
      audioUrl:      audioUrl || null,
      audioDuration: audioDuration || 0,
      replyTo:       replyTo || null,
      readBy:        [req.user._id],
    });

    await message.populate("sender", "name avatar");
    await message.populate("replyTo", "text sender type");

    // Last message update (unreadCount nahi badhana kyunki sender khud hai)
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text:     text || (type === "voice" ? "🎤 Voice message" : "📎 File"),
        type,
        sentAt:   new Date(),
        senderId: req.user._id,
      },
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
const getOrCreateConversation = async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: "contactId required hai" });
    }

    const contact = await Contact.findOne({
      _id:   contactId,
      owner: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

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

    res.json({ success: true, conversation });
  } catch (err) {
    console.error("getOrCreateConversation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/messages/:conversationId/message/:messageId ─────────────────
// ✅ Improvement 2: Delete ke baad lastMessage update karo agar yehi last tha
const deleteMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    // Verify message belongs to user and conversation
    const message = await Message.findOne({
      _id:    messageId,
      sender: req.user._id,
      conversation: conversationId,
    });

    if (!message) {
      return res.status(404).json({ message: "Message nahi mila" });
    }

    // Soft delete
    message.isDeleted = true;
    message.text      = "";
    message.audioUrl  = null;
    await message.save();

    // Check if this was the last message in the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      owner: req.user._id,
    });

    if (conversation && conversation.lastMessage) {
      // Find the most recent non-deleted message in this conversation
      const lastActiveMessage = await Message.findOne({
        conversation: conversationId,
        isDeleted: false,
      }).sort({ createdAt: -1 });

      if (lastActiveMessage) {
        // Update lastMessage with the new latest message
        let previewText = lastActiveMessage.text;
        if (!previewText && lastActiveMessage.type === "voice") previewText = "🎤 Voice message";
        else if (!previewText) previewText = "📎 File";

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text:     previewText,
            type:     lastActiveMessage.type,
            sentAt:   lastActiveMessage.createdAt,
            senderId: lastActiveMessage.sender,
          },
        });
      } else {
        // No messages left – clear lastMessage
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text:     "",
            type:     "text",
            sentAt:   null,
            senderId: null,
          },
        });
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation-${conversationId}`).emit("message-deleted", {
        messageId,
        conversationId,
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