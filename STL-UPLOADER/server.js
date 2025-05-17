const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Slice STL with PrusaSlicer
function sliceAndEstimate(stlPath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(stlPath, '.stl');
    const outputPath = `C:\\Users\\sharv\\Downloads\\test_output\\${fileName}.gcode`;
    const slicerPath = `"C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe"`;
    const configPath = `"C:\\Users\\sharv\\Downloads\\config.ini"`;

    const cmd = `${slicerPath} --load ${configPath} --output "${outputPath}" --slice "${stlPath}"`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error || !fs.existsSync(outputPath)) {
        console.error('❌ Slicing error or no G-code output found:');
        console.error(stderr || 'Missing .gcode file');
        return reject('Slicing failed — invalid STL or unsupported geometry.');
      }

      try {
        const cost = await parseGcodeCost(outputPath);
        resolve({ outputPath, cost });
      } catch (err) {
        reject('Slicing succeeded, but cost info was missing.');
      }
    });
  });
}



// Extract filament cost from .gcode
function parseGcodeCost(gcodePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(gcodePath, 'utf8', (err, data) => {
      if (err) return reject(err);
      const lines = data.split('\n');
      for (let line of lines) {
        if (line.toLowerCase().startsWith('; filament cost =')) {
          const cost = line.split('=')[1].trim();
          return resolve(cost);
        }
      }
      reject('Filament cost not found in G-code.');
    });
  });
}

// Serve /stl static folder (e.g. index.html)
app.use('/stl', express.static(path.join(__dirname, 'public')));

// Handle uploads to /stl/upload
app.post('/stl/upload', upload.single('stl'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  try {
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const result = await sliceAndEstimate(filePath);

    res.json({
      status: 'success',
      file: req.file.filename,
      gcode: result.outputPath,
      price: result.cost
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

// Optional: redirect root to /stl
app.get('/', (req, res) => {
  res.redirect('/stl');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
