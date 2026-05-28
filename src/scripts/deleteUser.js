// Usage: node scripts/deleteUser.js <email>
require("dotenv").config();
const mongoose = require("mongoose");
const twilio = require("twilio");
const User = require("../models/User");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/deleteUser.js <email>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  // Clear webhooks (optional, but good practice)
  if (user.twilioPhoneSid) {
    try {
      await client.incomingPhoneNumbers(user.twilioPhoneSid).update({
        voiceUrl: "",        // or null; Twilio accepts empty string
        smsUrl: "",
        statusCallback: "",
      });
      console.log("📞 Number unhooked:", user.twilioNumber);
    } catch (e) {
      console.warn("⚠️ Twilio unhook failed (number may still have old webhooks):", e.message);
    }
  }

  await User.deleteOne({ _id: user._id });
  console.log("✅ Deleted user:", email);

  await mongoose.disconnect();  // optional cleanup
  process.exit(0);
})().catch((e) => { console.error("❌", e.message); process.exit(1); });