import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthGate from './AuthGate'
// UI roles: display, sans, and mono, with Hind Siliguri as the Bangla/৳ fallback.
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/hind-siliguri/400.css'
import '@fontsource/hind-siliguri/500.css'
import '@fontsource/hind-siliguri/600.css'
// Print and PDF faces: the A4 cash memo, return slip, and report exports.
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/noto-sans-bengali'
import './styles.css'
import './theme.css'
import './web-accessibility.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthGate /></React.StrictMode>)
