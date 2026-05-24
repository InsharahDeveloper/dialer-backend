// src/controllers/authController.js

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

// ─── Token generator helper ───────────────────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// TESTING ONLY — production mein disable ho jaayega
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email aur password required hain" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password minimum 6 characters ka hona chahiye" });
    }

    // Email already exists check
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Yeh email already registered hai" });
    }

    // User banao — password Model mein auto-hash hoga (bcrypt pre-save hook)
    const user = await User.create({
      name,
      email,
      password,
      phone: phone || "",
    });

    // Token generate karo
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email aur password required hain" });
    }

    // User dhundho — password bhi select karo (normally excluded hota hai)
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Email ya password galat hai" });
    }

    // Password check karo
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Email ya password galat hai" });
    }

    // Token generate karo
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Protected — token required
const getMe = async (req, res) => {
  try {
    // req.user auth middleware ne set kiya hai
    res.json({
      success: true,
      user: {
        id:        req.user._id,
        name:      req.user.name,
        email:     req.user.email,
        phone:     req.user.phone,
        createdAt: req.user.createdAt,
      },
    });
  } catch (err) {
    console.error("GetMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { register, login, getMe };
