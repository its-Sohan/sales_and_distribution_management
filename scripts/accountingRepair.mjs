import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const tables = ['receipts', 'purchases', 'returns']
const moneyKeys = new Set(['price', 'cost', 'gross', 'subtotal', 'discount', 'total', 'paid', 'tendered', 'change', 'due', 'creditApplied', 'refunded', 'amount', 'unitCost', 'costAmount', 'inventoryValue', 'openingBalance', 'dueReduced', 'exchangeCredit', 'payout', 'creditIssued', 'received', 'newDue'])
const receiptAnchors = ['subtotal', 'discount', 'total', 'paid', 'tendered', 'change', 'due']
const legacyServices = new Set(['service-windows', 'service-pc-clean', 'service-laptop-clean', 'service-mobo', 'service-display', 'service-data', 'service-custom'])
const safe = value => Number.isSafeInteger(value)
const roundMinor = value => Math.sign(value) * Math.round(Math.abs(value) / 100)
const proportional = (value, quantity, totalQuantity) => Number((BigInt(value) * BigInt(quantity) * 2n + BigInt(totalQuantity)) / (2n * BigInt(totalQuantity)))
const extended = (value, quantity) => proportional(value, quantity, 1000)
const readRows = (db, table) => db.prepare(`SELECT * FROM ${table}`).all()
const hasTable = (db, table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
const parse = value => { try { return JSON.parse(value) } catch { return null } }
const clone = value => JSON.parse(JSON.stringify(value))
const keyOf = (table, row) => String(table === 'terminal_drafts' ? row.terminal_id : row.id)

function convertMoney(value, divide) {
  if (Array.isArray(value)) return value.map(item => convertMoney(item, divide))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'creditLimit').map(([key, item]) => [key,
    moneyKeys.has(key) && typeof item === 'number' ? (divide ? roundMinor(item) : item) : convertMoney(item, divide)]))
}

/** Header/JSON agreement identifies the unit, never the magnitude or payload shape. */
export function classifyPayload(table, row, backupRow) {
  const payload = parse(row.payload_json)
  if (!payload || !Array.isArray(payload.lines)) return { unit: null, reason: 'Missing or malformed historical payload' }
  const anchors = table === 'receipts' ? receiptAnchors : [table === 'returns' ? 'refunded' : 'total']
  const available = anchors.filter(key => safe(payload[key]) && safe(row[key]))
  if (!available.some(key => payload[key] !== 0 || row[key] !== 0)) return { unit: null, reason: 'No nonzero monetary anchor' }
  const matches = divide => available.every(key => row[key] === (divide ? roundMinor(payload[key]) : payload[key]))
  if (payload.currencyVersion !== undefined) {
    if (payload.currencyVersion !== 2 || !matches(false)) return { unit: null, reason: 'Currency metadata disagrees with the committed header' }
    return { unit: 'taka', source: 'currencyVersion:2' }
  }
  const exactBackup = backupRow && backupRow.payload_json === row.payload_json
  if (exactBackup && matches(true) && anchors.every(key => !safe(backupRow[key]) || row[key] === roundMinor(backupRow[key]))) {
    return { unit: 'poisha', source: 'Exact pre-0008 backup payload and converted header' }
  }
  const candidates = ['taka', 'poisha'].filter(unit => matches(unit === 'poisha'))
  return candidates.length === 1 ? { unit: candidates[0], source: 'Unique agreement of payload money and committed header' }
    : { unit: null, reason: 'Monetary anchors are ambiguous or inconsistent' }
}

