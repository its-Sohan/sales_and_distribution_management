-- Warranty is stored per product code; sold lines retain their warranty in receipt payloads.
ALTER TABLE custom_products ADD COLUMN warranty TEXT NOT NULL DEFAULT '';
