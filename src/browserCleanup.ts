// Retire storage created by earlier releases. Financial data is never read
// from this database or written to browser storage by the current application.
export async function clearRetiredBrowserStorage(): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('hisab-counter')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Could not erase the previous browser database.'))
      request.onblocked = () => reject(new Error('Close other Hisab tabs to erase the previous browser database, then try again.'))
    })
  }
  try { localStorage.removeItem('hisab-device-id') } catch { /* No financial data is stored here. */ }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.filter(registration => [registration.active, registration.waiting, registration.installing]
      .some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js'))
      .map(registration => registration.unregister()))
  }
  if (typeof caches !== 'undefined') {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('hisab-')).map(key => caches.delete(key)))
  }
}
