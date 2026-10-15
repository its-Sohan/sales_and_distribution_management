import { reportBrand, reportLogoDataUrl } from './reportBrand'

const FONT = '"DM Sans Variable", "Noto Sans Bengali Variable", Arial, sans-serif'
let logoImage: Promise<HTMLImageElement> | undefined

export function loadReportLogo(): Promise<HTMLImageElement> {
  if (!logoImage) logoImage = reportLogoDataUrl().then(src => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode report logo'))
    img.src = src
  })).catch(error => { logoImage = undefined; throw error })
  return logoImage
}

export function drawReportLetterhead(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, width: number, margin: number): number {
  ctx.fillStyle = '#006b35'; ctx.fillRect(margin, 32, width - 2 * margin, 5)
  ctx.fillStyle = '#e43b35'; ctx.fillRect(width - margin - 95, 32, 95, 5)
  const scale = Math.min(110 / logo.naturalWidth, 110 / logo.naturalHeight)
  ctx.drawImage(logo, margin + (110 - logo.naturalWidth * scale) / 2, 55 + (110 - logo.naturalHeight * scale) / 2, logo.naturalWidth * scale, logo.naturalHeight * scale)
  const x = margin + 135
  ctx.textAlign = 'left'; ctx.font = `700 32px ${FONT}`
  ctx.fillStyle = '#006b35'; ctx.fillText('Mayer Dowa', x, 80)
  const part1 = ctx.measureText('Mayer Dowa').width
  ctx.fillStyle = '#e43b35'; ctx.fillText(' Telecom & IT', x + part1, 80)
  const part2 = ctx.measureText(' Telecom & IT').width
  ctx.fillStyle = '#006b35'; ctx.fillText(' Accessories', x + part1 + part2, 80)
  ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#40564c'
  ctx.fillText(reportBrand.tagline, x, 108)
  ctx.font = `400 18px ${FONT}`
  reportBrand.address.forEach((line, i) => ctx.fillText(line, x, 138 + i * 25))
  ctx.fillText(`${reportBrand.phone}   |   ${reportBrand.email}`, x, 191)
  ctx.fillText(reportBrand.facebook, x, 217)
  ctx.strokeStyle = '#cdd9d2'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(margin, 241); ctx.lineTo(width - margin, 241); ctx.stroke()
  return 241
}

export function drawReportContinuationHeader(ctx: CanvasRenderingContext2D, width: number, margin: number) {
  ctx.fillStyle = '#00613b'; ctx.fillRect(margin, 40, 5, 27)
  ctx.textAlign = 'left'; ctx.font = `700 24px ${FONT}`
  ctx.fillText(reportBrand.name, margin + 18, 62)
  ctx.textAlign = 'right'; ctx.font = `400 18px ${FONT}`; ctx.fillStyle = '#40564c'
  ctx.fillText(reportBrand.phone, width - margin, 62)
  return 94
}

export function drawReportFooter(ctx: CanvasRenderingContext2D, width: number, margin: number, y: number, page: string) {
  ctx.strokeStyle = '#cdd9d2'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke()
  ctx.font = `400 18px ${FONT}`; ctx.fillStyle = '#40564c'; ctx.textAlign = 'left'
  ctx.fillText(`${reportBrand.name}  |  ${reportBrand.phone}`, margin, y + 27)
  ctx.textAlign = 'right'; ctx.fillText(page, width - margin, y + 27)
}
