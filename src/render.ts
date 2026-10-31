import { jsPDF } from 'jspdf'
import type { FontAsset, Poster, PosterElement, PosterStyle, PosterTemplate, Zone } from './types'
import { INITIAL_STYLE } from './types'

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const fontCache = new Map<string, Promise<void>>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Não foi possível carregar a arte. Recarregue a página e tente novamente.'))
      image.src = url
    }))
  }
  return imageCache.get(url)!
}

export async function loadCustomFont(font: FontAsset, signedURL: string): Promise<void> {
  if (!fontCache.has(font.id)) {
    fontCache.set(font.id, (async () => {
      const fontFace = new FontFace(font.family, `url("${signedURL}")`)
      await fontFace.load()
      document.fonts.add(fontFace)
    })())
  }
  try { await fontCache.get(font.id) } catch (error) { fontCache.delete(font.id); throw error }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export function money(value: number | null): string {
  return value === null ? '' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export function parseMoney(raw: string): number | null {
  if (!raw.trim()) return null
  let cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '')
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (cleaned.includes(',')) cleaned = cleaned.replace(',', '.')
  const number = Number(cleaned)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const block of text.split('\n')) {
    const words = block.trim().split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const proposal = line ? `${line} ${word}` : word
      if (line && ctx.measureText(proposal).width > maxWidth) { lines.push(line); line = word }
      else line = proposal
    }
    if (line) lines.push(line)
  }
  return lines.length ? lines : ['']
}

function drawFitText(
  ctx: CanvasRenderingContext2D, text: string, centerX: number, topY: number,
  maxWidth: number, maxHeight: number, initialSize: number, font: string,
  color: string, maxLines: number, minSize: number
) {
  if (!text.trim()) return
  let size = initialSize, lines: string[] = []
  for (; size >= minSize; size -= Math.max(1, initialSize * .025)) {
    ctx.font = `800 ${size}px "${font}", Arial, sans-serif`
    lines = wrap(ctx, text, maxWidth)
    if (lines.length <= maxLines && lines.length * size * 1.10 <= maxHeight && lines.every(l => ctx.measureText(l).width <= maxWidth)) break
  }
  size = Math.max(minSize, size)
  ctx.font = `800 ${size}px "${font}", Arial, sans-serif`
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  lines = wrap(ctx, text, maxWidth).slice(0, maxLines)
  const total = lines.length * size * 1.1
  const start = topY + Math.max(0, (maxHeight - total) / 2)
  lines.forEach((line, i) => ctx.fillText(line, centerX, start + i * size * 1.1, maxWidth))
}

/** Elementos normalizados em relação à página inteira, para que editor, PDF e prévia coincidam. */
export function defaultElementZones(zone: Zone): Record<PosterElement, Zone> {
  const z = (x: number, y: number, w: number, h: number): Zone => ({
    x: zone.x + zone.w * x, y: zone.y + zone.h * y, w: zone.w * w, h: zone.h * h
  })
  return {
    title: z(.02, .015, .96, .255), old: z(.05, .28, .90, .14),
    por: z(.06, .40, .34, .12), price: z(.02, .46, .96, .34),
    unit: z(.02, .81, .96, .18)
  }
}
export const ELEMENT_LABELS: Record<PosterElement, string> = {
  title: 'Nome do produto', old: 'Preço DE', por: 'Texto POR',
  price: 'Preço principal', unit: 'Unidade'
}
export const POSTER_ELEMENTS: PosterElement[] = ['title', 'old', 'por', 'price', 'unit']

export function elementZones(template: PosterTemplate): Record<PosterElement, Zone> {
  return { ...defaultElementZones(template.zone), ...(template.style?.elements || {}) }
}

/**
 * Cartazes sem preço DE usam o mesmo posicionamento base salvo no modelo,
 * porém fecham automaticamente o espaço entre título, preço e unidade.
 * Nenhuma alteração de zona é persistida no banco.
 */
export function effectiveElementZones(template: PosterTemplate, poster: Pick<Poster, 'price_from'>): Record<PosterElement, Zone> {
  const zones = elementZones(template)
  if (poster.price_from !== null) return zones

  const { title, price, unit } = zones
  const gap = price.y - (title.y + title.h)
  const preferredGap = template.zone.h * .035
  const toClose = Math.max(0, gap - preferredGap)
  if (!toClose) return zones

  // Uma parte do espaço é absorvida movendo o título para baixo;
  // o restante move o preço (e a unidade) para cima.
  const moveTitle = toClose * .23
  const movePrice = toClose - moveTitle
  const newPriceY = Math.max(0, price.y - movePrice)
  const appliedPriceMove = price.y - newPriceY
  return {
    ...zones,
    title: { ...title, y: Math.min(1 - title.h, title.y + moveTitle) },
    price: { ...price, y: newPriceY },
    unit: unit.y >= price.y
      ? { ...unit, y: Math.max(0, unit.y - appliedPriceMove) }
      : unit
  }
}

