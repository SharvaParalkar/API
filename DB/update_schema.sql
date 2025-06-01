-- Add missing columns
ALTER TABLE orders ADD COLUMN claimed_by TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN updated_by TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN last_updated DATETIME DEFAULT NULL;
ALTER TABLE orders ADD COLUMN order_notes TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN assigned_price REAL DEFAULT NULL;
ALTER TABLE orders ADD COLUMN assigned_staff TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN est_price REAL DEFAULT NULL;

-- Update claimed_by based on claimed status
UPDATE orders 
SET claimed_by = CASE 
    WHEN claimed = 1 THEN updated_by 
    ELSE NULL 
END;

-- Drop the claimed column (we'll use claimed_by instead)
CREATE TABLE orders_new (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    submitted_at DATETIME,
    status TEXT,
    assigned_staff TEXT,
    est_price REAL,
    payment_status TEXT,
    notes TEXT,
    assigned_price REAL,
    order_notes TEXT,
    updated_by TEXT,
    last_updated DATETIME,
    claimed_by TEXT
);

-- Copy data from the old table to the new one
INSERT INTO orders_new 
SELECT 
    id, name, email, phone, submitted_at, status, 
    assigned_staff, est_price, payment_status, notes,
    assigned_price, order_notes, updated_by, last_updated,
    claimed_by
FROM orders;

-- Drop the old table
DROP TABLE orders;

-- Rename the new table to orders
ALTER TABLE orders_new RENAME TO orders; 