// SQL generator script to populate Cloudflare D1 with generated historical data
const fs = require('fs');

const raw = fs.readFileSync('scripts/historical_seed_data.json', 'utf8');
const data = JSON.parse(raw);

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

const statements = [];

// 1. Insert Custom Products
for (const p of data.customProducts) {
  statements.push(`INSERT OR REPLACE INTO custom_products (
    id, code, en, bn, category, unit, price, cost, stock, purchased, kind,
    group_id, variant_name, variant_name_bn, archived, art, color,
    detail, detail_bn, warranty, inventory_value, valuation_status, updated_at
  ) VALUES (
    ${escapeSql(p.id)}, ${escapeSql(p.code)}, ${escapeSql(p.en)}, '', ${escapeSql(p.category)},
    ${escapeSql(p.unit)}, ${escapeSql(p.price)}, ${escapeSql(p.cost)}, ${escapeSql(p.stock)},
    ${escapeSql(p.purchased)}, ${escapeSql(p.kind)}, NULL, NULL, NULL, 0,
    ${escapeSql(p.art)}, ${escapeSql(p.color)}, ${escapeSql(p.detail)}, ${escapeSql(p.detailBn)},
    ${escapeSql(p.warranty || '')}, ${escapeSql(p.inventoryValue)}, ${escapeSql(p.valuationStatus)}, CURRENT_TIMESTAMP
  );`);
}

// 2. Insert Custom Customers
for (const c of data.customCustomers) {
  statements.push(`INSERT OR REPLACE INTO custom_customers (
    id, en, bn, phone, address, opening_balance, note, updated_at
  ) VALUES (
    ${escapeSql(c.id)}, ${escapeSql(c.en)}, ${escapeSql(c.bn)}, ${escapeSql(c.phone)},
    ${escapeSql(c.address)}, ${escapeSql(c.openingBalance)}, ${escapeSql(c.note)}, CURRENT_TIMESTAMP
  );`);
}

// 3. Insert Suppliers
for (const s of data.suppliers) {
  statements.push(`INSERT OR REPLACE INTO suppliers (id, payload_json) VALUES (
    ${escapeSql(s.id)}, ${escapeSql(JSON.stringify(s))}
  );`);
}

// 4. Insert Purchases
for (const p of data.purchases) {
  const payload = {
    ...p,
    currencyVersion: 2
  };
  statements.push(`INSERT OR REPLACE INTO purchases (
    id, created_at, supplier, method, note, total, payload_json
  ) VALUES (
    ${escapeSql(p.id)}, ${escapeSql(p.createdAt)}, ${escapeSql(p.supplier)},
    ${escapeSql(p.method)}, ${escapeSql(p.note)}, ${escapeSql(p.total)},
    ${escapeSql(JSON.stringify(payload))}
  );`);
}

// 5. Insert Supplier Payments
for (const sp of data.supplierPayments) {
  statements.push(`INSERT OR REPLACE INTO supplier_payments (
    id, purchase_id, payload_json
  ) VALUES (
    ${escapeSql(sp.id)}, ${escapeSql(sp.purchaseId)}, ${escapeSql(JSON.stringify(sp))}
  );`);
}

// 6. Insert Expenses
for (const e of data.expenses) {
  statements.push(`INSERT OR REPLACE INTO expenses (
    id, created_at, category, amount, method, note
  ) VALUES (
    ${escapeSql(e.id)}, ${escapeSql(e.createdAt)}, ${escapeSql(e.category)},
    ${escapeSql(e.amount)}, ${escapeSql(e.method)}, ${escapeSql(e.note)}
  );`);
}

// 7. Insert Account Transactions
for (const tx of data.transactions) {
  statements.push(`INSERT OR REPLACE INTO account_transactions (
    id, customer_id, type, amount, created_at, note, receipt_id
  ) VALUES (
    ${escapeSql(tx.id)}, ${escapeSql(tx.customerId)}, ${escapeSql(tx.type)},
    ${escapeSql(tx.amount)}, ${escapeSql(tx.createdAt)}, ${escapeSql(tx.note)}, NULL
  );`);
}

// 8. Insert Receipts
for (const r of data.receipts) {
  statements.push(`INSERT OR REPLACE INTO receipts (
    id, receipt_number, created_at, customer_id,
    subtotal, discount, total, paid, tendered, change, due,
    method, address, remarks, payload_json
  ) VALUES (
    ${escapeSql(r.id)}, ${escapeSql(r.number)}, ${escapeSql(r.createdAt)}, ${escapeSql(r.customerId)},
    ${escapeSql(r.subtotal)}, ${escapeSql(r.discount)}, ${escapeSql(r.total)},
    ${escapeSql(r.paid)}, ${escapeSql(r.tendered)}, ${escapeSql(r.change)}, ${escapeSql(r.due)},
    ${escapeSql(r.method)}, ${escapeSql(r.address || null)}, ${escapeSql(r.remarks || null)},
    ${escapeSql(JSON.stringify(r))}
  );`);
}

// 9. Update App Revision
statements.push(`UPDATE app_revision SET revision = revision + 1 WHERE id = 1;`);

fs.writeFileSync('scripts/seed_historical_remote.sql', statements.join('\n'));
console.log(`Generated scripts/seed_historical_remote.sql with ${statements.length} SQL commands.`);

// Also chunk into smaller files if needed (e.g., 200 statements per file for wrangler execute)
const CHUNK_SIZE = 200;
const chunks = [];
for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
  chunks.push(statements.slice(i, i + CHUNK_SIZE));
}
chunks.forEach((chunk, index) => {
  fs.writeFileSync(`scripts/seed_part_${index + 1}.sql`, chunk.join('\n'));
});
console.log(`Split into ${chunks.length} parts in scripts/seed_part_*.sql for reliable remote D1 execution.`);
