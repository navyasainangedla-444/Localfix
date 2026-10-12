require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("./models");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  const old = await User.find({ email: /@evava\.test$/ });
  let changed = 0, removed = 0;
  for (const u of old) {
    const newEmail = u.email.replace("@localfix.test", "@localfix.test");
    if (await User.exists({ email: newEmail })) {
      await User.deleteOne({ _id: u._id });
      removed++;
    } else {
      u.email = newEmail;
      await u.save();
      changed++;
    }
  }
  console.log("Emails changed: " + changed + ", duplicates removed: " + removed);
  const rows = await User.find({ role: { $in: ["provider", "admin"] } }).select("email role");
  rows.forEach((u) => console.log(u.role + ": " + u.email));
  process.exit(0);
})();