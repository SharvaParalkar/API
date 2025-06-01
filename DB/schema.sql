-- orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  submitted_at DATETIME,
  status TEXT,
  assigned_staff TEXT,
  est_price REAL,
  assigned_price REAL,
  payment_status TEXT,
  notes TEXT,         -- customer notes
  order_notes TEXT,    -- staff-added internal notes
  updated_by TEXT     -- track who last updated the order
);

-- files
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  filename TEXT,
  filepath TEXT,
  estimated_weight REAL,
  estimated_price REAL,
  log TEXT
);

-- staff
CREATE TABLE IF NOT EXISTS staff (
  name TEXT PRIMARY KEY,
  venmo TEXT,
  zelle TEXT,
  paypal TEXT,
  cashapp TEXT
);

-- coupons
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT,
  discount_value REAL,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0
);

-- filament_inventory
CREATE TABLE IF NOT EXISTS filament_inventory (
  id TEXT PRIMARY KEY,
  material TEXT,
  color TEXT,
  weight_grams INTEGER,
  price_per_kg REAL
);

-- filament_orders
CREATE TABLE IF NOT EXISTS filament_orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  submitted_at DATETIME,
  status TEXT,
  inventory_id TEXT REFERENCES filament_inventory(id),
  quantity INTEGER,
  total_price REAL,
  payment_status TEXT,
  notes TEXT,
  assigned_staff TEXT
);

-- analytics
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT,
  source_id TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

