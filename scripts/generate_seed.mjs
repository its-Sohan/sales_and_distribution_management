import { writeFileSync } from 'node:fs'

const customers = [
  {
    id: 'c-apex-solutions',
    en: 'Apex Software Solutions',
    bn: 'এপেক্স সফটওয়্যার সলিউশনস',
    phone: '01912345678',
    address: 'Suite 402, Motijheel C/A, Dhaka',
    opening_balance: 0,
    note: 'Corporate client - 12 workstations'
  },
  {
    id: 'c-tanvir-ahmed',
    en: 'Tanvir Ahmed',
    bn: 'তানভীর আহমেদ',
    phone: '01711223344',
    address: 'House 14, Road 7, Dhanmondi, Dhaka',
    opening_balance: 0,
    note: 'Freelance video editor & 3D artist'
  },
  {
    id: 'c-rafiqul-islam',
    en: 'Rafiqul Islam',
    bn: 'রফিকুল ইসলাম',
    phone: '01819556677',
    address: 'Sector 4, Uttara, Dhaka',
    opening_balance: 0,
    note: 'Senior Lecturer, Physics'
  },
  {
    id: 'c-nusrat-jahan',
    en: 'Nusrat Jahan',
    bn: 'নুসরাত জাহান',
    phone: '01622334455',
    address: 'Mirpur-10, Dhaka',
    opening_balance: 0,
    note: 'Computer Science student, CSE'
  },
  {
    id: 'c-farhan-chowdhury',
    en: 'Farhan Chowdhury',
    bn: 'ফারহান চৌধুরী',
    phone: '01755667788',
    address: 'Kazi Nazrul Islam Road, Mohammadpur, Dhaka',
    opening_balance: 0,
    note: 'Gaming PC enthusiast & regular client'
  }
]

const suppliers = [
  {
    id: 'sup-star-tech',
    name: 'Star Tech & Engineering Ltd',
    phone: '01713001122',
    address: 'Multiplan Center, Level 9, Elephant Road, Dhaka',
    note: 'Official distributor for SSD, RAM, GPU, Monitors',
    archived: false
  },
  {
    id: 'sup-smart-tech',
    name: 'Smart Technologies (BD) Ltd',
    phone: '01730334455',
    address: 'Jahir Smart Tower, Agargaon, Dhaka',
    note: 'Authorized distributor for Gigabyte, Corsair, HP, networking',
    archived: false
  },
  {
    id: 'sup-global-brand',
    name: 'Global Brand PLC',
    phone: '01715667788',
    address: 'IDB Bhaban, Level 4, Rokeya Sarani, Dhaka',
    note: 'Authorized distributor for Asus, A4Tech, Western Digital',
    archived: false
  },
  {
    id: 'sup-ucc',
    name: 'UCC (Universal Computer Computer)',
    phone: '01712998877',
    address: 'Eastern Plus, Shantinagar, Dhaka',
    note: 'Distributor for MSI, Transcend, Sapphire',
    archived: false
  }
]

// Product prices and costs reference:
// mouse-opt: price 350, cost 240
// mouse-wireless: price 650, cost 450
// keyboard-usb: price 550, cost 380
// keyboard-rgb: price 1200, cost 850
// mousepad: price 150, cost 80
// pendrive-32gb: price 450, cost 340
// pendrive-64gb: price 650, cost 500
// cable-hdmi: price 250, cost 150
// cable-vga: price 200, cost 120
// cable-lan: price 150, cost 80
// headphone: price 850, cost 600
// speaker-mini: price 650, cost 450
// casing-hdd: price 550, cost 380
// usb-hub: price 350, cost 220
// cleaner-kit: price 150, cost 80
// service-windows: price 500, cost 0 (service)
// service-pc-clean: price 400, cost 0 (service)
// service-laptop-clean: price 800, cost 0 (service)
// service-mobo: price 1000, cost 0 (service)
// service-display: price 500, cost 0 (service)
// service-data: price 1500, cost 0 (service)
// ssd-128gb: price 1450, cost 1180
// ssd-256gb: price 2600, cost 2150
// ram-8gb-ddr4: price 2200, cost 1800
// psu-450w: price 1600, cost 1250
// thermal-paste: price 180, cost 90
// cable-power: price 150, cost 80

