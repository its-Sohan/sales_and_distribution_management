import { lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon, PixelMark, ProductArt } from './Icons'
import { Receipt as ReceiptMemo } from './Receipt'
import { ReturnSlip } from './ReturnSlip'
import { DeferredContent } from './DeferredContent'
import { ReportWindowControl } from './ReportWindowControl'
import { Modal, type ModalHandle } from './Modal'
import { suppliersTranslator } from './suppliersCopy'
import { FindBill } from './FindBill'
import { AddStock, type StockPurchaseDraft } from './AddStock'
import { reportLines, itemPerformance } from './reportsModel'
import { reportsTranslator } from './reportsCopy'
import {
  addSaleLine,
  allProducts,
  allCustomers,
  customerBalance,
  receiptOutstandingDue,
  inventoryValuationReady,
  proportionalAmount,
  customerHistory,
  findProductIn,
  initialState,
  isService,
  isMoneyUnit,
  lineTotal,
  makeReceipt,
  validateSalePricing,
  nextReceiptNumber,
  makeExpense,
  makeReturn,
  makeReturnExchange,
  calculateReturnSettlement,
  RETURN_WINDOW_DAYS,
  makeStockAdjustment,
  money,
  parseReferencePrice,
  parseMoney,
  parseQuantity,
  productCost,
  purchaseStockDelta,
  purchaseAccount,
  quantityText,
  quantityWithUnit,
  stockFor,
  subtotal,
  filterByWindow,
  filterReceiptsByWindow,
  initialReportWindow,
  reportWindowMode,
  unitMargin,
  unitMarginPercent,
  unitText,
  getProductVariants,
  displayCatalogProducts,
  searchCatalog,
  searchCustomers,
  scoreProductVariant,
  cleanSearchText,
  type AdjustmentReason,
  type Category,
  type Customer,
  type CustomerHistoryEntry,
  type AccountTransaction,
  type Expense,
  type ExpenseCategory,
  type Lang,
  type Line,
  type PaymentMethod,
  type Product,
  type Purchase,
  type Receipt,
  type ReportWindow,
  type Return,
  type ShopState,
  type StockAdjustment,
  type StockReceiving,
  invoiceReceivingStatus,
} from './model'
import { BackendError, loadWorkspace, saveWorkspace, WorkspaceRefresh, type ValuationCheckpoint, type Workspace } from './backend'
import { clearRetiredBrowserStorage } from './browserCleanup'
import { translator, type CopyKey } from './i18n'
import { useLedgerMotion } from './useLedgerMotion'
import type { useTheme } from './useTheme'
import { formatUiDate, formatUiDateTime } from './dateFormat'
import '@fontsource-variable/inter'
import './receipt.css'
import './motion.css'
import './navigation.css'

const Reports = lazy(() => import('./Reports').then(module => ({ default: module.Reports })))
const Suppliers = lazy(() => import('./Suppliers').then(module => ({ default: module.Suppliers })))
const downloadCustomerHistoryPdf: typeof import('./customerHistoryPdf').downloadCustomerHistoryPdf = async data => {
  const module = await import('./customerHistoryPdf')
  return module.downloadCustomerHistoryPdf(data)
}

type View = 'sales' | 'inventory' | 'accounts' | 'suppliers' | 'expenses' | 'reports'
type Dialog = 'payment' | 'customer' | 'discount' | 'shortcuts' | 'settings' | 'profile' | 'clear' | 'receipt' | 'edit' | 'newItem' | 'addStock' | 'findBill' | 'newCustomer' | 'customerProfile' | 'addTx' | 'itemStats' | 'newExpense' | 'purchases' | 'adjustStock' | 'voidPurchase' | 'returnItems' | 'returnSlip' | 'valuation' | null
const views: View[] = ['sales', 'inventory', 'accounts', 'suppliers', 'expenses', 'reports']
const receiptNumber = (n: number) => String(n).padStart(4, '0')
const dayKey = (date: string | Date) => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
const rateText = (product: Product, fixed = false) => `৳ ${money(product.price, fixed)} / ${isMoneyUnit(product.unit) ? '৳1' : unitText(product.unit)}`
const roundedTaka = (taka: number) => Math.round(taka).toLocaleString('en-BD')
const hoverQuantity = (scaled: number, unit: Product['unit']) => isMoneyUnit(unit)
  ? <>৳ <span className="hover-digits">{money(Math.round(scaled / 1000))}</span></>
  : <><span className="hover-digits">{quantityText(scaled)}</span> {unitText(unit)}</>
// Zero clears a return selection; sale quantities still require a positive value.
const parseReturnQuantity = (value: string, unit: Product['unit']) => !value.trim() || /^0+(\.0{1,3})?$/.test(value.trim()) ? 0 : parseQuantity(value, unit)

