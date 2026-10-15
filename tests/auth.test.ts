import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { backendFixture } from './d1Support.ts'
import { AuthError, checkSession, signIn, signOut } from '../src/auth.ts'

function fixture(t: any) {
  const result = backendFixture({ authenticated: false })
  t.after(() => result.db.close())
  return result
}
const loginRequest = (password = 'admin?6767', extraHeaders = {}) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders },
  body: JSON.stringify({ username: 'admin', password }),
})
const cookieOf = (response: Response) => response.headers.get('Set-Cookie')!.split(';')[0]

test('signed-out visitors cannot read or mutate shop data; the SPA and health remain available', async t => {
  const f = fixture(t)
  for (const path of ['/api/workspace?terminalId=1', '/api/reports/summary']) assert.equal((await f.fetch(path)).status, 401)
  const mutation = await f.post({ expectedRevision: 0, terminalId: 1, expenses: [{ id: 'no-access', amount: 1 }] })
  assert.equal(mutation.status, 401)
  assert.equal(f.db.prepare('SELECT revision FROM app_revision').get()!.revision, 0)
  assert.equal((await f.fetch('/')).status, 200)
  assert.equal((await f.fetch('/api/health')).status, 200)
  const status = await f.fetch('/api/auth/session')
  assert.deepEqual(await status.json(), { ok: true, authenticated: false, user: null })
  assert.equal(status.headers.get('Cache-Control'), 'no-store')
})

test('only the supplied admin credentials open a hashed, HttpOnly, expiring server session', async t => {
  const f = fixture(t)
  assert.equal((await f.fetch('/api/auth/login', loginRequest('wrong'))).status, 401)
  assert.equal((await f.fetch('/api/auth/login', { ...loginRequest(), body: JSON.stringify({ username: 'other', password: 'admin?6767' }) })).status, 401)
  const response = await f.fetch('/api/auth/login', loginRequest())
  assert.equal(response.status, 200)
  const fullCookie = response.headers.get('Set-Cookie')!
  assert.match(fullCookie, /HttpOnly/)
  assert.match(fullCookie, /SameSite=Strict/)
  assert.match(fullCookie, /Secure/)
  assert.match(fullCookie, /Max-Age=86400/)
  const cookie = cookieOf(response)
  const token = cookie.split('=')[1]
  const saved = f.db.prepare('SELECT * FROM auth_sessions').get()!
  assert.notEqual(saved.token_hash, token)
  assert.equal(saved.token_hash, createHash('sha256').update(token).digest('hex'))
  assert.ok(Number(saved.expires_at) > Date.now())
  assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: cookie } })).status, 200)
  assert.equal((await f.fetch('/api/reports/summary', { headers: { Cookie: cookie } })).status, 200)
  assert.equal((await (await f.fetch('/api/auth/session', { headers: { Cookie: cookie } })).json() as any).authenticated, true)
})

test('logout revokes the session server-side and clears the cookie, including other copies of the token', async t => {
  const f = fixture(t)
  const cookie = cookieOf(await f.fetch('/api/auth/login', loginRequest()))
  const logout = await f.fetch('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('Set-Cookie')!, /Max-Age=0/)
  assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: cookie } })).status, 401)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get()!.count, 0)
})

test('expired, fabricated, and malformed session cookies cannot authorize access', async t => {
  const f = fixture(t)
  const cookie = cookieOf(await f.fetch('/api/auth/login', loginRequest()))
  f.db.exec('UPDATE auth_sessions SET expires_at = 0')
  for (const value of [cookie, `hisab_session=${'f'.repeat(64)}`, 'hisab_session=admin', 'unrelated=true']) {
    assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: value } })).status, 401)
  }
})

test('signing in again rotates the existing session', async t => {
  const f = fixture(t)
  const oldCookie = cookieOf(await f.fetch('/api/auth/login', loginRequest()))
  const newCookie = cookieOf(await f.fetch('/api/auth/login', loginRequest('admin?6767', { Cookie: oldCookie })))
  assert.notEqual(oldCookie, newCookie)
  assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: oldCookie } })).status, 401)
  assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: newCookie } })).status, 200)
})

test('cross-origin login, logout, and financial writes are rejected before changing data', async t => {
  const f = fixture(t)
  const cookie = cookieOf(await f.fetch('/api/auth/login', loginRequest()))
  for (const path of ['/api/auth/login', '/api/auth/logout', '/api/workspace']) {
    assert.equal((await f.fetch(path, loginRequest('admin?6767', { Origin: 'https://other.test', Cookie: cookie }))).status, 403)
  }
  assert.equal((await f.fetch('/api/auth/login', loginRequest('admin?6767', { Origin: 'http://localhost:5173' }))).status, 200)
  assert.equal((await f.fetch('/api/auth/login', loginRequest('admin?6767', { Origin: 'http://127.0.0.1:8787' }))).status, 200)
  assert.equal((await f.fetch('/api/auth/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site', Cookie: cookie } })).status, 403)
  assert.equal((await f.fetch('/api/workspace', { headers: { Cookie: cookie } })).status, 200)
})

test('repeated login attempts are limited in D1 and the window resets after 15 minutes', async t => {
  const f = fixture(t)
  for (let attempt = 0; attempt < 10; attempt++) assert.equal((await f.fetch('/api/auth/login', loginRequest('bad'))).status, 401)
  const limited = await f.fetch('/api/auth/login', loginRequest())
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('Retry-After'), '900')
  f.db.exec('UPDATE auth_login_attempts SET window_start = 0')
  assert.equal((await f.fetch('/api/auth/login', loginRequest())).status, 200)
})

test('malformed login payloads never create a session', async t => {
  const f = fixture(t)
  for (const body of ['null', '{', '{}', JSON.stringify({ username: ['admin'], password: 'admin?6767' }), JSON.stringify({ username: 'admin', password: 'x'.repeat(1100) })]) {
    assert.equal((await f.fetch('/api/auth/login', { ...loginRequest(), body })).status, 400)
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get()!.count, 0)
})

test('the browser auth client confirms server responses and never treats failed login as success', async t => {
  const f = fixture(t)
  let cookie = ''
  t.mock.method(globalThis, 'fetch', async (url: any, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (cookie) headers.set('Cookie', cookie)
    const response = await f.fetch(url, { ...init, headers })
    if (response.headers.has('Set-Cookie')) cookie = cookieOf(response)
    return response
  })
  assert.equal(await checkSession(), false)
  await assert.rejects(signIn('admin', 'bad'), error => error instanceof AuthError && error.status === 401)
  await signIn('admin', 'admin?6767')
  assert.equal(await checkSession(), true)
  await signOut()
  assert.equal(await checkSession(), false)
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>not the API</html>'))
  await assert.rejects(signIn('admin', 'admin?6767'), AuthError)
})
