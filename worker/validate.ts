import { isDiscreteUnit, normalizeProductUnit, type AccountTransaction, type AdjustmentReason, type Customer, type ExpenseCategory, type PaymentMethod, type Product, type ProductUnit, type ReturnMethod, type ReturnSettlement, type Supplier, type SupplierPayment, type PurchaseSettlement, type InvoiceLine, type ReceivingRequest } from '../src/model'

export class ValidationError extends Error {}

const MAX_LIST = 500
const MAX_MONEY = 100_000_000
const MAX_QUANTITY = 10_000_000
const MAX_SALE_QUANTITY = 1_000_000_000 // BDT-denominated services use scaled currency amounts.
const MAX_STOCK = 1_000_000_000

const PRODUCT_CATEGORIES: readonly Product['category'][] = ['staples', 'fresh', 'household']
const PRODUCT_UNITS: readonly ProductUnit[] = ['Unit', 'kg', 'pc', 'L', 'BDT']
const PRODUCT_ART: readonly Product['art'][] = ['rice', 'oil', 'egg', 'milk', 'sugar', 'tea', 'soap', 'flour', 'lentil', 'biscuit', 'salt', 'cleaner', 'pencil', 'book', 'notebook', 'pen', 'snack', 'daily']
const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'mobile', 'bank']
const RETURN_METHODS: readonly ReturnMethod[] = ['cash', 'mobile', 'bank', 'due']
const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['rent', 'utility', 'salary', 'transport', 'other']
const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = ['damage', 'loss', 'count', 'other']
const TRANSACTION_TYPES: readonly AccountTransaction['type'][] = ['sale_due', 'payment', 'credit_adjust']

export type SaleLine = { productId: string; quantity: number; unitPrice?: number; legacyAmount?: boolean }

export type ReceiptInput = {
  id: string
  number: number
  createdAt: string
  customerId: string | null
  lines: SaleLine[]
  discount: number
  tendered: number
  method: PaymentMethod
  address?: string
  remarks?: string
  preparedBy?: string
  claimedTotal?: number // Total the device calculated; compared with the server's total, never trusted
  creditApplied?: number
}

export type TransactionInput = AccountTransaction

export type PurchaseInput = {
  id: string
  createdAt: string
  lines: { productId: string; quantity: number; unitCost: number; total: number }[]
  mode?: 'invoice'
  invoiceLines?: InvoiceLine[]
  supplier?: string
  supplierId?: string
  paid?: number
  invoiceNumber?: string
  method?: PaymentMethod
  note?: string
}

export type ExpenseInput = {
  id: string
  createdAt: string
  category: ExpenseCategory
  amount: number
  method: PaymentMethod
  note?: string
}

export type AdjustmentInput = {
  id: string
  createdAt: string
  productId: string
  quantity: number
  reason: AdjustmentReason
  counted?: number
  note?: string
}

export type ReturnInput = {
  id: string
  createdAt: string
  receiptId: string
  method: ReturnMethod
  restock: boolean
  refunded: number // Claimed refund; must not exceed the server-calculated amount
  note?: string
  lines: SaleLine[]
  conditions?: Record<string, 'sellable' | 'damaged'>
  replacementLines?: (SaleLine & { product?: Product; amount: number; cost: number })[]
  settlement?: ReturnSettlement
  reason?: string
  operator?: string
}

export type ValuationCheckpointInput = { productId: string; expectedQuantity: number; inventoryValue: number; reason: string }

export type PurchaseVoidInput = { purchaseId: string; createdAt: string; reason?: string }

export type Rejection = { type: string; id: string | null; reason: string }

export type MutationInput = {
  expectedRevision: number
  confirmDraft: boolean
  terminalId: number
  draft?: { lines: SaleLine[]; discount: number; customerId: string | null }
  valuationCheckpoints: ValuationCheckpointInput[]
  deletedExpenses: string[]
  receipts: ReceiptInput[]
  transactions: TransactionInput[]
  stockReceivings: { id: string; purchaseId: string; createdAt: string; note?: string; lines: ReceivingRequest[] }[]
  purchases: PurchaseInput[]
  suppliers: Supplier[]
  supplierPayments: SupplierPayment[]
  purchaseSettlements: PurchaseSettlement[]
  expenses: ExpenseInput[]
  adjustments: AdjustmentInput[]
  returns: ReturnInput[]
  purchaseVoids: PurchaseVoidInput[]
  customProducts: Product[]
  customCustomers: Customer[]
  rejected: Rejection[]
}

