export type Lang = 'en' | 'bn'
export type Category = 'recent' | 'all' | 'staples' | 'fresh' | 'household'
// `Unit` remains accepted for older saved records; new records use `pc`.
export type ProductUnit = 'Unit' | 'pc' | 'kg' | 'L' | 'BDT'
export type CanonicalProductUnit<T extends ProductUnit> = T extends 'Unit' | 'pc' ? 'pc' : T
export type CostStatus = 'recorded' | 'estimated' | 'unassigned' | 'unverified'
export type ValuationStatus = 'verified' | 'provided' | 'unverified'
export type Product = {
  id: string; code: string; en: string; detail: string; detailBn: string
  category: Exclude<Category, 'all' | 'recent'>; unit: ProductUnit; price: number; stock: number
  warranty?: string // Warranty terms associated with this product code.
  kind?: 'service' // Services are billed without inventory or purchase quantities.
  cost?: number // Wholesale / purchase cost per unit in Taka (integer: ৳1)
  inventoryValue?: number // Current on-hand inventory book value in whole Taka.
  valuationStatus?: ValuationStatus
  purchased?: number // Total units purchased / provisioned (scaled integer: 1 unit = 1000)
  groupId?: string // Identifier linking variants of the same product (e.g. 'egg', 'soap')
  variantName?: string // Short variant name for inline picker e.g. 'Brown' / 'White'
  archived?: boolean // Discontinued and hidden from the sales catalog
  art: 'rice' | 'oil' | 'egg' | 'milk' | 'sugar' | 'tea' | 'soap' | 'flour' | 'lentil' | 'biscuit' | 'salt' | 'cleaner' | 'pencil' | 'book' | 'notebook' | 'pen' | 'snack' | 'daily'
  color: string
  updated_at?: string
}
export type Line = { productId: string; quantity: number; unitPrice?: number; legacyAmount?: boolean }
export type ReceiptLine = Line & { product: Product; gross?: number; costAmount?: number; costStatus?: CostStatus }
export type Customer = {
  id: string
  en: string
  bn: string
  phone: string
  address?: string
  openingBalance?: number // Initial due balance in Taka
  note?: string
  accountingIssue?: string
  updated_at?: string
}

export type AccountTransaction = {
  id: string
  customerId: string
  type: 'sale_due' | 'payment' | 'credit_adjust'
  amount: number // In Taka (integer)
  createdAt: string
  note?: string
  receiptId?: string
  accountingIssue?: string
}

export type PaymentMethod = 'cash' | 'mobile' | 'bank'

export type Supplier = { id: string; name: string; phone?: string; address?: string; note?: string; archived?: boolean }
export type SupplierPayment = {
  id: string; purchaseId: string; supplierId?: string; amount: number; method: PaymentMethod
  type: 'payment' | 'refund'; createdAt: string; note?: string
}
// Historical purchases are linked and reconciled explicitly, without changing their stock history.
export type PurchaseSettlement = { id: string; purchaseId: string; supplierId?: string; paid: number; method: PaymentMethod; createdAt: string; note: string }

export type PurchaseLine = {
  productId: string
  quantity: number // Scaled integer: 1 unit = 1000
  unitCost: number // Buy price per unit in Taka
  total: number // Exact amount paid for this line in Taka
}

export type InvoiceLine = { id: string; description: string; unit: Exclude<ProductUnit, 'BDT'>; quantity: number; total: number }
export type StockReceivingLine = PurchaseLine & { invoiceLineId: string; allocatedCost?: number }
export type StockReceiving = { id: string; purchaseId: string; createdAt: string; currencyVersion: 2; lines: StockReceivingLine[]; note?: string }
export type ReceivingRequest = { invoiceLineId: string; productId: string; quantity: number; allocatedCost?: number }

export type Purchase = {
  id: string
  createdAt: string
  lines: PurchaseLine[]
  mode?: 'invoice' // Older combined entries retain their original stock behavior.
  invoiceLines?: InvoiceLine[]
  total: number // In Taka, sum of line totals
  currencyVersion?: 2
  accountingIssue?: string
  supplier?: string
  supplierId?: string
  paid?: number // Initial payment; undefined means historical settlement is unconfirmed.
  invoiceNumber?: string
  method?: PaymentMethod // Recorded when the purchase is paid immediately
  note?: string
  voidedAt?: string // Set when the purchase was voided; the record stays for audit
  voidReason?: string
}

export type ExpenseCategory = 'rent' | 'utility' | 'salary' | 'transport' | 'other'

export type Expense = {
  id: string
  createdAt: string
  category: ExpenseCategory
  amount: number // In Taka
  method: PaymentMethod
  note?: string
}

export type AdjustmentReason = 'damage' | 'loss' | 'count' | 'other'

export type StockAdjustment = {
  id: string
  createdAt: string
  productId: string
  quantity: number // Signed scaled delta: negative reduces stock
  costAmount?: number // Signed inventory book-value change in whole Taka.
  reason: AdjustmentReason
  counted?: number // Physical count in scaled units, when entered as a count
  note?: string
}

export type ReturnLine = {
  productId: string
  quantity: number // Scaled units returned
  amount: number // Discount-adjusted refund share in Taka
  cost: number // Cost of the returned units in Taka
  costStatus?: CostStatus
  condition?: 'sellable' | 'damaged'
}

export type ExchangeLine = Line & { product: Product; amount: number; cost: number; costStatus?: CostStatus }
export type ReturnSettlement = {
  dueReduced: number
  exchangeCredit: number
  payout: number
  creditIssued: number
  received: number
  newDue: number
  method: PaymentMethod
}

export type ReturnMethod = PaymentMethod | 'due'

export type Return = {
  id: string
  createdAt: string
  receiptId: string
  receiptNumber: number // Snapshot for display even if the receipt list changes
  customerId?: string
  lines: ReturnLine[]
  refunded: number // Return value in Taka; settlement separates payouts, due reduction, and credit
  currencyVersion?: 2
  accountingIssue?: string
  method: ReturnMethod
  restock: boolean
  note?: string
  reason?: string
  operator?: string
  replacementLines?: ExchangeLine[]
  settlement?: ReturnSettlement
}

export type Receipt = {
  id: string
  number: number
  createdAt: string
  lines: ReceiptLine[]
  customer: Customer | null
  subtotal: number
  discount: number
  total: number
  paid: number
  tendered: number
  change: number
  due: number
  currencyVersion?: 2
  accountingIssue?: string
  method: PaymentMethod
  creditApplied?: number
  address?: string
  remarks?: string
  preparedBy?: string
}

export type ShopState = {
  version?: 2
  lines: Line[]
  discount: number
  customerId: string | null
  receipts: Receipt[]
  customProducts?: Product[]
  customCustomers?: Customer[]
  transactions?: AccountTransaction[]
  purchases?: Purchase[]
  suppliers?: Supplier[]
  supplierPayments?: SupplierPayment[]
  purchaseSettlements?: PurchaseSettlement[]
  stockReceivings?: StockReceiving[]
  expenses?: Expense[]
  adjustments?: StockAdjustment[]
  returns?: Return[]
  terminalId?: number
  draftAccountingIssue?: string
  accountingIssues?: { table: string; id: string; reason: string }[]
}
export const initialState: ShopState = {
  version: 2, lines: [], discount: 0, customerId: null, receipts: [],
  customProducts: [], customCustomers: [], transactions: [], purchases: [], suppliers: [],
  supplierPayments: [], purchaseSettlements: [], stockReceivings: [], expenses: [], adjustments: [], returns: [],
}
// Normalize current catalog entries only; historical receipt snapshots keep their units.
const currentCatalogProduct = (product: Product): Product => ({
  ...product,
  unit: normalizeProductUnit(isService(product) && product.unit === 'BDT' ? 'pc' : product.unit),
  art: product.art,
})
// The supplied records are the complete catalog loaded from D1. An empty
// database stays empty in every build mode; there is no embedded fallback.
export const allProducts = (stored: Product[] = []): Product[] => [...new Map(stored.map(product => [product.id, currentCatalogProduct(product)])).values()]
export const allCustomers = (stored: Customer[] = []): Customer[] => [...new Map(stored.map(customer => [customer.id, customer])).values()]
export const findCustomerIn = (id: string, list: Customer[]) => list.find(c => c.id === id)
export const fallbackProduct = (id: string): Product => ({
  id,
  code: '---',
  en: 'Discontinued Item',
  detail: 'Discontinued item',
  detailBn: 'বাতিলকৃত পণ্য',
  category: 'staples',
  unit: 'pc',
  price: 0,
  cost: 0,
  stock: 0,
  archived: true,
  art: 'daily',
  color: '#999999',
})

export const findProductIn = (id: string, list: Product[] = []): Product =>
  list.find(p => p.id === id) ?? fallbackProduct(id)

export function getProductVariants(product: Product, catalog: Product[] = []): Product[] {
  if (!product.groupId) return [product]
  return catalog.filter(item => item.groupId === product.groupId)
}

export function displayCatalogProducts(catalog: Product[] = []): Product[] {
  const seenGroups = new Set<string>()
  const list: Product[] = []
  for (const p of catalog.filter(item => !item.archived)) {
    if (p.groupId) {
      if (!seenGroups.has(p.groupId)) {
        seenGroups.add(p.groupId)
        list.push(p)
      }
    } else {
      list.push(p)
    }
  }
  return list
}

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯'

export function normalizeBengaliDigits(text: string): string {
  return text.replace(/[০-৯]/g, ch => String(BENGALI_DIGITS.indexOf(ch)))
}

export function cleanSearchText(text: string): string {
  return normalizeBengaliDigits(text || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
}

export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  const lenDiff = Math.abs(la - lb)
  if (lenDiff > 3) return lenDiff

  const dp: number[][] = []
  for (let i = 0; i <= la; i++) {
    dp[i] = new Array(lb + 1)
    dp[i][0] = i
  }
  for (let j = 0; j <= lb; j++) {
    dp[0][j] = j
  }

  for (let i = 1; i <= la; i++) {
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1)
      const cost = ca === cb ? 0 : 1
      let dist = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        dist = Math.min(dist, dp[i - 2][j - 2] + 1)
      }
      dp[i][j] = dist
    }
  }

  return dp[la][lb]
}

