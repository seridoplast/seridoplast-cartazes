export type Zone = { x: number; y: number; w: number; h: number }
export type PosterElement = 'title' | 'old' | 'por' | 'price' | 'unit'
export type PosterElementLayout = Partial<Record<PosterElement, Zone>>
export type PosterStyle = {
  titleScale: number
  priceScale: number
  unitScale: number
  oldScale: number
  titleColor: string
  priceColor: string
  oldColor: string
  unitColor: string
  showCurrency: boolean
  fontId: string | null
  elements?: PosterElementLayout
}
export type PosterTemplate = {
  id: string
  name: string
  image_path: string
  image_width: number
  image_height: number
  zone: Zone
  style: PosterStyle
  owner_id: string
  created_at: string
  updated_at?: string
}
/** Apenas item da montagem atual; NÃO há gravação na tabela antiga posters. */
export type Poster = {
  id: string
  template_id: string
  product_name: string
  price_from: number | null
  price_to: number
  unit_label: string
  font_id: string | null
  owner_id: string
  created_at: string
  updated_at: string
}
/** Registro persistente, independente de qualquer arte ou modelo. */
export type CatalogProduct = {
  id: string
  product_name: string
  price_from: number | null
  price_to: number
  unit_label: string
  owner_id: string
  created_at: string
  updated_at: string
}
export type PrintItem = Poster & { product_id: string | null }
export type ProductInput = Pick<CatalogProduct, 'product_name' | 'price_from' | 'price_to' | 'unit_label'>
export type FontAsset = {
  id: string
  name: string
  family: string
  file_path: string
  owner_id: string
  created_at: string
}
export type TemplateInput = Pick<PosterTemplate, 'name' | 'zone' | 'style' | 'image_width' | 'image_height'>
export const INITIAL_ZONE: Zone = { x: 0.085, y: 0.354, w: 0.83, h: 0.424 }
export const INITIAL_STYLE: PosterStyle = {
  titleScale: 0.044,
  priceScale: 0.205,
  unitScale: 0.051,
  oldScale: 0.050,
  titleColor: '#101010',
  priceColor: '#050505',
  oldColor: '#f62629',
  unitColor: '#090909',
  showCurrency: false,
  fontId: null
}
export const EXAMPLE_POSTER: Poster = {
  id: 'demo-poster', template_id: 'demo-template',
  product_name: 'CRISTALCOPO COPO PS TRANSP 150ML 100UN',
  price_from: 99.9, price_to: 78.75, unit_label: 'CX C/ 25PC X 100UND', font_id: null,
  owner_id: 'demo', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
}
export const EXAMPLE_TEMPLATE: PosterTemplate = {
  id: 'demo-template', name: 'Promoção da Semana · Seridóplast',
  image_path: 'bundled', image_width: 1447, image_height: 2048,
  zone: INITIAL_ZONE, style: INITIAL_STYLE, owner_id: 'demo',
  created_at: new Date().toISOString()
}
