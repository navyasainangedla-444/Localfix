require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Provider } = require("./models");

const EMAIL = (process.argv[2] || "ravi.kumar@localfix.test").toLowerCase();
const PASS = process.argv[3] || "provider123";

(async () => {
  console.log("Database used:", process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  console.log("Providers:", await Provider.countDocuments(), "| Provider logins:", await User.countDocuments({ role: "provider" }));
  const all = await User.find().select("email role");
  all.forEach((u) => console.log("  " + u.role + ": " + u.email));

  const u = await User.findOne({ email: EMAIL });
  if (!u) console.log("RESULT 1: no account with email " + EMAIL);
  else console.log("RESULT 1: account found. Password matches:", await bcrypt.compare(PASS, u.passwordHash));

  try {
    const port = process.env.PORT || 3000;
    const r = await fetch("http://localhost:" + port + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    const d = await r.json();
    console.log("RESULT 2: running server answered", r.status, d.error || "LOGIN OK as " + d.user.role);
  } catch (e) {
    console.log("RESULT 2: server is not reachable:", e.message);
  }
  process.exit(0);
})();
