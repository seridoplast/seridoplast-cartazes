import { jsPDF } from 'jspdf'
import type { FontAsset, Poster, PosterStyle, PosterTemplate } from './types'
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
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  const zone = template.zone
  const style: PosterStyle = { ...INITIAL_STYLE, ...template.style }
  const x = zone.x * width, y = zone.y * height, w = zone.w * width, h = zone.h * height
  const cx = x + w / 2
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  drawFitText(ctx, poster.product_name.toLocaleUpperCase('pt-BR'), cx, y + h * .015,
    w * .96, h * .255, width * style.titleScale, fontFamily, style.titleColor, 3, width * .019)
  if (poster.price_from !== null) {
    const oldSize = width * style.oldScale
    ctx.font = `800 ${oldSize}px "${fontFamily}", Arial, sans-serif`
    const oldText = money(poster.price_from)
    const labelSize = oldSize * .77
    const oldWidth = ctx.measureText(oldText).width
    ctx.font = `800 ${labelSize}px "${fontFamily}", Arial, sans-serif`
    const labelWidth = ctx.measureText('De: ').width
    const startX = cx - (oldWidth + labelWidth + width * .01) / 2
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = style.oldColor
    const oldY = y + h * .29
    ctx.fillText('De: ', startX, oldY + oldSize * .14)
    ctx.font = `800 ${oldSize}px "${fontFamily}", Arial, sans-serif`
    const numberX = startX + labelWidth + width * .01
    ctx.fillText(oldText, numberX, oldY)
    const lineY = oldY + oldSize * .53
    ctx.strokeStyle = style.oldColor; ctx.lineWidth = Math.max(2, width * .005)
    ctx.beginPath(); ctx.moveTo(numberX, lineY); ctx.lineTo(numberX + oldWidth, lineY); ctx.stroke()
  }
  ctx.fillStyle = style.titleColor
  ctx.font = `800 ${Math.round(width * .052)}px "${fontFamily}", Arial, sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('Por:', x + w * .06, y + h * .40)
  const number = money(poster.price_to)
  let fontSize = width * style.priceScale
  ctx.fillStyle = style.priceColor
  for (; fontSize > width * .08; fontSize -= 2) {
    ctx.font = `800 ${fontSize}px "${fontFamily}", Arial, sans-serif`
    if (ctx.measureText(number).width <= w * (style.showCurrency ? .80 : .95) && fontSize < h * .36) break
  }
  ctx.font = `800 ${fontSize}px "${fontFamily}", Arial, sans-serif`
  const priceWidth = ctx.measureText(number).width
  const currencySize = width * .051
  const currencyWidth = style.showCurrency ? width * .11 : 0
  const groupX = cx - (priceWidth + currencyWidth) / 2
  const priceY = y + h * .465
  if (style.showCurrency) {
    ctx.font = `800 ${currencySize}px "${fontFamily}", Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('R$', groupX + width * .005, priceY + fontSize * .20)
  }
  ctx.font = `800 ${fontSize}px "${fontFamily}", Arial, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(number, groupX + currencyWidth, priceY)
  drawFitText(ctx, poster.unit_label.toLocaleUpperCase('pt-BR'), cx, y + h * .81,
    w * .96, h * .18, width * style.unitScale, fontFamily, style.unitColor, 2, width * .020)
  ctx.restore()
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
