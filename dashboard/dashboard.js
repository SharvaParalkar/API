const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const session = require("express-session");
const helmet = require("helmet");
const http = require('http');

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
const allowedOrigins = [
  "https://filamentbros.com", 
  "https://api.filamentbros.com", 
  "http://localhost:3300",
  /^https:\/\/.*\.filamentbros\.com$/  // Allow all subdomains
];

const app = express();
const server = http.createServer(app);

// ✅ Sessions config with better security
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "filamentbros-secret",
  resave: true,
  saveUninitialized: true,
  name: 'filamentbros.sid',
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: false, // Set to true in production
    httpOnly: true,
    sameSite: 'lax'
  },
  store: new session.MemoryStore() // Explicit memory store for testing
});

// Apply session middleware to Express
app.use(sessionMiddleware);

// Security headers with adjusted CSP
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
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

// CORS middleware with credentials
app.use(cors({
  origin: (origin, callback) => {
    console.log("🌐 Incoming origin:", origin);
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn("❌ Rejected CORS origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
    const { showOld, showCompleted, showClaimed } = req.query;
    const username = req.session.user;
    let query = "SELECT * FROM orders";
    const params = [];
    const conditions = [];

    // Filter for claimed orders tab
    if (showClaimed === 'true') {
      conditions.push("claimed_by = ? AND assigned_staff = ? AND (status IS NULL OR LOWER(status) != 'completed')");
      params.push(username, username);
    }

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

// Add after the express app creation but before routes
const clients = new Set();

// SSE endpoint for order updates
app.get('/dashboard/updates', requireLogin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial heartbeat
  res.write('event: heartbeat\ndata: connected\n\n');
  
  // Add client to the set
  clients.add(res);
  
  // Remove client when connection closes
  req.on('close', () => {
    clients.delete(res);
  });
});

// Helper function to broadcast updates to all connected clients
function broadcastUpdate(eventType, data) {
  const eventData = JSON.stringify(data);
  clients.forEach(client => {
    client.write(`event: ${eventType}\ndata: ${eventData}\n\n`);
  });
}

// 🔄 Update status
app.post("/dashboard/update-status", requireLogin, (req, res) => {
  const { orderId, status } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  console.log('📝 Status update request:', { orderId, status, username });

  if (!orderId || !status) {
    console.warn('❌ Missing required fields:', { orderId, status });
    return res.status(400).json({ error: "Missing orderId or status" });
  }

  if (!username) {
    console.warn('❌ No user in session');
    return res.status(401).json({ error: "No user in session" });
  }

  // Validate status
  const validStatuses = ["pending", "pre print", "printing", "printing pay later", "completed"];
  if (!validStatuses.includes(status.toLowerCase())) {
    console.warn('❌ Invalid status:', status);
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    // Start a transaction
    const transaction = db.transaction(() => {
      // Update the order - handle case where last_updated might not exist
      const updateStmt = db.prepare(`
        UPDATE orders 
        SET status = ?,
            updated_by = ?,
            last_updated = COALESCE(?, last_updated)
        WHERE id = ?
      `);
      const result = updateStmt.run(status, username, timestamp, orderId);
      
      if (result.changes === 0) {
        throw new Error("Order not found");
      }

      // Fetch the updated order
      const updatedOrder = db.prepare(`
        SELECT *,
               updated_by,
               COALESCE(last_updated, submitted_at) as last_updated
        FROM orders 
        WHERE id = ?
      `).get(orderId);

      if (!updatedOrder) {
        throw new Error("Failed to fetch updated order");
      }

      // Broadcast the update to all connected clients
      broadcastUpdate('orderUpdate', {
        type: 'status',
        order: updatedOrder
      });

      return updatedOrder;
    });

    // Execute the transaction
    const updatedOrder = transaction();
    
    console.log('✅ Status updated successfully:', {
      orderId,
      newStatus: status,
      updatedBy: username
    });

    res.json({ 
      success: true,
      order: updatedOrder,
      timestamp: timestamp
    });

  } catch (err) {
    console.error("❌ Failed to update status:", err.message);
    
    // Send appropriate error response
    if (err.message === "Order not found") {
      res.status(404).json({ error: "Order not found" });
    } else {
      res.status(500).json({ 
        error: "Database error",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
});

// 👥 Assign staff to order
app.post("/dashboard/assign-staff", requireLogin, (req, res) => {
  const { orderId, staffName } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  if (!orderId || !staffName) {
    return res.status(400).json({ error: "Missing orderId or staffName" });
  }

  try {
    const stmt = db.prepare("UPDATE orders SET assigned_staff = ?, updated_by = ?, last_updated = ? WHERE id = ?");
    const result = stmt.run(staffName, username, timestamp, orderId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Fetch updated order
    const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    
    // Broadcast the update
    broadcastUpdate('orderUpdate', {
      type: 'staff',
      order: updatedOrder
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Failed to assign staff:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 🎯 Claim order
app.post("/dashboard/claim", requireLogin, (req, res) => {
  const { orderId } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    // Check if already claimed by someone else
    const current = db.prepare("SELECT claimed_by, status FROM orders WHERE id = ?").get(orderId);
    
    // Don't allow claiming completed orders
    if (current?.status?.toLowerCase() === 'completed') {
      return res.status(400).json({ error: "Cannot claim completed orders" });
    }
    
    if (current && current.claimed_by && current.claimed_by !== username) {
      return res.status(409).json({ 
        error: "Order already claimed",
        claimedBy: current.claimed_by
      });
    }

    const stmt = db.prepare(`
      UPDATE orders 
      SET claimed_by = ?, 
          updated_by = ?, 
          last_updated = ?,
          assigned_staff = ?
      WHERE id = ?
    `);
    const result = stmt.run(username, username, timestamp, username, orderId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Fetch the updated order
    const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    
    // Broadcast the update
    broadcastUpdate('orderUpdate', {
      type: 'claim',
      order: updatedOrder
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Failed to claim order:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 🔓 Unclaim order
app.post("/dashboard/unclaim", requireLogin, (req, res) => {
  const { orderId } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    // Check if claimed by someone else
    const current = db.prepare("SELECT claimed_by, status FROM orders WHERE id = ?").get(orderId);
    
    // Don't allow unclaiming completed orders
    if (current?.status?.toLowerCase() === 'completed') {
      return res.status(400).json({ error: "Cannot unclaim completed orders" });
    }
    
    if (current && current.claimed_by && current.claimed_by !== username) {
      return res.status(403).json({ 
        error: "Cannot unclaim - order claimed by someone else",
        claimedBy: current.claimed_by
      });
    }

    const stmt = db.prepare(`
      UPDATE orders 
      SET claimed_by = NULL, 
          assigned_staff = NULL,
          updated_by = ?, 
          last_updated = ? 
      WHERE id = ? AND claimed_by = ?
    `);
    const result = stmt.run(username, timestamp, orderId, username);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found or not claimed by you" });
    }

    const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    broadcastUpdate('orderUpdate', {
      type: 'unclaim',
      order: updatedOrder
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Failed to unclaim order:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 📄 Serve dashboard HTML
app.get(["/dashboard", "/dashboard/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🧊 Serve static last
app.use(express.static(path.join(__dirname, "public")));

// Add endpoint to get staff list
app.get("/dashboard/staff", (req, res) => {
  // Only send usernames, not passwords
  const staffList = Object.keys(USERS).map(username => ({
    username,
    displayName: username.charAt(0).toUpperCase() + username.slice(1)
  }));
  res.json(staffList);
});

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
