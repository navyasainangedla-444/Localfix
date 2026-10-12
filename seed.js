require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Provider, User, Booking } = require("./models");

const providers = [
  { name: "Ravi Kumar", cat: "Plumbing", svc: "Leak and tap repair", price: 350, unit: "visit", rating: 4.8, jobs: 212, area: "Powerpet" },
  { name: "Lakshmi Services", cat: "Cleaning", svc: "Full home deep clean", price: 1200, unit: "home", rating: 4.7, jobs: 164, area: "Ashok Nagar" },
  { name: "Suresh Electricals", cat: "Electrical", svc: "Fan, wiring and switchboards", price: 299, unit: "visit", rating: 4.6, jobs: 318, area: "Eluru Town" },
  { name: "Anitha Teacher", cat: "Tutoring", svc: "Maths and Science, class 6–10", price: 400, unit: "hour", rating: 4.9, jobs: 96, area: "R R Pet" },
  { name: "Glow Salon at Home", cat: "Salon", svc: "Haircut, facial and threading", price: 699, unit: "session", rating: 4.5, jobs: 141, area: "Kothapeta" },
  { name: "Mahesh Appliance Care", cat: "Repairs", svc: "Fridge, washing machine, AC", price: 450, unit: "visit", rating: 4.4, jobs: 187, area: "Srinivasa Nagar" },
  { name: "Padma's Kitchen", cat: "Cooking", svc: "Home cook for 4–6 people", price: 800, unit: "meal", rating: 4.8, jobs: 73, area: "Powerpet" },
  { name: "Kiran Plumbing Works", cat: "Plumbing", svc: "Bathroom fitting and pipelines", price: 500, unit: "visit", rating: 4.3, jobs: 88, area: "Ashok Nagar" },
  { name: "BrightSpark Electric", cat: "Electrical", svc: "Inverter and MCB installation", price: 599, unit: "visit", rating: 4.7, jobs: 121, area: "Kothapeta" },
  { name: "Sparkle Sofa Clean", cat: "Cleaning", svc: "Sofa and carpet shampoo", price: 650, unit: "item", rating: 4.2, jobs: 59, area: "Eluru Town" },
];

const DEMO_PASSWORD = "provider123";

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix");
  await Provider.deleteMany({});
  await User.deleteMany({ role: "provider" });
  const created = await Provider.insertMany(providers);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const logins = [];
  for (const p of created) {
    const email = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") + "@localfix.test";
    await User.create({ name: p.name, email, passwordHash: hash, role: "provider", provider: p._id });
    logins.push(email);
  }
  await Booking.syncIndexes();
  await User.syncIndexes();
  console.log("Seeded " + created.length + " providers");
  console.log("Provider demo logins (password: " + DEMO_PASSWORD + "):");
  logins.forEach((e) => console.log("  " + e));
  process.exit(0);
})();
