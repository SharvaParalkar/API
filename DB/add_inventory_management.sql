-- Add inventory management columns to filament_inventory table
ALTER TABLE filament_inventory ADD COLUMN print_split INTEGER DEFAULT 100;
ALTER TABLE filament_inventory ADD COLUMN sale_split INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN allocated_printing INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN allocated_sale INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN checked_out_sharva INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN checked_out_nathan INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN checked_out_evan INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN checked_out_pablo INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN checked_out_peter INTEGER DEFAULT 0;
ALTER TABLE filament_inventory ADD COLUMN available_printing INTEGER DEFAULT 0; 