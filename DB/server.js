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
  const safeData = rows.map(({ id, name, status, est_price, assigned_price, submitted_at, assigned_staff, payment_status, notes, order_notes }) => ({
    id,
    name,
    status,
    est_price,
    assigned_price,
    submitted_at,
    assigned_staff,
    payment_status,
    notes: notes || '',
    order_notes: order_notes || ''
  }));

  res.json(safeData);
});

// Launch server
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`FilamentBros API listening on port ${PORT}`);
});
