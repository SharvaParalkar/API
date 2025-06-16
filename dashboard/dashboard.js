const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const session = require("express-session");
const helmet = require("helmet");
const http = require('http');
const webpush = require('web-push');

// VAPID keys - should be stored in environment variables
const vapidKeys = {
  publicKey: 'BLc8NFGoo-3SHvWUj7wn-UHS50TPWSCyYgx-uiYZhKTsXZDDa2unJcHNYAC09_ISi77ieRrPfOPxyYk2VQslPys',
  privateKey: '9gRW6FjXoyff49NDUHSiZ5puqh1JjpiI531Bl9pGmNY'
};

webpush.setVapidDetails(
  'mailto:contact@filamentbros.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Constants and Database setup
const STLS_DIR = "C:/Users/Admin/Downloads/API/Order-Form/STLS";
const dbPath = path.join(__dirname, "../DB/db/filamentbros.sqlite");

// Database connection with better error handling
let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // Initialize push subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Function to add a column if it doesn't exist
  function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    try {
      // Check if the column exists
      const column = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(tableName, columnName);
      if (!column) {
        console.log(`Adding column ${columnName} to ${tableName}...`);
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
        console.log(`✅ Column ${columnName} added successfully.`);
      }
    } catch (err) {
      console.error(`❌ Failed to add column ${columnName} to ${tableName}:`, err);
    }
  }

  // Add a column to track notification status for unclaimed orders
  addColumnIfNotExists('orders', 'unclaimed_notified', 'INTEGER DEFAULT 0');
  
  // Add a column to track which user each push subscription belongs to
  addColumnIfNotExists('push_subscriptions', 'username', 'TEXT');

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
  resave: false,
  saveUninitialized: false,
  name: 'filamentbros.sid',
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: false, // Set to true in production
    httpOnly: true,
    sameSite: 'lax'
  },
  store: new session.MemoryStore()
});

// Apply session middleware to both Express and raw HTTP server
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

//  Static file serving for PWA assets
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

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

// 📈 Analytics API
app.get("/dashboard/api/analytics/:metric", requireLogin, (req, res) => {
  const { metric } = req.params;
  const { timeframe = 'daily', staff = 'all' } = req.query;

  // Configuration for all available metrics
  const metricsConfig = {
    // Print Order Metrics
    'orders': { 
      table: 'orders', 
      agg: 'COUNT(id)' 
    },
    'revenue': { 
      table: 'orders', 
      agg: 'SUM(COALESCE(assigned_price, 0))' 
    },
    'filament-use-grams': { 
      table: 'orders', 
      agg: 'SUM(COALESCE(filament_grams, 0))',
      fallback: 'SUM(COALESCE(assigned_price, 0) / 0.03)' // Fallback calculation if filament_grams is not available
    },
    'cost-of-goods': { 
      table: 'orders', 
      agg: 'SUM(COALESCE(cost_of_goods, 0))',
      fallback: 'SUM((COALESCE(assigned_price, 0) / 0.03) * 0.012)' // Fallback calculation if cost_of_goods is not available
    },
    'expected-profit': { 
      table: 'orders', 
      agg: 'SUM(COALESCE(expected_profit, 0))',
      fallback: 'SUM((COALESCE(assigned_price, 0) / 0.03) * 0.018)' // Fallback calculation if expected_profit is not available
    },
    'orders-completed': { 
      table: 'orders', 
      agg: 'COUNT(id)', 
      where: `status = 'completed'` 
    },
    'average-order-value': { 
      table: 'orders', 
      agg: 'AVG(COALESCE(assigned_price, 0))', 
      where: `status = 'completed' AND COALESCE(assigned_price, 0) > 0` 
    },
    // Filament Sales Metrics
    'filament-sales-revenue': { 
      table: 'filament_orders', 
      agg: 'SUM(COALESCE(total_price, 0))' 
    },
    'filament-sales-order-volume': { 
      table: 'filament_orders', 
      agg: 'COUNT(id)' 
    },
    'filament-sales-profit': {
      table: 'filament_orders fo JOIN filament_inventory fi ON fo.inventory_id = fi.id',
      agg: 'SUM(COALESCE(fo.total_price, 0) - ( (fi.weight_grams / 1000.0) * fi.price_per_kg * fo.quantity) )',
      isJoin: true
    }
  };

  const metricConfig = metricsConfig[metric];

  if (!metricConfig) {
    return res.status(400).json({ error: "Invalid metric specified." });
  }

  const validTimeframes = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all-time'];
  if (!validTimeframes.includes(timeframe)) {
    return res.status(400).json({ error: "Invalid timeframe specified." });
  }

  // Use the correct date column depending on the table (for joins)
  const dateColumn = metricConfig.isJoin ? 'fo.submitted_at' : 'submitted_at';

  let dateGroup, dateFilter;
  const now = new Date();
  const params = [];
  const isAllTime = timeframe === 'all-time';

  if (isAllTime) {
    dateFilter = '1=1';
  } else {
    switch (timeframe) {
      case 'daily':
        dateGroup = `date(${dateColumn})`;
        dateFilter = `date(${dateColumn}) >= date('now', '-30 days')`;
        break;
      case 'weekly':
        dateGroup = `date(${dateColumn}, '-' || (CAST(strftime('%w', ${dateColumn}) AS INTEGER) + 6) % 7 || ' days')`;
        dateFilter = `date(${dateColumn}) >= date('now', '-84 days')`;
        break;
      case 'monthly':
        dateGroup = `strftime('%Y-%m', ${dateColumn})`;
        dateFilter = `date(${dateColumn}) >= date('now', '-12 months')`;
        break;
      case 'quarterly':
        dateGroup = `strftime('%Y', ${dateColumn}) || '-Q' || CAST((CAST(strftime('%m', ${dateColumn}) AS INTEGER) + 2) / 3 AS INTEGER)`;
        dateFilter = `date(${dateColumn}) >= date('now', '-1 year')`;
        break;
      case 'yearly':
        dateGroup = `strftime('%Y', ${dateColumn})`;
        dateFilter = `date(${dateColumn}) >= date('now', '-5 years')`;
        break;
    }
  }

  // Staff filter with proper handling of comma-separated values
  let staffFilter = '1=1';
  if (staff !== 'all') {
    staffFilter = `(assigned_staff = ? OR assigned_staff LIKE ? OR assigned_staff LIKE ? OR assigned_staff LIKE ?)`;
    params.push(staff, `${staff},%`, `%,${staff},%`, `%,${staff}`);
  }

  try {
    // Check if the metric's columns exist in the table
    const tableInfo = db.prepare(`PRAGMA table_info(${metricConfig.table.split(' ')[0]})`).all();
    const columns = tableInfo.map(col => col.name);
    
    // Use fallback calculation if the column doesn't exist
    const aggregation = metricConfig.fallback && 
      !columns.some(col => metricConfig.agg.includes(col)) ? 
      metricConfig.fallback : metricConfig.agg;

    let query;
    if (isAllTime) {
      query = `
        SELECT COALESCE(${aggregation}, 0) as value
        FROM ${metricConfig.table}
        WHERE ${staffFilter} AND ${dateColumn} IS NOT NULL
      `;
    } else {
      query = `
        SELECT 
          COALESCE(${aggregation}, 0) as value,
          ${dateGroup} as period
        FROM ${metricConfig.table}
        WHERE ${staffFilter} 
        AND ${dateFilter}
        AND ${dateColumn} IS NOT NULL
      `;
    }

    if (metricConfig.where) {
      query += ` AND ${metricConfig.where}`;
    }

    if (!isAllTime) {
      query += ` GROUP BY period ORDER BY period ASC`;
    }

    const stmt = db.prepare(query);
    const data = stmt.all(...params);
    res.json(data);
  } catch (err) {
    console.error(`Error fetching analytics for metric '${metric}':`, err);
    res.status(500).json({ error: "Failed to retrieve analytics data." });
  }
});

