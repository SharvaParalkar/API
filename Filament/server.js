const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

const dbPath = path.join(__dirname, "..", "DB", "db", "filamentbros.sqlite");
const db = new Database(dbPath);

const clients = new Set();

function broadcastUpdate(data) {
  const eventData = JSON.stringify(data);
  console.log('🔄 Broadcasting update to clients:', eventData);
  clients.forEach(client => {
    try {
      client.res.write(`data: ${eventData}\n\n`);
    } catch (err) {
      console.error('❌ Failed to send update to client:', err);
      clients.delete(client);
    }
  });
  console.log(`✅ Broadcast complete. Active clients: ${clients.size}`);
}

// Keep-alive ping to prevent connection timeouts
function sendKeepAlive() {
  if (clients.size > 0) {
    console.log(`📡 Sending keep-alive ping to ${clients.size} clients`);
    clients.forEach(client => {
      try {
        client.res.write(': ping\n\n');
      } catch (err) {
        console.error('❌ Failed to send keep-alive to client:', err);
        clients.delete(client);
      }
    });
  }
}

// Send keep-alive ping every 30 seconds
setInterval(sendKeepAlive, 30000);

// Middleware to log all requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// SSE endpoint for filament inventory updates
app.get("/filament/updates", (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');
  
  const client = { 
    id: Date.now(),
    res 
  };
  clients.add(client);
  
  console.log(`✅ New SSE client connected (ID: ${client.id}). Total clients: ${clients.size}`);
  
  // Handle client disconnect
  req.on('close', () => {
    clients.delete(client);
    console.log(`📡 SSE client disconnected (ID: ${client.id}). Total clients: ${clients.size}`);
  });
});

// Get all filament inventory
app.get("/filament/inventory", (req, res) => {
  try {
    console.log('📦 Fetching all filament inventory...');
    
    // Set cache-busting headers to ensure fresh data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const inventory = db.prepare("SELECT * FROM filament_inventory").all();
    console.log(`✅ Successfully fetched ${inventory.length} filament items`);
    res.json(inventory);
  } catch (err) {
    console.error('❌ Failed to fetch filament inventory:', err);
    res.status(500).json({ error: "Failed to fetch filament inventory" });
  }
});

// Add new filament
app.post("/filament/add", (req, res) => {
  try {
    const { 
      material, color, weight_grams, price_per_kg, stock, image_url,
      print_split = 100, sale_split = 0,
      allocated_printing = 0, allocated_sale = 0,
      checked_out_sharva = 0, checked_out_nathan = 0,
      checked_out_evan = 0, checked_out_pablo = 0,
      checked_out_peter = 0
    } = req.body;
    
    console.log('➕ Adding new filament:', { material, color });

    // Validate required fields
    if (!material || !color || !weight_grams || !price_per_kg) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Calculate available printing based on allocation and checkouts
    const total_checked_out = checked_out_sharva + checked_out_nathan + 
                            checked_out_evan + checked_out_pablo + checked_out_peter;
    const available_printing = allocated_printing - total_checked_out;

    // Generate a unique ID
    const id = `filament_${Date.now()}`;

    const result = db.prepare(`
      INSERT INTO filament_inventory (
        id, material, color, weight_grams, price_per_kg, stock, image_url,
        print_split, sale_split, allocated_printing, allocated_sale,
        checked_out_sharva, checked_out_nathan, checked_out_evan,
        checked_out_pablo, checked_out_peter, available_printing
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, material, color, weight_grams, price_per_kg, stock || 0, image_url || null,
      print_split, sale_split, allocated_printing, allocated_sale,
      checked_out_sharva, checked_out_nathan, checked_out_evan,
      checked_out_pablo, checked_out_peter, available_printing
    );

    console.log('✅ Successfully added new filament with ID:', id);
    broadcastUpdate({ type: 'add', filamentId: id });
    res.json({ success: true, id });
  } catch (err) {
    console.error('❌ Failed to add filament:', err);
    res.status(500).json({ error: "Failed to add filament" });
  }
});

// Update filament
app.put("/filament/update/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { 
      material, color, weight_grams, price_per_kg, stock, image_url,
      print_split, sale_split, allocated_printing, allocated_sale,
      checked_out_sharva, checked_out_nathan, checked_out_evan,
      checked_out_pablo, checked_out_peter
    } = req.body;

    console.log('🔄 Updating filament:', id);

    // Validate required fields
    if (!material || !color || !weight_grams || !price_per_kg) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Calculate available printing based on allocation and checkouts
    const total_checked_out = (checked_out_sharva || 0) + (checked_out_nathan || 0) + 
                            (checked_out_evan || 0) + (checked_out_pablo || 0) + 
                            (checked_out_peter || 0);
    const available_printing = (allocated_printing || 0) - total_checked_out;

    const result = db.prepare(`
      UPDATE filament_inventory 
      SET material = ?, color = ?, weight_grams = ?, price_per_kg = ?, 
          stock = ?, image_url = ?, print_split = ?, sale_split = ?,
          allocated_printing = ?, allocated_sale = ?,
          checked_out_sharva = ?, checked_out_nathan = ?,
          checked_out_evan = ?, checked_out_pablo = ?,
          checked_out_peter = ?, available_printing = ?
      WHERE id = ?
    `).run(
      material, color, weight_grams, price_per_kg, 
      stock || 0, image_url || null,
      print_split || 100, sale_split || 0,
      allocated_printing || 0, allocated_sale || 0,
      checked_out_sharva || 0, checked_out_nathan || 0,
      checked_out_evan || 0, checked_out_pablo || 0,
      checked_out_peter || 0, available_printing,
      id
    );

    if (result.changes === 0) {
      console.error('❌ Filament not found:', id);
      return res.status(404).json({ error: "Filament not found" });
    }

    console.log('✅ Successfully updated filament:', id);
    broadcastUpdate({ type: 'update', filamentId: id });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to update filament:', err);
    res.status(500).json({ error: "Failed to update filament" });
  }
});

// Delete filament
app.delete("/filament/delete/:id", (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Deleting filament:', id);

    const result = db.prepare("DELETE FROM filament_inventory WHERE id = ?").run(id);

    if (result.changes === 0) {
      console.error('❌ Filament not found:', id);
      return res.status(404).json({ error: "Filament not found" });
    }

    console.log('✅ Successfully deleted filament:', id);
    broadcastUpdate({ type: 'delete', filamentId: id });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete filament:', err);
    res.status(500).json({ error: "Failed to delete filament" });
  }
});

const PORT = 3400;
app.listen(PORT, () => {
  console.log(`
🚀 Filament inventory server running on port ${PORT}
📁 Database path: ${dbPath}
⏰ Started at: ${new Date().toISOString()}
  `);
}); 