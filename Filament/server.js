const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "..", "DB", "db", "filamentbros.sqlite");
const db = new Database(dbPath);

// Get all filament inventory
app.get("/filament/inventory", (req, res) => {
  try {
    const inventory = db.prepare("SELECT * FROM filament_inventory").all();
    res.json(inventory);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch filament inventory" });
  }
});

// Add new filament
app.post("/filament/add", (req, res) => {
  try {
    const { material, color, weight_grams, price_per_kg } = req.body;
    
    // Validate required fields
    if (!material || !color || !weight_grams || !price_per_kg) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Generate a unique ID
    const id = `filament_${Date.now()}`;

    const result = db.prepare(`
      INSERT INTO filament_inventory (id, material, color, weight_grams, price_per_kg)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, material, color, weight_grams, price_per_kg);

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add filament" });
  }
});

// Update filament
app.put("/filament/update/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { material, color, weight_grams, price_per_kg } = req.body;

    // Validate required fields
    if (!material || !color || !weight_grams || !price_per_kg) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = db.prepare(`
      UPDATE filament_inventory 
      SET material = ?, color = ?, weight_grams = ?, price_per_kg = ?
      WHERE id = ?
    `).run(material, color, weight_grams, price_per_kg, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Filament not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update filament" });
  }
});

// Delete filament
app.delete("/filament/delete/:id", (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare("DELETE FROM filament_inventory WHERE id = ?").run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Filament not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete filament" });
  }
});

const PORT = 3400;
app.listen(PORT, () => {
  console.log(`Filament inventory server running on port ${PORT}`);
}); 