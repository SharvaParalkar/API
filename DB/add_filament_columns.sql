-- Add stock and image_url columns to filament_inventory table
ALTER TABLE filament_inventory ADD COLUMN stock INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN image_url TEXT; 