const PHONETIC_SYNONYMS: Record<string, string[]> = {
  // Stationery
  'খাতা': ['khata', 'kata', 'notebook', 'book', 'exercise'],
  'বই': ['boi', 'book'],
  'কলম': ['kolom', 'kalam', 'pen', 'ballpen'],
  'পেন্সিল': ['pencil', 'pensil', 'pencl'],
  'কাটার': ['sharpener', 'katar', 'sharpner'],
  'রাবার': ['eraser', 'rabar', 'raber', 'rubber'],
  'স্কেল': ['scale', 'skel', 'ruler'],
  'গ্লু': ['glue', 'glu', 'stick'],
  'ড্রয়িং': ['drawing', 'draw', 'art'],
  // Grocery & Daily
  'আলু': ['alu', 'potato'],
  'চিপস': ['chips', 'cipsh', 'crisps'],
  'পানি': ['pani', 'water'],
  'বোতল': ['botol', 'bottle'],
  'বিদ্যুৎ': ['electricity', 'biddut', 'bidyut', 'meter', 'prepaid'],
  'ইন্টারনেট': ['internet', 'data', 'broadband', 'wifi'],
  'টিভি': ['tv', 'television', 'dth', 'cable'],
  'চাল': ['chal', 'rice'],
  'তেল': ['tel', 'oil'],
  'ডিম': ['dim', 'egg'],
  'চিনি': ['chini', 'sugar'],
  'চা': ['cha', 'tea'],
  'সাবান': ['soap', 'shaban', 'sabun'],
  'আটা': ['flour', 'ata'],
  'ময়দা': ['flour', 'moyda'],
  'ডাল': ['lentil', 'dal', 'daal'],
  'লবণ': ['salt', 'lobon', 'laban'],
  'দুধ': ['milk', 'dudh'],
  'বিস্কুট': ['biscuit', 'biskut'],
  'আম': ['mango', 'aam'],
}

