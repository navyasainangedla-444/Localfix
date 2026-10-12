require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Provider, User, Booking } = require("./models");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env. Add a long random text, then restart.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Razorpay is optional: without keys, only "Pay after service" works.
const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    : null;

// Demo payments: a fake payment screen for demos when there are no Razorpay keys. Never enable this for real customers.
const DEMO = !razorpay && process.env.DEMO_PAYMENTS === "true";

const TIMES = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const PHONE = /^[6-9]\d{9}$/;
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // India time
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next); // sends async errors to the error handler

// ---------- Auth helpers ----------
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role });

function auth(roles) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : "";
      const d = jwt.verify(token, JWT_SECRET);
      const u = await User.findById(d.id);
      if (!u) throw new Error("no user");
      if (roles && !roles.includes(u.role)) return res.status(403).json({ error: "Not allowed for this account" });
      req.user = u;
      next();
    } catch (e) {
      res.status(401).json({ error: "Please log in" });
    }
  };
}

// ---------- Auth routes ----------
app.post("/api/auth/signup", wrap(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\s/g, "");
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (await User.findOne({ email })) return res.status(409).json({ error: "This email is already registered. Please log in." });
  try {
    const u = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 10), role: "customer" });
    res.status(201).json({ token: sign(u), user: pub(u) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "This email is already registered. Please log in." });
    throw err;
  }
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const u = await User.findOne({ email });
  const ok = u && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: sign(u), user: pub(u) });
}));

app.get("/api/auth/me", auth(), (req, res) => res.json({ user: pub(req.user) }));

// ---------- Public routes ----------
app.get("/api/providers", wrap(async (req, res) => {
  res.json(await Provider.find().sort({ rating: -1 }));
}));

app.get("/api/slots", wrap(async (req, res) => {
  const { provider, date } = req.query;
  if (!isId(provider) || !date) return res.status(400).json({ error: "provider and date are required" });
  const rows = await Booking.find({ provider, date, status: "confirmed" }).select("time");
  res.json(rows.map((b) => b.time));
}));

// ---------- Customer routes ----------
app.post("/api/bookings", auth(["customer"]), wrap(async (req, res) => {
  const { provider, name, phone, date, time, address, note } = req.body;
  if (!isId(provider)) return res.status(400).json({ error: "Invalid provider" });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Enter your name." });
  if (!PHONE.test(phone || "")) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
  if (!date || date < today()) return res.status(400).json({ error: "Choose today or a future date." });
  if (!TIMES.includes(time)) return res.status(400).json({ error: "Choose a valid time slot." });
  if (!address || address.trim().length < 5) return res.status(400).json({ error: "Enter the full address for the visit." });

  const p = await Provider.findById(provider);
  if (!p) return res.status(404).json({ error: "Provider not found" });

  try {
    const booking = await Booking.create({
      user: req.user._id,
      provider: p._id,
      providerName: p.name,
      svc: p.svc,
      price: p.price,
      name: name.trim(),
      phone,
      date,
      time,
      address: address.trim(),
      note: (note || "").trim(),
      paymentMethod: req.body.paymentMethod === "online" ? "online" : "cash",
    });
    res.status(201).json(booking);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "That time slot was just booked. Pick another." });
    throw err;
  }
}));

app.get("/api/bookings", auth(["customer"]), wrap(async (req, res) => {
  res.json(await Booking.find({ user: req.user._id }).sort({ createdAt: -1 }));
}));

app.patch("/api/bookings/:id/cancel", auth(["customer"]), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid booking" });
  const b = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!b) return res.status(404).json({ error: "Booking not found" });
  if (b.status !== "confirmed") return res.status(400).json({ error: "Only confirmed bookings can be cancelled" });
  if (b.paymentStatus === "paid" && !razorpay && DEMO) {
    b.paymentStatus = "refunded"; // demo payments: no real money, just mark it refunded
  } else if (b.paymentStatus === "paid" && razorpay) {
    try {
      await razorpay.payments.refund(b.razorpayPaymentId, { amount: b.price * 100 });
      b.paymentStatus = "refunded";
    } catch (err) {
      console.error(err);
      return res.status(502).json({ error: "Refund failed. Booking not cancelled. Try again." });
    }
  }
  b.status = "cancelled";
  await b.save();
  res.json(b);
}));

