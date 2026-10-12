require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Provider } = require("./models");

// Lists all provider/admin logins and resets every provider password to provider123
(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  const providers = await Provider.countDocuments();
  console.log("Providers in database: " + providers);
  if (providers === 0) {
    console.log("No providers found. Run:  node seed.js");
    process.exit(0);
  }
  const hash = await bcrypt.hash("provider123", 10);
  const r = await User.updateMany({ role: "provider" }, { $set: { passwordHash: hash } });
  console.log("Provider passwords reset to provider123: " + r.modifiedCount);
  const rows = await User.find({ role: { $in: ["provider", "admin"] } }).select("email role");
  rows.forEach((u) => console.log(u.role + ": " + u.email));
  process.exit(0);
})();
