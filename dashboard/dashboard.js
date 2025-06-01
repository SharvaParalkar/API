const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const session = require("express-session");
const helmet = require("helmet");
const http = require('http');
const { Server } = require('socket.io');
const sharedsession = require('express-socket.io-session');

// Constants and Database setup
const STLS_DIR = "C:/Users/Admin/Downloads/API/Order-Form/STLS";
const dbPath = path.join(__dirname, "../DB/db/filamentbros.sqlite");

// Database connection with better error handling
let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  console.log('✅ Database connected successfully');
} catch (err) {
  console.error('❌ Database connection failed:', err);
  process.exit(1);
}

// ✅ CORS config
const allowedOrigins = ["https://filamentbros.com", "https://api.filamentbros.com"];

const app = express();
const server = http.createServer(app);

// ✅ Sessions config with better security
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "filamentbros-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  },
});

app.use(sessionMiddleware);

// Initialize Socket.IO with CORS and session sharing
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  },
  allowEIO3: true
});

// Share session with socket.io
io.use(sharedsession(sessionMiddleware, {
  autoSave: true
}));

// Socket.io authentication middleware
io.use((socket, next) => {
  if (socket.handshake.session.user) {
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  const username = socket.handshake.session.user;
  console.log(`🔌 WebSocket client connected: ${username}`);

  // Join a room for this user
  socket.join(`user_${username}`);

  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket client disconnected: ${username}`);
  });

  // Handle status updates from clients
  socket.on('status-update', async (data) => {
    try {
      const { orderId, status } = data;
      console.log(`📥 Received status update from ${username} for order ${orderId}: ${status}`);
      
      const stmt = db.prepare("UPDATE orders SET status = ? WHERE id = ?");
      const result = stmt.run(status, orderId);
      
      if (result.changes > 0) {
        const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
        if (updatedOrder) {
          // Broadcast to all clients
          io.emit('order-updated', {
            type: 'status-update',
            data: updatedOrder,
            timestamp: new Date().toISOString(),
            updatedBy: username
          });
          console.log(`📢 Broadcasted order update to all clients for ${orderId}`);
        }
      }
    } catch (err) {
      console.error('❌ Failed to process status update:', err);
      socket.emit('update-error', {
        orderId,
        error: 'Failed to update status'
      });
    }
  });
});

// Broadcast updates to all connected clients
function broadcastOrderUpdate(orderId) {
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (order) {
      io.emit('order-updated', {
        type: 'order-update',
        data: order,
        timestamp: new Date().toISOString()
      });
      console.log(`📢 Broadcasting update for order ${orderId}`);
    }
  } catch (err) {
    console.error('❌ Failed to broadcast order update:', err);
  }
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: false
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    console.log("🌐 Incoming origin:", origin);
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("❌ Rejected CORS origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// Body parsers with size limits
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// 🔒 Users (consider moving to environment variables or database)
const USERS = {
  sharva: "filbros8532",
  pablo: "print123",
  peter: "print123",
  nathan: "print123",
  evan: "print123",
};

// 🔐 Auth middleware with rate limiting
const loginAttempts = new Map();
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Rate limiting for login
function checkLoginRate(username) {
  const attempts = loginAttempts.get(username) || { count: 0, timestamp: Date.now() };
  const hourAgo = Date.now() - 3600000;
  
  if (attempts.timestamp < hourAgo) {
    loginAttempts.set(username, { count: 1, timestamp: Date.now() });
    return true;
  }
  
  if (attempts.count >= 5) return false;
  
  attempts.count++;
  loginAttempts.set(username, attempts);
  return true;
}

// 🧾 Login route with rate limiting
app.post("/dashboard/login", (req, res) => {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = (req.body.password || "").trim();
  
  if (!checkLoginRate(username)) {
    return res.status(429).json({ error: "Too many login attempts. Please try again later." });
  }

  const validPassword = USERS[username];

  if (validPassword && password === validPassword) {
    req.session.user = username;
    loginAttempts.delete(username);

    if (req.body.remember === "on") {
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
    }

    return res.sendStatus(200);
  }

  return res.status(401).json({ error: "Invalid username or password" });
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
    const { showOld, showCompleted } = req.query;
    let query = "SELECT * FROM orders";
    const params = [];
    const conditions = [];

    // Only fetch completed orders if explicitly requested
    if (showCompleted !== 'true') {
      conditions.push("(status IS NULL OR LOWER(status) != 'completed')");
    }

    // Only fetch old orders if explicitly requested
    if (showOld !== 'true') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      conditions.push("submitted_at > ?");
      params.push(oneWeekAgo.toISOString());
    }

    // Add conditions to query if any exist
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY submitted_at DESC";

    console.log('📊 Executing query:', query, 'with params:', params);
    const rows = db.prepare(query).all(...params);
    console.log(`📦 Fetched ${rows.length} orders`);
    
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

// 💵 Update price with WebSocket broadcast
app.post("/dashboard/update-price", requireLogin, (req, res) => {
  const { orderId, est_price } = req.body;
  try {
    const stmt = db.prepare("UPDATE orders SET est_price = ? WHERE id = ?");
    stmt.run(est_price, orderId);
    broadcastOrderUpdate(orderId);
    res.status(200).send("Updated estimate.");
  } catch (err) {
    console.error("❌ Failed to update est_price:", err.message);
    res.status(500).send("Failed to update.");
  }
});

// 📝 Update notes with WebSocket broadcast
app.post("/dashboard/update-notes", requireLogin, (req, res) => {
  const { orderId, order_notes } = req.body;
  try {
    const stmt = db.prepare("UPDATE orders SET order_notes = ? WHERE id = ?");
    stmt.run(order_notes, orderId);
    broadcastOrderUpdate(orderId);
    res.status(200).send("Updated staff notes.");
  } catch (err) {
    console.error("❌ Failed to update staff notes:", err.message);
    res.status(500).send("Failed to update notes.");
  }
});

// 🔄 Update status with WebSocket broadcast
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
    
    // Enhanced broadcast with immediate confirmation
    broadcastOrderUpdate(orderId);
    console.log(`✅ Status updated and broadcast for order ${orderId}`);
    
    res.json({ 
      success: true,
      message: `Status updated to ${status}`,
      timestamp: new Date().toISOString()
    });
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Closing server...');
  db.close();
  process.exit(0);
});

// ✅ Launch with health check
const PORT = process.env.PORT || 3300;
server.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
