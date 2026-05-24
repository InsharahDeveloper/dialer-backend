// src/routes/calls.js

const express = require("express");
const router  = express.Router();

const {
  getCalls,
  createCall,
  getCall,
  deleteCall,
  clearCallHistory,
} = require("../controllers/callsController");

const { protect } = require("../middleware/auth");

// Sab routes protected
router.use(protect);

router.get("/",      getCalls);         // GET  /api/calls
router.post("/",     createCall);       // POST /api/calls
router.delete("/history", clearCallHistory); // DELETE /api/calls/history — clear all
router.get("/:id",   getCall);          // GET  /api/calls/:id
router.delete("/:id", deleteCall);       // DELETE /api/calls/:id

module.exports = router;