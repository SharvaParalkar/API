const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure Multer for up to 5 STL uploads, 100MB max per file
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({
  storage,
  limits: {
    files: 5,
    fileSize: 100 * 1024 * 1024, // 100MB per file
  },
});

// Parse filament cost from .gcode
function parseGcodeCost(gcodePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(gcodePath, "utf8", (err, data) => {
      if (err) return reject(err);
      const lines = data.split("\n");
      for (let line of lines) {
        if (line.toLowerCase().startsWith("; filament cost =")) {
          const cost = line.split("=")[1].trim();
          return resolve(cost);
        }
      }
      reject("Filament cost not found in G-code.");
    });
  });
}

// Slice STL using PrusaSlicer CLI
async function sliceAndEstimate(stlPath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(stlPath, ".stl");
    const outputPath = `C:\\Users\\admin\\Downloads\\test_output\\${fileName}.gcode`;
    const logPath = path.join(__dirname, "logs", `${fileName}-log.txt`);
    const outputDir = path.dirname(outputPath);

    const slicerPath = `C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe`;
    const configPath = `C:\\Users\\admin\\Downloads\\API\\STL-UPLOADER\\config.ini`;

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(path.join(__dirname, "logs")))
      fs.mkdirSync(path.join(__dirname, "logs"));

    const args = [
      "--load",
      configPath,
      "--center",
      "500,500",
      "--output",
      outputPath,
      "--slice",
      "--loglevel=5",
      stlPath,
    ];

    const start = Date.now();
    const slicer = spawn(slicerPath, args);

    let stdout = "";
    let stderr = "";

    slicer.stdout.on("data", (data) => (stdout += data.toString()));
    slicer.stderr.on("data", (data) => (stderr += data.toString()));

    slicer.on("close", async (code) => {
      const durationMs = Date.now() - start;

      const fullLog = `--- STDOUT ---\n${stdout}\n\n--- STDERR ---\n${stderr}`;
      fs.writeFileSync(logPath, fullLog, "utf8");

      // Keep max 20 logs
      const logsDir = path.join(__dirname, "logs");
      const allLogs = fs
        .readdirSync(logsDir)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => ({
          file: f,
          time: fs.statSync(path.join(logsDir, f)).mtime,
        }))
        .sort((a, b) => a.time - b.time);

      if (allLogs.length > 20) {
        const toDelete = allLogs.slice(0, allLogs.length - 20);
        for (const log of toDelete) {
          try {
            fs.unlinkSync(path.join(logsDir, log.file));
            console.log(`🗑️ Removed old log: ${log.file}`);
          } catch (err) {
            console.error("⚠️ Failed to remove old log:", err);
          }
        }
      }

      if (code !== 0 || !fs.existsSync(outputPath)) {
        console.error("❌ Slicing failed:", stderr || "No G-code generated.");
        return reject(`Slicing failed. Time taken: ${durationMs}ms`);
      }

      try {
        const cost = await parseGcodeCost(outputPath);
        resolve({ outputPath, cost, durationMs, logPath });
      } catch (err) {
        reject("Slicing succeeded, but filament cost not found.");
      }
    });
  });
}

// Serve /stl frontend (HTML form)
app.use("/stl", express.static(path.join(__dirname, "public")));

// Handle multiple STL uploads
app.post("/stl/upload", upload.array("stl", 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send("No files uploaded.");
  }

  const responses = [];

  for (const file of req.files) {
    const stlPath = path.join(__dirname, "uploads", file.filename);
    let gcodePath = null;

    try {
      const result = await sliceAndEstimate(stlPath);
      gcodePath = result.outputPath;

      if (parseFloat(result.cost) === 0) {
        throw new Error("Estimated price is $0 — error slicing file.");
      }

      responses.push({
        file: file.originalname,
        gcode: result.outputPath,
        price: result.cost,
        timeMs: result.durationMs,
        status: "success",
      });
    } catch (err) {
      responses.push({
        file: file.originalname,
        error: err.toString(),
        status: "error",
      });
    } finally {
      try {
        if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);
        if (gcodePath && fs.existsSync(gcodePath)) fs.unlinkSync(gcodePath);
        console.log(`🗑️ Deleted: ${file.filename} and G-code`);
      } catch (err) {
        console.error("⚠️ Cleanup failed:", err);
      }
    }
  }

  res.json({ results: responses });
});

// Redirect root to /stl
app.get("/", (req, res) => {
  res.redirect("/stl");
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