// ---------- Payments (Razorpay) ----------
// Step 1: server creates an order. The amount comes from the database, never from the browser.
app.post("/api/payments/order", auth(["customer"]), wrap(async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: "Online payment is not set up on the server." });
  const { bookingId } = req.body;
  if (!isId(bookingId)) return res.status(400).json({ error: "Invalid booking" });
  const b = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!b || b.status !== "confirmed") return res.status(404).json({ error: "Booking not found" });
  if (b.paymentStatus === "paid") return res.status(400).json({ error: "Already paid" });
  try {
    const order = await razorpay.orders.create({ amount: b.price * 100, currency: "INR", receipt: String(b._id) });
    b.razorpayOrderId = order.id;
    await b.save();
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not start payment. Try again." });
  }
}));

// Step 2: after the customer pays, the server checks Razorpay's signature before marking it paid.
app.post("/api/payments/verify", auth(["customer"]), wrap(async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: "Online payment is not set up on the server." });
  const { bookingId } = req.body;
  const orderId = String(req.body.razorpay_order_id || "");
  const paymentId = String(req.body.razorpay_payment_id || "");
  const signature = String(req.body.razorpay_signature || "");
  if (!isId(bookingId) || !orderId || !paymentId || !signature) return res.status(400).json({ error: "Missing payment details" });
  const b = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!b || b.razorpayOrderId !== orderId) return res.status(404).json({ error: "Booking not found" });

  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(orderId + "|" + paymentId).digest("hex");
  const ok = expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!ok) return res.status(400).json({ error: "Payment verification failed" });

  b.paymentStatus = "paid";
  b.razorpayPaymentId = paymentId;
  await b.save();
  res.json(b);
}));

// ---------- Demo payments (only when DEMO_PAYMENTS=true and no Razorpay keys) ----------
app.get("/api/config", (req, res) => res.json({ demoPayments: DEMO, razorpay: !!razorpay }));

app.post("/api/payments/demo-pay", auth(["customer"]), wrap(async (req, res) => {
  if (!DEMO) return res.status(503).json({ error: "Demo payments are turned off." });
  const { bookingId } = req.body;
  if (!isId(bookingId)) return res.status(400).json({ error: "Invalid booking" });
  const b = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!b || b.status !== "confirmed") return res.status(404).json({ error: "Booking not found" });
  if (b.paymentStatus === "paid") return res.status(400).json({ error: "Already paid" });
  b.paymentStatus = "paid";
  b.razorpayOrderId = "demo_order_" + crypto.randomBytes(5).toString("hex");
  b.razorpayPaymentId = "demo_pay_" + crypto.randomBytes(5).toString("hex");
  await b.save();
  res.json(b);
}));

// ---------- Admin routes ----------
const CATS = ["Plumbing", "Electrical", "Cleaning", "Tutoring", "Salon", "Repairs", "Cooking"];

function providerFields(b) {
  const f = {
    name: String(b.name || "").trim(),
    cat: String(b.cat || ""),
    svc: String(b.svc || "").trim(),
    price: Number(b.price),
    unit: String(b.unit || "").trim() || "visit",
    area: String(b.area || "").trim(),
  };
  if (f.name.length < 2) return { error: "Enter the provider name." };
  if (!CATS.includes(f.cat)) return { error: "Choose a valid category." };
  if (f.svc.length < 3) return { error: "Describe the service." };
  if (!Number.isInteger(f.price) || f.price < 1 || f.price > 100000) return { error: "Enter a whole-number price in rupees." };
  return { f };
}

app.get("/api/admin/stats", auth(["admin"]), wrap(async (req, res) => {
  const [providers, customers, bookings, completed, paid] = await Promise.all([
    Provider.countDocuments(),
    User.countDocuments({ role: "customer" }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: "completed" }),
    Booking.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$price" } } }]),
  ]);
  res.json({ providers, customers, bookings, completed, revenue: paid[0] ? paid[0].total : 0 });
}));