const purchases = [
  {
    id: 'pur-gb-2026-001',
    createdAt: '2026-10-01T09:30:00.000Z',
    supplier: 'Global Brand PLC',
    supplierId: 'sup-global-brand',
    method: 'bank',
    note: 'Stock replenishment: Keyboards, mice, and mousepads',
    paid: 13900,
    lines: [
      { productId: 'keyboard-usb', quantity: 15000, unitCost: 380, total: 5700 },
      { productId: 'mouse-opt', quantity: 20000, unitCost: 240, total: 4800 },
      { productId: 'mousepad', quantity: 30000, unitCost: 80, total: 2400 },
      { productId: 'casing-hdd', quantity: 2000, unitCost: 380, total: 760 },
      { productId: 'usb-hub', quantity: 1000, unitCost: 240, total: 240 }
    ],
    total: 13900
  },
  {
    id: 'pur-st-2026-002',
    createdAt: '2026-10-05T11:15:00.000Z',
    supplier: 'Star Tech & Engineering Ltd',
    supplierId: 'sup-star-tech',
    method: 'cash',
    note: 'High-speed storage & RAM components batch',
    paid: 15000, // total is 24350, remaining 9350 due
    lines: [
      { productId: 'ssd-256gb', quantity: 5000, unitCost: 2150, total: 10750 },
      { productId: 'ssd-128gb', quantity: 5000, unitCost: 1180, total: 5900 },
      { productId: 'ram-8gb-ddr4', quantity: 4000, unitCost: 1800, total: 7200 },
      { productId: 'thermal-paste', quantity: 5000, unitCost: 100, total: 500 }
    ],
    total: 24350
  },
  {
    id: 'pur-smart-2026-003',
    createdAt: '2026-10-08T14:00:00.000Z',
    supplier: 'Smart Technologies (BD) Ltd',
    supplierId: 'sup-smart-tech',
    mode: 'invoice',
    invoiceNumber: 'SMT-2026-8819',
    method: 'bank',
    paid: 12500,
    lines: [],
    invoiceLines: [
      { id: 'inv-l1', description: 'CAT6 High Quality LAN Patch Cord 3M (50 pcs)', unit: 'pc', quantity: 50000, total: 4000 },
      { id: 'inv-l2', description: 'USB Pendrive 64GB Metal High-Speed (15 pcs)', unit: 'pc', quantity: 15000, total: 7500 },
      { id: 'inv-l3', description: 'HDMI 1.5M 4K Braided Cables (10 pcs)', unit: 'pc', quantity: 10000, total: 1000 }
    ],
    total: 12500,
    note: 'Invoice purchase awaiting physical receiving'
  }
]

const stockReceivings = [
  {
    id: 'rec-smt-batch-01',
    purchaseId: 'pur-smart-2026-003',
    createdAt: '2026-10-09T10:00:00.000Z',
    currencyVersion: 2,
    lines: [
      { invoiceLineId: 'inv-l1', productId: 'cable-lan', quantity: 50000, unitCost: 80, total: 4000 },
      { invoiceLineId: 'inv-l2', productId: 'pendrive-64gb', quantity: 15000, unitCost: 500, total: 7500 },
      { invoiceLineId: 'inv-l3', productId: 'cable-hdmi', quantity: 10000, unitCost: 100, total: 1000 }
    ],
    note: 'All goods inspected and added to physical inventory'
  }
]

const supplierPayments = [
  {
    id: 'spay-startech-01',
    purchaseId: 'pur-st-2026-002',
    supplierId: 'sup-star-tech',
    amount: 5000,
    method: 'bank',
    type: 'payment',
    createdAt: '2026-10-10T16:20:00.000Z',
    note: 'Bank transfer towards outstanding purchase balance'
  }
]