// 🔐 Orders route
app.get("/dashboard/data", requireLogin, (req, res) => {
  try {
    const { showOld, showCompleted, showClaimed } = req.query;
    const username = req.session.user;
    let query = `SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders`;
    const params = [];
    const conditions = [];

    // Filter for claimed orders tab
    if (showClaimed === 'true') {
      conditions.push(`
        (
          assigned_staff = ? OR
          assigned_staff LIKE ? OR 
          assigned_staff LIKE ? OR 
          assigned_staff LIKE ?
        )
        AND assigned_staff IS NOT NULL 
        AND assigned_staff != '' 
        AND (status IS NULL OR LOWER(status) != 'completed')
      `);
      // Match exact username, start, middle, or end of comma-separated list
      params.push(username, username + ',%', '%,' + username + ',%', '%,' + username);
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
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  try {
    // Update the order with new price
    const stmt = db.prepare(`
      UPDATE orders 
      SET est_price = ?,
          updated_by = ?,
          last_updated = ?
      WHERE id = ?
    `);
    const result = stmt.run(est_price, username, timestamp, orderId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Fetch the updated order
    const updatedOrder = db.prepare("SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders WHERE id = ?").get(orderId);

    // Broadcast the update to all connected clients
    broadcastUpdate('orderUpdate', {
      type: 'price',
      order: updatedOrder
    });

    console.log(`✅ Updated price for order ${orderId} to $${est_price}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Failed to update est_price:", err.message);
    res.status(500).json({ error: "Database error" });
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

// Update assigned price endpoint
app.post("/dashboard/update-assigned-price", requireLogin, (req, res) => {
  const { orderId, assignedPrice } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  try {
    // Update the order
    const updateStmt = db.prepare(`
      UPDATE orders 
      SET assigned_price = ?,
          updated_by = ?,
          last_updated = COALESCE(?, last_updated)
      WHERE id = ?
    `);
    const result = updateStmt.run(assignedPrice, username, timestamp, orderId);
    
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
      type: 'price',
      order: updatedOrder
    });

    console.log('✅ Assigned price updated successfully:', {
      orderId,
      newPrice: assignedPrice,
      updatedBy: username
    });

    res.json({ 
      success: true,
      order: updatedOrder,
      timestamp: timestamp
    });

  } catch (err) {
    console.error("❌ Failed to update assigned price:", err.message);
    
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

// Add after the express app creation but before routes
const clients = new Set();

// SSE endpoint for order updates with enhanced session handling
app.get('/dashboard/updates', (req, res) => {
  // Check authentication first
  if (!req.session.user) {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection ID and timestamp
  const connectionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const username = req.session.user;
  
  res.write(`event: connect\ndata: ${JSON.stringify({
    id: connectionId,
    time: Date.now(),
    username: username
  })}\n\n`);
  
  // Send heartbeat every 10 seconds (more frequent)
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      } catch (err) {
        console.log(`Heartbeat failed for client ${connectionId}, cleaning up`);
        clearInterval(heartbeat);
        clients.delete(client);
      }
    } else {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 10000);
  
  // Add client to the set with metadata
  const client = {
    res,
    id: connectionId,
    username: username,
    lastSeen: Date.now(),
    heartbeat: heartbeat
  };
  clients.add(client);
  
  console.log(`✅ New SSE client connected: ${connectionId} (${username}). Total clients: ${clients.size}`);
  
  // Remove client when connection closes
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
    console.log(`📡 SSE client disconnected: ${connectionId} (${username}). Total clients: ${clients.size}`);
  });

  // Handle session expiration
  req.session.touch();
});

// Enhanced broadcast function with targeted updates and push notifications
function broadcastUpdate(eventType, data) {
  const eventData = JSON.stringify({
    ...data,
    timestamp: Date.now(),
    sequence: global.updateSequence = (global.updateSequence || 0) + 1
  });

  const deadClients = new Set();
  
  console.log(`📡 Broadcasting ${eventType} to ${clients.size} SSE clients`);
  
  clients.forEach(client => {
    try {
      if (!client.res.writableEnded) {
        client.res.write(`event: ${eventType}\ndata: ${eventData}\n\n`);
        client.lastSeen = Date.now();
      } else {
        deadClients.add(client);
      }
    } catch (err) {
      console.error(`Failed to send to client ${client.id}:`, err);
      deadClients.add(client);
    }
  });
  
  // Clean up dead clients
  deadClients.forEach(client => {
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
    }
    clients.delete(client);
    console.log(`🧹 Removed dead SSE client: ${client.id}`);
  });
  
  console.log(`📊 Active SSE clients after broadcast: ${clients.size}`);

  // Also send push notifications
  sendPushNotifications(eventType, data);
}

// New function to send push notifications
async function sendPushNotifications(eventType, data) {
  try {
    const notification = getNotificationMessage(eventType, data);

    // If there's no notification, don't send anything
    if (!notification) {
      console.log(`No notification message for eventType: ${eventType}, skipping push.`);
      return;
    }

    let subscriptions;
    let targetUsers = null;

    // For staff assignment notifications, only send to assigned users
    if (eventType === 'orderUpdate' && data.type === 'staff' && notification.assignedStaff) {
      targetUsers = notification.assignedStaff;
      subscriptions = db.prepare('SELECT endpoint, p256dh, auth, username FROM push_subscriptions WHERE username IN (' + 
        targetUsers.map(() => '?').join(',') + ')').all(...targetUsers);
      console.log(`Found ${subscriptions.length} push subscriptions for assigned users: ${targetUsers.join(', ')}`);
    } else {
      // For other notifications (new orders, unclaimed orders), send to everyone
      subscriptions = db.prepare('SELECT endpoint, p256dh, auth, username FROM push_subscriptions').all();
      console.log(`Found ${subscriptions.length} push subscriptions to notify (all users).`);
    }

    if (subscriptions.length === 0) return;

    const notificationPayload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: '/dashboard/' // Directs to the dashboard on notification click
    });

    for (const row of subscriptions) {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };
      
      try {
        await webpush.sendNotification(subscription, notificationPayload);
        const userInfo = row.username ? ` (${row.username})` : '';
        console.log(`✅ Push notification sent to ${subscription.endpoint.substring(0,20)}...${userInfo}`);
      } catch (error) {
        console.error(`❌ Error sending push notification to ${subscription.endpoint.substring(0,20)}...:`, error.body || error.message);
        // If subscription is gone (410) or not found (404), remove it from DB
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`🗑️ Removing stale subscription: ${subscription.endpoint.substring(0,20)}...`);
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(subscription.endpoint);
        }
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch subscriptions or send push notifications:', err);
  }
}

function getNotificationMessage(eventType, data) {
  const orderId = data.order?.id || data.orderId || data.order_id;
  
  switch(eventType) {
    case 'orderUpdate':
      if (data.type === 'new') {
        return {
          title: 'new print request received',
          body: 'A new print request has been received'
        };
      }
      if (data.type === 'staff') {
        // Get the newly assigned staff members vs previously assigned
        const newStaff = data.metadata?.newStaff || data.order?.assigned_staff;
        const previousStaff = data.metadata?.previousStaff;
        
        if (newStaff && newStaff !== previousStaff) {
          // Calculate who was newly assigned (in new but not in previous)
          const newStaffList = newStaff ? newStaff.split(',').map(s => s.trim()).filter(Boolean) : [];
          const previousStaffList = previousStaff ? previousStaff.split(',').map(s => s.trim()).filter(Boolean) : [];
          
          // Only notify users who are newly assigned (not previously assigned)
          const newlyAssignedStaff = newStaffList.filter(user => !previousStaffList.includes(user));
          
          if (newlyAssignedStaff.length > 0) {
            return {
              title: 'Order Assignment',
              body: `you've been assigned to order ${orderId}`,
              assignedStaff: newlyAssignedStaff // Only newly assigned users
            };
          }
        }
      }
      // Ignore all other order updates including deletes, status changes, etc.
      return null;
    
    case 'unclaimed_order':
      return {
        title: 'Unclaimed Order',
        body: `${orderId} is unclaimed`
      };

    default:
      // Return null for any other event types to prevent notifications
      return null;
  }
}

// Add connection keep-alive ping every 30 seconds
setInterval(() => {
  if (clients.size > 0) {
    console.log(`🔄 Sending keep-alive ping to ${clients.size} clients`);
    
    const deadClients = new Set();
    clients.forEach(client => {
      try {
        if (!client.res.writableEnded) {
          client.res.write(`event: ping\ndata: ${Date.now()}\n\n`);
          client.lastSeen = Date.now();
        } else {
          deadClients.add(client);
        }
      } catch (err) {
        console.log(`Keep-alive failed for client ${client.id}, marking for cleanup`);
        deadClients.add(client);
      }
    });

    // Clean up dead clients
    deadClients.forEach(client => {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
      }
      clients.delete(client);
      console.log(`🧹 Removed dead client during keep-alive: ${client.id}`);
    });

    console.log(`📊 Active clients after keep-alive: ${clients.size}`);
  }
}, 30000); // Every 30 seconds

