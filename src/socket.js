const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

// Online status tracking (optional)
const connectedUsers = new Map(); // userId -> Set of socketIds

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Token required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.user._id);
    const userName = socket.user.name;

    console.log(`🟢 Connected: ${userName} (${socket.id})`);

    // Store socket ID for online presence
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId).add(socket.id);

    // ✅ Join user-specific room for direct emits (used by twilioController)
    socket.join(`user:${userId}`);

    // Broadcast online status
    socket.broadcast.emit("user-online", { userId, name: userName });

    // Conversation rooms
    socket.on("join-conversation", (conversationId) => {
      socket.join(`conversation-${conversationId}`);
    });

    socket.on("leave-conversation", (conversationId) => {
      socket.leave(`conversation-${conversationId}`);
    });

    // Typing events
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

    // Voicemail recording events
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

    // Call events (for WebRTC calls, not Twilio)
    socket.on("call-incoming", ({ toUserId, from, contactId }) => {
      io.to(`user:${toUserId}`).emit("call-ringing", {
        from,
        contactId,
        callerName: userName,
        callerId: userId,
      });
    });

    socket.on("call-answered", ({ toUserId, contactId }) => {
      io.to(`user:${toUserId}`).emit("call-connected", { contactId });
    });

    socket.on("call-ended", ({ toUserId, contactId, duration }) => {
      io.to(`user:${toUserId}`).emit("call-disconnected", { contactId, duration });
    });

    socket.on("call-rejected", ({ toUserId, contactId }) => {
      io.to(`user:${toUserId}`).emit("call-missed", { contactId });
    });

    socket.on("disconnect", () => {
      console.log(`🔴 Disconnected: ${userName} (${socket.id})`);
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(userId);
          socket.broadcast.emit("user-offline", { userId, name: userName });
        }
      }
    });
  });

  return io;
};

// Optional helper to get online status of a user
const isUserOnline = (userId) => connectedUsers.has(String(userId));

module.exports = { setupSocket, isUserOnline };