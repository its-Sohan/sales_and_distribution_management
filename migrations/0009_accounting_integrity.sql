-- Currency migration 0008 is immutable. Historical JSON repair is a separate,
-- reviewed operation with per-record provenance and compare-and-swap guards.
ALTER TABLE custom_products ADD COLUMN inventory_value INTEGER CHECK (inventory_value IS NULL OR inventory_value >= 0);
ALTER TABLE custom_products ADD COLUMN valuation_status TEXT CHECK (valuation_status IS NULL OR valuation_status IN ('verified', 'provided', 'unverified'));
ALTER TABLE stock_adjustments ADD COLUMN cost_amount INTEGER;

CREATE TABLE accounting_repairs (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting_quarantine (
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, record_id)
);

CREATE TABLE accounting_checkpoints (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency_version INTEGER NOT NULL CHECK (currency_version = 2),
  historical_status TEXT NOT NULL CHECK (historical_status IN ('pending', 'verified', 'quarantined')),
  repair_manifest_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO accounting_checkpoints (id, currency_version, historical_status) VALUES (1, 2, 'pending');