// Watch for new orders (with 5-second startup delay)
let lastOrderId = null;
let lastOrderTimestamp = null; // Track the timestamp of the last seen order

// Add a 5-second delay before starting order notifications to prevent startup false positives
setTimeout(() => {
  console.log('🚀 Starting order notification system...');
  
  // Initialize lastOrderId to the current most recent order to prevent false notifications
  try {
    const latestOrder = db.prepare("SELECT id, submitted_at FROM orders ORDER BY submitted_at DESC LIMIT 1").get();
    if (latestOrder) {
      lastOrderId = latestOrder.id;
      lastOrderTimestamp = new Date(latestOrder.submitted_at).getTime();
      console.log(`📋 Initialized with most recent order: ${lastOrderId}`);
    }
  } catch (err) {
    console.error('❌ Error initializing last order tracking:', err);
  }

  setInterval(async () => {
    try {
      // Get the latest order's ID and submission time
      const latestOrder = db.prepare("SELECT id, submitted_at FROM orders ORDER BY submitted_at DESC LIMIT 1").get();
      
      if (latestOrder && latestOrder.id !== lastOrderId) {
        const latestOrderTimestamp = new Date(latestOrder.submitted_at).getTime();

        // Only consider it a new order if its timestamp is newer
        if (!lastOrderTimestamp || latestOrderTimestamp > lastOrderTimestamp) {
        console.log('🆕 New order detected:', latestOrder.id);
        lastOrderId = latestOrder.id;
          lastOrderTimestamp = latestOrderTimestamp;
          
          // Fetch the full order details for broadcasting
          const fullOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(latestOrder.id);
        
        // Always ensure new orders have "pending" status for consistency
          let finalOrder = fullOrder;
          if (!fullOrder.status || fullOrder.status === '' || fullOrder.status === null) {
            console.log('🔄 Setting status to "pending" for new order:', fullOrder.id);
            db.prepare("UPDATE orders SET status = 'pending' WHERE id = ?").run(fullOrder.id);
          // Refresh the order data to get the updated status
            finalOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(fullOrder.id);
        }
        
        // Always broadcast the new order update with the correct status
        broadcastUpdate('orderUpdate', {
          type: 'new',
          order: finalOrder
        });
        
        // Also broadcast a status update to ensure all clients sync the status correctly
        if (finalOrder.status === 'pending') {
          console.log('📡 Broadcasting status sync for new order:', finalOrder.id);
          broadcastUpdate('orderUpdate', {
            type: 'status',
            order: finalOrder
          });
        }
        }
      } else if (!latestOrder && lastOrderId) {
        // This case handles when the last order is deleted and the table becomes empty
        console.log('🗑️ The last order in the database was deleted. Resetting order tracking.');
        lastOrderId = null;
        lastOrderTimestamp = null;
      }
    } catch (err) {
      console.error('❌ Error checking for new orders:', err);
    }
  }, 1000); // Check every second
}, 5000); // Wait 5 seconds before starting order notifications