function fail(path: string, message: string): never {
  throw new ValidationError(`${path} ${message}`)
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object')
  return value as Record<string, unknown>
}

function asList(value: unknown, path: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(path, 'must be a list')
  if (value.length > MAX_LIST) fail(path, `can hold at most ${MAX_LIST} items`)
  return value
}

function text(value: unknown, path: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be non-empty text')
  if (value.length > max) fail(path, `must be at most ${max} characters`)
  return value
}

function optionalText(value: unknown, path: string, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') fail(path, 'must be text')
  if (value.length > max) fail(path, `must be at most ${max} characters`)
  return value.trim() || undefined
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(path, `must be a whole number from ${min} to ${max}`)
  }
  return value
}

function optionalInteger(value: unknown, path: string, min: number, max: number): number | undefined {
  return value === undefined || value === null ? undefined : integer(value, path, min, max)
}

function choice<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) fail(path, `must be one of: ${options.join(', ')}`)
  return value as T
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be true or false')
  return value
}

function timestamp(value: unknown, path: string): string {
  const raw = text(value, path, 40)
  if (Number.isNaN(Date.parse(raw))) fail(path, 'must be a valid date')
  return raw
}

function salePriceFields(line: Record<string, unknown>, path: string) {
  return {
    ...(line.unitPrice !== undefined ? { unitPrice: integer(line.unitPrice, `${path}.unitPrice`, 1, MAX_MONEY) } : {}),
    ...(line.legacyAmount === true ? { legacyAmount: true } : {}),
  }
}

function saleLines(value: unknown, path: string): SaleLine[] {
  const list = asList(value, path)
  if (!list.length) fail(path, 'must contain at least one item')
  return list.map((item, index) => {
    const itemPath = `${path}[${index}]`
    const line = asObject(item, itemPath)
    return {
      productId: text(line.productId, `${itemPath}.productId`, 80),
      quantity: integer(line.quantity, `${itemPath}.quantity`, 1, MAX_SALE_QUANTITY),
      ...salePriceFields(line, itemPath),
    }
  })
}

function parseReceipt(o: Record<string, unknown>, path: string): ReceiptInput {
  const customer = o.customer === undefined || o.customer === null ? null : asObject(o.customer, `${path}.customer`)
  return {
    id: text(o.id, `${path}.id`, 80),
    number: integer(o.number, `${path}.number`, 1, 1_000_000_000),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
    customerId: customer ? text(customer.id, `${path}.customer.id`, 80) : null,
    lines: saleLines(o.lines, `${path}.lines`),
    discount: integer(o.discount, `${path}.discount`, 0, MAX_MONEY),
    tendered: integer(o.tendered, `${path}.tendered`, 0, MAX_MONEY),
    method: choice(o.method, `${path}.method`, PAYMENT_METHODS),
    address: optionalText(o.address, `${path}.address`),
    remarks: optionalText(o.remarks, `${path}.remarks`),
    preparedBy: optionalText(o.preparedBy, `${path}.preparedBy`, 80),
    claimedTotal: typeof o.total === 'number' ? o.total : undefined,
    creditApplied: optionalInteger(o.creditApplied, `${path}.creditApplied`, 0, MAX_MONEY),
  }
}

function parseTransaction(o: Record<string, unknown>, path: string): TransactionInput {
  const transaction: TransactionInput = {
    id: text(o.id, `${path}.id`, 80),
    customerId: text(o.customerId, `${path}.customerId`, 80),
    type: choice(o.type, `${path}.type`, TRANSACTION_TYPES),
    amount: integer(o.amount, `${path}.amount`, -MAX_MONEY, MAX_MONEY),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
  }
  if (transaction.type === 'sale_due') fail(path, 'sale debt is derived from a receipt')
  if (transaction.type === 'payment' && transaction.amount <= 0) fail(path, 'payment amounts must be positive')
  if (transaction.type === 'credit_adjust' && transaction.amount === 0) fail(path, 'adjustment amount must be nonzero')
  const note = optionalText(o.note, `${path}.note`)
  const receiptId = optionalText(o.receiptId, `${path}.receiptId`, 80)
  if (note) transaction.note = note
  if (receiptId) transaction.receiptId = receiptId
  return transaction
}

