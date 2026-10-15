import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import worker from '../worker/index.ts'
import { products, customers } from './fixtures/catalog.ts'

export function backendFixture({ authenticated = true, seedCatalog = true } = {}) {
  const db = new DatabaseSync(':memory:')
  for (const file of readdirSync(join(process.cwd(), 'migrations')).filter(file => file.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(process.cwd(), 'migrations', file), 'utf8'))
  }
  // Tests that need a stocked shop explicitly insert their fixtures into D1.
  // Production defaults and migrations never supply these records.
  if (seedCatalog) {
    const product = db.prepare(`INSERT INTO custom_products (id, code, en, bn, category, unit, price, cost, stock, purchased, kind, group_id, variant_name, art, color, detail, detail_bn, updated_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const item of products) product.run(item.id, item.code, item.en, item.category, item.unit, item.price, item.cost ?? null, item.stock, item.purchased ?? null, item.kind ?? null, item.groupId ?? null, item.variantName ?? null, item.art, item.color, item.detail, item.detailBn, '2026-01-01T00:00:00Z')
    const customer = db.prepare('INSERT INTO custom_customers (id, en, bn, phone, opening_balance) VALUES (?, ?, ?, ?, ?)')
    for (const item of customers) customer.run(item.id, item.en, item.bn, item.phone, item.openingBalance ?? 0)
  }
  const token = randomBytes(32).toString('hex')
  if (authenticated) db.prepare('INSERT INTO auth_sessions (token_hash, expires_at) VALUES (?, ?)').run(createHash('sha256').update(token).digest('hex'), Date.now() + 43200000)
  let batchQueue = Promise.resolve()
  const d1 = {
    prepare(sql: string) {
      let bound: any[] = []
      const statement = {
        bind(...values: any[]) { bound = values; return statement },
        async all() { return { results: db.prepare(sql).all(...bound), success: true } },
        async first() { return db.prepare(sql).get(...bound) ?? null },
      }
      return statement
    },
    batch(statements: any[]) {
      const work = batchQueue.catch(() => {}).then(async () => {
        db.exec('BEGIN')
        try {
          const results = []
          for (const statement of statements) results.push(await statement.all())
          db.exec('COMMIT')
          return results
        } catch (error) { db.exec('ROLLBACK'); throw error }
      })
      // Keep the queue usable after a deliberate rollback without leaving a
      // second rejected promise unhandled. The caller still receives `work`.
      batchQueue = work.then(() => {}, () => {})
      return work
    },
  }
  const env = { DB: d1 as any, ASSETS: { fetch: async () => new Response('asset') } as any }
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? url : new Request(new URL(String(url), 'https://hisab.test'), init)
    if (authenticated && !request.headers.has('Cookie')) request.headers.set('Cookie', `hisab_session=${token}`)
    return worker.fetch(request, env)
  }
  const post = (body: unknown) => fetch('/api/workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { db, env, fetch, post }
}
