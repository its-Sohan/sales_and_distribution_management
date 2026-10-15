import { reportBrand, reportLogoDataUrl } from './reportBrand'
import { formatUiDateTime } from './dateFormat'
import type { Lang } from './model'

export type ExportCell = string | number | Date

const banglaHeaders: Record<string, string> = {
  'Bill': 'বিল নম্বর', 'Date (Dhaka)': 'তারিখ (ঢাকা সময়)', 'Customer': 'ক্রেতা',
  'Items': 'পণ্য', 'Method': 'পেমেন্টের মাধ্যম', 'Subtotal (BDT)': 'ছাড়ের আগে মোট (৳)',
  'Discount (BDT)': 'ছাড় (৳)', 'Total sales (BDT)': 'ছাড় ও ফেরতের পর বিক্রি (৳)',
  'Gross profit (BDT)': 'মোট লাভ (৳)', 'Collected at checkout (BDT)': 'বিলের সময় আদায় (৳)',
  'Due at checkout (BDT)': 'বিলের সময় বাকি (৳)', 'Item': 'পণ্য', 'Codes': 'পণ্যের কোড',
  'Quantity sold': 'বিক্রি করা পরিমাণ', 'Bills': 'বিলের সংখ্যা', 'Margin (%)': 'লাভের হার (%)',
  'Without discounts (BDT)': 'ছাড়ের আগে বিক্রি (৳)', 'Cost of items (BDT)': 'পণ্যের কেনা খরচ (৳)',
  'Returns impact (BDT)': 'ফেরতের প্রভাব (৳)', 'Expenses (BDT)': 'দোকানের খরচ (৳)',
  'Stock received (BDT)': 'গৃহীত স্টক (৳)', 'Purchase value (BDT)': 'ক্রয় মূল্য (৳)', 'Purchase payments (BDT)': 'ক্রয়ের পরিশোধ (৳)', 'Supplier refunds (BDT)': 'সরবরাহকারীর ফেরত (৳)',
  'Refunds (BDT)': 'রিফান্ড (৳)', 'Net profit (BDT)': 'খরচ বাদে লাভ (৳)',
}

// Excel dates have no timezone. Store Dhaka wall-clock time explicitly,
// rather than letting the browser's timezone change the exported day.
export const dhakaSpreadsheetDate = (value: string | number) => new Date(new Date(value).getTime() + 6 * 60 * 60 * 1000)

type SpreadsheetOptions = {
  rows: ExportCell[][]
  title: string
  period: string
  scope: string
  lang: Lang
  tab: 'overview' | 'bills' | 'items'
  generatedAt?: Date
}

