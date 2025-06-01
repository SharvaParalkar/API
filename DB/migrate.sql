-- Attach the old database
ATTACH DATABASE './DB/db/filamentbros.sqlite.backup' AS old_db;

-- Drop existing tables if they exist
DROP TABLE IF EXISTS orders;

-- Create the new schema
.read DB/schema.sql

-- Copy data from old to new, preserving and converting existing data
INSERT INTO main.orders (
    id, name, email, phone, submitted_at, status,
    assigned_staff, est_price, assigned_price, payment_status,
    notes, order_notes, updated_by, last_updated, claimed_by
)
SELECT 
    id, 
    name, 
    email, 
    phone, 
    submitted_at, 
    COALESCE(status, 'pending') as status,
    COALESCE(assigned_staff, updated_by) as assigned_staff,
    COALESCE(est_price, 0) as est_price,
    assigned_price,
    payment_status,
    notes,
    order_notes,
    COALESCE(updated_by, 'system') as updated_by,
    COALESCE(last_updated, submitted_at) as last_updated,
    CASE 
        WHEN claimed = 1 THEN COALESCE(updated_by, 'system')
        ELSE NULL 
    END as claimed_by
FROM old_db.orders;

-- Detach the old database
DETACH DATABASE old_db; 