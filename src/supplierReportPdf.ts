import type { SupplierReport } from './supplierReport'
import { downloadPdf, renderReportPdf, type PdfText } from './reportPdfDocument'

function paragraphs(text: string, firstStyle: PdfText['style'], restStyle: PdfText['style']): PdfText[] {
  return text.split('\n').map((text, i) => ({ text, style: i === 0 ? firstStyle : restStyle }))
}

/** Keep the export bytes available independently of downloading for visual checks. */
export async function renderSupplierReportPdf(data: SupplierReport): Promise<Uint8Array> {
  return renderReportPdf({
    title: data.title,
    subject: data.supplierName,
    generated: data.generated,
    scope: `${data.scope} · ${data.recordCount}: ${data.rows.length} · BDT (৳)`,
    notice: data.notice,
    detailsHeading: data.detailsHeading,
    details: data.profileFields ?? (data.details ? [{ label: data.supplierName, value: data.details }] : []),
    balances: data.balances,
    tableHeading: data.recordCount,
    columns: data.columns,
    widths: [172, 212, 222, 506],
    rows: data.rows.map(row => ({
      tone: row.tone,
      continuation: `${row.cells[3].split('\n')[0]} (${data.continued})`,
      cells: [
        [{ text: row.cells[0].replace(/ (?=\d{2}:\d{2}$)/, '\n') }],
        paragraphs(row.cells[1], 'status', 'secondary'),
        paragraphs(row.cells[2], 'amount', 'secondary'),
        paragraphs(row.cells[3], 'strong', 'body'),
      ],
    })),
    empty: data.empty,
    page: data.page,
  })
}

export async function downloadSupplierReportPdf(data: SupplierReport) {
  downloadPdf(await renderSupplierReportPdf(data), data.fileName)
}
