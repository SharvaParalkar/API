const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "db", "filamentbros.sqlite");
const schemaPath = path.join(__dirname, "schema.sql");

// Initialize DB from schema if it doesn't exist
if (!fs.existsSync(dbPath)) {
  const dbInit = new Database(dbPath);
  const schema = fs.readFileSync(schemaPath, "utf-8");
  dbInit.exec(schema);
  dbInit.close();
  console.log("Database initialized.");
}

// Open the DB for app usage
const db = new Database(dbPath);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", db: !!db });
});

// Insert a test order
app.post("/test-order", (req, res) => {
  const id = "order_" + Date.now();
  const stmt = db.prepare(`
    INSERT INTO orders (
      id, name, email, phone, submitted_at, status,
      assigned_staff, est_price, payment_status, notes
    ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    "Test User",
    "test@example.com",
    "1234567890",
    "Submitted",
    "Pablo",
    14.50,
    "unpaid",
    "Sample test order"
  );
  res.json({ success: true, order_id: id });
});

// List all orders
app.get("/orders", (req, res) => {
  const rows = db.prepare("SELECT * FROM orders").all();
  res.json(rows);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FilamentBros API listening on port ${PORT}`);
});
