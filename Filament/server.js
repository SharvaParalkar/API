const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const app = express();

// Configure CORS for production
const corsOptions = {
  origin: [
    'https://filamentbros.com',
    'https://www.filamentbros.com',
    'https://api.filamentbros.com',
    // Include development URLs if needed
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control'],
  credentials: true,
  maxAge: 86400 // Cache preflight requests for 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());

const dbPath = path.join(__dirname, "..", "DB", "db", "filamentbros.sqlite");
const db = new Database(dbPath);

const clients = new Set();

function broadcastUpdate(data) {
  const eventData = JSON.stringify(data);
  clients.forEach(client => {
    client.res.write(`data: ${eventData}\n\n`);
  });
}

// Middleware to log all requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Add headers for SSE connections
app.use('/filament/updates', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  next();
});

// SSE endpoint for filament inventory updates
app.get("/filament/updates", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const client = { res };
  clients.add(client);
  
  console.log(`✅ New SSE client connected for filament updates. Total clients: ${clients.size}`);
  
  req.on('close', () => {
    clients.delete(client);
    console.log(`📡 SSE client disconnected for filament updates. Total clients: ${clients.size}`);
  });
});

// Get all filament inventory
app.get("/filament/inventory", (req, res) => {
  try {
    console.log('📦 Fetching all filament inventory...');
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