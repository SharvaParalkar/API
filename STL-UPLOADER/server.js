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

// Parse filament cost from .gcode (test for git push)
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

// Auto-center STL (ASCII or binary)
function centerSTL(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, buffer) => {
      if (err) return reject("Failed to read STL");

      const isASCII = buffer.toString("utf8", 0, 256).includes("solid");
      if (isASCII) {
        const data = buffer.toString("utf8");
        const vertexRegex = /^vertex\s+([-\.\d]+)\s+([-\.\d]+)\s+([-\.\d]+)/gm;
        let match;
        const vertices = [];

        while ((match = vertexRegex.exec(data)) !== null) {
          vertices.push([parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])]);
        }

        if (vertices.length === 0) return reject("No vertices found in STL");

        const avg = [0, 0, 0];
        for (const v of vertices) {
          avg[0] += v[0];
          avg[1] += v[1];
          avg[2] += v[2];
        }
        avg[0] /= vertices.length;
        avg[1] /= vertices.length;
        avg[2] /= vertices.length;

        const centeredSTL = data.replace(vertexRegex, (_, x, y, z) => {
          return `vertex ${(parseFloat(x) - avg[0]).toFixed(6)} ${(parseFloat(y) - avg[1]).toFixed(6)} ${(parseFloat(z) - avg[2]).toFixed(6)}`;
        });

        return fs.writeFile(filePath, centeredSTL, "utf8", (err) => {
          if (err) return reject("Failed to write centered STL");
          resolve();
        });
      } else {
        console.warn(`⚠️ Binary STL detected: ${filePath}`);
        // Optional: Add binary STL recentering here if needed
        resolve();
      }
    });
  });
}

// Slice STL using PrusaSlicer CLI
async function sliceAndEstimate(stlPath) {
  return new Promise(async (resolve, reject) => {
    const fileName = path.basename(stlPath, ".stl");
    const outputPath = `C:\\Users\\sharv\\Downloads\\test_output\\${fileName}.gcode`;
    const outputDir = path.dirname(outputPath);

    const slicerPath = `C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe`;
    const configPath = `C:\\Users\\sharv\\Downloads\\Filabros\\API\\STL-UPLOADER\\config.ini`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      await centerSTL(stlPath);
    } catch (err) {
      return reject("❌ STL centering failed: " + err);
    }

    const cmd = `"${slicerPath}" --load "${configPath}" --center 500,500 --output "${outputPath}" --slice --info "${stlPath}"`;
    const start = Date.now();

    exec(cmd, async (error, stdout, stderr) => {
      const durationMs = Date.now() - start;

      if (error || !fs.existsSync(outputPath)) {
        console.error("❌ Slicing failed:");
        console.error(stderr || "No G-code generated.");
        return reject(`Slicing failed. Time taken: ${durationMs}ms`);
      }

      console.log(`✅ Slicing complete in ${durationMs}ms`);
      console.log(stdout);

      try {
        const cost = await parseGcodeCost(outputPath);
        resolve({ outputPath, cost, durationMs });
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

  try {
    const result = await sliceAndEstimate(stlPath);

    res.json({
      status: "success",
      file: req.file.filename,
      gcode: result.outputPath,
      price: result.cost,
      timeMs: result.durationMs,
    });

    // 🔁 After response is sent, delete files
    res.on("finish", () => {
      try {
        if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);
        if (fs.existsSync(result.outputPath)) fs.unlinkSync(result.outputPath);
        console.log(`🗑️ Deleted: ${req.file.filename} and its G-code`);
      } catch (err) {
        console.error("⚠️ File deletion failed:", err);
      }
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
