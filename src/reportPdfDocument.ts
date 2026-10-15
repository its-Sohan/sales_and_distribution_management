import '@fontsource-variable/dm-sans'
import '@fontsource-variable/noto-sans-bengali'
import '@fontsource-variable/space-grotesk'
import { createPdf, wrapText } from './reportPdfEncoding'
import { drawReportContinuationHeader, drawReportFooter, drawReportLetterhead, loadReportLogo } from './reportPdfBranding'

export type PdfTone = 'positive' | 'warning' | 'danger' | 'neutral'
export type PdfText = { text: string; style?: 'body' | 'secondary' | 'strong' | 'amount' | 'status' | 'label' }
export type PdfRow = { cells: [PdfText[], PdfText[], PdfText[], PdfText[]]; tone?: PdfTone; continuation?: string }
export type ReportPdfDocument = {
  title: string
  subject?: string
  generated: string
  scope?: string
  notice?: string
  detailsHeading?: string
  details: Array<{ label: string; value: string }>
  balances: Array<{ label: string; value: string; tone?: PdfTone }>
  tableHeading: string
  columns: [string, string, string, string]
  widths: [number, number, number, number]
  rows: PdfRow[]
  empty: string
  page: string
}

// A4 at 150 dpi. Body text prints at 10 pt; supporting text stays above 8.5 pt.
const WIDTH = 1240, HEIGHT = 1754, MARGIN = 64, CONTENT = WIDTH - 2 * MARGIN
const BOTTOM = 1648, FOOTER = 1680, LINE = 31, PAD = 18
const FONT = '"DM Sans Variable", "Noto Sans Bengali Variable", Arial, sans-serif'
const DISPLAY = '"Space Grotesk Variable", "Noto Sans Bengali Variable", Arial, sans-serif'
const INK = '#182e25', MUTED = '#465d51', GREEN = '#00613b', RULE = '#cedbd3'
const palette = (tone: PdfTone = 'neutral') => tone === 'danger' ? { ink: '#a52e2a', fill: '#fff1ef' }
  : tone === 'warning' ? { ink: '#79500d', fill: '#fff7e6' }
    : tone === 'positive' ? { ink: GREEN, fill: '#eaf5ee' } : { ink: INK, fill: '#f1f5f2' }
type Draw = (ctx: CanvasRenderingContext2D) => void
type Line = { text: string; size: number; weight: number; ink: string; family?: string }

function font(ctx: CanvasRenderingContext2D, size: number, weight = 400, family = FONT) {
  ctx.font = `${weight} ${size}px ${family}`
}

function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number, size = 21, weight = 400, ink = INK, family = FONT): Line[] {
  font(ctx, size, weight, family)
  return wrapText(ctx, text, width).map(text => ({ text, size, weight, ink, family }))
}

function paintLine(ctx: CanvasRenderingContext2D, line: Line, x: number, y: number, right = false) {
  font(ctx, line.size, line.weight, line.family)
  ctx.fillStyle = line.ink; ctx.textAlign = right ? 'right' : 'left'
  ctx.fillText(line.text, x, y)
}

