// File: submit.js (run on port 3200)

const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
app.use(cors());

// Paths
const dbPath = "C:/Users/Admin/Downloads/API/DB/db/filamentbros.sqlite";
const db = new Database(dbPath);

// Upload directory
const uploadDir = "C:/Users/Admin/Downloads/API/Order-Form/STLS";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// --- PRE-Multer middleware to assign orderId ---
const assignOrderId = (req, res, next) => {
  req.orderId = `order_${Date.now()}`;
  next();
};

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    if (!req.orderId) return cb(new Error("orderId not set"));
    const sanitized = file.originalname.replace(/[^a-z0-9.\-_]/gi, "_");
    cb(null, `${req.orderId}-${sanitized}`);
  }
});
const upload = multer({
  storage,
  limits: { files: 5, fileSize: 100 * 1024 * 1024 },
});

// Route
app.post("/status/post", assignOrderId, upload.array("file", 5), (req, res) => {
  try {
    const { name, email, phone, notes } = req.body;
    const orderId = req.orderId;
    const submittedAt = new Date().toISOString();

    // Insert order
    db.prepare(`
      INSERT INTO orders (id, name, email, phone, submitted_at, status, notes)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?)
    `).run(orderId, name, email, phone, submittedAt, notes || "");

    // Insert each file
    for (const file of req.files) {
      db.prepare(`
        INSERT INTO files (id, order_id, filename, filepath)
        VALUES (?, ?, ?, ?)
      `).run(
        `${orderId}_${file.originalname}`,
        orderId,
        file.originalname,
        path.join(uploadDir, `${orderId}-${file.originalname}`)
      );
    }

    // Log analytics
    db.prepare(`
      INSERT INTO analytics (event_type, source_id, details)
      VALUES ('order_submission', ?, ?)
    `).run(orderId, JSON.stringify({ name, email, phone }));

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit order." });
  }
});

const PORT = 3200;
app.listen(PORT, () => {
  console.log(`Submission server running on port ${PORT}`);
});
