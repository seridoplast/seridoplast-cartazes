import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const isConfigured = Boolean(url && key && !url.includes('SEU-PROJETO') && !key.includes('SUA_CHAVE'))
export const supabase = isConfigured
  ? createClient(url!, key!, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null
export const DEMO_IMAGE_URL = `${import.meta.env.BASE_URL}modelo-seridoplast.jpg`

export function cleanError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Não foi possível concluir esta operação.'
}

export async function signedUrl(bucket: string, path: string): Promise<string> {
  if (path === 'bundled') return DEMO_IMAGE_URL
  if (!supabase) throw new Error('Conecte o Supabase para acessar os arquivos compartilhados.')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 4)
  if (error || !data?.signedUrl) throw error || new Error('Falha ao acessar o arquivo.')
  return data.signedUrl
}

export function randomFilePath(userId: string, file: File): string {
  const extension = (file.name.split('.').pop() ?? 'dat').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${userId}/${crypto.randomUUID()}.${extension}`
}