function extractTokens(text?: string): string[] {
  if (!text) return []
  const cleaned = cleanSearchText(text)
  const rawTokens = cleaned.split(/[\s\-_\.,/:;()·#+*&|~'"!?]+/).filter(Boolean)
  const result = new Set(rawTokens)
  for (const t of rawTokens) {
    const parts = t.match(/([0-9]+|[a-z]+|[\u0980-\u09ff]+)/gi)
    if (parts && parts.length > 1) {
      for (const p of parts) result.add(p)
    }
  }
  return [...result]
}

function scoreTokenMatch(qToken: string, tToken: string): number {
  if (qToken === tToken) return 100

  const qIsDigits = /^\d+$/.test(qToken)
  const tIsDigits = /^\d+$/.test(tToken)

  if (qIsDigits && tIsDigits) {
    if (tToken.startsWith(qToken)) {
      return 75 + Math.round(25 * (qToken.length / tToken.length))
    }
    return 0
  }

  if (tToken.startsWith(qToken)) {
    return 70 + Math.round(25 * (qToken.length / tToken.length))
  }
  if (tToken.includes(qToken) && qToken.length >= 2) {
    return 55
  }
  if (tToken.endsWith(qToken) && qToken.length >= 3) {
    return 60
  }

  // Fuzzy match (for text/words)
  const qLen = qToken.length
  const tLen = tToken.length
  if (qLen < 3) return 0
  if (qIsDigits || tIsDigits) return 0

  const maxDist = qLen <= 4 ? 1 : qLen <= 7 ? 2 : 2
  const d = damerauLevenshtein(qToken, tToken)
  if (d <= maxDist) {
    const similarity = 1 - d / Math.max(qLen, tLen)
    return Math.round(75 * similarity)
  }

  // Fuzzy match against prefix of target token
  if (qLen >= 4 && tLen > qLen) {
    const tPrefix = tToken.slice(0, qLen)
    if (damerauLevenshtein(qToken, tPrefix) <= 1) {
      return 50
    }
  }

  return 0
}

function getSynonymsForTokens(tokens: string[]): string[] {
  const syns = new Set<string>()
  for (const t of tokens) {
    if (!t || t.length < 2) continue
    const direct = PHONETIC_SYNONYMS[t]
    if (direct) {
      for (const s of direct) syns.add(s)
    }
    for (const [key, list] of Object.entries(PHONETIC_SYNONYMS)) {
      if (list.includes(t)) {
        syns.add(key)
        for (const s of list) syns.add(s)
      }
    }
  }
  return [...syns]
}

export function scoreProductVariant(
  v: Product,
  query: string,
  compactQuery?: string,
  queryTokens?: string[]
): number {
  const cleanQ = cleanSearchText(query).trim()
  const compactQ = compactQuery ?? cleanQ.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  const qTokens = queryTokens ?? cleanQ.split(/[\s\-_\.,/:;()·#+*&|~'"!?]+/).filter(Boolean)

  if (!cleanQ) return 0

  const code = cleanSearchText(v.code)
  const baseCode = cleanSearchText(v.groupId ? v.groupId.replace(/^grp-\d+-/, '') : '')
  const compactCode = code.replace(/[\s\-]/g, '')
  const compactBaseCode = baseCode.replace(/[\s\-]/g, '')
  const isPureDigits = /^\d+$/.test(compactQ)

  let score = 0

  // 1. Code match boosts
  if (compactQ === compactCode || (compactBaseCode && compactQ === compactBaseCode)) {
    score += 3000
  } else if (compactCode.startsWith(compactQ) || (compactBaseCode && compactBaseCode.startsWith(compactQ))) {
    score += 1500
  } else if (!isPureDigits && (compactCode.includes(compactQ) || (compactBaseCode && compactBaseCode.includes(compactQ)))) {
    score += 600
  } else if (!isPureDigits && compactQ.length >= 3 && (damerauLevenshtein(compactQ, compactCode) <= 1 || (compactBaseCode && damerauLevenshtein(compactQ, compactBaseCode) <= 1))) {
    score += 500
  }

  // 2. Full phrase / Name match
  const enClean = cleanSearchText(v.en)
  const enCompact = enClean.replace(/[\s\-]/g, '')

  if (enCompact === compactQ) {
    score += 2000
  } else if (enClean.startsWith(cleanQ)) {
    score += 1200
  } else if (enCompact.startsWith(compactQ)) {
    score += 1000
  } else if (enCompact.includes(compactQ)) {
    score += 700
  }

  // 3. Token-based matching
  const primaryTokens = [
    ...extractTokens(v.en),
    ...extractTokens(v.variantName),
    ...extractTokens(v.code),
    ...extractTokens(baseCode),
  ]
  const secondaryTokens = [
    ...extractTokens(v.detail),
    ...extractTokens(v.detailBn),
    ...extractTokens(v.id),
    ...extractTokens(v.category),
  ]
  const synTokens = getSynonymsForTokens([...primaryTokens, ...secondaryTokens])

  // Compound check: e.g. ballpen matching [ball, pen]
  for (let i = 0; i < primaryTokens.length - 1; i++) {
    const pair = primaryTokens[i] + primaryTokens[i + 1]
    if (pair === compactQ) {
      score += 900
      break
    }
  }

  if (qTokens.length === 0) return score

  let matchedCount = 0
  let tokenScoreSum = 0

  for (const qToken of qTokens) {
    let best = 0
    for (const pt of primaryTokens) {
      best = Math.max(best, scoreTokenMatch(qToken, pt) * 2.0)
    }
    for (const st of synTokens) {
      best = Math.max(best, scoreTokenMatch(qToken, st) * 1.6)
    }
    for (const st of secondaryTokens) {
      best = Math.max(best, scoreTokenMatch(qToken, st) * 1.0)
    }

    if (best >= 40) {
      matchedCount++
      tokenScoreSum += best
    }
  }

  if (qTokens.length === 1) {
    score += tokenScoreSum
  } else {
    if (matchedCount === qTokens.length) {
      score += tokenScoreSum + 600
    } else if (matchedCount >= Math.ceil(qTokens.length * 0.6)) {
      score += Math.round(tokenScoreSum * (matchedCount / qTokens.length))
    }
  }

  return score
}

export function searchCatalog(
  catalog: Product[] = [],
  query: string = '',
  category: Category = 'recent',
  recentProducts: Product[] = []
): Product[] {
  const cleanQ = cleanSearchText(query).trim()
  const displayList = displayCatalogProducts(catalog)

  if (!cleanQ) {
    return category === 'recent'
      ? recentProducts
      : displayList.filter(p => category === 'all' || p.category === category)
  }

  const compactQ = cleanQ.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  const queryTokens = cleanQ.split(/[\s\-_\.,/:;()·#+*&|~'"!?]+/).filter(Boolean)

  const scoredList: { product: Product; score: number }[] = []
  for (const p of displayList) {
    const variants = getProductVariants(p, catalog).filter(v => !v.archived)
    if (!variants.length) continue

    let bestScore = 0
    for (const v of variants) {
      const s = scoreProductVariant(v, cleanQ, compactQ, queryTokens)
      if (s > bestScore) bestScore = s
    }

    // Current category affinity bonus
    if (bestScore > 0 && p.category === category) {
      bestScore += 25
    }

    if (bestScore > 0) {
      scoredList.push({ product: p, score: bestScore })
    }
  }

  scoredList.sort((a, b) => b.score - a.score)
  return scoredList.map(item => item.product)
}

export function scoreCustomerMatchDetailed(
  customer: Customer,
  query: string,
  compactQuery?: string,
  queryTokens?: string[]
): { score: number; allTokensMatched: boolean } {
  const cleanQ = cleanSearchText(query).trim()
  if (!cleanQ) return { score: 0, allTokensMatched: false }

  const compactQ = compactQuery ?? cleanQ.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  if (!compactQ) return { score: 0, allTokensMatched: false }

  // 1. Prepare target customer fields
  const enClean = cleanSearchText(customer.en || '')
  const bnClean = cleanSearchText(customer.bn || '')
  const addressClean = cleanSearchText(customer.address || '')
  const enCompact = enClean.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  const bnCompact = bnClean.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  const addressCompact = addressClean.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')

  const rawPhone = cleanSearchText(customer.phone || '')
  const phoneDigits = rawPhone.replace(/\D/g, '')
  const localPhoneDigits = phoneDigits.replace(/^88/, '')

  const customerId = cleanSearchText(customer.id || '')
  const customerIdDigits = customerId.replace(/\D/g, '')

  const queryDigits = compactQ.replace(/\D/g, '')
  const queryLocalDigits = queryDigits.replace(/^88/, '')
  const isPureDigits = /^\d+$/.test(compactQ)

  let score = 0
  let directNameMatched = false
  let directNumberMatched = false
  let directAddressMatched = false

  // 2. Exact full matches
  if (phoneDigits && (compactQ === phoneDigits || queryLocalDigits === localPhoneDigits || compactQ === localPhoneDigits)) {
    score += 4000
    directNumberMatched = true
  } else if (enCompact === compactQ || bnCompact === compactQ) {
    score += 3500
    directNameMatched = true
  } else if (customerId && (compactQ === customerId || (customerIdDigits && isPureDigits && compactQ === customerIdDigits))) {
    score += 3000
    directNumberMatched = true
  } else if (addressCompact && addressCompact === compactQ) {
    score += 2800
    directAddressMatched = true
  }

  // 3. Pure digits query (phone number search)
  if (isPureDigits && queryDigits.length >= 2) {
    const isExplicitPrefix = queryDigits.startsWith('01') || queryDigits.startsWith('8801')
    const isSuffixMatch = queryDigits.length >= 3 && (phoneDigits.endsWith(queryDigits) || localPhoneDigits.endsWith(queryDigits))
    const isPrefixMatch = phoneDigits.startsWith(queryDigits) || (queryLocalDigits && localPhoneDigits.startsWith(queryLocalDigits))

    if (!isExplicitPrefix && isSuffixMatch) {
      score += 2600 + Math.round(500 * (queryDigits.length / Math.max(phoneDigits.length, 1)))
      directNumberMatched = true
    } else if (isPrefixMatch) {
      score += 2200 + Math.round(500 * (queryDigits.length / Math.max(phoneDigits.length, 1)))
      directNumberMatched = true
    } else if (isSuffixMatch) {
      score += 1800 + Math.round(400 * (queryDigits.length / Math.max(phoneDigits.length, 1)))
      directNumberMatched = true
    } else if (queryDigits.length >= 3 && (phoneDigits.includes(queryDigits) || localPhoneDigits.includes(queryDigits))) {
      score += 1300
      directNumberMatched = true
    }
  } else if (!isPureDigits) {
    if (enClean.startsWith(cleanQ) || bnClean.startsWith(cleanQ) || enCompact.startsWith(compactQ) || bnCompact.startsWith(compactQ)) {
      score += 1800
      directNameMatched = true
    } else if (enClean.includes(cleanQ) || bnClean.includes(cleanQ) || enCompact.includes(compactQ) || bnCompact.includes(compactQ)) {
      score += 1200
      directNameMatched = true
    } else if (addressClean.startsWith(cleanQ) || addressCompact.startsWith(compactQ)) {
      score += 1000
      directAddressMatched = true
    } else if (addressClean.includes(cleanQ) || addressCompact.includes(compactQ)) {
      score += 700
      directAddressMatched = true
    }
  }

  // 4. Token-level analysis
  const rawTokens = queryTokens ?? cleanQ.split(/[\s\-_\.,/:;()·#+*&|~'"!?]+/).filter(Boolean)
  const tokenList: string[] = []
  for (const t of rawTokens) {
    const parts = t.match(/([0-9]+|[a-z]+|[\u0980-\u09ff]+)/gi)
    if (parts && parts.length > 1) {
      for (const p of parts) tokenList.push(p)
    } else {
      tokenList.push(t)
    }
  }

  if (tokenList.length === 0) return { score, allTokensMatched: score > 0 }

  const nameTokens = [...extractTokens(customer.en), ...extractTokens(customer.bn)]
  const addressTokens = extractTokens(customer.address)

  let nameTokenMatched = directNameMatched
  let numberTokenMatched = directNumberMatched
  let matchedTokensCount = 0
  let tokenScoreSum = 0

  for (const qToken of tokenList) {
    const qTokenDigits = qToken.replace(/\D/g, '')
    const qIsDigits = /^\d+$/.test(qToken)
    let bestTokenScore = 0
    let tokenIsNumber = false
    let tokenIsName = false

    if (qIsDigits && qTokenDigits.length >= 2) {
      const isExplicitPrefix = qTokenDigits.startsWith('01') || qTokenDigits.startsWith('8801')
      const isSuffixMatch = qTokenDigits.length >= 3 && (phoneDigits.endsWith(qTokenDigits) || localPhoneDigits.endsWith(qTokenDigits))
      const isPrefixMatch = phoneDigits.startsWith(qTokenDigits) || localPhoneDigits.startsWith(qTokenDigits)

      if (phoneDigits === qTokenDigits || localPhoneDigits === qTokenDigits) {
        bestTokenScore = 100
        tokenIsNumber = true
      } else if (!isExplicitPrefix && isSuffixMatch) {
        bestTokenScore = 92 + Math.round(8 * (qTokenDigits.length / Math.max(phoneDigits.length, 1)))
        tokenIsNumber = true
      } else if (isPrefixMatch) {
        bestTokenScore = 85 + Math.round(15 * (qTokenDigits.length / Math.max(phoneDigits.length, 1)))
        tokenIsNumber = true
      } else if (isSuffixMatch) {
        bestTokenScore = 80 + Math.round(15 * (qTokenDigits.length / Math.max(phoneDigits.length, 1)))
        tokenIsNumber = true
      } else if (qTokenDigits.length >= 3 && (phoneDigits.includes(qTokenDigits) || localPhoneDigits.includes(qTokenDigits))) {
        bestTokenScore = 65
        tokenIsNumber = true
      } else if (customerIdDigits && customerIdDigits === qTokenDigits) {
        bestTokenScore = 75
        tokenIsNumber = true
      }
    } else if (customerId && (customerId === qToken || (qToken.length >= 2 && customerId.startsWith(qToken)))) {
      bestTokenScore = 80
      tokenIsNumber = true
    }

    for (const addressToken of addressTokens) {
      const s = scoreTokenMatch(qToken, addressToken)
      if (s > bestTokenScore) bestTokenScore = s
    }

    for (const nt of nameTokens) {
      const s = scoreTokenMatch(qToken, nt)
      if (s > bestTokenScore) {
        bestTokenScore = s
        tokenIsName = true
        tokenIsNumber = false
      }
    }

    if (bestTokenScore >= 40) {
      matchedTokensCount++
      tokenScoreSum += bestTokenScore
      if (tokenIsName) nameTokenMatched = true
      if (tokenIsNumber) numberTokenMatched = true
    }
  }

  const allMatched = matchedTokensCount === tokenList.length
  if (tokenList.length > 1) {
    if (allMatched) {
      score += tokenScoreSum * 5 + 1500
      if (nameTokenMatched && numberTokenMatched) {
        score += 2500
      }
    } else {
      if (!directNumberMatched && !directNameMatched && !directAddressMatched) {
        score = 0
      }
    }
  } else if (tokenList.length === 1 && matchedTokensCount === 1) {
    score += tokenScoreSum * 3
    if (nameTokenMatched && numberTokenMatched) {
      score += 2500
    }
  }

  return {
    score,
    allTokensMatched: allMatched
      || (directNumberMatched && isPureDigits)
      || (directNameMatched && tokenList.length === 1)
      || directAddressMatched,
  }
}

export function scoreCustomerMatch(
  customer: Customer,
  query: string,
  compactQuery?: string,
  queryTokens?: string[]
): number {
  return scoreCustomerMatchDetailed(customer, query, compactQuery, queryTokens).score
}

export function searchCustomers(
  customersList: Customer[] = [],
  query: string = ''
): Customer[] {
  const cleanQ = cleanSearchText(query).trim()
  if (!cleanQ) return customersList

  const compactQ = cleanQ.replace(/[\s\-_\.,/:;()·#+*&|~'"!?]+/g, '')
  const queryTokens = cleanQ.split(/[\s\-_\.,/:;()·#+*&|~'"!?]+/).filter(Boolean)

  const scored: { customer: Customer; score: number; allTokensMatched: boolean }[] = []
  for (const c of customersList) {
    const res = scoreCustomerMatchDetailed(c, cleanQ, compactQ, queryTokens)
    if (res.score > 0) {
      scored.push({ customer: c, score: res.score, allTokensMatched: res.allTokensMatched })
    }
  }

  const fullMatches = scored.filter(s => s.allTokensMatched)
  const listToUse = fullMatches.length > 0 ? fullMatches : scored

  listToUse.sort((a, b) => b.score - a.score)
  return listToUse.map(item => item.customer)
}

export function customerLedger(customerId: string, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []): AccountTransaction[] {
  const list: AccountTransaction[] = []

  // 1. Transactions from sales receipts where due > 0
  for (const r of receipts) {
    if (r.customer?.id === customerId && r.due > 0) {
      list.push({
        id: `tx-sale-${r.id}`,
        customerId,
        type: 'sale_due',
        amount: r.due,
        createdAt: r.createdAt,
        receiptId: r.id,
        note: `Receipt #${String(r.number).padStart(4, '0')}`,
      })
    }
  }

  // 2. Direct ledger transactions (payments and credit adjustments)
  for (const tx of transactions) {
    if (tx.customerId === customerId) {
      list.push(tx)
    }
  }
  for (const receipt of receipts) {
    if (receipt.customer?.id === customerId && receipt.creditApplied) list.push({
      id: `tx-credit-use-${receipt.id}`, customerId, type: 'credit_adjust', amount: receipt.creditApplied,
      createdAt: receipt.createdAt, receiptId: receipt.id, note: `Store credit used · #${receipt.number}`,
    })
  }
  for (const entry of returns) {
    if (entry.customerId !== customerId) continue
    if (!entry.settlement) {
      if (entry.method === 'due') list.push({
        id: `tx-return-due-${entry.id}`, customerId, type: 'credit_adjust', amount: -entry.refunded,
        createdAt: entry.createdAt, receiptId: entry.receiptId, note: `Return reduced due · #${entry.receiptNumber}`,
      })
      continue
    }
    const { dueReduced, creditIssued, newDue } = entry.settlement
    for (const [suffix, amount, note] of [
      ['due', -dueReduced, 'Return reduced due'], ['credit', -creditIssued, 'Store credit issued'],
      ['exchange', newDue, 'Exchange due'],
    ] as const) if (amount) list.push({
      id: `tx-return-${suffix}-${entry.id}`, customerId, type: 'credit_adjust', amount,
      createdAt: entry.createdAt, receiptId: entry.receiptId, note: `${note} · #${entry.receiptNumber}`,
    })
  }

  // Sort chronological
  return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export type CustomerHistoryEntry = AccountTransaction | (Omit<AccountTransaction, 'type'> & {
  type: 'sale'
  paid: number
  due: number
})

// Purchase history includes every bill; the account ledger only tracks balance changes.
export function customerHistory(customerId: string, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []): CustomerHistoryEntry[] {
  const history: CustomerHistoryEntry[] = customerLedger(customerId, receipts, transactions, returns)
    .filter(tx => tx.type !== 'sale_due')
  for (const receipt of receipts) {
    if (receipt.customer?.id !== customerId) continue
    history.push({
      id: `tx-sale-${receipt.id}`, customerId, type: 'sale', amount: receipt.total,
      paid: receipt.paid + (receipt.creditApplied ?? 0), due: receipt.due,
      createdAt: receipt.createdAt, receiptId: receipt.id,
      note: `Receipt #${String(receipt.number).padStart(4, '0')}`,
    })
  }
  return history.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export type CustomerAccountAllocation = {
  totalDue: number
  storeCredit: number
  totalPaid: number
  receiptDues: Map<string, number>
}

export function allocateCustomerAccount(customer: Customer, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []): CustomerAccountAllocation {
  type Event = { id: string; createdAt: string; order: number; amount: number; credit: boolean; receiptId?: string; targeted?: boolean; targetOnly?: boolean }
  type Debt = { amount: number; receiptId?: string }
  const events: Event[] = []
  const receiptDues = new Map<string, number>()
  for (const receipt of receipts) {
    if (receipt.customer?.id !== customer.id) continue
    receiptDues.set(receipt.id, 0)
    // Credit use is an account posting distinct from the unpaid part of this bill.
    if (receipt.creditApplied) events.push({ id: `credit-use-${receipt.id}`, createdAt: receipt.createdAt, order: 0, amount: receipt.creditApplied, credit: false })
    if (receipt.due > 0) events.push({ id: `receipt-${receipt.id}`, createdAt: receipt.createdAt, order: 1, amount: receipt.due, credit: false, receiptId: receipt.id })
  }
  let totalPaid = 0
  for (const tx of transactions) {
    if (tx.customerId !== customer.id) continue
    const credit = tx.type === 'payment' ? tx.amount >= 0 : tx.amount < 0
    events.push({ id: `transaction-${tx.id}`, createdAt: tx.createdAt, order: credit ? 2 : 1,
      amount: Math.abs(tx.amount), credit, ...(credit && tx.receiptId ? { receiptId: tx.receiptId, targeted: true } : {}) })
    if (tx.type === 'payment') totalPaid += tx.amount
  }
  for (const entry of returns) {
    if (entry.customerId !== customer.id) continue
    const dueReduced = entry.settlement?.dueReduced ?? (entry.method === 'due' ? entry.refunded : 0)
    if (dueReduced) events.push({ id: `return-due-${entry.id}`, createdAt: entry.createdAt, order: 3, amount: dueReduced, credit: true, receiptId: entry.receiptId, targeted: true, targetOnly: true })
    if (entry.settlement?.creditIssued) events.push({ id: `return-credit-${entry.id}`, createdAt: entry.createdAt, order: 4, amount: entry.settlement.creditIssued, credit: true })
    if (entry.settlement?.newDue) events.push({ id: `return-exchange-${entry.id}`, createdAt: entry.createdAt, order: 5, amount: entry.settlement.newDue, credit: false })
  }
  events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.order - b.order || a.id.localeCompare(b.id))
  const debts: Debt[] = []
  let storeCredit = Math.max(0, -(customer.openingBalance ?? 0))
  if ((customer.openingBalance ?? 0) > 0) debts.push({ amount: customer.openingBalance! })
  const applyCredit = (amount: number, receiptId?: string, targetOnly = false) => {
    const pay = (debt: Debt) => {
      const paid = Math.min(amount, debt.amount)
      debt.amount -= paid
      amount -= paid
    }
    if (receiptId) for (const debt of debts) if (debt.receiptId === receiptId && amount > 0) pay(debt)
    if (targetOnly) return
    for (const debt of debts) if (amount > 0) pay(debt)
    storeCredit += amount
  }
  for (const event of events) {
    if (event.credit) applyCredit(event.amount, event.targeted ? event.receiptId : undefined, event.targetOnly)
    else {
      const used = Math.min(storeCredit, event.amount)
      storeCredit -= used
      if (event.amount > used) debts.push({ amount: event.amount - used, ...(event.receiptId ? { receiptId: event.receiptId } : {}) })
    }
  }
  let totalDue = 0
  for (const debt of debts) {
    totalDue += debt.amount
    if (debt.receiptId) receiptDues.set(debt.receiptId, (receiptDues.get(debt.receiptId) ?? 0) + debt.amount)
  }
  return { totalDue, storeCredit, totalPaid, receiptDues }
}

function customerAccountingIssue(customer: Customer | string, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []): string | undefined {
  const id = typeof customer === 'string' ? customer : customer.id
  if (typeof customer !== 'string' && customer.accountingIssue) return customer.accountingIssue
  if (typeof customer !== 'string' && customer.openingBalance !== undefined && !Number.isSafeInteger(customer.openingBalance)) return 'The opening balance needs accounting review.'
  const bills = receipts.filter(receipt => receipt.customer?.id === id)
  for (const receipt of bills) if (receipt.accountingIssue) return receipt.accountingIssue
  const billIds = new Set(bills.map(receipt => receipt.id))
  for (const entry of returns) if ((entry.customerId === id || billIds.has(entry.receiptId)) && entry.accountingIssue) return entry.accountingIssue
  for (const tx of transactions) {
    if (tx.customerId !== id) continue
    if (tx.accountingIssue) return tx.accountingIssue
    if (!Number.isSafeInteger(tx.amount) || Math.abs(tx.amount) > 100000000 || !Number.isFinite(Date.parse(tx.createdAt))
      || (tx.type !== 'credit_adjust' && tx.amount <= 0)
      || (tx.type === 'sale_due' && tx.receiptId && billIds.has(tx.receiptId))) return 'A historical account transaction needs accounting review.'
  }
  return undefined
}

export function customerAccountingReady(customer: Customer | string, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []): boolean {
  return !customerAccountingIssue(customer, receipts, transactions, returns)
}

export function customerBalance(customer: Customer, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []) {
  const { receiptDues: _receiptDues, ...balance } = allocateCustomerAccount(customer, receipts, transactions, returns)
  const accountingIssue = customerAccountingIssue(customer, receipts, transactions, returns)
  return { ...balance, ...(accountingIssue ? { accountingIssue } : {}) }
}

export function receiptOutstandingDue(
  receipt: Receipt,
  receipts: Receipt[],
  transactions: AccountTransaction[] = [],
  returns: Return[] = []
): number {
  if (receipt.due <= 0) return 0
  if (!receipt.customer) return receipt.due

  return allocateCustomerAccount(receipt.customer, receipts, transactions, returns).receiptDues.get(receipt.id) ?? 0
}

export const isService = (product: Product) => product?.kind === 'service'
export const hasKnownCost = (product: Product) => !isService(product) || (product.kind === 'service' && product.cost !== undefined)
export const productCost = (product: Product) => {
  if (!product) return 0
  if (isService(product)) return hasKnownCost(product) ? product.cost! : 0
  return product.cost ?? Math.round((product.price || 0) * 0.85)
}
export function proportionalAmount(total: number, quantity: number, wholeQuantity: number): number {
  if (![total, quantity, wholeQuantity].every(Number.isSafeInteger) || total < 0 || quantity < 0 || wholeQuantity <= 0) throw new Error('amount')
  const numerator = BigInt(total) * BigInt(quantity)
  const denominator = BigInt(wholeQuantity)
  const rounded = (numerator * 2n + denominator) / (denominator * 2n)
  const amount = Number(rounded)
  if (!Number.isSafeInteger(amount)) throw new Error('amount')
  return amount
}
export function inventoryValuationReady(product: Product): boolean {
  return isService(product) || (Number.isSafeInteger(product.inventoryValue) && product.inventoryValue! >= 0
    && (product.valuationStatus === 'verified' || product.valuationStatus === 'provided'))
}
export function costStatusOf(product: Product): CostStatus {
  if (isService(product)) return product.cost === undefined ? 'unassigned' : 'recorded'
  if (product.valuationStatus === 'unverified') return 'unverified'
  return product.cost === undefined ? 'estimated' : 'recorded'
}
export function inventoryCostAmount(product: Product, currentStock: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('quantity')
  if (isService(product)) return lineCost(productCost(product), quantity)
  if (product.inventoryValue !== undefined) {
    if (!Number.isSafeInteger(currentStock) || currentStock <= 0 || quantity > currentStock) throw new Error('stock')
    return proportionalAmount(product.inventoryValue, quantity, currentStock)
  }
  // Read-only legacy snapshots remain displayable; mutations require proven valuation in the backend.
  return lineCost(productCost(product), quantity)
}
export function applyInventoryMovement(product: Product, currentStock: number, quantityDelta: number, valueDelta: number): Product {
  if (isService(product)) throw new Error('product')
  if (![currentStock, quantityDelta, valueDelta].every(Number.isSafeInteger) || currentStock < 0) throw new Error('quantity')
  if (!inventoryValuationReady(product)) throw new Error('valuation')
  const quantity = currentStock + quantityDelta
  const inventoryValue = product.inventoryValue! + valueDelta
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('stock')
  if (!Number.isSafeInteger(inventoryValue) || inventoryValue < 0 || (quantity === 0 && inventoryValue !== 0)) throw new Error('valuation')
  // stock is the historical quantity baseline, and is changed by purchase/void callers only.
  return { ...product, inventoryValue, ...(quantity > 0 ? { cost: proportionalAmount(inventoryValue, 1000, quantity) } : {}) }
}
export const unitMargin = (product: Product) => (product?.price || 0) - productCost(product)
export const unitMarginPercent = (product: Product) => (product?.price || 0) > 0 ? (unitMargin(product) / product.price) * 100 : 0
export const lineTotal = (price: number, quantity: number) => proportionalAmount(price, quantity, 1000)
export const lineCost = (cost: number, quantity: number) => proportionalAmount(cost, quantity, 1000)
export const receiptLineCost = (line: { product: Product; quantity: number; costAmount?: number }) =>
  line.costAmount ?? lineCost(productCost(line.product), line.quantity)
export const receiptLineCostStatus = (line: { product: Product; costStatus?: CostStatus }): CostStatus =>
  line.costStatus ?? costStatusOf(line.product)
export const lineProfit = (product: Product, quantity: number) => {
  if (!product) return 0
  return lineTotal(product.price || 0, quantity) - lineCost(productCost(product), quantity)
}
export function receiptProfit(receipt: Receipt): number {
  const marginSum = receipt.lines.reduce((sum, line) => {
    return sum + (line.gross ?? lineTotal(line.product.price || 0, line.quantity)) - receiptLineCost(line)
  }, 0)
  return marginSum - (receipt.discount || 0)
}

// Prices belong to the sale; catalog prices remain a fallback for older drafts.
export function saleUnitPrice(line: Line, product: Pick<Product, 'price'>): number {
  if (line.legacyAmount) throw new Error('legacyAmount')
  const price = line.unitPrice ?? product.price
  if (!Number.isSafeInteger(price) || price < 1 || price > 100000000) throw new Error('amount')
  return price
}
// Validate each item's net revenue so another item's margin cannot hide a loss.
export function assertSaleAboveCost(lines: { gross: number; costAmount: number }[], discount = 0): void {
  const discounts = allocateDiscount(lines.map(line => line.gross), discount)
  if (lines.some((line, index) => line.gross - discounts[index] < line.costAmount)) throw new Error('belowCost')
}

export function addSaleLine(lines: Line[], incoming: Line): Line[] {
  if (lines.some(line => line.productId === incoming.productId && line.legacyAmount)) throw new Error('legacyAmount')
  const existing = lines.find(line => line.productId === incoming.productId)
  return existing ? lines.map(line => line.productId === incoming.productId
    ? { ...line, ...incoming, quantity: line.quantity + incoming.quantity } : line) : [...lines, incoming]
}

export const subtotal = (lines: Line[], catalog: Product[] = []) => lines.reduce((sum, line) => {
  const p = findProductIn(line.productId, catalog)
  return sum + lineTotal(line.unitPrice ?? p.price, line.quantity)
}, 0)
export const money = (taka: number, _fixed = false) => Math.round(taka).toLocaleString('en-BD')
export const quantityText = (scaled: number) => (scaled / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })
export const isMoneyUnit = (unit: ProductUnit) => unit === 'BDT'
export const normalizeProductUnit = <T extends ProductUnit>(unit: T): CanonicalProductUnit<T> => (unit === 'Unit' || unit === 'pc' ? 'pc' : unit) as CanonicalProductUnit<T>
export const isDiscreteUnit = (unit: ProductUnit) => unit === 'Unit' || unit === 'pc'
export const sameProductUnit = (a: ProductUnit, b: ProductUnit) => normalizeProductUnit(a) === normalizeProductUnit(b)
export const unitText = (unit: ProductUnit) => isMoneyUnit(unit) ? '৳' : normalizeProductUnit(unit)
export const quantityWithUnit = (scaled: number, unit: ProductUnit) => isMoneyUnit(unit)
  ? `৳ ${money(Math.round(scaled / 1000))}`
  : `${quantityText(scaled)} ${normalizeProductUnit(unit)}`
export function parseQuantity(value: string, unit: Product['unit']): number | null {
  const pattern = isMoneyUnit(unit) ? /^\d+(\.0{1,2})?$/ : /^\d+(\.\d{1,3})?$/
  if (!pattern.test(value.trim())) return null
  const scaled = Math.round(Number(value) * 1000)
  const maximum = isMoneyUnit(unit) ? 1000000000 : 10000000
  if (scaled <= 0 || scaled > maximum || (isDiscreteUnit(unit) && scaled % 1000 !== 0)) return null
  return scaled
}
export function parseMoney(value: string): number | null {
  if (!/^\d+(?:\.0{1,2})?$/.test(value.trim())) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount <= 100000000 ? amount : null
}
// Zero stores an unset catalog reference price; checkout still requires a positive sale price.
export function parseReferencePrice(value: string, previous = 0): number | null {
  if (!value.trim()) return previous
  const price = parseMoney(value)
  return price !== null && price > 0 ? price : null
}

export function stockFor(product: Product, receipts: Receipt[], adjustments: StockAdjustment[] = [], returns: Return[] = []) {
  if (isService(product)) return 0
  const sold = receipts.reduce((sum, receipt) => sum + receipt.lines.filter(l => l.productId === product.id).reduce((quantity, line) => {
    // Receipts snapshot their original product; preserve historical amount-based units.
    if (isMoneyUnit(product.unit) && !isMoneyUnit(line.product?.unit ?? 'pc')) {
      return quantity + lineTotal(line.product?.price ?? 0, line.quantity) * 1000
    }
    return quantity + line.quantity
  }, 0), 0)
  const adjusted = adjustments.reduce((sum, item) => item.productId === product.id ? sum + item.quantity : sum, 0)
  const returned = returns.reduce((sum, item) => sum + item.lines.filter(line => line.productId === product.id && (line.condition ? line.condition === 'sellable' : item.restock)).reduce((quantity, line) => quantity + line.quantity, 0), 0)
  const exchanged = returns.reduce((sum, item) => sum + (item.replacementLines ?? []).filter(line => line.productId === product.id).reduce((quantity, line) => quantity + line.quantity, 0), 0)
  return product.stock + adjusted + returned - sold - exchanged
}
export function nextReceiptNumber(receipts: Receipt[], terminalId?: number | null): number {
  if (!terminalId || terminalId <= 0) {
    return receipts.reduce((max, r) => Math.max(max, r.number || 0), 0) + 1
  }
  const base = terminalId * 100000
  const terminalReceipts = receipts.filter(r => r.number >= base && r.number < base + 100000)
  if (terminalReceipts.length === 0) return base + 1
  return terminalReceipts.reduce((max, r) => Math.max(max, r.number || 0), base) + 1
}

// Use the current catalog and exact stock value for both draft edits and checkout.
// This deliberately has no payment/customer requirements: reject a losing bill
// when it is built, rather than waiting for an invoice to be saved.
export function validateSalePricing(state: ShopState): ReceiptLine[] {
  const catalog = allProducts(state.customProducts)
  const available = new Map<string, { quantity: number; value?: number }>()
  const lines: ReceiptLine[] = state.lines.map(line => {
    const product = findProductIn(line.productId, catalog)
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || (isDiscreteUnit(product.unit) && line.quantity % 1000 !== 0)) throw new Error('quantity')
    const balance = available.get(product.id) ?? { quantity: stockFor(product, state.receipts, state.adjustments, state.returns), value: product.inventoryValue }
    const costAmount = inventoryCostAmount({ ...product, inventoryValue: balance.value }, balance.quantity, line.quantity)
    const costStatus: CostStatus = isService(product) ? costStatusOf(product)
      : inventoryValuationReady(product) ? 'recorded' : product.cost === undefined ? 'estimated' : 'unverified'
    if (!isService(product)) available.set(product.id, { quantity: balance.quantity - line.quantity,
      ...(balance.value !== undefined ? { value: balance.value - costAmount } : {}) })
    const price = saleUnitPrice(line, product)
    if (price < productCost(product)) throw new Error('belowCost')
    return { ...line, product: { ...product, price }, gross: lineTotal(price, line.quantity), costAmount, costStatus }
  })
  assertSaleAboveCost(lines.map(line => ({ gross: line.gross!, costAmount: line.costAmount! })), state.discount)
  return lines
}

export function makeReceipt(state: ShopState, tendered: number, method: Receipt['method'], terminalId?: number | null, creditApplied = 0): Receipt {
  const catalog = allProducts(state.customProducts)
  const custCatalog = allCustomers(state.customCustomers)
  const sub = subtotal(state.lines, catalog)
  const total = Math.max(0, sub - state.discount)
  const customer = custCatalog.find(c => c.id === state.customerId) ?? null
  if (!state.lines.length || total <= 0) throw new Error('empty')
  if (!Number.isSafeInteger(state.discount) || state.discount < 0 || state.discount > sub || total > 100000000) throw new Error('amount')
  if (!Number.isSafeInteger(tendered) || tendered < 0 || tendered > 100000000) throw new Error('amount')
  if (!Number.isSafeInteger(creditApplied) || creditApplied < 0 || creditApplied > total) throw new Error('amount')
  if (creditApplied && (!customer || creditApplied > customerBalance(customer, state.receipts, state.transactions, state.returns).storeCredit)) throw new Error('credit')
  const payable = total - creditApplied
  if (tendered < payable && !customer) throw new Error('customer')
  if (method !== 'cash' && tendered > payable) throw new Error('overpayment')
  const termId = terminalId ?? state.terminalId
  const lines = validateSalePricing(state)
  return {
    id: crypto.randomUUID(), number: nextReceiptNumber(state.receipts, termId), createdAt: new Date().toISOString(),
    lines, currencyVersion: 2,
    customer, subtotal: sub, discount: state.discount, total, paid: Math.min(payable, tendered), tendered,
    change: Math.max(0, tendered - payable), due: Math.max(0, payable - tendered), method,
    ...(creditApplied ? { creditApplied } : {}),
  }
}

export function makePurchase(lines: PurchaseLine[], meta: { supplier?: string; supplierId?: string; paid?: number; method?: PaymentMethod; invoiceNumber?: string; createdAt?: string; note?: string } = {}): Purchase {
  if (!lines.length) throw new Error('empty')
  const supplier = meta.supplier?.trim()
  const note = meta.note?.trim()
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    lines: lines.map(line => ({ ...line })),
    total: lines.reduce((sum, line) => sum + line.total, 0), currencyVersion: 2,
    ...(supplier ? { supplier } : {}),
    ...(meta.supplierId ? { supplierId: meta.supplierId } : {}),
    ...(meta.paid !== undefined ? { paid: meta.paid } : {}),
    ...(meta.method ? { method: meta.method } : {}),
    ...(meta.invoiceNumber?.trim() ? { invoiceNumber: meta.invoiceNumber.trim() } : {}),
    ...(meta.createdAt ? { createdAt: meta.createdAt } : {}),
    ...(note ? { note } : {}),
  }
}

export type StockPurchaseInput = { productId: string; quantity: number; total: number; price: number; supplier: string; supplierId?: string; paid?: number; method?: PaymentMethod }

// Use remaining stock for the weighted cost, but add purchases to the original
// stock baseline: stockFor subtracts historical sales from that baseline.
export function makeStockPurchase(product: Product, currentStock: number, input: StockPurchaseInput) {
  if (isService(product) || product.id !== input.productId) throw new Error('product')
  if (parseQuantity(String(input.quantity / 1000), product.unit) !== input.quantity) throw new Error('quantity')
  if (parseMoney(String(input.total)) !== input.total || input.total <= 0
    || parseMoney(String(input.price)) !== input.price || input.price <= 0) throw new Error('amount')
  if (!Number.isSafeInteger(currentStock) || currentStock < 0) throw new Error('stock')
  if (currentStock > 0 && !inventoryValuationReady(product)) throw new Error('valuation')
  if (currentStock === 0 && (product.inventoryValue ?? 0) !== 0) throw new Error('valuation')
  const unitCost = proportionalAmount(input.total, 1000, input.quantity)
  const before = currentStock === 0 && !inventoryValuationReady(product)
    ? { ...product, inventoryValue: 0, valuationStatus: 'verified' as const } : product
  const updated = applyInventoryMovement(before, currentStock, input.quantity, input.total)
  return {
    product: { ...updated, price: input.price, stock: product.stock + input.quantity,
      purchased: (product.purchased ?? product.stock) + input.quantity },
    purchase: makePurchase([{ productId: product.id, quantity: input.quantity, unitCost, total: input.total }], { supplier: input.supplier, supplierId: input.supplierId, paid: input.paid, method: input.method }),
  }
}

export function makeExpense(input: { category: ExpenseCategory; amount: number; method: PaymentMethod; note?: string }): Expense {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('amount')
  const note = input.note?.trim()
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    category: input.category, amount: input.amount, method: input.method,
    ...(note ? { note } : {}),
  }
}

export function makeStockAdjustment(input: { productId: string; quantity: number; reason: AdjustmentReason; counted?: number; costAmount?: number; note?: string }): StockAdjustment {
  if (!input.productId) throw new Error('product')
  if (!Number.isSafeInteger(input.quantity) || input.quantity === 0) throw new Error('quantity')
  if (input.counted !== undefined && (!Number.isSafeInteger(input.counted) || input.counted < 0)) throw new Error('quantity')
  if (input.costAmount !== undefined && (!Number.isSafeInteger(input.costAmount) || (input.costAmount !== 0 && Math.sign(input.costAmount) !== Math.sign(input.quantity)))) throw new Error('amount')
  const note = input.note?.trim()
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    productId: input.productId, quantity: input.quantity, reason: input.reason,
    ...(input.counted !== undefined ? { counted: input.counted } : {}),
    ...(input.costAmount !== undefined ? { costAmount: input.costAmount } : {}),
    ...(note ? { note } : {}),
  }
}

export function purchaseStockDelta(purchase: Purchase, receivings: StockReceiving[] = []): Map<string, number> {
  const delta = new Map<string, number>()
  for (const line of purchase.mode === 'invoice' ? receivings.filter(r => r.purchaseId === purchase.id).flatMap(r => r.lines) : purchase.lines) delta.set(line.productId, (delta.get(line.productId) ?? 0) + line.quantity)
  return delta
}

export function allocateDiscount(gross: number[], discount: number): number[] {
  // Largest-remainder allocation preserves every single Taka of a bill-level discount.
  const subtotal = gross.reduce((sum, value) => sum + value, 0)
  if (![subtotal, discount, ...gross].every(Number.isSafeInteger) || discount < 0 || gross.some(value => value < 0)) throw new Error('amount')
  if (!subtotal) return gross.map(() => 0)
  const numerator = gross.map(value => BigInt(discount) * BigInt(value))
  const denominator = BigInt(subtotal)
  const discounts = numerator.map(value => Number(value / denominator))
  const remaining = discount - discounts.reduce((sum, value) => sum + value, 0)
  const ranked = numerator.map((share, index) => ({ index, remainder: share % denominator }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
  for (let index = 0; index < remaining && index < ranked.length; index++) discounts[ranked[index].index]++
  return discounts
}

export function makeReturn(
  receipt: Receipt,
  requests: { productId: string; quantity: number }[],
  meta: { method: ReturnMethod; restock: boolean; refunded?: number; note?: string; priorReturns?: Return[]; conditions?: Record<string, ReturnLine['condition']> },
): Return {
  const grouped = new Map<string, number>()
  for (const request of requests) {
    if (!Number.isSafeInteger(request.quantity) || request.quantity < 0) throw new Error('quantity')
    if (request.quantity > 0) grouped.set(request.productId, (grouped.get(request.productId) ?? 0) + request.quantity)
  }
  const wanted = [...grouped].map(([productId, quantity]) => ({ productId, quantity }))
  if (!wanted.length) throw new Error('empty')
  const priorById = new Map<string, { quantity: number; amount: number; cost: number }>()
  for (const prior of meta.priorReturns ?? []) {
    if (prior.receiptId !== receipt.id) continue
    for (const line of prior.lines) {
      const allocated = priorById.get(line.productId) ?? { quantity: 0, amount: 0, cost: 0 }
      priorById.set(line.productId, { quantity: allocated.quantity + line.quantity, amount: allocated.amount + line.amount, cost: allocated.cost + line.cost })
    }
  }
  const gross = receipt.lines.map(line => line.gross ?? lineTotal(line.product.price, line.quantity))
  const discounts = allocateDiscount(gross, receipt.discount)
  const lines: ReturnLine[] = []
  for (const request of wanted) {
    const indexes = receipt.lines.flatMap((line, index) => line.productId === request.productId ? [index] : [])
    if (!indexes.length) throw new Error('receipt')
    const source = receipt.lines[indexes[0]]
    if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0 || (isDiscreteUnit(source.product.unit) && request.quantity % 1000 !== 0)) throw new Error('quantity')
    const allocated = priorById.get(request.productId) ?? { quantity: 0, amount: 0, cost: 0 }
    const remaining = indexes.reduce((sum, index) => sum + receipt.lines[index].quantity, 0) - allocated.quantity
    if (request.quantity > remaining) throw new Error('quantity')
    const revenue = Math.max(0, indexes.reduce((sum, index) => sum + gross[index] - discounts[index], 0) - allocated.amount)
    const cost = Math.max(0, indexes.reduce((sum, index) => sum + receiptLineCost(receipt.lines[index]), 0) - allocated.cost)
    lines.push({
      productId: request.productId,
      quantity: request.quantity,
      amount: proportionalAmount(revenue, request.quantity, remaining),
      cost: proportionalAmount(cost, request.quantity, remaining),
      costStatus: receiptLineCostStatus(source),
      ...(isService(source.product) ? { condition: 'damaged' as const } : meta.conditions?.[request.productId] ? { condition: meta.conditions[request.productId] } : {}),
    })
  }
  const maximum = lines.reduce((sum, line) => sum + line.amount, 0)
  const refunded = meta.refunded ?? maximum
  if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > maximum) throw new Error('amount')
  const note = meta.note?.trim()
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    receiptId: receipt.id, receiptNumber: receipt.number,
    ...(receipt.customer ? { customerId: receipt.customer.id } : {}),
    lines, refunded, method: meta.method, restock: meta.restock, currencyVersion: 2,
    ...(note ? { note } : {}),
  }
}

export const RETURN_WINDOW_DAYS = 30

// Used by both the form preview and the saved return. Original debt is settled
// before replacement goods; only the remaining value can be paid out or credited.
export function calculateReturnSettlement(
  receipt: Receipt,
  returnValue: number,
  replacementTotal: number,
  meta: { priorReturns: Return[]; customerDue: number; receiptDue?: number; received?: number; method: PaymentMethod; issueCredit: boolean },
): ReturnSettlement {
  if (![returnValue, replacementTotal, meta.customerDue].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('amount')
  if (meta.receiptDue !== undefined && (!Number.isSafeInteger(meta.receiptDue) || meta.receiptDue < 0)) throw new Error('amount')
  const originalDue = meta.receiptDue ?? Math.max(0, receipt.due - meta.priorReturns.filter(prior => prior.receiptId === receipt.id).reduce((sum, prior) => sum + (prior.settlement?.dueReduced ?? (prior.method === 'due' ? prior.refunded : 0)), 0))
  const dueReduced = receipt.customer ? Math.min(returnValue, originalDue, meta.customerDue) : 0
  const remaining = returnValue - dueReduced
  const exchangeCredit = Math.min(remaining, replacementTotal)
  const residual = remaining - exchangeCredit
  const creditIssued = meta.issueCredit ? residual : 0
  if (creditIssued && !receipt.customer) throw new Error('customer')
  const payout = residual - creditIssued
  const payable = replacementTotal - exchangeCredit
  // The normal exchange collects the full difference. Keeping due is explicit.
  const received = meta.received ?? payable
  if (!Number.isSafeInteger(received) || received < 0 || received > payable) throw new Error('amount')
  const newDue = payable - received
  if (newDue && !receipt.customer) throw new Error('customer')
  return { dueReduced, exchangeCredit, payout, creditIssued, received, newDue, method: meta.method }
}

export function makeReturnExchange(
  receipt: Receipt,
  requests: { productId: string; quantity: number; condition: 'sellable' | 'damaged' }[],
  replacements: Line[],
  meta: { catalog: Product[]; priorReturns: Return[]; customerDue: number; receiptDue?: number; refunded?: number; received?: number; method: PaymentMethod; issueCredit: boolean; reason: string; operator: string; now?: Date; receipts?: Receipt[]; adjustments?: StockAdjustment[] },
): Return {
  const now = meta.now ?? new Date()
  const age = now.getTime() - Date.parse(receipt.createdAt)
  if (age < -300000 || age > RETURN_WINDOW_DAYS * 86400000) throw new Error('expired')
  if (!meta.reason.trim() || !meta.operator.trim()) throw new Error('details')
  const conditions = Object.fromEntries(requests.map(line => [line.productId, line.condition]))
  const entry = makeReturn(receipt, requests, { method: meta.method, restock: false, refunded: meta.refunded, priorReturns: meta.priorReturns, conditions })
  const available = new Map<string, { quantity: number; value?: number }>()
  const replacementLines: ExchangeLine[] = replacements.map(line => {
    const product = findProductIn(line.productId, meta.catalog)
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || (isDiscreteUnit(product.unit) && line.quantity % 1000 !== 0)) throw new Error('quantity')
    const returned = entry.lines.filter(part => part.productId === product.id && part.condition === 'sellable')
    const balance = available.get(product.id) ?? {
      quantity: stockFor(product, meta.receipts ?? [receipt], meta.adjustments, meta.priorReturns) + returned.reduce((sum, part) => sum + part.quantity, 0),
      ...(product.inventoryValue !== undefined ? { value: product.inventoryValue + returned.reduce((sum, part) => sum + part.cost, 0) } : {}),
    }
    const cost = inventoryCostAmount({ ...product, inventoryValue: balance.value }, balance.quantity, line.quantity)
    if (!isService(product)) available.set(product.id, { quantity: balance.quantity - line.quantity,
      ...(balance.value !== undefined ? { value: balance.value - cost } : {}) })
    const price = saleUnitPrice(line, product)
    if (price < productCost(product)) throw new Error('belowCost')
    return { ...line, product: { ...product, price }, amount: lineTotal(price, line.quantity), cost,
      costStatus: isService(product) ? costStatusOf(product) : inventoryValuationReady(product) ? 'recorded' : 'unverified' }
  })
  assertSaleAboveCost(replacementLines.map(line => ({ gross: line.amount, costAmount: line.cost })))
  const replacementTotal = replacementLines.reduce((sum, line) => sum + line.amount, 0)
  const settlement = calculateReturnSettlement(receipt, entry.refunded, replacementTotal, meta)
  return {
    ...entry, createdAt: now.toISOString(), reason: meta.reason.trim(), operator: meta.operator.trim(),
    replacementLines,
    settlement,
  }
}

export type ReportWindow = 'today' | '3days' | '7days' | 'month'
  | { mode: 'day'; date: string }
  | { mode: 'month'; month: string }
  | { mode: 'range'; from: string; to: string }

const REPORT_DAY = 24 * 60 * 60 * 1000
const DHAKA_OFFSET = 6 * 60 * 60 * 1000
const dhakaDateStart = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) - DHAKA_OFFSET
}

export function reportWindowMode(window: ReportWindow): 'day' | 'month' | 'range' {
  if (typeof window === 'object') return window.mode
  return window === 'month' ? 'month' : window === 'today' ? 'day' : 'range'
}

export function dhakaDateKey(date: Date = new Date()) {
  return new Date(date.getTime() + DHAKA_OFFSET).toISOString().slice(0, 10)
}

export function moveDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function moveMonth(value: string, months: number) {
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7)
}

export function initialReportWindow(referenceDate: Date = new Date()): ReportWindow {
  return { mode: 'day', date: dhakaDateKey(referenceDate) }
}

export function reportRange(window: ReportWindow, referenceDate: Date = new Date()) {
  // Calendar boundaries belong to the shop in Dhaka, regardless of the device timezone.
  const local = new Date(referenceDate.getTime() + DHAKA_OFFSET)
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - DHAKA_OFFSET
  if (typeof window === 'object') {
    if (window.mode === 'day') {
      const start = window.date ? dhakaDateStart(window.date) : today
      return { start, end: start + REPORT_DAY, days: 1 }
    }
    if (window.mode === 'month') {
      const [year, month] = (window.month || dhakaDateKey(referenceDate).slice(0, 7)).split('-').map(Number)
      const start = Date.UTC(year, month - 1, 1) - DHAKA_OFFSET
      const end = Date.UTC(year, month, 1) - DHAKA_OFFSET
      return { start, end, days: (end - start) / REPORT_DAY }
    }
    const from = window.from || window.to || dhakaDateKey(referenceDate)
    const to = window.to || window.from || from
    const start = dhakaDateStart(from), end = dhakaDateStart(to) + REPORT_DAY
    const first = Math.min(start, end - REPORT_DAY), last = Math.max(start, end - REPORT_DAY)
    return { start: first, end: last + REPORT_DAY, days: (last - first) / REPORT_DAY + 1 }
  }
  const days = window === 'month' ? local.getUTCDate() : window === '7days' ? 7 : window === '3days' ? 3 : 1
  return { start: today - (days - 1) * REPORT_DAY, end: today + REPORT_DAY, days }
}

export function filterByWindow<T extends { createdAt: string }>(items: T[], window: ReportWindow, referenceDate: Date = new Date()): T[] {
  const { start, end } = reportRange(window, referenceDate)
  return items.filter(item => {
    const time = new Date(item.createdAt).getTime()
    return time >= start && time < end
  })
}

export function filterReceiptsByWindow(receipts: Receipt[], window: ReportWindow, referenceDate: Date = new Date()): Receipt[] {
  return filterByWindow(receipts, window, referenceDate)
}


export function purchaseAccount(purchase: Purchase, payments: SupplierPayment[] = [], settlements: PurchaseSettlement[] = []) {
  const review = settlements.find(s => s.purchaseId === purchase.id)
  const initialPaid = purchase.paid ?? review?.paid
  const known = initialPaid !== undefined && !purchase.accountingIssue
  const supplierId = purchase.supplierId ?? review?.supplierId
  const entries = payments.filter(p => p.purchaseId === purchase.id)
  const paid = (initialPaid ?? 0) + entries.reduce((sum, p) => sum + (p.type === 'refund' ? -p.amount : p.amount), 0)
  return { known, supplierId, initialPaid: initialPaid ?? 0, paid, due: known && !purchase.voidedAt ? purchase.total - paid : 0, method: purchase.method ?? review?.method }
}

export function supplierAccount(supplierId: string, purchases: Purchase[], payments: SupplierPayment[] = [], settlements: PurchaseSettlement[] = []) {
  const bills = purchases.filter(p => purchaseAccount(p, payments, settlements).supplierId === supplierId)
  const active = bills.filter(p => !p.voidedAt)
  return { purchases: bills, total: active.reduce((s, p) => s + p.total, 0), due: active.reduce((s, p) => s + purchaseAccount(p, payments, settlements).due, 0),
    paid: bills.reduce((s, p) => s + purchaseAccount(p, payments, settlements).paid, 0), unknown: bills.filter(p => !purchaseAccount(p, payments, settlements).known).length }
}

export type SupplierHistoryEntry = {
  id: string
  type: 'invoice' | 'initialPayment' | 'payment' | 'refund' | 'receiving' | 'review' | 'void'
  createdAt: string
  amount: number
  purchase: Purchase
  method?: PaymentMethod
  note?: string
  receiving?: StockReceiving
}

// Keep cash movements on their actual dates, including those on voided invoices.
// Reviews confirm an original payment; they are audit events, not another payment.
export function supplierHistory(supplierId: string, purchases: Purchase[], payments: SupplierPayment[] = [], settlements: PurchaseSettlement[] = [], receivings: StockReceiving[] = []): SupplierHistoryEntry[] {
  const bills = supplierAccount(supplierId, purchases, payments, settlements).purchases
  const events: SupplierHistoryEntry[] = []
  for (const purchase of bills) {
    const account = purchaseAccount(purchase, payments, settlements)
    events.push({ id: `invoice-${purchase.id}`, type: 'invoice', createdAt: purchase.createdAt, amount: purchase.total, purchase, note: purchase.note })
    if (account.known && account.initialPaid > 0) events.push({ id: `initial-${purchase.id}`, type: 'initialPayment', createdAt: purchase.createdAt, amount: account.initialPaid, purchase, method: account.method })
    for (const payment of payments.filter(p => p.purchaseId === purchase.id)) events.push({ ...payment, id: `payment-${payment.id}`, purchase })
    for (const receiving of receivings.filter(r => r.purchaseId === purchase.id)) events.push({ id: `receiving-${receiving.id}`, type: 'receiving', createdAt: receiving.createdAt, amount: receiving.lines.reduce((sum, line) => sum + line.total, 0), purchase, note: receiving.note, receiving })
    for (const review of settlements.filter(r => r.purchaseId === purchase.id)) events.push({ id: `review-${review.id}`, type: 'review', createdAt: review.createdAt, amount: review.paid, purchase, note: review.note, method: review.method })
    if (purchase.voidedAt) events.push({ id: `void-${purchase.id}`, type: 'void', createdAt: purchase.voidedAt, amount: purchase.total, purchase, note: purchase.voidReason })
  }
  // Stable ordering retains invoice -> initial payment when timestamps match.
  return events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

// Cash movements retain their dates even when a purchase is subsequently voided.
export function purchaseCashEntries(purchases: Purchase[], payments: SupplierPayment[] = [], settlements: PurchaseSettlement[] = []) {
  return [...purchases.flatMap(p => {
    const account = purchaseAccount(p, payments, settlements)
    return account.known ? [{ createdAt: p.createdAt, amount: account.initialPaid, type: 'payment' as const }] : []
  }), ...payments.map(p => ({ createdAt: p.createdAt, amount: p.amount, type: p.type }))]
}

// Supplier due is a point-in-time balance. Rebuild the accounts from records
// that existed by the report boundary so historical report periods stay stable.
export function supplierOutstandingDue(
  purchases: Purchase[],
  payments: SupplierPayment[] = [],
  settlements: PurchaseSettlement[] = [],
  through: number,
) {
  const visiblePurchases = purchases
    .filter(p => Date.parse(p.createdAt) < through)
    .map(p => p.voidedAt && Date.parse(p.voidedAt) >= through ? { ...p, voidedAt: undefined, voidReason: undefined } : p)
  const visiblePayments = payments.filter(p => Date.parse(p.createdAt) < through)
  const visibleSettlements = settlements.filter(s => Date.parse(s.createdAt) < through)
  return visiblePurchases.reduce((sum, purchase) => sum + purchaseAccount(
    purchase,
    visiblePayments,
    visibleSettlements,
  ).due, 0)
}


export function invoiceReceivingStatus(purchase: Purchase, receivings: StockReceiving[] = []) {
  if (purchase.mode !== 'invoice') return { status: 'received' as const, remainingValue: 0, lines: [] }
  const received = receivings.filter(r => r.purchaseId === purchase.id).flatMap(r => r.lines)
  const lines = (purchase.invoiceLines ?? []).map(line => {
    const parts = received.filter(r => r.invoiceLineId === line.id)
    const receivedQuantity = parts.reduce((s,r) => s + r.quantity, 0)
    const receivedValue = parts.reduce((s,r) => s + r.total, 0)
    return { ...line, receivedQuantity, receivedValue, remainingQuantity: line.quantity - receivedQuantity, remainingValue: line.total - receivedValue }
  })
  return { lines, remainingValue: lines.reduce((s,l) => s + l.remainingValue, 0),
    status: lines.every(l => l.remainingQuantity === 0) ? 'received' as const : received.length ? 'partReceived' as const : 'awaitingStock' as const }
}

export function makeInvoice(lines: InvoiceLine[], meta: { supplierId?: string; supplier?: string; paid: number; method: PaymentMethod; invoiceNumber?: string; createdAt?: string; note?: string }): Purchase {
  const total = lines.reduce((s,l) => s + l.total, 0)
  if (!lines.length || total <= 0 || !Number.isSafeInteger(total) || total > 100_000_000 || !Number.isSafeInteger(meta.paid) || meta.paid < 0 || meta.paid > total || (meta.paid < total && !meta.supplierId)) throw new Error('invoice')
  const ids = new Set<string>()
  for (const l of lines) {
    if (!l.id || ids.has(l.id) || !l.description.trim() || parseQuantity(String(l.quantity / 1000), l.unit) !== l.quantity || !Number.isSafeInteger(l.total) || l.total <= 0) throw new Error('invoice')
    ids.add(l.id)
  }
  return { id: crypto.randomUUID(), createdAt: meta.createdAt ?? new Date().toISOString(), currencyVersion: 2, ...meta, mode: 'invoice', lines: [], invoiceLines: lines.map(l => ({ ...l, description: l.description.trim() })), total }
}

// Allocate remaining invoice cost proportionally. The final quantity receives the
// exact remainder, so rounding across brands/batches cannot lose a Taka.
export function makeStockReceiving(purchase: Purchase, prior: StockReceiving[], requests: ReceivingRequest[], meta: { id?: string; createdAt?: string; note?: string } = {}): StockReceiving {
  if (purchase.mode !== 'invoice' || purchase.voidedAt || purchase.accountingIssue || !requests.length) throw new Error('invoice')
  const pools = new Map(invoiceReceivingStatus(purchase, prior).lines.map(l => [l.id, { quantity: l.remainingQuantity, total: l.remainingValue, unit: l.unit }]))
  const lines = requests.map(r => {
    const pool = pools.get(r.invoiceLineId)
    if (!pool || !r.productId || parseQuantity(String(r.quantity / 1000), pool.unit) !== r.quantity || r.quantity > pool.quantity) throw new Error('quantity')
    const total = r.allocatedCost ?? proportionalAmount(pool.total, r.quantity, pool.quantity)
    if (!Number.isSafeInteger(total) || total < 0 || total > pool.total || (r.quantity === pool.quantity && total !== pool.total)) throw new Error('cost')
    pool.quantity -= r.quantity; pool.total -= total
    return { ...r, total, unitCost: proportionalAmount(total, 1000, r.quantity) }
  })
  return { id: meta.id ?? crypto.randomUUID(), purchaseId: purchase.id, createdAt: meta.createdAt ?? new Date().toISOString(), currencyVersion: 2, lines, ...(meta.note?.trim() ? { note: meta.note.trim() } : {}) }
}

export function computeTotalFromUnitCost(quantityStr: string, unit: ProductUnit, unitCostStr: string): string | null {
  if (!unitCostStr.trim() || !quantityStr.trim()) return null
  const qScaled = parseQuantity(quantityStr, unit)
  if (qScaled === null || qScaled <= 0) return null
  const uc = Number(unitCostStr)
  if (!Number.isFinite(uc) || uc < 0) return null
  return String(Math.round((qScaled * uc) / 1000))
}

export function computeUnitCostFromTotal(quantityStr: string, unit: ProductUnit, totalStr: string): string | null {
  if (!totalStr.trim() || !quantityStr.trim()) return null
  const qScaled = parseQuantity(quantityStr, unit)
  if (qScaled === null || qScaled <= 0) return null
  const tot = parseMoney(totalStr)
  if (tot === null || tot < 0) return null
  const uc = (tot * 1000) / qScaled
  const rounded = Number(uc.toFixed(2))
  return String(rounded)
}

export function matchCatalogProduct(description: string, unit: ProductUnit, catalog: Product[]): Product | undefined {
  const desc = description.trim().toLowerCase()
  if (!desc) return undefined
  const candidates = catalog.filter(p => !isService(p) && p.unit === unit)
  const exactCode = candidates.find(p => p.code.toLowerCase().trim() === desc)
  if (exactCode) return exactCode
  const exactName = candidates.find(p => p.en.toLowerCase().trim() === desc)
  if (exactName) return exactName
  const exactVariant = candidates.find(p => p.variantName && `${p.en.toLowerCase().trim()} ${p.variantName.toLowerCase().trim()}` === desc)
  if (exactVariant) return exactVariant
  const exactBn = candidates.find(p => p.detailBn && p.detailBn.toLowerCase().trim() === desc)
  if (exactBn) return exactBn

  const nameMatches = candidates.filter(p => p.en.length >= 3 && desc.includes(p.en.toLowerCase().trim()))
  if (nameMatches.length) {
    nameMatches.sort((a, b) => b.en.length - a.en.length)
    return nameMatches[0]
  }

  const reverseNameMatches = candidates.filter(p => desc.length >= 3 && p.en.toLowerCase().trim().includes(desc))
  if (reverseNameMatches.length) {
    reverseNameMatches.sort((a, b) => a.en.length - b.en.length)
    return reverseNameMatches[0]
  }

  const codeMatches = candidates.filter(p => p.code.length >= 3 && desc.includes(p.code.toLowerCase().trim()))
  if (codeMatches.length) {
    codeMatches.sort((a, b) => b.code.length - a.code.length)
    return codeMatches[0]
  }

  const bnMatches = candidates.filter(p => p.detailBn && p.detailBn.length >= 3 && (desc.includes(p.detailBn.toLowerCase().trim()) || (desc.length >= 3 && p.detailBn.toLowerCase().trim().includes(desc))))
  if (bnMatches.length) {
    return bnMatches[0]
  }

  return undefined
}

export type PurchaseStatusFilter = 'all' | 'awaitingStock' | 'partReceived' | 'due'

export function filterPurchases(
  purchases: Purchase[],
  receivings: StockReceiving[],
  payments: SupplierPayment[],
  reviews: PurchaseSettlement[],
  options: {
    status?: PurchaseStatusFilter
    query?: string
    suppliers?: Supplier[]
    catalog?: Product[]
  } = {}
): Purchase[] {
  const { status = 'all', query = '', suppliers = [], catalog = [] } = options
  const q = query.trim().toLowerCase()
  const qTokens = q ? q.split(/\s+/).filter(Boolean) : []

  return purchases.filter(p => {
    if (status === 'awaitingStock') {
      if (p.mode !== 'invoice' || p.voidedAt || p.accountingIssue || invoiceReceivingStatus(p, receivings).status !== 'awaitingStock') return false
    } else if (status === 'partReceived') {
      if (p.mode !== 'invoice' || p.voidedAt || p.accountingIssue || invoiceReceivingStatus(p, receivings).status !== 'partReceived') return false
    } else if (status === 'due') {
      const a = purchaseAccount(p, payments, reviews)
      if (p.voidedAt || !a.known || a.due <= 0) return false
    }

    if (qTokens.length > 0) {
      const supId = p.supplierId ?? reviews.find(r => r.purchaseId === p.id)?.supplierId
      const supName = suppliers.find(s => s.id === supId)?.name ?? ''
      const invoiceLineDesc = p.invoiceLines?.map(l => l.description).join(' ') ?? ''
      const lineNames = p.lines.map(l => {
        const prod = catalog.find(c => c.id === l.productId)
        return `${prod?.code ?? ''} ${prod?.en ?? ''} ${prod?.variantName ?? ''} ${l.productId}`
      }).join(' ')
      const receivedItems = receivings.filter(r => r.purchaseId === p.id).flatMap(r => r.lines).map(l => {
        const prod = catalog.find(c => c.id === l.productId)
        return `${prod?.code ?? ''} ${prod?.en ?? ''} ${prod?.variantName ?? ''} ${l.productId}`
      }).join(' ')
      const haystack = `${p.invoiceNumber ?? ''} ${p.supplier ?? ''} ${supName} ${invoiceLineDesc} ${lineNames} ${receivedItems} ${p.note ?? ''}`.toLowerCase()
      if (!qTokens.every(token => haystack.includes(token))) return false
    }

    return true
  })
}
