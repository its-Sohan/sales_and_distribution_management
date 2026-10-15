-- Supplier identities and immutable payments/reviews; historical purchases remain untouched.
CREATE TABLE suppliers (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
CREATE TABLE supplier_payments (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES purchases(id),
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_supplier_payments_purchase ON supplier_payments(purchase_id);
CREATE TABLE purchase_settlements (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  payload_json TEXT NOT NULL
);
