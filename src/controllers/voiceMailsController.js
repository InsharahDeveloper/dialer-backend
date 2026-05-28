// src/controllers/voiceMailsController.js — Updated with Socket.io

const VoiceMail    = require("../models/VoiceMail");
const Contact      = require("../models/Contact");
const Conversation = require("../models/Conversation");

// ─── GET /api/voice-mails ─────────────────────────────────────────────────────
// Saari voicemails — ya per-contact filter
const getVoiceMails = async (req, res) => {
  try {
    const { status, contactId, limit = 50 } = req.query;

    const filter = { owner: req.user._id };
    if (status)    filter.status  = status;    // unread/read
    if (contactId) filter.contact = contactId; // per-contact filter ← KEY FEATURE

    const voiceMails = await VoiceMail.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate("contact",      "name phone avatar")
      .populate("fromUser",     "name avatar")
      .populate("conversation", "_id");

    const unreadCount = await VoiceMail.countDocuments({
      owner:  req.user._id,
      status: "unread",
      ...(contactId && { contact: contactId }),
    });

    res.json({
      success: true,
      count:   voiceMails.length,
      unreadCount,
      voiceMails,
    });
  } catch (err) {
    console.error("getVoiceMails error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/voice-mails ────────────────────────────────────────────────────
// Naya voicemail save + Socket.io se real-time notify
// ─── POST /api/voice-mails ────────────────────────────────────────────────────
// Naya voicemail save + Socket.io se real-time notify
const createVoiceMail = async (req, res) => {
  try {
    const {
      from,
      fromName,
      contactId,
      audioUrl,
      audioDuration,
      transcript,
      twilioCallSid,
      twilioRecordingSid,
    } = req.body;

    if (!from) {
      return res.status(400).json({ message: "from (phone number) required hai" });
    }

    // Contact lookup logic
    let contact = null;
    if (contactId) {
      contact = await Contact.findOne({ _id: contactId, owner: req.user._id });
      if (!contact) {
        return res.status(404).json({ message: "Contact not found with given contactId" });
      }
    } else {
      // No contactId provided: try to find by phone number
      contact = await Contact.findOne({ owner: req.user._id, phone: from });
    }

    // Conversation dhundho ya banao (per-contact thread)
    let conversation = null;
    if (contact) {
      conversation = await Conversation.findOne({
        owner:   req.user._id,
        contact: contact._id,
      });
      if (!conversation) {
        conversation = await Conversation.create({
          owner:   req.user._id,
          contact: contact._id,
        });
      }

      // Update conversation's lastMessage – sender is contact (null)
      await Conversation.findByIdAndUpdate(conversation._id, {
        lastMessage: {
          text:     `🎤 Voice message (${audioDuration || 0}s)`,
          type:     "voice",
          sentAt:   new Date(),
          senderId: null, // important: contact sent it, not the owner
        },
        // Increment unreadCount (new voicemail from contact)
        $inc: { unreadCount: 1 },
      });
    }

    // Create voicemail record – fromUser is null (caller is not a logged-in user)
    const voiceMail = await VoiceMail.create({
      owner:              req.user._id,
      contact:            contact?._id        || null,
      conversation:       conversation?._id   || null,
      from,
      fromName:           fromName            || contact?.name || from,
      fromUser:           null, // ← Fixed: external caller, not a user
      audioUrl:           audioUrl            || null,
      audioDuration:      audioDuration       || 0,
      transcript:         transcript          || "",
      twilioCallSid:      twilioCallSid       || "",
      twilioRecordingSid: twilioRecordingSid  || "",
      status:             "unread",
    });

    await voiceMail.populate("contact",  "name phone avatar");
    await voiceMail.populate("fromUser", "name avatar");

    // Socket.io real-time notifications
    const io = req.app.get("io");
    if (io) {
      if (conversation) {
        io.to(`conversation-${conversation._id}`).emit("new-voicemail", {
          voiceMail,
          conversationId: conversation._id,
        });
      }
      // Also emit to user's personal room for notification badge
      io.to(`user:${req.user._id}`).emit("voicemail-notification", {
        voiceMail,
        from: fromName || contact?.name || from,
        contactId: contact?._id,
      });
    }

    res.status(201).json({
      success:   true,
      message:   "Voice mail save ho gayi",
      voiceMail,
    });
  } catch (err) {
    console.error("createVoiceMail error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/voice-mails/:id ─────────────────────────────────────────────────
// Ek voicemail detail — auto read mark
const getVoiceMail = async (req, res) => {
  try {
    const voiceMail = await VoiceMail.findOne({
      _id:   req.params.id,
      owner: req.user._id,
    })
      .populate("contact",  "name phone email avatar")
      .populate("fromUser", "name avatar");

    if (!voiceMail) {
      return res.status(404).json({ message: "Voice mail nahi mili" });
    }

    // Auto read mark
    if (voiceMail.status === "unread") {
      voiceMail.status = "read";
      await voiceMail.save();

      // Socket se notify karo — unread count update ho
      const io = req.app.get("io");
      if (io && voiceMail.conversation) {
        io.to(`conversation-${voiceMail.conversation}`).emit("voicemail-read", {
          voiceMailId:    voiceMail._id,
          conversationId: voiceMail.conversation,
        });
      }
    }

    res.json({ success: true, voiceMail });
  } catch (err) {
    console.error("getVoiceMail error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/voice-mails/:id/played ───────────────────────────────────────
// Audio sun li — played mark karo
const markAsPlayed = async (req, res) => {
  try {
    const voiceMail = await VoiceMail.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { isPlayed: true, status: "read" },
      { new: true }
    );

    if (!voiceMail) {
      return res.status(404).json({ message: "Voice mail nahi mili" });
    }

    res.json({ success: true, message: "Played mark ho gayi", voiceMail });
  } catch (err) {
    console.error("markAsPlayed error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/voice-mails/read-all ─────────────────────────────────────────
const markAllAsRead = async (req, res) => {
  try {
    const { contactId } = req.query;

    const filter = { owner: req.user._id, status: "unread" };
    if (contactId) filter.contact = contactId;

    const result = await VoiceMail.updateMany(filter, { status: "read" });

    res.json({
      success: true,
      message: `${result.modifiedCount} voice mails read mark ho gayi`,
    });
  } catch (err) {
    console.error("markAllAsRead error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/voice-mails/:id ─────────────────────────────────────────────
const deleteVoiceMail = async (req, res) => {
  try {
    const voiceMail = await VoiceMail.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user._id,
    });

    if (!voiceMail) {
      return res.status(404).json({ message: "Voice mail nahi mili" });
    }

    // Socket se notify karo
    const io = req.app.get("io");
    if (io && voiceMail.conversation) {
      io.to(`conversation-${voiceMail.conversation}`).emit("voicemail-deleted", {
        voiceMailId:    voiceMail._id,
        conversationId: voiceMail.conversation,
      });
    }

    res.json({ success: true, message: "Voice mail delete ho gayi" });
  } catch (err) {
    console.error("deleteVoiceMail error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getVoiceMails,
  createVoiceMail,
  getVoiceMail,
  markAsPlayed,
  markAllAsRead,
  deleteVoiceMail,
};