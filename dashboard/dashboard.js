const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const session = require("express-session");

const app = express();

// ✅ CORS config
const allowedOrigins = ["https://filamentbros.com", "https://api.filamentbros.com"];

app.use(cors({
  origin: (origin, callback) => {
    console.log("🌐 Incoming origin:", origin); // 👈 add this
    if (!origin) return callback(null, true); // allow no-origin requests (like curl, Postman)

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("❌ Rejected CORS origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Sessions (must be before routes or static)
app.use(
  session({
    secret: "filamentbros-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

const STLS_DIR = "C:/Users/Admin/Downloads/API/Order-Form/STLS";
const dbPath = path.join(__dirname, "../DB/db/filamentbros.sqlite");
const db = new Database(dbPath);

// 🔒 Users
const USERS = {
  sharva: "filbros8532",
  pablo: "print123",
  peter: "print123",
  nathan: "print123",
  evan: "print123",
};

// 🔐 Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// 🧾 Login route
app.post("/dashboard/login", (req, res) => {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = (req.body.password || "").trim();
  const validPassword = USERS[username];

  if (validPassword && password === validPassword) {
    req.session.user = username;

    if (req.body.remember === "on") {
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
    }

    return res.sendStatus(200);
  }

  return res.status(401).send("Invalid username or password.");
});

// 🧠 Whoami
app.get("/dashboard/whoami", requireLogin, (req, res) => {
  res.json({ username: req.session.user });
});

// 🐞 Debug route
app.get("/dashboard/debug/cookies", (req, res) => {
  res.json({
    cookies: req.headers.cookie,
    sessionUser: req.session.user || null,
  });
});

// 🔐 Orders route
app.get("/dashboard/data", requireLogin, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders ORDER BY submitted_at DESC").all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 📁 STL list
app.get("/dashboard/files/:orderId", requireLogin, (req, res) => {
  const orderId = req.params.orderId;
  try {
    const files = fs.readdirSync(STLS_DIR);
    const matchingFiles = files.filter((file) => file.startsWith(orderId));
    const fileUrls = matchingFiles.map((file) => `/dashboard/fileserve/${encodeURIComponent(file)}`);
    res.json(fileUrls);
  } catch (err) {
    console.error("❌ Error reading STL files:", err.message);
    res.status(500).json({ error: "Failed to read STL files" });
  }
});

// 🗂 Serve STL
app.use(
  "/dashboard/fileserve",
  express.static(STLS_DIR, {
    setHeaders: (res) => {
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// 📦 Download ZIP
app.get("/dashboard/download-all/:orderId", requireLogin, (req, res) => {
  const orderId = req.params.orderId;
  try {
    const files = fs.readdirSync(STLS_DIR);
    const matchingFiles = files.filter((file) => file.startsWith(orderId));

    if (matchingFiles.length === 0) {
      return res.status(404).send("No STL files found for this order.");
    }

    res.setHeader("Content-Disposition", `attachment; filename="${orderId}.zip"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    matchingFiles.forEach((file) => {
      const filePath = path.join(STLS_DIR, file);
      const cleanName = file.replace(/^order[_-]?[a-zA-Z0-9]+[_-]/i, "");
      archive.file(filePath, { name: cleanName });
    });

    archive.finalize();
  } catch (err) {
    console.error("❌ Failed to create ZIP:", err.message);
    res.status(500).send("Failed to generate ZIP.");
  }
});

// 💵 Update price
app.post("/dashboard/update-price", requireLogin, (req, res) => {
  const { orderId, est_price } = req.body;
  try {
    const stmt = db.prepare("UPDATE orders SET est_price = ? WHERE id = ?");
    stmt.run(est_price, orderId);
    res.status(200).send("Updated estimate.");
  } catch (err) {
    console.error("❌ Failed to update est_price:", err.message);
    res.status(500).send("Failed to update.");
  }
});

// 📝 Update notes
app.post("/dashboard/update-notes", requireLogin, (req, res) => {
  const { orderId, order_notes } = req.body;
  try {
    const stmt = db.prepare("UPDATE orders SET order_notes = ? WHERE id = ?");
    stmt.run(order_notes, orderId);
    res.status(200).send("Updated staff notes.");
  } catch (err) {
    console.error("❌ Failed to update staff notes:", err.message);
    res.status(500).send("Failed to update notes.");
  }
});

// 🔄 Update status
app.post("/dashboard/update-status", requireLogin, (req, res) => {
  const { orderId, status } = req.body;
  if (!orderId || !status) {
    return res.status(400).json({ error: "Missing orderId or status" });
  }

  try {
    const stmt = db.prepare("UPDATE orders SET status = ? WHERE id = ?");
    const result = stmt.run(status, orderId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update status:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 📄 Serve dashboard HTML
app.get(["/dashboard", "/dashboard/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🧊 Serve static last
app.use(express.static(path.join(__dirname, "public")));

// ✅ Launch
const PORT = 3300;
app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});