function FittedQuantity({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    const button = element?.parentElement
    if (!element || !button) return
    const fit = () => {
      element.style.fontSize = ''
      const naturalWidth = element.scrollWidth
      const availableWidth = button.clientWidth
      if (naturalWidth > availableWidth && availableWidth > 0) {
        const fontSize = parseFloat(getComputedStyle(element).fontSize)
        element.style.fontSize = `${fontSize * availableWidth / naturalWidth}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(button)
    return () => observer.disconnect()
  }, [value])
  return <span className="bill-qty-value" ref={ref}>{value}</span>
}

export default function App({ onSignOut, lang, setLang, theme, setTheme }: {
  onSignOut: () => Promise<void>; lang: Lang; setLang: (lang: Lang) => void;
  theme: ReturnType<typeof useTheme>[0]; setTheme: ReturnType<typeof useTheme>[1];
}) {
  const t = translator(lang)
  const profileCopy = lang === 'bn' ? {
    title: 'দোকানের প্রোফাইল', hint: 'দোকান ও হিসাবের প্রাথমিক তথ্য।', shopName: 'দোকানের নাম', businessType: 'ব্যবসার ধরন', owner: 'মালিক', location: 'ঠিকানা', items: 'পণ্যের সংখ্যা', customers: 'ক্রেতা', sales: 'বিক্রির সংখ্যা', note: 'তথ্য পড়তে ও সংরক্ষণ করতে ইন্টারনেট সংযোগ প্রয়োজন।', shop: 'কম্পিউটার এক্সেসরিজ ও সার্ভিসিং শপ', ownerValue: 'দোকানের মালিক', locationValue: 'বাংলাদেশ'
  } : {
    title: 'Shop profile', hint: 'Basic shop and account details.', shopName: 'Shop name', businessType: 'Business type', owner: 'Owner', location: 'Location', items: 'Items in catalog', customers: 'Customers', sales: 'Sales recorded', note: 'An internet connection is required to load and save data.', shop: 'Computer accessories & servicing shop', ownerValue: 'Shop owner', locationValue: 'Bangladesh'
  }
  const [view, setView] = useState<View>('sales')
  const [state, setState] = useState<ShopState>(initialState)
  const [ready, setReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [online, setOnline] = useState(navigator.onLine)
  const [backendError, setBackendError] = useState('')
  const workspaceRef = useRef<Workspace | null>(null)
  const requestLock = useRef(false)
  const backgroundRefresh = useRef(new WorkspaceRefresh())
  const uncertainWrite = useRef(false)
  const retiredStorageCleared = useRef(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [selected, setSelected] = useState(0)
  const [quantityProduct, setQuantityProduct] = useState<Product | null>(null)
  const currentSaleStep = quantityProduct ? 1 : state.lines.length ? 2 : 0
  const [selectedVariant, setSelectedVariant] = useState<Product | null>(null)
  const [qty, setQty] = useState('1')
  const [salePrice, setSalePrice] = useState('')
  const [priceConfirmed, setPriceConfirmed] = useState(false)
  const [inputError, setInputError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const modalRef = useRef<ModalHandle>(null)
  const [billFinderActive, setBillFinderActive] = useState(false)
  const [supplierPurchaseRequest, setSupplierPurchaseRequest] = useState(false)
  const [stockPurchaseDraft, setStockPurchaseDraft] = useState<StockPurchaseDraft | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<Receipt['method']>('cash')
  const [received, setReceived] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const [customerTab, setCustomerTab] = useState<'recent' | 'due' | 'all'>('recent')
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState(0)
  const customerSearchInputRef = useRef<HTMLInputElement>(null)
  const customerOptionsRef = useRef<HTMLDivElement>(null)
  const [modalError, setModalError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null)
  const [receiptPending, setReceiptPending] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [reportWindow, setReportWindow] = useState<ReportWindow>(() => initialReportWindow())
  const [expenseWindow, setExpenseWindow] = useState<ReportWindow>(() => initialReportWindow())
  const [billSelection, setBillSelection] = useState(0)
  const [toastExiting, setToastExiting] = useState(false)
  const [toastHovered, setToastHovered] = useState(false)
  const [toastFocused, setToastFocused] = useState(false)
  const [toast, setToast] = useState<{ text: string; variant?: 'success' | 'danger'; undo?: () => void } | null>(null)
  const warnBelowCost = () => setToast({ text: t('belowCostToast'), variant: 'danger' })
  const searchRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const billRef = useRef<HTMLDivElement>(null)
  const productRefs = useRef<(HTMLButtonElement | null)[]>([])
  const paymentLock = useRef(false)
  const [now, setNow] = useState(new Date())

  const applyWorkspace = (workspace: Workspace) => {
    workspaceRef.current = workspace
    setState(workspace.state)
    setReady(true)
  }

  const terminalNumber = () => {
    try {
      const id = Number(localStorage.getItem('hisab-terminal-number') ?? 1)
      return Number.isInteger(id) && id >= 1 && id <= 999 ? id : 1
    } catch { return 1 }
  }

  const refreshWorkspace = async (id = workspaceRef.current?.state.terminalId ?? terminalNumber()) => {
    if (requestLock.current) return
    backgroundRefresh.current.cancel()
    requestLock.current = true
    setBusy(true)
    try {
      if (!retiredStorageCleared.current) { await clearRetiredBrowserStorage(); retiredStorageCleared.current = true }
      const workspace = await loadWorkspace(id)
      applyWorkspace(workspace)
      if (uncertainWrite.current) { setDialog(null); setBillFinderActive(false); setModalError(''); setToast({ text: t('dataRefreshed') }) }
      uncertainWrite.current = false
      setSaveStatus('saved')
      setBackendError('')
      try { localStorage.setItem('hisab-terminal-number', String(id)) } catch { /* A terminal preference is not financial data. */ }
    } catch (error) {
      setSaveStatus('error')
      setBackendError(error instanceof Error ? error.message : t('backendUnavailable'))
    } finally { requestLock.current = false; setBusy(false) }
  }

  const updateState = async (change: (current: ShopState) => ShopState, options?: { valuationCheckpoints?: ValuationCheckpoint[]; confirmDraft?: boolean }): Promise<ShopState | undefined> => {
    const current = workspaceRef.current
    if (!current || requestLock.current || uncertainWrite.current) return
    backgroundRefresh.current.cancel()
    requestLock.current = true
    setBusy(true)
    setSaveStatus('saving')
    setBackendError('')
    try {
      const workspace = await saveWorkspace(change(current.state), current, options)
      applyWorkspace(workspace)
      setSaveStatus('saved')
      return workspace.state
    } catch (error) {
      if (error instanceof Error && /below buy cost/.test(error.message)) warnBelowCost()
      const conflict = error instanceof BackendError && error.status === 409
      const message = conflict ? t('dataChanged') : error instanceof BackendError && error.status === 422 ? error.message : t('saveError')
      setModalError(message)
      setBackendError(message)
      setSaveStatus('error')
      // An interrupted response may follow a successful commit. Require a read
      // before another write so a repeated click cannot record the action twice.
      uncertainWrite.current = !(error instanceof BackendError && error.status >= 400 && error.status < 500)
      if (conflict) {
        try {
          applyWorkspace(await loadWorkspace(current.state.terminalId ?? 1))
          setDialog(null)
          setBillFinderActive(false)
          setToast({ text: message, variant: 'danger' })
        } catch { uncertainWrite.current = true }
      }
    } finally { requestLock.current = false; setBusy(false) }
  }

  const updateTerminalId = async (id: number) => {
    if (id < 1 || id > 999 || !Number.isInteger(id)) return
    await refreshWorkspace(id)
  }

  useEffect(() => {
    void refreshWorkspace()
    let timer: ReturnType<typeof setTimeout>
    const updateClock = () => {
      const current = new Date()
      setNow(current)
      timer = setTimeout(updateClock, (60 - current.getSeconds()) * 1000 - current.getMilliseconds())
    }
    timer = setTimeout(updateClock, (60 - new Date().getSeconds()) * 1000)
    const onOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
    return () => { clearTimeout(timer); backgroundRefresh.current.cancel(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline) }
  }, [])

  useEffect(() => {
    const refresh = () => {
      const current = workspaceRef.current
      const isCurrent = () => workspaceRef.current === current && !requestLock.current && !uncertainWrite.current && !document.querySelector('dialog[open]') && document.visibilityState === 'visible' && navigator.onLine
      if (!ready || !current || dialog || !isCurrent()) return
      void backgroundRefresh.current.check(current, isCurrent, workspace => {
        applyWorkspace(workspace)
        setSaveStatus('saved')
        setBackendError('')
      }).then(confirmed => {
        if (confirmed && isCurrent()) { setSaveStatus('saved'); setBackendError('') }
      }).catch(error => {
        setSaveStatus('error')
        setBackendError(error instanceof Error ? error.message : t('backendUnavailable'))
      })
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { backgroundRefresh.current.cancel(); clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [ready, dialog])
  useEffect(() => {
    if (!toast) { setToastExiting(false); setToastHovered(false); setToastFocused(false); return }
    setToastExiting(false)
    if (toast.undo || toastHovered || toastFocused) return
    let exitTimer: ReturnType<typeof setTimeout>
    const dismissTimer = setTimeout(() => {
      setToastExiting(true)
      exitTimer = setTimeout(() => setToast(null), 140)
    }, toast.variant === 'danger' ? 10000 : 5000)
    return () => { clearTimeout(dismissTimer); clearTimeout(exitTimer) }
  }, [toast, toastHovered, toastFocused])
  useEffect(() => { document.title = `${t(view)} | Hisab` }, [view, lang])
  useEffect(() => { setSelected(0) }, [query, category])
  useEffect(() => { if (quantityProduct) { priceRef.current?.focus() } }, [quantityProduct])
  useEffect(() => { if (ready) searchRef.current?.focus() }, [ready, view])

  const catalog = allProducts(state.customProducts)
  const findItem = (id: string) => findProductIn(id, catalog)
  const stockOf = (product: Product) => stockFor(product, state.receipts, state.adjustments ?? [], state.returns ?? [])
  const setProductArchived = async (product: Product, archived: boolean) => {
    const current = state.customProducts ?? []
    const updated = [...current.filter(item => item.id !== product.id), { ...product, archived }]
    if (!await updateState(s => ({ ...s, customProducts: updated }))) return
    setToast({ text: archived ? `${product.en} discontinued` : `${product.en} restored to sales` })
  }

  // Provisioning form state
  const [newCode, setNewCode] = useState('')
  const [newNameEn, setNewNameEn] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newWarranty, setNewWarranty] = useState('')
  const [newCategory, setNewCategory] = useState<Exclude<Category, 'all' | 'recent'>>('staples')
  const [newUnit, setNewUnit] = useState<Product['unit']>('pc')
  const [newKind, setNewKind] = useState<'product' | 'service'>('product')
  const [newPrice, setNewPrice] = useState('')
  const [newCost, setNewCost] = useState('')
  const st = suppliersTranslator(lang)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)

  const openProvisionDialog = () => {
    setEditingServiceId(null)
    let nextCode = 100 + catalog.length + 1
    while (catalog.some(p => p.code === String(nextCode))) nextCode++
    setNewCode(String(nextCode))
    setNewNameEn('')
    setNewDetail('')
    setNewWarranty('')
    setNewCategory('staples')
    setNewUnit('pc')
    setNewKind('product')
    setNewPrice('')
    setNewCost('')
    setModalError('')
    openDialog('newItem')
  }

  const openEditService = (product: Product) => {
    setEditingServiceId(product.id)
    setNewCode(product.code); setNewNameEn(product.en); setNewDetail(product.detail)
    setNewWarranty(product.warranty ?? ''); setNewCategory(product.category); setNewUnit(product.unit)
    setNewKind('service'); setNewPrice(String(product.price)); setNewCost(product.cost === undefined ? '' : String(product.cost))
    openDialog('newItem')
  }

  const openAddStock = (product?: Product) => {
    setStockPurchaseDraft(product ? { productId: product.id } : null)
    openDialog('addStock')
  }

  const recordStockReceiving = async (receiving: StockReceiving) => {
    if (!await updateState(s => ({ ...s, stockReceivings: [...(s.stockReceivings ?? []), receiving] }))) return false
    closeDialog(); setToast({ text: st('stockReceived'), variant: 'success' }); return true
  }
  const createReceivingProduct = async (product: Product) => !!await updateState(s => ({ ...s, customProducts: [...(s.customProducts ?? []), product] }))
  const openNewSupplierInvoice = () => { closeDialog(); setView('suppliers'); setSupplierPurchaseRequest(true) }

  const createProduct = async () => {
    const codeTrim = newCode.trim()
    const enTrim = newNameEn.trim()
    const detailTrim = newDetail.trim() || (newKind === 'service' ? 'Service & Repair' : '')
    const detailBnTrim = newDetail.trim() || (newKind === 'service' ? 'সার্ভিস ও মেরামত' : '')
    const warranty = newWarranty.trim()
    if (!codeTrim || !enTrim) {
      setModalError(t('fillRequired'))
      return
    }

    const existing = catalog.find(p => p.code.toLowerCase() === codeTrim.toLowerCase())
    if (existing && existing.id !== editingServiceId) { setModalError(t('codeExists')); return }
    if (editingServiceId && (!existing || !isService(existing) || existing.id !== editingServiceId)) {
      setModalError(t('itemTypeMismatch')); return
    }
    if (newKind === 'service') {
      const price = parseReferencePrice(newPrice, existing?.price)
      const cost = newCost.trim() ? parseMoney(newCost) : undefined
      if (price === null || cost === null) {
        setModalError(t('invalidAmount'))
        return
      }
      const service: Product = {
        ...(existing ?? { id: `p-${crypto.randomUUID()}`, art: 'cleaner' as const, color: '#e0e8f0' }),
        code: codeTrim, en: enTrim, detail: detailTrim, detailBn: detailBnTrim, warranty,
        category: newCategory, unit: newUnit, price, kind: 'service', stock: 0, purchased: 0,
        ...(cost !== undefined ? { cost } : { cost: undefined }),
      }
      const previous = state.customProducts ?? []
      if (!await updateState(s => ({ ...s, customProducts: previous.some(item => item.id === service.id)
        ? previous.map(item => item.id === service.id ? service : item)
        : [...previous, service] }))) return
      closeDialog()
      setToast({ text: t(editingServiceId ? 'serviceUpdated' : 'itemCreated'), variant: 'success' })
      return
    }

    const parsedPrice = parseReferencePrice(newPrice)
    if (parsedPrice === null) {
      setModalError(t('invalidAmount'))
      return
    }
    const newProd: Product = {
      id: `p-${crypto.randomUUID()}`,
      code: codeTrim,
      en: enTrim,
      detail: detailTrim,
      detailBn: detailBnTrim,
      warranty,
      category: newCategory,
      unit: newUnit,
      price: parsedPrice,
      stock: 0,
      purchased: 0,
      art: 'daily',
      color: '#e4e7d8',
    }
    const updatedCustom = [...(state.customProducts ?? []), newProd]
    if (!await updateState(s => ({ ...s, customProducts: updatedCustom }))) return
    closeDialog()
    setToast({ text: t('itemCreated'), variant: 'success' })
  }

  // Customer provisioning and profile state
  const customerCatalog = allCustomers(state.customCustomers)
  const matchingCustomers = searchCustomers(customerCatalog, customerQuery)
  const filteredAccountCustomers = searchCustomers(customerCatalog, customerSearchQuery)
  const normalizedInventoryQuery = inventorySearchQuery.trim().toLocaleLowerCase()
  const filteredInventory = normalizedInventoryQuery ? catalog.filter(product =>
    [product.en, product.detail, product.detailBn, product.code, product.variantName, product.category]
      .some(value => value?.toLocaleLowerCase().includes(normalizedInventoryQuery)),
  ) : catalog

  const customerLastSeenMap = useMemo(() => {
    const map = new Map<string, string>()
    for (let i = state.receipts.length - 1; i >= 0; i--) {
      const r = state.receipts[i]
      if (r.customer?.id && !map.has(r.customer.id)) {
        map.set(r.customer.id, r.createdAt)
      }
    }
    if (state.transactions) {
      for (let i = state.transactions.length - 1; i >= 0; i--) {
        const tx = state.transactions[i]
        if (tx.customerId && !map.has(tx.customerId)) {
          map.set(tx.customerId, tx.createdAt)
        }
      }
    }
    return map
  }, [state.receipts, state.transactions])

  const recentCustomers = useMemo(() => {
    const ids: string[] = []
    const seen = new Set<string>()
    for (let i = state.receipts.length - 1; i >= 0; i--) {
      const cid = state.receipts[i].customer?.id
      if (cid && !seen.has(cid)) {
        seen.add(cid)
        ids.push(cid)
        if (ids.length >= 10) break
      }
    }
    if (ids.length < 10 && state.transactions) {
      for (let i = state.transactions.length - 1; i >= 0; i--) {
        const cid = state.transactions[i].customerId
        if (cid && !seen.has(cid)) {
          seen.add(cid)
          ids.push(cid)
          if (ids.length >= 10) break
        }
      }
    }
    return ids.map(id => customerCatalog.find(c => c.id === id)).filter((c): c is Customer => !!c)
  }, [state.receipts, state.transactions, customerCatalog])

  const customersWithDue = useMemo(() => {
    const list: { customer: Customer; due: number }[] = []
    for (const c of customerCatalog) {
      const b = customerBalance(c, state.receipts, state.transactions, state.returns)
      if (!b.accountingIssue && b.totalDue > 0) {
        list.push({ customer: c, due: b.totalDue })
      }
    }
    list.sort((a, b) => b.due - a.due)
    return list.map(item => item.customer)
  }, [customerCatalog, state.receipts, state.transactions, state.returns])

  const openCustomerPicker = () => {
    setCustomerQuery('')
    setCustomerHighlightIndex(0)
    setCustomerTab(recentCustomers.length > 0 ? 'recent' : customersWithDue.length > 0 ? 'due' : 'all')
    openDialog('customer')
  }

  const formatLastSeen = (isoDate?: string) => {
    if (!isoDate) return null
    const date = new Date(isoDate)
    const today = dayKey(new Date())
    const dateDay = dayKey(date)
    if (today === dateDay) {
      return `${lang === 'bn' ? 'আজ' : 'Today'} ${date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false })}`
    }
    return formatUiDate(date)
  }
  const [newCustEn, setNewCustEn] = useState('')
  const [newCustBn, setNewCustBn] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustAddress, setNewCustAddress] = useState('')
  const [newCustOpeningDue, setNewCustOpeningDue] = useState('0')
  const [customerCreationSource, setCustomerCreationSource] = useState<'bill' | 'accounts'>('accounts')
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null)
  const [activeReportProduct, setActiveReportProduct] = useState<Product | null>(null)

  // Transaction record modal state
  const [txType, setTxType] = useState<AccountTransaction['type']>('payment')
  const [txAmount, setTxAmount] = useState('')
  const [txNote, setTxNote] = useState('')

  // Expense entry modal state
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('rent')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash')
  const [expenseNote, setExpenseNote] = useState('')

  // Purchase void, stock adjustment, and return modal state
  const [refundConfirmed, setRefundConfirmed] = useState(false)
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [voidTarget, setVoidTarget] = useState<Purchase | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove' | 'count'>('remove')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<AdjustmentReason>('damage')
  const [adjustNote, setAdjustNote] = useState('')
  const [returnReceipt, setReturnReceipt] = useState<Receipt | null>(null)
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({})
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>('cash')
  const [returnRefund, setReturnRefund] = useState('')
  const [returnNote, setReturnNote] = useState('')
  const [returnConditions, setReturnConditions] = useState<Record<string, 'sellable' | 'damaged'>>({})
  const [returnOperator, setReturnOperator] = useState('')
  const [returnIssueCredit, setReturnIssueCredit] = useState(false)
  const [returnReceived, setReturnReceived] = useState('')
  const [exchangeLines, setExchangeLines] = useState<Line[]>([])
  const [exchangeProductId, setExchangeProductId] = useState('')
  const [exchangeQty, setExchangeQty] = useState('1')
  const [exchangePrice, setExchangePrice] = useState('')
  const [activeReturn, setActiveReturn] = useState<Return | null>(null)
  const [valuationProduct, setValuationProduct] = useState<Product | null>(null)
  const [valuationAmount, setValuationAmount] = useState('')
  const openValuation = (product: Product) => { setValuationProduct(product); setValuationAmount(''); openDialog('valuation') }
  const saveValuation = async () => {
    if (!valuationProduct) return
    const inventoryValue = parseMoney(valuationAmount)
    if (inventoryValue === null) { setModalError(t('invalidAmount')); return }
    if (await updateState(s => s, { valuationCheckpoints: [{ productId: valuationProduct.id, expectedQuantity: stockOf(valuationProduct), inventoryValue, reason: 'Owner confirmed opening stock value' }] })) closeDialog()
  }

  const openCustomerProvisionDialog = (source: 'bill' | 'accounts' = 'accounts', prefill?: { name?: string; phone?: string }) => {
    setCustomerCreationSource(source)
    setNewCustEn(prefill?.name ?? '')
    setNewCustBn(prefill?.name ?? '')
    setNewCustPhone(prefill?.phone ?? '')
    setNewCustAddress('')
    setNewCustOpeningDue('0')
    setModalError('')
    openDialog('newCustomer')
  }

  const createCustomer = async () => {
    const enTrim = newCustEn.trim()
    const bnTrim = newCustBn.trim() || enTrim
    const phoneTrim = newCustPhone.trim()
    const addressTrim = newCustAddress.trim()
    if (!enTrim || !phoneTrim) {
      setModalError(t('fillRequired'))
      return
    }
    if (customerCatalog.some(c => c.phone.replaceAll(' ', '') === phoneTrim.replaceAll(' ', ''))) {
      setModalError(t('phoneExists'))
      return
    }
    const parsedOpeningDue = newCustOpeningDue.trim() ? parseMoney(newCustOpeningDue) : 0
    if (parsedOpeningDue === null) { setModalError(t('invalidAmount')); return }

    const newCust: Customer = {
      id: `c-${crypto.randomUUID()}`,
      en: enTrim,
      bn: bnTrim,
      phone: phoneTrim,
      ...(addressTrim ? { address: addressTrim } : {}),
      openingBalance: parsedOpeningDue,
    }

    if (!await updateState(s => ({
      ...s,
      customCustomers: [...(s.customCustomers ?? []), newCust],
      customerId: customerCreationSource === 'bill' ? newCust.id : s.customerId,
    }))) return
    closeDialog()
    setToast({ text: t('customerCreated') })
  }

  const cancelCustomerProvision = () => {
    if (customerCreationSource === 'bill') openCustomerPicker()
    else closeDialog()
  }

  const openCustomerProfile = (c: Customer) => {
    setActiveCustomer(c)
    openDialog('customerProfile')
  }

  const openAddTransaction = (type: AccountTransaction['type']) => {
    setTxType(type)
    setTxAmount('')
    setTxNote('')
    setModalError('')
    openDialog('addTx')
  }

  const recordTransaction = async () => {
    if (!activeCustomer) return
    const parsed = parseMoney(txAmount)
    if (parsed === null || parsed <= 0) {
      setModalError(t('invalidAmount'))
      return
    }

    const newTx: AccountTransaction = {
      id: `tx-${crypto.randomUUID()}`,
      customerId: activeCustomer.id,
      type: txType,
      amount: parsed,
      createdAt: new Date().toISOString(),
      note: txNote.trim() || (txType === 'payment' ? t('txPayment') : t('txAdjustment')),
    }

    const updated = [...(state.transactions ?? []), newTx]
    if (!await updateState(s => ({ ...s, transactions: updated }))) return
    closeDialog()
    setToast({ text: txType === 'payment' ? t('paymentReceived') : t('txSaved') })
  }

  const openExpenseDialog = () => {
    setExpenseCategory('rent')
    setExpenseAmount('')
    setExpenseMethod('cash')
    setExpenseNote('')
    setModalError('')
    openDialog('newExpense')
  }

  const saveExpense = async () => {
    const parsed = parseMoney(expenseAmount)
    if (parsed === null || parsed <= 0) {
      setModalError(t('invalidAmount'))
      return
    }
    let expense: Expense
    try { expense = makeExpense({ category: expenseCategory, amount: parsed, method: expenseMethod, note: expenseNote }) }
    catch {
      setModalError(t('invalidAmount'))
      return
    }
    if (!await updateState(s => ({ ...s, expenses: [...(s.expenses ?? []), expense] }))) return
    closeDialog()
    setToast({ text: t('expenseSaved') })
  }

  const openVoidDialog = (purchase: Purchase) => {
    setVoidTarget(purchase); setRefundConfirmed(false); setRefundMethod('cash')
    setVoidReason('')
    setModalError('')
    openDialog('voidPurchase')
  }

  const openRestockFromPurchase = (purchase: Purchase) => { openAddStock(findItem(purchase.lines[0].productId)) }

  const applyVoidPurchase = async () => {
    if (!voidTarget) return
    const reason = voidReason.trim()
    if (!reason) { setModalError(t('voidReasonRequired')); return }
    const account = purchaseAccount(voidTarget, state.supplierPayments, state.purchaseSettlements)
    if (account.known && account.paid > 0 && !refundConfirmed) { setModalError(st('refundHint')); return }
    const delta = purchaseStockDelta(voidTarget, state.stockReceivings)
    const current = state.customProducts ?? []
    let updated = [...current]
    for (const [productId, quantity] of delta) {
      const product = findItem(productId)
      const changed: Product = { ...product, stock: product.stock - quantity, purchased: Math.max(0, (product.purchased ?? product.stock) - quantity) }
      updated = [...updated.filter(item => item.id !== productId), changed]
    }
    const voidedAt = new Date().toISOString()
    const target = voidTarget
    if (!await updateState(s => ({
      ...s,
      customProducts: updated,
      supplierPayments: [...(s.supplierPayments ?? []), ...(account.known && account.paid > 0 ? [{ id: crypto.randomUUID(), purchaseId: target.id, supplierId: account.supplierId, amount: account.paid, type: 'refund' as const, method: refundMethod, createdAt: voidedAt, note: reason }] : [])],
      purchases: (s.purchases ?? []).map(item => item.id === target.id ? { ...item, voidedAt, voidReason: reason } : item),
    }))) return
    closeDialog()
    if (target.mode === 'invoice') setToast({ text: t('purchaseVoided') })
    else if (target.lines.length === 1) { openRestockFromPurchase(target); setToast({ text: t('purchaseVoided') }) }
    else setToast({ text: `${t('purchaseVoided')} · ${t('voidMultiLineNote')}` })
  }

  const openAdjustDialog = (product: Product) => {
    setAdjustProduct(product)
    setAdjustMode('remove')
    setAdjustQty('')
    setAdjustReason('damage')
    setAdjustNote('')
    setModalError('')
    openDialog('adjustStock')
  }

  const applyAdjustment = async () => {
    if (!adjustProduct) return
    const parsed = adjustMode === 'count' ? parseReturnQuantity(adjustQty, adjustProduct.unit) : parseQuantity(adjustQty, adjustProduct.unit)
    if (!adjustQty.trim() || parsed === null || (adjustMode !== 'count' && parsed <= 0)) { setModalError(t('invalidQuantity')); return }
    let quantity: number
    let counted: number | undefined
    if (adjustMode === 'count') {
      counted = parsed
      quantity = parsed - stockOf(adjustProduct)
      if (quantity === 0) { closeDialog(); return }
    } else {
      quantity = adjustMode === 'add' ? parsed : -parsed
    }
    let adjustment: StockAdjustment
    try { adjustment = makeStockAdjustment({ productId: adjustProduct.id, quantity, reason: adjustReason, counted, note: adjustNote }) }
    catch { setModalError(t('invalidQuantity')); return }
    if (!await updateState(s => ({ ...s, adjustments: [...(s.adjustments ?? []), adjustment] }))) return
    closeDialog()
    setToast({ text: t('adjustmentSaved') })
  }

  const openReturnDialog = (receipt: Receipt) => {
    setReturnReceipt(receipt)
    const qtys: Record<string, string> = {}
    for (const line of receipt.lines) qtys[line.productId] = ''
    setReturnQtys(qtys)
    setReturnMethod('cash')
    setReturnRefund('')
    setReturnNote('')
    setReturnConditions(Object.fromEntries(receipt.lines.map(line => [line.productId, isService(line.product) ? 'damaged' as const : 'sellable' as const])))
    setReturnOperator('')
    setReturnIssueCredit(false)
    setReturnReceived('')
    setExchangeLines([])
    setExchangeProductId('')
    setExchangeQty('1')
    setExchangePrice('')
    setModalError('')
    openDialog('returnItems')
  }

  const applyReturn = async () => {
    if (busy) return
    if (!returnReceipt) return
    for (const line of returnReceipt.lines) if ((returnQtys[line.productId] ?? '').trim() && parseReturnQuantity(returnQtys[line.productId], line.product.unit) === null) { setModalError(t('invalidQuantity')); return }
    const requests = returnReceipt.lines
      .map(line => ({ productId: line.productId, quantity: parseReturnQuantity(returnQtys[line.productId] ?? '', line.product.unit) ?? 0, condition: isService(line.product) ? 'damaged' as const : returnConditions[line.productId] ?? 'sellable' as const }))
      .filter(request => request.quantity > 0)
    if (!requests.length) { setModalError(t('returnNothing')); return }
    const override = returnRefund.trim() ? parseMoney(returnRefund) : undefined
    if (override !== undefined && (override === null || override < 0)) { setModalError(t('invalidAmount')); return }
    const received = returnReceived.trim() ? parseMoney(returnReceived) : undefined
    if (received === null) { setModalError(t('invalidAmount')); return }
    const returningStock = new Map(requests.filter(line => line.condition === 'sellable').map(line => [line.productId, line.quantity]))
    for (const line of exchangeLines) {
      const product = findItem(line.productId)
      if (!isService(product) && line.quantity > stockOf(product) + (returningStock.get(line.productId) ?? 0)) { setModalError(t('noStock')); return }
    }
    let entry: Return
    try {
      entry = makeReturnExchange(returnReceipt, requests, exchangeLines, {
        catalog, receipts: state.receipts, adjustments: state.adjustments, priorReturns: state.returns ?? [], receiptDue: receiptOutstandingDue(returnReceipt, state.receipts, state.transactions, state.returns), customerDue: returnReceipt.customer ? customerBalance(returnReceipt.customer, state.receipts, state.transactions, state.returns).totalDue : 0,
        refunded: override, received, method: returnMethod, issueCredit: returnIssueCredit,
        reason: returnNote, operator: returnOperator,
      })
    } catch (error) {
      const code = (error as Error).message
      setModalError(t(code === 'belowCost' ? 'belowCost' : code === 'quantity' ? 'returnTooMany' : code === 'receipt' ? 'returnNothing' : code === 'expired' ? 'returnExpired' : code === 'details' ? 'returnDetailsRequired' : code === 'customer' ? 'customerRequired' : 'invalidAmount'))
      return
    }
    const saved = await updateState(current => ({ ...current, returns: [...(current.returns ?? []), entry] }))
    if (!saved) return
    setActiveReturn(saved.returns?.find(item => item.id === entry.id) ?? null)
    setDialog('returnSlip'); setModalError('')
    setToast({ text: t('returnSaved') })
  }

  // Helper to retrieve all variants for a product
  const getVariants = (p: Product): Product[] => getProductVariants(p, catalog)
  const getSaleVariants = (p: Product): Product[] => getVariants(p).filter(item => !item.archived)

  // Deduplicate products that belong to the same groupId in the sales catalog view
  const displayCatalog = displayCatalogProducts(catalog)

  // Extract last 10 unique sold items from completed receipts (most recently sold first)
  const recentProducts: Product[] = (() => {
    const seen = new Set<string>()
    const list: Product[] = []
    // Iterate from newest receipt to oldest
    for (let i = state.receipts.length - 1; i >= 0; i--) {
      const receipt = state.receipts[i]
      for (let j = receipt.lines.length - 1; j >= 0; j--) {
        const line = receipt.lines[j]
        const found = findItem(line.productId)
        if (found && !found.archived) {
          const groupKey = found.groupId ?? found.id
          if (!seen.has(groupKey)) {
            seen.add(groupKey)
            list.push(found)
            if (list.length >= 10) break
          }
        }
      }
      if (list.length >= 10) break
    }
    // If fewer than 10 have been sold, backfill with default display catalog items up to 10
    if (list.length < 10) {
      for (const p of displayCatalog) {
        const groupKey = p.groupId ?? p.id
        if (!seen.has(groupKey)) {
          seen.add(groupKey)
          list.push(p)
          if (list.length >= 10) break
        }
      }
    }
    return list
  })()

  const filtered = searchCatalog(catalog, query, category, recentProducts)

  const billSubtotal = subtotal(state.lines, catalog)
  const legacyDraft = state.lines.some(line => line.legacyAmount)
  const billTotal = Math.max(0, billSubtotal - state.discount)
  const motionRoot = useLedgerMotion({ lines: state.lines, total: billTotal, receipts: state.receipts.length, ready, toast })
  const customer = customerCatalog.find(c => c.id === state.customerId)
  const todayReceipts = state.receipts.filter(r => dayKey(r.createdAt) === dayKey(now))
  const todaySales = todayReceipts.reduce((s, r) => s + r.total, 0)
  const todayPaid = todayReceipts.reduce((s, r) => s + r.paid, 0)
  const windowReceipts = filterReceiptsByWindow(state.receipts, reportWindow, now)
  const expenses = state.expenses ?? []
  const filteredExpenses = filterByWindow(expenses, expenseWindow, now).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const expensesThisMonthTotal = filterByWindow(expenses, 'month', now).reduce((sum, expense) => sum + expense.amount, 0)
  const expensesTodayTotal = filterByWindow(expenses, 'today', now).reduce((sum, expense) => sum + expense.amount, 0)
  const stockReceivedThisMonthTotal = filterByWindow([...(state.purchases ?? []).filter(p=>p.mode!=='invoice'&&!p.voidedAt),...(state.stockReceivings??[]).filter(r=>!(state.purchases??[]).find(p=>p.id===r.purchaseId)?.voidedAt).map(r=>({createdAt:r.createdAt,total:r.lines.reduce((s,l)=>s+l.total,0)}))], 'month', now).reduce((sum,event)=>sum+event.total,0)
  const pendingDue = customerCatalog.reduce((sum, c) => sum + customerBalance(c, state.receipts, state.transactions, state.returns).totalDue, 0)
  const checkoutBalance = customer ? customerBalance(customer, state.receipts, state.transactions, state.returns) : null
  const checkoutCredit = checkoutBalance && !checkoutBalance.accountingIssue ? Math.min(billTotal, checkoutBalance.storeCredit) : 0
  const checkoutPayable = billTotal - checkoutCredit
  const paidAmount = parseMoney(received) ?? 0
  const goSearch = () => { setQuantityProduct(null); setSelectedVariant(null); setSalePrice(''); setPriceConfirmed(false); setInputError(''); requestAnimationFrame(() => searchRef.current?.focus()) }
  const finishCloseDialog = () => { setDialog(null); setModalError(''); setBillFinderActive(false) }
  const closeDialog = () => {
    if (busy || !dialog) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishCloseDialog()
    else if (modalRef.current) modalRef.current.exit()
    else finishCloseDialog()
  }
  const openDialog = (next: Dialog) => { modalRef.current?.cancelExit(); setModalError(''); setDialog(next) }
  const openBillFinder = () => { setBillFinderActive(true); openDialog('findBill') }
  const checkBillPricing = (candidate: ShopState) => {
    try { validateSalePricing(candidate); return true }
    catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'belowCost') warnBelowCost()
      const message = t(code === 'belowCost' ? 'belowCost' : code === 'stock' ? 'noStock' : code === 'quantity' ? 'invalidQuantity' : code === 'legacyAmount' ? 'legacyAmountDraft' : 'invalidAmount')
      setInputError(message)
      setModalError(message)
      return false
    }
  }
  const openPayment = () => {
    if (!state.lines.length || !ready || state.draftAccountingIssue || legacyDraft) return
    if (!checkBillPricing(state)) return
    setReceived(String(checkoutPayable)); setPaymentMethod('cash'); openDialog('payment')
  }
  const notify = (key: CopyKey) => setToast({ text: t(key), variant: key === 'productAdded' ? 'success' : undefined })
  const chooseProduct = (product: Product) => {
    if (busy || requestLock.current) return
    if (!isService(product) && !inventoryValuationReady(product)) { openValuation(product); return }
    setQuantityProduct(product)
    const variants = getSaleVariants(product)
    const qTrim = query.trim()
    const matchingVariant = (qTrim ? variants.map(v => ({ v, score: scoreProductVariant(v, qTrim) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0]?.v : null) ?? variants[0] ?? product
    setSelectedVariant(matchingVariant)
    setQty('1')
    setSalePrice('')
    setPriceConfirmed(false)
    setInputError('')
    requestAnimationFrame(() => priceRef.current?.focus())
  }
  const confirmSalePrice = () => {
    const price = parseMoney(salePrice)
    if (price === null || price <= 0) { setInputError(t('invalidAmount')); priceRef.current?.focus(); return }
    const selectedProduct = selectedVariant ?? quantityProduct
    const product = selectedProduct ? findItem(selectedProduct.id) : null
    if (product && price < productCost(product)) { setInputError(''); warnBelowCost(); priceRef.current?.focus(); return }
    setInputError(''); setPriceConfirmed(true)
    requestAnimationFrame(() => { qtyRef.current?.focus(); qtyRef.current?.select() })
  }
  const addProduct = async () => {
    const selectedProduct = selectedVariant ?? quantityProduct
    const targetProduct = selectedProduct ? findItem(selectedProduct.id) : null
    if (!targetProduct || busy || requestLock.current) return
    const unitPrice = parseMoney(salePrice)
    if (unitPrice === null || unitPrice <= 0) { setInputError(t('invalidAmount')); priceRef.current?.focus(); return }
    if (unitPrice < productCost(targetProduct)) { setInputError(''); warnBelowCost(); priceRef.current?.focus(); return }
    if (state.lines.some(line => line.productId === targetProduct.id && line.legacyAmount)) { setInputError(t('legacyAmountDraft')); return }
    const parsed = parseQuantity(qty, targetProduct.unit)
    if (parsed === null) { setInputError(t('invalidQuantity')); return }
    const existing = state.lines.find(l => l.productId === targetProduct.id)?.quantity ?? 0
    if (!isService(targetProduct) && existing + parsed > stockOf(targetProduct)) { setInputError(t('noStock')); return }
    const lines = addSaleLine(state.lines, { productId: targetProduct.id, quantity: parsed, unitPrice })
    const discount = Math.min(state.discount, Math.max(0, subtotal(lines, catalog) - 1))
    if (!checkBillPricing({ ...state, lines, discount })) return
    if (!await updateState(previous => ({ ...previous, lines, discount }))) return
    notify('productAdded'); setQuery(''); goSearch()
  }
  const removeLine = async (index: number) => {
    const removed = state.lines[index]
    const previousReceiptCount = state.receipts.length
    const previousDiscount = state.discount
    const lines = state.lines.filter((_, i) => i !== index)
    if (!await updateState(s => ({ ...s, lines, discount: Math.min(s.discount, Math.max(0, subtotal(lines, catalog) - 1)) }))) return
    setBillSelection(Math.max(0, index - 1))
    setToast({ text: t('productRemoved'), variant: 'danger', undo: () => void updateState(s => {
      if (s.receipts.length !== previousReceiptCount) return s
      const restored = [...s.lines]
      const existing = restored.findIndex(l => l.productId === removed.productId)
      if (existing >= 0) restored[existing] = { ...restored[existing], quantity: restored[existing].quantity + removed.quantity }
      else restored.splice(Math.min(index, restored.length), 0, removed)
      return { ...s, lines: restored, discount: Math.min(Math.max(s.discount, previousDiscount), Math.max(0, subtotal(restored, catalog) - 1)) }
    }) })
  }
  const editLine = (index: number) => { if (state.lines[index].legacyAmount) { setToast({ text: t('legacyAmountDraft'), variant: 'danger' }); return } setBillSelection(index); setQty(String(state.lines[index].quantity / 1000)); setSalePrice(String(state.lines[index].unitPrice ?? findItem(state.lines[index].productId).price)); openDialog('edit') }
  const updateLine = async () => {
    const line = state.lines[billSelection]
    if (!line || line.legacyAmount || busy) return
    const unitPrice = parseMoney(salePrice)
    if (unitPrice === null || unitPrice <= 0) { setModalError(t('invalidAmount')); return }
    const product = findItem(line.productId)
    if (unitPrice < productCost(product)) { warnBelowCost(); setModalError(t('belowCost')); return }
    const parsed = parseQuantity(qty, product.unit)
    if (parsed === null) { setModalError(t('invalidQuantity')); return }
    if (!isService(product) && parsed > stockOf(product)) { setModalError(t('noStock')); return }
    const lines = state.lines.map((l, i) => i === billSelection ? { ...l, quantity: parsed, unitPrice } : l)
    const discount = Math.min(state.discount, Math.max(0, subtotal(lines, catalog) - 1))
    if (!checkBillPricing({ ...state, lines, discount })) return
    if (!await updateState(s => ({ ...s, lines, discount }))) return
    closeDialog()
  }
  const previewSale = () => {
    if (paymentLock.current || state.draftAccountingIssue || legacyDraft) return
    const value = parseMoney(received)
    if (value === null) { setModalError(t('invalidAmount')); return }
    let receipt: Receipt
    try { receipt = makeReceipt(state, value, paymentMethod, state.terminalId ?? 1, checkoutCredit) }
    catch (error) {
      const key: Record<string, CopyKey> = { belowCost: 'belowCost', customer: 'customerRequired', credit: 'invalidAmount', overpayment: 'overpayment', empty: 'emptyError', amount: 'invalidAmount' }
      if ((error as Error).message === 'belowCost') warnBelowCost()
      setModalError(t(key[(error as Error).message] ?? 'invalidAmount')); return
    }
    setActiveReceipt(receipt)
    setReceiptPending(true)
    setJustCompleted(false)
    setDialog('receipt')
    setModalError('')
  }

  const savePendingReceipt = async () => {
    if (!receiptPending) return true
    if (!activeReceipt || paymentLock.current) return false
    const preparedBy = activeReceipt.preparedBy?.trim()
    paymentLock.current = true
    try {
      const receipt = { ...activeReceipt, ...(preparedBy ? { preparedBy } : {}) }
      const saved = await updateState(current => ({ ...current, lines: [], discount: 0, customerId: null, receipts: [...current.receipts, receipt] }))
      if (!saved) return false
      const persisted = saved.receipts.find(item => item.id === receipt.id)
      if (!persisted) { setModalError(t('saveError')); return false }
      setActiveReceipt(persisted)
      setReceiptPending(false)
      setJustCompleted(true)
      setModalError('')
      setQuery('')
      setQuantityProduct(null)
      setToast(null)
      return true
    } finally { paymentLock.current = false }
  }

  const confirmReceipt = async () => {
    if (busy || !await savePendingReceipt()) return
    closeDialog()
    if (receiptPending || justCompleted) { setView('sales'); goSearch() }
  }

  const cancelReceiptPreview = () => {
    if (busy) return
    setReceiptPending(false)
    setActiveReceipt(null)
    openDialog('payment')
  }


  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (dialog || document.querySelector('dialog[open], [role="dialog"]') || !ready || busy || !online || uncertainWrite.current) return
      if (event.key === 'F2') { event.preventDefault(); setView('sales'); setQuery(''); goSearch(); return }
      if (event.key === '?' && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); openDialog('shortcuts'); return }
      if (view !== 'sales') return
      if (event.altKey && event.key.toLowerCase() === 'b') { event.preventDefault(); billRef.current?.focus(); return }
      if (event.altKey && event.key.toLowerCase() === 'c') { event.preventDefault(); openCustomerPicker(); return }
      if (event.key === '+' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); openPayment(); return }
      if (event.key === 'Escape') { event.preventDefault(); setQuery(''); goSearch() }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  })

  useEffect(() => {
    if (dialog === 'customer' && customerOptionsRef.current) {
      const el = customerOptionsRef.current.querySelector<HTMLElement>('[data-highlighted="true"]')
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [customerHighlightIndex, dialog])

  const printReceipt = async () => {
    if (busy) return
    if (dialog === 'receipt' && !await savePendingReceipt()) return
    setBusy(true); setModalError('')
    try {
      await document.fonts.ready
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      window.print()
    } catch { setModalError(t('receiptPrintError')); setSaveStatus('error') }
    finally { setBusy(false) }
  }

  const logout = async () => {
    if (busy) return
    setBusy(true)
    try { await onSignOut() }
    catch { setToast({ text: lang === 'bn' ? 'সাইন আউট করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।' : 'Could not sign out. Check your connection and try again.', variant: 'danger' }) }
    finally { setBusy(false) }
  }

  if (!ready) return <div className="backend-loading" role="status"><PixelMark/><h1>Hisab</h1><p>{backendError || t('loadingData')}</p>{backendError && <><button className="primary-button" onClick={() => void refreshWorkspace()} disabled={busy}>{t('refreshData')}</button><button className="text-button" onClick={() => void logout()} disabled={busy}>{lang === 'bn' ? 'সাইন আউট' : 'Sign out'}<Icon name="logout" size={16}/></button></>}</div>

  return <div ref={motionRoot} className={`app-shell lang-${lang}`}>
    <a className="skip-link" href="#main-content">{t('skipToContent')}</a>
    <aside className="sidebar" aria-label={t('mainNavigation')}>
      <button className="brand-mark" aria-label="Hisab sales counter" onClick={() => setView('sales')}><PixelMark/></button>
      <nav className="side-nav">{views.map((item, index) => <button key={item} className={`nav-button ${view === item ? 'active' : ''}`} onClick={() => setView(item)} aria-label={t(item)} aria-current={view === item ? 'page' : undefined} title={t(item)}><Icon name={item} size={23}/><span>{t(item)}</span><i className="nav-index">0{index + 1}</i></button>)}</nav>
      <div className="side-bottom"><button className="nav-button" onClick={() => openDialog('shortcuts')} title={t('shortcuts')} aria-label={t('shortcuts')}><Icon name="keyboard" size={22}/></button><button className="nav-button" onClick={() => openDialog('settings')} title={t('settings')} aria-label={t('settings')}><Icon name="settings" size={22}/></button><button className="nav-button" onClick={() => void logout()} disabled={busy} title={lang === 'bn' ? 'সাইন আউট' : 'Sign out'} aria-label={lang === 'bn' ? 'সাইন আউট' : 'Sign out'}><Icon name="logout" size={20}/></button><button className="avatar" onClick={() => openDialog('profile')} aria-label={profileCopy.title} title={profileCopy.title}>S</button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="wordmark">hisab<span>.</span></div>
        <span className="top-divider"/>
        <div className="shop-name"><span>Masum</span> <strong>IT</strong> <span>Cottage</span></div>
        <div className="topbar-right">
          <span className={`connection ${!online || saveStatus === 'error' ? 'offline' : saveStatus === 'saving' ? 'saving' : ''}`} role="status"><i/>{t(!online ? 'offline' : saveStatus === 'error' ? 'connectionIssue' : saveStatus === 'saving' ? 'saving' : 'upToDate')}</span>
          <button
            className="theme-toggle-btn"
            onClick={() => setTheme(curr => (curr === 'dark' ? 'light' : 'dark'))}
            aria-label={t('toggleTheme')}
            aria-pressed={theme === 'dark'}
            title={`${t('appearance')}: ${theme === 'dark' ? t('dark') : t('light')}`}
          >
            <Icon key={theme} name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </header>

      {state.draftAccountingIssue && <div className="storage-alert" role="alert">{t('reviewDraftDiscount')}<button onClick={() => { setDiscountInput(''); openDialog('discount') }}>{t('discount')}</button></div>}
      {!!state.accountingIssues?.length && <div className="storage-alert" role="alert">{t('accountingRepairRequired')} ({state.accountingIssues.length})</div>}
      {backendError && <div className="storage-alert" role="alert">{backendError}<button onClick={() => void refreshWorkspace()} disabled={busy}>{t('refreshData')} <Icon name="reset" size={15}/></button></div>}
      <main id="main-content" tabIndex={-1} className="main-content" inert={busy || !online || uncertainWrite.current}>
        <section className="page-heading"><div><div className="eyebrow"><span className="tab-heading-icon"><Icon name={view} size={12}/></span>{t('workspace')}<span className="eyebrow-slash">/</span>0{views.indexOf(view) + 1}</div><h1>{t(view)}<span className="heading-dot">.</span></h1><p>{view === 'sales' ? t('welcome') : t(view === 'inventory' ? 'catalogHint' : view === 'accounts' ? 'balanceHint' : view === 'suppliers' ? 'suppliersHint' : view === 'expenses' ? 'expenseHint' : 'reportHint')}</p></div><div className="heading-right"><span className="today-summary">{t('today')}<strong>৳ {money(todaySales)}</strong><span> / </span>{todayReceipts.length} {t('receiptsToday').toLowerCase()}</span><div className="heading-date">{formatUiDate(now)}</div></div></section>



        {view === 'sales' && <div className="counter-tools">
          <div className="sale-stepper">
            <div className="sale-step-track" aria-hidden="true">
              <span className="sale-step-progress" style={{ transform: `scaleX(${currentSaleStep / 2})` }}/>
              <span className="sale-step-cursor" style={{ transform: `translateX(${currentSaleStep * 50}%)` }}><span className="sale-step-point"/></span>
            </div>
            <ol className="sale-steps" aria-label={t('saleSteps')}>{(['chooseItemStep', 'setQuantityStep', 'paymentStep'] as const).map((step, index) =>
              <li key={step} className={index === currentSaleStep ? 'current' : index < currentSaleStep ? 'done' : ''} aria-current={index === currentSaleStep ? 'step' : undefined}>
                <span className="sale-step-label">{t(step)}</span>
              </li>
            )}</ol>
          </div>
          <button className="secondary-button find-bill-trigger" onClick={openBillFinder}><Icon name="search" size={16}/>{t('findBill')}</button>
        </div>}
        <DeferredContent key={view} lang={lang}>{view === 'sales' ? <div className="checkout-grid">
          <section className="panel catalog-panel" aria-labelledby="products-heading">
            <div className="panel-heading"><div className="section-title"><h2 id="products-heading">{t('products')}</h2><span className="count-badge">{catalog.length}</span></div><span className="panel-heading-meta">{t('available')}</span></div>
            <div className={`search-box ${quantityProduct ? 'subdued' : ''}`}><Icon name="search" size={20}/><input ref={searchRef} aria-label={t('searchLabel')} placeholder={t('search')} value={query} autoComplete="off" spellCheck={false} onChange={e => { setQuery(e.target.value); setQuantityProduct(null); setInputError('') }} onKeyDown={e => {
              if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const next = Math.max(0, Math.min(filtered.length - 1, selected + (e.key === 'ArrowDown' ? 1 : -1))); setSelected(next); productRefs.current[next]?.scrollIntoView({ block: 'nearest' }) }
              if (e.key === 'Enter') {
                e.preventDefault()
                const target = filtered[selected] ?? (() => {
                  const qClean = cleanSearchText(query).trim().replace(/[\s\-]/g, '')
                  return filtered.find(p => {
                    const base = p.groupId ? cleanSearchText(p.groupId.replace(/^grp-\d+-/, '')).replace(/[\s\-]/g, '') : ''
                    return cleanSearchText(p.code).replace(/[\s\-]/g, '') === qClean || base === qClean || getVariants(p).some(v => cleanSearchText(v.code).replace(/[\s\-]/g, '') === qClean)
                  })
                })()
                if (target) chooseProduct(target)
              }
            }}/><kbd>F2</kbd>{query && <button className="icon-button" aria-label={t('clear')} onClick={() => { setQuery(''); goSearch() }}><Icon name="close" size={14}/></button>}</div>
            <div className="category-tabs" aria-label="Product categories">{(['recent', 'all', 'staples', 'fresh', 'household'] as Category[]).map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => { setCategory(c); setQuery(''); goSearch() }}>{t(c)}<span>{c === 'recent' ? recentProducts.length : c === 'all' ? catalog.length : catalog.filter(product => product.category === c).length}</span></button>)}</div>
            <div className="product-table-head"><span>{t('product')}</span><span>{t('referencePrice')}</span></div>
            <div className="product-list" aria-label={t('products')}>
              {filtered.map((p, index) => <button key={p.id} ref={el => { productRefs.current[index] = el }} className={`product-row ${selected === index ? 'selected' : ''} ${quantityProduct?.id === p.id ? 'entering' : ''}`} onClick={() => { setSelected(index); chooseProduct(p) }} onFocus={() => setSelected(index)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const next = Math.max(0, Math.min(filtered.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1))); productRefs.current[next]?.focus() } }}>
                <ProductArt product={p}/><div className="product-info"><strong>{p.en}</strong><span><code>{p.code}</code><i/> {lang === 'en' ? p.detail : p.detailBn}</span></div><div className="product-price"><strong>{p.price ? money(p.price) : '—'}</strong><span>{isMoneyUnit(p.unit) ? '৳ / ৳1' : `৳ / ${unitText(p.unit)}`}</span></div><span className="row-enter">↵</span>
              </button>)}
              {!filtered.length && <div className="empty-state"><Icon name="search" size={30}/><h3>{t('noResults')}</h3><p>{t('noResultsHint')}</p>{query || category !== 'all' ? <button className="text-button" onClick={() => { setQuery(''); setCategory('all'); goSearch() }}>{t('all')}<Icon name="arrow" size={14}/></button> : <button className="text-button" onClick={openProvisionDialog}>{t('provisionItem')}<Icon name="plus" size={14}/></button>}</div>}
            </div>
            <div className={`quantity-lane ${quantityProduct ? 'active' : ''}`}>
              {quantityProduct ? (() => {
                const variants = getSaleVariants(quantityProduct)
                const currentVariant = findItem((selectedVariant ?? variants[0] ?? quantityProduct).id)

                return (
                  <form onSubmit={e => { e.preventDefault(); if (!priceConfirmed) confirmSalePrice(); else void addProduct() }}>
                    <div className="quantity-product-label">
                      <span className="eyebrow">{isMoneyUnit(currentVariant.unit) ? t('amount') : t('qtyFor')} <code>{currentVariant.code}</code></span>
                      <strong>{currentVariant.en}{currentVariant.variantName ? ` · ${currentVariant.variantName}` : ''}</strong>
                    </div>
                    <label className="quantity-field sale-price-field">
                      <span className="sr-only">{t('sellingPriceUnit')}</span>
                      <span>৳</span>
                      <input ref={priceRef} disabled={busy} aria-label={t('sellingPriceUnit')} placeholder={t('sellingPrice')} value={salePrice} inputMode="decimal" aria-invalid={!!inputError} aria-describedby={inputError ? 'qty-error' : undefined}
                        onChange={e => { setSalePrice(e.target.value); setPriceConfirmed(false); setInputError('') }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmSalePrice() } }}/>
                    </label>
                    <label className="quantity-field">
                      <span className="sr-only">{isMoneyUnit(currentVariant.unit) ? t('amount') : t('quantity')}</span>
                      <input
                        ref={qtyRef}
                        disabled={!priceConfirmed || busy}
                        value={qty}
                        onChange={e => { setQty(e.target.value); setInputError('') }}
                        inputMode="decimal"
                        aria-describedby={inputError ? 'qty-error' : undefined}
                        aria-invalid={!!inputError}
                      />
                      <span>{unitText(currentVariant.unit)}</span>
                    </label>
                    <button className="add-button" type="submit" disabled={busy} aria-label={t(priceConfirmed ? 'addItem' : 'quantity')}>
                        <span>{t(priceConfirmed ? 'addItem' : 'quantity')}</span>
                        <Icon name="arrow" size={21}/>
                    </button>
                  </form>
                )
              })() : <div className="quantity-placeholder"><Icon name="keyboard" size={18}/><span>{t('itemHint')}</span></div>}
              {inputError && <p id="qty-error" className="field-error" role="alert">{inputError}</p>}
            </div>
          </section>

          <section className="panel bill-panel" aria-labelledby="bill-heading">
            <div className="panel-heading"><div className="section-title"><h2 id="bill-heading">{t('currentBill')}</h2><span className="count-badge">{state.lines.length}</span></div><span className="bill-number">#{receiptNumber(nextReceiptNumber(state.receipts, state.terminalId ?? 1))}</span></div>
            <div className="bill-customer"><button className="customer-select" onClick={openCustomerPicker} title={`${t('chooseCustomer')} (Alt+C)`}><span className="customer-avatar"><Icon name="accounts" size={18}/></span><span>{customer ? customer[lang] : t('walkIn')}<small>{customer ? customer.phone : t('chooseCustomer')}</small></span><Icon name="down" size={14}/></button><button className="clear-button" onClick={() => openDialog('clear')} disabled={!state.lines.length}>{t('clear')}<Icon name="reset" size={14}/></button></div>
            <div className="bill-table-head"><span>{t('product')}</span><span>{t('quantity')}</span><span>{t('amount')}</span><span/></div>
            <div className="bill-list" ref={billRef} tabIndex={0} aria-label={`${t('currentBill')} · Alt+B`} onKeyDown={e => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setBillSelection(i => Math.max(0, Math.min(state.lines.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))) }
              if (e.key === 'Enter' && state.lines[billSelection]) { e.preventDefault(); editLine(billSelection) }
              if (e.key === 'Delete' && state.lines[billSelection]) { e.preventDefault(); removeLine(billSelection) }
            }}>
              {state.lines.map((line, index) => {
                const p = findItem(line.productId)
                if (!p) return null
                return (
                  <div key={line.productId} data-product-id={line.productId} className={`bill-row ${index === billSelection ? 'bill-selected' : ''}`}>
                    <span className="bill-row-feedback" aria-hidden="true"/>
                    <div className="bill-product"><span className="bill-line-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{p.en}</strong><small>{rateText({ ...p, price: line.unitPrice ?? p.price }, true)}<span>·</span>{lang === 'en' ? p.detail : p.detailBn}</small></div></div>
                    <button className="bill-qty" aria-label={`${t('editQty')}: ${p.en}`} onClick={() => editLine(index)}><FittedQuantity value={line.legacyAmount ? '—' : quantityWithUnit(line.quantity, p.unit)}/></button><strong className="bill-amount">{line.legacyAmount ? '—' : money(lineTotal(line.unitPrice ?? p.price, line.quantity), true)}</strong><button className="remove-line icon-button" aria-label={`${t('remove')}: ${p.en}`} onClick={() => removeLine(index)}><Icon name="close" size={14}/></button>
                  </div>
                )
              })}
              {!state.lines.length && <div className="empty-state bill-empty"><div className="empty-pixel"><PixelMark/></div><h3>{t('emptyBill')}</h3><p>{t('emptyBillHint')}</p><button className="text-button" onClick={goSearch}>{t('findItem')}<Icon name="arrow" size={14}/></button></div>}
              {state.lines.length > 0 && <div className="bill-end"><span/><Icon name="plus" size={13}/><span/></div>}
            </div>
            <div className="bill-summary">{legacyDraft && <p className="field-error" role="alert">{t('legacyAmountDraft')}</p>}<div className="summary-row"><span>{t('subtotal')}<small>{state.lines.length} {t('items')}</small></span><span>{legacyDraft ? '—' : `৳ ${money(billSubtotal, true)}`}</span></div><div className="summary-row"><button className="discount-button" onClick={() => { setDiscountInput(state.discount ? String(state.discount) : ''); openDialog('discount') }} disabled={!state.lines.length}><Icon name="plus" size={13}/>{state.discount ? t('discount') : t('addDiscount')}</button><span>{state.discount ? `− ৳ ${money(state.discount, true)}` : '—'}</span></div><div className="total-row"><div><span>{t('total')}</span><small>BDT</small></div><strong><span>৳</span>{state.draftAccountingIssue || legacyDraft ? '—' : money(billTotal, true)}</strong></div><button className="payment-button" onClick={openPayment} disabled={!state.lines.length || !ready || !!state.draftAccountingIssue || legacyDraft}><span>{t('payment')}</span><span className="payment-button-right"><Icon name="arrow" size={23}/></span></button><div className="payment-caption"><span>{t('paymentHint')}</span></div></div>
          </section>
        </div> : view === 'suppliers' ? <Suppliers state={state} catalog={catalog} lang={lang} now={now} window={reportWindow} onWindow={setReportWindow} purchaseRequest={supplierPurchaseRequest} onPurchaseRequestHandled={() => setSupplierPurchaseRequest(false)} onUpdate={async change => !!await updateState(change)} onVoid={openVoidDialog}/> : view === 'reports' ? <Reports receipts={state.receipts} catalog={catalog} lang={lang} now={now} window={reportWindow} purchases={state.purchases ?? []} supplierPayments={state.supplierPayments ?? []} purchaseSettlements={state.purchaseSettlements ?? []} stockReceivings={state.stockReceivings ?? []} expenses={state.expenses ?? []} returns={state.returns ?? []} transactions={state.transactions ?? []} onWindow={setReportWindow} onReceipt={r => { setActiveReceipt(r); setJustCompleted(false); openDialog('receipt') }} onItem={p => { setActiveReportProduct(p); openDialog('itemStats') }} onCounter={() => setView('sales')}/> : <section className={`secondary-view${view === 'expenses' ? ' expenses-view' : ''}${view === 'inventory' ? ' inventory-view' : ''}${view === 'accounts' ? ' accounts-view' : ''}`} key={view}>
          {view === 'inventory' && <div className="section-toolbar">
            <button className="secondary-button purchase-history-trigger" onClick={() => openDialog('purchases')}><Icon name="clock" size={15}/><span>{t('stockHistory')}</span></button>
            <button className="secondary-button new-item-trigger" onClick={openProvisionDialog}><Icon name="plus" size={15}/><span>{t('provisionItem')}</span></button>
            <button className="provision-trigger" onClick={() => openAddStock()}><Icon name="inventory" size={15}/><span>{t('addStock')}</span></button>
          </div>}
          {view === 'expenses' && <div className="section-toolbar">
            <ReportWindowControl window={expenseWindow} onWindow={setExpenseWindow} now={now} lang={lang} idPrefix="expense"/>
            <button className="primary-button" onClick={openExpenseDialog}><Icon name="plus" size={15}/><span>{t('newExpense')}</span></button>
          </div>}
          {view === 'accounts' && <div className="section-toolbar">
            <div className="table-search">
              <Icon name="search" size={14}/>
              <input type="search" value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} placeholder={t('customerSearchPlaceholder')} aria-label={t('customerSearch')} autoComplete="off" spellCheck={false}/>
              {customerSearchQuery && <button type="button" className="icon-button" onClick={() => setCustomerSearchQuery('')} aria-label={t('clear')}><Icon name="close" size={12}/></button>}
            </div>
            <button className="provision-trigger" onClick={() => openCustomerProvisionDialog()}><Icon name="plus" size={15}/><span>{t('provisionCustomer')}</span></button>
          </div>}
          <div className="metrics-grid">{(view === 'inventory' ? [
            { label: 'variants', value: String(catalog.length), icon: 'inventory' },
            { label: 'stockValue', value: catalog.some(p => !isService(p) && !inventoryValuationReady(p)) ? '—' : `৳ ${roundedTaka(catalog.reduce((s, p) => s + (isService(p) ? 0 : p.inventoryValue ?? 0), 0))}`, icon: 'cash' },
            { label: 'lowStock', value: String(catalog.filter(p => !isService(p) && stockOf(p) < 10000).length), icon: 'reports' },
            { label: 'stockReceivedThisMonth', value: `৳ ${money(stockReceivedThisMonthTotal)}`, icon: 'clock' },
          ] : view === 'expenses' ? [
            { label: 'expenseThisMonth', value: `৳ ${money(expensesThisMonthTotal)}`, icon: 'cash' },
            { label: 'expenseToday', value: `৳ ${money(expensesTodayTotal)}`, icon: 'clock' },
            { label: 'expenseEntries', value: String(expenses.length), icon: 'reports' },
          ] : [
            { label: 'customersLabel', value: String(customerCatalog.length), icon: 'accounts' },
            { label: 'outstanding', value: customerCatalog.some(c => customerBalance(c, state.receipts, state.transactions, state.returns).accountingIssue) ? '—' : `৳ ${money(pendingDue)}`, icon: 'cash' },
            { label: 'totalSales', value: `৳ ${money(state.receipts.reduce((s, r) => s + r.total, 0))}`, icon: 'reports' },
          ]).map(metric => <div className="metric-card" key={metric.label}><div><span className="eyebrow">{t(metric.label as CopyKey)}</span><Icon name={metric.icon}/></div><strong key={metric.value}>{metric.value}</strong></div>)}</div>
          <div className="panel data-panel">
            <div className="panel-heading">
              <div className="section-title">
                <h2>{t(view === 'inventory' ? 'products' : view === 'expenses' ? 'expenseList' : 'customerAccounts')}</h2>
              </div>
              {view === 'inventory' && <div className="table-search">
                <Icon name="search" size={14}/>
                <input type="search" value={inventorySearchQuery} onChange={e => setInventorySearchQuery(e.target.value)} placeholder={t('stockSearch')} aria-label={t('inventorySearchLabel')} autoComplete="off" spellCheck={false}/>
                {inventorySearchQuery && <button type="button" className="icon-button" onClick={() => setInventorySearchQuery('')} aria-label={t('clearSearch')}><Icon name="close" size={12}/></button>}
              </div>}
            </div>
            {view === 'inventory' ? <div className="data-table-wrap">{filteredInventory.length ? <table className="data-table inventory-table"><thead><tr><th>{t('product')}</th><th>{t('code')}</th><th className="numeric-cell">{t('stock')}</th><th className="numeric-cell">{t('cost')}</th><th className="numeric-cell">{t('price')}</th><th className="numeric-cell">{t('margin')}</th><th>{t('status')}</th><th/></tr></thead><tbody>{filteredInventory.map(p => {
              const cost = productCost(p)
              const margin = unitMargin(p)
              const marginPct = unitMarginPercent(p)
              return <tr key={p.id} className={`stock-account-row${p.archived ? ' product-discontinued' : ''}`}>
                <td><div className="inventory-product"><ProductArt product={p}/><span><strong>{p.en}</strong><small>{lang === 'en' ? p.detail : p.detailBn}</small></span></div></td>
                <td><code>{p.code}</code></td>
                <td className="numeric-cell">{isService(p) ? t('noStockTracked') : hoverQuantity(stockOf(p), p.unit)}</td>
                <td className="numeric-cell">{p.cost === undefined ? '—' : <>৳ <span className="hover-digits">{money(cost)}</span></>}</td>
                <td className="numeric-cell">৳ <span className="hover-digits">{money(p.price)}</span></td>
                <td className="numeric-cell">{p.cost === undefined ? '—' : <span className="margin-badge">৳ <span className="hover-digits">{money(margin)}</span> (<span className="hover-digits">{marginPct.toFixed(0)}</span>%)</span>}</td>
                <td><span className={`product-status ${p.archived ? 'discontinued' : 'active'}`} title={p.archived ? t('sellingStoppedHint') : undefined}>{t(p.archived ? 'statusInactive' : 'statusActive')}</span></td>
                <td><span className="row-actions">{!isService(p) && !inventoryValuationReady(p) && <button type="button" className="adjust-row-button" onClick={() => openValuation(p)}>{t('setStockValue')}</button>}{!isService(p) && <button type="button" className="adjust-row-button" onClick={() => openAdjustDialog(p)}>{t('adjustStock')}</button>}{isService(p) && <button type="button" className="adjust-row-button" onClick={() => openEditService(p)}>{t('editService')}</button>}<button type="button" className="archive-item-button" title={p.archived ? undefined : t('sellingStoppedHint')} onClick={() => setProductArchived(p, !p.archived)}>{t(p.archived ? 'actionTurnOn' : 'actionTurnOff')}</button></span></td>
              </tr>
            })}</tbody></table> : <div className="empty-state customer-table-empty"><Icon name="search" size={26}/><h3>{t('noMatchingStock')}</h3><p>{t('noMatchingStockHint')}</p><button type="button" className="text-button" onClick={() => setInventorySearchQuery('')}>{t('showAllItems')}</button></div>}</div> : view === 'expenses' ? <div className="data-table-wrap">{filteredExpenses.length ? <table className="data-table"><thead><tr><th>{t('time')}</th><th>{t('expenseCategory')}</th><th>{t('txNoteLabel')}</th><th>{t('method')}</th><th className="numeric-cell">{t('amount')}</th></tr></thead><tbody>{filteredExpenses.map(expense => <tr key={expense.id} className="expense-account-row">
              <td><small>{formatUiDateTime(expense.createdAt)}</small></td>
              <td><span className={`expense-badge ${expense.category}`}>{t(expense.category)}</span></td>
              <td><small>{expense.note ?? '—'}</small></td>
              <td><span className="expense-method"><Icon name={expense.method} size={13}/>{t(expense.method)}</span></td>
              <td className="numeric-cell"><strong>৳ <span className="hover-digits">{money(expense.amount)}</span></strong></td>
            </tr>)}</tbody></table> : <div className="empty-state" style={{ minHeight: 140, padding: 20 }}><p>{t('noExpenses')}</p></div>}</div> : <div className="data-table-wrap">{filteredAccountCustomers.length ? <table className="data-table"><thead><tr><th>{t('customer')}</th><th>{t('phone')}</th><th>{t('customerAddressLabel')}</th><th className="numeric-cell">{t('totalDue')}</th><th/></tr></thead><tbody>{filteredAccountCustomers.map(c => {
              const b = customerBalance(c, state.receipts, state.transactions, state.returns)
              return <tr
                key={c.id}
                className="customer-account-row clickable-row"
                tabIndex={0}
                onClick={event => {
                  if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return
                  openCustomerProfile(c)
                }}
                onKeyDown={event => {
                  if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openCustomerProfile(c)
                  }
                }}
              >
                <td><strong>{c[lang]}</strong></td>
                <td><code>{c.phone}</code></td>
                <td><span className="customer-address-cell" title={c.address?.trim() || undefined}>{c.address?.trim() || '—'}</span></td>
                <td className="numeric-cell">{b.accountingIssue ? '—' : b.totalDue > 0 ? <strong className="due-amount">৳ <span className="hover-digits">{money(b.totalDue)}</span></strong> : <span className="settled-badge">{t('settled')}</span>}</td>
                <td><button className="icon-button" aria-label={`${t('viewProfile')}: ${c[lang]}`} onClick={() => openCustomerProfile(c)}><Icon name="chevron" size={16}/></button></td>
              </tr>
            })}</tbody></table> : <div className="empty-state customer-table-empty"><Icon name="search" size={26}/><h3>{t('noCustomerFound')}</h3><p>{t('noCustomerFoundHint')}</p>{customerSearchQuery && <button type="button" className="text-button" onClick={() => setCustomerSearchQuery('')}>{t('showAllCustomers')}</button>}</div>}</div>}
            <div className="data-footnote">{t(view === 'inventory' ? 'catalogNote' : view === 'expenses' ? 'expenseNote' : 'accountNote')}</div>
          </div>{view === 'accounts' && <p className="phase-note">{t('cashbookNote')}</p>}
        </section>}</DeferredContent>

      </main>

    </div>

    {toast && <div className={`toast toast--${toast.variant ?? 'success'}${toastExiting ? ' toast-exiting' : ''}`} role="status"
      onMouseEnter={() => setToastHovered(true)} onMouseLeave={() => setToastHovered(false)}
      onFocus={() => setToastFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false) }}>
      <Icon name={toast.variant === 'danger' ? 'close' : 'check'} size={16}/><span>{toast.text}</span>{toast.undo && <button onClick={() => { toast.undo?.(); setToast(null) }}>{t('undo')}</button>}<button className="icon-button" aria-label={t('close')} onClick={() => { setToast(null); setToastHovered(false); setToastFocused(false) }}><Icon name="close" size={13}/></button></div>}

    {dialog && <Modal ref={modalRef} title={dialog === 'profile' ? profileCopy.title : t(dialog === 'payment' ? 'payment' : dialog === 'customer' ? 'chooseCustomer' : dialog === 'discount' ? 'discountTitle' : dialog === 'shortcuts' ? 'shortcuts' : dialog === 'settings' ? 'settings' : dialog === 'clear' ? 'clearTitle' : dialog === 'edit' ? 'editQty' : dialog === 'newItem' ? (editingServiceId ? 'editService' : 'newItem') : dialog === 'addStock' ? 'addStock' : dialog === 'findBill' ? 'findBill' : dialog === 'newCustomer' ? 'newCustomer' : dialog === 'customerProfile' ? 'customerProfile' : dialog === 'addTx' ? 'addTransaction' : dialog === 'itemStats' ? 'itemOverview' : dialog === 'valuation' ? 'setStockValue' : dialog === 'newExpense' ? 'newExpense' : dialog === 'purchases' ? 'stockHistory' : dialog === 'adjustStock' ? 'adjustStock' : dialog === 'voidPurchase' ? 'voidPurchase' : dialog === 'returnItems' ? 'returnItems' : dialog === 'returnSlip' ? 'returnSlip' : 'receipt')} closeLabel={t('close')} onClose={dialog === 'newCustomer' ? cancelCustomerProvision : dialog === 'receipt' && receiptPending ? cancelReceiptPreview : closeDialog} onExited={finishCloseDialog} canClose={!busy} className={`dialog-${dialog}`}>
      {billFinderActive && <div hidden={dialog !== 'findBill'}><FindBill receipts={state.receipts} transactions={state.transactions ?? []} returns={state.returns ?? []} lang={lang}
        onClose={closeDialog} onReceipt={receipt => { setActiveReceipt(receipt); setJustCompleted(false); openDialog('receipt') }}/></div>}
      {dialog === 'addStock' && <><AddStock catalog={catalog} lang={lang} purchases={state.purchases ?? []} receivings={state.stockReceivings ?? []} draft={stockPurchaseDraft} onCreateProduct={createReceivingProduct}
        onSave={recordStockReceiving} onNewInvoice={openNewSupplierInvoice} onClose={closeDialog}/>{modalError && <p className="field-error" role="alert">{modalError}</p>}</>}
      {dialog === 'valuation' && valuationProduct && <form onSubmit={e => { e.preventDefault(); void saveValuation() }}><div className="eyebrow modal-eyebrow">{t('inventory')}</div><h3>{t('setStockValue')}</h3><p className="modal-description">{t('stockValuationHint')}</p><p>{valuationProduct.en} · {quantityWithUnit(stockOf(valuationProduct), valuationProduct.unit)}</p><label className="field-label" htmlFor="opening-stock-value">{t('stockValue')} (৳)</label><input id="opening-stock-value" className="form-input" value={valuationAmount} onChange={e => setValuationAmount(e.target.value)} inputMode="decimal" data-initial-focus required/>{modalError && <p className="field-error" role="alert">{modalError}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={closeDialog}>{t('cancel')}</button><button type="submit" className="primary-button">{t('apply')}</button></div></form>}

      {dialog === 'payment' && <form onSubmit={e => { e.preventDefault(); previewSale() }}>
        <div className="eyebrow modal-eyebrow">{t('counter')}<span> / </span>#{receiptNumber(nextReceiptNumber(state.receipts, state.terminalId ?? 1))}</div>
        <h3>{t('payment')}<span className="heading-dot">.</span></h3>
        <div className="payment-total"><span>{t('total')}</span><strong><small>৳</small>{state.draftAccountingIssue || legacyDraft ? '—' : money(billTotal, true)}</strong><span>{customer ? customer[lang] : t('walkIn')} · {state.lines.length} {t('items')}</span></div>
        {checkoutCredit > 0 && <div className="return-settlement-preview"><div><span>{t('storeCredit')}</span><strong>− ৳ {money(checkoutCredit, true)}</strong></div><div><span>{t('total')}</span><strong>৳ {money(checkoutPayable, true)}</strong></div></div>}
        <div className="payment-methods" aria-label={t('method')}>{(['cash', 'mobile', 'bank'] as const).map(method => <button key={method} type="button" className={method === paymentMethod ? 'active' : ''} onClick={() => { setPaymentMethod(method); setModalError('') }} aria-pressed={method === paymentMethod}><Icon name={method}/>{t(method)}</button>)}</div>
        <div className="payment-input-label"><label htmlFor="received">{t('received')}</label><button type="button" className="text-button" onClick={() => setReceived(String(checkoutPayable))}>{t('exact')}</button></div>
        <div className="money-input"><span>৳</span><input id="received" inputMode="decimal" value={received} onChange={e => { setReceived(e.target.value); setModalError('') }} aria-invalid={!!modalError} aria-describedby={modalError ? 'payment-error' : undefined}/><small>BDT</small></div>
        <div className={`change-row ${paidAmount < checkoutPayable ? 'due' : ''}`}><span>{t(paidAmount < checkoutPayable ? 'due' : 'change')}</span><strong>৳ {money(Math.abs(paidAmount - checkoutPayable), true)}</strong></div>
        {modalError && <p className="field-error" id="payment-error" role="alert">{modalError}</p>}
        <button className="primary-button" type="submit" disabled={busy}><span>{t(busy ? 'completing' : 'complete')}</span></button><p className="dialog-note">{t('paymentNote')}</p>
      </form>}

      {dialog === 'customer' && (() => {
        const isSearchActive = customerQuery.trim().length > 0
        const activeTabCustomers = customerTab === 'recent' ? recentCustomers : customerTab === 'due' ? customersWithDue : customerCatalog.slice(0, 30)
        const displayList = isSearchActive ? matchingCustomers.slice(0, 30) : activeTabCustomers
        const selectableCount = isSearchActive
          ? displayList.length + 1
          : 1 + displayList.length

        const handleCustomerKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCustomerHighlightIndex(i => Math.min(selectableCount - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCustomerHighlightIndex(i => Math.max(0, i - 1))
          } else if (!isSearchActive && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
            const input = e.target as HTMLInputElement
            if (input.selectionStart === 0 && input.selectionEnd === 0) {
              e.preventDefault()
              if (e.key === 'ArrowRight') {
                setCustomerTab(t => t === 'recent' ? 'due' : t === 'due' ? 'all' : 'recent')
              } else {
                setCustomerTab(t => t === 'all' ? 'due' : t === 'due' ? 'recent' : 'all')
              }
              setCustomerHighlightIndex(0)
            }
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (isSearchActive) {
              if (customerHighlightIndex < displayList.length) {
                const c = displayList[customerHighlightIndex]
                if (c) {
                  if (await updateState(s => ({ ...s, customerId: c.id }))) closeDialog()
                }
              } else {
                const q = customerQuery.trim()
                const isDigits = /^\d+$/.test(q.replace(/[\s-+]/g, ''))
                openCustomerProvisionDialog('bill', isDigits ? { phone: q } : { name: q })
              }
            } else {
              if (customerHighlightIndex === 0) {
                if (await updateState(s => ({ ...s, customerId: null }))) closeDialog()
              } else {
                const c = displayList[customerHighlightIndex - 1]
                if (c) {
                  if (await updateState(s => ({ ...s, customerId: c.id }))) closeDialog()
                }
              }
            }
          }
        }

        return (
          <>
            <div className="eyebrow modal-eyebrow">{t('currentBill')} / {t('chooseCustomer').toUpperCase()}</div>
            <div className="customer-modal-header">
              <h3>{t('chooseCustomer')}<span className="heading-dot">.</span></h3>
              <p className="modal-description">{t('customerHint')}</p>
            </div>

            <div className="search-box customer-modal-search">
              <Icon name="search" size={18} />
              <input
                ref={customerSearchInputRef}
                data-initial-focus
                aria-label={t('customerSearch')}
                placeholder={t('customerSearchPlaceholder')}
                value={customerQuery}
                onChange={e => {
                  setCustomerQuery(e.target.value)
                  setCustomerHighlightIndex(0)
                }}
                onKeyDown={handleCustomerKeyDown}
              />
              {customerQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label={t('clear')}
                  onClick={() => {
                    setCustomerQuery('')
                    setCustomerHighlightIndex(0)
                    customerSearchInputRef.current?.focus()
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            {!isSearchActive && (
              <div className="customer-segmented-strip" role="group" aria-label={t('customersLabel')}>
                <button
                  type="button"
                  className={`customer-segment-btn ${customerTab === 'recent' ? 'active' : ''}`}
                  onClick={() => { setCustomerTab('recent'); setCustomerHighlightIndex(0) }}
                  aria-pressed={customerTab === 'recent'}
                >
                  <span>{t('tabRecent')}</span>
                  <span className="segment-count">{recentCustomers.length}</span>
                </button>
                <button
                  type="button"
                  className={`customer-segment-btn ${customerTab === 'due' ? 'active' : ''}`}
                  onClick={() => { setCustomerTab('due'); setCustomerHighlightIndex(0) }}
                  aria-pressed={customerTab === 'due'}
                >
                  <span>{t('tabDue')}</span>
                  <span className="segment-count">{customersWithDue.length}</span>
                </button>
                <button
                  type="button"
                  className={`customer-segment-btn ${customerTab === 'all' ? 'active' : ''}`}
                  onClick={() => { setCustomerTab('all'); setCustomerHighlightIndex(0) }}
                  aria-pressed={customerTab === 'all'}
                >
                  <span>{t('tabAll')}</span>
                  <span className="segment-count">{customerCatalog.length}</span>
                </button>
              </div>
            )}

            {isSearchActive && (
              <div className="customer-search-summary">
                <span className="customer-results-count">
                  <strong>{matchingCustomers.length}</strong> {t('customersLabel')}
                </span>
              </div>
            )}

            <div className="customer-options" ref={customerOptionsRef} tabIndex={-1}>
              {!isSearchActive && (
                <button
                  type="button"
                  className={`customer-option-row walkin-row ${!customer ? 'is-selected' : ''}`}
                  aria-pressed={!customer}
                  data-highlighted={customerHighlightIndex === 0}
                  onClick={async () => { if (await updateState(s => ({ ...s, customerId: null }))) closeDialog() }}
                  onMouseEnter={() => setCustomerHighlightIndex(0)}
                >
                  <span className="customer-picker-avatar" aria-hidden="true"><Icon name="accounts" size={18}/></span>
                  <div className="customer-col-identity">
                    <div className="customer-primary-row">
                      <strong>{t('walkIn')}</strong>
                    </div>
                    <div className="customer-secondary-row">
                      <span className="customer-walkin-note">{t('walkInNote')}</span>
                    </div>
                  </div>
                  <div className="customer-col-ledger">
                    <div className="customer-status-row">
                      {!customer && <span className="customer-selected-icon" aria-label="selected"><Icon name="check" size={15} /></span>}
                    </div>
                  </div>
                </button>
              )}

              {displayList.map((c, idx) => {
                const optionIndex = isSearchActive ? idx : idx + 1
                const isHighlighted = customerHighlightIndex === optionIndex
                const b = customerBalance(c, state.receipts, state.transactions, state.returns)
                const lastSeen = formatLastSeen(customerLastSeenMap.get(c.id))

                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`customer-option-row ${customer?.id === c.id ? 'is-selected' : ''}`}
                    aria-pressed={customer?.id === c.id}
                    data-highlighted={isHighlighted}
                    onClick={async () => { if (await updateState(s => ({ ...s, customerId: c.id }))) closeDialog() }}
                    onMouseEnter={() => setCustomerHighlightIndex(optionIndex)}
                  >
                    <span className="customer-picker-avatar" aria-hidden="true">{c[lang].trim().slice(0, 1)}</span>
                    <div className="customer-col-identity">
                      <div className="customer-primary-row">
                        <strong>{c[lang]}</strong>
                      </div>
                      <div className="customer-secondary-row">
                        <code>{c.phone}</code>
                        {c.address && <span className="customer-address-text">· {c.address}</span>}
                      </div>
                    </div>
                    <div className="customer-col-ledger">
                      <div className="customer-status-row">
                        {b.accountingIssue ? <span className="customer-due-chip">—</span> : b.totalDue > 0 ? (
                          <span className="customer-due-chip" title={`${t('totalDue')}: ৳ ${money(b.totalDue)}`}>
                            <strong>৳ {money(b.totalDue)}</strong> <small>{t('dueLabel')}</small>
                          </span>
                        ) : b.storeCredit > 0 ? (
                          <span className="customer-credit-chip" title={`${t('storeCredit')}: ৳ ${money(b.storeCredit)}`}>
                            <strong>৳ {money(b.storeCredit)}</strong> <small>{t('creditLabel')}</small>
                          </span>
                        ) : (
                          <span className="customer-settled-tag">{t('settledTag')}</span>
                        )}
                        {customer?.id === c.id && <span className="customer-selected-icon" aria-label="selected"><Icon name="check" size={15} /></span>}
                      </div>
                      <div className="customer-activity-row">
                        {lastSeen ? (
                          <span className="customer-timestamp" title={`${t('lastSeen')}: ${lastSeen}`}>
                            <Icon name="history" size={10} />
                            <span>{lastSeen}</span>
                          </span>
                        ) : (
                          <span className="customer-timestamp-placeholder">—</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}

              {!isSearchActive && customerTab === 'recent' && !recentCustomers.length && (
                <div className="empty-state customer-search-empty">
                  <p>{t('noRecentCustomers')}</p>
                </div>
              )}

              {!isSearchActive && customerTab === 'due' && !customersWithDue.length && (
                <div className="empty-state customer-search-empty">
                  <p>{t('noDueCustomers')}</p>
                </div>
              )}

              {!isSearchActive && customerTab === 'all' && customerCatalog.length > 30 && (
                <div className="customer-list-capped-note">
                  {t('showingTopCustomers')
                    .replace('{count}', '30')
                    .replace('{total}', String(customerCatalog.length))}
                </div>
              )}

              {isSearchActive && !matchingCustomers.length && (
                <div className="empty-state customer-search-empty">
                  <Icon name="search" size={24}/><p>{t('noCustomerFound')}</p><span>{t('noCustomerFoundHint')}</span>
                </div>
              )}

              {isSearchActive && (
                <button
                  type="button"
                  className="customer-quick-add-row"
                  data-highlighted={customerHighlightIndex === displayList.length}
                  onClick={() => {
                    const q = customerQuery.trim()
                    const isDigits = /^\d+$/.test(q.replace(/[\s-+]/g, ''))
                    openCustomerProvisionDialog('bill', isDigits ? { phone: q } : { name: q })
                  }}
                  onMouseEnter={() => setCustomerHighlightIndex(displayList.length)}
                >
                  <span className="quick-add-icon"><Icon name="plus" size={13} /></span>
                  <span className="quick-add-text">
                    {t('quickAddCustomer')}: <strong>"{customerQuery.trim()}"</strong>
                  </span>
                  <kbd>↵</kbd>
                </button>
              )}
            </div>

            <div className="customer-modal-footer">
              <button
                type="button"
                className="primary-button customer-create-button-footer"
                onClick={() => openCustomerProvisionDialog('bill')}
              >
                <Icon name="plus" size={13} />
                <span>{t('provisionCustomer')}</span>
              </button>
            </div>
          </>
        )
      })()}

      {dialog === 'discount' && <form onSubmit={async e => { e.preventDefault(); const value = parseMoney(discountInput); if (value === null) { setModalError(t('invalidAmount')); return } if (value > 0 && value >= billSubtotal) { setModalError(t('discountInvalid')); return } if (!checkBillPricing({ ...state, discount: value })) return; if (await updateState(s => ({ ...s, discount: value }), { confirmDraft: true })) closeDialog() }}><div className="eyebrow modal-eyebrow">{t('currentBill')}</div><h3>{t('discountTitle')}<span className="heading-dot">.</span></h3><p className="modal-description">{t('discountHint')}</p><label className="field-label" htmlFor="discount">{t('discount')} · BDT</label><div className="money-input"><span>৳</span><input id="discount" value={discountInput} onChange={e => { setDiscountInput(e.target.value); setModalError('') }} inputMode="decimal" placeholder="0.00"/></div>{modalError && <p className="field-error" role="alert">{modalError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button><button className="primary-button" type="submit">{t('apply')}<kbd>↵</kbd></button></div></form>}

      {dialog === 'edit' && state.lines[billSelection] && (() => {
        const editProduct = findItem(state.lines[billSelection].productId)
        return <form onSubmit={e => { e.preventDefault(); updateLine() }}><div className="eyebrow modal-eyebrow">{t('editQty')}</div><h3>{editProduct.en}<span className="heading-dot">.</span></h3><label className="field-label" htmlFor="edit-price">{t('sellingPriceUnit')} · ৳</label><input id="edit-price" className="form-input" data-initial-focus inputMode="decimal" value={salePrice} onChange={e => { setSalePrice(e.target.value); setModalError('') }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('edit-qty')?.focus() } }}/><label className="field-label" htmlFor="edit-qty">{isMoneyUnit(editProduct.unit) ? t('amount') : t('quantity')} · {unitText(editProduct.unit)}</label><div className="money-input">{isMoneyUnit(editProduct.unit) && <span>৳</span>}<input id="edit-qty" inputMode="decimal" value={qty} onChange={e => { setQty(e.target.value); setModalError('') }}/></div>{modalError && <p className="field-error" role="alert">{modalError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button><button className="primary-button" type="submit">{t('saveQty')}<kbd>↵</kbd></button></div></form>
      })()}

      {dialog === 'clear' && <><div className="eyebrow modal-eyebrow">{t('currentBill')}</div><h3>{t('clearTitle')}</h3><p className="modal-description">{t('clearHint')}</p><div className="dialog-actions"><button className="secondary-button" data-initial-focus onClick={closeDialog}>{t('cancel')}</button><button className="primary-button" onClick={async () => { if (await updateState(s => ({ ...s, lines: [], discount: 0, customerId: null }))) { closeDialog(); goSearch() } }}>{t('confirmClear')}</button></div></>}

      {dialog === 'shortcuts' && <><div className="eyebrow modal-eyebrow"><Icon name="keyboard" size={17}/> HISAB / SHORTCUTS</div><h3>{t('shortcutTitle')}</h3><p className="modal-description">{t('shortcutHint')}</p><div className="shortcut-guide">{([['F2', 'focusSearch'], ['Alt + C', 'pickCustomerShortcut'], ['↑  ↓', 'navigate'], ['Enter', 'select'], ['+', 'openPayment'], ['Alt + B', 'billFocus'], ['Enter', 'editBill'], ['Delete', 'removeBill'], ['Esc', 'closeDialog'], ['?', 'showHelp']] as [string, CopyKey][]).map(([key, label]) => <div key={label}><span>{t(label)}</span><kbd>{key}</kbd></div>)}</div><p className="dialog-note">{t('shortcutsNote')}</p></>}

      {dialog === 'settings' && <><div className="eyebrow modal-eyebrow">HISAB / SETTINGS</div><h3>{t('settings')}<span className="heading-dot">.</span></h3><p className="modal-description">{t('settingsHint')}</p>
        <div className="setting-row"><span>{t('language')}</span><div className="setting-language"><button className="language-toggle mobile-settings-language-toggle" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')} aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}><span className={lang === 'en' ? 'selected' : ''}>EN</span><span className="toggle-line"/><span className={lang === 'bn' ? 'selected' : ''}>বাং</span></button><div className="desktop-settings-language"><button onClick={() => setLang('en')} className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'}>English</button><button onClick={() => setLang('bn')} className={lang === 'bn' ? 'active' : ''} aria-pressed={lang === 'bn'}>বাংলা</button></div></div></div>
        <div className="setting-row"><span>{t('appearance')}</span><div className="setting-language"><button onClick={() => setTheme('light')} className={theme === 'light' ? 'active' : ''} aria-pressed={theme === 'light'}>{t('light')}</button><button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'active' : ''} aria-pressed={theme === 'dark'}>{t('dark')}</button></div></div>
        <div className="setting-row"><div><label htmlFor="terminal-number">{t('terminalNumber')}</label><small id="terminal-number-hint" style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{t('terminalHint')}</small></div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input id="terminal-number" aria-describedby="terminal-number-hint" type="number" min={1} max={999} className="form-input" style={{ width: 80, padding: '4px 8px', textAlign: 'center', fontWeight: 600 }} value={state.terminalId ?? 1} onChange={e => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) updateTerminalId(val) }}/></div></div><p className="dialog-note">{t('version')}</p></>}

      {dialog === 'profile' && <><div className="eyebrow modal-eyebrow">HISAB / SHOP PROFILE</div><div className="profile-heading"><div className="profile-avatar-large">S</div><div><h3>{profileCopy.title}<span className="heading-dot">.</span></h3><p>{profileCopy.hint}</p></div></div><div className="profile-details"><div><span>{profileCopy.shopName}</span><strong>Masum IT Cottage</strong></div><div><span>{profileCopy.businessType}</span><strong>{profileCopy.shop}</strong></div><div><span>{profileCopy.owner}</span><strong>{profileCopy.ownerValue}</strong></div><div><span>{profileCopy.location}</span><strong>{profileCopy.locationValue}</strong></div></div><div className="profile-stats"><div><strong>{catalog.length}</strong><span>{profileCopy.items}</span></div><div><strong>{customerCatalog.length}</strong><span>{profileCopy.customers}</span></div><div><strong>{state.receipts.length}</strong><span>{profileCopy.sales}</span></div></div><p className="dialog-note">{profileCopy.note}</p></>}

      {dialog === 'newItem' && <form onSubmit={e => { e.preventDefault(); createProduct() }}><div className="eyebrow modal-eyebrow">{t('workspace')}<span> / </span>{t('inventory')}</div><h3>{t(editingServiceId ? 'editService' : 'newItem')}<span className="heading-dot">.</span></h3><p className="modal-description">{t(editingServiceId ? 'editServiceHint' : 'newItemHint')}</p>
        {!editingServiceId && <div className="provision-options">
        <div className="provision-type-switcher" role="group" aria-label={t('itemType')}>
          <button
            type="button"
            className={`provision-type-btn ${newKind === 'product' ? 'active' : ''}`}
            aria-pressed={newKind === 'product'}
            onClick={() => { setNewKind('product'); setModalError('') }}
          >
            <Icon name="inventory" size={15}/>
            <span>{t('physicalProduct')}</span>
          </button>
          <button
            type="button"
            className={`provision-type-btn ${newKind === 'service' ? 'active' : ''}`}
            aria-pressed={newKind === 'service'}
            onClick={() => { setNewKind('service'); setNewCategory('fresh'); setNewUnit('pc'); setNewCost(''); setModalError('') }}
          >
            <Icon name="settings" size={15}/>
            <span>{t('serviceItem')}</span>
          </button>
        </div>
        {newKind === 'service' && <p className="modal-description">{t('serviceItemHint')}</p>}
        </div>}

        {newKind === 'product' && <p className="dialog-note provision-note">{st('productDetailsOnly')}</p>}
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="item-code">{t('code')} *</label>
            <input id="item-code" className="form-input" value={newCode} onChange={e => {
              setNewCode(e.target.value); setModalError('')
            }} placeholder="e.g. 101" data-initial-focus={editingServiceId ? undefined : true} readOnly={!!editingServiceId} required/>
            {!editingServiceId && catalog.some(p => p.code.toLowerCase() === newCode.trim().toLowerCase()) &&
              <small className="field-error">{t('codeExists')}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="item-category">{t('categoryLabel')}</label>
            <select id="item-category" className="form-input" value={newCategory} onChange={e => setNewCategory(e.target.value as Exclude<Category, 'all' | 'recent'>)}>
              <option value="staples">{t('staples')}</option>
              <option value="fresh">{t('fresh')}</option>
              <option value="household">{t('household')}</option>
            </select>
          </div>
          <div className="form-group span-2">
            <label htmlFor="item-name-en">{t('productNameEn')} *</label>
            <input id="item-name-en" className="form-input" data-initial-focus={editingServiceId ? true : undefined} value={newNameEn} onChange={e => { setNewNameEn(e.target.value); setModalError('') }} placeholder={newKind === 'service' ? "e.g. Windows Setup & Driver Install" : "e.g. USB Optical Mouse"} required/>
          </div>
          <div className="form-group span-2">
              <label htmlFor="item-detail">{t('productDetail')}</label>
              <input id="item-detail" className="form-input" value={newDetail} onChange={e => setNewDetail(e.target.value)} placeholder={newKind === 'service' ? "e.g. OS install + Drivers + Office" : "e.g. 1000 DPI · 1.5m wire"}/>
          </div>
          <div className="form-group span-2">
            <label htmlFor="item-warranty">{t('warranty')}</label>
            <input id="item-warranty" className="form-input" value={newWarranty} onChange={e => setNewWarranty(e.target.value)} maxLength={100} placeholder={t('warrantyPlaceholder')}/>
            <small>{t('warrantyHint')}</small>
          </div>
          <div className="form-group span-2">
            <label htmlFor="item-unit">{t('unitLabel')}</label>
            <select id="item-unit" className="form-input" disabled={!!editingServiceId} value={newUnit} onChange={e => { setNewUnit(e.target.value as Product['unit']);  }}>
              <option value="pc">pc</option>

            </select>
          </div>
          <>
              {newKind === 'service' && <div className="form-group span-2 provision-price-field">
                <label htmlFor="item-cost">{t('directServiceCost')} (৳)</label>
                <input id="item-cost" className="form-input" inputMode="decimal" value={newCost} onChange={e => { setNewCost(e.target.value); setModalError('') }} placeholder={newKind === 'service' ? "e.g. 100.00" : "e.g. 2400.00"} />
              </div>}
              <div className="form-group span-2 provision-price-field">
                <label htmlFor="item-price">{t('sellingPriceUnit')} (৳) · {t('optional')}</label>
                <input id="item-price" className="form-input" inputMode="decimal" value={newPrice} onChange={e => { setNewPrice(e.target.value); setModalError('') }} placeholder={t('optional')}/>
              </div>
          </>
        </div>

        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button>
          <button className="primary-button" type="submit">{t('saveItem')}<kbd>↵</kbd></button>
        </div>
      </form>}

      {dialog === 'newCustomer' && <form onSubmit={e => { e.preventDefault(); createCustomer() }}><div className="eyebrow modal-eyebrow">{customerCreationSource === 'bill' ? t('currentBill') : <>{t('workspace')}<span> / </span>{t('accounts')}</>}</div><h3>{t('newCustomer')}<span className="heading-dot">.</span></h3><p className="modal-description">{t('newCustomerHint')}</p>
        <div className="form-grid">
          <div className="form-group span-2">
            <label htmlFor="cust-name-en">{t('customerNameEn')} *</label>
            <input id="cust-name-en" className="form-input" value={newCustEn} onChange={e => { setNewCustEn(e.target.value); setModalError('') }} placeholder="e.g. Rafiqul Islam" autoFocus required/>
          </div>
          <div className="form-group span-2">
            <label htmlFor="cust-name-bn">{t('customerNameBn')}</label>
            <input id="cust-name-bn" className="form-input" value={newCustBn} onChange={e => setNewCustBn(e.target.value)} placeholder="e.g. রফিকুল ইসলাম"/>
          </div>
          <div className="form-group span-2">
            <label htmlFor="cust-phone">{t('customerPhone')} *</label>
            <input id="cust-phone" className="form-input" type="tel" autoComplete="tel" value={newCustPhone} onChange={e => { setNewCustPhone(e.target.value); setModalError('') }} placeholder="01700000000" required/>
          </div>
          <div className="form-group span-2">
            <label htmlFor="cust-address">{t('customerAddress')}</label>
            <input id="cust-address" className="form-input" value={newCustAddress} onChange={e => setNewCustAddress(e.target.value)} placeholder="e.g. Mirpur, Dhaka" maxLength={160}/>
          </div>
          <div className="form-group">
            <label htmlFor="cust-opening">{t('openingBalance')} (৳)</label>
            <input id="cust-opening" className="form-input" inputMode="decimal" value={newCustOpeningDue} onChange={e => setNewCustOpeningDue(e.target.value)} placeholder="0.00"/>
          </div>
        </div>
        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={cancelCustomerProvision}>{t('cancel')}</button>
          <button className="primary-button" type="submit">{t('saveCustomer')}<kbd>↵</kbd></button>
        </div>
      </form>}

      {dialog === 'customerProfile' && activeCustomer && (() => {
        const bal = customerBalance(activeCustomer, state.receipts, state.transactions, state.returns)
        const ledger = customerHistory(activeCustomer.id, state.receipts, state.transactions, state.returns)
        const downloadHistory = async () => {
          const amount = (value: number) => `৳ ${money(value)}`
          const typeLabel = (tx: CustomerHistoryEntry) => tx.type === 'sale'
            ? (tx.due > 0 ? t('txSaleWithDue') : t('txSalePaid'))
            : tx.type === 'sale_due' ? t('txSaleDue')
              : tx.type === 'payment' ? t('txPayment') : t('txAdjustment')
          try {
            await downloadCustomerHistoryPdf({
              fileName: `hisab-${activeCustomer.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer'}-transactions-${dayKey(now)}`,
              generatedAt: formatUiDateTime(now),
              subject: activeCustomer[lang].trim() || activeCustomer.en,
              scope: lang === 'bn' ? 'সব সময় · সাম্প্রতিক আগে · টাকা: BDT (৳)' : 'All time · Newest first · Currency: BDT (৳)',
              notice: bal.accountingIssue ? (lang === 'bn' ? 'পুরোনো হিসাব যাচাই প্রয়োজন। বকেয়া ও ক্রেডিট নিশ্চিত নয়।' : 'Historical accounting needs review. Due and credit balances are unconfirmed.') : undefined,
              details: [
                { label: t('customerNameEn'), value: activeCustomer.en },
                { label: t('customerNameBn'), value: activeCustomer.bn.trim() || t('notProvided') },
                { label: t('customerPhone'), value: activeCustomer.phone.trim() || t('notProvided') },
                { label: t('customerAddressLabel'), value: activeCustomer.address?.trim() || t('notProvided') },
                { label: t('openingBalance'), value: amount(activeCustomer.openingBalance ?? 0) },
                { label: t('txNoteLabel'), value: activeCustomer.note?.trim() || t('notProvided') },
              ],
              balances: [
                { label: t('totalDue'), value: bal.accountingIssue ? '—' : amount(bal.totalDue), tone: bal.totalDue > 0 ? 'danger' : 'positive' },
                { label: t('storeCredit'), value: bal.accountingIssue ? '—' : amount(bal.storeCredit), tone: bal.storeCredit > 0 ? 'positive' : 'neutral' },
                { label: lang === 'bn' ? 'লেনদেনের সংখ্যা' : 'Transactions', value: String(ledger.length), tone: 'neutral' },
              ],
              transactions: [...ledger].reverse().map(tx => {
                const createdAt = new Date(tx.createdAt)
                return {
                  date: formatUiDateTime(createdAt),
                  type: typeLabel(tx),
                  amount: amount(tx.amount),
                  settlement: tx.type === 'sale' ? `${t('paid')}: ${amount(tx.paid)} / ${t('dueLabel')}: ${amount(tx.due)}` : undefined,
                  details: tx.note?.trim() || '—',
                  tone: tx.type === 'sale'
                    ? (tx.due > 0 ? 'warning' : 'positive')
                    : tx.type === 'payment' ? 'positive'
                      : tx.amount < 0 ? 'positive' : 'neutral',
                }
              }),
              labels: {
                title: t('historyPdfTitle'), generated: t('generatedAt'), customerDetails: t('customerDetails'),
                transactionHistory: t('txHistory'), date: t('time'), type: t('typeLabel'), amount: t('amount'),
                details: t('txNoteLabel'), noTransactions: t('noTx'), page: t('page'),
              },
            })
            setToast({ text: t('historyPdfDownloaded') })
          } catch {
            setToast({ text: t('historyPdfError'), variant: 'danger' })
          }
        }
        return <>
          <div className="eyebrow modal-eyebrow">{t('accounts')}<span> / </span>{t('customerProfile')}</div>
          <div className="customer-profile-header">
            <div className="customer-profile-info">
              <h3>{activeCustomer[lang]}<span className="heading-dot">.</span></h3>
            </div>
          </div>

          <div className="customer-profile-layout">
          <div className="customer-profile-overview">
          <div className="profile-details customer-profile-details">
            <div><span>{t('customerNameEn')}</span><strong>{activeCustomer.en}</strong></div>
            <div><span>{t('customerNameBn')}</span><strong>{activeCustomer.bn.trim() || t('notProvided')}</strong></div>
            <div><span>{t('customerPhone')}</span><strong>{activeCustomer.phone.trim() || t('notProvided')}</strong></div>
            <div><span>{t('customerAddressLabel')}</span><strong>{activeCustomer.address?.trim() || t('notProvided')}</strong></div>
            <div><span>{t('openingBalance')}</span><strong>৳ {money(activeCustomer.openingBalance ?? 0)}</strong></div>
            <div className="customer-profile-note"><span>{t('txNoteLabel')}</span><strong>{activeCustomer.note?.trim() || t('notProvided')}</strong></div>
          </div>

          {bal.accountingIssue && <p className="field-error" role="alert">{t('accountingRepairRequired')}</p>}
          <div className="customer-stats-grid">
            <div className={`customer-stat-card ${bal.totalDue > 0 ? 'due' : ''}`}>
              <span>{t('totalDue')}</span>
              <strong>{bal.accountingIssue ? '—' : `৳ ${money(bal.totalDue)}`}</strong>
            </div>
            {!bal.accountingIssue && bal.storeCredit > 0 && <div className="customer-stat-card credit"><span>{t('storeCredit')}</span><strong>৳ {money(bal.storeCredit)}</strong></div>}
          </div>

          <div className="tx-action-bar">
            <button type="button" onClick={() => openAddTransaction('payment')}><Icon name="cash" size={14}/><span>{t('recordPayment')}</span></button>
            <button type="button" onClick={() => openAddTransaction('credit_adjust')}><Icon name="reset" size={14}/><span>{t('recordAdjustment')}</span></button>
          </div>

          </div>
          <section className="customer-profile-history" aria-label={t('txHistory')}>
          <div className="panel-heading tx-history-heading" style={{ height: 38, padding: '0 4px', borderBottom: 'none' }}>
            <div className="section-title">
              <h2 style={{ fontSize: 13 }}>{t('txHistory')}</h2>
              <span className="count-badge">{ledger.length}</span>
            </div>
            <button type="button" className="secondary-button customer-history-download" onClick={() => void downloadHistory()} aria-label={t('downloadHistoryPdf')}>
              <Icon name="download" size={14}/><span>{t('downloadHistoryPdf')}</span>
            </button>
          </div>

          <div className="tx-table-wrap">
            {ledger.length ? <table className="tx-table">
              <thead>
                <tr>
                  <th>{t('time')}</th>
                  <th>{t('typeLabel')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('txNoteLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {[...ledger].reverse().map(tx => (
                  <tr key={tx.id}>
                    <td><small>{formatUiDateTime(tx.createdAt)}</small></td>
                    <td><span className={`tx-badge ${tx.type === 'sale' ? (tx.due > 0 ? 'sale_due' : 'payment') : tx.type}${tx.amount < 0 ? ' negative' : ''}`}>{tx.type === 'sale' ? (tx.due > 0 ? t('txSaleWithDue') : t('txSalePaid')) : tx.type === 'sale_due' ? t('txSaleDue') : tx.type === 'payment' ? t('txPayment') : t('txAdjustment')}</span></td>
                    <td><strong>৳ {money(tx.amount)}</strong>{tx.type === 'sale' && <small className="tx-sale-summary">{t('paid')}: ৳ {money(tx.paid)} · {t('due')}: ৳ {money(tx.due)}</small>}</td>
                    <td><small>{tx.note ?? '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table> : <div className="empty-state" style={{ minHeight: 120, padding: 20 }}><p>{t('noTx')}</p></div>}
          </div>

          </section>
          </div>

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={closeDialog}>{t('close')}</button>
          </div>
        </>
      })()}

      {dialog === 'itemStats' && activeReportProduct && (() => {
        const p = activeReportProduct
        const performance = itemPerformance(catalog, windowReceipts, filterByWindow(state.returns ?? [], reportWindow, now), state.receipts).find(item => item.key === (p.groupId ?? p.id))
        const variants = [...getVariants(p)]
        for (const variant of performance?.variants ?? []) if (!variants.some(v => v.id === variant.id)) variants.push(variant)
        for (const receipt of windowReceipts) for (const line of receipt.lines) {
          if ((line.product.groupId ?? line.product.id) === (p.groupId ?? p.id) && !variants.some(v => v.id === line.productId)) variants.push(line.product)
        }
        const hasVariants = variants.length > 1
        const cost = productCost(p)
        const margin = unitMargin(p)
        const marginPct = unitMarginPercent(p)

        const totalSoldQuantities = new Map((performance?.quantities ?? []).map(q => [q.unit, q.quantity]))
        const totalRevenue = performance?.revenue ?? 0
        const totalProfit = performance?.profit ?? 0
        const amountsKnown = performance?.amountsKnown ?? true
        const costKnown = performance?.costKnown ?? true
        const variantStatsMap = new Map((performance?.variantStats ?? []).map(v => [v.product.id, { ...v, quantities: new Map(v.quantities.map(q => [q.unit, q.quantity])) }]))
        const itemSales = (performance?.activity ?? []).map(event => ({ ...event, total: event.revenue, time: event.createdAt,
          customerName: event.receipt ? event.receipt.customer?.[lang] ?? t('walkIn') : t('notProvided') }))
        const coPurchaseMap = new Map<string, { product: Product; count: number }>()
        for (const r of windowReceipts) {
          if (!reportLines(r).some(l => variants.some(v => v.id === l.productId))) continue
          for (const otherLine of r.lines) if (!variants.some(v => v.id === otherLine.productId)) {
            const current = coPurchaseMap.get(otherLine.productId) ?? { product: otherLine.product, count: 0 }
            current.count++
            coPurchaseMap.set(otherLine.productId, current)
          }
        }

        const topCoPurchases = Array.from(coPurchaseMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)

        return <>
          <div className="eyebrow modal-eyebrow">{t('reports')}<span> / </span>{t('itemOverview')} · {reportsTranslator(lang)(reportWindowMode(reportWindow))}</div>
          <div className="customer-profile-header">
            <div className="item-profile-art"><ProductArt product={p}/></div>
            <div className="customer-profile-info">
              <h3>{p.en}<span className="heading-dot">.</span></h3>
              <p>
                <code>{p.code}</code> · {hasVariants ? `${variants.length} ${t('variants')}` : (lang === 'en' ? p.detail : p.detailBn)}
                {!hasVariants && ` · ${rateText(p)}`}
              </p>
            </div>
          </div>

          <div className="customer-stats-grid">
            <div className="customer-stat-card">
              <span>{t('unitsSold')}</span>
              <strong>{performance?.quantitiesKnown === false ? '—' : totalSoldQuantities.size ? [...totalSoldQuantities].map(([unit, quantity]) => quantityWithUnit(quantity, unit)).join(' / ') : '—'}</strong>
            </div>
            <div className="customer-stat-card">
              <span>{reportsTranslator(lang)('netRevenue')}</span>
              <strong>{amountsKnown ? `৳ ${money(totalRevenue)}` : '—'}</strong>
            </div>
            <div className="customer-stat-card credit">
              <span>{reportsTranslator(lang)('grossProfit')}</span>
              <strong className={totalProfit < 0 ? 'report-loss' : undefined}>{amountsKnown && costKnown ? `৳ ${money(totalProfit)}` : '—'}</strong>
            </div>
          </div>

          {!hasVariants ? (
            <div className="item-detail-cards-grid">
              <div className="item-detail-subcard">
                <span className="eyebrow">{t('cost')}</span>
                <strong>{p.cost === undefined ? '—' : `৳ ${money(cost)} / ${isMoneyUnit(p.unit) ? '৳1' : unitText(p.unit)}`}</strong>
              </div>
              <div className="item-detail-subcard">
                <span className="eyebrow">{t('sellingPrice')}</span>
                <strong>{rateText(p)}</strong>
              </div>
              <div className="item-detail-subcard">
                <span className="eyebrow">{t('unitMargin')}</span>
                <strong className="profit-text">{p.cost === undefined ? '—' : `৳ ${money(margin)} (${marginPct.toFixed(0)}%)`}</strong>
              </div>
              <div className="item-detail-subcard">
                <span className="eyebrow">{t('stock')}</span>
                <strong>{isService(p) ? t('noStockTracked') : quantityWithUnit(stockOf(p), p.unit)}</strong>
              </div>
            </div>
          ) : (
            <div className="variant-table-wrap">
              <div className="panel-heading" style={{ height: 32, padding: '0 12px', borderBottom: 'none' }}>
                <div className="section-title">
                  <span className="section-number">VAR</span>
                  <h2 style={{ fontSize: 11 }}>{t('variantBreakdown')}</h2>
                </div>
              </div>
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>{t('variant')}</th>
                    <th>{t('cost')}</th>
                    <th>{t('price')}</th>
                    <th>{t('stock')}</th>
                    <th>{t('unitsSold')}</th>
                    <th>{reportsTranslator(lang)('netRevenue')}</th>
                    <th>{reportsTranslator(lang)('grossProfit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map(v => {
                    const vStat = variantStatsMap.get(v.id)
                    const vCost = productCost(v)
                    const vMargin = unitMargin(v)
                    const vMarginPct = unitMarginPercent(v)
                    return (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.variantName ?? v.detail}</strong>
                          <br/><small style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{v.code}</small>
                        </td>
                        <td>{isService(v) && v.cost === undefined ? '—' : `৳ ${money(vCost)}`}</td>
                        <td>৳ {money(v.price)}</td>
                        <td>{isService(v) ? t('noStockTracked') : quantityWithUnit(stockOf(v), v.unit)}</td>
                        <td><strong>{vStat?.quantitiesKnown === false ? '—' : vStat?.quantities.size ? [...vStat.quantities].map(([unit, quantity]) => quantityWithUnit(quantity, unit)).join(' / ') : '—'}</strong></td>
                        <td>{vStat?.amountsKnown !== false ? `৳ ${money(vStat?.revenue ?? 0)}` : '—'}</td>
                        <td><span className="profit-text">{vStat?.costKnown === false || vStat?.amountsKnown === false ? '—' : `৳ ${money(vStat?.profit ?? 0)}`}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {topCoPurchases.length > 0 && <div className="co-purchase-section">
            <span className="eyebrow" style={{ marginBottom: 8 }}>{t('frequencyBought')}</span>
            <div className="co-purchase-chips">
              {topCoPurchases.map(cp => (
                <span key={cp.product.id} className="co-purchase-chip">
                  <ProductArt product={cp.product}/>
                  <span>{cp.product.en}</span>
                  <small>×{cp.count}</small>
                </span>
              ))}
            </div>
          </div>}

          <div className="panel-heading" style={{ height: 38, padding: '0 4px', borderBottom: 'none', marginTop: 14 }}>
            <div className="section-title">
              <span className="section-number">HIST</span>
              <h2 style={{ fontSize: 13 }}>{t('itemHistory')} ({itemSales.length})</h2>
            </div>
          </div>

          <div className="tx-table-wrap">
            {itemSales.length ? <table className="tx-table">
              <thead>
                <tr>
                  <th>{t('transaction')}</th>
                  <th>{t('time')}</th>
                  <th>{t('customer')}</th>
                  {hasVariants && <th>{t('variant')}</th>}
                  <th>{t('quantity')}</th>
                  <th>{reportsTranslator(lang)('netRevenue')}</th>
                  <th>{reportsTranslator(lang)('grossProfit')}</th>
                </tr>
              </thead>
              <tbody>
                {[...itemSales].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).map(sale => (
                  <tr
                    key={sale.id}
                    className={sale.receipt ? 'clickable-row' : undefined}
                    tabIndex={sale.receipt ? 0 : undefined}
                    onClick={sale.receipt ? event => {
                      if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return
                      setActiveReceipt(sale.receipt!)
                      setJustCompleted(false)
                      openDialog('receipt')
                    } : undefined}
                    onKeyDown={sale.receipt ? event => {
                      if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setActiveReceipt(sale.receipt!)
                        setJustCompleted(false)
                        openDialog('receipt')
                      }
                    } : undefined}
                  >
                    <td><button className="report-bill-link" disabled={!sale.receipt} aria-label={`${t('viewReceipt')} #${receiptNumber(sale.receiptNumber)}`} onClick={() => { if (!sale.receipt) return; setActiveReceipt(sale.receipt); setJustCompleted(false); openDialog('receipt') }}>#{receiptNumber(sale.receiptNumber)}</button>{sale.type !== 'sale' && <small>{t(sale.type === 'return' ? 'returnItems' : 'replacementItems')}</small>}</td>
                    <td><small>{formatUiDateTime(sale.time)}</small></td>
                    <td>{sale.customerName}</td>
                    {hasVariants && <td><small>{sale.product.variantName ?? sale.product.detail}</small></td>}
                    <td><strong>{sale.quantitiesKnown ? quantityWithUnit(sale.quantity, sale.product.unit) : '—'}</strong></td>
                    <td>{sale.amountsKnown ? `৳ ${money(sale.total)}` : '—'}</td>
                    <td><span className={sale.profit < 0 ? 'report-loss' : 'profit-text'}>{sale.amountsKnown && sale.costKnown ? `৳ ${money(sale.profit)}` : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table> : <div className="empty-state" style={{ minHeight: 120, padding: 20 }}><p>{t('noItemSales')}</p></div>}
          </div>

          <p className="report-panel-note">{reportsTranslator(lang)('profitBasis')}{performance?.estimatedCost && <span> {reportsTranslator(lang)('estimateHint')}</span>}{performance?.unassignedServiceCost && <span> {reportsTranslator(lang)('serviceCostHint')}</span>}{performance?.unverifiedCost && <span> {reportsTranslator(lang)('unverifiedCostHint')}</span>}</p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={closeDialog}>{t('close')}</button>
          </div>
        </>
      })()}

      {dialog === 'addTx' && activeCustomer && <form onSubmit={e => { e.preventDefault(); recordTransaction() }}>
        <div className="eyebrow modal-eyebrow">{activeCustomer[lang]}<span> / </span>{t('addTransaction')}</div>
        <h3>{txType === 'payment' ? t('recordPayment') : t('recordAdjustment')}<span className="heading-dot">.</span></h3>
        <p className="modal-description">{t('balanceHint')}</p>

        <label className="field-label" htmlFor="tx-amount">{t('amount')} (৳) *</label>
        <div className="money-input">
          <span>৳</span>
          <input id="tx-amount" value={txAmount} onChange={e => { setTxAmount(e.target.value); setModalError('') }} inputMode="decimal" placeholder="0.00" autoFocus required/>
          <small>BDT</small>
        </div>

        <div className="form-group" style={{ marginTop: 15 }}>
          <label htmlFor="tx-note">{t('txNoteLabel')}</label>
          <input id="tx-note" className="form-input" value={txNote} onChange={e => setTxNote(e.target.value)} placeholder="e.g. Cash payment / balance correction"/>
        </div>

        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={() => openCustomerProfile(activeCustomer)}>{t('cancel')}</button>
          <button className="primary-button" type="submit">{t('apply')}<kbd>↵</kbd></button>
        </div>
      </form>}

      {dialog === 'adjustStock' && adjustProduct && <form onSubmit={e => { e.preventDefault(); applyAdjustment() }}>
        <div className="eyebrow modal-eyebrow">{t('inventory')}<span> / </span>{t('adjustStock')}</div>
        <h3>{adjustProduct.en}<span className="heading-dot">.</span></h3>
        <p className="modal-description">{t('adjustHint')}</p>

        <div className="setting-language" style={{ marginBottom: 14 }}>
          {(['remove', 'add', 'count'] as const).map(mode => <button key={mode} type="button" className={adjustMode === mode ? 'active' : ''} onClick={() => { setAdjustMode(mode); setAdjustQty(''); setModalError('') }} aria-pressed={adjustMode === mode}>{t(mode === 'remove' ? 'adjustModeRemove' : mode === 'add' ? 'adjustModeAdd' : 'adjustModeCount')}</button>)}
        </div>

        <label className="field-label" htmlFor="adjust-qty">{adjustMode === 'count' ? t('adjustCounted') : t('adjustQuantity')} · {unitText(adjustProduct.unit)}</label>
        <div className="money-input">
          {isMoneyUnit(adjustProduct.unit) && <span>৳</span>}
          <input id="adjust-qty" data-initial-focus inputMode="decimal" value={adjustQty} onChange={e => { setAdjustQty(e.target.value); setModalError('') }} placeholder={adjustMode === 'count' ? '0' : '1'}/>
        </div>

        {(() => {
          const parsed = adjustMode === 'count' ? parseReturnQuantity(adjustQty, adjustProduct.unit) : parseQuantity(adjustQty, adjustProduct.unit)
          if (parsed === null) return null
          const preview = adjustMode === 'count' ? parsed : stockOf(adjustProduct) + (adjustMode === 'add' ? parsed : -parsed)
          return <div className="adjust-preview-row"><span>{t('adjustPreview')}</span><strong>{quantityWithUnit(preview, adjustProduct.unit)}</strong></div>
        })()}

        <div className="form-group" style={{ marginTop: 14 }}>
          <label htmlFor="adjust-reason">{t('adjustReasonLabel')}</label>
          <select id="adjust-reason" className="form-input" value={adjustReason} onChange={e => setAdjustReason(e.target.value as AdjustmentReason)}>
            <option value="damage">{t('damage')}</option>
            <option value="loss">{t('loss')}</option>
            <option value="count">{t('countReason')}</option>
            <option value="other">{t('other')}</option>
          </select>
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label htmlFor="adjust-note">{t('txNoteLabel')}</label>
          <input id="adjust-note" className="form-input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Broken during delivery"/>
        </div>
        <p className="adjust-append-note">{t('currentBookStock')}: {quantityWithUnit(stockOf(adjustProduct), adjustProduct.unit)}</p>
        <p className="adjust-append-note">{t('adjustOnlyNote')}</p>

        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button>
          <button className="primary-button" type="submit">{t('adjustStock')}<kbd>↵</kbd></button>
        </div>
      </form>}

      {dialog === 'voidPurchase' && voidTarget && <>
        <div className="eyebrow modal-eyebrow">{t('stockHistory')}<span> / </span>{t('voidPurchase')}</div>
        <h3>{t('voidPurchase')}<span className="heading-dot">.</span></h3>
        <p className="modal-description">{t('voidHint')}</p>
        <div className="adjust-preview-row"><span>{t('purchaseTotal')}</span><strong>৳ {money(voidTarget.total)}</strong></div>
        {purchaseAccount(voidTarget, state.supplierPayments, state.purchaseSettlements).known && purchaseAccount(voidTarget, state.supplierPayments, state.purchaseSettlements).paid > 0 && <div className="form-group"><p className="dialog-note">{st('refundHint')} ৳ {money(purchaseAccount(voidTarget, state.supplierPayments, state.purchaseSettlements).paid)}</p><label><input type="checkbox" checked={refundConfirmed} onChange={e => setRefundConfirmed(e.target.checked)}/> {st('refundConfirm')}</label><label htmlFor="void-refund-method">{st('method')}</label><select id="void-refund-method" className="form-input" value={refundMethod} onChange={e => setRefundMethod(e.target.value as PaymentMethod)}>{(['cash','mobile','bank'] as const).map(m => <option key={m} value={m}>{t(m)}</option>)}</select></div>}
        <div className="form-group" style={{ marginTop: 14 }}>
          <label htmlFor="void-reason">{t('voidReasonLabel')} *</label>
          <input id="void-reason" className="form-input" data-initial-focus value={voidReason} onChange={e => { setVoidReason(e.target.value); setModalError('') }} placeholder="e.g. Wrong quantity typed"/>
        </div>
        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button>
          <button className="primary-button" type="button" onClick={applyVoidPurchase}>{t('voidConfirm')}</button>
        </div>
      </>}

      {dialog === 'returnItems' && returnReceipt && (() => {
        const priorReturns = (state.returns ?? []).filter(entry => entry.receiptId === returnReceipt.id)
        const priorById = new Map<string, number>()
        for (const prior of priorReturns) for (const line of prior.lines) priorById.set(line.productId, (priorById.get(line.productId) ?? 0) + line.quantity)
        const previewRequests = returnReceipt.lines.map(line => ({ productId: line.productId, quantity: parseReturnQuantity(returnQtys[line.productId] ?? '', line.product.unit) ?? 0 })).filter(request => request.quantity > 0)
        let suggested = 0
        let previewError = ''
        const invalidQuantity = returnReceipt.lines.some(line => (returnQtys[line.productId] ?? '').trim() && parseReturnQuantity(returnQtys[line.productId], line.product.unit) === null)
        if (invalidQuantity) previewError = t('invalidQuantity')
        else if (previewRequests.length) {
          try { suggested = makeReturn(returnReceipt, previewRequests, { method: returnMethod, restock: false, priorReturns }).refunded }
          catch (error) { previewError = t((error as Error).message === 'quantity' ? 'returnTooMany' : 'invalidAmount') }
        }
        const override = returnRefund.trim() ? parseMoney(returnRefund) : undefined
        if (override === null || (override !== undefined && (override < 0 || override > suggested))) previewError ||= t('returnAmountInvalid')
        const finalRefund = override ?? suggested
        const dueAvailable = returnReceipt.customer ? customerBalance(returnReceipt.customer, state.receipts, state.transactions, state.returns).totalDue : 0
        const replacementTotal = exchangeLines.reduce((sum, line) => sum + lineTotal(line.unitPrice ?? findItem(line.productId).price, line.quantity), 0)
        const settlementMeta = { priorReturns, receiptDue: receiptOutstandingDue(returnReceipt, state.receipts, state.transactions, state.returns), customerDue: dueAvailable, method: returnMethod, issueCredit: returnIssueCredit }
        let settlement = calculateReturnSettlement(returnReceipt, previewError ? suggested : finalRefund, replacementTotal, settlementMeta)
        const extraPayable = settlement.received
        const received = returnReceived.trim() ? parseMoney(returnReceived) : undefined
        if (received === null) previewError ||= t('returnPaymentInvalid')
        else {
          try { settlement = calculateReturnSettlement(returnReceipt, previewError ? suggested : finalRefund, replacementTotal, { ...settlementMeta, received }) }
          catch (error) { previewError ||= t((error as Error).message === 'customer' ? 'returnCustomerDueHint' : 'returnPaymentInvalid') }
        }
        const extraReceived = settlement.received
        const newDue = settlement.newDue
        const age = Date.now() - Date.parse(returnReceipt.createdAt)
        const expired = age < -300000 || age > RETURN_WINDOW_DAYS * 86400000
        if (expired) previewError = t('returnExpired')
        const insufficientStock = exchangeLines.some(line => {
          const product = findItem(line.productId)
          const returning = previewRequests.find(request => request.productId === line.productId)
          const restocked = returning && returnConditions[line.productId] === 'sellable' ? returning.quantity : 0
          return !isService(product) && line.quantity > stockOf(product) + restocked
        })
        if (insufficientStock) previewError ||= t('noStock')
        const ready = previewRequests.length > 0 && !previewError && returnNote.trim() && returnOperator.trim()
        return <form className="return-flow" onSubmit={e => { e.preventDefault(); if (ready) void applyReturn() }}>
          <div className="eyebrow modal-eyebrow">{t('receipt')}<span> / </span>#{receiptNumber(returnReceipt.number)}</div>
          <h3>{t('returnItems')}<span className="heading-dot">.</span></h3>
          <p className="modal-description">{t('returnFlowHint')}</p>
          <div className="return-layout">
            <div className="return-main">
              <section className="return-section" aria-labelledby="return-select-title">
                <h4 id="return-select-title"><span className="return-step">01</span>{t('returnSelectItems')}</h4>
                <p className="return-section-hint">{t('returnWindowHint').replace('{days}', String(RETURN_WINDOW_DAYS))}</p>
                <div className="return-item-list">{returnReceipt.lines.map((line, index) => {
                  const remaining = Math.max(0, line.quantity - (priorById.get(line.productId) ?? 0))
                  const selected = (parseReturnQuantity(returnQtys[line.productId] ?? '', line.product.unit) ?? 0) > 0
                  return <div className={`return-item-card ${selected ? 'selected' : ''}`} key={line.productId}>
                    <div className="return-item-heading"><strong>{line.product.en}</strong><span>{t('returnableLabel')}: {quantityWithUnit(remaining, line.product.unit)}</span></div>
                    {remaining > 0 ? <div className="return-item-controls">
                      <label htmlFor={`return-qty-${index}`}>{t('returnQuantity')}<div className="return-quantity-control"><input id={`return-qty-${index}`} data-initial-focus={index === 0 ? true : undefined} inputMode="decimal" aria-invalid={!!(returnQtys[line.productId] ?? '').trim() && (parseReturnQuantity(returnQtys[line.productId], line.product.unit) === null || (parseReturnQuantity(returnQtys[line.productId], line.product.unit) ?? 0) > remaining)} value={returnQtys[line.productId] ?? ''} onChange={e => { setReturnQtys(prev => ({ ...prev, [line.productId]: e.target.value })); setReturnReceived(''); setModalError('') }} placeholder="0"/><button type="button" onClick={() => { setReturnQtys(prev => ({ ...prev, [line.productId]: String(remaining / 1000) })); setReturnReceived(''); setModalError('') }}>{t('returnAll')}</button></div></label>
                      {!isService(line.product) && <label htmlFor={`return-condition-${index}`}>{t('itemCondition')}<select id={`return-condition-${index}`} disabled={!selected} value={returnConditions[line.productId] ?? 'sellable'} onChange={e => { setReturnConditions(prev => ({ ...prev, [line.productId]: e.target.value as 'sellable' | 'damaged' })); setModalError('') }}><option value="sellable">{t('returnRestock')}</option><option value="damaged">{t('returnNoRestock')}</option></select></label>}
                    </div> : <span className="return-section-hint">{t('returnFullyReturned')}</span>}
                  </div>
                })}</div>
                <details className="return-disclosure">
                  <summary>{t('returnAdjustValue')}</summary>
                  <p className="return-section-hint">{t('returnValueHint')}</p>
                  <label className="field-label" htmlFor="return-refund">{t('returnValue')} (৳)</label>
                  <div className="money-input"><span>৳</span><input id="return-refund" inputMode="decimal" value={returnRefund} onChange={e => { setReturnRefund(e.target.value); setReturnReceived(''); setModalError('') }} placeholder={String(suggested)}/></div>
                  <button className="return-text-button" type="button" onClick={() => { setReturnRefund(''); setReturnReceived(''); setModalError('') }}>{t('returnUseCalculated')}</button>
                </details>
              </section>
              <details className="return-section return-disclosure return-exchange">
                <summary><span className="return-step">+</span>{t('replacementItems')}{exchangeLines.length > 0 && <span className="return-count">{exchangeLines.length}</span>}</summary>
                <p className="return-section-hint">{t('replacementHint')}</p>
                <div className="exchange-add-row"><select aria-label={t('replacementItems')} value={exchangeProductId} onChange={e => { setExchangeProductId(e.target.value); setExchangePrice('') }}><option value="">{t('selectItem')}</option>{catalog.filter(product => !product.archived).map(product => <option key={product.id} value={product.id}>{product.en} · ৳ {money(product.price)}</option>)}</select><input aria-label={t('sellingPriceUnit')} placeholder={t('sellingPrice')} inputMode="decimal" value={exchangePrice} onChange={e => { setExchangePrice(e.target.value); setModalError('') }}/><input aria-label={t('quantity')} inputMode="decimal" value={exchangeQty} onChange={e => setExchangeQty(e.target.value)}/><button className="secondary-button" type="button" disabled={!exchangeProductId} onClick={() => { const product = catalog.find(item => item.id === exchangeProductId); const unitPrice = parseMoney(exchangePrice); if (unitPrice === null || unitPrice <= 0) { setModalError(t('invalidAmount')); return } const quantity = product ? parseQuantity(exchangeQty, product.unit) : null; if (!product || quantity === null || quantity <= 0) { setModalError(t('invalidQuantity')); return } if (unitPrice < productCost(product)) { warnBelowCost(); setModalError(t('belowCost')); return } setExchangeLines(previous => addSaleLine(previous, { productId: product.id, quantity, unitPrice })); setExchangeProductId(''); setExchangeQty('1'); setExchangePrice(''); setReturnReceived(''); setModalError('') }}>{t('addItem')}</button></div>
                {exchangeLines.map(line => { const product = findItem(line.productId); return <div className="exchange-line" key={line.productId}><span>{product.en} × {quantityWithUnit(line.quantity, product.unit)}</span><strong>৳ {money(lineTotal(product.price, line.quantity), true)}</strong><button type="button" onClick={() => { setExchangeLines(previous => previous.filter(item => item.productId !== line.productId)); setReturnReceived(''); setModalError('') }} aria-label={`${t('remove')} ${product.en}`}>×</button></div> })}
              </details>
              <section className="return-section" aria-labelledby="return-details-title">
                <h4 id="return-details-title"><span className="return-step">02</span>{t('returnDetails')}</h4>
                <div className="return-details-fields"><div className="form-group"><label htmlFor="return-note">{t('returnReason')} *</label><input id="return-note" className="form-input" required value={returnNote} onChange={e => { setReturnNote(e.target.value); setModalError('') }} placeholder={t('returnReasonPlaceholder')}/></div><div className="form-group"><label htmlFor="return-operator">{t('processedBy')} *</label><input id="return-operator" className="form-input" required value={returnOperator} onChange={e => { setReturnOperator(e.target.value); setModalError('') }}/></div></div>
              </section>
            </div>
            <aside className="return-summary" aria-labelledby="return-summary-title">
              <h4 id="return-summary-title"><span className="return-step">03</span>{t('returnReview')}</h4>
              {!previewRequests.length && !previewError ? <p className="return-empty-summary">{t('returnSummaryEmpty')}</p> : <>
                <div className="return-value-row"><span>{t('returnValue')}</span><strong>{previewError ? '—' : `৳ ${money(finalRefund)}`}</strong></div>
                <p className="return-section-hint">{t('returnDiscountIncluded')}</p>
                {!previewError && <>
                  <dl className="return-breakdown">
                    {settlement.dueReduced > 0 && <div><dt>{t('reduceDue')}</dt><dd>৳ {money(settlement.dueReduced)}</dd></div>}
                    {replacementTotal > 0 && <><div><dt>{t('returnReplacementTotal')}</dt><dd>৳ {money(replacementTotal)}</dd></div><div><dt>{t('exchangeCredit')}</dt><dd>৳ {money(settlement.exchangeCredit)}</dd></div></>}
                    {settlement.creditIssued > 0 && <div><dt>{t('storeCredit')}</dt><dd>৳ {money(settlement.creditIssued)}</dd></div>}
                    {newDue > 0 && <div><dt>{t('newDue')}</dt><dd>৳ {money(newDue)}</dd></div>}
                  </dl>
                  <div className="return-outcome" aria-live="polite"><span>{extraPayable > 0 ? t('returnCollect') : settlement.payout > 0 ? t('returnGiveBack') : t('returnNoCash')}</span><strong>৳ {money(extraPayable > 0 ? extraReceived : settlement.payout, true)}</strong></div>
                  {settlement.dueReduced > 0 && <p className="return-section-hint">{t('returnDueFirstHint')}</p>}
                </>}
              </>}
              {returnReceipt.customer && settlement.payout + settlement.creditIssued > 0 && <label className="return-credit-choice"><input type="checkbox" checked={returnIssueCredit} onChange={e => { setReturnIssueCredit(e.target.checked); setModalError('') }}/><span>{t('issueStoreCredit')}</span></label>}
              {!previewError && previewRequests.length > 0 && (settlement.payout > 0 || extraPayable > 0) && <><span className="field-label">{extraPayable > 0 ? t('returnPaymentMethod') : t('refundMethodLabel')}</span><div className="payment-methods return-payment-methods" aria-label={t('returnPaymentMethod')}>{(['cash', 'mobile', 'bank'] as const).map(method => <button key={method} type="button" className={method === returnMethod ? 'active' : ''} onClick={() => { setReturnMethod(method); setModalError('') }} aria-pressed={method === returnMethod}><Icon name={method}/>{t(method)}</button>)}</div></>}
              {extraPayable > 0 && returnReceipt.customer && <details className="return-disclosure"><summary>{t('returnKeepDue')}</summary><p className="return-section-hint">{t('returnCollectHint')}</p><label className="field-label" htmlFor="exchange-received">{t('returnReceivedNow')} (৳)</label><div className="money-input"><span>৳</span><input id="exchange-received" inputMode="decimal" value={returnReceived} onChange={e => { setReturnReceived(e.target.value); setModalError('') }} placeholder={String(extraPayable)}/></div><button className="return-text-button" type="button" onClick={() => { setReturnReceived(''); setModalError('') }}>{t('returnCollectFull')}</button></details>}
              {(previewError || modalError) && <p className="field-error" role="alert">{previewError || modalError}</p>}
            </aside>
          </div>
          <div className="dialog-actions return-actions"><span>{t('returnSaveHint')}</span><button className="secondary-button" type="button" onClick={closeDialog} disabled={busy}>{t('cancel')}</button><button className="primary-button" type="submit" disabled={!ready || busy}>{busy ? t('completing') : t('returnConfirm')}</button></div>
        </form>
      })()}

      {dialog === 'newExpense' && <form onSubmit={e => { e.preventDefault(); saveExpense() }}>
        <div className="eyebrow modal-eyebrow">{t('workspace')}<span> / </span>{t('expenses')}</div>
        <h3>{t('newExpense')}<span className="heading-dot">.</span></h3>
        <p className="modal-description">{t('expenseHint')}</p>

        <div className="form-group">
          <label htmlFor="expense-category">{t('expenseCategory')}</label>
          <select id="expense-category" className="form-input" value={expenseCategory} onChange={e => setExpenseCategory(e.target.value as ExpenseCategory)}>
            {(['rent', 'utility', 'salary', 'transport', 'other'] as ExpenseCategory[]).map(category => <option key={category} value={category}>{t(category)}</option>)}
          </select>
        </div>

        <label className="field-label" htmlFor="expense-amount">{t('amount')} (৳) *</label>
        <div className="money-input">
          <span>৳</span>
          <input id="expense-amount" data-initial-focus inputMode="decimal" value={expenseAmount} onChange={e => { setExpenseAmount(e.target.value); setModalError('') }} placeholder="0.00" required/>
          <small>BDT</small>
        </div>

        <span className="field-label">{t('method')}</span>
        <div className="payment-methods" aria-label={t('method')}>
          {(['cash', 'mobile', 'bank'] as PaymentMethod[]).map(method => <button key={method} type="button" className={method === expenseMethod ? 'active' : ''} onClick={() => setExpenseMethod(method)} aria-pressed={method === expenseMethod}><Icon name={method}/>{t(method)}</button>)}
        </div>

        <div className="form-group">
          <label htmlFor="expense-note">{t('txNoteLabel')}</label>
          <input id="expense-note" className="form-input" value={expenseNote} onChange={e => setExpenseNote(e.target.value)} placeholder="e.g. Electricity bill / August rent"/>
        </div>

        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={closeDialog}>{t('cancel')}</button>
          <button className="primary-button" type="submit">{t('saveExpense')}<kbd>↵</kbd></button>
        </div>
      </form>}

      {dialog === 'purchases' && (() => {
        const purchaseList = [
          ...(state.purchases ?? []).filter(p=>p.mode!=='invoice').map(p=>({...p,sourcePurchaseId:p.id})),
          ...(state.stockReceivings ?? []).map(r=>{
            const invoice=(state.purchases??[]).find(p=>p.id===r.purchaseId)
            return {id:r.id,sourcePurchaseId:r.purchaseId,createdAt:r.createdAt,lines:r.lines,total:r.lines.reduce((s,l)=>s+l.total,0),supplier:invoice?.supplier,note:[invoice?.invoiceNumber,r.note].filter(Boolean).join(' · '),voidedAt:invoice?.voidedAt,voidReason:invoice?.voidReason}
          }),
        ].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
        const totalBought = purchaseList.filter(purchase => !purchase.voidedAt).reduce((sum, purchase) => sum + purchase.total, 0)
        const adjustmentList = [...(state.adjustments ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        const timeText = (value: string) => formatUiDateTime(value)
        const downloadStockHistory = async () => {
          const amount = (value: number) => `৳ ${money(value)}`
          const stockRows = [
            ...purchaseList.map(purchase => ({
              createdAt: purchase.createdAt,
              type: `${st('stockReceived')} · ${purchase.lines.map(line => findItem(line.productId).en).join(', ')}`,
              amount: amount(purchase.total),
              settlement: purchase.lines.map(line => `${quantityWithUnit(line.quantity, findItem(line.productId).unit)} @ ${amount(line.unitCost)}`).join(' · '),
              details: [purchase.supplier, purchase.note, purchase.voidedAt ? t('voidedBadge') : ''].filter(Boolean).join(' · ') || '—',
              tone: purchase.voidedAt ? 'danger' as const : 'positive' as const,
            })),
            ...adjustmentList.map(adjustment => {
              const item = findItem(adjustment.productId)
              return {
                createdAt: adjustment.createdAt,
                type: `${t('adjustmentsSection')} · ${item.en}`,
                amount: `${adjustment.quantity > 0 ? '+' : ''}${quantityWithUnit(adjustment.quantity, item.unit)}`,
                settlement: adjustment.counted !== undefined ? `${t('adjustmentCounted')}: ${quantityWithUnit(adjustment.counted, item.unit)}` : undefined,
                details: [t(adjustment.reason === 'count' ? 'countReason' : adjustment.reason), adjustment.note].filter(Boolean).join(' · ') || '—',
                tone: adjustment.quantity < 0 ? 'warning' as const : 'neutral' as const,
              }
            }),
          ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          try {
            await downloadCustomerHistoryPdf({
              fileName: `hisab-stock-history-${dayKey(now)}`,
              generatedAt: formatUiDateTime(now),
              scope: lang === 'bn' ? 'সব সময় · সাম্প্রতিক আগে · টাকা: BDT (৳) · সমন্বয়ের পরিমাণ পণ্যের এককে' : 'All time · Newest first · Currency: BDT (৳) · Adjustment quantities use item units',
              details: [
                { label: st('receivingRecords'), value: String(purchaseList.length) },
                { label: t('adjustmentsSection'), value: String(adjustmentList.length) },
                { label: t('stockActivity'), value: String(purchaseList.length + adjustmentList.length) },
              ],
              balances: [
                { label: st('receivedValue'), value: amount(totalBought), tone: 'positive' },
                { label: st('receivedThisMonth'), value: amount(stockReceivedThisMonthTotal), tone: 'neutral' },
                { label: t('adjustmentsSection'), value: String(adjustmentList.length), tone: 'warning' },
              ],
              transactions: stockRows.map(row => ({
                date: formatUiDateTime(row.createdAt),
                type: row.type,
                amount: row.amount,
                settlement: row.settlement,
                details: row.details,
                tone: row.tone,
              })),
              labels: {
                title: t('stockHistory'), generated: t('generatedAt'), customerDetails: t('stockSummary'),
                transactionHistory: t('stockActivity'), date: t('time'), type: t('stockActivity'), amount: t('amount'),
                details: t('txNoteLabel'), noTransactions: t('noStockActivity'), page: t('page'),
                brandSubtitle: 'HISAB / STOCK LEDGER', detailsHeading: t('stockSummary'),
              },
            })
            setToast({ text: t('stockHistoryPdfDownloaded') })
          } catch {
            setToast({ text: t('historyPdfError'), variant: 'danger' })
          }
        }
        return <>
          <div className="eyebrow modal-eyebrow">{t('inventory')}<span> / </span>{t('stockHistory')}</div>
          <h3>{t('stockHistory')}<span className="heading-dot">.</span></h3>
          <p className="modal-description">{t('purchaseHistoryHint')}</p>

          <div className="stock-history-layout">
            <aside className="stock-history-overview">
              <div className="customer-stats-grid">
                <div className="customer-stat-card"><span>{st('receivedValue')}</span><strong>৳ {money(totalBought)}</strong></div>
                <div className="customer-stat-card"><span>{st('receivedThisMonth')}</span><strong>৳ {money(stockReceivedThisMonthTotal)}</strong></div>
                <div className="customer-stat-card credit"><span>{t('adjustmentsSection')}</span><strong>{adjustmentList.length}</strong></div>
              </div>
            </aside>
            <section className="stock-history-activity" aria-label={t('stockActivity')}>
              <div className="panel-heading tx-history-heading" style={{ height: 38, padding: '0 4px', borderBottom: 'none' }}>
                <div className="section-title"><h2 style={{ fontSize: 13 }}>{t('stockActivity')}</h2><span className="count-badge">{purchaseList.length + adjustmentList.length}</span></div>
                <button type="button" className="secondary-button customer-history-download" onClick={() => void downloadStockHistory()} aria-label={t('downloadHistoryPdf')}><Icon name="download" size={14}/><span>{t('downloadHistoryPdf')}</span></button>
              </div>
              <div className="stock-history-section">
                <div className="panel-heading"><div className="section-title"><span className="section-number">IN</span><h2>{st('stockReceived')}</h2><span className="count-badge">{purchaseList.length}</span></div></div>
                <div className="tx-table-wrap">
                  {purchaseList.length ? <table className="tx-table"><thead><tr><th>{t('time')}</th><th>{t('products')}</th><th>{t('amount')}</th><th>{t('txNoteLabel')}</th><th/></tr></thead><tbody>
                    {purchaseList.map(purchase => <tr key={purchase.id} className={purchase.voidedAt ? 'purchase-voided-row' : undefined}>
                      <td><small>{timeText(purchase.createdAt)}</small></td>
                      <td>{purchase.lines.map((line, index) => { const item = findItem(line.productId); return <span key={`${purchase.id}-${line.productId}-${index}`} className="purchase-line"><strong>{item.en}</strong><span>{quantityWithUnit(line.quantity, item.unit)} @ ৳ {money(line.unitCost)}</span></span> })}{purchase.voidedAt && <span className="void-badge">{t('voidedBadge')}</span>}</td>
                      <td><strong>৳ {money(purchase.total)}</strong></td><td><small>{[purchase.supplier, purchase.note].filter(Boolean).join(' · ') || '—'}</small></td>
                      <td>{!purchase.voidedAt && <button type="button" className="adjust-row-button" onClick={() => openVoidDialog((state.purchases ?? []).find(p=>p.id===purchase.sourcePurchaseId) ?? purchase)}>{t('voidPurchase')}</button>}</td>
                    </tr>)}
                  </tbody></table> : <div className="empty-state"><p>{t('noPurchases')}</p></div>}
                </div>
              </div>
              <div className="stock-history-section">
                <div className="panel-heading"><div className="section-title"><span className="section-number">ADJ</span><h2>{t('adjustmentsSection')}</h2><span className="count-badge">{adjustmentList.length}</span></div></div>
                <div className="tx-table-wrap">
                  {adjustmentList.length ? <table className="tx-table"><thead><tr><th>{t('time')}</th><th>{t('product')}</th><th>{t('adjustQuantity')}</th><th>{t('adjustReasonLabel')}</th><th>{t('txNoteLabel')}</th></tr></thead><tbody>
                    {adjustmentList.map(adjustment => { const item = findItem(adjustment.productId); return <tr key={adjustment.id}>
                      <td><small>{timeText(adjustment.createdAt)}</small></td><td><strong>{item.en}</strong></td>
                      <td><strong className={adjustment.quantity < 0 ? 'report-loss' : undefined}>{adjustment.quantity > 0 ? '+' : ''}{quantityWithUnit(adjustment.quantity, item.unit)}</strong></td>
                      <td><span className="expense-badge other">{t(adjustment.reason === 'count' ? 'countReason' : adjustment.reason)}</span>{adjustment.counted !== undefined && <small className="report-cell-detail">{t('adjustmentCounted')}: {quantityWithUnit(adjustment.counted, item.unit)}</small>}</td><td><small>{adjustment.note ?? '—'}</small></td>
                    </tr> })}
                  </tbody></table> : <div className="empty-state"><p>{t('noAdjustments')}</p></div>}
                </div>
              </div>
            </section>
          </div>

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={closeDialog}>{t('close')}</button>
          </div>
        </>
      })()}

      {dialog === 'returnSlip' && activeReturn && activeReceipt && <>
        <div className="receipt-dialog-heading"><div className="eyebrow">{t('returnSaved')}</div><h3>{t('returnSlip')}</h3></div>
        <ReturnSlip entry={activeReturn} receipt={activeReceipt} lang={lang}/>
        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions"><button className="secondary-button" onClick={() => void printReceipt()} disabled={busy}><Icon name="print" size={17}/>{t('printReceipt')}</button><button className="primary-button" onClick={() => setDialog('receipt')}>{t('close')}</button></div>
      </>}

      {dialog === 'receipt' && activeReceipt && <>
        <div className="receipt-dialog-heading">{justCompleted && <span className="success-mark"><Icon name="check" size={22}/></span>}<div className="eyebrow">{t(justCompleted ? 'receiptSaved' : receiptPending ? 'receiptPreview' : 'receipt')}</div><h3>{t(justCompleted ? 'saleComplete' : receiptPending ? 'reviewReceipt' : 'receipt')}</h3></div>
        {(() => {
          const billReturns = (state.returns ?? []).filter(entry => entry.receiptId === activeReceipt.id)
          return <>
            {!receiptPending && <div className="dialog-actions" style={{ marginTop: 0, marginBottom: 14 }}><button className="secondary-button" type="button" onClick={() => openReturnDialog(activeReceipt)} disabled={busy}><Icon name="reset" size={15}/>{t('returnItems')}</button></div>}
            {billReturns.length > 0 && <div className="returns-list">
              <span className="eyebrow">{t('returnsForBill')}</span>
              {billReturns.map(entry => <div key={entry.id}>
                <span>{entry.lines.map(line => {
                  const item = findItem(line.productId)
                  return `${item.en} × ${quantityWithUnit(line.quantity, item.unit)}`
                }).join(', ')}</span>
                <strong>− ৳ {money(entry.refunded)} · {entry.replacementLines?.length ? t('replacementItems') : entry.method === 'due' ? t('reduceDue') : t(entry.method)}</strong>
                <button className="text-button" type="button" onClick={() => { setActiveReturn(entry); setDialog('returnSlip') }}>{t('returnSlip')}</button>
              </div>)}
            </div>}
          </>
        })()}
        <div className="receipt-preparer-field"><label htmlFor="receipt-prepared-by">{t('preparedBy')}</label><input id="receipt-prepared-by" className="form-input" type="text" value={activeReceipt.preparedBy ?? ''} onChange={event => { setActiveReceipt({ ...activeReceipt, preparedBy: event.target.value }); setModalError('') }} maxLength={80} readOnly={!receiptPending} placeholder={receiptPending ? t('preparedByPlaceholder') : undefined}/></div>
        <ReceiptMemo receipt={activeReceipt} lang={lang} walkIn={t('walkIn')}/>
        {modalError && <p className="field-error" role="alert">{modalError}</p>}
        <div className="dialog-actions"><button className="secondary-button" onClick={() => void printReceipt()} disabled={busy}><Icon name="print" size={17}/>{t(busy ? 'saving' : 'printReceipt')}</button><button className="primary-button" data-initial-focus disabled={busy} onClick={() => { if (billFinderActive) openDialog('findBill'); else void confirmReceipt() }}>{t(billFinderActive ? 'backToBills' : 'okay')}<Icon name="arrow" size={18}/></button></div>
      </>}
      {backendError && <div className="backend-recovery" role="alert"><p>{backendError}</p><button className="secondary-button" onClick={() => void refreshWorkspace()} disabled={busy}>{t('refreshData')}</button></div>}
    </Modal>}
  </div>
}
