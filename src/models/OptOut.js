const mongoose = require("mongoose");

module.exports = mongoose.model("OptOut", new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  optedOut: { type: Boolean, default: true }
}, { timestamps: true }));