function invariantError(table, row, payload) {
  const monetary = []
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (moneyKeys.has(key) && typeof item === 'number') monetary.push(item)
      else visit(item)
    }
  }
  visit(payload)
  if (!monetary.every(safe)) return 'Monetary fields must remain safe whole integers'
  if (payload.lines.some(line => typeof line.productId !== 'string' || !safe(line.quantity) || line.quantity <= 0)) return 'Invalid historical line identity or quantity'
  if (payload.lines.some(line => ['price', 'gross', 'cost', 'unitCost', 'total', 'amount'].some(key => typeof line[key] === 'number' && line[key] < 0))) return 'Historical line money cannot be negative'
  if (table === 'receipts') {
    if (row.total !== row.subtotal - row.discount || row.paid + (payload.creditApplied ?? 0) + row.due !== row.total || row.tendered !== row.paid + row.change) return 'Receipt accounting identities do not balance; an explicit reviewed correction is required'
    const gross = payload.lines.map(line => line.gross ?? extended(line.price ?? line.product?.price ?? 0, line.quantity))
    if (gross.reduce((sum, amount) => sum + amount, 0) !== row.subtotal) return 'Normalized historical line totals disagree with committed subtotal'
  }
  if (table === 'purchases' && (payload.mode === 'invoice' ? payload.invoiceLines ?? [] : payload.lines).reduce((sum, line) => sum + line.total, 0) !== row.total) return 'Normalized purchase lines disagree with committed total'
  if (table === 'returns' && payload.settlement) {
    const s = payload.settlement
    if (s.dueReduced + s.exchangeCredit + s.payout + s.creditIssued !== row.refunded || s.exchangeCredit + s.received + s.newDue !== (payload.replacementLines ?? []).reduce((sum, line) => sum + line.amount, 0)) return 'Normalized return settlement does not balance'
  }
  return null
}

