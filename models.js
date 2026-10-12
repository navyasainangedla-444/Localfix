const mongoose = require("mongoose");

const providerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cat: { type: String, required: true },
  svc: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  unit: String,
  rating: { type: Number, default: 0 },
  jobs: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 10 }, // how many ratings the average is based on
  area: String,
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 2 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, match: /^[6-9]\d{9}$/ },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["customer", "provider", "admin"], default: "customer" },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider" }, // only for provider accounts
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: true },
    providerName: String,
    svc: String,
    price: Number,
    name: { type: String, required: true, minlength: 2 },
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // HH:MM
    address: { type: String, required: true, minlength: 5 },
    note: String,
    status: { type: String, enum: ["confirmed", "completed", "cancelled"], default: "confirmed" },
    paymentMethod: { type: String, enum: ["online", "cash"], default: "cash" },
    paymentStatus: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    rating: { type: Number, min: 1, max: 5 },
    review: String,
    reviewedAt: Date,
  },
  { timestamps: true }
);

// Database-level protection: one confirmed booking per provider, date and time.
bookingSchema.index(
  { provider: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);

module.exports = {
  Provider: mongoose.model("Provider", providerSchema),
  User: mongoose.model("User", userSchema),
  Booking: mongoose.model("Booking", bookingSchema),
};
