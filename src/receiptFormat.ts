import type { Receipt } from './model'

const ones = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function integerWords(value: number): string {
  if (value < 20) return ones[value]
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`
  for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']] as const) {
    if (value >= size) return `${integerWords(Math.floor(value / size))} ${label}${value % size ? ` ${integerWords(value % size)}` : ''}`
  }
  return ''
}

export function amountInWords(taka: number): string {
  if (!Number.isSafeInteger(taka) || taka < 0) throw new Error('Invalid receipt total')
  return `${integerWords(taka)} Taka Only`
}

export type ReceiptRow = { line: Receipt['lines'][number]; number: number }

// Heights and available space use the same units (rendered CSS pixels in the memo).
// Exact fits stay on the current page; an indivisible oversized item gets its own page.
export function receiptPages(lines: Receipt['lines'], heights: number[] = [], available = Infinity): ReceiptRow[][] {
  const pages: ReceiptRow[][] = [[]]
  let used = 0
  lines.forEach((line, index) => {
    const height = heights[index] > 0 && Number.isFinite(heights[index]) ? heights[index] : 1
    if (pages[pages.length - 1].length && used + height > available) {
      pages.push([])
      used = 0
    }
    pages[pages.length - 1].push({ line, number: index + 1 })
    used += height
  })
  return pages
}
