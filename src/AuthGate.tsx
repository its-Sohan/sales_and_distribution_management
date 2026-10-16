import { lazy, useCallback, useEffect, useRef, useState } from 'react'
import { DeferredContent } from './DeferredContent'
import { LoadingScreen } from './LoadingScreen'
import { checkSession, signIn, signOut } from './auth'
import { Login } from './Login'
import type { Lang } from './model'
import { useTheme } from './useTheme'

const App = lazy(() => import('./App'))

export default function AuthGate() {
  const [phase, setPhase] = useState<'checking' | 'signed-out' | 'signed-in' | 'unavailable'>('checking')
  const [expired, setExpired] = useState(false)
  const [theme, setTheme] = useTheme()
  const [lang, setLang] = useState<Lang>(() => { try { return localStorage.getItem('hisab-language') === 'bn' ? 'bn' : 'en' } catch { return 'en' } })
  const generation = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)
  const refreshSession = useCallback(async () => {
    const current = ++generation.current
    setPhase('checking')
    try {
      const authenticated = await checkSession()
      if (current === generation.current) setPhase(authenticated ? 'signed-in' : 'signed-out')
    } catch { if (current === generation.current) setPhase('unavailable') }
  }, [])

  useEffect(() => {
    void refreshSession()
    const expire = () => { generation.current++; setExpired(true); setPhase('signed-out') }
    window.addEventListener('hisab-session-expired', expire)
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('hisab-auth')
      channel.current.onmessage = event => {
        if (event.data === 'signed-out') expire()
        if (event.data === 'signed-in') void refreshSession()
      }
    }
    return () => { generation.current++; window.removeEventListener('hisab-session-expired', expire); channel.current?.close(); channel.current = null }
  }, [refreshSession])
  useEffect(() => {
    document.documentElement.lang = lang
    try { localStorage.setItem('hisab-language', lang) } catch { /* Keep the current language. */ }
  }, [lang])
  useEffect(() => {
    if (phase !== 'signed-in') document.title = `${lang === 'bn' ? 'সাইন ইন' : 'Sign in'} | Hisab`
  }, [phase, lang])

  const login = async (username: string, password: string) => {
    await signIn(username, password)
    generation.current++; setExpired(false); setPhase('signed-in')
    channel.current?.postMessage('signed-in')
  }
  const logout = async () => {
    await signOut()
    generation.current++; setExpired(false); setPhase('signed-out')
    channel.current?.postMessage('signed-out')
  }

  if (phase === 'checking') return <LoadingScreen lang={lang} phase="boot"/>
  if (phase === 'signed-in') return <DeferredContent lang={lang}><App onSignOut={logout} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}/></DeferredContent>
  return <Login lang={lang} onLanguage={setLang} theme={theme} onTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} checking={false} unavailable={phase === 'unavailable'} expired={expired} onRetry={() => void refreshSession()} onLogin={login}/>
}
