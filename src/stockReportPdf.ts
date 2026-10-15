import type { StockReportSummary } from './stockReport'
import { downloadPdf, renderReportPdf, type PdfText } from './reportPdfDocument'

function paragraphs(text: string, firstStyle: PdfText['style'], restStyle: PdfText['style']): PdfText[] {
  return text.split('\n').map((line, i) => ({ text: line, style: i === 0 ? firstStyle : restStyle }))
}

export async function renderStockReportPdf(data: StockReportSummary): Promise<Uint8Array> {
  return renderReportPdf({
    title: data.title,
    subject: data.subject,
    generated: data.generated,
    scope: data.scope,
    notice: data.notice,
    detailsHeading: data.detailsHeading,
    details: data.filterDetails,
    balances: data.balances,
    tableHeading: data.tableHeading,
    columns: data.columns,
    widths: data.widths,
    rows: data.rows.map(row => ({
      tone: row.tone,
      continuation: `${row.cells[0].split('\n')[0]} (${data.continued})`,
      cells: [
        paragraphs(row.cells[0], 'strong', 'secondary'),
        paragraphs(row.cells[1], 'body', 'status'),
        paragraphs(row.cells[2], 'amount', 'secondary'),
        paragraphs(row.cells[3], 'strong', 'secondary'),
      ],
    })),
    empty: data.empty,
    page: data.page,
  })
}

export async function downloadStockReportPdf(data: StockReportSummary) {
  downloadPdf(await renderStockReportPdf(data), data.fileName)
}