/** Build an offline manifest; does not write to the supplied database. */
export function createRepairManifest(db, { backupDb, openingValues = [], scalarCurrencyVersion } = {}) {
  const migrationKnown = hasTable(db, 'd1_migrations') && db.prepare("SELECT 1 FROM d1_migrations WHERE name='0008_migrate_poisha_to_taka.sql'").get()
  if (!migrationKnown && scalarCurrencyVersion !== 2) throw new Error('Cannot establish scalar currency: require recorded migration 0008 or explicit scalarCurrencyVersion:2 for an isolated fixture')
  if (!hasTable(db, 'accounting_checkpoints')) throw new Error('Apply migration 0009 to the local review copy first')
  const revision = db.prepare('SELECT revision FROM app_revision WHERE id=1').get().revision
  const patches = new Map(), quarantines = new Map(), classifications = [], normalized = new Map()
  const rows = Object.fromEntries([...tables, 'custom_products', 'stock_adjustments', 'purchase_voids'].map(table => [table, readRows(db, table)]))
  rows.stock_receivings = hasTable(db, 'stock_receivings') ? readRows(db, 'stock_receivings') : []
  const products = new Map(rows.custom_products.map(row => [row.id, row]))
  const quarantine = (table, id, reason, details = {}) => {
    const keyColumn = table === 'terminal_drafts' ? 'terminal_id' : 'id'
    const before = db.prepare(`SELECT * FROM ${table} WHERE ${keyColumn}=?`).get(id)
    quarantines.set(`${table}/${id}`, { table, recordId: String(id), reason, details, before: before ? { ...before } : null })
  }
  const patch = (table, row, values, source) => {
    const id = keyOf(table, row), key = `${table}/${id}`
    const current = patches.get(key) ?? { table, keyColumn: table === 'terminal_drafts' ? 'terminal_id' : 'id', recordId: id, before: { ...row }, after: { ...row }, source: [] }
    Object.assign(current.after, values)
    if (!current.source.includes(source)) current.source.push(source)
    if (JSON.stringify(current.before) !== JSON.stringify(current.after)) patches.set(key, current)
  }
  for (const table of tables) {
    const backup = backupDb && hasTable(backupDb, table) ? new Map(readRows(backupDb, table).map(row => [row.id, row])) : new Map()
    for (const row of rows[table]) {
      const classification = classifyPayload(table, row, backup.get(row.id))
      classifications.push({ table, recordId: row.id, ...classification })
      if (!classification.unit) { quarantine(table, row.id, classification.reason); continue }
      const raw = parse(row.payload_json), payload = convertMoney(raw, classification.unit === 'poisha')
      payload.currencyVersion = 2
      for (const key of table === 'receipts' ? receiptAnchors : [table === 'returns' ? 'refunded' : 'total']) payload[key] = row[key]
      if (table === 'receipts') payload.lines = payload.lines.map((line, index) => {
        const original = raw.lines[index], product = products.get(line.productId), service = line.kind === 'service' || line.product?.kind === 'service' || product?.kind === 'service' || legacyServices.has(line.productId)
        const originalCost = original.cost ?? original.product?.cost
        const costKnown = line.costKnown ?? (safe(originalCost) && (!service || originalCost !== 0))
        const cost = originalCost === undefined ? null : (classification.unit === 'poisha' ? roundMinor(extended(originalCost, line.quantity)) : extended(originalCost, line.quantity))
        return { ...line, ...(service ? { kind: 'service' } : {}), unit: line.unit ?? line.product?.unit ?? product?.unit ?? 'pc', gross: line.gross ?? extended(line.price ?? line.product?.price ?? 0, line.quantity), costKnown, costAmount: line.costAmount ?? cost, costStatus: line.costStatus ?? (costKnown ? 'recorded' : 'unassigned') }
      })
      const reason = invariantError(table, row, payload)
      if (reason) { quarantine(table, row.id, reason); continue }
      normalized.set(`${table}/${row.id}`, payload)
      patch(table, row, { payload_json: JSON.stringify(payload) }, classification.source)
    }
  }
  for (const row of readRows(db, 'terminal_drafts')) {
    const draft = parse(row.draft_json)
    if (!draft || !safe(draft.discount)) { quarantine('terminal_drafts', row.terminal_id, 'Malformed draft'); continue }
    if (draft.currencyVersion === 2 || draft.discount === 0) patch('terminal_drafts', row, { draft_json: JSON.stringify({ ...draft, currencyVersion: 2 }) }, 'Explicit whole-Taka draft or zero discount')
    else {
      const before = backupDb && hasTable(backupDb, 'terminal_drafts') ? backupDb.prepare('SELECT draft_json FROM terminal_drafts WHERE terminal_id=?').get(row.terminal_id) : null
      if (before?.draft_json === row.draft_json) patch('terminal_drafts', row, { draft_json: JSON.stringify({ ...draft, discount: roundMinor(draft.discount), currencyVersion: 2 }) }, 'Exact pre-0008 draft backup')
      else quarantine('terminal_drafts', row.terminal_id, 'Nonzero draft discount has no proven currency provenance')
    }
  }

  // Posted payouts are immutable facts. Historical allocation bugs must block
  // further returns rather than silently reducing money that already changed hands.
  const receiptsById = new Map(rows.receipts.map(row => [row.id, row]))
  const returnsByReceipt = new Map()
  for (const row of rows.returns) {
    const group = returnsByReceipt.get(row.receipt_id) ?? []
    group.push(row)
    returnsByReceipt.set(row.receipt_id, group)
  }
  for (const [receiptId, related] of returnsByReceipt) {
    const saleRow = receiptsById.get(receiptId), sale = normalized.get(`receipts/${receiptId}`)
    const flag = (reason, details = {}) => {
      if (saleRow) quarantine('receipts', receiptId, reason, details)
      for (const row of related) quarantine('returns', row.id, reason, { ...details, receiptId })
    }
    if (!saleRow || !sale || related.some(row => !normalized.has(`returns/${row.id}`))) {
      flag('Related historical sale or return payload is missing, ambiguous, or inconsistent; reconcile before further returns')
      continue
    }
    if (!safe(saleRow.total) || !related.every(row => safe(row.refunded) && row.refunded >= 0)) {
      flag('Historical posted refund totals are not safe nonnegative integers')
      continue
    }
    const refunded = related.reduce((sum, row) => sum + BigInt(row.refunded), 0n)
    if (refunded > BigInt(saleRow.total)) {
      flag('Historical posted refunds exceed the original net sale; preserve payouts and review the discrepancy', { originalTotal: saleRow.total, actualRefunded: refunded.toString() })
      continue
    }
    const sold = new Map(), returned = new Map()
    for (const line of sale.lines) sold.set(line.productId, (sold.get(line.productId) ?? 0n) + BigInt(line.quantity))
    for (const row of related) {
      const payload = normalized.get(`returns/${row.id}`)
      for (const line of payload.lines) returned.set(line.productId, (returned.get(line.productId) ?? 0n) + BigInt(line.quantity))
    }
    const excess = [...returned].find(([productId, quantity]) => quantity > (sold.get(productId) ?? 0n))
    if (excess) {
      const [productId, quantity] = excess
      flag('Historical returned quantity exceeds the quantity originally sold', { productId, soldQuantity: (sold.get(productId) ?? 0n).toString(), returnedQuantity: quantity.toString() })
      continue
    }
    const dueReduced = related.reduce((sum, row) => {
      const payload = normalized.get(`returns/${row.id}`)
      return sum + BigInt(payload.settlement?.dueReduced ?? (row.method === 'due' ? row.refunded : 0))
    }, 0n)
    if (!safe(saleRow.due) || dueReduced > BigInt(saleRow.due)) flag('Historical return debt reductions exceed the original bill debt', { originalDue: saleRow.due, actualDueReduced: dueReduced.toString() })
  }

  const openings = new Map(openingValues.map(value => [value.productId, value]))
  const unverifiedCosts = productId => {
    for (const table of ['receipts', 'returns']) for (const row of rows[table]) {
      const payload = normalized.get(`${table}/${row.id}`)
      if (!payload) continue
      let changed = false
      for (const line of [...payload.lines, ...(payload.replacementLines ?? [])]) if (line.productId === productId) {
        line.costStatus = 'unverified'
        if (table === 'receipts') line.costKnown = false
        changed = true
      }
      if (changed) patch(table, row, { payload_json: JSON.stringify(payload) }, 'Historical inventory cost lacks proven opening provenance')
    }
  }
  for (const product of rows.custom_products) {
    if (product.kind === 'service' || legacyServices.has(product.id)) continue
    if (!openings.has(product.id) && ['verified', 'provided'].includes(product.valuation_status) && safe(product.inventory_value) && product.inventory_value >= 0) continue
    const events = []
    let invalid = false, purchasedQuantity = 0
    const add = (date, rank, id, event) => events.push({ date, rank, id, ...event })
    for (const row of rows.purchases) {
      const payload = normalized.get(`purchases/${row.id}`)
      if (!payload) { if (parse(row.payload_json)?.lines?.some(line => line.productId === product.id)) invalid = true; continue }
      const voided = rows.purchase_voids.find(entry => entry.purchase_id === row.id)
      for (const line of payload.lines.filter(line => line.productId === product.id)) {
        if (voided) {
          const between = entry => entry.created_at >= row.created_at && entry.created_at <= voided.created_at
          const consumed = rows.receipts.some(sale => between(sale) && parse(sale.payload_json)?.lines?.some(item => item.productId === product.id))
            || rows.stock_adjustments.some(adjustment => between(adjustment) && adjustment.product_id === product.id && adjustment.quantity < 0)
            || rows.returns.some(entry => between(entry) && parse(entry.payload_json)?.replacementLines?.some(item => item.productId === product.id))
          if (consumed) { invalid = true; quarantine('purchases', row.id, 'Historical void followed consumption; opening valuation requires review') }
          continue
        }
        purchasedQuantity += line.quantity
        add(row.created_at, 0, row.id, { delta: line.quantity, value: line.total })
      }
    }
    for (const row of rows.stock_receivings) {
      const received = parse(row.payload_json)
      const invoice = normalized.get(`purchases/${row.purchase_id}`)
      const relevant = received?.lines?.filter(l => l.productId === product.id) ?? []
      if (!relevant.length) continue
      if (!invoice || invoice.mode !== 'invoice' || received.currencyVersion !== 2) { invalid = true; continue }
      const voided = rows.purchase_voids.find(v => v.purchase_id === row.purchase_id)
      for (const line of relevant) {
        const source = invoice.invoiceLines?.find(l => l.id === line.invoiceLineId)
        const allParts = rows.stock_receivings.filter(r => r.purchase_id === row.purchase_id).flatMap(r => parse(r.payload_json)?.lines ?? []).filter(l => l.invoiceLineId === line.invoiceLineId)
        if (!source || !safe(line.quantity) || line.quantity <= 0 || !safe(line.total) || line.total < 0 || source.unit !== product.unit
          || allParts.reduce((s,l)=>s+l.quantity,0) > source.quantity || allParts.reduce((s,l)=>s+l.total,0) > source.total) { invalid = true; continue }
        if (voided) {
          const between = r => r.created_at >= row.created_at && r.created_at <= voided.created_at
          if (rows.receipts.some(r => between(r) && parse(r.payload_json)?.lines?.some(l => l.productId === product.id))
            || rows.stock_adjustments.some(r => between(r) && r.product_id === product.id && r.quantity < 0)
            || rows.returns.some(r => between(r) && parse(r.payload_json)?.replacementLines?.some(l=>l.productId===product.id))) invalid = true
          continue
        }
        purchasedQuantity += line.quantity
        add(row.created_at, 0, row.id, { delta: line.quantity, value: line.total })
      }
    }
    for (const row of rows.receipts) {
      const payload = normalized.get(`receipts/${row.id}`)
      if (!payload) { if (parse(row.payload_json)?.lines?.some(line => line.productId === product.id)) invalid = true; continue }
      payload.lines.forEach((line, index) => { if (line.productId === product.id) add(row.created_at, 2, row.id, { delta: -line.quantity, line, payload, row, index, table: 'receipts' }) })
    }
    for (const row of rows.stock_adjustments.filter(row => row.product_id === product.id)) add(row.created_at, 1, row.id, { delta: row.quantity, row, table: 'stock_adjustments' })
    for (const row of rows.returns) {
      const payload = normalized.get(`returns/${row.id}`)
      if (!payload) { if (parse(row.payload_json)?.lines?.some(line => line.productId === product.id) || parse(row.payload_json)?.replacementLines?.some(line => line.productId === product.id)) invalid = true; continue }
      payload.lines.forEach((line, index) => { if (line.productId === product.id) add(row.created_at, 3, row.id, { delta: line.condition ? (line.condition === 'sellable' ? line.quantity : 0) : payload.restock ? line.quantity : 0, returnQuantity: line.quantity, line, payload, row, index, table: 'returns', original: payload.receiptId }) })
      ;(payload.replacementLines ?? []).forEach((line, index) => { if (line.productId === product.id) add(row.created_at, 4, row.id, { delta: -line.quantity, line, payload, row, index, table: 'returns', replacement: true }) })
    }
    events.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.rank - b.rank || a.id.localeCompare(b.id))
    if (events.some(event => !Number.isFinite(Date.parse(event.date)))) invalid = true
    if (events.some((event, index) => index > 0 && event.id !== events[index - 1].id && Date.parse(event.date) === Date.parse(events[index - 1].date) && event.original !== events[index - 1].id)) invalid = true
    const baselineQuantity = product.stock - purchasedQuantity
    const supplied = openings.get(product.id)
    let quantity = baselineQuantity, value, status = 'verified', source
    if (supplied) {
      if (!safe(supplied.quantity) || supplied.quantity !== baselineQuantity || !safe(supplied.inventoryValue) || supplied.inventoryValue < 0 || (supplied.quantity === 0 && supplied.inventoryValue !== 0) || !supplied.source || (supplied.asOf && (!Number.isFinite(Date.parse(supplied.asOf)) || events.some(event => Date.parse(event.date) <= Date.parse(supplied.asOf))))) invalid = true
      value = supplied.inventoryValue; status = 'provided'; source = `Provided opening value: ${supplied.source}`
    } else if (baselineQuantity === 0) { value = 0; source = 'Zero opening quantity plus complete recorded purchase history' }
    else if (!events.length && safe(product.cost) && product.cost >= 0 && baselineQuantity >= 0) { value = extended(product.cost, baselineQuantity); status = 'provided'; source = 'Recorded catalog opening with no stock movements' }
    else invalid = true
    if (baselineQuantity < 0 || !safe(quantity) || invalid) {
      quarantine('custom_products', product.id, 'Opening inventory value or complete stock history is not established', { openingQuantity: baselineQuantity })
      patch('custom_products', product, { inventory_value: null, valuation_status: 'unverified' }, 'Unproven inventory valuation')
      unverifiedCosts(product.id)
      continue
    }
    const saleCosts = new Map(), productChanges = []
    for (const event of events) {
      if (event.original) {
        const sold = saleCosts.get(event.original)
        if (!sold || sold.returned + event.returnQuantity > sold.quantity) { invalid = true; break }
        const cost = proportional(sold.cost, sold.returned + event.returnQuantity, sold.quantity) - proportional(sold.cost, sold.returned, sold.quantity)
        sold.returned += event.returnQuantity
        event.line.cost = cost; event.line.costStatus = 'recorded'
        productChanges.push(event)
        if (event.delta > 0) { quantity += event.delta; value += cost }
      } else if (event.delta > 0) {
        const amount = event.value ?? event.row?.cost_amount
        if (!safe(amount) || amount < 0) { invalid = true; break }
        quantity += event.delta; value += amount
      } else if (event.delta < 0) {
        const removed = -event.delta
        if (removed > quantity || quantity <= 0) { invalid = true; break }
        const cost = proportional(value, removed, quantity)
        quantity -= removed; value -= cost
        if (event.line) {
          if (event.table === 'receipts') { event.line.costAmount = cost; event.line.costStatus = 'recorded'; event.line.costKnown = true; const before = saleCosts.get(event.id); saleCosts.set(event.id, { cost: cost + (before?.cost ?? 0), quantity: removed + (before?.quantity ?? 0), returned: before?.returned ?? 0 }) }
          else { event.line.cost = cost; event.line.costStatus = 'recorded' }
        } else productChanges.push({ ...event, adjustmentCost: -cost })
        if (event.line) productChanges.push(event)
      }
      if (!safe(value) || value < 0 || (quantity === 0 && value !== 0)) { invalid = true; break }
    }
    if (invalid) {
      quarantine('custom_products', product.id, 'Inventory replay is incomplete, negative, or conflicts with opening provenance')
      patch('custom_products', product, { inventory_value: null, valuation_status: 'unverified' }, 'Unproven inventory valuation')
      // Roll back speculative corrections to payloads for this product.
      for (const event of productChanges) if (event.line) Object.assign(event.line, clone(parse(patches.get(`${event.table}/${event.row.id}`)?.after.payload_json ?? event.row.payload_json)[event.replacement ? 'replacementLines' : 'lines'][event.index]))
      unverifiedCosts(product.id)
      continue
    }
    for (const event of productChanges) {
      if (event.line) patch(event.table, event.row, { payload_json: JSON.stringify(event.payload) }, source)
      else patch('stock_adjustments', event.row, { cost_amount: event.adjustmentCost }, source)
    }
    patch('custom_products', product, { inventory_value: value, valuation_status: status }, source)
  }
  const previousQuarantines = readRows(db, 'accounting_quarantine')
  const resolvedQuarantines = previousQuarantines.filter(row => !quarantines.has(`${row.table_name}/${row.record_id}`)).map(row => ({ table: row.table_name, recordId: row.record_id }))
  const quarantineChanges = [...quarantines.values()].filter(item => {
    const before = previousQuarantines.find(row => row.table_name === item.table && row.record_id === item.recordId)
    return !before || before.reason !== item.reason || before.details_json !== JSON.stringify(item.details)
  })
  const manifest = { version: 1, currencyVersion: 2, expectedRevision: revision, classifications, patches: [...patches.values()], quarantines: [...quarantines.values()], quarantineChanges, resolvedQuarantines }
  manifest.hash = sha(manifest)
  return manifest
}

