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

const inMemoryStore = {
  contacts: [],
  orders: [],
};

let databaseAvailable = false;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    message: "Coffee API is running.",
    endpoints: [
      "/api/health",
      "/api/contact",
      "/api/orders",
    ],
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

let databaseConnection;

async function connectDatabase() {
  if (!MONGO_URI) {
    console.warn("MONGO_URI not configured; falling back to in-memory storage.");
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (!databaseConnection) {
    databaseConnection = mongoose.connect(MONGO_URI, {
      serverApi: {
        version: "1",
        strict: true,
        deprecationErrors: true,
      },
    }).catch((error) => {
      databaseConnection = undefined;
      throw error;
    });
  }

  await databaseConnection;
  return true;
}

app.use(async (_req, _res, next) => {
  try {
    databaseAvailable = await connectDatabase();
  } catch (error) {
    console.warn("MongoDB unavailable; using in-memory storage for development.", error.message);
    databaseAvailable = false;
  }

  next();
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  try {
    if (databaseAvailable) {
      const contact = new Contact({ name, email, message });
      await contact.save();
      return res.status(201).json({ message: "Contact saved successfully." });
    }

    inMemoryStore.contacts.push({ name, email, message, createdAt: new Date().toISOString() });
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
    if (databaseAvailable) {
      const order = new Order({ name, email, drink, dessert, snack, notes });
      await order.save();
      return res.status(201).json({ message: "Order saved successfully.", order });
    }

    const order = { name, email, drink, dessert, snack, notes, createdAt: new Date().toISOString() };
    inMemoryStore.orders.push(order);
    return res.status(201).json({ message: "Order saved successfully.", order });
  } catch (error) {
    console.error("Order save error:", error);
    return res.status(500).json({ error: "Unable to save order at this time." });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    if (!databaseAvailable) {
      return res.status(200).json({ orders: inMemoryStore.orders });
    }

    const orders = await Order.find().sort({ createdAt: -1 });
    return res.status(200).json({ orders });
  } catch (error) {
    console.error("Order fetch error:", error);
    return res.status(500).json({ error: "Unable to fetch orders at this time." });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }

  console.error("Unhandled server error:", error);
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
