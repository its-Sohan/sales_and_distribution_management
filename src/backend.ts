import type { ShopState } from './model'
import { notifySessionExpired } from './auth'

export type Workspace = { revision: number; state: ShopState }
export class BackendError extends Error {
  constructor(message: string, public status = 0) { super(message) }
}

const sections = ['receipts', 'transactions', 'purchases', 'expenses', 'adjustments', 'returns', 'customProducts', 'customCustomers', 'suppliers', 'supplierPayments', 'purchaseSettlements', 'stockReceivings'] as const

async function readWorkspace(response: Response, terminalId: number): Promise<Workspace> {
  if (response.status === 401) notifySessionExpired()
  let data
  try { data = await response.json() }
  catch { throw new BackendError('The backend did not return JSON.', response.status) }
  if (!response.ok) throw new BackendError(data?.error ?? `Backend returned HTTP ${response.status}`, response.status)
  const state = data?.state
  if (data?.ok !== true || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !state || state.terminalId !== terminalId || !Array.isArray(state.lines)
    || !Number.isSafeInteger(state.discount) || state.discount < 0
    || !(state.customerId === null || typeof state.customerId === 'string')
    || !sections.every(section => Array.isArray(state[section]))) {
    throw new BackendError('The backend did not confirm the workspace.', response.status)
  }
  return { revision: data.revision, state }
}

const readSignal = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)

export async function loadWorkspace(terminalId: number, signal?: AbortSignal): Promise<Workspace> {
  return readWorkspace(await fetch(`/api/workspace?terminalId=${terminalId}`, {
    headers: { Accept: 'application/json' }, cache: 'no-store', signal: readSignal(signal),
  }), terminalId)
}

export async function loadWorkspaceRevision(signal?: AbortSignal): Promise<number> {
  const response = await fetch('/api/workspace/revision', {
    headers: { Accept: 'application/json' }, cache: 'no-store', signal: readSignal(signal),
  })
  if (response.status === 401) notifySessionExpired()
  let data
  try { data = await response.json() }
  catch { throw new BackendError('The backend did not return JSON.', response.status) }
  if (!response.ok) throw new BackendError(data?.error ?? `Backend returned HTTP ${response.status}`, response.status)
  if (data?.ok !== true || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new BackendError('The backend did not confirm the revision.', response.status)
  return data.revision
}

// Background reads never take the write lock. Cancel them before a write or
// terminal change, and check ownership again even if fetch ignores cancellation.
export class WorkspaceRefresh {
  private controller: AbortController | null = null

  cancel() {
    this.controller?.abort()
    this.controller = null
  }

  async check(current: Workspace, isCurrent: () => boolean, apply: (workspace: Workspace) => void): Promise<boolean> {
    if (this.controller) return false
    const controller = new AbortController()
    this.controller = controller
    try {
      const revision = await loadWorkspaceRevision(controller.signal)
      if (controller.signal.aborted || !isCurrent()) return false
      if (revision === current.revision) return true
      const next = await loadWorkspace(current.state.terminalId ?? 1, controller.signal)
      if (controller.signal.aborted || !isCurrent() || next.revision < current.revision) return false
      apply(next)
      return true
    } catch (error) {
      if (!controller.signal.aborted && isCurrent()) throw error
      return false
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const draftOf = (state: ShopState) => ({ lines: state.lines, discount: state.discount, customerId: state.customerId })

export type ValuationCheckpoint = { productId: string; expectedQuantity: number; inventoryValue: number; reason: string }

export async function saveWorkspace(next: ShopState, current: Workspace, options?: { valuationCheckpoints?: ValuationCheckpoint[]; confirmDraft?: boolean }): Promise<Workspace> {
  const terminalId = current.state.terminalId ?? 1
  const changes: Record<string, unknown> = {}
  if (options?.valuationCheckpoints?.length) changes.valuationCheckpoints = options.valuationCheckpoints
  for (const section of sections) {
    const before = new Map<string, unknown>((current.state[section] ?? []).map(item => [item.id, item]))
    changes[section] = (next[section] ?? []).filter(item => !equal(before.get(item.id), item))
  }
  changes.purchaseVoids = (next.purchases ?? []).filter(p => p.voidedAt
    && !(current.state.purchases ?? []).find(before => before.id === p.id)?.voidedAt)
    .map(p => ({ purchaseId: p.id, createdAt: p.voidedAt, reason: p.voidReason }))
  // Purchases remain immutable; voids are separate backend records.
  const purchaseIds = new Set((current.state.purchases ?? []).map(p => p.id))
  changes.purchases = (next.purchases ?? []).filter(p => !purchaseIds.has(p.id))
  const expenseIds = new Set((next.expenses ?? []).map(e => e.id))
  changes.deletedExpenses = (current.state.expenses ?? []).filter(e => !expenseIds.has(e.id)).map(e => e.id)
  if (options?.confirmDraft || !equal(draftOf(next), draftOf(current.state))) changes.draft = draftOf(next)
  if (options?.confirmDraft) changes.confirmDraft = true
  if (Object.values(changes).every(value => Array.isArray(value) && value.length === 0)) return current

  return readWorkspace(await fetch('/api/workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ expectedRevision: current.revision, terminalId, ...changes }),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  }), terminalId)
}

export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
