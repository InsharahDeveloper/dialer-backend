// src/routes/messages.js

const express = require("express");
const router  = express.Router();

const {
  getConversations,
  getMessages,
  sendMessage,
  getOrCreateConversation,
  deleteMessage,
} = require("../controllers/messagesController");

const { protect } = require("../middleware/auth");

router.use(protect); // sab protected

// Conversations
router.get("/",             getConversations);       // GET  /api/messages
router.post("/conversation",getOrCreateConversation);// POST /api/messages/conversation

// Messages
router.get("/:conversationId",           getMessages);  // GET  /api/messages/:id
router.post("/:conversationId",          sendMessage);  // POST /api/messages/:id
router.delete("/:conversationId/message/:messageId", deleteMessage); // DELETE

module.exports = router;