const expenses = [
  {
    id: 'exp-oct-rent',
    createdAt: '2026-10-02T10:00:00.000Z',
    category: 'rent',
    amount: 15000,
    method: 'bank',
    note: 'Shop commercial space rent for October 2026'
  },
  {
    id: 'exp-oct-desco',
    createdAt: '2026-10-06T12:30:00.000Z',
    category: 'utility',
    amount: 2850,
    method: 'mobile',
    note: 'DESCO commercial electricity bill payment via bKash'
  },
  {
    id: 'exp-oct-isp',
    createdAt: '2026-10-07T11:00:00.000Z',
    category: 'utility',
    amount: 1200,
    method: 'mobile',
    note: 'Dedicated optical fiber broadband bill (50 Mbps)'
  },
  {
    id: 'exp-oct-tea-snacks',
    createdAt: '2026-10-10T17:45:00.000Z',
    category: 'other',
    amount: 450,
    method: 'cash',
    note: 'Tea, snacks, and mineral water for staff & clients'
  },
  {
    id: 'exp-oct-courier',
    createdAt: '2026-10-11T14:15:00.000Z',
    category: 'transport',
    amount: 250,
    method: 'cash',
    note: 'Courier delivery charge from distributor warehouse'
  }
]

const stockAdjustments = [
  {
    id: 'adj-oct-01',
    createdAt: '2026-10-09T18:00:00.000Z',
    productId: 'cable-lan',
    quantity: -1000,
    costAmount: -80,
    reason: 'damage',
    counted: null,
    note: 'RJ45 clip fractured during display cable demonstration'
  }
]

