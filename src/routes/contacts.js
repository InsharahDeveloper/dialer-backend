// src/routes/contacts.js

const express = require("express");
const router  = express.Router();

const {
  getContacts,
  createContact,
  getContact,
  updateContact,
  deleteContact,
  toggleFavorite,
} = require("../controllers/contactsController");

const { protect } = require("../middleware/auth");

// Sab routes protected hain — token required
router.use(protect);

router.get("/",            getContacts);
router.post("/",           createContact);
router.get("/:id",         getContact);
router.put("/:id",         updateContact);
router.delete("/:id",      deleteContact);
router.patch("/:id/favorite", toggleFavorite);

module.exports = router;
