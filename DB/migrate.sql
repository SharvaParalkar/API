-- Attach the old database
ATTACH DATABASE 'DB/db/filamentbros.sqlite.backup' AS old_db;

-- Create the new schema
.read DB/schema.sql

-- Copy data from old to new
INSERT INTO main.orders (
    id, name, email, phone, submitted_at, status,
    assigned_staff, est_price, assigned_price, payment_status,
    notes, order_notes, updated_by, last_updated, claimed_by
)
SELECT 
    id, name, email, phone, submitted_at, status,
    assigned_staff, est_price, assigned_price, payment_status,
    notes, order_notes, updated_by, last_updated, claimed_by
FROM old_db.orders;

-- Detach the old database
DETACH DATABASE old_db; 