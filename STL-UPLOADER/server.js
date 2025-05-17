const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

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

// Slice STL using PrusaSlicer CLI
async function sliceAndEstimate(stlPath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(stlPath, ".stl");
    const outputPath = `C:\\Users\\sharv\\Downloads\\test_output\\${fileName}.gcode`;
    const outputDir = path.dirname(outputPath);

    const slicerPath = `C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe`;
    const configPath = `C:\\Users\\sharv\\Downloads\\config.ini`;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const cmd = `"${slicerPath}" --load "${configPath}" --center 85,85 --output "${outputPath}" --slice --info "${stlPath}"`;

    const start = Date.now(); // ⏱️ Start timer

    exec(cmd, async (error, stdout, stderr) => {
      const durationMs = Date.now() - start; // ⏱️ End timer

      if (error || !fs.existsSync(outputPath)) {
        console.error("❌ Slicing failed:");
        console.error(stderr || "No G-code generated.");
        return reject(
          `Slicing failed — please check your STL file and slicer configuration. Time taken: ${durationMs}ms`
        );
      }

      console.log(`✅ Slicing complete in ${durationMs}ms`);
      console.log(stdout);

      try {
        const cost = await parseGcodeCost(outputPath);
        resolve({ outputPath, cost, durationMs });
      } catch (err) {
        reject(
          "Slicing succeeded, but filament cost line was not found in the G-code."
        );
      }
    });
  });
}

// Serve /stl frontend (HTML form)
app.use("/stl", express.static(path.join(__dirname, "public")));

// Handle STL upload and slicing
app.post("/stl/upload", upload.single("stl"), async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  try {
    const filePath = path.join(__dirname, "uploads", req.file.filename);
    const result = await sliceAndEstimate(filePath);

    res.json({
      status: "success",
      file: req.file.filename,
      gcode: result.outputPath,
      price: result.cost,
      timeMs: result.durationMs, // ✅ send timing info to frontend
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.toString() });
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
