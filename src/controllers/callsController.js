// src/controllers/callsController.js

const Call    = require("../models/Call");
const Contact = require("../models/Contact");

// ─── GET /api/calls ───────────────────────────────────────────────────────────
const getCalls = async (req, res) => {
  try {
    const { direction, status, limit = 50 } = req.query;

    const filter = { owner: req.user._id };

    if (direction) filter.direction = direction; // incoming / outgoing
    if (status)    filter.status    = status;    // completed / missed / rejected

    const calls = await Call.find(filter)
      .sort({ createdAt: -1 })          // newest first
      .limit(Number(limit))
      .populate("contact", "name phone avatar"); // contact ka naam bhi aayega

    res.json({
      success: true,
      count:   calls.length,
      calls,
    });
  } catch (err) {
    console.error("getCalls error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/calls ──────────────────────────────────────────────────────────
// Jab call ho — log save karo
const createCall = async (req, res) => {
  try {
    const {
      direction,
      status,
      from,
      to,
      duration,
      twilioCallSid,
      recordingUrl,
      contactId,
    } = req.body;

    // Validation
    if (!direction || !from || !to) {
      return res.status(400).json({ message: "direction, from aur to required hain" });
    }

    // Agar contactId diya hai toh verify karo
    let contact = null;
    if (contactId) {
      contact = await Contact.findOne({ _id: contactId, owner: req.user._id });
    }

    // Agar contactId nahi diya — phone number se dhundho
    if (!contact) {
      const phoneToSearch = direction === "incoming" ? from : to;
      contact = await Contact.findOne({ owner: req.user._id, phone: phoneToSearch });
    }

    const call = await Call.create({
      owner:         req.user._id,
      contact:       contact?._id || null,
      direction,
      status:        status       || "completed",
      from,
      to,
      duration:      duration     || 0,
      twilioCallSid: twilioCallSid || "",
      recordingUrl:  recordingUrl  || null,
      startedAt: duration ? new Date(Date.now() - duration * 1000) : new Date(),
      endedAt:   duration ? new Date() : null,
    });

    // Populate karke return karo
    await call.populate("contact", "name phone avatar");

    res.status(201).json({
      success: true,
      message: "Call log save ho gaya",
      call,
    });
  } catch (err) {
    console.error("createCall error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/calls/:id ───────────────────────────────────────────────────────
const getCall = async (req, res) => {
  try {
    const call = await Call.findOne({
      _id:   req.params.id,
      owner: req.user._id,
    }).populate("contact", "name phone email avatar");

    if (!call) {
      return res.status(404).json({ message: "Call nahi mila" });
    }

    res.json({ success: true, call });
  } catch (err) {
    console.error("getCall error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/calls/:id ────────────────────────────────────────────────────
const deleteCall = async (req, res) => {
  try {
    const call = await Call.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user._id,
    });

    if (!call) {
      return res.status(404).json({ message: "Call nahi mila" });
    }

    res.json({ success: true, message: "Call delete ho gaya" });
  } catch (err) {
    console.error("deleteCall error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/calls ────────────────────────────────────────────────────────
// Poori call history clear karo
const clearCallHistory = async (req, res) => {
  try {
    const result = await Call.deleteMany({ owner: req.user._id });

    res.json({
      success: true,
      message: `${result.deletedCount} calls delete ho gayi`,
    });
  } catch (err) {
    console.error("clearCallHistory error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getCalls,
  createCall,
  getCall,
  deleteCall,
  clearCallHistory,
};