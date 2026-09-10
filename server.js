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

app.get("/api/health", async (_req, res) => {
  await ensureDatabaseReady();
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

async function ensureDatabaseReady() {
  try {
    databaseAvailable = await connectDatabase();
    if (databaseAvailable) {
      console.log("MongoDB connected successfully.");
    }
    return databaseAvailable;
  } catch (error) {
    console.warn("MongoDB unavailable; using in-memory storage for development.", error.message);
    databaseAvailable = false;
    return false;
  }
}

app.use(async (_req, _res, next) => {
  await ensureDatabaseReady();
  next();
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  try {
    await ensureDatabaseReady();

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
  const { name, email, drink, dessert, snack, notes, items, paymentMethod } = req.body;
  const selectedItems = Array.isArray(items) && items.length > 0 ? items : [];
  const resolvedDrink = drink || (selectedItems[0] && selectedItems[0].name) || "";
  const resolvedDessert = dessert || "";
  const resolvedSnack = snack || "";

  if (!name || !email || (!resolvedDrink && selectedItems.length === 0)) {
    return res.status(400).json({ error: "Name, email, and at least one ordered item are required." });
  }

  try {
    await ensureDatabaseReady();

    const orderRecord = {
      name,
      email,
      drink: resolvedDrink,
      dessert: resolvedDessert,
      snack: resolvedSnack,
      notes: notes || (paymentMethod ? `Payment method: ${paymentMethod}` : ""),
      items: selectedItems,
      paymentMethod,
    };

    if (databaseAvailable) {
      const order = new Order(orderRecord);
      await order.save();
      return res.status(201).json({ message: "Order saved successfully.", order });
    }

    const order = { ...orderRecord, createdAt: new Date().toISOString() };
    inMemoryStore.orders.push(order);
    return res.status(201).json({ message: "Order saved successfully.", order });
  } catch (error) {
    console.error("Order save error:", error);
    return res.status(500).json({ error: "Unable to save order at this time." });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    await ensureDatabaseReady();

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

async function startServer() {
  await ensureDatabaseReady();
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = app;
