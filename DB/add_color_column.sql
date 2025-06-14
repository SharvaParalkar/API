-- Add color column if it doesn't exist
ALTER TABLE orders ADD COLUMN color TEXT DEFAULT 'White'; 