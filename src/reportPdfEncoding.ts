const PAGE_WIDTH = 1240
const PAGE_HEIGHT = 1754
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function wrapText(context: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = []
  const paragraphs = value
    .replace(/[—–‑]/g, '-')
    .split(/\r?\n/)

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= width) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ''
      if (context.measureText(word).width <= width) {
        line = word
        continue
      }
      let fragment = ''
      for (const { segment: character } of graphemes.segment(word)) {
        if (fragment && context.measureText(fragment + character).width > width) {
          lines.push(fragment)
          fragment = ''
        }
        fragment += character
      }
      line = fragment
    }
    if (line) lines.push(line)
  }

  return lines.length ? lines : ['-']
}


export function createPdf(images: Uint8Array[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let offset = 0
  const append = (chunk: Uint8Array) => { chunks.push(chunk); offset += chunk.length }
  const appendText = (value: string) => append(encoder.encode(value))
  const addObject = (id: number, parts: Array<string | Uint8Array>) => {
    offsets[id] = offset
    appendText(`${id} 0 obj\n`)
    for (const part of parts) typeof part === 'string' ? appendText(part) : append(part)
    appendText('\nendobj\n')
  }

  appendText('%PDF-1.4\n%Hisab\n')
  const pageIds = images.map((_, index) => 3 + index * 3)
  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  addObject(2, [`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`])

  images.forEach((image, index) => {
    const pageId = pageIds[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    const content = encoder.encode('q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ')
    addObject(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`])
    addObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      image,
      '\nendstream',
    ])
    addObject(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream'])
  })

  const xrefOffset = offset
  const objectCount = offsets.length
  appendText(`xref\n0 ${objectCount}\n0000000000 65535 f \n`)
  for (let id = 1; id < objectCount; id++) appendText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  appendText(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  const output = new Uint8Array(offset)
  let cursor = 0
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length }
  return output
}

