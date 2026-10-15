import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AuthError } from './auth'
import { Icon, PixelMark } from './Icons'
import { LoginArt } from './LoginArt'
import type { Lang } from './model'
import './login.css'

const copy = {
  en: {
    workspace: 'MAYER DOWA TELECOM & IT ACCESSORIES', hero: 'Your shop.', heroAccent: 'All in order.',
    description: 'From the first sale to the last receipt. One familiar place for your counter, stock, and accounts.',
    stock: 'Stock', accounts: 'Customers', suppliers: 'Suppliers', reports: 'Reports', ledger: 'A little clarity. Every day.',
    access: 'ADMIN ACCESS', welcome: 'Welcome back', hint: 'Sign in to open your shop workspace.',
    username: 'User ID', usernameHint: 'Enter your user ID', password: 'Password', passwordHint: 'Enter your password',
    show: 'Show password', hide: 'Hide password', submit: 'Sign in', signingIn: 'Signing in', checking: 'Checking your session',
    caps: 'Caps Lock is on.', invalid: 'The user ID or password is incorrect. Please try again.',
    unavailable: 'Unable to connect. Check your connection and try again.', limited: 'Too many attempts. Please try again in 15 minutes.',
    expired: 'Your session has ended. Please sign in again.', retry: 'Try connecting again',
    session: 'Your workspace stays signed in for 24 hours.', footer: 'Made for the way you work.',
    themeLight: 'Switch to light theme', themeDark: 'Switch to dark theme',
  },
  bn: {
    workspace: 'আপনার দোকানের কর্মক্ষেত্র', hero: 'আপনার দোকান।', heroAccent: 'সব হিসাব একসাথে।',
    description: 'প্রথম বিক্রি থেকে শেষ রসিদ। কাউন্টার, স্টক ও হিসাব—সবকিছু এক পরিচিত জায়গায়।',
    stock: 'স্টক', accounts: 'গ্রাহক', suppliers: 'সরবরাহকারী', reports: 'রিপোর্ট', ledger: 'প্রতিদিনের হিসাব, সহজ ও পরিষ্কার।',
    access: 'অ্যাডমিন প্রবেশ', welcome: 'স্বাগতম', hint: 'দোকানের কর্মক্ষেত্র খুলতে সাইন ইন করুন।',
    username: 'ইউজার আইডি', usernameHint: 'আপনার ইউজার আইডি লিখুন', password: 'পাসওয়ার্ড', passwordHint: 'আপনার পাসওয়ার্ড লিখুন',
    show: 'পাসওয়ার্ড দেখুন', hide: 'পাসওয়ার্ড লুকান', submit: 'সাইন ইন', signingIn: 'সাইন ইন হচ্ছে', checking: 'সেশন যাচাই হচ্ছে',
    caps: 'ক্যাপস লক চালু আছে।', invalid: 'ইউজার আইডি বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।',
    unavailable: 'সংযোগ করা যাচ্ছে না। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।', limited: 'অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।',
    expired: 'আপনার সেশন শেষ হয়েছে। আবার সাইন ইন করুন।', retry: 'আবার সংযোগ করুন',
    session: 'আপনার কর্মক্ষেত্রে ২৪ ঘণ্টা সাইন ইন থাকবে।', footer: 'আপনার দোকানের কাজের জন্য তৈরি।',
    themeLight: 'লাইট থিম চালু করুন', themeDark: 'ডার্ক থিম চালু করুন',
  },
}