function parsePurchase(o: Record<string, unknown>, path: string): PurchaseInput {
  const list = asList(o.lines, `${path}.lines`)
  const invoiceMode = o.mode === 'invoice'
  if (o.mode !== undefined && !invoiceMode) fail(`${path}.mode`, 'must be invoice')
  if (!invoiceMode && !list.length) fail(`${path}.lines`, 'must contain at least one item')
  if (invoiceMode && list.length) fail(`${path}.lines`, 'invoices cannot include automatic stock entries')
  const lines = list.map((item, index) => {
    const linePath = `${path}.lines[${index}]`
    const line = asObject(item, linePath)
    return {
      productId: text(line.productId, `${linePath}.productId`, 80),
      quantity: integer(line.quantity, `${linePath}.quantity`, 1, MAX_QUANTITY),
      unitCost: integer(line.unitCost, `${linePath}.unitCost`, 0, MAX_MONEY),
      total: integer(line.total, `${linePath}.total`, 0, MAX_MONEY),
    }
  })
  const purchase: PurchaseInput = {
    id: text(o.id, `${path}.id`, 80),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
    lines,
  }
  if (invoiceMode) {
    purchase.mode = 'invoice'
    const invoiceLines: InvoiceLine[] = asList(o.invoiceLines, `${path}.invoiceLines`).map((raw, index) => {
      const l = asObject(raw, `${path}.invoiceLines[${index}]`)
      return { id: text(l.id, `${path}.line.id`, 80), description: text(l.description, `${path}.description`, 500).trim(),
        unit: normalizeProductUnit(choice(l.unit, `${path}.unit`, ['Unit', 'pc', 'kg', 'L'] as const)), quantity: integer(l.quantity, `${path}.quantity`, 1, MAX_QUANTITY), total: integer(l.total, `${path}.total`, 1, MAX_MONEY) }
    })
    purchase.invoiceLines = invoiceLines
    if (!invoiceLines.length || new Set(invoiceLines.map(l => l.id)).size !== invoiceLines.length) fail(path, 'invoice lines need unique identities')
    for (const l of invoiceLines) if (isDiscreteUnit(l.unit) && l.quantity % 1000 !== 0) fail(path, 'invoice units must be whole numbers')
  }
  const supplier = optionalText(o.supplier, `${path}.supplier`, 200)
  const note = optionalText(o.note, `${path}.note`)
  if (supplier) purchase.supplier = supplier
  const supplierId = optionalText(o.supplierId, `${path}.supplierId`, 80)
  if (supplierId) purchase.supplierId = supplierId
  const paid = optionalInteger(o.paid, `${path}.paid`, 0, MAX_MONEY)
  if (paid !== undefined) purchase.paid = paid
  const invoiceNumber = optionalText(o.invoiceNumber, `${path}.invoiceNumber`, 200)
  if (invoiceNumber) purchase.invoiceNumber = invoiceNumber
  if (o.method !== undefined) purchase.method = choice(o.method, `${path}.method`, PAYMENT_METHODS)
  if (note) purchase.note = note
  return purchase
}

function parseExpense(o: Record<string, unknown>, path: string): ExpenseInput {
  const expense: ExpenseInput = {
    id: text(o.id, `${path}.id`, 80),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
    category: choice(o.category, `${path}.category`, EXPENSE_CATEGORIES),
    amount: integer(o.amount, `${path}.amount`, 1, MAX_MONEY),
    method: choice(o.method, `${path}.method`, PAYMENT_METHODS),
  }
  const note = optionalText(o.note, `${path}.note`)
  if (note) expense.note = note
  return expense
}

function parseAdjustment(o: Record<string, unknown>, path: string): AdjustmentInput {
  const quantity = integer(o.quantity, `${path}.quantity`, -MAX_QUANTITY, MAX_QUANTITY)
  if (quantity === 0) fail(`${path}.quantity`, 'must not be zero')
  const adjustment: AdjustmentInput = {
    id: text(o.id, `${path}.id`, 80),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
    productId: text(o.productId, `${path}.productId`, 80),
    quantity,
    reason: choice(o.reason, `${path}.reason`, ADJUSTMENT_REASONS),
  }
  const counted = optionalInteger(o.counted, `${path}.counted`, 0, MAX_QUANTITY)
  const note = optionalText(o.note, `${path}.note`)
  if (counted !== undefined) adjustment.counted = counted
  if (note) adjustment.note = note
  return adjustment
}