app.get("/api/admin/providers", auth(["admin"]), wrap(async (req, res) => {
  const [ps, us] = await Promise.all([Provider.find().sort({ name: 1 }), User.find({ role: "provider" }).select("email provider")]);
  const emailBy = new Map(us.map((u) => [String(u.provider), u.email]));
  res.json(ps.map((p) => ({ ...p.toObject(), email: emailBy.get(String(p._id)) || "" })));
}));

app.post("/api/admin/providers", auth(["admin"]), wrap(async (req, res) => {
  const v = providerFields(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid login email for the provider." });
  if (password.length < 6) return res.status(400).json({ error: "Provider password must be at least 6 characters." });
  if (await User.findOne({ email })) return res.status(409).json({ error: "That email is already registered." });

  const p = await Provider.create({ ...v.f, ratingCount: 0 }); // new provider: first review sets the rating
  try {
    await User.create({ name: p.name, email, passwordHash: await bcrypt.hash(password, 10), role: "provider", provider: p._id });
  } catch (err) {
    await Provider.deleteOne({ _id: p._id });
    throw err;
  }
  res.status(201).json(p);
}));

app.patch("/api/admin/providers/:id", auth(["admin"]), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid provider" });
  const v = providerFields(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const p = await Provider.findByIdAndUpdate(req.params.id, v.f, { new: true });
  if (!p) return res.status(404).json({ error: "Provider not found" });
  await User.updateMany({ provider: p._id }, { name: p.name });
  res.json(p);
}));

app.delete("/api/admin/providers/:id", auth(["admin"]), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid provider" });
  if (await Booking.exists({ provider: req.params.id, status: "confirmed" })) {
    return res.status(409).json({ error: "This provider has upcoming confirmed bookings. Cancel or complete them first." });
  }
  await Provider.deleteOne({ _id: req.params.id });
  await User.deleteMany({ provider: req.params.id });
  res.json({ ok: true });
}));

// ---------- Reviews ----------
// Customer rates a completed booking (only once).
app.patch("/api/bookings/:id/review", auth(["customer"]), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid booking" });
  const stars = Number(req.body.rating);
  const text = String(req.body.review || "").trim().slice(0, 300);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5." });

  // Atomic: only a completed booking of this user that has no rating yet can be rated.
  const b = await Booking.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: "completed", rating: { $exists: false } },
    { $set: { rating: stars, review: text, reviewedAt: new Date() } },
    { new: true }
  );
  if (!b) return res.status(400).json({ error: "You can rate a service only once, after it is completed." });

  // New average = (old average x count + new stars) / (count + 1). Done inside MongoDB.
  const count = { $ifNull: ["$ratingCount", 10] };
  await Provider.updateOne({ _id: b.provider }, [
    {
      $set: {
        rating: { $round: [{ $divide: [{ $add: [{ $multiply: ["$rating", count] }, stars] }, { $add: [count, 1] }] }, 2] },
        ratingCount: { $add: [count, 1] },
      },
    },
  ]);
  res.json(b);
}));

// Latest reviews of a provider (public)
app.get("/api/providers/:id/reviews", wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid provider" });
  const rows = await Booking.find({ provider: req.params.id, rating: { $exists: true } })
    .sort({ reviewedAt: -1 })
    .limit(10)
    .select("name rating review reviewedAt");
  res.json(rows.map((r) => ({ name: r.name.split(" ")[0], rating: r.rating, review: r.review, date: r.reviewedAt })));
}));

// ---------- Provider dashboard routes ----------
app.get("/api/provider/bookings", auth(["provider"]), wrap(async (req, res) => {
  res.json(await Booking.find({ provider: req.user.provider }).sort({ date: 1, time: 1 }));
}));

app.patch("/api/provider/bookings/:id/complete", auth(["provider"]), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid booking" });
  const b = await Booking.findOne({ _id: req.params.id, provider: req.user.provider, status: "confirmed" });
  if (!b) return res.status(404).json({ error: "Booking not found" });
  b.status = "completed";
  if (b.paymentMethod === "cash") b.paymentStatus = "paid"; // cash collected after service
  await b.save();
  await Provider.updateOne({ _id: b.provider }, { $inc: { jobs: 1 } });
  res.json(b);
}));

// ---------- Errors and start ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Try again." });
});

const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/localfix")
  .then(() => app.listen(PORT, () => console.log("Localfix running at http://localhost:" + PORT)))
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
