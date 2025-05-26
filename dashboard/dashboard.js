const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const fs = require("fs");
const STLS_DIR = "C:/Users/Admin/Downloads/API/Order-Form/STLS";


const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = path.join(__dirname, "../DB/db/filamentbros.sqlite"); // Adjust path if needed
const db = new Database(dbPath);

// Serve dashboard HTML
app.get(["/", "/dashboard", "/dashboard/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard/debug/path", (req, res) => {
  res.send(`Resolved path: ${STLS_DIR}`);
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

// Return list of STL file URLs for a given orderId
app.get("/dashboard/files/:orderId", (req, res) => {
  const orderId = req.params.orderId;
  try {
    const files = fs.readdirSync(STLS_DIR);
    const matchingFiles = files.filter(file => file.startsWith(orderId)); // ✅ Fixed
    const fileUrls = matchingFiles.map(file => `/dashboard/stl/${encodeURIComponent(file)}`);
    console.log("✅ Matched STL files for", orderId, "→", matchingFiles); // Optional log
    res.json(fileUrls);
  } catch (err) {
    console.error("❌ Error reading STL files:", err.message);
    res.status(500).json({ error: "Failed to read STL files" });
  }
});


// Serve STL files from STLS_DIR
app.use("/dashboard/fileserve", express.static(STLS_DIR, {
  setHeaders: (res) => {
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
}));

app.get("/dashboard/debug/files", (req, res) => {
  try {
    const files = fs.readdirSync(STLS_DIR);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const archiver = require("archiver");

app.get("/dashboard/download-all/:orderId", (req, res) => {
  const orderId = req.params.orderId;

  try {
    const files = fs.readdirSync(STLS_DIR);
    const matchingFiles = files.filter(file => file.startsWith(orderId));

    if (matchingFiles.length === 0) {
      return res.status(404).send("No STL files found for this order.");
    }

    res.setHeader("Content-Disposition", `attachment; filename="${orderId}.zip"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    matchingFiles.forEach(file => {
      const filePath = path.join(STLS_DIR, file);
      const cleanName = file.replace(/^order[_-]?[a-zA-Z0-9]+[_-]/i, ""); // Strip prefix
      archive.file(filePath, { name: cleanName });
    });

    archive.finalize();
  } catch (err) {
    console.error("❌ Failed to create ZIP:", err.message);
    res.status(500).send("Failed to generate ZIP.");
  }
});

const PORT = 3300;
app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});
