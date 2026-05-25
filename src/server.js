// src/server.js
require("dotenv").config();
const http      = require("http");
const express   = require("express");
const cors      = require("cors");
const connectDB = require("./config/db");
const { setupSocket } = require("./socket");

const app = express();

// ─── DB ───────────────────────────────────────────────────────────────────────
connectDB();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: [process.env.CLIENT_URL, /^https?:\/\/192\.168\./], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── REST Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/contacts",    require("./routes/contacts"));
app.use("/api/calls",       require("./routes/calls"));
app.use("/api/voice-mails", require("./routes/voiceMails"));
app.use("/api/messages",    require("./routes/messages"));   // ← NEW
app.use("/api/twilio",   require("./routes/twilio"));     // Phase 6

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  // Production mein minimal response
  if (process.env.NODE_ENV === "production") {
    return res.json({ status: "ok" });
  }


const connectedUsers = new Map(); // userId -> Set<socketId>
app.set("io", io);
app.set("connectedUsers", connectedUsers);

io.on("connection", (socket) => {
  const userId = socket.handshake.auth?.userId; // frontend se bhejna hai
  if (!userId) return socket.disconnect();

  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);

  socket.on("disconnect", () => {
    const set = connectedUsers.get(userId);
    if (set) { set.delete(socket.id); if (!set.size) connectedUsers.delete(userId); }
  });
});


  // Development mein detailed info
  res.json({
    status:    "ok",
    database:  "connected",
    realtime:  "socket.io active",
    routes: [
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET  /api/contacts",
      "GET  /api/calls",
      "GET  /api/voice-mails",
      "GET  /api/messages",
    ],
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ─── HTTP Server + Socket.io ──────────────────────────────────────────────────
const server = http.createServer(app);
const io     = setupSocket(server);
app.set("io", io); // controllers mein io use kar sakte hain

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server:    http://localhost:${PORT}`);
  console.log(`   REST API:  http://localhost:${PORT}/api`);
  console.log(`   Socket.io: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health\n`);
});