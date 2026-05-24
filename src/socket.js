
// src/socket.js

const { Server } = require("socket.io");
const jwt        = require("jsonwebtoken");
const User       = require("./models/User");

// ─── Connected users track ────────────────────────────────────────────────────
// { userId: [socketId1, socketId2] }
const connectedUsers = new Map();

const getUserSockets = (userId) => connectedUsers.get(String(userId)) || [];

// Kisi bhi user ko event bhejo — chahe kitne tabs khule hon
const emitToUser = (io, userId, event, data) => {
  const socketIds = getUserSockets(userId);
  socketIds.forEach((sid) => io.to(sid).emit(event, data));
};

// ─── Main setup ───────────────────────────────────────────────────────────────
const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin:      process.env.CLIENT_URL,
      methods:     ["GET", "POST"],
      credentials: true,
    },
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  // Har connection pe token verify — bina token ke connect nahi hoga
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) return next(new Error("Token required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("User nahi mila"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId   = String(socket.user._id);
    const userName = socket.user.name;

    console.log(`🟢 Connected: ${userName} (${socket.id})`);

    // Connected list mein add karo
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, []);
    connectedUsers.get(userId).push(socket.id);

    // Apni personal room mein join karo
    socket.join(`user-${userId}`);

    // Online status broadcast
    socket.broadcast.emit("user-online", { userId, name: userName });

    // ── CONTACT ROOM ─────────────────────────────────────────────────────────
    // Jab user kisi contact ki chat/voicemail screen kholta hai
    // socket.on("join-contact", (contactId) => {
    //   socket.join(`contact-${contactId}`);
    //   console.log(`📁 ${userName} → contact-${contactId}`);
    // });

    // socket.on("leave-contact", (contactId) => {
    //   socket.leave(`contact-${contactId}`);
    // });

    // ── CONVERSATION ROOM ─────────────────────────────────────────────────────
    // Messages aur voicemails dono is room se jaate hain
    socket.on("join-conversation", (conversationId) => {
      socket.join(`conversation-${conversationId}`);
      console.log(`💬 ${userName} → conversation-${conversationId}`);
    });

    socket.on("leave-conversation", (conversationId) => {
      socket.leave(`conversation-${conversationId}`);
    });

    // ── TYPING ───────────────────────────────────────────────────────────────
    socket.on("typing-start", ({ conversationId }) => {
      socket.to(`conversation-${conversationId}`).emit("user-typing", {
        userId,
        name: userName,
        conversationId,
      });
    });

    socket.on("typing-stop", ({ conversationId }) => {
      socket.to(`conversation-${conversationId}`).emit("user-stopped-typing", {
        userId,
        conversationId,
      });
    });

    // ── VOICEMAIL RECORDING STATUS ────────────────────────────────────────────
    // Sender recording kar raha hai — receiver ko dikhao "recording..."
    socket.on("voicemail-recording-start", ({ conversationId }) => {
      socket.to(`conversation-${conversationId}`).emit("user-recording", {
        userId,
        name: userName,
        conversationId,
      });
    });

    socket.on("voicemail-recording-stop", ({ conversationId }) => {
      socket.to(`conversation-${conversationId}`).emit("user-stopped-recording", {
        userId,
        conversationId,
      });
    });

    // ── CALL EVENTS ──────────────────────────────────────────────────────────
    socket.on("call-incoming", ({ toUserId, from, contactId }) => {
      emitToUser(io, toUserId, "call-ringing", {
        from,
        contactId,
        callerName: userName,
        callerId:   userId,
      });
    });

    socket.on("call-answered", ({ toUserId, contactId }) => {
      emitToUser(io, toUserId, "call-connected", { contactId });
    });

    socket.on("call-ended", ({ toUserId, contactId, duration }) => {
      emitToUser(io, toUserId, "call-disconnected", { contactId, duration });
    });

    socket.on("call-rejected", ({ toUserId, contactId }) => {
      emitToUser(io, toUserId, "call-missed", { contactId });
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`🔴 Disconnected: ${userName} (${socket.id})`);

      const sockets = connectedUsers.get(userId) || [];
      const updated = sockets.filter((id) => id !== socket.id);

      if (updated.length === 0) {
        connectedUsers.delete(userId);
        socket.broadcast.emit("user-offline", { userId, name: userName });
      } else {
        connectedUsers.set(userId, updated);
      }
    });
  });

  return io;
};

module.exports = { setupSocket, emitToUser, connectedUsers };