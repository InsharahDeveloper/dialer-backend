// src/models/Contact.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    // Har contact kisi ek user ka hota hai
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    name:       { type: String, required: true, trim: true },
    phone:      { type: String, required: true, trim: true },
    email:      { type: String, default: "", trim: true, lowercase: true },
    company:    { type: String, default: "", trim: true },
    role:       { type: String, default: "", trim: true },
    location:   { type: String, default: "", trim: true },
    avatar:     { type: String, default: null },
    isFavorite: { type: Boolean, default: false },
    notes:      { type: String, default: "" },
  },
  { timestamps: true }
);

// Ek user ke contacts mein phone duplicate na ho
ContactSchema.index({ owner: 1, phone: 1 }, { unique: true });

// Frontend ke liye path field virtual
ContactSchema.virtual("path").get(function () {
  return `/contacts/${this._id}`;
});

ContactSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Contact", ContactSchema);