export function Login({ lang, onLanguage, theme, onTheme, checking, unavailable, expired, onRetry, onLogin }: {
  lang: Lang; onLanguage: (lang: Lang) => void; theme: 'light' | 'dark'; onTheme: () => void;
  checking: boolean; unavailable: boolean; expired: boolean; onRetry: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const t = copy[lang]
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'invalid' | 'unavailable' | 'limited' | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  useEffect(() => { if (!checking) usernameRef.current?.focus() }, [checking])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || checking) return
    submitting.current = true
    setBusy(true); setError(null)
    try { await onLogin(username.trim(), password) }
    catch (cause) {
      setError(cause instanceof AuthError && cause.status === 401 ? 'invalid' : cause instanceof AuthError && cause.status === 429 ? 'limited' : 'unavailable')
    } finally { submitting.current = false; setBusy(false) }
  }
  const message = error ? t[error] : unavailable ? t.unavailable : expired ? t.expired : null

  return <div className={`login-page lang-${lang}`}>
    <a className="skip-link" href="#login-content">{lang === 'bn' ? 'মূল বিষয়বস্তুতে যান' : 'Skip to main content'}</a>
    <header className="login-header">
      <a className="login-brand" href="/" aria-label="Hisab — Mayer Dowa Telecom &amp; IT Accessories"><PixelMark/><span className="wordmark">hisab<span>.</span></span></a>
      <span className="login-brand-divider"/>
      <span className="login-shop"><span>Mayer Dowa</span> <strong>Telecom &amp; IT</strong> <span>Accessories</span></span>
      <div className="login-preferences">
        <button className="login-language" type="button" onClick={() => onLanguage(lang === 'en' ? 'bn' : 'en')} aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}><span className={lang === 'en' ? 'selected' : ''}>EN</span><span aria-hidden="true">/</span><span className={lang === 'bn' ? 'selected' : ''}>বাং</span></button>
        <button className="login-theme" type="button" onClick={onTheme} aria-label={theme === 'dark' ? t.themeLight : t.themeDark}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18}/></button>
      </div>
    </header>

    <main id="login-content" tabIndex={-1} className="login-main">
      <section className="login-intro" aria-labelledby="login-intro-heading">
        <p className="login-eyebrow"><span className="login-small-square"/>{t.workspace}</p>
        <h2 id="login-intro-heading">{t.hero}<br/><span>{t.heroAccent}</span></h2>
        <p className="login-description">{t.description}</p>
        <figure className="login-ledger-art">
          <LoginArt/>
          <figcaption className="login-ledger-caption">{t.ledger}</figcaption>
        </figure>
        <div className="login-feature-row">{([t.stock, t.accounts, t.suppliers, t.reports]).map((label, index) => <span key={index}><span className="login-feature-number" aria-hidden="true">0{index + 1}</span>{label}</span>)}</div>
      </section>

      <section className="login-card" aria-labelledby="login-heading" aria-busy={busy || checking}>
        <div className="login-card-top"><span className="login-lock"><Icon name="lock" size={22}/></span><span className="login-eyebrow">{t.access}</span></div>
        <h1 id="login-heading">{t.welcome}<span className="login-heading-dot">.</span></h1>
        <p className="login-card-hint">{t.hint}</p>
        <form onSubmit={submit}>
          <fieldset className="login-fields" disabled={busy || checking}>
            <legend className="sr-only">{t.access}</legend>
            <label htmlFor="login-username">{t.username}</label>
            <div className="login-input-wrap"><Icon name="accounts" size={18}/><input ref={usernameRef} id="login-username" name="username" type="text" value={username} onChange={event => { setUsername(event.target.value); setError(null) }} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder={t.usernameHint} required aria-invalid={error === 'invalid'} aria-describedby={message ? 'login-message' : undefined}/></div>
            <label htmlFor="login-password">{t.password}</label>
            <div className="login-input-wrap"><Icon name="lock" size={18}/><input id="login-password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={event => { setPassword(event.target.value); setError(null) }} onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} autoComplete="current-password" maxLength={200} placeholder={t.passwordHint} required aria-invalid={error === 'invalid'} aria-describedby={[message ? 'login-message' : '', capsLock ? 'login-caps' : ''].filter(Boolean).join(' ') || undefined}/><button className="login-password-toggle" type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? t.hide : t.show} aria-pressed={visible}><Icon name={visible ? 'eye-off' : 'eye'} size={19}/></button></div>
            {capsLock && <p id="login-caps" className="login-caps" role="status">{t.caps}</p>}
            {message && <div id="login-message" className={`login-message${!error && expired && !unavailable ? ' login-message-info' : ''}`} role="alert"><p>{message}</p>{unavailable && <button type="button" onClick={onRetry}>{t.retry}<Icon name="reset" size={14}/></button>}</div>}
            <button className="login-submit" type="submit" disabled={unavailable}>{busy || checking ? <><span className="login-spinner"/><span>{checking ? t.checking : t.signingIn}</span></> : <><span>{t.submit}</span><Icon name="arrow" size={20}/></>}</button>
          </fieldset>
        </form>
        <div className="login-session-note"><Icon name="shield" size={16}/><span>{t.session}</span></div>
      </section>
    </main>

    <footer className="login-footer"><span>MAYER DOWA TELECOM &amp; IT ACCESSORIES</span><span>{t.footer}</span><span>HISAB <span className="login-footer-dot">/</span> {new Date().getFullYear()}</span></footer>
  </div>
}