// Check for unclaimed orders periodically
setInterval(async () => {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    // Get only the most recently submitted unclaimed order older than 2 hours
    const mostRecentUnclaimedOrder = db.prepare(`
      SELECT id 
      FROM orders 
      WHERE 
        (claimed_by IS NULL OR claimed_by = '') AND
        (status IS NULL OR status != 'completed') AND
        submitted_at <= ? AND
        unclaimed_notified = 0
      ORDER BY submitted_at DESC
      LIMIT 1
    `).get(twoHoursAgo);

    if (mostRecentUnclaimedOrder) {
      console.log(`📣 Found most recent unclaimed order over 2 hours old: ${mostRecentUnclaimedOrder.id}`);
      
      // Broadcast an update for the most recent unclaimed order
      broadcastUpdate('unclaimed_order', {
        orderId: mostRecentUnclaimedOrder.id,
        order_id: mostRecentUnclaimedOrder.id // for compatibility with getNotificationMessage
      });
      
      // Mark the order as notified to prevent duplicate notifications
      db.prepare('UPDATE orders SET unclaimed_notified = 1 WHERE id = ?').run(mostRecentUnclaimedOrder.id);
      console.log(`🔔 Notified for most recent unclaimed order #${mostRecentUnclaimedOrder.id}, and marked as notified.`);
    }
  } catch (err) {
    console.error('❌ Error checking for unclaimed orders:', err);
  }
}, 60 * 60 * 1000); // Check every 60 minutes

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
    // Update the order
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
             CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status,
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

