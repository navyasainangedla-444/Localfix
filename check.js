require("dotenv").config();
const mongoose = require("mongoose");
const { User, Booking } = require("./models");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  console.log("Total bookings:", await Booking.countDocuments());
  console.log("Provider logins:", await User.countDocuments({ role: "provider" }));
  const rows = await Booking.find().sort({ createdAt: -1 }).limit(10);
  for (const b of rows) {
    const pu = await User.findOne({ role: "provider", provider: b.provider });
    console.log(
      b.date + " " + b.time +
      " | customer: " + b.name +
      " | booked: " + b.providerName +
      " | provider login: " + (pu ? pu.email : "NO PROVIDER LOGIN") +
      " | status: " + b.status
    );
  }
  process.exit(0);
})();
