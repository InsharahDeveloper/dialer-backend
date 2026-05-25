const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },

    // 🔑 Multi-tenant Twilio: each user owns a unique number
    twilioNumber:   { type: String, unique: true, sparse: true, index: true },
    twilioPhoneSid: { type: String, unique: true, sparse: true },

    role: { type: String, enum: ["admin", "agent"], default: "agent" },
    status: { type: String, enum: ["online", "offline", "busy"], default: "offline" },
    avatar: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
