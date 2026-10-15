-- Services are billable catalog entries without physical stock.
ALTER TABLE custom_products ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind = 'service');
