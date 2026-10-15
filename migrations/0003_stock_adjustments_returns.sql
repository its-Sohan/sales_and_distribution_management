-- Cloudflare D1 Migration for Hisab Counter
-- Adds stock adjustments, bill returns/refunds, and purchase void corrections.
-- Originals are never mutated: a purchase void lives in purchase_voids and is
-- joined against purchases; adjustments and returns are append-only events.

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  counted INTEGER,
  note TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adjustments_created_at ON stock_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  receipt_number INTEGER NOT NULL,
  customer_id TEXT,
  refunded INTEGER NOT NULL,
  method TEXT NOT NULL,
  restock INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  payload_json TEXT NOT NULL,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);

CREATE TABLE IF NOT EXISTS purchase_voids (
  purchase_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reason TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);