const quote = value => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
export function repairStatements(manifest) {
  const statements = [`UPDATE app_revision SET revision=CASE WHEN revision=${manifest.expectedRevision} THEN revision+1 ELSE NULL END WHERE id=1`]
  const guarded = new Set()
  for (const item of [...manifest.patches, ...manifest.quarantineChanges]) if (item.before && !guarded.has(`${item.table}/${item.recordId}`)) {
    const unchanged = Object.entries(item.before).map(([name, value]) => `${name} IS ${quote(value)}`).join(' AND ')
    statements.push(`UPDATE accounting_checkpoints SET currency_version=CASE WHEN EXISTS(SELECT 1 FROM ${item.table} WHERE ${unchanged}) THEN 2 ELSE NULL END WHERE id=1`)
    guarded.add(`${item.table}/${item.recordId}`)
  }
  for (const item of manifest.patches) {
    const key = `${item.keyColumn}=${quote(item.before[item.keyColumn])}`
    const values = Object.entries(item.after).filter(([name, value]) => value !== item.before[name]).map(([name, value]) => `${name}=${quote(value)}`).join(', ')
    statements.push(`UPDATE ${item.table} SET ${values} WHERE ${key}`)
    const id = sha([item.table, item.recordId, item.before, item.after])
    statements.push(`INSERT OR IGNORE INTO accounting_repairs(id,table_name,record_id,before_json,after_json,source) VALUES(${[id, item.table, item.recordId, JSON.stringify(item.before), JSON.stringify(item.after), item.source.join('; ')].map(quote).join(',')})`)
  }
  for (const item of manifest.quarantineChanges) {
    statements.push(`INSERT INTO accounting_quarantine(table_name,record_id,reason,details_json) VALUES(${[item.table, item.recordId, item.reason, JSON.stringify(item.details)].map(quote).join(',')}) ON CONFLICT(table_name,record_id) DO UPDATE SET reason=excluded.reason,details_json=excluded.details_json`)
  }
  for (const item of manifest.resolvedQuarantines) statements.push(`DELETE FROM accounting_quarantine WHERE table_name=${quote(item.table)} AND record_id=${quote(item.recordId)}`)
  statements.push(`UPDATE accounting_checkpoints SET historical_status=${quote(manifest.quarantines.length ? 'quarantined' : 'verified')},repair_manifest_hash=${quote(manifest.hash)},updated_at=CURRENT_TIMESTAMP WHERE id=1`)
  return statements
}

