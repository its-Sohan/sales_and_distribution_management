import {
  allProducts, applyInventoryMovement, inventoryCostAmount, inventoryValuationReady,
  isDiscreteUnit, isService, lineTotal, productCost, proportionalAmount, sameProductUnit, stockFor,
  type Product, type Receipt, type Return, type ShopState, type StockAdjustment,
} from '../src/model'
import { ValidationError, type PurchaseInput, type ValuationCheckpointInput } from './validate'

function hasHistory(state: ShopState, id: string) {
  return state.receipts.some(r => r.lines.some(l => l.productId === id))
    || (state.purchases ?? []).some(p => p.lines.some(l => l.productId === id))
    || (state.stockReceivings ?? []).some(r => r.lines.some(l => l.productId === id))
    || (state.adjustments ?? []).some(a => a.productId === id)
    || (state.returns ?? []).some(r => [...r.lines, ...(r.replacementLines ?? [])].some(l => l.productId === id))
}

// An untouched recorded opening cost is evidence. Once movements have happened,
// a mutable unit-cost field alone cannot establish the remaining inventory value.
export function initializeValuations(state: ShopState): Product[] {
  return allProducts(state.customProducts).map(product => {
    if (isService(product) || inventoryValuationReady(product)) return product
    const quantity = stockFor(product, state.receipts, state.adjustments, state.returns)
    if (product.valuationStatus === 'unverified' && quantity > 0) return product
    if (quantity === 0 || (!hasHistory(state, product.id) && product.cost !== undefined && quantity > 0)) {
      return { ...product, inventoryValue: quantity === 0 ? 0 : lineTotal(product.cost!, quantity), valuationStatus: 'verified' }
    }
    return { ...product, inventoryValue: undefined, valuationStatus: 'unverified' }
  })
}

export class InventoryLedger {
  readonly products: Map<string, Product>
  readonly quantities: Map<string, number>
  readonly touched = new Set<string>()
  constructor(readonly history: ShopState, incoming: Product[], purchases: PurchaseInput[]) {
    this.products = new Map(initializeValuations(history).map(p => [p.id, p]))
    this.quantities = new Map([...this.products.values()].map(p => [p.id, stockFor(p, history.receipts, history.adjustments, history.returns)]))
    for (const input of incoming) {
      const old = this.products.get(input.id)
      const incomingQuantity = purchases.filter(p => p.mode !== 'invoice').flatMap(p => p.lines).filter(l => l.productId === input.id).reduce((s, l) => s + l.quantity, 0)
      if (!old && incomingQuantity && input.stock !== incomingQuantity) throw new ValidationError(`product ${input.id}: initial stock must match its purchase`)
      const product: Product = old && !isService(old)
        ? { ...input, stock: old.stock, purchased: old.purchased, cost: old.cost, inventoryValue: old.inventoryValue, valuationStatus: old.valuationStatus }
        : !old && incomingQuantity
          ? { ...input, stock: 0, purchased: 0, inventoryValue: 0, valuationStatus: 'verified' }
          : !old && input.stock === 0
            ? { ...input, inventoryValue: 0, valuationStatus: 'verified' }
            : { ...input, inventoryValue: old?.inventoryValue, valuationStatus: old?.valuationStatus ?? 'unverified' }
      if (old && !isService(old) && !sameProductUnit(old.unit, input.unit)) throw new ValidationError(`product ${input.id}: create a separate product code for a different stock unit`)
      if (old && isService(old) !== isService(input)) throw new ValidationError(`product ${input.id}: changing the item type is not supported`)
      this.products.set(input.id, product)
      if (!old) this.quantities.set(input.id, product.stock)
      this.touched.add(input.id)
    }
  }

