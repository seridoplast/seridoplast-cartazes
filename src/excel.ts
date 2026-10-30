import type { PosterInput } from './types'
import { parseMoney } from './render'

/** Read .xlsx from the user's computer, entirely in the browser; no Excel file is uploaded. */
export async function importExcel(file: File, templateId: string, fontId: string | null): Promise<PosterInput[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Selecione uma planilha Excel no formato .xlsx.')
  if (file.size > 8 * 1024 * 1024) throw new Error('A planilha deve ter até 8 MB.')
  const { default: readXlsxFile } = await import('read-excel-file')
  let sheet: Awaited<ReturnType<typeof readXlsxFile>>
  try { sheet = await readXlsxFile(file) }
  catch { throw new Error('Não foi possível abrir o Excel. Salve como .xlsx e tente novamente.') }
  const result: PosterInput[] = []
  for (let index = 0; index < sheet.length; index++) {
    const row = sheet[index]
    if (!row.some(cell => cell !== null && String(cell).trim())) continue
    const [name, oldValue, currentValue, unit] = [0, 1, 2, 3].map(i => String(row[i] ?? '').trim())
    if (index === 0 && /^(produto|descri[cç][aã]o|nome)/i.test(name)) continue
    const price = parseMoney(currentValue)
    if (!name || price === null || price <= 0) throw new Error(`Linha ${index + 1}: informe produto e preço POR válido (colunas A e C).`)
    const old = parseMoney(oldValue)
    if (oldValue && old === null) throw new Error(`Linha ${index + 1}: preço DE inválido (coluna B).`)
    if (name.length > 350 || unit.length > 180) throw new Error(`Linha ${index + 1}: descrição ou unidade excedeu o limite.`)
    result.push({ product_name: name, price_from: old, price_to: price, unit_label: unit, template_id: templateId, font_id: fontId })
    if (result.length > 200) throw new Error('Importe no máximo 200 cartazes por vez.')
  }
  if (!result.length) throw new Error('Nenhum produto encontrado. Use colunas Produto | De | Por | Unidade.')
  return result
}
