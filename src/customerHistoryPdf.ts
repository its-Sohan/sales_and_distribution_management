import { downloadPdf, renderReportPdf, type PdfTone } from './reportPdfDocument'

// Preserve the existing public helpers for consumers of the original renderer.
export { createPdf, wrapText } from './reportPdfEncoding'

export type CustomerHistoryPdfData = {
  fileName: string
  generatedAt: string
  subject?: string
  scope?: string
  notice?: string
  details: Array<{ label: string; value: string }>
  balances: Array<{ label: string; value: string; tone?: PdfTone }>
  transactions: Array<{
    date: string
    type: string
    amount: string
    settlement?: string
    details: string
    tone?: PdfTone
  }>
  labels: {
    title: string
    generated: string
    customerDetails: string
    transactionHistory: string
    date: string
    type: string
    amount: string
    details: string
    noTransactions: string
    page: string
    brandSubtitle?: string
    detailsHeading?: string
  }
}

export async function renderCustomerHistoryPdf(data: CustomerHistoryPdfData): Promise<Uint8Array> {
  return renderReportPdf({
    title: data.labels.title,
    subject: data.subject,
    generated: `${data.labels.generated}: ${data.generatedAt} (Asia/Dhaka)`,
    scope: data.scope,
    notice: data.notice,
    detailsHeading: data.labels.detailsHeading ?? data.labels.customerDetails,
    details: data.details,
    balances: data.balances,
    tableHeading: data.labels.transactionHistory,
    columns: [data.labels.date, data.labels.type, data.labels.amount, data.labels.details],
    widths: [172, 220, 238, 482],
    rows: data.transactions.map(row => ({
      tone: row.tone,
      cells: [
        [{ text: row.date.replace(/ (?=\d{2}:\d{2}$)/, '\n') }],
        [{ text: row.type, style: 'status' }],
        [
          { text: row.amount, style: 'amount' },
          ...(row.settlement ? [{ text: row.settlement.replace(/ \/ /g, '\n'), style: 'secondary' as const }] : []),
        ],
        [{ text: row.details || '-' }],
      ],
    })),
    empty: data.labels.noTransactions,
    page: data.labels.page,
  })
}

export async function downloadCustomerHistoryPdf(data: CustomerHistoryPdfData) {
  downloadPdf(await renderCustomerHistoryPdf(data), data.fileName)
}
