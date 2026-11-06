/** Interpreta a coluna opcional Peso (KG) da planilha e da colagem. */
export function parseWeightFlag(value: string, row?: number): boolean {
  const normalized = value.trim().toLocaleUpperCase('pt-BR')
  if (!normalized || ['NÃO', 'NAO', 'N', '0', 'FALSO', 'FALSE', 'UNIDADE'].includes(normalized)) return false
  if (['SIM', 'S', '1', 'VERDADEIRO', 'TRUE', 'KG', 'PESO', 'POR KG', 'QUILO', 'YES'].includes(normalized)) return true
  throw new Error(`${row ? `Linha ${row}: ` : ''}Peso (KG) inválido: “${value}”. Use SIM ou NÃO.`)
}
