export class AuthError extends Error {
  constructor(public status = 0) { super('Authentication request failed.') }
}

async function authRequest(path: string, body?: { username: string; password: string }) {
  let response: Response
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: path === 'session' ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch { throw new AuthError() }
  if (!response.ok) throw new AuthError(response.status)
  let data
  try { data = await response.json() } catch { throw new AuthError() }
  if (data?.ok !== true) throw new AuthError()
  if (path !== 'logout' && typeof data.authenticated !== 'boolean') throw new AuthError()
  return data as { authenticated?: boolean }
}

export const checkSession = async () => (await authRequest('session')).authenticated === true
export const signIn = async (username: string, password: string) => {
  if (!(await authRequest('login', { username, password })).authenticated) throw new AuthError()
}
export const signOut = async () => { await authRequest('logout') }

export function notifySessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hisab-session-expired'))
}
