// src/controllers/contactsController.js

const Contact = require("../models/Contact");

// ─── GET /api/contacts ────────────────────────────────────────────────────────
// Sirf logged-in user ke contacts
const getContacts = async (req, res) => {
  try {
    const { search, favorite } = req.query;

    // Filter — sirf apne contacts
    const filter = { owner: req.user._id };

    // Search by name or phone
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Sirf favorites
    if (favorite === "true") {
      filter.isFavorite = true;
    }

    const contacts = await Contact.find(filter).sort({ name: 1 });

    res.json({
      success: true,
      count:   contacts.length,
      contacts,
    });
  } catch (err) {
    console.error("getContacts error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/contacts ───────────────────────────────────────────────────────
const createContact = async (req, res) => {
  try {
    const { name, phone, email, company, role, location, isFavorite, notes } = req.body;

    // Validation
    if (!name || !phone) {
      return res.status(400).json({ message: "Name aur phone required hain" });
    }

    // Duplicate phone check — same user ke liye
    const existing = await Contact.findOne({ owner: req.user._id, phone });
    if (existing) {
      return res.status(400).json({ message: "Yeh phone number already exist karta hai" });
    }

    const contact = await Contact.create({
      owner: req.user._id,
      name,
      phone,
      email:      email      || "",
      company:    company    || "",
      role:       role       || "",
      location:   location   || "",
      isFavorite: isFavorite || false,
      notes:      notes      || "",
    });

    res.status(201).json({
      success: true,
      message: "Contact create ho gaya",
      contact,
    });
  } catch (err) {
    console.error("createContact error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/contacts/:id ────────────────────────────────────────────────────
const getContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id:   req.params.id,
      owner: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

    res.json({ success: true, contact });
  } catch (err) {
    console.error("getContact error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PUT /api/contacts/:id ────────────────────────────────────────────────────
// ─── PUT /api/contacts/:id ────────────────────────────────────────────────────
// Improved with duplicate phone check
const updateContact = async (req, res) => {
  try {
    const { name, phone, email, company, role, location, isFavorite, notes } = req.body;

    // Pehle existing contact find karo (owner check already)
    const existingContact = await Contact.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!existingContact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

    // Agar phone number change ho raha hai, toh duplicate check karo
    if (phone && phone !== existingContact.phone) {
      const duplicate = await Contact.findOne({
        owner: req.user._id,
        phone: phone,
        _id: { $ne: req.params.id }, // current contact ke alawa
      });
      if (duplicate) {
        return res.status(400).json({ message: "Yeh phone number already exist karta hai" });
      }
    }

    // Ab update karo
    const updatedContact = await Contact.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { name, phone, email, company, role, location, isFavorite, notes },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Contact update ho gaya",
      contact: updatedContact,
    });
  } catch (err) {
    console.error("updateContact error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// ─── DELETE /api/contacts/:id ─────────────────────────────────────────────────
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

    res.json({
      success: true,
      message: "Contact delete ho gaya",
    });
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/contacts/:id/favorite ────────────────────────────────────────
const toggleFavorite = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id:   req.params.id,
      owner: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact nahi mila" });
    }

    contact.isFavorite = !contact.isFavorite;
    await contact.save();

    res.json({
      success:    true,
      message:    contact.isFavorite ? "Favorite mein add ho gaya" : "Favorite se remove ho gaya",
      isFavorite: contact.isFavorite,
      contact,
    });
  } catch (err) {
    console.error("toggleFavorite error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getContacts,
  createContact,
  getContact,
  updateContact,
  deleteContact,
  toggleFavorite,
};
