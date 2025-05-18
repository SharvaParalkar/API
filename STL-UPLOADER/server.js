const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure Multer for STL uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

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

// Slice STL using PrusaSlicer CLI (spawn version)
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

      // Write logs to file
      const fullLog = `--- STDOUT ---\n${stdout}\n\n--- STDERR ---\n${stderr}`;
      fs.writeFileSync(logPath, fullLog, "utf8");

      if (code !== 0 || !fs.existsSync(outputPath)) {
        console.error("❌ Slicing failed:");
        console.error(stderr || "No G-code generated.");
        return reject(`Slicing failed. Time taken: ${durationMs}ms`);
      }

      console.log(`✅ Slicing complete in ${durationMs}ms`);
      console.log(stdout);

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

// Handle STL upload and slicing
app.post("/stl/upload", upload.single("stl"), async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const stlPath = path.join(__dirname, "uploads", req.file.filename);
  let gcodePath = null;

  const scheduleDeletion = () => {
    setTimeout(() => {
      try {
        if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);
        if (gcodePath && fs.existsSync(gcodePath)) fs.unlinkSync(gcodePath);
        console.log(`⏲️ Timed delete: ${req.file.filename} and G-code`);
      } catch (err) {
        console.error("⚠️ Timed deletion failed:", err);
      }
    }, 2 * 60 * 1000); // 2 minutes
  };

  try {
    const result = await sliceAndEstimate(stlPath);
    gcodePath = result.outputPath;

    if (parseFloat(result.cost) === 0) {
      throw new Error("Estimated price is $0 — error slicing file.");
    }

    res.json({
      status: "success",
      file: req.file.filename,
      gcode: result.outputPath,
      price: result.cost,
      timeMs: result.durationMs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.toString() });
  } finally {
    // Always try to delete after response finishes
    res.on("finish", () => {
      try {
        if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);
        if (gcodePath && fs.existsSync(gcodePath)) fs.unlinkSync(gcodePath);
        console.log(`🗑️ Deleted: ${req.file.filename} and G-code`);
      } catch (err) {
        console.error("⚠️ Cleanup after finish failed:", err);
      }
    });

    // Schedule fallback deletion in case finish doesn't trigger
    scheduleDeletion();
  }
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
