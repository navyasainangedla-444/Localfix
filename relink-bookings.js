require("dotenv").config();
const mongoose = require("mongoose");
const { Provider, Booking } = require("./models");

// Connects old bookings to the current providers by provider name (needed after running seed.js again)
(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  const providers = await Provider.find();
  const byName = new Map(providers.map((p) => [p.name, p]));
  const validIds = new Set(providers.map((p) => String(p._id)));
  const bookings = await Booking.find();
  let fixed = 0, already = 0, skipped = 0;
  for (const b of bookings) {
    if (validIds.has(String(b.provider))) { already++; continue; }
    const p = byName.get(b.providerName);
    if (!p) { skipped++; continue; }
    try {
      await Booking.updateOne({ _id: b._id }, { $set: { provider: p._id } });
      fixed++;
    } catch (e) {
      skipped++; // same slot already booked for this provider
      console.log("Skipped (slot clash): " + b.providerName + " " + b.date + " " + b.time);
    }
  }
  console.log("Connected: " + fixed + " | already fine: " + already + " | skipped: " + skipped);
  process.exit(0);
})();