function parseReturn(o: Record<string, unknown>, path: string): ReturnInput {
  const entry: ReturnInput = {
    id: text(o.id, `${path}.id`, 80),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
    receiptId: text(o.receiptId, `${path}.receiptId`, 80),
    method: choice(o.method, `${path}.method`, RETURN_METHODS),
    restock: flag(o.restock, `${path}.restock`),
    refunded: integer(o.refunded, `${path}.refunded`, 0, MAX_MONEY),
    lines: saleLines(o.lines, `${path}.lines`),
  }
  const note = optionalText(o.note, `${path}.note`)
  if (note) entry.note = note
  if (o.settlement !== undefined) {
    const settlement = asObject(o.settlement, `${path}.settlement`)
    entry.settlement = {
      dueReduced: integer(settlement.dueReduced, `${path}.settlement.dueReduced`, 0, MAX_MONEY),
      exchangeCredit: integer(settlement.exchangeCredit, `${path}.settlement.exchangeCredit`, 0, MAX_MONEY),
      payout: integer(settlement.payout, `${path}.settlement.payout`, 0, MAX_MONEY),
      creditIssued: integer(settlement.creditIssued, `${path}.settlement.creditIssued`, 0, MAX_MONEY),
      received: integer(settlement.received, `${path}.settlement.received`, 0, MAX_MONEY),
      newDue: integer(settlement.newDue, `${path}.settlement.newDue`, 0, MAX_MONEY),
      method: choice(settlement.method, `${path}.settlement.method`, PAYMENT_METHODS),
    }
    entry.reason = text(o.reason, `${path}.reason`, 500)
    entry.operator = text(o.operator, `${path}.operator`, 200)
    const rawLines = asList(o.lines, `${path}.lines`)
    entry.conditions = {}
    for (let index = 0; index < rawLines.length; index++) {
      const line = asObject(rawLines[index], `${path}.lines[${index}]`)
      const productId = text(line.productId, `${path}.lines[${index}].productId`, 80)
      entry.conditions[productId] = choice(line.condition, `${path}.lines[${index}].condition`, ['sellable', 'damaged'] as const)
    }
    const rawReplacements = asList(o.replacementLines, `${path}.replacementLines`)
    entry.replacementLines = rawReplacements.map((raw, index) => {
      const line = asObject(raw, `${path}.replacementLines[${index}]`)
      return {
        productId: text(line.productId, `${path}.replacementLines[${index}].productId`, 80),
        quantity: integer(line.quantity, `${path}.replacementLines[${index}].quantity`, 1, MAX_SALE_QUANTITY),
        ...salePriceFields(line, `${path}.replacementLines[${index}]`),
        amount: integer(line.amount, `${path}.replacementLines[${index}].amount`, 0, MAX_MONEY),
        cost: integer(line.cost, `${path}.replacementLines[${index}].cost`, 0, MAX_MONEY),
        ...(line.product ? { product: parseCustomProduct(asObject(line.product, `${path}.replacementLines[${index}].product`), `${path}.replacementLines[${index}].product`) } : {}),
      }
    })
  }
  return entry
}

function parsePurchaseVoid(o: Record<string, unknown>, path: string): PurchaseVoidInput {
  const entry: PurchaseVoidInput = {
    purchaseId: text(o.purchaseId, `${path}.purchaseId`, 80),
    createdAt: timestamp(o.createdAt, `${path}.createdAt`),
  }
  const reason = optionalText(o.reason, `${path}.reason`)
  if (reason) entry.reason = reason
  return entry
}

