const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "db", "filamentbros.sqlite");

const db = new Database(dbPath);

// Adjust this path to your CSV file
const csvFilePath = path.join(__dirname, "orders.csv");

if (!fs.existsSync(csvFilePath)) {
  console.error("CSV file not found:", csvFilePath);
  process.exit(1);
}

const insert = db.prepare(`
  INSERT OR IGNORE INTO orders (
    id, name, email, phone, submitted_at, status,
    assigned_staff, est_price, payment_status, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on("data", (row) => {
    try {
      insert.run(
        row.id,
        row.name,
        row.email,
        row.phone,
        row.submitted_at,
        row.status,
        row.assigned_staff,
        parseFloat(row.est_price || 0),
        row.payment_status,
        row.notes || ""
      );
    } catch (err) {
      console.error("Failed to insert row:", row, "\nError:", err.message);
    }
  })
  .on("end", () => {
    console.log("CSV import complete.");
  });
