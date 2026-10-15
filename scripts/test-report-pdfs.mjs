// Render the actual browser PDF exporters with isolated English and Bangla fixtures.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'

const output = resolve(process.env.REPORT_PDF_ARTIFACTS_DIR || 'tmp/pdfs/report-design')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'hisab-report-browser-'))
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
let id = 0, buffer = ''
const pending = new Map(), exceptions = []
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
  }
})
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const request = ++id; pending.set(request, { resolve, reject })
  browser.stdio[3].write(JSON.stringify({ id: request, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
})
const timeout = setTimeout(() => { console.error('Report PDF checks timed out'); browser.kill(); process.exit(1) }, 120000)
try {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params = {}) => call(method, params, sessionId)
  const evaluate = async expression => {
    const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await page('Page.enable'); await page('Runtime.enable')
  await page('Page.navigate', { url: `${server.resolvedUrls.local[0]}tests/fixtures/report-pdfs.html` })
  for (let attempt = 0; !(await evaluate('!!window.reportPdfCases')); attempt++) {
    assert.ok(attempt < 300, 'Report fixture must load')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  for (const name of await evaluate('window.reportPdfCases')) {
    const result = await evaluate(`window.auditReportPdf(${JSON.stringify(name)})`)
    const bytes = Buffer.from(result.base64, 'base64')
    await writeFile(join(output, `${name}.pdf`), bytes)
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
    assert.deepEqual(result.overflow, [], `${name}: text must stay inside the printable page`)
    assert.ok(result.minFont >= 18, `${name}: supporting text must remain readable`)
    const pdfPages = Number(bytes.toString('latin1').match(/\/Count (\d+)/)?.[1])
    assert.equal(pdfPages, result.pages, `${name}: page totals match rendered pages`)
    assert.equal((result.text.match(/(?:Page|পৃষ্ঠা) \d+ \/ \d+/g) || []).length, pdfPages)
    if (name === 'customer-long') {
      assert.match(result.text, /FINAL-ADDRESS/)
      assert.match(result.text, /FINAL-TRANSACTION/)
      assert.ok(result.pages >= 3, 'Long fields and transactions must paginate')
    }
    if (name.startsWith('supplier-long')) {
      assert.match(result.text, /FINAL-INVOICE-NOTE/)
      assert.match(result.text, /FINAL-PAYMENT-NOTE/)
      assert.ok(result.pages >= 3, 'Long invoice item lists must paginate')
      const references = (result.text.match(/(?:Invoice:|ক্রয় বিল:) INV-2026-1048/g) || []).length
      assert.ok(references >= result.pages - 1, 'Split invoice rows repeat their reference')
    }
    if (name.endsWith('empty')) assert.match(result.text, /No (transactions|supplier invoices)/i)
    if (name.endsWith('warning')) assert.match(result.text, /unconfirmed/)
    console.log(`PASS: ${name} (${result.pages} pages, minimum ${result.minFont}px)`)
  }
  assert.deepEqual(exceptions, [], 'No browser exceptions during PDF exports')
  console.log(`PDF artifacts: ${output}`)
} finally {
  clearTimeout(timeout)
  if (browser.exitCode === null) {
    const closed = new Promise(resolve => browser.once('exit', resolve))
    browser.kill(); await closed
  }
  await server.close()
  await rm(profile, { recursive: true, force: true })
}