// Update staff notes endpoint
app.post("/dashboard/update-staff-notes", requireLogin, (req, res) => {
  const { orderId, staffNotes } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    const stmt = db.prepare(`
      UPDATE orders 
      SET order_notes = ?,
          updated_by = ?,
          last_updated = ?
      WHERE id = ?
    `);
    const result = stmt.run(staffNotes, username, timestamp, orderId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Fetch updated order
    const updatedOrder = db.prepare("SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders WHERE id = ?").get(orderId);
    
    // Broadcast the update
    broadcastUpdate('orderUpdate', {
      type: 'notes',
      order: updatedOrder
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Failed to update staff notes:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 👥 Assign staff to order
app.post("/dashboard/assign-staff", requireLogin, (req, res) => {
  const { orderId, staffName } = req.body;
  const username = req.session.user;
  const timestamp = new Date().toISOString();

  console.log(`📝 Staff assignment request:`, {
    orderId,
    staffName,
    requestedBy: username,
    timestamp
  });

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    // First check if the order exists and get its current state
    const current = db.prepare(`
      SELECT o.*, 
             o.claimed_by, 
             o.status, 
             o.assigned_staff,
             o.submitted_at,
             o.last_updated
      FROM orders o 
      WHERE o.id = ?
    `).get(orderId);
    
    if (!current) {
      console.log(`❌ Order ${orderId} not found`);
      return res.status(404).json({ error: "Order not found" });
    }

    console.log(`📄 Current order state:`, {
      orderId: current.id,
      currentStaff: current.assigned_staff,
      claimedBy: current.claimed_by,
      status: current.status
    });

    // Don't allow assigning staff to completed orders
    if (current.status?.toLowerCase() === 'completed') {
      return res.status(400).json({ error: "Cannot assign staff to completed orders" });
    }

    // Validate staff members
    const validStaffMembers = Object.keys(USERS);
    const assignedStaff = staffName ? staffName.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    console.log(`👥 Processing staff assignment:`, {
      requestedStaff: assignedStaff,
      validStaffMembers
    });

    // Check if all assigned staff members are valid
    const invalidStaff = assignedStaff.filter(staff => !validStaffMembers.includes(staff));
    if (invalidStaff.length > 0) {
      console.log(`❌ Invalid staff members:`, invalidStaff);
      return res.status(400).json({
        error: "Invalid staff members",
        invalidMembers: invalidStaff
      });
    }

    // If the order is claimed, ensure the claimer remains in the assigned staff
    let finalStaffList = [...new Set([...assignedStaff])]; // Remove duplicates
    if (current.claimed_by && !finalStaffList.includes(current.claimed_by)) {
      finalStaffList.push(current.claimed_by);
      console.log(`➕ Added claimer ${current.claimed_by} to staff list`);
    }
    const finalStaffString = finalStaffList.join(',');

    console.log(`📋 Final staff assignment:`, {
      previous: current.assigned_staff,
      new: finalStaffString
    });

    // Begin transaction
    const updatedOrder = db.transaction(() => {
      const stmt = db.prepare(`
        UPDATE orders 
        SET assigned_staff = ?,
            updated_by = ?,
            last_updated = ?
        WHERE id = ?
      `);
      
      const result = stmt.run(finalStaffString, username, timestamp, orderId);
      
      if (result.changes === 0) {
        throw new Error("Failed to update order");
      }

      // Fetch the complete updated order
      const updatedOrder = db.prepare(`
        SELECT o.*, 
               o.submitted_at,
               o.last_updated,
               o.updated_by
        FROM orders o 
        WHERE o.id = ?
      `).get(orderId);

      if (!updatedOrder) {
        throw new Error("Failed to fetch updated order");
      }

      return updatedOrder;
    })();

    console.log(`✅ Staff assignment completed:`, {
      orderId,
      newStaff: updatedOrder.assigned_staff,
      updatedBy: username
    });

    // Broadcast the update with rich metadata
    const updateData = {
      type: 'staff',
      order: updatedOrder,
      metadata: {
        previousStaff: current.assigned_staff,
        newStaff: updatedOrder.assigned_staff,
        updatedBy: username,
        timestamp: timestamp,
        submittedAt: updatedOrder.submitted_at,
        lastUpdated: updatedOrder.last_updated
      }
    };

    console.log(`📡 Broadcasting staff update:`, updateData);
    broadcastUpdate('orderUpdate', updateData);

    res.json({ 
      success: true, 
      order: updatedOrder,
      metadata: {
        previousStaff: current.assigned_staff,
        newStaff: updatedOrder.assigned_staff,
        timestamp: timestamp
      }
    });
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
          assigned_staff = ?,
          status = COALESCE(status, 'pending'),
          unclaimed_notified = 0
      WHERE id = ?
    `);
    const result = stmt.run(username, username, timestamp, username, orderId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Fetch the updated order with all fields
    const updatedOrder = db.prepare(`
      SELECT *,
             CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status,
             updated_by,
             last_updated
      FROM orders 
      WHERE id = ?
    `).get(orderId);
    
    // Broadcast the claim update
    broadcastUpdate('orderUpdate', {
      type: 'claim',
      order: updatedOrder,
      timestamp: timestamp,
      claimedBy: username
    });
    
    // Also broadcast a status update to ensure frontend syncs correctly
    broadcastUpdate('orderUpdate', {
      type: 'status',
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
    // First check if the order exists and get its current state
    const current = db.prepare("SELECT claimed_by, status, assigned_staff FROM orders WHERE id = ?").get(orderId);
    
    if (!current) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Don't allow unclaiming completed orders
    if (current.status?.toLowerCase() === 'completed') {
      return res.status(400).json({ error: "Cannot unclaim completed orders" });
    }
    
    // If claimed by someone else, don't allow unclaiming
    if (current.claimed_by && current.claimed_by !== username) {
      return res.status(403).json({ 
        error: "Cannot unclaim - order claimed by someone else",
        claimedBy: current.claimed_by
      });
    }

    // If not claimed at all, return success (idempotent operation)
    if (!current.claimed_by) {
      const order = db.prepare("SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders WHERE id = ?").get(orderId);
      return res.json({ success: true, order });
    }

    // Begin transaction
    db.transaction(() => {
      // Get current assigned staff and remove the unclaiming user
      let assignedStaff = current.assigned_staff ? current.assigned_staff.split(',') : [];
      assignedStaff = assignedStaff.filter(staff => staff !== username);
      const newAssignedStaff = assignedStaff.length > 0 ? assignedStaff.join(',') : null;

      // Perform the unclaim operation - reset claimed_by and update assigned_staff
      const stmt = db.prepare(`
        UPDATE orders 
        SET claimed_by = NULL, 
            assigned_staff = ?,
            updated_by = ?, 
            last_updated = ?,
            unclaimed_notified = 0
        WHERE id = ? AND (claimed_by IS NULL OR claimed_by = ?)
      `);
      
      const result = stmt.run(newAssignedStaff, username, timestamp, orderId, username);
      
      if (result.changes === 0) {
        throw new Error("Failed to update order - may have been claimed by someone else");
      }

      // Fetch the updated order to confirm the changes
      const updatedOrder = db.prepare("SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders WHERE id = ?").get(orderId);
      
      if (!updatedOrder) {
        throw new Error("Failed to fetch updated order");
      }

      if (updatedOrder.claimed_by !== null) {
        throw new Error("Order is still claimed after unclaim operation");
      }

      return updatedOrder;
    })();

    // Fetch the final state of the order
    const finalOrder = db.prepare("SELECT *, CASE WHEN status IS NULL OR status = 'submitted' THEN 'pending' ELSE status END as status FROM orders WHERE id = ?").get(orderId);
    
    // Broadcast the update with additional context
    broadcastUpdate('orderUpdate', {
      type: 'unclaim',
      order: finalOrder,
      timestamp: timestamp,
      previousClaimant: username,
      assignedStaff: finalOrder.assigned_staff
    });

    res.json({ success: true, order: finalOrder });
  } catch (err) {
    console.error("❌ Failed to unclaim order:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
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

// 🎫 COUPON MANAGEMENT ENDPOINTS

// Get all coupons
app.get("/dashboard/coupons", requireLogin, (req, res) => {
  try {
    const coupons = db.prepare("SELECT * FROM coupons ORDER BY code").all();
    console.log(`📦 Fetched ${coupons.length} coupons`);
    res.json(coupons);
  } catch (err) {
    console.error("❌ Failed to fetch coupons:", err.message);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// Create a new coupon
app.post("/dashboard/coupons", requireLogin, (req, res) => {
  const { code, discount_type, discount_value, max_uses } = req.body;
  const username = req.session.user;
  
  console.log('🎫 Creating coupon:', { code, discount_type, discount_value, max_uses, createdBy: username });

  // Validation
  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({ error: "Missing required fields: code, discount_type, discount_value" });
  }

  // Validate discount_type
  const validDiscountTypes = ['percentage', 'fixed'];
  if (!validDiscountTypes.includes(discount_type)) {
    return res.status(400).json({ error: "Invalid discount_type. Must be 'percentage' or 'fixed'" });
  }

  // Validate discount_value
  if (typeof discount_value !== 'number' || discount_value <= 0) {
    return res.status(400).json({ error: "Invalid discount_value. Must be a positive number" });
  }

  // Validate percentage discount
  if (discount_type === 'percentage' && discount_value > 100) {
    return res.status(400).json({ error: "Percentage discount cannot exceed 100%" });
  }

  // Validate max_uses
  if (max_uses !== undefined && (typeof max_uses !== 'number' || max_uses < 0)) {
    return res.status(400).json({ error: "Invalid max_uses. Must be a non-negative number or null for unlimited" });
  }

  try {
    // Normalize code to uppercase
    const normalizedCode = code.trim().toUpperCase();
    
    // Check if coupon already exists
    const existing = db.prepare("SELECT code FROM coupons WHERE code = ?").get(normalizedCode);
    if (existing) {
      return res.status(409).json({ error: "Coupon code already exists" });
    }

    // Insert the coupon
    const stmt = db.prepare(`
      INSERT INTO coupons (code, discount_type, discount_value, max_uses, used_count)
      VALUES (?, ?, ?, ?, 0)
    `);
    
    const result = stmt.run(normalizedCode, discount_type, discount_value, max_uses || null);
    
    if (result.changes === 0) {
      throw new Error("Failed to insert coupon");
    }

    // Fetch the created coupon
    const newCoupon = db.prepare("SELECT * FROM coupons WHERE code = ?").get(normalizedCode);
    
    // Broadcast the update to all connected clients
    broadcastUpdate('couponUpdate', {
      type: 'create',
      coupon: newCoupon,
      createdBy: username
    });

    console.log(`✅ Created coupon: ${normalizedCode}`);
    res.status(201).json({ success: true, coupon: newCoupon });

  } catch (err) {
    console.error("❌ Failed to create coupon:", err.message);
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      res.status(409).json({ error: "Coupon code already exists" });
    } else {
      res.status(500).json({ error: "Database error" });
    }
  }
});

// Update a coupon
app.put("/dashboard/coupons/:code", requireLogin, (req, res) => {
  const { code } = req.params;
  const { discount_type, discount_value, max_uses } = req.body;
  const username = req.session.user;

  console.log('🎫 Updating coupon:', { code, discount_type, discount_value, max_uses, updatedBy: username });

  try {
    // Check if coupon exists
    const existing = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code);
    if (!existing) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (discount_type !== undefined) {
      if (!['percentage', 'fixed'].includes(discount_type)) {
        return res.status(400).json({ error: "Invalid discount_type" });
      }
      updates.push("discount_type = ?");
      values.push(discount_type);
    }
    
    if (discount_value !== undefined) {
      if (typeof discount_value !== 'number' || discount_value <= 0) {
        return res.status(400).json({ error: "Invalid discount_value" });
      }
      if (discount_type === 'percentage' && discount_value > 100) {
        return res.status(400).json({ error: "Percentage discount cannot exceed 100%" });
      }
      updates.push("discount_value = ?");
      values.push(discount_value);
    }
    
    if (max_uses !== undefined) {
      if (max_uses !== null && (typeof max_uses !== 'number' || max_uses < 0)) {
        return res.status(400).json({ error: "Invalid max_uses" });
      }
      updates.push("max_uses = ?");
      values.push(max_uses);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Add the code to the end of values array
    values.push(code);

    const stmt = db.prepare(`UPDATE coupons SET ${updates.join(', ')} WHERE code = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      throw new Error("Failed to update coupon");
    }

    // Fetch the updated coupon
    const updatedCoupon = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code);
    
    // Broadcast the update
    broadcastUpdate('couponUpdate', {
      type: 'update',
      coupon: updatedCoupon,
      updatedBy: username
    });

    console.log(`✅ Updated coupon: ${code}`);
    res.json({ success: true, coupon: updatedCoupon });

  } catch (err) {
    console.error("❌ Failed to update coupon:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Delete a coupon
app.delete("/dashboard/coupons/:code", requireLogin, (req, res) => {
  const { code } = req.params;
  const username = req.session.user;

  console.log('🗑️ Deleting coupon:', { code, deletedBy: username });

  try {
    // Check if coupon exists
    const existing = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code);
    if (!existing) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // Delete the coupon
    const stmt = db.prepare("DELETE FROM coupons WHERE code = ?");
    const result = stmt.run(code);

    if (result.changes === 0) {
      throw new Error("Failed to delete coupon");
    }

    // Broadcast the update
    broadcastUpdate('couponUpdate', {
      type: 'delete',
      code: code,
      deletedBy: username
    });

    console.log(`✅ Deleted coupon: ${code}`);
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Failed to delete coupon:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Delete order endpoint
app.delete("/dashboard/order/:orderId", requireLogin, (req, res) => {
  const { orderId } = req.params;
  const username = req.session.user;
  
  try {
    // Add order_ prefix if it's not already there
    const fullOrderId = orderId.startsWith('order_') ? orderId : `order_${orderId}`;
    console.log('🔍 Attempting to delete order:', { 
      receivedId: orderId,
      fullOrderId: fullOrderId 
    });

    // First check if the order exists
    const order = db.prepare("SELECT * FROM orders WHERE id = ? OR id = ?").get(orderId, fullOrderId);
    if (!order) {
      console.log('❌ Order not found in database:', { orderId, fullOrderId });
      return res.status(404).json({ error: "Order not found" });
    }

    console.log('✅ Found order:', order);

    // Use a transaction to ensure all operations succeed or none do
    db.transaction(() => {
      // First delete from the files table (this is the key change)
      try {
        const deleteFiles = db.prepare("DELETE FROM files WHERE order_id = ? OR order_id = ?");
        const filesResult = deleteFiles.run(orderId, fullOrderId);
        console.log(`Deleted ${filesResult.changes} files for order`);
      } catch (err) {
        console.log('No files to delete or error:', err.message);
      }

      // Delete from order_items if exists
      try {
        db.prepare("DELETE FROM order_items WHERE order_id = ? OR order_id = ?").run(orderId, fullOrderId);
      } catch (err) {
        console.log('No order_items to delete');
      }

      // Delete from order_notes if exists
      try {
        db.prepare("DELETE FROM order_notes WHERE order_id = ? OR order_id = ?").run(orderId, fullOrderId);
      } catch (err) {
        console.log('No order_notes to delete');
      }

      // Finally delete the order itself
      const stmt = db.prepare("DELETE FROM orders WHERE id = ? OR id = ?");
      const result = stmt.run(orderId, fullOrderId);
      
      if (result.changes === 0) {
        throw new Error("Order not found during deletion");
      }

      console.log('✅ Successfully deleted order:', { orderId, fullOrderId });
    })();

    // Also delete any physical files from the STLS directory
    try {
      const files = fs.readdirSync(STLS_DIR);
      const matchingFiles = files.filter((file) => 
        file.startsWith(orderId) || file.startsWith(fullOrderId)
      );
      
      matchingFiles.forEach((file) => {
        const filePath = path.join(STLS_DIR, file);
        fs.unlinkSync(filePath);
        console.log('Deleted physical file:', file);
      });
    } catch (err) {
      console.log('No physical files to delete or error:', err.message);
    }

    // Broadcast the deletion to all connected clients
    broadcastUpdate('orderUpdate', {
      type: 'delete',
      orderId: order.id, // Use the actual ID from the database
      deletedBy: username,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to delete order:", err.message);
    res.status(500).json({ 
      error: "Failed to delete order", 
      details: err.message 
    });
  }
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

app.post("/dashboard/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie('filamentbros.sid');
    res.sendStatus(200);
  });
});

app.post("/dashboard/api/subscribe", requireLogin, (req, res) => {
  try {
    const subscription = req.body;
    const username = req.session.user;
    console.log('Received push subscription from user:', username, subscription);

    // Validate subscription
    if (!subscription.endpoint || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, username) 
      VALUES (@endpoint, @p256dh, @auth, @username)
      ON CONFLICT(endpoint) DO UPDATE SET username = @username
    `);
    
    stmt.run({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      username: username
    });
    
    console.log(`✅ Stored push subscription for user: ${username}`);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ Failed to store push subscription:', err);
    res.status(500).json({ error: 'Failed to store subscription' });
  }
});

// ADMIN: Clear all push notification subscriptions (DELETE THIS ENDPOINT WHEN NOT NEEDED)
app.post("/dashboard/clear-subscriptions", requireLogin, (req, res) => {
  try {
    console.log('🧹 Clearing all push notification subscriptions...');
    
    // Get count before deletion
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get().count;
    
    // Delete all subscriptions
    const result = db.prepare('DELETE FROM push_subscriptions').run();
    
    console.log(`🗑️ Cleared ${result.changes} push notification subscriptions (was ${countBefore})`);
    
    res.json({ 
      success: true, 
      message: `Cleared ${result.changes} push notification subscriptions`,
      previousCount: countBefore
    });

  } catch (err) {
    console.error('❌ Failed to clear subscriptions:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to clear subscriptions',
      details: err.message 
    });
  }
});

// TEST BUTTON: Test unclaimed order notification (DELETE THIS ENDPOINT WHEN DONE TESTING)
app.post("/dashboard/test-unclaimed-notification", requireLogin, (req, res) => {
  try {
    console.log('🧪 TEST: Starting unclaimed notification test...');
    
    // Find the most recently submitted unclaimed order within the past week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const testOrder = db.prepare(`
      SELECT id 
      FROM orders 
      WHERE 
        (claimed_by IS NULL OR claimed_by = '') AND
        (status IS NULL OR status != 'completed') AND
        submitted_at >= ?
      ORDER BY submitted_at DESC
      LIMIT 1
    `).get(oneWeekAgo);

    console.log('🧪 TEST: Query result:', testOrder);

    if (!testOrder) {
      console.log('🧪 TEST: No unclaimed orders found');
      return res.status(404).json({ error: "No unclaimed orders found for testing" });
    }

    console.log(`🧪 TEST: Found test order: ${testOrder.id}`);

    // Broadcast the unclaimed order notification
    try {
      broadcastUpdate('unclaimed_order', {
        orderId: testOrder.id,
        order_id: testOrder.id
      });
      console.log(`🧪 TEST: broadcastUpdate completed for order #${testOrder.id}`);
    } catch (broadcastErr) {
      console.error('🧪 TEST: broadcastUpdate failed:', broadcastErr);
      throw broadcastErr;
    }

    console.log(`🧪 TEST: Successfully sent unclaimed notification for order #${testOrder.id}`);
    res.json({ 
      success: true, 
      message: `Test notification sent for order #${testOrder.id}` 
    });

  } catch (err) {
    console.error('❌ Failed to send test notification:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to send test notification',
      details: err.message 
    });
  }
});

// Staff API endpoint
app.get("/dashboard/api/staff", requireLogin, (req, res) => {
  try {
    // Get unique staff members from both orders and filament_orders tables
    const query = `
      WITH RECURSIVE
      split_staff(name, rest) AS (
        SELECT 
          NULL as name,
          group_concat(assigned_staff, ',') as rest
        FROM (
          SELECT assigned_staff FROM orders WHERE assigned_staff IS NOT NULL
          UNION ALL
          SELECT assigned_staff FROM filament_orders WHERE assigned_staff IS NOT NULL
        )
        UNION ALL
        SELECT
          CASE 
            WHEN instr(rest, ',') > 0 
            THEN trim(substr(rest, 1, instr(rest, ',') - 1))
            ELSE trim(rest)
          END,
          CASE 
            WHEN instr(rest, ',') > 0 
            THEN substr(rest, instr(rest, ',') + 1)
            ELSE NULL
          END
        FROM split_staff
        WHERE rest IS NOT NULL
      )
      SELECT DISTINCT name, name as username
      FROM split_staff
      WHERE name IS NOT NULL AND name != ''
      ORDER BY name;
    `;

    const stmt = db.prepare(query);
    const staffMembers = stmt.all();
    res.json(staffMembers);
  } catch (err) {
    console.error("Error fetching staff members:", err);
    res.status(500).json({ error: "Failed to retrieve staff members" });
  }
});

// Update inventory management values
app.put("/dashboard/inventory/:id", requireLogin, (req, res) => {
  try {
    const { id } = req.params;
    const { 
      print_split, 
      sale_split, 
      allocated_printing, 
      allocated_sale,
      checked_out_sharva, 
      checked_out_nathan, 
      checked_out_evan,
      checked_out_pablo, 
      checked_out_peter 
    } = req.body;

    console.log('🔄 Updating inventory management for filament:', id);

    // Calculate available printing based on allocation and checkouts
    const total_checked_out = (checked_out_sharva || 0) + (checked_out_nathan || 0) + 
                            (checked_out_evan || 0) + (checked_out_pablo || 0) + 
                            (checked_out_peter || 0);
    const available_printing = (allocated_printing || 0) - total_checked_out;

    const result = db.prepare(`
      UPDATE filament_inventory 
      SET print_split = ?, 
          sale_split = ?,
          allocated_printing = ?, 
          allocated_sale = ?,
          checked_out_sharva = ?, 
          checked_out_nathan = ?,
          checked_out_evan = ?, 
          checked_out_pablo = ?,
          checked_out_peter = ?, 
          available_printing = ?
      WHERE id = ?
    `).run(
      print_split || 100, 
      sale_split || 0,
      allocated_printing || 0, 
      allocated_sale || 0,
      checked_out_sharva || 0, 
      checked_out_nathan || 0,
      checked_out_evan || 0, 
      checked_out_pablo || 0,
      checked_out_peter || 0, 
      available_printing,
      id
    );

    if (result.changes === 0) {
      console.error('❌ Filament not found for inventory update:', id);
      return res.status(404).json({ error: "Filament not found" });
    }

    console.log('✅ Successfully updated inventory management for filament:', id);
    
    // Broadcast the update to all connected clients
    broadcastUpdate('inventoryUpdate', {
      type: 'update',
      filamentId: id,
      data: {
        print_split,
        sale_split,
        allocated_printing,
        allocated_sale,
        checked_out_sharva,
        checked_out_nathan,
        checked_out_evan,
        checked_out_pablo,
        checked_out_peter,
        available_printing
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to update inventory management:', err);
    res.status(500).json({ error: "Failed to update inventory management" });
  }
});
