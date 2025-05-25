const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = path.join(__dirname, "../DB/db/filamentbros.sqlite"); // Adjust path if needed
const db = new Database(dbPath);

// Serve dashboard HTML
app.get(["/", "/dashboard", "/dashboard/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Serve order data as JSON
app.get("/dashboard/data", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders ORDER BY submitted_at DESC").all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = 3300;
app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});