export async function createReportSpreadsheet({ rows, title, period, scope, lang, tab, generatedAt = new Date() }: SpreadsheetOptions) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = reportBrand.name
  workbook.created = generatedAt
  workbook.modified = generatedAt
  const sheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 10, xSplit: 1, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const headers = rows[0].map(String)
  const moneyColumns = headers.map(header => header.endsWith('(BDT)'))
  const labels = headers.map(header => lang === 'bn' ? banglaHeaders[header] ?? header : header)
  // A bill's Total sales precede returns; avoid calling it net of returns.
  if (lang === 'bn' && tab !== 'overview') labels[headers.indexOf('Total sales (BDT)')] = 'ছাড়ের পর বিক্রি (৳)'
  sheet.columns = headers.map(header => ({ width: header === 'Items' ? 54 : header === 'Item' || header === 'Customer' ? 30 : header === 'Bill' ? 14 : header === 'Codes' || header === 'Quantity sold' ? 26 : 24 }))
  const logo = workbook.addImage({ base64: await reportLogoDataUrl(), extension: 'jpeg' })
  sheet.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 82, height: 82 }, editAs: 'absolute' })
  const brandRows = [reportBrand.name, reportBrand.tagline, reportBrand.address.join(' '), `${reportBrand.phone}   |   ${reportBrand.email}`]
  brandRows.forEach((text, index) => {
    const row = index + 1
    sheet.mergeCells(row, 2, row, headers.length)
    const cell = sheet.getCell(row, 2)
    cell.value = text
    cell.font = { name: 'Arial', size: index === 0 ? 18 : 10, bold: index === 0, color: { argb: index === 0 ? 'FF006B35' : 'FF626B64' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    sheet.getRow(row).height = index === 0 ? 32 : 22
  })
  const contextWidth = sheet.columns.reduce((sum, column) => sum + (column.width ?? 24), 0)
  const context = [
    title,
    period,
    `${lang === 'bn' ? 'তৈরির সময়' : 'Generated'}: ${formatUiDateTime(generatedAt)} (Asia/Dhaka)   |   ${lang === 'bn' ? 'সারি' : 'Records'}: ${rows.length - 1}   |   BDT (৳)`,
    scope,
  ]
  context.forEach((text, index) => {
    const row = index + 5
    sheet.mergeCells(row, 1, row, headers.length)
    const cell = sheet.getCell(row, 1)
    cell.value = text
    cell.font = { name: 'Arial', size: index === 0 ? 16 : 10, bold: index === 0, color: { argb: index === 0 ? 'FF234836' : 'FF626B64' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    sheet.getRow(row).height = index === 0 ? 32 : Math.max(24, Math.ceil(text.length / (contextWidth * 0.8)) * 17 + 8)
  })
  sheet.headerFooter.oddFooter = `&L${reportBrand.name}&R${lang === 'bn' ? 'পৃষ্ঠা' : 'Page'} &P / &N`
  const headerRow = sheet.getRow(10)
  headerRow.values = labels
  headerRow.height = 42
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF234836' } }
    cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }
  })
  const data = rows.slice(1).map(row => row.map((value, index) => {
    if (value === '') return null
    if (moneyColumns[index]) return Number(value)
    if (headers[index] === 'Margin (%)') return Number(value) / 100
    return value
  }))
  data.forEach(values => {
    const row = sheet.addRow(values)
    let lines = 1
    row.eachCell((cell, columnNumber) => {
      const index = columnNumber - 1
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF242C26' } }
      cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left', wrapText: true }
      if (moneyColumns[index]) cell.numFmt = '"৳" #,##0.00;[Red]-"৳" #,##0.00'
      else if (headers[index] === 'Margin (%)') cell.numFmt = '0.0%'
      else if (cell.value instanceof Date) cell.numFmt = tab === 'bills' ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'
      else if (typeof cell.value === 'number') cell.numFmt = '#,##0'
      if (row.number % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F3' } }
      if (typeof cell.value === 'string') lines = Math.max(lines, Math.ceil(cell.value.length / (sheet.getColumn(columnNumber).width! - 2)))
    })
    row.height = Math.max(26, lines * 17 + 8)
  })
  const lastDataRow = 10 + data.length
  sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: lastDataRow, column: headers.length } }
  const total = sheet.getRow(lastDataRow + 1)
  total.getCell(1).value = lang === 'bn' ? 'মোট' : 'Total'
  headers.forEach((header, index) => {
    // Item bill counts overlap. Margins and mixed units cannot be added.
    if (!moneyColumns[index] && !(tab === 'overview' && header === 'Bills')) return
    const cell = total.getCell(index + 1)
    if (data.some(row => row[index] === null)) {
      cell.value = header === 'Purchase payments (BDT)' ? (lang === 'bn' ? 'অসম্পূর্ণ পরিশোধ' : 'Unconfirmed payments') : (lang === 'bn' ? 'অসম্পূর্ণ খরচ' : 'Incomplete costs')
      return
    }
    const column = sheet.getColumn(index + 1).letter
    cell.value = { formula: `SUBTOTAL(109,${column}11:${column}${lastDataRow})`, result: data.reduce((sum, row) => sum + Number(row[index]), 0) }
    cell.numFmt = moneyColumns[index] ? '"৳" #,##0.00;[Red]-"৳" #,##0.00' : '#,##0'
  })
  total.height = 30
  total.eachCell((cell, columnNumber) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF234836' } }
    cell.alignment = { vertical: 'middle', horizontal: columnNumber === 1 ? 'left' : 'right' }
    cell.border = { top: { style: 'thin', color: { argb: 'FF234836' } } }
  })
  sheet.pageSetup.printTitlesRow = '1:10'
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
