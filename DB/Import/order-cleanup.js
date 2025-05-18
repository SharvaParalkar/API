const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "db", "filamentbros.sqlite"));

// Count how many bad rows exist
const count = db.prepare(`SELECT COUNT(*) AS count FROM orders WHERE id IS NULL AND name IS NULL`).get().count;

if (count > 0) {
  const deleted = db.prepare(`DELETE FROM orders WHERE id IS NULL AND name IS NULL`).run();
  console.log(`✅ Deleted ${deleted.changes} null rows from orders table`);
} else {
  console.log("✅ No null rows found");
}

db.close();