export async function paintPoster(
  canvas: HTMLCanvasElement, template: PosterTemplate, poster: Poster, imageURL: string,
  fontFamily = 'Arial', width = 900
): Promise<void> {
  const image = await loadImage(imageURL)
  const height = Math.round(width * 297 / 210)
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Seu navegador não permite desenhar o cartaz.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  const style: PosterStyle = { ...INITIAL_STYLE, ...template.style }
  const parts = effectiveElementZones(template, poster)
  const box = (key: PosterElement) => {
    const z = parts[key]
    return { x: z.x * width, y: z.y * height, w: z.w * width, h: z.h * height }
  }
  const title = box('title')
  drawFitText(ctx, poster.product_name.toLocaleUpperCase('pt-BR'), title.x + title.w / 2, title.y,
    title.w, title.h, width * style.titleScale, fontFamily, style.titleColor, 4, width * .017)

  if (poster.price_from !== null) {
    const old = box('old')
    const oldText = `De: R$ ${money(poster.price_from)}`
    let oldSize = Math.min(width * style.oldScale, old.h * .85)
    ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = style.oldColor
    while (oldSize > width * .018) {
      ctx.font = `800 ${oldSize}px "${fontFamily}", Arial, sans-serif`
      if (ctx.measureText(oldText).width <= old.w * .98) break
      oldSize -= 1
    }
    ctx.fillText(oldText, old.x + old.w / 2, old.y + Math.max(0, (old.h - oldSize) / 2), old.w)
    // Risco de promoção sobre o valor antigo (mantém o prefixo 'De: R$' legível).
    const prefix = 'De: R$ '
    const number = money(poster.price_from)
    const fullWidth = ctx.measureText(oldText).width
    const numberWidth = ctx.measureText(number).width
    const startNumber = old.x + (old.w - fullWidth) / 2 + ctx.measureText(prefix).width
    ctx.strokeStyle = style.oldColor; ctx.lineWidth = Math.max(1.5, width * .003)
    ctx.beginPath()
    const baselineY = old.y + Math.max(0, (old.h - oldSize) / 2) + oldSize * .54
    ctx.moveTo(startNumber, baselineY); ctx.lineTo(startNumber + numberWidth, baselineY); ctx.stroke()
  }

  const price = box('price')
  const por = box('por')
  const number = money(poster.price_to)
  const hasOldPrice = poster.price_from !== null
  const showCurrency = style.showCurrency
  // O preço grande ocupa a mesma área com ou sem o prefixo R$.
  // Com R$, o prefixo tem tamanho reduzido e fica junto da base dos números.
  let priceSize = Math.min(width * style.priceScale, price.h * .92)
  const minPriceSize = width * .04
  const rightEdge = price.x + price.w * .985
  const leftEdge = price.x + price.w * .015
  const gapFor = (size: number) => Math.max(3, size * .045)
  const currencySizeFor = (size: number) => Math.max(width * .015, size * .34)
  const setFont = (size: number) => { ctx.font = `800 ${size}px "${fontFamily}", Arial, sans-serif` }
  const textWidth = (text: string, size: number) => { setFont(size); return ctx.measureText(text).width }

  let currencyX = 0
  let numberX = 0
  // Mantém o "Por:" independente e na posição ajustada pelo usuário,
  // usando seu centro como referência para a coluna compacta R$ / Por.
  const porCenterX = por.x + por.w / 2
  for (; priceSize > minPriceSize; priceSize -= 2) {
    const numberWidth = textWidth(number, priceSize)
    if (!showCurrency) {
      if (numberWidth <= price.w * .97) break
      continue
    }
    const currencySize = currencySizeFor(priceSize)
    const currencyWidth = textWidth('R$', currencySize)
    const gapX = gapFor(priceSize)
    if (hasOldPrice) {
      currencyX = Math.max(leftEdge + currencyWidth / 2, porCenterX)
      numberX = currencyX + currencyWidth / 2 + gapX
    } else {
      const groupWidth = currencyWidth + gapX + numberWidth
      currencyX = leftEdge + Math.max(0, (rightEdge - leftEdge - groupWidth) / 2) + currencyWidth / 2
      numberX = currencyX + currencyWidth / 2 + gapX
    }
    if (numberX + numberWidth <= rightEdge) break
  }
  priceSize = Math.max(minPriceSize, priceSize)
  const priceTop = price.y + Math.max(0, (price.h - priceSize) / 2)
  ctx.fillStyle = style.priceColor
  ctx.textBaseline = 'top'
  if (showCurrency) {
    // Recalcula usando o tamanho final, inclusive caso a largura seja muito pequena.
    const currencySize = currencySizeFor(priceSize)
    const currencyWidth = textWidth('R$', currencySize)
    const numberWidth = textWidth(number, priceSize)
    const gapX = gapFor(priceSize)
    if (hasOldPrice) {
      currencyX = Math.max(leftEdge + currencyWidth / 2, porCenterX)
      numberX = currencyX + currencyWidth / 2 + gapX
    } else {
      const groupWidth = currencyWidth + gapX + numberWidth
      currencyX = leftEdge + Math.max(0, (rightEdge - leftEdge - groupWidth) / 2) + currencyWidth / 2
      numberX = currencyX + currencyWidth / 2 + gapX
    }
    // O 'R$' fica menor e mais baixo, alinhado à base do preço principal.
    setFont(currencySize)
    ctx.textAlign = 'center'
    ctx.fillText('R$', currencyX, priceTop + priceSize * .60)
    setFont(priceSize)
    ctx.textAlign = 'left'
    ctx.fillText(number, numberX, priceTop, Math.max(1, rightEdge - numberX))
    if (hasOldPrice) {
      // Quando existe R$, 'Por:' fica logo acima dele.
      drawFitText(ctx, 'Por:', currencyX, por.y, Math.max(por.w, currencyWidth * 1.2), por.h,
        width * .052, fontFamily, style.titleColor, 1, width * .018)
    }
  } else {
    // Sem R$, o 'Por:' continua na posição original (se houver preço DE).
    setFont(priceSize)
    ctx.textAlign = 'center'
    ctx.fillText(number, price.x + price.w / 2, priceTop, price.w)
    if (hasOldPrice) {
      drawFitText(ctx, 'Por:', porCenterX, por.y, por.w, por.h,
        width * .052, fontFamily, style.titleColor, 1, width * .018)
    }
  }

  const unit = box('unit')
  drawFitText(ctx, poster.unit_label.toLocaleUpperCase('pt-BR'), unit.x + unit.w / 2, unit.y,
    unit.w, unit.h, width * style.unitScale, fontFamily, style.unitColor, 3, width * .019)
}

