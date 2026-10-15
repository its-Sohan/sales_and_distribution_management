-- Cloudflare D1 Migration for Hisab Counter
-- Initial schema: Receipts, Transactions, Custom Catalog, and Workspace state

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  customer_id TEXT,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  tendered INTEGER NOT NULL,
  change INTEGER NOT NULL,
  due INTEGER NOT NULL,
  method TEXT NOT NULL,
  address TEXT,
  remarks TEXT,
  payload_json TEXT NOT NULL,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);

CREATE TABLE IF NOT EXISTS account_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  note TEXT,
  receipt_id TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON account_transactions(customer_id);

CREATE TABLE IF NOT EXISTS custom_products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  en TEXT NOT NULL,
  bn TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER,
  stock INTEGER NOT NULL,
  purchased INTEGER,
  group_id TEXT,
  variant_name TEXT,
  variant_name_bn TEXT,
  archived INTEGER DEFAULT 0,
  art TEXT,
  color TEXT,
  detail TEXT,
  detail_bn TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_customers (
  id TEXT PRIMARY KEY,
  en TEXT NOT NULL,
  bn TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  credit_limit INTEGER,
  opening_balance INTEGER,
  note TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_workspace (
  shop_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 2,
  state_json TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
