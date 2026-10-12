require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User } = require("./models");

// Usage: node create-admin.js            -> admin@localfix.test / admin123
//        node create-admin.js a@b.com pw -> your own email and password
const email = (process.argv[2] || "admin@localfix.test").toLowerCase();
const password = process.argv[3] || "admin123";

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  await User.findOneAndUpdate(
    { email },
    {
      $set: { name: "Admin", email, passwordHash: await bcrypt.hash(password, 10), role: "admin" },
      $unset: { provider: "" },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  console.log("Admin ready. Login with: " + email + " / " + password);
  process.exit(0);
})();
