import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { createReportSpreadsheet, dhakaSpreadsheetDate } from '../src/reportSpreadsheet.ts'
import { makeExpense, makeReceipt, makeReturn } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { netSalesBuckets, overviewExportRows } from '../src/reportsModel.ts'

const options = { title: 'Bills', period: '10 Oct 2026', scope: 'Matching bills', lang: 'en' as const, tab: 'bills' as const, generatedAt: new Date('2026-10-10T01:30:00Z') }

test('Excel round-trip preserves identifiers, safe text, typed amounts and Dhaka dates', async () => {
  const date = dhakaSpreadsheetDate('2026-10-09T18:30:00Z')
  assert.equal(date.toISOString(), '2026-10-10T00:30:00.000Z')
  const blob = await createReportSpreadsheet({ ...options, rows: [
    ['Bill', 'Date (Dhaka)', 'Customer', 'Total sales (BDT)', 'Gross profit (BDT)'],
    ['0001', date, '=HYPERLINK("https://example.com")', '1234.50', -12.5],
    ['0002', date, 'নাদিয়া', '20.00', 2.5],
  ] })
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(workbook.creator, 'Mayer Dowa Telecom & IT Accessories')
  assert.equal(sheet.getCell('B1').value, 'Mayer Dowa Telecom & IT Accessories')
  assert.equal(sheet.getCell('A5').value, 'Bills')
  assert.equal(sheet.getCell('A6').value, options.period)
  assert.equal(sheet.getCell('A7').value, 'Generated: 10/10/2026 07:30 (Asia/Dhaka)   |   Records: 2   |   BDT (৳)')
  assert.equal(sheet.getCell('A8').value, options.scope)
  const images = sheet.getImages()
  assert.equal(images.length, 1)
  assert.equal(images[0].range.tl.col, 0)
  assert.equal(images[0].range.tl.row, 0)
  assert.equal(workbook.getImage(Number(images[0].imageId)).extension, 'jpeg')
  assert.equal(sheet.pageSetup.printTitlesRow, '1:10')
  assert.match(sheet.headerFooter.oddFooter, /Mayer Dowa Telecom & IT Accessories/)
  assert.equal(sheet.getCell('A11').value, '0001')
  assert.equal(sheet.getCell('C11').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('C12').value, 'নাদিয়া')
  assert.equal((sheet.getCell('B11').value as Date).toISOString(), date.toISOString())
  assert.equal(sheet.getCell('D11').value, 1234.5)
  assert.equal(sheet.getCell('E11').value, -12.5)
  assert.deepEqual(sheet.getCell('D13').value, { formula: 'SUBTOTAL(109,D11:D12)', result: 1254.5 })
  assert.equal(sheet.getCell('D11').numFmt.includes('৳'), true)
  assert.equal(sheet.autoFilter, 'A10:E12')
  assert.equal(sheet.views[0].ySplit, 10)
})

test('Bangla item exports keep unknown profit blank and do not sum overlapping bills or margins', async () => {
  const blob = await createReportSpreadsheet({ ...options, lang: 'bn', title: 'পণ্যের বিক্রি', tab: 'items', rows: [
    ['Item', 'Bills', 'Total sales (BDT)', 'Gross profit (BDT)', 'Margin (%)'],
    ['সার্ভিস', 2, '100.00', '', ''],
    ['পণ্য', 2, '200.00', 50, 25],
  ] })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.name, 'পণ্যের বিক্রি')
  assert.equal(sheet.getCell('A10').value, 'পণ্য')
  assert.equal(sheet.getCell('C10').value, 'ছাড়ের পর বিক্রি (৳)')
  assert.equal(sheet.getCell('D11').value, null)
  assert.equal(sheet.getCell('D13').value, 'অসম্পূর্ণ খরচ')
  assert.equal(sheet.getCell('E12').value, 0.25)
  assert.equal(sheet.getCell('E12').numFmt, '0.0%')
  assert.equal(sheet.getCell('B13').value, null)
  assert.equal(sheet.getCell('E13').value, null)
})

test('daily workbook totals include negative return-day sales and reconcile gross and net profit', async () => {
  const bill = { ...makeReceipt(initialState, 900, 'cash'), createdAt: '2026-10-09T09:00:00Z' }
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }), createdAt: '2026-10-10T09:00:00Z' }
  const expense = { ...makeExpense({ category: 'rent', amount: 20, method: 'cash' }), createdAt: entry.createdAt }
  const buckets = netSalesBuckets([bill], [entry], [expense], '3days', new Date('2026-10-10T12:00:00Z'), true)
  const rows = overviewExportRows(buckets, dhakaSpreadsheetDate)
  const blob = await createReportSpreadsheet({ ...options, tab: 'overview', title: 'Daily summary', rows })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getCell('E13').value, -350)
  assert.equal(sheet.getCell('F13').value, -240)
  assert.equal(sheet.getCell('G13').value, -110)
  assert.equal(sheet.getCell('K13').value, -130)
  assert.deepEqual(sheet.getCell('E14').value, { formula: 'SUBTOTAL(109,E11:E13)', result: 550 })
  assert.deepEqual(sheet.getCell('F14').value, { formula: 'SUBTOTAL(109,F11:F13)', result: 380 })
  assert.deepEqual(sheet.getCell('G14').value, { formula: 'SUBTOTAL(109,G11:G13)', result: 170 })
  assert.deepEqual(sheet.getCell('K14').value, { formula: 'SUBTOTAL(109,K11:K13)', result: 150 })
})

test('supplier overview exports retain typed amounts, Bangla labels, and unknown settlement', async () => {
  const blob = await createReportSpreadsheet({ ...options, tab: 'overview', lang: 'bn', title: 'ক্রয়ের হিসাব', rows: [
    ['Date (Dhaka)', 'Purchase value (BDT)', 'Purchase payments (BDT)', 'Supplier refunds (BDT)'],
    [dhakaSpreadsheetDate('2026-10-12T18:00:00Z'), 1600, 700, 0],
    [dhakaSpreadsheetDate('2026-10-13T18:00:00Z'), 100, '', 50],
  ] })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getCell('B10').value, 'ক্রয় মূল্য (৳)')
  assert.equal(sheet.getCell('C10').value, 'ক্রয়ের পরিশোধ (৳)')
  assert.equal(sheet.getCell('D10').value, 'সরবরাহকারীর ফেরত (৳)')
  assert.equal(sheet.getCell('B11').value, 1600)
  assert.equal(sheet.getCell('C11').value, 700)
  assert.equal(sheet.getCell('C12').value, null)
  assert.equal(sheet.getCell('C13').value, 'অসম্পূর্ণ পরিশোধ')
  assert.deepEqual(sheet.getCell('D13').value, { formula: 'SUBTOTAL(109,D11:D12)', result: 50 })
})