function parseCustomProduct(o: Record<string, unknown>, path: string): Product {
  const color = o.color === undefined ? '#ffffff' : text(o.color, `${path}.color`, 7)
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail(`${path}.color`, 'must be a hex colour such as #ffffff')
  const product: Product = {
    id: text(o.id, `${path}.id`, 80),
    code: text(o.code, `${path}.code`, 40),
    en: text(o.en, `${path}.en`, 200),
    detail: optionalText(o.detail, `${path}.detail`, 300) ?? '',
    detailBn: optionalText(o.detailBn, `${path}.detailBn`, 300) ?? '',
    warranty: optionalText(o.warranty, `${path}.warranty`, 100) ?? '',
    category: choice(o.category, `${path}.category`, PRODUCT_CATEGORIES),
    unit: normalizeProductUnit(choice(o.unit, `${path}.unit`, PRODUCT_UNITS)),
    price: integer(o.price, `${path}.price`, 0, MAX_MONEY),
    stock: integer(o.stock, `${path}.stock`, -MAX_STOCK, MAX_STOCK),
    art: o.art === undefined ? 'daily' : choice(o.art, `${path}.art`, PRODUCT_ART),
    color,
  }
  if (o.kind !== undefined && o.kind !== null) product.kind = choice(o.kind, `${path}.kind`, ['service'] as const)
  const cost = optionalInteger(o.cost, `${path}.cost`, 0, MAX_MONEY)
  const purchased = optionalInteger(o.purchased, `${path}.purchased`, 0, MAX_STOCK)
  const groupId = optionalText(o.groupId, `${path}.groupId`, 80)
  const variantName = optionalText(o.variantName, `${path}.variantName`, 100)
  if (cost !== undefined) product.cost = cost
  if (purchased !== undefined) product.purchased = purchased
  if (groupId) product.groupId = groupId
  if (variantName) product.variantName = variantName
  if (o.archived === true) product.archived = true
  if (product.kind === 'service' && (product.stock !== 0 || (product.purchased ?? 0) !== 0)) fail(path, 'services cannot carry stock or purchased quantities')
  return product
}

function parseCustomCustomer(o: Record<string, unknown>, path: string): Customer {
  const customer: Customer = {
    id: text(o.id, `${path}.id`, 80),
    en: text(o.en, `${path}.en`, 200),
    bn: optionalText(o.bn, `${path}.bn`, 200) ?? '',
    phone: optionalText(o.phone, `${path}.phone`, 40) ?? '',
  }
  const address = optionalText(o.address, `${path}.address`, 300)
  const openingBalance = optionalInteger(o.openingBalance, `${path}.openingBalance`, -MAX_MONEY, MAX_MONEY)
  const note = optionalText(o.note, `${path}.note`)
  if (address) customer.address = address
  if (openingBalance !== undefined) customer.openingBalance = openingBalance
  if (note) customer.note = note
  return customer
}

function idOf(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  const id = record.id ?? record.purchaseId
  return typeof id === 'string' ? id : null
}

// Collect item errors so the endpoint can reject the entire operation.
function collect<T>(type: string, value: unknown, parse: (o: Record<string, unknown>, path: string) => T, rejected: Rejection[]): T[] {
  const valid: T[] = []
  asList(value, type).forEach((item, index) => {
    const path = `${type}[${index}]`
    try {
      valid.push(parse(asObject(item, path), path))
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      rejected.push({ type, id: idOf(item), reason: error.message })
    }
  })
  return valid
}

