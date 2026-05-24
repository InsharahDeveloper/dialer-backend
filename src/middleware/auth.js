// src/middleware/auth.js
// Har protected route pe yeh middleware lagega
// Token verify karega aur req.user set karega

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    // 1. Header se token nikalo
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Login required" });
    }

    const token = authHeader.split(" ")[1];

    // 2. Token verify karo
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. User DB se nikalo (password exclude)
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 4. req.user set karo — aage routes mein use hoga
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired, please login again" });
    }
    res.status(500).json({ message: "Auth error" });
  }
};

module.exports = { protect };