  product(id: string): Product {
    const product = this.products.get(id)
    if (!product) throw new ValidationError(`unknown stock item ${id}`)
    return product
  }
  quantity(id: string) { return this.quantities.get(id) ?? 0 }
  requireReady(id: string) {
    const product = this.product(id)
    if (!isService(product) && !inventoryValuationReady(product)) throw new ValidationError(`Opening stock value required for ${product.en}. Set its valuation before recording stock movements.`)
    return product
  }
  move(id: string, quantity: number, value: number) {
    const product = this.requireReady(id)
    if (isService(product)) return
    try {
      const changed = applyInventoryMovement(product, this.quantity(id), quantity, value)
      if (this.quantity(id) + quantity > 1_000_000_000) throw new Error('stock')
      this.products.set(id, changed)
      this.quantities.set(id, this.quantity(id) + quantity)
      this.touched.add(id)
    } catch { throw new ValidationError(`stock ${id}: movement would leave an invalid quantity or value`) }
  }
  checkpoint(input: ValuationCheckpointInput) {
    const product = this.product(input.productId)
    if (isService(product) || this.quantity(product.id) !== input.expectedQuantity || input.expectedQuantity < 0
      || (input.expectedQuantity === 0 && input.inventoryValue !== 0)) throw new ValidationError(`valuation ${product.id}: quantity changed or valuation is invalid`)
    this.products.set(product.id, { ...product, inventoryValue: input.inventoryValue, valuationStatus: 'provided',
      ...(input.expectedQuantity ? { cost: proportionalAmount(input.inventoryValue, 1000, input.expectedQuantity) } : {}) })
    this.touched.add(product.id)
  }
  purchase(purchase: PurchaseInput) {
    for (const line of purchase.lines) {
      const product = this.requireReady(line.productId)
      if (isService(product)) throw new ValidationError(`purchase ${purchase.id}: services do not have stock`)
      if (isDiscreteUnit(product.unit) && line.quantity % 1000 !== 0) throw new ValidationError('Purchase quantities must contain whole units')
      this.move(product.id, line.quantity, line.total)
      const changed = this.product(product.id)
      this.products.set(product.id, { ...changed, stock: product.stock + line.quantity, purchased: (product.purchased ?? product.stock) + line.quantity })
    }
  }
  sale(receipt: Receipt) {
    for (const line of receipt.lines) {
      if (!isService(this.product(line.productId))) this.move(line.productId, -line.quantity, -(line.costAmount ?? inventoryCostAmount(this.product(line.productId), this.quantity(line.productId), line.quantity)))
    }
  }
  return(entry: Return) {
    for (const line of entry.lines) {
      const product = this.product(line.productId)
      if (!isService(product) && (line.condition ? line.condition === 'sellable' : entry.restock)) {
        if (line.costStatus !== 'recorded') throw new ValidationError('The original returned stock cost must be verified before restocking. Reconcile the historical bill first.')
        this.move(product.id, line.quantity, line.cost)
      }
    }
    for (const line of entry.replacementLines ?? []) if (!isService(this.product(line.productId))) this.move(line.productId, -line.quantity, -line.cost)
  }
  adjustment(adjustment: StockAdjustment): StockAdjustment {
    const product = this.requireReady(adjustment.productId)
    if (isService(product)) throw new ValidationError('Services do not have stock adjustments')
    if (isDiscreteUnit(product.unit) && adjustment.quantity % 1000 !== 0) throw new ValidationError('Stock corrections must contain whole units')
    if (adjustment.counted !== undefined && adjustment.counted !== this.quantity(product.id) + adjustment.quantity) throw new ValidationError('Physical count does not match the stock correction')
    const amount = adjustment.quantity < 0
      ? -inventoryCostAmount(product, this.quantity(product.id), -adjustment.quantity)
      : this.quantity(product.id) > 0 ? proportionalAmount(product.inventoryValue!, adjustment.quantity, this.quantity(product.id)) : lineTotal(productCost(product), adjustment.quantity)
    this.move(product.id, adjustment.quantity, amount)
    return { ...adjustment, costAmount: amount }
  }
  void(purchase: PurchaseInput, createdAt: string, newReceipts: Receipt[], newReturns: Return[], newAdjustments: StockAdjustment[]) {
    const since = Date.parse(purchase.createdAt)
    for (const line of purchase.lines) {
      const consumed = [...this.history.receipts, ...newReceipts].some(r => Date.parse(r.createdAt) >= since && r.lines.some(l => l.productId === line.productId))
        || [...(this.history.returns ?? []), ...newReturns].some(r => Date.parse(r.createdAt) >= since && (r.replacementLines ?? []).some(l => l.productId === line.productId))
        || [...(this.history.adjustments ?? []), ...newAdjustments].some(a => Date.parse(a.createdAt) >= since && a.productId === line.productId && a.quantity < 0)
      if (consumed || Date.parse(createdAt) < since) throw new ValidationError(`Purchase ${purchase.id} has subsequent stock removals. A reviewed correction is required instead of a void.`)
      const product = this.requireReady(line.productId)
      this.move(product.id, -line.quantity, -line.total)
      this.products.set(product.id, { ...this.product(product.id), stock: product.stock - line.quantity, purchased: (product.purchased ?? product.stock) - line.quantity })
    }
  }
}
