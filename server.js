const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

const Contact = require("./models/Contact");
const Order = require("./models/Order");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let databaseConnection;

async function connectDatabase() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is required.");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!databaseConnection) {
    databaseConnection = mongoose.connect(MONGO_URI).catch((error) => {
      databaseConnection = undefined;
      throw error;
    });
  }

  await databaseConnection;
}

app.use(async (_req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    res.status(500).json({ error: "Database connection failed." });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  try {
    const contact = new Contact({ name, email, message });
    await contact.save();

    return res.status(201).json({ message: "Contact saved successfully." });
  } catch (error) {
    console.error("Contact save error:", error);
    return res.status(500).json({ error: "Unable to save contact at this time." });
  }
});

app.post("/api/orders", async (req, res) => {
  const { name, email, drink, dessert, snack, notes } = req.body;

  if (!name || !email || !drink) {
    return res.status(400).json({ error: "Name, email, and drink selection are required." });
  }

  try {
    const order = new Order({ name, email, drink, dessert, snack, notes });
    await order.save();

    return res.status(201).json({ message: "Order saved successfully.", order });
  } catch (error) {
    console.error("Order save error:", error);
    return res.status(500).json({ error: "Unable to save order at this time." });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.status(200).json({ orders });
  } catch (error) {
    console.error("Order fetch error:", error);
    return res.status(500).json({ error: "Unable to fetch orders at this time." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: "connected" });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
