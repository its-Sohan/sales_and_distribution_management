import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { createRepairManifest, applyRepairManifest, classifyPayload } from '../scripts/accountingRepair.mjs'

const migrations = new URL('../migrations/', import.meta.url)
function legacyFixture() {
  const db = new DatabaseSync(':memory:')
  for (const file of readdirSync(migrations).filter(file => /^000[1-7]_.*\.sql$/.test(file)).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'))
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL)')
  for (const file of readdirSync(migrations).filter(file => /^000[1-7]_.*\.sql$/.test(file)).sort()) db.prepare('INSERT INTO d1_migrations(name, applied_at) VALUES(?, ?)').run(file, '2026-10-09')
  const payload = {
    id: 'legacy-sale', number: 100001, createdAt: '2026-10-10T10:06:25.371Z', customerId: null,
    lines: [{ productId: 'pendrive-32gb', quantity: 2000, price: 45000, gross: 90000, cost: 34000 }],
    subtotal: 90000, discount: 0, total: 90000, paid: 90000, tendered: 100000, change: 10000, due: 0, method: 'cash',
  }
  db.prepare('INSERT INTO receipts(id,receipt_number,created_at,subtotal,discount,total,paid,tendered,change,due,method,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-sale', 100001, payload.createdAt, 90000, 0, 90000, 90000, 100000, 10000, 0, 'cash', JSON.stringify(payload))
  db.prepare('INSERT INTO custom_products(id,code,en,bn,category,unit,price,cost,stock,purchased) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('pendrive-32gb', '105', 'USB Pendrive 32GB', 'ইউএসবি পেনড্রাইভ ৩২ জিবি', 'staples', 'pc', 45000, 34000, 40000, 40000)
  return db
}
function fixture() {
  const db = new DatabaseSync(':memory:')
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'))
  return db
}
const manifest = (db, options = {}) => createRepairManifest(db, { scalarCurrencyVersion: 2, ...options })
function sale(db, id, total, payload, date = '2026-10-12T12:00:00Z') {
  db.prepare('INSERT INTO receipts(id,receipt_number,created_at,subtotal,discount,total,paid,tendered,change,due,method,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,1,date,total,0,total,total,total,0,0,'cash',JSON.stringify({ id, lines: [{ productId: 'item', quantity: 1000, price: total, gross: total, cost: 5 }], subtotal: total, discount: 0, total, paid: total, tendered: total, change: 0, due: 0, ...payload }))
}
function item(db, stock, cost) {
  db.prepare("INSERT INTO custom_products(id,code,en,bn,category,unit,price,cost,stock,purchased) VALUES('item','TEST','Item','','staples','pc',10,?,?,?)").run(cost,stock,stock)
}

test('actual pre-migration backup repairs JSON while preserving scalar money and sale prices', () => {
  const db = legacyFixture(), backup = legacyFixture()
  db.exec(readFileSync(new URL('0008_migrate_poisha_to_taka.sql', migrations), 'utf8'))
  db.exec("INSERT INTO d1_migrations(name,applied_at) VALUES('0008_migrate_poisha_to_taka.sql','2026-10-13')")
  db.exec(readFileSync(new URL('0009_accounting_integrity.sql', migrations), 'utf8'))
  const before = db.prepare('SELECT total,paid,due FROM receipts WHERE receipt_number=100001').get()
  const review = createRepairManifest(db, { backupDb: backup })
  assert.equal(review.classifications.find(row => row.recordId === db.prepare('SELECT id FROM receipts WHERE receipt_number=100001').get().id).unit, 'poisha')
  applyRepairManifest(db,review)
  const after = db.prepare('SELECT total,paid,due,payload_json FROM receipts WHERE receipt_number=100001').get()
  assert.deepEqual({ total:after.total,paid:after.paid,due:after.due },{ ...before })
  const payload = JSON.parse(after.payload_json)
  assert.equal(payload.lines[0].price,450)
  assert.equal(payload.lines[0].gross,900)
  assert.equal(payload.lines[0].cost,340)
  assert.equal(payload.currencyVersion,2)
  assert.ok(review.quarantines.some(row => row.table === 'custom_products'))
  const rerun = createRepairManifest(db, { backupDb: backup })
  assert.equal(rerun.patches.length, 0)
  assert.equal(rerun.quarantineChanges.length, 0)
  const revision = db.prepare('SELECT revision FROM app_revision WHERE id=1').get().revision
  applyRepairManifest(db, rerun)
  assert.equal(db.prepare('SELECT revision FROM app_revision WHERE id=1').get().revision, revision)
  db.close(); backup.close()
})

test('mixed units normalize only proven old payloads; repair application is replay-safe', () => {
  const db=fixture()
  sale(db,'old',10,{ subtotal:1000,total:1000,paid:1000,tendered:1000,lines:[{productId:'item',quantity:1000,price:1000,gross:1000,cost:500}] })
  sale(db,'new',10,{ currencyVersion:2 })
  const review=manifest(db)
  assert.deepEqual(review.classifications.map(row=>row.unit),['poisha','taka'])
  applyRepairManifest(db,review)
  const before=db.prepare('SELECT payload_json FROM receipts ORDER BY id').all()
  const repeated=manifest(db)
  assert.equal(repeated.patches.length,0)
  applyRepairManifest(db,repeated)
  assert.deepEqual(db.prepare('SELECT payload_json FROM receipts ORDER BY id').all(),before)
  db.close()
})

test('ambiguous values and inconsistent currency markers are quarantined, never divided', () => {
  const db=fixture()
  db.prepare("INSERT INTO purchases(id,created_at,total,payload_json) VALUES('zero','2026-10-12',0,?)").run(JSON.stringify({total:0,lines:[{productId:'item',quantity:1000,unitCost:10,total:0}]}))
  sale(db,'inconsistent',10,{currencyVersion:2,total:1000})
  const review=manifest(db)
  assert.equal(review.patches.length,0)
  assert.equal(review.quarantines.length,2)
  assert.match(classifyPayload('purchases',db.prepare("SELECT * FROM purchases WHERE id='zero'").get()).reason,/anchor/)
  db.close()
})

test('independently rounded legacy header identities require reviewed correction', () => {
  const db=fixture()
  sale(db,'fractional',1,{subtotal:101,total:101,paid:51,tendered:51,due:50,lines:[{productId:'item',quantity:1000,price:101,gross:101,cost:0}]})
  db.prepare("UPDATE receipts SET paid=1,tendered=1,due=1 WHERE id='fractional'").run()
  const review=manifest(db)
  assert.equal(review.patches.length,0)
  assert.match(review.quarantines[0].reason,/identities/)
  db.close()
})

test('opening inventory plus recorded purchases repairs proven sale costs and remaining value', () => {
  const db=fixture()
  item(db,3000,6)
  db.prepare("INSERT INTO purchases(id,created_at,total,payload_json) VALUES('purchase','2026-10-12T10:00:00Z',10,?)").run(JSON.stringify({currencyVersion:2,total:10,lines:[{productId:'item',quantity:1000,unitCost:10,total:10}]}))
  sale(db,'sale',10,{lines:[{productId:'item',quantity:1000,price:10,gross:10,cost:6}]})
  const review=manifest(db,{openingValues:[{productId:'item',quantity:2000,inventoryValue:10,source:'Confirmed opening count and purchase invoice'}]})
  assert.equal(review.quarantines.length,0)
  applyRepairManifest(db,review)
  const product=db.prepare("SELECT inventory_value,valuation_status FROM custom_products WHERE id='item'").get()
  assert.equal(product.inventory_value,13) // 20 total value, one third removed = 7.
  assert.equal(product.valuation_status,'provided')
  const payload=JSON.parse(db.prepare("SELECT payload_json FROM receipts WHERE id='sale'").get().payload_json)
  assert.equal(payload.lines[0].costAmount,7)
  assert.equal(payload.lines[0].costStatus,'recorded')
  const next=manifest(db)
  assert.equal(next.patches.length,0)
  assert.equal(next.quarantines.length,0)
  db.close()
})

test('unknown consumed inventory is quarantined while a catalog opening without movements is provided', () => {
  const db=fixture()
  item(db,2000,5)
  sale(db,'sale',10,{})
  let review=manifest(db)
  assert.ok(review.quarantines.some(row=>row.table==='custom_products'))
  db.exec("DELETE FROM receipts")
  review=manifest(db)
  assert.equal(review.quarantines.length,0)
  applyRepairManifest(db,review)
  assert.equal(db.prepare("SELECT inventory_value FROM custom_products WHERE id='item'").get().inventory_value,10)
  db.close()
})

test('revision and row guards roll back stale repair manifests atomically', () => {
  const db=fixture()
  sale(db,'old',10,{subtotal:1000,total:1000,paid:1000,tendered:1000,lines:[{productId:'item',quantity:1000,price:1000,gross:1000,cost:500}]})
  const review=manifest(db)
  db.prepare("UPDATE receipts SET remarks='new note' WHERE id='old'").run()
  assert.throws(()=>applyRepairManifest(db,review))
  assert.equal(db.prepare('SELECT revision FROM app_revision WHERE id=1').get().revision,0)
  assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM receipts WHERE id='old'").get().payload_json).total,1000)
  db.close()
})

test('proven replay preserves every Taka of cost across successive returns and signed losses', () => {
  const db=fixture()
  item(db,3000,3)
  sale(db,'sale',30,{lines:[{productId:'item',quantity:3000,price:10,gross:30,cost:3}]})
  for(let index=0;index<3;index++) db.prepare('INSERT INTO returns(id,created_at,receipt_id,receipt_number,refunded,method,restock,payload_json) VALUES(?,?,?,?,?,?,?,?)').run(`return-${index}`,`2026-10-12T13:0${index}:00Z`,'sale',1,10,'cash',1,JSON.stringify({currencyVersion:2,receiptId:'sale',refunded:10,method:'cash',restock:true,lines:[{productId:'item',quantity:1000,amount:10,cost:3}]}))
  db.prepare("INSERT INTO stock_adjustments(id,created_at,product_id,quantity,reason) VALUES('loss','2026-10-12T14:00:00Z','item',-1000,'loss')").run()
  const review=manifest(db,{openingValues:[{productId:'item',quantity:3000,inventoryValue:10,source:'Opening invoice'}]})
  assert.equal(review.quarantines.length,0)
  applyRepairManifest(db,review)
  const costs=db.prepare('SELECT payload_json FROM returns ORDER BY id').all().map(row=>JSON.parse(row.payload_json).lines[0].cost)
  assert.deepEqual(costs,[3,4,3])
  assert.equal(db.prepare("SELECT cost_amount FROM stock_adjustments WHERE id='loss'").get().cost_amount,-3)
  assert.equal(db.prepare("SELECT inventory_value FROM custom_products WHERE id='item'").get().inventory_value,7)
  db.close()
})

test('consumed historical purchase voids cannot establish a verified inventory valuation', () => {
  const db=fixture()
  item(db,1000,5)
  db.prepare("INSERT INTO purchases(id,created_at,total,payload_json) VALUES('purchase','2026-10-12T10:00:00Z',5,?)").run(JSON.stringify({currencyVersion:2,total:5,lines:[{productId:'item',quantity:1000,unitCost:5,total:5}]}))
  sale(db,'sale',10,{})
  db.prepare("INSERT INTO purchase_voids(purchase_id,created_at) VALUES('purchase','2026-10-12T14:00:00Z')").run()
  const review=manifest(db,{openingValues:[{productId:'item',quantity:1000,inventoryValue:5,source:'Opening invoice'}]})
  assert.ok(review.quarantines.some(row=>row.table==='purchases'))
  assert.ok(review.quarantines.some(row=>row.table==='custom_products'))
  db.close()
})

function returned(db, id, receiptId, refunded, quantity, payload = {}) {
  db.prepare('INSERT INTO returns(id,created_at,receipt_id,receipt_number,refunded,method,restock,payload_json) VALUES(?,?,?,?,?,?,?,?)').run(id,'2026-10-12T13:00:00Z',receiptId,1,refunded,payload.method ?? 'cash',0,JSON.stringify({currencyVersion:2,receiptId,refunded,method:'cash',restock:false,lines:[{productId:'item',quantity,amount:refunded,cost:5}],...payload}))
}

test('historical over-refunds quarantine the bill and all implicated returns without changing posted refunds', () => {
  const db=fixture()
  sale(db,'sale',1049,{currencyVersion:2,subtotal:1050,discount:1,lines:[{productId:'item',quantity:3000,price:350,gross:1050,cost:240}]})
  db.prepare("UPDATE receipts SET subtotal=1050,discount=1 WHERE id='sale'").run()
  for(let index=0;index<3;index++) returned(db,`return-${index}`,'sale',350,1000)
  const before=db.prepare('SELECT id,refunded FROM returns ORDER BY id').all()
  const review=manifest(db)
  assert.ok(review.quarantines.some(row=>row.table==='receipts' && /refunds exceed/.test(row.reason)))
  assert.equal(review.quarantines.filter(row=>row.table==='returns').length,3)
  applyRepairManifest(db,review)
  assert.deepEqual(db.prepare('SELECT id,refunded FROM returns ORDER BY id').all(),before)
  assert.equal(db.prepare("SELECT total FROM receipts WHERE id='sale'").get().total,1049)
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM accounting_quarantine WHERE table_name='receipts' AND record_id='sale'").get().count,1)
  assert.equal(manifest(db).patches.length,0)
  db.close()
})

test('historical over-returned quantities quarantine even when refund totals remain within the sale', () => {
  const db=fixture()
  sale(db,'sale',10,{currencyVersion:2})
  returned(db,'first','sale',5,1000)
  returned(db,'second','sale',5,1000)
  const review=manifest(db)
  assert.ok(review.quarantines.some(row=>row.table==='receipts' && /quantity exceeds/.test(row.reason)))
  assert.equal(review.quarantines.filter(row=>row.table==='returns').length,2)
  applyRepairManifest(db,review)
  assert.equal(db.prepare('SELECT SUM(refunded) AS refunded FROM returns').get().refunded,10)
  db.close()
})

test('ambiguous related return payloads block the affected bill from further returns', () => {
  const db=fixture()
  sale(db,'sale',10,{currencyVersion:2})
  returned(db,'ambiguous','sale',0,1000,{currencyVersion:undefined,refunded:0})
  const review=manifest(db)
  assert.ok(review.quarantines.some(row=>row.table==='receipts' && /missing, ambiguous/.test(row.reason)))
  assert.ok(review.quarantines.some(row=>row.table==='returns' && row.recordId==='ambiguous'))
  assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM returns WHERE id='ambiguous'").get().payload_json).currencyVersion,undefined)
  db.close()
})

test('legacy due refunds beyond original bill debt require reconciliation and preserve recorded amounts', () => {
  const db=fixture()
  sale(db,'sale',10,{currencyVersion:2,paid:5,tendered:5,due:5})
  db.prepare("UPDATE receipts SET paid=5,tendered=5,due=5 WHERE id='sale'").run()
  returned(db,'due-return','sale',6,1000,{method:'due'})
  const review=manifest(db)
  assert.ok(review.quarantines.some(row=>row.table==='receipts' && /debt reductions/.test(row.reason)))
  applyRepairManifest(db,review)
  assert.equal(db.prepare("SELECT refunded FROM returns WHERE id='due-return'").get().refunded,6)
  assert.equal(db.prepare("SELECT due FROM receipts WHERE id='sale'").get().due,5)
  db.close()
})

test('inventory reconciliation uses stock receiving events while a supplier invoice remains a financial record',()=>{
  const db=fixture()
  item(db,10000,100)
  const invoice={id:'mixed-invoice',createdAt:'2026-10-10T00:00:00Z',mode:'invoice',currencyVersion:2,lines:[],invoiceLines:[{id:'mixed-line',description:'Mixed-brand mice',unit:'pc',quantity:10000,total:1001}],total:1001,paid:1001,method:'cash'}
  db.prepare('INSERT INTO purchases(id,created_at,total,payload_json) VALUES(?,?,?,?)').run(invoice.id,invoice.createdAt,invoice.total,JSON.stringify(invoice))
  const received={id:'received-brands',purchaseId:invoice.id,createdAt:'2026-10-12T00:00:00Z',currencyVersion:2,lines:[{invoiceLineId:'mixed-line',productId:'item',quantity:6000,unitCost:100,total:601},{invoiceLineId:'mixed-line',productId:'item',quantity:4000,unitCost:100,total:400}]}
  db.prepare('INSERT INTO stock_receivings(id,purchase_id,created_at,payload_json) VALUES(?,?,?,?)').run(received.id,received.purchaseId,received.createdAt,JSON.stringify(received))
  const review=manifest(db)
  assert.equal(review.quarantines.some(q=>q.recordId===invoice.id),false)
  assert.equal(review.quarantines.some(q=>q.table==='custom_products'&&q.recordId==='item'),false)
  applyRepairManifest(db,review)
  assert.equal(db.prepare("SELECT inventory_value FROM custom_products WHERE id='item'").get().inventory_value,1001)
  assert.equal(db.prepare('SELECT total FROM purchases WHERE id=?').get(invoice.id).total,1001)
  assert.deepEqual(JSON.parse(db.prepare('SELECT payload_json FROM stock_receivings WHERE id=?').get(received.id).payload_json),received)
  db.close()
})