/** Apply only to a caller-owned local review copy; every guard and write is atomic. */
export function applyRepairManifest(db, manifest) {
  if (manifest.version !== 1 || manifest.currencyVersion !== 2 || manifest.hash !== sha(Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'hash')))) throw new Error('Invalid or modified repair manifest')
  if (db.prepare('SELECT repair_manifest_hash FROM accounting_checkpoints WHERE id=1').get()?.repair_manifest_hash === manifest.hash) return
  if (!manifest.patches.length && !manifest.quarantineChanges.length && !manifest.resolvedQuarantines.length) return
  db.exec('BEGIN IMMEDIATE')
  try { for (const sql of repairStatements(manifest)) db.exec(sql); db.exec('COMMIT') }
  catch (error) { db.exec('ROLLBACK'); throw error }
}

async function main() {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
  const databasePath = option('--database'), exportPath = option('--export'), prefix = option('--out') ?? 'accounting-review'
  if ((!databasePath && !exportPath) || (databasePath && exportPath)) throw new Error('Supply exactly one --database LOCAL.sqlite or --export LOCAL.sql; optional --backup PRE_0008.sql --opening-values opening.json --out review-prefix --apply --output-db REVIEW.sqlite')
  const db = new DatabaseSync(':memory:')
  if (exportPath) db.exec(readFileSync(exportPath, 'utf8'))
  else { const source = new DatabaseSync(resolve(databasePath), { readOnly: true }); const { backup } = await import('node:sqlite'); const temporaryPath = `${resolve(prefix)}.source-copy.sqlite`; if (existsSync(temporaryPath)) throw new Error('Source-copy path already exists'); await backup(source, temporaryPath); source.close(); db.exec(`ATTACH ${quote(temporaryPath)} AS source`); const schema = db.prepare("SELECT sql FROM source.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL").all(); for (const row of schema) db.exec(row.sql); for (const row of db.prepare("SELECT name FROM source.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.exec(`INSERT INTO main.${row.name} SELECT * FROM source.${row.name}`); db.exec('DETACH source') }
  if (!hasTable(db, 'accounting_checkpoints')) db.exec(readFileSync(new URL('../migrations/0009_accounting_integrity.sql', import.meta.url), 'utf8'))
  const backupPath = option('--backup'), backupDb = backupPath ? new DatabaseSync(':memory:') : undefined
  if (backupDb) backupDb.exec(readFileSync(backupPath, 'utf8'))
  const manifest = createRepairManifest(db, { backupDb, openingValues: option('--opening-values') ? JSON.parse(readFileSync(option('--opening-values'), 'utf8')) : [] })
  writeFileSync(`${prefix}.json`, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(`${prefix}.sql`, `-- Review first. Execute every statement together in one D1Database.batch transaction.\n-- Never issue these statements individually. Original rows and revision are guarded.\n${repairStatements(manifest).map(sql => `${sql};`).join('\n')}\n`)
  if (args.includes('--apply')) {
    const output = option('--output-db')
    if (!output || existsSync(output) || (databasePath && resolve(output) === resolve(databasePath))) throw new Error('--apply requires a new --output-db path; the input database is never changed')
    applyRepairManifest(db, manifest)
    db.exec(`VACUUM INTO ${quote(resolve(output))}`)
  }
  console.log(JSON.stringify({ manifest: `${prefix}.json`, sql: `${prefix}.sql`, patches: manifest.patches.length, quarantines: manifest.quarantines.length, appliedToCopy: args.includes('--apply') }))
  backupDb?.close(); db.close()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
