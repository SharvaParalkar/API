const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Only serve index.html on /stl
app.use('/stl', express.static(path.join(__dirname, 'public')));

// Only accept uploads on /stl/upload
app.post('/stl/upload', upload.single('stl'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.send('STL file uploaded successfully.');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