// Now let's craft realistic receipts (starting number: 100025)
const receipts = [
  // 100025: Walk-in cash sale of optical mouse and mousepad
  {
    id: 'rcpt-2026-100025',
    number: 100025,
    createdAt: '2026-10-03T11:20:00.000Z',
    customer: null,
    customerId: null,
    lines: [
      { productId: 'mouse-opt', quantity: 1000, price: 350, gross: 350, cost: 240, costAmount: 240, costStatus: 'recorded', warranty: '1 Year Warranty', unit: 'pc', costKnown: true },
      { productId: 'mousepad', quantity: 1000, price: 150, gross: 150, cost: 80, costAmount: 80, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 500,
    discount: 0,
    total: 500,
    paid: 500,
    tendered: 500,
    change: 0,
    due: 0,
    method: 'cash'
  },
  // 100026: Servicing + upgrade for Tanvir Ahmed (bKash / mobile)
  {
    id: 'rcpt-2026-100026',
    number: 100026,
    createdAt: '2026-10-04T15:30:00.000Z',
    customer: {
      id: 'c-tanvir-ahmed',
      en: 'Tanvir Ahmed',
      bn: 'তানভীর আহমেদ',
      phone: '01711223344',
      address: 'House 14, Road 7, Dhanmondi, Dhaka'
    },
    customerId: 'c-tanvir-ahmed',
    lines: [
      { productId: 'ssd-256gb', quantity: 1000, price: 2600, gross: 2600, cost: 2150, costAmount: 2150, costStatus: 'recorded', warranty: '3 Years Replacement Warranty', unit: 'pc', costKnown: true },
      { productId: 'ram-8gb-ddr4', quantity: 1000, price: 2200, gross: 2200, cost: 1800, costAmount: 1800, costStatus: 'recorded', warranty: 'Lifetime Warranty', unit: 'pc', costKnown: true },
      { productId: 'service-windows', quantity: 1000, price: 500, gross: 500, cost: 0, costAmount: 0, costStatus: 'unassigned', warranty: '', kind: 'service', unit: 'pc', costKnown: false }
    ],
    subtotal: 5300,
    discount: 100,
    total: 5200,
    paid: 5200,
    tendered: 5200,
    change: 0,
    due: 0,
    method: 'mobile',
    remarks: 'bKash TrxID: 9KD7A281P0'
  },
  // 100027: Laptop deep clean & service for Nusrat Jahan (cash)
  {
    id: 'rcpt-2026-100027',
    number: 100027,
    createdAt: '2026-10-07T14:10:00.000Z',
    customer: {
      id: 'c-nusrat-jahan',
      en: 'Nusrat Jahan',
      bn: 'নুসরাত জাহান',
      phone: '01622334455',
      address: 'Mirpur-10, Dhaka'
    },
    customerId: 'c-nusrat-jahan',
    lines: [
      { productId: 'service-laptop-clean', quantity: 1000, price: 800, gross: 800, cost: 0, costAmount: 0, costStatus: 'unassigned', warranty: '7 Days Service Warranty', kind: 'service', unit: 'pc', costKnown: false },
      { productId: 'thermal-paste', quantity: 1000, price: 180, gross: 180, cost: 90, costAmount: 90, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 980,
    discount: 30,
    total: 950,
    paid: 950,
    tendered: 1000,
    change: 50,
    due: 0,
    method: 'cash'
  },
  // 100028: Corporate order for Apex Software Solutions with partial due
  {
    id: 'rcpt-2026-100028',
    number: 100028,
    createdAt: '2026-10-08T16:45:00.000Z',
    customer: {
      id: 'c-apex-solutions',
      en: 'Apex Software Solutions',
      bn: 'এপেক্স সফটওয়্যার সলিউশনস',
      phone: '01912345678',
      address: 'Suite 402, Motijheel C/A, Dhaka'
    },
    customerId: 'c-apex-solutions',
    lines: [
      { productId: 'keyboard-usb', quantity: 5000, price: 550, gross: 2750, cost: 380, costAmount: 1900, costStatus: 'recorded', warranty: '1 Year Warranty', unit: 'pc', costKnown: true },
      { productId: 'mouse-opt', quantity: 5000, price: 350, gross: 1750, cost: 240, costAmount: 1200, costStatus: 'recorded', warranty: '1 Year Warranty', unit: 'pc', costKnown: true },
      { productId: 'mousepad', quantity: 5000, price: 150, gross: 750, cost: 80, costAmount: 400, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true },
      { productId: 'cable-lan', quantity: 4000, price: 150, gross: 600, cost: 80, costAmount: 320, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 5850,
    discount: 250,
    total: 5600,
    paid: 3600, // 2000 due
    tendered: 3600,
    change: 0,
    due: 2000,
    method: 'bank',
    remarks: 'Cheque No: DBBL-9923841'
  },
  // 100029: Gaming accessories for Farhan Chowdhury
  {
    id: 'rcpt-2026-100029',
    number: 100029,
    createdAt: '2026-10-10T12:00:00.000Z',
    customer: {
      id: 'c-farhan-chowdhury',
      en: 'Farhan Chowdhury',
      bn: 'ফারহান চৌধুরী',
      phone: '01755667788',
      address: 'Kazi Nazrul Islam Road, Mohammadpur, Dhaka'
    },
    customerId: 'c-farhan-chowdhury',
    lines: [
      { productId: 'keyboard-rgb', quantity: 1000, price: 1200, gross: 1200, cost: 850, costAmount: 850, costStatus: 'recorded', warranty: '1 Year Warranty', unit: 'pc', costKnown: true },
      { productId: 'headphone', quantity: 1000, price: 850, gross: 850, cost: 600, costAmount: 600, costStatus: 'recorded', warranty: '6 Months Warranty', unit: 'pc', costKnown: true },
      { productId: 'cable-hdmi', quantity: 1000, price: 250, gross: 250, cost: 150, costAmount: 150, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 2300,
    discount: 50,
    total: 2250,
    paid: 2250,
    tendered: 2250,
    change: 0,
    due: 0,
    method: 'mobile',
    remarks: 'Nagad TrxID: 7120AA88'
  },
  // 100030: Walk-in sale with USB accessories & cleaning kit
  {
    id: 'rcpt-2026-100030',
    number: 100030,
    createdAt: '2026-10-11T16:15:00.000Z',
    customer: null,
    customerId: null,
    lines: [
      { productId: 'pendrive-32gb', quantity: 1000, price: 450, gross: 450, cost: 340, costAmount: 340, costStatus: 'recorded', warranty: '5 Years Warranty', unit: 'pc', costKnown: true },
      { productId: 'cleaner-kit', quantity: 1000, price: 150, gross: 150, cost: 80, costAmount: 80, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 600,
    discount: 0,
    total: 600,
    paid: 600,
    tendered: 1000,
    change: 400,
    due: 0,
    method: 'cash'
  },
  // 100031: Power supply & power cord sale to Rafiqul Islam
  {
    id: 'rcpt-2026-100031',
    number: 100031,
    createdAt: '2026-10-13T11:40:00.000Z',
    customer: {
      id: 'c-rafiqul-islam',
      en: 'Rafiqul Islam',
      bn: 'রফিকুল ইসলাম',
      phone: '01819556677',
      address: 'Sector 4, Uttara, Dhaka'
    },
    customerId: 'c-rafiqul-islam',
    lines: [
      { productId: 'psu-450w', quantity: 1000, price: 1600, gross: 1600, cost: 1250, costAmount: 1250, costStatus: 'recorded', warranty: '2 Years Warranty', unit: 'pc', costKnown: true },
      { productId: 'cable-power', quantity: 1000, price: 150, gross: 150, cost: 80, costAmount: 80, costStatus: 'recorded', warranty: '', unit: 'pc', costKnown: true }
    ],
    subtotal: 1750,
    discount: 50,
    total: 1700,
    paid: 1700,
    tendered: 2000,
    change: 300,
    due: 0,
    method: 'cash'
  }
]

// Customer account transactions
const accountTransactions = [
  // Due recorded for 100028
  {
    id: 'tx-due-100028',
    customerId: 'c-apex-solutions',
    type: 'sale_due',
    amount: 2000,
    createdAt: '2026-10-08T16:45:00.000Z',
    receiptId: 'rcpt-2026-100028',
    note: 'Bill #100028 partial due balance'
  },
  // Apex pays 1000 towards due
  {
    id: 'tx-pay-apex-01',
    customerId: 'c-apex-solutions',
    type: 'payment',
    amount: 1000,
    createdAt: '2026-10-12T14:30:00.000Z',
    note: 'bKash payment towards due balance (TrxID: 98KA9812)'
  }
]

// Customer return (receipt 100025: returned mousepad 150)
const returns = [
  {
    id: 'ret-2026-001',
    createdAt: '2026-10-04T10:15:00.000Z',
    receiptId: 'rcpt-2026-100025',
    receiptNumber: 100025,
    customerId: null,
    lines: [
      { productId: 'mousepad', quantity: 1000, amount: 150, cost: 80, costStatus: 'recorded', condition: 'sellable' }
    ],
    refunded: 150,
    currencyVersion: 2,
    method: 'cash',
    restock: 1,
    note: 'Customer chose wrong size; returned in original unopened packaging',
    reason: 'Customer exchange preference',
    operator: 'Admin',
    settlement: {
      dueReduced: 0,
      exchangeCredit: 0,
      payout: 150,
      creditIssued: 0,
      received: 0,
      newDue: 0,
      method: 'cash'
    }
  }
]

// Build SQL statements
let sql = `-- Historical seed data for MASUM-IT / hisab-db
-- Idempotent and consistent with currencyVersion 2 (Taka integer amounts)

`

// Customers
for (const c of customers) {
  sql += `INSERT OR REPLACE INTO custom_customers (id, en, bn, phone, address, opening_balance, note, updated_at) VALUES ('${c.id}', '${c.en}', '${c.bn}', '${c.phone}', '${c.address}', ${c.opening_balance}, '${c.note}', CURRENT_TIMESTAMP);\n`
}
sql += '\n'

// Suppliers
for (const s of suppliers) {
  const payload = JSON.stringify(s)
  sql += `INSERT OR REPLACE INTO suppliers (id, payload_json) VALUES ('${s.id}', '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Purchases
for (const p of purchases) {
  const payload = JSON.stringify({
    id: p.id,
    createdAt: p.createdAt,
    supplier: p.supplier,
    supplierId: p.supplierId,
    paid: p.paid,
    method: p.method,
    mode: p.mode,
    invoiceNumber: p.invoiceNumber,
    lines: p.lines,
    invoiceLines: p.invoiceLines,
    total: p.total,
    currencyVersion: 2,
    note: p.note
  })
  sql += `INSERT OR REPLACE INTO purchases (id, created_at, supplier, method, note, total, payload_json) VALUES ('${p.id}', '${p.createdAt}', '${p.supplier}', '${p.method}', '${p.note}', ${p.total}, '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Stock Receivings
for (const r of stockReceivings) {
  const payload = JSON.stringify(r)
  sql += `INSERT OR REPLACE INTO stock_receivings (id, purchase_id, created_at, payload_json) VALUES ('${r.id}', '${r.purchaseId}', '${r.createdAt}', '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Supplier Payments
for (const sp of supplierPayments) {
  const payload = JSON.stringify(sp)
  sql += `INSERT OR REPLACE INTO supplier_payments (id, purchase_id, payload_json) VALUES ('${sp.id}', '${sp.purchaseId}', '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Expenses
for (const e of expenses) {
  sql += `INSERT OR REPLACE INTO expenses (id, created_at, category, amount, method, note) VALUES ('${e.id}', '${e.createdAt}', '${e.category}', ${e.amount}, '${e.method}', '${e.note}');\n`
}
sql += '\n'

// Stock Adjustments
for (const a of stockAdjustments) {
  sql += `INSERT OR REPLACE INTO stock_adjustments (id, created_at, product_id, quantity, reason, counted, note, cost_amount) VALUES ('${a.id}', '${a.createdAt}', '${a.productId}', ${a.quantity}, '${a.reason}', ${a.counted === null ? 'NULL' : a.counted}, '${a.note}', ${a.costAmount});\n`
}
sql += '\n'

// Receipts
for (const r of receipts) {
  const payload = JSON.stringify({
    id: r.id,
    number: r.number,
    createdAt: r.createdAt,
    customerId: r.customerId,
    customer: r.customer,
    lines: r.lines,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    paid: r.paid,
    tendered: r.tendered,
    change: r.change,
    due: r.due,
    method: r.method,
    remarks: r.remarks,
    currencyVersion: 2
  })
  sql += `INSERT OR REPLACE INTO receipts (id, receipt_number, created_at, customer_id, subtotal, discount, total, paid, tendered, change, due, method, remarks, payload_json) VALUES ('${r.id}', ${r.number}, '${r.createdAt}', ${r.customerId ? `'${r.customerId}'` : 'NULL'}, ${r.subtotal}, ${r.discount}, ${r.total}, ${r.paid}, ${r.tendered}, ${r.change}, ${r.due}, '${r.method}', ${r.remarks ? `'${r.remarks}'` : 'NULL'}, '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Account transactions
for (const t of accountTransactions) {
  sql += `INSERT OR REPLACE INTO account_transactions (id, customer_id, type, amount, created_at, note, receipt_id) VALUES ('${t.id}', '${t.customerId}', '${t.type}', ${t.amount}, '${t.createdAt}', '${t.note}', ${t.receiptId ? `'${t.receiptId}'` : 'NULL'});\n`
}
sql += '\n'

// Returns
for (const ret of returns) {
  const payload = JSON.stringify(ret)
  sql += `INSERT OR REPLACE INTO returns (id, created_at, receipt_id, receipt_number, customer_id, refunded, method, restock, note, payload_json) VALUES ('${ret.id}', '${ret.createdAt}', '${ret.receiptId}', ${ret.receiptNumber}, ${ret.customerId ? `'${ret.customerId}'` : 'NULL'}, ${ret.refunded}, '${ret.method}', ${ret.restock}, '${ret.note}', '${payload.replaceAll("'", "''")}');\n`
}
sql += '\n'

// Bump app revision
sql += 'UPDATE app_revision SET revision = revision + 1 WHERE id = 1;\n'

writeFileSync('scripts/seed_historic_data.sql', sql)
console.log('Generated scripts/seed_historic_data.sql successfully!')
