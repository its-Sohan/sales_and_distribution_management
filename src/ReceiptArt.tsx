import { useId } from 'react'
import logo from './assets/mic-logo.jpg'
import equipment from './assets/receipt-equipment.png'

// Brand badge (MIC · Masum IT Cottage). Decorative: the brand name is printed as text beside it.
export function CottageLogo({ className = '' }: { className?: string }) {
  return <img className={className} src={logo} alt="" aria-hidden="true" draggable={false} decoding="sync"/>
}

export function ReceiptDevices() {
  return <img className="memo-devices" src={equipment} alt="" aria-hidden="true" draggable={false} decoding="sync"/>
}

export function ReceiptServiceIcon({ name }: { name: 'pc' | 'laptop' | 'cctv' | 'network' | 'accessories' | 'support' }) {
  const paths = {
    pc: <><rect x="3" y="3" width="18" height="13" rx="1"/><path d="M12 16v5m-5 0h10"/></>,
    laptop: <><rect x="4" y="3" width="16" height="14" rx="1"/><path d="M2 21h20l-2-4H4z"/></>,
    cctv: <><path d="m3 7 14-4 4 8-14 4z" fill="currentColor" stroke="none"/><path d="m17 13 4 2v-5M9 15v5h6v-4"/></>,
    network: <><circle cx="12" cy="4" r="3" fill="currentColor" stroke="none"/><path d="M12 7v6M5 17v-4h14v4"/><rect x="2" y="17" width="6" height="5" rx="1" fill="currentColor" stroke="none"/><rect x="9" y="17" width="6" height="5" rx="1" fill="currentColor" stroke="none"/><rect x="16" y="17" width="6" height="5" rx="1" fill="currentColor" stroke="none"/></>,
    accessories: <><path d="m9 2-.7 3-2.4 1.4L3 5.6l-2 3.5 2.2 2.1v2.8L1 16l2 3.5 2.9-.9 2.4 1.4.7 3h4l.7-3 2.4-1.4 2.9.9 2-3.5-2.2-2.1v-2.8L21 9.1l-2-3.5-2.9.8L13.7 5 13 2z" fill="currentColor" stroke="none"/><circle cx="11" cy="12.5" r="4" fill="white" stroke="none"/></>,
    support: <><path d="m5 3 4 4-2 2-4-4v4l4 3 3-1 9 10 3-3-10-9 1-3-3-4H6l4 4-2 2z" fill="currentColor" stroke="none"/><path d="m4 20 5-5m6-6 5-5"/></>,
  }
  return <svg className="memo-service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function PaymentIcon({ name }: { name: 'cash' | 'bank' }) {
  return <svg className="memo-payment-icon" viewBox="0 0 24 24" aria-hidden="true">
    {name === 'cash' ? <><rect x="2" y="4" width="20" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M3 9q5 0 5-4m8 0q0 4 5 4M3 15q5 0 5 4m8 0q0-4 5-4" fill="none" stroke="currentColor"/><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 9v6m-1-5h2m-2 4h2" stroke="white" strokeWidth="1.3"/></> : <><path d="m12 2 11 5H1zM2 9h20v2H2zM2 20h20v2H2zM4 12h3v7H4zM10.5 12h3v7h-3zM17 12h3v7h-3z" fill="currentColor"/></>}
  </svg>
}

export function MemoSectionIcon({ name }: { name: 'terms' | 'payment' }) {
  return <svg className="memo-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'terms' ? <><path d="M14 3H5v18h14V8zM14 3v5h5"/><path d="M8 11h8M8 15h8M8 18h5"/></> : <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M15 15h2"/></>}
  </svg>
}

export function ContactIcon({ name }: { name: 'pin' | 'phone' | 'whatsapp' | 'email' | 'facebook' }) {
  const paths = {
    pin: <><path d="M12 22s8-9 8-14a8 8 0 0 0-16 0c0 5 8 14 8 14" fill="currentColor"/><circle cx="12" cy="8" r="3" fill="white"/></>,
    phone: <><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="m7 5 3 4-2 2q2 4 5 5l2-2 4 2q-2 5-6 3Q5 16 5 8z" fill="white"/></>,
    whatsapp: <><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="M5 20l1-4a8 8 0 1 1 4 3z" fill="none" stroke="white" strokeWidth="1.4"/><path d="m8 7 2 3-1 1 4 4 1-1 3 1q-1 3-4 1-5-2-6-7z" fill="white"/></>,
    email: <><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="M5 7h14v10H5z" fill="white"/><path d="m5 7 7 6 7-6M5 17l5-5m9 5-5-5" fill="none" stroke="currentColor" strokeWidth="1.4"/></>,
    facebook: <><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="M14 5h3V2h-3q-5 0-5 5v3H6v4h3v10h4V14h3l1-4h-4V7q0-2 1-2" fill="white" transform="translate(1 1) scale(.85)"/></>,
  }
  return <svg className={`memo-contact-icon memo-contact-${name}`} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function MemoWaves({ bottom = false }: { bottom?: boolean }) {
  const id = useId().replaceAll(':', '')
  if (!bottom) return <svg className="memo-waves memo-waves-top" viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-green`}><stop stopColor="#58b500"/><stop offset="1" stopColor="#00823c"/></linearGradient>
      <linearGradient id={`${id}-blue`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#f2fcff"/><stop offset=".6" stopColor="#06b6e0"/><stop offset="1" stopColor="#62dcf1"/></linearGradient>
    </defs>
    <path d="M0 0h210Q76 13 0 87z" fill={`url(#${id}-green)`}/>
    <path d="M0 83Q75 14 210 0" fill="none" stroke="#8aca12" strokeWidth="9"/>
    <path d="M0 77Q75 10 204 0" fill="none" stroke="white" strokeWidth="3"/>
    <path d="M552 0h248v179Q705 236 652 161 623 64 552 0z" fill={`url(#${id}-blue)`}/>
    <path d="M542 0Q614 56 643 155 699 241 800 181v13Q689 255 633 163 605 60 528 0z" fill="#78bd13"/>
    <path d="M539 0Q612 58 640 160 697 247 800 188" fill="none" stroke="white" strokeWidth="3"/>
  </svg>
  return <svg className="memo-waves memo-waves-bottom" viewBox="0 0 800 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-wave`}><stop stopColor="#00863c"/><stop offset=".4" stopColor="#006a33"/><stop offset="1" stopColor="#00b7ef"/></linearGradient></defs>
    <path d="M0 30q300 135 800-22v92H0z" fill={`url(#${id}-wave)`}/>
    <path d="M0 30q300 135 800-22v11Q300 151 0 41z" fill="#83c911"/>
    <path d="M0 45q300 135 800-22" fill="none" stroke="white" strokeWidth="3"/>
  </svg>
}