/** Plan the whole document before painting, then reuse one canvas for every page. */
export async function renderReportPdf(data: ReportPdfDocument): Promise<Uint8Array> {
  const logo = await loadReportLogo()
  await Promise.all([
    document.fonts.load(`400 21px "DM Sans Variable"`),
    document.fonts.load(`600 21px "DM Sans Variable"`),
    document.fonts.load(`400 21px "Noto Sans Bengali Variable"`, 'লেনদেন'),
    document.fonts.load(`600 21px "Noto Sans Bengali Variable"`, 'লেনদেন'),
    document.fonts.load(`700 40px "Space Grotesk Variable"`),
    document.fonts.load(`700 40px "Noto Sans Bengali Variable"`, 'প্রতিবেদন'),
  ])
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'
  const pages: Draw[][] = [[]]
  let y = 0
  const add = (draw: Draw) => pages[pages.length - 1].push(draw)
  const block = (text: string, size: number, weight: number, ink: string, gap = 0, family = FONT) => {
    const lines = linesFor(ctx, text, CONTENT, size, weight, ink, family)
    for (const line of lines) {
      if (y + size + 10 > BOTTOM) nextPage()
      const baseline = y + size
      add(ctx => paintLine(ctx, line, MARGIN, baseline))
      y += size + 10
    }
    y += gap
  }
  const header = (first: boolean) => {
    // Measure and paint identical headers so wrapped names reserve their full height.
    y = first ? 277 : 100
    add(ctx => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
      if (first) drawReportLetterhead(ctx, logo, WIDTH, MARGIN)
      else drawReportContinuationHeader(ctx, WIDTH, MARGIN)
    })
    block(data.title, first ? 40 : 25, 700, INK, first ? 8 : 0, DISPLAY)
    if (data.subject && first) block(data.subject, 28, 600, INK, 8)
    else if (data.subject) {
      // The full name remains on the first page; bounded context leaves room for rows.
      const subject = linesFor(ctx, data.subject, CONTENT, 22, 600).slice(0, 2)
      if (linesFor(ctx, data.subject, CONTENT, 22, 600).length > 2) {
        const last = subject[subject.length - 1]
        while (ctx.measureText(`${last.text}…`).width > CONTENT) last.text = last.text.slice(0, -1)
        last.text += '…'
      }
      for (const line of subject) {
        const baseline = y + 22
        add(ctx => paintLine(ctx, line, MARGIN, baseline)); y += 32
      }
    }
    block(data.generated, 18, 400, MUTED, first ? 24 : 18)
  }
  const nextPage = () => { pages.push([]); header(false) }
  header(true)

  // Summary cards give the important balances a clear, consistent reading order.
  const gap = 16
  const cardWidth = (CONTENT - gap * (data.balances.length - 1)) / Math.max(1, data.balances.length)
  const cards = data.balances.map(balance => ({
    ...balance,
    labels: linesFor(ctx, balance.label, cardWidth - 44, 19, 500, MUTED),
    values: linesFor(ctx, balance.value, cardWidth - 44, 34, 700, palette(balance.tone).ink, DISPLAY),
  }))
  const labelHeight = Math.max(1, ...cards.map(card => card.labels.length)) * 27
  const cardHeight = 42 + labelHeight + Math.max(1, ...cards.map(card => card.values.length)) * 43
  if (cards.length) {
    if (y + cardHeight > BOTTOM) nextPage()
    const top = y
    add(ctx => cards.forEach((card, i) => {
      const x = MARGIN + i * (cardWidth + gap), colors = palette(card.tone)
      ctx.fillStyle = colors.fill; ctx.fillRect(x, top, cardWidth, cardHeight)
      ctx.fillStyle = colors.ink; ctx.fillRect(x, top, cardWidth, 4)
      card.labels.forEach((line, j) => paintLine(ctx, line, x + 22, top + 34 + j * 27))
      card.values.forEach((line, j) => paintLine(ctx, line, x + 22, top + 38 + labelHeight + j * 43))
    }))
    y += cardHeight + 32
  }

  if (data.details.length) {
    if (y + 145 > BOTTOM) nextPage()
    if (data.detailsHeading) block(data.detailsHeading, 23, 600, INK, 8)
    const fieldWidth = (CONTENT - 36) / 2
    for (let i = 0; i < data.details.length; i += 2) {
      const fields = data.details.slice(i, i + 2).map(field => [
        ...linesFor(ctx, field.label, fieldWidth - 24, 18, 600, MUTED),
        ...linesFor(ctx, field.value || '-', fieldWidth - 24, 21, 500),
      ])
      const total = Math.max(...fields.map(lines => lines.length))
      const height = total * LINE + 30
      if (y + height > BOTTOM && height < BOTTOM - 280) nextPage()
      let from = 0
      while (from < total) {
        if (y + LINE + 30 > BOTTOM) nextPage()
        const count = Math.min(total - from, Math.floor((BOTTOM - y - 30) / LINE))
        const top = y, start = from, segmentHeight = count * LINE + 30
        add(ctx => {
          fields.forEach((lines, column) => lines.slice(start, start + count).forEach((line, j) =>
            paintLine(ctx, line, MARGIN + column * (fieldWidth + 36), top + 25 + j * LINE)))
          ctx.strokeStyle = RULE; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(MARGIN, top + segmentHeight - 8); ctx.lineTo(WIDTH - MARGIN, top + segmentHeight - 8); ctx.stroke()
        })
        y += segmentHeight; from += count
      }
    }
    y += 24
  }
  if (data.notice) {
    const notice = linesFor(ctx, data.notice, CONTENT - 40, 20, 500, '#79500d')
    let from = 0
    while (from < notice.length) {
      if (y + LINE + 32 > BOTTOM) nextPage()
      const count = Math.min(notice.length - from, Math.floor((BOTTOM - y - 32) / LINE))
      const top = y, start = from, height = count * LINE + 32
      add(ctx => {
        ctx.fillStyle = '#fff7e6'; ctx.fillRect(MARGIN, top, CONTENT, height)
        ctx.fillStyle = '#956413'; ctx.fillRect(MARGIN, top, 4, height)
        notice.slice(start, start + count).forEach((line, j) => paintLine(ctx, line, MARGIN + 20, top + 31 + j * LINE))
      })
      y += height + 24; from += count
    }
  }

  const headings = data.columns.map((text, i) => linesFor(ctx, text, data.widths[i] - PAD * 2, 19, 600, '#ffffff'))
  const tableHeaderHeight = Math.max(...headings.map(lines => lines.length)) * LINE + 24
  const rows = data.rows.map(row => ({ row, columns: row.cells.map((paragraphs, column) => paragraphs.flatMap(part => {
    const style = part.style ?? 'body'
    const size = style === 'secondary' || style === 'label' ? 18 : style === 'amount' ? 23 : 21
    const weight = ['strong', 'amount', 'status', 'label'].includes(style) ? 600 : 400
    const ink = style === 'secondary' || style === 'label' ? MUTED : style === 'status' ? palette(row.tone).ink : INK
    return linesFor(ctx, part.text, data.widths[column] - PAD * 2, size, weight, ink)
  })) }))
  const continuationTop = 100 + linesFor(ctx, data.title, CONTENT, 25, 700, INK, DISPLAY).length * 35
    + (data.subject ? Math.min(2, linesFor(ctx, data.subject, CONTENT, 22, 600).length) * 32 : 0)
    + linesFor(ctx, data.generated, CONTENT, 18).length * 28 + 18 + tableHeaderHeight
  const continuationCapacity = BOTTOM - continuationTop
  const tableHeader = () => {
    const top = y
    add(ctx => {
      ctx.fillStyle = GREEN; ctx.fillRect(MARGIN, top, CONTENT, tableHeaderHeight)
      let x = MARGIN
      headings.forEach((lines, i) => {
        lines.forEach((line, j) => paintLine(ctx, line, i === 2 ? x + data.widths[i] - PAD : x + PAD, top + 29 + j * LINE, i === 2))
        x += data.widths[i]
      })
    })
    y += tableHeaderHeight
  }
  const tableNextPage = () => { nextPage(); tableHeader() }
  const scopeHeight = data.scope ? linesFor(ctx, data.scope, CONTENT, 19).length * 29 : 0
  const firstRowHeight = rows.length ? Math.max(1, ...rows[0].columns.map(lines => lines.length)) * LINE + 32 : LINE + 22
  const openingRowHeight = firstRowHeight <= continuationCapacity ? firstRowHeight : 3 * LINE + 32
  // Keep the section title, column headers and at least one transaction together.
  if (y + 56 + scopeHeight + tableHeaderHeight + openingRowHeight > BOTTOM) nextPage()
  block(data.tableHeading, 25, 700, INK, 8, DISPLAY)
  if (data.scope) block(data.scope, 19, 400, MUTED, 14)
  tableHeader()

  if (!data.rows.length) {
    y += 22
    block(data.empty, 21, 400, MUTED)
  }
  for (const [index, { row, columns }] of rows.entries()) {
    const total = Math.max(1, ...columns.map(lines => lines.length)), fullHeight = total * LINE + 32
    // Ordinary transactions move as a whole. Only oversized rows split across pages.
    if (y + fullHeight > BOTTOM && fullHeight <= continuationCapacity) tableNextPage()
    let from = 0
    while (from < total) {
      if (y + LINE + 32 > BOTTOM) tableNextPage()
      let capacity = Math.floor((BOTTOM - y - 32) / LINE)
      const prefix = from > 0 && row.continuation ? linesFor(ctx, row.continuation, data.widths[3] - PAD * 2, 18, 600, MUTED).slice(0, 2) : []
      // A continuation must have room to repeat the date, event and amount intact.
      const repeated = columns.slice(0, 3).map(lines => from >= lines.length ? lines.slice(0, 6) : [])
      const identityLines = Math.max(...repeated.map(lines => lines.length))
      if (from > 0 && (capacity <= prefix.length || capacity < Math.min(identityLines, total - from))) {
        tableNextPage(); capacity = Math.floor((BOTTOM - y - 32) / LINE)
      }
      const count = Math.min(total - from, capacity - prefix.length)
      const drawnLines = from > 0 ? Math.max(count + prefix.length, Math.min(identityLines, capacity)) : count
      const top = y, start = from, height = drawnLines * LINE + 32
      add(ctx => {
        if (index % 2 === 0) { ctx.fillStyle = '#f3f7f4'; ctx.fillRect(MARGIN, top, CONTENT, height) }
        let x = MARGIN
        columns.forEach((lines, column) => {
          const visible = start > 0 && column < 3 && repeated[column].length ? repeated[column]
            : column === 3 ? [...prefix, ...lines.slice(start, start + count)] : lines.slice(start, start + count)
          visible.forEach((line, j) => paintLine(ctx, line, column === 2 ? x + data.widths[column] - PAD : x + PAD, top + 34 + j * LINE, column === 2))
          x += data.widths[column]
        })
        ctx.strokeStyle = RULE; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(MARGIN, top + height); ctx.lineTo(WIDTH - MARGIN, top + height); ctx.stroke()
      })
      y += height; from += count
      if (from < total) tableNextPage()
    }
  }

  try {
    const images = pages.map((commands, i) => {
      commands.forEach(draw => draw(ctx))
      drawReportFooter(ctx, WIDTH, MARGIN, FOOTER, `${data.page} ${i + 1} / ${pages.length}`)
      const base64 = canvas.toDataURL('image/jpeg', 0.94).split(',')[1]
      return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    })
    return createPdf(images)
  } finally {
    canvas.width = 0; canvas.height = 0
  }
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url; link.download = `${fileName}.pdf`; link.style.display = 'none'
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
