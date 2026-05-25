// Usage: node scripts/createUser.js <email> <password> <name> <+1XXXXXXXXXX>
// Example: node scripts/createUser.js ali@test.com pass123 "Ali Khan" +14155551234

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

  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Aapke Twilio account mein yeh number hona chahiye
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!numbers.length) {
    throw new Error(`Number ${phoneNumber} aapke Twilio account mein nahin mila. Pehle Twilio Console mein kharidain.`);
  }
  const num = numbers[0];

  // 2. Duplicate check — koi aur user yeh number to use nahin kar raha
  const existing = await User.findOne({ twilioNumber: phoneNumber });
  if (existing) throw new Error(`Number already assigned to ${existing.email}`);

  // 3. Webhooks update karo (taake calls/SMS aapke server par aayein)
  await client.incomingPhoneNumbers(num.sid).update({
    voiceUrl: `${process.env.PUBLIC_URL}/api/twilio/incoming`,
    smsUrl: `${process.env.PUBLIC_URL}/api/twilio/sms-incoming`,
    statusCallback: `${process.env.PUBLIC_URL}/api/twilio/call-status`,
  });

  // 4. User create
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    password: hash,
    name,
    twilioNumber: num.phoneNumber,
    twilioPhoneSid: num.sid,
  });

  console.log("✅ User created:", user.email, "→", user.twilioNumber);
  process.exit(0);
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
