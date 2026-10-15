-- Supplier invoices and stock arrivals are separate immutable events.
CREATE TABLE stock_receivings (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES purchases(id),
  created_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX idx_receivings_purchase ON stock_receivings(purchase_id);
