// Exercise the production build against an isolated, in-memory shop API.
// No requests are made to the real shop or its database.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { preview } from 'vite'

const compiled = ts.transpileModule(await readFile('src/model.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { initialState, makeReceipt } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const product = { id: 'web-audit-mouse', code: 'WEB-AUDIT', en: 'Web audit mouse', detail: 'Isolated browser fixture', detailBn: '', category: 'staples', unit: 'pc', stock: 45000, purchased: 45000, art: 'daily', color: '#e4eaff', cost: 550, price: 700, inventoryValue: 24750, valuationStatus: 'verified' }
let state = { ...initialState, lines: [], receipts: [], customProducts: [product], customCustomers: [{ id: 'c1', en: 'Audit customer', bn: 'পরীক্ষামূলক ক্রেতা', phone: '01700000000' }], terminalId: 1 }
state.receipts = [makeReceipt({ ...state, lines: [{ productId: product.id, quantity: 1000, unitPrice: 700 }], customerId: 'c1' }, 700, 'cash', 1)]
state.suppliers = [{ id: 'web-supplier', name: 'Audit supplier', phone: '01700000000', address: 'Dhaka' }]
let revision = 1, workspaceReads = 0, revisionReads = 0, writes = 0, signedIn = false
let emptyShop = true
let holdRevision = null, holdWorkspace = null
const artifactDirectory = await mkdtemp(join(tmpdir(), 'hisab-web-checks-'))
const profile = await mkdtemp(join(tmpdir(), 'hisab-web-browser-'))
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 4173 }, plugins: [{
  name: 'isolated-audit-api',
  configurePreviewServer(server) {
    server.middlewares.use('/api', async (request, response) => {
      const send = value => { response.writeHead(200, headers); response.end(JSON.stringify(value)) }
      if (request.url === '/auth/session') return send({ ok: true, authenticated: signedIn })
      if (request.url === '/auth/login') { signedIn = true; return send({ ok: true, authenticated: true }) }
      if (request.url === '/auth/logout') { signedIn = false; return send({ ok: true }) }
      if (request.url === '/workspace/revision') {
        revisionReads++
        if (holdRevision) await holdRevision
        return send({ ok: true, revision })
      }
      if (request.method === 'POST') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const mutation = JSON.parse(Buffer.concat(chunks))
        assert.equal(mutation.expectedRevision, revision, 'Client must use the latest confirmed revision')
        for (const section of ['receipts', 'transactions', 'customProducts', 'customCustomers', 'purchases', 'expenses', 'adjustments', 'returns', 'suppliers', 'supplierPayments', 'purchaseSettlements', 'stockReceivings']) {
          const changes = new Map((state[section] ?? []).map(item => [item.id, item]))
          for (const item of mutation[section] ?? []) changes.set(item.id, item)
          state[section] = [...changes.values()]
        }
        if (mutation.draft) state = { ...state, ...mutation.draft }
        revision++; writes++
      } else {
        workspaceReads++
        if (holdWorkspace) await holdWorkspace
      }
      const terminalId = Number(new URL(request.url, 'http://test').searchParams.get('terminalId') ?? state.terminalId)
      send({ ok: true, revision, state: { ...(emptyShop ? initialState : state), terminalId } })
    })
  },
}] })
let browser
const timeout = setTimeout(() => { console.error('Web UI checks timed out'); browser?.kill(); process.exit(1) }, 120000)
try {
  browser = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  let id = 0, buffer = ''
  const pending = new Map(), exceptions = [], requests = []
  browser.on('error', error => { for (const request of pending.values()) request.reject(error) })
  browser.stdio[4].on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1)
      if (message.id) {
        const request = pending.get(message.id); pending.delete(message.id)
        if (message.error) request.reject(new Error(JSON.stringify(message.error)))
        else request.resolve(message.result)
      } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails)
      else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
    }
  })
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const request = ++id; pending.set(request, { resolve, reject })
    browser.stdio[3].write(JSON.stringify({ id: request, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params = {}) => call(method, params, sessionId)
  await page('Page.enable'); await page('Runtime.enable'); await page('Network.enable')
  await page('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective));` })
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifactDirectory })
  const evaluate = async expression => {
    const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const wait = async (check, description) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (await check()) return
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    console.error(await evaluate(`({dialogs:[...document.querySelectorAll('dialog')].map(node=>({open:node.open,modal:node.matches(':modal'),className:node.className})),active:document.activeElement?.outerHTML.slice(0,200)})`))
    throw new Error(`Timed out: ${description}`)
  }
  const waitFor = expression => wait(() => evaluate(expression), expression)
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const pointerClick = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    const { x, y } = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await page('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }
  const fill = async (selector, value) => {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
  }
  const key = async (key, code = key, modifiers = 0) => {
    const virtualKeyCode = { Enter: 13, Tab: 9, Escape: 27 }[key]
    const event = { key, code, modifiers, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode }
    await page('Input.dispatchKeyEvent', { ...event, type: 'keyDown' })
    await page('Input.dispatchKeyEvent', { ...event, type: 'keyUp' })
  }
  const screenshot = async name => {
    const { data } = await page('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(artifactDirectory, `${name}.png`), Buffer.from(data, 'base64'))
  }
  await page('Page.navigate', { url: server.resolvedUrls.local[0] })
  await waitFor('!!document.querySelector("#login-username:not(:disabled)")')
  assert.equal(await evaluate('document.title'), 'Sign in | Hisab')
  assert.ok(!requests.some(url => /\/assets\/(App-|Reports-|Suppliers-|exceljs|customerHistoryPdf)/.test(url)), 'Login must not fetch workspace modules')
  await evaluate(`document.querySelector('.skip-link').focus()`)
  assert.ok(await evaluate(`document.querySelector('.skip-link').getBoundingClientRect().top >= 0`))
  await key('Enter')
  assert.equal(await evaluate('document.activeElement.id'), 'login-content')
  await screenshot('login-desktop')
  await fill('#login-username', 'audit'); await fill('#login-password', 'isolated-test')
  await evaluate('document.querySelector(".login-card form").requestSubmit()')
  await waitFor('!!document.querySelector(".product-list")')
  assert.equal(await evaluate('document.title'), 'Counter | Hisab')
  assert.equal(await evaluate('document.querySelectorAll(".product-row, .bill-row").length'), 0)
  await page('Page.reload')
  await waitFor('!!document.querySelector(".product-list")')
  assert.equal(await evaluate('document.querySelectorAll(".product-row, .bill-row").length'), 0)
  emptyShop = false; revision++
  await evaluate('document.dispatchEvent(new Event("visibilitychange"))')
  await waitFor('!!document.querySelector(".product-row")')
  assert.equal(await evaluate('document.querySelectorAll(".product-row").length'), 1, 'Only records supplied by the API may populate the catalog')
  console.log('PASS: fresh production deployment stays empty after reload; only API records populate it')
  console.log('PASS: production login, skip link, and lazy workspace loading')

  await evaluate(`Array.from(document.querySelectorAll('.product-row')).find(row=>row.textContent.includes('Web audit mouse')).click()`)
  await fill('.sale-price-field input', '700')
  await evaluate(`document.querySelector('.sale-price-field input').focus()`)
  let releaseRevision
  holdRevision = new Promise(resolve => { releaseRevision = resolve })
  const readCount = workspaceReads, revisionCount = revisionReads
  await evaluate('document.dispatchEvent(new Event("visibilitychange"))')
  await wait(() => revisionReads > revisionCount, 'revision check starts')
  assert.equal(await evaluate('document.querySelector("main").inert'), false)
  assert.equal(await evaluate('document.activeElement.matches(".sale-price-field input")'), true)
  assert.equal(await evaluate('document.activeElement.value'), '700')
  await evaluate('document.querySelector(".quantity-lane form").requestSubmit()')
  await evaluate('document.querySelector(".quantity-lane form").requestSubmit()')
  await waitFor('document.querySelectorAll(".bill-row").length === 1')
  assert.equal(writes, 1, 'Pending refresh must not swallow writes')
  holdRevision = null; releaseRevision()
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))')
  assert.equal(workspaceReads, readCount, 'Cancelled or unchanged revision must not fetch history')
  assert.equal(await evaluate('document.querySelectorAll(".bill-row").length'), 1)
  console.log('PASS: background revision checks preserve typing and yield to writes')

  await click('.bill-row .remove-line')
  await waitFor('!!document.querySelector(".toast button:not(.icon-button)")')
  await evaluate('new Promise(resolve=>setTimeout(resolve,1800))')
  assert.equal(await evaluate('!!document.querySelector(".toast button:not(.icon-button)")'), true)
  await click('.toast button:not(.icon-button)')
  await waitFor('document.querySelectorAll(".bill-row").length === 1')
  console.log('PASS: Undo remains available and restores the bill')

  const settings = '.side-bottom button[aria-label="Settings"]'
  await evaluate(`document.querySelector('${settings}').focus()`); await click(settings)
  await waitFor('!!document.querySelector("dialog:modal #terminal-number")')
  assert.equal(await evaluate('document.querySelector("#terminal-number").labels[0].textContent'), 'Terminal number')
  await evaluate('document.querySelector(".side-nav button").focus()')
  assert.equal(await evaluate('!!document.activeElement.closest("dialog:modal")'), true)
  for (let i = 0; i < 14; i++) await key('Tab')
  assert.equal(await evaluate('!!document.activeElement.closest(".sidebar")'), false)
  let releaseWorkspace
  holdWorkspace = new Promise(resolve => { releaseWorkspace = resolve })
  await fill('#terminal-number', '2')
  await waitFor('document.querySelector(".modal-close").disabled')
  await key('Escape')
  assert.equal(await evaluate('!!document.querySelector("dialog:modal #terminal-number")'), true)
  holdWorkspace = null; releaseWorkspace()
  await waitFor('!document.querySelector(".modal-close").disabled')
  await key('Escape')
  await waitFor('!document.querySelector("dialog[open]")')
  assert.equal(await evaluate(`document.activeElement.matches('${settings}')`), true)
  console.log('PASS: native modal isolation, save lock, Escape, and return focus')

  await click('.find-bill-trigger'); await waitFor('!!document.querySelector(".bill-finder-row")')
  await click('.bill-finder-row'); await waitFor('!!document.querySelector(".cash-memo")')
  await evaluate('document.fonts.ready')
  const pdf = await page('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
  assert.equal(Buffer.from(pdf.data, 'base64').subarray(0, 4).toString(), '%PDF')
  await screenshot('receipt-desktop')
  await writeFile(join(artifactDirectory, 'receipt.pdf'), Buffer.from(pdf.data, 'base64'))
  await key('Escape'); await waitFor('!document.querySelector("dialog[open]")')
  console.log('PASS: saved receipt prints from a native dialog')

  await click('.side-nav button[aria-label="Reports"]'); await waitFor('!!document.querySelector(".report-navigation")')
  assert.equal(await evaluate('document.title'), 'Reports | Hisab')
  await click('.report-period-summary'); await waitFor('!!document.querySelector(".report-period-editor:modal")')
  await key('Escape'); await waitFor('!document.querySelector("dialog[open]")')
  await click('.report-top-items button'); await waitFor('!!document.querySelector(".dialog-itemStats")')
  // Check that an independently dismissible native child cannot dismiss its shell.
  await evaluate(`(()=>{const child=document.createElement('dialog');child.textContent='Nested dialog';const trigger=document.createElement('button');trigger.id='nested-trigger';trigger.textContent='Open nested dialog';trigger.addEventListener('click',()=>child.showModal());document.querySelector('.dialog-itemStats').append(trigger,child)})()`)
  await pointerClick('#nested-trigger')
  await waitFor('document.querySelectorAll("dialog:modal").length === 2')
  await key('Escape'); await waitFor('document.querySelectorAll("dialog:modal").length === 1')
  await key('Escape'); await waitFor('!document.querySelector("dialog[open]")')
  console.log('PASS: lazy Reports and nested native dialogs')

  await click('.side-nav button[aria-label="Suppliers"]'); await waitFor('!!document.querySelector(".purchases-tabs")')
  assert.equal(await evaluate('document.querySelector(".purchases-tabs").getAttribute("role")'), 'group')
  assert.equal(await evaluate('document.querySelectorAll(".purchases-tabs [aria-pressed]").length'), 4)
  await click('.supplier-navigation button:nth-child(2)'); await waitFor('!document.querySelector(".supplier-directory").hidden')
  await click('.supplier-name'); await waitFor('!!document.querySelector(".supplier-profile")')
  await click('.supplier-navigation button:nth-child(2)'); await waitFor('!!document.querySelector(".supplier-report-download")')
  await click('.supplier-report-download')
  await wait(async () => (await readdir(artifactDirectory)).filter(file => file.endsWith('.pdf')).length === 2, 'supplier PDF download')
  await click('.supplier-back')
  await click('.side-nav button[aria-label="Customers"]'); await waitFor('!!document.querySelector(".customer-account-row")')
  await click('.customer-account-row'); await waitFor('!!document.querySelector(".dialog-customerProfile .customer-history-download")')
  await click('.dialog-customerProfile .customer-history-download')
  await wait(async () => (await readdir(artifactDirectory)).filter(file => file.endsWith('.pdf')).length === 3, 'customer PDF download')
  await key('Escape'); await waitFor('!document.querySelector("dialog[open]")')
  await click('.side-nav button[aria-label="Suppliers"]'); await waitFor('!!document.querySelector(".purchases-tabs")')
  assert.ok(!requests.some(url => /fonts\.(googleapis|gstatic)\.com/.test(url)))
  assert.deepEqual(await evaluate('window.cspViolations'), [])
  await screenshot('suppliers-desktop')
  await click(settings); await waitFor('!!document.querySelector(".dialog-settings")')
  await click('.desktop-settings-language button:last-child')
  await key('Escape'); await waitFor('!document.querySelector("dialog[open]")')
  assert.equal(await evaluate('document.documentElement.lang'), 'bn')
  assert.notEqual(await evaluate('document.title'), 'Suppliers | Hisab')
  await page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await click('.theme-toggle-btn')
  await waitFor('document.documentElement.dataset.theme === "dark"')
  // Navigate with mobile emulation already active so Chrome reapplies viewport metadata.
  await page('Page.reload')
  await waitFor('!!document.querySelector(".product-row")')
  await click('.side-nav button:nth-child(4)'); await waitFor('!!document.querySelector(".purchases-tabs")')
  await evaluate('document.fonts.ready')
  if (await evaluate('innerWidth !== 390')) console.error(await evaluate(`({viewport:visualViewport.width,screen:screen.width,body:document.body.getBoundingClientRect().width,overflow:[...document.querySelectorAll('body *')].map(node=>({tag:node.tagName,cls:node.className,right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width})).filter(node=>node.right>391).sort((a,b)=>b.right-a.right).slice(0,12)})`))
  assert.equal(await evaluate('innerWidth'), 390)
  await screenshot('suppliers-mobile-dark')
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  console.log('PASS: PDF exports, supplier filters, self-hosted fonts, Bangla, mobile dark layout, and CSP')
  assert.deepEqual(exceptions, [], 'No uncaught browser exceptions')
  console.log(`Artifacts: ${artifactDirectory}`)
} finally {
  clearTimeout(timeout)
  if (browser?.pid && browser.exitCode === null) {
    const closed = new Promise(resolve => browser.once('exit', resolve))
    browser.kill(); await closed
  }
  await new Promise(resolve => server.httpServer.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