export function parseMutationPayload(body: unknown): MutationInput {
  const o = asObject(body, 'body')
  const rejected: Rejection[] = []
  const expectedRevision = integer(o.expectedRevision, 'expectedRevision', 0, Number.MAX_SAFE_INTEGER)
  const terminalId = integer(o.terminalId, 'terminalId', 1, 999)
  let draft: MutationInput['draft']
  if (o.draft !== undefined) {
    const d = asObject(o.draft, 'draft')
    if (!Array.isArray(d.lines)) fail('draft.lines', 'must be a list')
    draft = {
      lines: asList(d.lines, 'draft.lines').map((line, index) => {
        const l = asObject(line, `draft.lines[${index}]`)
        return { productId: text(l.productId, 'draft.productId', 100), quantity: integer(l.quantity, 'draft.quantity', 1, MAX_SALE_QUANTITY), ...salePriceFields(l, `draft.lines[${index}]`) }
      }),
      discount: integer(d.discount, 'draft.discount', 0, MAX_MONEY),
      customerId: d.customerId === null ? null : text(d.customerId, 'draft.customerId', 100),
    }
  }
  return {
    expectedRevision,
    confirmDraft: o.confirmDraft === undefined ? false : flag(o.confirmDraft, 'confirmDraft'),
    terminalId,
    draft,
    valuationCheckpoints: collect('valuationCheckpoints', o.valuationCheckpoints, (v, path) => ({
      productId: text(v.productId, `${path}.productId`, 80),
      expectedQuantity: integer(v.expectedQuantity, `${path}.expectedQuantity`, 0, MAX_STOCK),
      inventoryValue: integer(v.inventoryValue, `${path}.inventoryValue`, 0, Number.MAX_SAFE_INTEGER),
      reason: text(v.reason, `${path}.reason`, 500),
    }), rejected),
    deletedExpenses: asList(o.deletedExpenses, 'deletedExpenses').map(id => text(id, 'deletedExpenses', 100)),
    receipts: collect('receipts', o.receipts, parseReceipt, rejected),
    transactions: collect('transactions', o.transactions, parseTransaction, rejected),
    stockReceivings: collect('stockReceivings', o.stockReceivings, (v, path) => {
      const lines = asList(v.lines, `${path}.lines`).map(raw => {
        const l = asObject(raw, `${path}.line`)
        return { invoiceLineId: text(l.invoiceLineId, `${path}.invoiceLineId`, 80), productId: text(l.productId, `${path}.productId`, 80), quantity: integer(l.quantity, `${path}.quantity`, 1, MAX_QUANTITY), allocatedCost: optionalInteger(l.allocatedCost, `${path}.allocatedCost`, 0, MAX_MONEY) }
      })
      if (!lines.length) fail(path, 'must have stock lines')
      return { id: text(v.id, `${path}.id`, 80), purchaseId: text(v.purchaseId, `${path}.purchaseId`, 80), createdAt: timestamp(v.createdAt, `${path}.createdAt`), note: optionalText(v.note, `${path}.note`), lines }
    }, rejected),
    purchases: collect('purchases', o.purchases, parsePurchase, rejected),
    suppliers: collect('suppliers', o.suppliers, (v, path) => ({
      id: text(v.id, `${path}.id`, 80), name: text(v.name, `${path}.name`, 200).trim(),
      phone: optionalText(v.phone, `${path}.phone`, 80), address: optionalText(v.address, `${path}.address`),
      note: optionalText(v.note, `${path}.note`), archived: v.archived === undefined ? false : flag(v.archived, `${path}.archived`),
    }), rejected),
    supplierPayments: collect('supplierPayments', o.supplierPayments, (v, path) => ({
      id: text(v.id, `${path}.id`, 80), purchaseId: text(v.purchaseId, `${path}.purchaseId`, 80),
      supplierId: optionalText(v.supplierId, `${path}.supplierId`, 80), amount: integer(v.amount, `${path}.amount`, 1, MAX_MONEY),
      method: choice(v.method, `${path}.method`, PAYMENT_METHODS), type: choice(v.type, `${path}.type`, ['payment', 'refund'] as const),
      createdAt: timestamp(v.createdAt, `${path}.createdAt`), note: optionalText(v.note, `${path}.note`),
    }), rejected),
    purchaseSettlements: collect('purchaseSettlements', o.purchaseSettlements, (v, path) => ({
      id: text(v.id, `${path}.id`, 80), purchaseId: text(v.purchaseId, `${path}.purchaseId`, 80),
      supplierId: optionalText(v.supplierId, `${path}.supplierId`, 80), paid: integer(v.paid, `${path}.paid`, 0, MAX_MONEY),
      method: choice(v.method, `${path}.method`, PAYMENT_METHODS), createdAt: timestamp(v.createdAt, `${path}.createdAt`),
      note: text(v.note, `${path}.note`, 500),
    }), rejected),
    expenses: collect('expenses', o.expenses, parseExpense, rejected),
    adjustments: collect('adjustments', o.adjustments, parseAdjustment, rejected),
    returns: collect('returns', o.returns, parseReturn, rejected),
    purchaseVoids: collect('purchaseVoids', o.purchaseVoids, parsePurchaseVoid, rejected),
    customProducts: collect('customProducts', o.customProducts, parseCustomProduct, rejected),
    customCustomers: collect('customCustomers', o.customCustomers, parseCustomCustomer, rejected),
    rejected,
  }
}
