import { useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = document.documentElement.dataset.theme
    if (initial === 'light' || initial === 'dark') return initial
    try {
      const saved = localStorage.getItem('hisab-theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch { /* Storage can be unavailable while the system preference still works. */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useLayoutEffect(() => {
    const root = document.documentElement
    const changing = root.dataset.theme !== theme
    let frame: number | undefined
    const finishSwitch = () => root.classList.remove('theme-switching')
    if (changing) {
      // Commit the palette once instead of repainting every control throughout a fade.
      root.classList.add('theme-switching')
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(finishSwitch)
      })
    }

    root.dataset.theme = theme
    root.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181818' : '#e9e7de')
    try { localStorage.setItem('hisab-theme', theme) } catch { /* Keep the session preference. */ }

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      finishSwitch()
    }
  }, [theme])

  return [theme, setTheme] as const
}
