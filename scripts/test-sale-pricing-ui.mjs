// Browser regression checks with an isolated workspace; never calls the shop API.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'hisab-pricing-browser-'))
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
let browser
const timeout = setTimeout(() => { console.error('Pricing UI checks timed out'); browser?.kill(); process.exit(1) }, 45000)
try {
  await server.listen()
  browser = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  let id = 0, buffer = ''
  const pending = new Map()
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
      }
    }
  })
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const request = ++id; pending.set(request, { resolve, reject })
    browser.stdio[3].write(JSON.stringify({ id: request, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  await call('Page.enable', {}, sessionId)
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out: ${expression}`)
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const fill = async (selector, value) => {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve()))')
  }
  const submit = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))')
  }
  const load = async query => {
    await call('Page.navigate', { url: `${server.resolvedUrls.local[0]}tests/fixtures/sale-pricing.html${query || ''}` }, sessionId)
    await waitFor('!!document.querySelector(".product-row")')
    assert.equal(await evaluate('document.querySelectorAll(".product-row").length'), 1, 'Only the one API fixture product may appear')
  }
  const choose = async () => {
    await evaluate(`Array.from(document.querySelectorAll('.product-row')).find(row=>row.textContent.includes('Pricing regression mouse')).click()`)
    await waitFor('!!document.querySelector(".sale-price-field input")')
  }
  const raiseCost = async () => {
    await evaluate('window.raiseCost()')
    await waitFor('window.costRefreshes > 0 && !document.querySelector(".sale-price-field input")?.disabled')
  }
  const rejected = async writes => {
    await waitFor('document.querySelector(".toast--danger")?.textContent.includes("Cannot sell below buying price")')
    assert.equal(await evaluate('window.writes.length'), writes, 'A rejected price must not persist a bill mutation')
  }
  for (const staleAt of ['none', 'before-confirm', 'after-confirm']) {
    await load(staleAt === 'none' ? '' : '?stale=1'); await choose()
    await fill('.sale-price-field input', '549')
    if (staleAt === 'before-confirm') await raiseCost()
    await submit('.quantity-lane form')
    if (staleAt === 'after-confirm') {
      await waitFor('!document.querySelector(".quantity-lane input[disabled]")')
      await raiseCost(); await submit('.quantity-lane form')
    }
    await rejected(0)
    assert.equal(await evaluate('document.querySelectorAll(".bill-row").length'), 0)
    console.log(`PASS: 549 / 550 rejected (${staleAt})`)
  }
  const add = async price => {
    await choose(); await fill('.sale-price-field input', price); await submit('.quantity-lane form')
    await submit('.quantity-lane form'); await waitFor('document.querySelectorAll(".bill-row").length === 1')
  }
  await load(); await add('550')
  assert.equal(await evaluate('window.writes.length'), 1)
  await click('.bill-qty'); await waitFor('!!document.querySelector("#edit-price")')
  await fill('#edit-price', '549'); await submit('.dialog-edit form'); await rejected(1)
  await click('.dialog-edit .secondary-button'); await waitFor('!document.querySelector(".dialog-edit")')
  await click('.discount-button'); await waitFor('!!document.querySelector("#discount")')
  await fill('#discount', '1'); await submit('.dialog-discount form'); await rejected(1)
  console.log('PASS: exactly 550 allowed; below-cost edit and discount rejected')

  await load(); await add('600')
  await click('.discount-button'); await waitFor('!!document.querySelector("#discount")')
  await fill('#discount', '50'); await submit('.dialog-discount form')
  await waitFor('!document.querySelector(".dialog-discount")')
  assert.equal(await evaluate('window.writes.length'), 2)
  await click('.discount-button'); await waitFor('!!document.querySelector("#discount")')
  await fill('#discount', '51'); await submit('.dialog-discount form'); await rejected(2)
  console.log('PASS: discount to exactly cost allowed; one Taka below rejected')

  await load('?invalid=1'); await click('.payment-button'); await rejected(0)
  assert.equal(await evaluate('!!document.querySelector(".dialog-payment")'), false)
  console.log('PASS: restored below-cost bill cannot open payment')
  for (let reload = 0; reload < 2; reload++) {
    await call('Page.navigate', { url: `${server.resolvedUrls.local[0]}tests/fixtures/sale-pricing.html?empty=1` }, sessionId)
    await waitFor('!!document.querySelector(".main-content .product-list")')
    assert.equal(await evaluate('document.querySelectorAll(".product-row").length'), 0, 'Empty development workspace must stay empty')
    assert.equal(await evaluate('document.querySelectorAll(".bill-row").length'), 0)
  }
  console.log('PASS: development has no default products or bill lines, including after reload')
} finally {
  clearTimeout(timeout)
  if (browser?.pid && browser.exitCode === null) {
    const closed = new Promise(resolve => browser.once('exit', resolve))
    browser.kill(); await closed
  }
  await server.close()
  await rm(profile, { recursive: true, force: true })
}
