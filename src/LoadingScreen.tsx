import type { CSSProperties } from 'react'
import { Icon, PixelMark } from './Icons'
import { translator } from './i18n'
import type { Lang } from './model'
import './loading.css'

export function LoadingScreen({ lang, phase = 'data', message, busy = false, variant = 'full', onRetry, onSignOut }: {
  lang: Lang
  phase?: 'boot' | 'data'
  message?: string
  busy?: boolean
  variant?: 'full' | 'inline'
  onRetry?: () => void
  onSignOut?: () => void
}) {
  const t = translator(lang)
  const steps = phase === 'boot'
    ? [t('loadingCheckingSession'), t('loadingOpeningCounter')]
    : [t('loadingData'), t('loadingReadingStock'), t('loadingCheckingAccounts'), t('loadingOpeningCounter')]
  // The inline variant fills a panel while a lazy view loads, keeping the brand
  // and sweep animation without the full-viewport layout.
  if (variant === 'inline') return <div className={`loading-screen loading-screen--inline lang-${lang}`}>
    <div className="loading-brand"><PixelMark/><span className="loading-wordmark">hisab<span>.</span></span></div>
    <div className="loading-rule" aria-hidden="true"><span className="loading-rule-sweep"/></div>
    <p className="loading-inline-label" role="status" aria-live="polite">{t('loading')}</p>
  </div>
  return <div className={`loading-screen lang-${lang}${message ? ' loading-screen--error' : ''}`}>
    <div className="loading-brand"><PixelMark/><span className="loading-wordmark">hisab<span>.</span></span></div>
    <div className="loading-rule" aria-hidden="true"><span className="loading-rule-sweep"/></div>
    {message
      ? <p className="loading-message" aria-hidden="true">{message}</p>
      : <div className="loading-status" data-count={steps.length} aria-hidden="true">{steps.map((step, index) => <span key={step} style={{ '--i': index, '--n': steps.length } as CSSProperties}>{step}</span>)}</div>}
    <span className="sr-only" role="status" aria-live="polite">{message ?? steps[0]}</span>
    {(onRetry || onSignOut) && <div className="loading-actions">
      {onRetry && <button type="button" className="primary-button" onClick={onRetry} disabled={busy}>{t('refreshData')}</button>}
      {onSignOut && <button type="button" className="text-button" onClick={onSignOut} disabled={busy}>{t('loadingSignOut')}<Icon name="logout" size={16}/></button>}
    </div>}
  </div>
}
