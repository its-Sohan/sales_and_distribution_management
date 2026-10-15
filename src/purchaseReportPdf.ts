import type { PurchaseOrderReceipt, PurchaseOrderSummaryReport } from './purchaseReport'
import { downloadPdf, renderReportPdf, type PdfText } from './reportPdfDocument'

function paragraphs(text: string, firstStyle: PdfText['style'], restStyle: PdfText['style']): PdfText[] {
  return text.split('\n').map((text, i) => ({ text, style: i === 0 ? firstStyle : restStyle }))
}

export async function renderPurchaseOrderSummaryPdf(data: PurchaseOrderSummaryReport): Promise<Uint8Array> {
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
    widths: [172, 212, 222, 506],
    rows: data.rows.map(row => ({
      tone: row.tone,
      continuation: `${row.cells[0].split('\n')[0]} (${data.continued})`,
      cells: [
        paragraphs(row.cells[0], 'body', 'secondary'),
        paragraphs(row.cells[1], 'status', 'secondary'),
        paragraphs(row.cells[2], 'amount', 'secondary'),
        paragraphs(row.cells[3], 'strong', 'body'),
      ],
    })),
    empty: data.empty,
    page: data.page,
  })
}

export async function downloadPurchaseOrderSummaryPdf(data: PurchaseOrderSummaryReport) {
  downloadPdf(await renderPurchaseOrderSummaryPdf(data), data.fileName)
}

export async function renderPurchaseOrderReceiptPdf(data: PurchaseOrderReceipt): Promise<Uint8Array> {
  return renderReportPdf({
    title: data.title,
    subject: data.subject,
    generated: data.generated,
    scope: data.scope,
    notice: data.notice,
    detailsHeading: data.detailsHeading,
    details: data.details,
    balances: data.balances,
    tableHeading: data.tableHeading,
    columns: data.columns,
    widths: [120, 480, 240, 272],
    rows: data.rows.map(row => ({
      tone: row.tone,
      continuation: `${row.cells[1].split('\n')[0]} (${data.continued})`,
      cells: [
        paragraphs(row.cells[0], 'status', 'secondary'),
        paragraphs(row.cells[1], 'strong', 'secondary'),
        paragraphs(row.cells[2], 'amount', 'secondary'),
        paragraphs(row.cells[3], 'body', 'secondary'),
      ],
    })),
    empty: data.empty,
    page: data.page,
  })
}

export async function downloadPurchaseOrderReceiptPdf(data: PurchaseOrderReceipt) {
  downloadPdf(await renderPurchaseOrderReceiptPdf(data), data.fileName)
}

