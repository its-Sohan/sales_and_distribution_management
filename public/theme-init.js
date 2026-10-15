// Apply the preference before React and the stylesheets load.
(() => {
  let saved
  try { saved = localStorage.getItem('hisab-theme') } catch { /* Use the system preference. */ }
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181818' : '#e9e7de')
})()
