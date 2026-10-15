import type { Env } from './index'

const cookieName = 'hisab_session'
const sessionDuration = 24 * 60 * 60 * 1000
const attemptWindow = 15 * 60 * 1000
const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))

export function authResponse(data: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (cookie) headers.set('Set-Cookie', cookie)
  return new Response(JSON.stringify(data), { status, headers })
}

function sessionCookie(request: Request, token: string, seconds: number) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}

function tokenFrom(request: Request) {
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return request.headers.get('Sec-Fetch-Site') !== 'cross-site'
  if (origin === new URL(request.url).origin) return request.headers.get('Sec-Fetch-Site') !== 'cross-site'
  try {
    const originHost = new URL(origin).hostname
    if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '[::1]') {
      return request.headers.get('Sec-Fetch-Site') !== 'cross-site'
    }
  } catch {}
  return false
}

export async function hasSession(request: Request, env: Env): Promise<boolean> {
  const token = tokenFrom(request)
  if (!token) return false
  const session = await env.DB.prepare('SELECT expires_at FROM auth_sessions WHERE token_hash = ?').bind(await hash(token)).first<{ expires_at: number }>()
  return !!session && session.expires_at > Date.now()
}

export async function handleAuth(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/auth/')) return null
  if (path === '/api/auth/session' && request.method === 'GET') {
    const authenticated = await hasSession(request, env)
    return authResponse({ ok: true, authenticated, user: authenticated ? 'admin' : null })
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = tokenFrom(request)
    if (token) await env.DB.batch([env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await hash(token))])
    return authResponse({ ok: true }, 200, sessionCookie(request, '', 0))
  }
  if (path !== '/api/auth/login') return authResponse({ error: 'Endpoint not found' }, 404)
  if (request.method !== 'POST') return authResponse({ error: 'Method not allowed' }, 405)
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return authResponse({ error: 'Expected JSON' }, 400)
  let body: { username?: unknown; password?: unknown }
  try {
    const text = await request.text()
    if (text.length > 1024) return authResponse({ error: 'Invalid login request' }, 400)
    body = JSON.parse(text)
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') return authResponse({ error: 'Invalid login request' }, 400)
  } catch { return authResponse({ error: 'Invalid login request' }, 400) }

  const now = Date.now()
  const clientHash = await hash(request.headers.get('CF-Connecting-IP') ?? 'local')
  const attempts = await env.DB.batch<{ attempts: number }>([
    env.DB.prepare('DELETE FROM auth_login_attempts WHERE window_start <= ?').bind(now - attemptWindow),
    env.DB.prepare(`INSERT INTO auth_login_attempts (client_hash, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(client_hash) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`).bind(clientHash, now),
  ])
  if (attempts[1].results[0].attempts > 10) {
    const response = authResponse({ error: 'Too many attempts. Try again in 15 minutes.' }, 429)
    response.headers.set('Retry-After', '900')
    return response
  }
  const supplied = await hash(`${body.username}\0${body.password}`)
  const expected = await hash('admin\0admin?6767')
  // Compare every digest character without an early exit.
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  if (difference) return authResponse({ error: 'Incorrect user ID or password.' }, 401)

  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const previous = tokenFrom(request)
  const statements = [
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM auth_login_attempts WHERE client_hash = ?').bind(clientHash),
    env.DB.prepare('INSERT INTO auth_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await hash(token), now + sessionDuration),
  ]
  if (previous) statements.push(env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await hash(previous)))
  await env.DB.batch(statements)
  return authResponse({ ok: true, authenticated: true, user: 'admin' }, 200, sessionCookie(request, token, sessionDuration / 1000))
}
