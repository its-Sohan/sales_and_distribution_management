-- Cloudflare D1 Migration for Hisab Counter
-- Adds stock purchase records (audit trail for inventory in) and shop expenses.

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  supplier TEXT,
  method TEXT,
  note TEXT,
  total INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
