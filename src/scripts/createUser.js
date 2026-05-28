// Usage: node scripts/createUser.js <email> <password> <name> <+1XXXXXXXXXX>
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const User = require("../models/User");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  const [, , email, password, name, phoneNumber] = process.argv;
  if (!email || !password || !name || !phoneNumber) {
    console.error("Usage: node scripts/createUser.js <email> <password> <name> <+1XXXXXXXXXX>");
    process.exit(1);
  }

  // Check PUBLIC_URL
  if (!process.env.PUBLIC_URL) {
    throw new Error("PUBLIC_URL not set in .env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  // Normalize phone number (remove spaces)
  const normalizedPhone = phoneNumber.trim();

  // 1. Check number exists in Twilio account
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: normalizedPhone, limit: 1 });
  if (!numbers.length) {
    throw new Error(`Number ${normalizedPhone} not found in your Twilio account. Buy it first.`);
  }
  const num = numbers[0];

  // 2. Duplicate check in DB
  const existing = await User.findOne({ twilioNumber: normalizedPhone });
  if (existing) throw new Error(`Number already assigned to ${existing.email}`);

  // 3. Update webhooks (✅ fixed statusCallback URL)
  await client.incomingPhoneNumbers(num.sid).update({
    voiceUrl: `${process.env.PUBLIC_URL}/api/twilio/incoming`,
    smsUrl: `${process.env.PUBLIC_URL}/api/twilio/sms-incoming`,
    statusCallback: `${process.env.PUBLIC_URL}/api/twilio/status`,  // ✅ fixed
  });

  // 4. Create user
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    password: hash,
    name,
    twilioNumber: num.phoneNumber,
    twilioPhoneSid: num.sid,
  });

  console.log("✅ User created:", user.email, "→", user.twilioNumber);
  await mongoose.disconnect();  // optional
  process.exit(0);
})().catch((e) => { console.error("❌", e.message); process.exit(1); });