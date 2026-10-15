-- Cloudflare D1 Migration for Hisab Counter
-- Migration 0004: Indexes for Bi-Directional Delta Synchronization
CREATE INDEX IF NOT EXISTS idx_receipts_synced_at ON receipts(synced_at);
CREATE INDEX IF NOT EXISTS idx_transactions_synced_at ON account_transactions(synced_at);
CREATE INDEX IF NOT EXISTS idx_purchases_synced_at ON purchases(synced_at);
CREATE INDEX IF NOT EXISTS idx_expenses_synced_at ON expenses(synced_at);
CREATE INDEX IF NOT EXISTS idx_adjustments_synced_at ON stock_adjustments(synced_at);
CREATE INDEX IF NOT EXISTS idx_returns_synced_at ON returns(synced_at);
CREATE INDEX IF NOT EXISTS idx_purchase_voids_synced_at ON purchase_voids(synced_at);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON custom_products(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON custom_customers(updated_at);