export async function exportPostersPDF(options: {
  posters: Poster[]
  templates: PosterTemplate[]
  urls: Record<string, string>
  fonts: FontAsset[]
  layout: 'single' | 'double'
  repeatLast: boolean
  onProgress?: (current: number, total: number) => void
}): Promise<void> {
  const { posters, templates, urls, fonts, layout, repeatLast, onProgress } = options
  if (!posters.length) throw new Error('Selecione pelo menos um cartaz.')
  const isDouble = layout === 'double'
  const doc = new jsPDF({ orientation: isDouble ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: 'Cartazes Seridóplast', subject: 'Cartazes de preço para impressão', creator: 'Seridóplast Cartazes' })
  const queue = [...posters]
  if (isDouble && repeatLast && queue.length % 2 === 1) queue.push(queue[queue.length - 1])
  const canvas = document.createElement('canvas')
  for (let index = 0; index < queue.length; index++) {
    if (index && (!isDouble || index % 2 === 0)) doc.addPage('a4', isDouble ? 'landscape' : 'portrait')
    const poster = queue[index]
    const template = templates.find(t => t.id === poster.template_id)
    if (!template) throw new Error(`Modelo do cartaz “${poster.product_name}” não encontrado.`)
    const url = urls[template.id]
    if (!url) throw new Error(`Não foi possível carregar a arte do modelo “${template.name}”.`)
    const font = fonts.find(f => f.id === (poster.font_id || template.style.fontId))
    await paintPoster(canvas, template, poster, url, font?.family ?? 'Arial', 1654)
    const data = canvas.toDataURL('image/jpeg', .94)
    if (isDouble) doc.addImage(data, 'JPEG', index % 2 === 0 ? 0 : 148.5, 0, 148.5, 210, undefined, 'FAST')
    else doc.addImage(data, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
    onProgress?.(index + 1, queue.length)
  }
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`seridoplast-cartazes-${stamp}-${layout === 'single' ? 'A4' : '2porfolha'}.pdf`)
}

export function percent(value: number): string { return `${clamp(value * 100, 0, 100).toFixed(1)}%` }
