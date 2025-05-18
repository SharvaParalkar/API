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

// Serve the order lookup HTML
app.get("/status", (req, res) => {
  res.sendFile(path.join(__dirname, "statuschecker.html"));
});

// Initialize DB if not already present
if (!fs.existsSync(dbPath)) {
  const dbInit = new Database(dbPath);
  const schema = fs.readFileSync(schemaPath, "utf-8");
  dbInit.exec(schema);
  dbInit.close();
  console.log("Database initialized.");
}

const db = new Database(dbPath);

// Health check endpoint
app.get("/dbo/health", (req, res) => {
  res.json({ status: "OK", db: !!db });
});

// Insert test order
app.post("/dbo/test-order", (req, res) => {
  const id = "order_" + Date.now();
  const stmt = db.prepare(`
    INSERT INTO orders (
      id, name, email, phone, submitted_at, status,
      assigned_staff, est_price, assigned_price, payment_status, notes
    ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    "Test User",
    "test@example.com",
    "1234567890",
    "Submitted",
    "Pablo",
    14.50,
    null,
    "unpaid",
    "Sample test order"
  );
  res.json({ success: true, order_id: id });
});

// Secure order lookup by email or phone
app.get("/dbo/status", (req, res) => {
  const { email, phone } = req.query;

  if (!email && !phone) {
    return res.status(400).json({ error: "Email or phone required" });
  }

  let query = "SELECT * FROM orders WHERE ";
  const values = [];

  if (email && !phone) {
    query += "LOWER(email) = LOWER(?)";
    values.push(email.trim());
  } else if (phone && !email) {
    const cleanedPhone = phone.replace(/\D/g, "").slice(-10);
    query += `
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', ''), ')', ''), '+', '') = ?
    `;
    values.push(cleanedPhone);
  } else {
    return res.status(400).json({ error: "Only email or phone should be used, not both." });
  }

  const rows = db.prepare(query).all(...values);
  const safeData = rows.map(({ id, name, status, est_price, submitted_at, assigned_staff, payment_status }) => ({
    id,
    name,
    status,
    est_price,
    submitted_at,
    assigned_staff,
    payment_status,
  }));

  res.json(safeData);
});

// Route: /status/lookup/:query (email or phone)
app.get("/status/lookup/:query", (req, res) => {
  const query = req.params.query;
  if (!query) return res.status(400).json({ error: "Missing query parameter." });

  let sql = "";
  let value = "";

  if (query.includes("@")) {
    sql = "SELECT * FROM orders WHERE LOWER(email) = LOWER(?)";
    value = query.trim();
  } else {
    const cleanedPhone = query.replace(/\D/g, "").slice(-10);
    sql = `
      SELECT * FROM orders WHERE 
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', ''), ')', ''), '+', '') = ?
    `;
    value = cleanedPhone;
  }

  const rows = db.prepare(sql).all(value);
  const safeData = rows.map(({ id, name, status, est_price, submitted_at, assigned_staff, payment_status }) => ({
    id,
    name,
    status,
    est_price,
    submitted_at,
    assigned_staff,
    payment_status,
  }));

  res.json(safeData);
});


// Admin view: get all orders
app.get("/dbo/orders", (req, res) => {
  const rows = db.prepare("SELECT * FROM orders").all();
  res.json(rows);
});

// Launch server
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`FilamentBros DB API listening on port ${PORT}`);
});
