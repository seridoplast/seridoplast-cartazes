import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Cloud,
  CopyPlus, Download, FileDown, FilePlus2, FileSpreadsheet, FolderOpen, ImagePlus,
  LayoutDashboard, LibraryBig, LockKeyhole, LogIn, LogOut, Menu, Moon, MoreHorizontal,
  MoveUpRight, Plus, RefreshCw, Save, Search, Settings2, ShieldCheck, Sparkles,
  Sun, Trash2, Type, UploadCloud, WandSparkles, X
} from 'lucide-react'
import { DEMO_IMAGE_URL, cleanError, isConfigured, randomFilePath, signedUrl, supabase } from './supabase'
import { defaultElementZones, exportPostersPDF, loadCustomFont, loadImage, money, parseMoney } from './render'
import { PosterCanvas } from './components/PosterCanvas'
import { ZoneEditor } from './components/ZoneEditor'
import { ElementsEditor } from './components/ElementsEditor'
import { BrandLogo } from './components/BrandLogo'
import { importExcel } from './excel'
import {
  EXAMPLE_POSTER, EXAMPLE_TEMPLATE, INITIAL_STYLE, INITIAL_ZONE,
  type CatalogProduct, type FontAsset, type PrintItem, type Poster, type ProductInput,
  type PosterStyle, type PosterTemplate, type TemplateInput, type Zone, type PosterElement
} from './types'

type Page = 'dashboard' | 'posters' | 'products' | 'templates' | 'fonts' | 'tutorial' | 'edit-template'
type ExportLayout = 'single' | 'double'
// Modo compatível com o cache atual do PostgREST: a tabela posters já é reconhecida
// pela API. Os NOVOS produtos têm template_id = NULL (independentes dos modelos).
const PRODUCT_API_COLUMNS = 'id,product_name,price_from,price_to,unit_label,owner_id,created_at,updated_at'
const NOW = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const DEMO_USER = { id: 'demo', email: 'demonstração@seridoplast.com.br' }
const numeric = (value: unknown) => value == null ? null : Number(value)
function normalizeTemplate(row: PosterTemplate): PosterTemplate {
  return { ...row, zone: { ...INITIAL_ZONE, ...row.zone }, style: { ...INITIAL_STYLE, ...row.style } }
}
function normalizeProduct(row: CatalogProduct): CatalogProduct {
  return { ...row, price_from: numeric(row.price_from), price_to: Number(row.price_to) }
}
function cleanProduct(input: ProductInput): ProductInput {
  return { product_name: input.product_name.trim(), unit_label: input.unit_label.trim(),
    price_from: input.price_from, price_to: input.price_to }
}
function productKey(product: ProductInput) {
  return `${product.product_name.trim().toLocaleLowerCase('pt-BR')}|${product.unit_label.trim().toLocaleLowerCase('pt-BR')}`
}
function blankProduct(): ProductInput { return { product_name: '', price_from: null, price_to: 0, unit_label: '' } }
function parseBulk(text: string): ProductInput[] {
  const result: ProductInput[] = []
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const line of lines) {
    const pieces = line.includes('\t') ? line.split('\t') : line.split(';')
    const [name = '', oldValue = '', newValue = '', unit = ''] = pieces.map(s => s.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''))
    if (/^(produto|descri[cç][aã]o|nome)/i.test(name)) continue
    const value = parseMoney(newValue), old = parseMoney(oldValue)
    if (!name || value === null || value <= 0) throw new Error(`Linha inválida: “${line.slice(0, 90)}”. Use Produto | De | Por | Unidade.`)
    if (oldValue && old === null) throw new Error(`Preço DE inválido em “${name}”.`)
    if (name.length > 350 || unit.length > 180) throw new Error(`Produto ou apresentação muito longa em “${name.slice(0, 45)}”.`)
    result.push({ product_name: name, price_from: old, price_to: value, unit_label: unit })
  }
  if (!result.length) throw new Error('Cole pelo menos um produto com preço de venda.')
  if (result.length > 200) throw new Error('Importe no máximo 200 produtos de cada vez.')
  return result
}
function downloadCsvSample() {
  const text = '\uFEFFProduto;De;Por;Unidade\nCRISTALCOPO COPO PS 150ML 100UN;99,90;78,75;CX C/ 25PC X 100UND\nSACOLA NEWPLAST M;39,90;34,50;FARDO C/ 1.000 UN\n'
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'exemplo-cartazes.csv'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function CurrencyInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder: string }) {
  const [text, setText] = useState(value === null || value === 0 ? '' : money(value))
  return <input inputMode="decimal" placeholder={placeholder} value={text}
    onChange={event => { const raw = event.target.value; setText(raw); onChange(parseMoney(raw)) }}
    onBlur={() => { const parsed = parseMoney(text); setText(parsed === null ? '' : money(parsed)); onChange(parsed) }}/>
}

function Login({ onLogin }: { onLogin: (user: {id:string;email:string}) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reset, setReset] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase) return
    setMessage(''); setBusy(true)
    try {
      if (reset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('#')[0] })
        if (error) throw error
        setMessage('Enviamos as instruções de recuperação para seu e-mail.'); setReset(false); return
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (data.user) onLogin({ id: data.user.id, email: data.user.email || email })
    } catch (err) { setMessage(cleanError(err)) } finally { setBusy(false) }
  }
  return <main className="auth-page">
    <div className="auth-brand"><BrandLogo className="on-red" /></div>
    <div className="auth-hero"><div className="auth-decoration"><span>25</span> anos de quem faz acontecer</div><h1>Cartazes de preço,<br/><em>sem complicação.</em></h1><p>Crie campanhas, padronize as etiquetas de gôndola e imprima dezenas de ofertas com poucos cliques.</p>
      <div className="auth-points"><span><CheckCircle2 size={18}/> Modelos compartilhados</span><span><CheckCircle2 size={18}/> Impressão A4 precisa</span><span><CheckCircle2 size={18}/> Equipe conectada</span></div>
    </div>
    <section className="auth-card"><div className="auth-icon"><LockKeyhole size={22}/></div><h2>{reset ? 'Recuperar acesso' : 'Bem-vindo de volta'}</h2><p>{reset ? 'Informe seu e-mail para receber um link de recuperação.' : 'Entre com sua conta de colaborador.'}</p>
      <form onSubmit={submit} className="form-stack"><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="seuemail@empresa.com" required/></label>
        {!reset && <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={6} required placeholder="Sua senha"/></label>}
        {message && <div className="inline-alert">{message}</div>}
        <button className="btn btn-primary btn-large" type="submit" disabled={busy}>{busy ? 'Processando...' : reset ? 'Enviar instruções' : <>Entrar no sistema <ArrowRight size={18}/></>}</button>
      </form><button className="text-button auth-reset" onClick={() => { setReset(!reset); setMessage('') }}>{reset ? 'Voltar para o login' : 'Esqueceu sua senha?'}</button>
      <div className="auth-foot"><ShieldCheck size={17}/> Acesso exclusivo para usuários autorizados</div>
    </section>
  </main>
}

type Props = { user: { id: string; email: string }; onLogout: () => void }
function Workspace({ user, onLogout }: Props) {
  const [page, setPage] = useState<Page>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('cartazes-theme') === 'dark')
  const [templates, setTemplates] = useState<PosterTemplate[]>(isConfigured ? [] : [EXAMPLE_TEMPLATE])
  const [products, setProducts] = useState<CatalogProduct[]>(isConfigured ? [] : [{
    ...blankProduct(), id: 'demo-product', owner_id: 'demo', created_at: NOW(), updated_at: NOW(),
    product_name: EXAMPLE_POSTER.product_name, price_from: EXAMPLE_POSTER.price_from,
    price_to: EXAMPLE_POSTER.price_to, unit_label: EXAMPLE_POSTER.unit_label
  }])
  const [fonts, setFonts] = useState<FontAsset[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(isConfigured ? {} : { [EXAMPLE_TEMPLATE.id]: DEMO_IMAGE_URL })
  const [loading, setLoading] = useState(isConfigured)
  const [working, setWorking] = useState(false)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const sessionKey = `seridoplast-cartazes-v2-sessao-${user.id}`
  const [sessionItems, setSessionItems] = useState<PrintItem[]>(() => {
    try {
      const raw = sessionStorage.getItem(sessionKey)
      const items = raw ? JSON.parse(raw) : []
      if (!Array.isArray(items)) return []
      return items.filter(item => item && typeof item.id === 'string' && typeof item.product_name === 'string' && typeof item.template_id === 'string')
    } catch { return [] }
  })
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionItems[0]?.id ?? null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [productEditing, setProductEditing] = useState<CatalogProduct | null>(null)
  const [productForm, setProductForm] = useState<ProductInput>(blankProduct())
  const [search, setSearch] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [layout, setLayout] = useState<ExportLayout>('single')
  const [repeatLast, setRepeatLast] = useState(true)
  const [keepAfterExport, setKeepAfterExport] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const batchFileRef = useRef<HTMLInputElement>(null)
  const [batchRows, setBatchRows] = useState<ProductInput[] | null>(null)
  const [batchFilename, setBatchFilename] = useState('')
  const [modelEditing, setModelEditing] = useState<PosterTemplate | null>(null)
  const [exportProgress, setExportProgress] = useState('')

  const notify = (text: string, error = false) => setToast({ text, error })
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2000); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('cartazes-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => {
    try { sessionStorage.setItem(sessionKey, JSON.stringify(sessionItems)) }
    catch (error) { console.warn('A sessão não pôde ser guardada nesta aba:', error) }
  }, [sessionItems, sessionKey])
  const refresh = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [t, c, f] = await Promise.all([
        supabase.from('poster_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('posters').select(PRODUCT_API_COLUMNS).order('updated_at', { ascending: false }).range(0, 999),
        supabase.from('font_assets').select('*').order('created_at', { ascending: false })
      ])
      if (t.error) throw t.error
      if (f.error) throw f.error
      const resultTemplates = ((t.data || []) as PosterTemplate[]).map(normalizeTemplate)
      const resultFonts = (f.data || []) as FontAsset[]
      const entries = await Promise.all(resultTemplates.map(async t => [t.id, await signedUrl('cartaz-artes', t.image_path)] as const))
      const fontEntries = await Promise.all(resultFonts.map(async f => [f.id, await signedUrl('cartaz-fontes', f.file_path)] as const))
      await Promise.all(resultFonts.map(async font => {
        const signed = fontEntries.find(([id]) => id === font.id)?.[1]
        if (signed) try { await loadCustomFont(font, signed) } catch (error) { console.warn(`Fonte ${font.name}:`, error) }
      }))
      setTemplates(resultTemplates); setFonts(resultFonts); setImageUrls(Object.fromEntries(entries))
      setSelectedTemplateId(prev => resultTemplates.some(t => t.id === prev) ? prev : (resultTemplates[0]?.id || ''))
      if (c.error) {
        setCatalogError('Não foi possível ler os produtos pela API. Confira se a tabela public.posters continua acessível no Supabase. Erro: ' + cleanError(c.error))
        console.error('Erro no catálogo:', c.error)
      } else {
        setCatalogError('')
        const accumulated = [...((c.data || []) as CatalogProduct[])]
        // API Supabase normalmente limita respostas a 1000 linhas.
        // Paginação evita desaparecer com produtos quando o catálogo crescer.
        let offset = accumulated.length
        while (offset > 0 && offset % 1000 === 0 && offset < 50000) {
          const next = await supabase.from('posters').select(PRODUCT_API_COLUMNS)
            .order('updated_at', { ascending: false }).range(offset, offset + 999)
          if (next.error) throw next.error
          const chunk = (next.data || []) as CatalogProduct[]
          accumulated.push(...chunk)
          offset += chunk.length
          if (chunk.length < 1000) break
        }
        // O banco antigo podia registrar o mesmo produto em mais de um cartaz.
        // A biblioteca mostra só a ocorrência mais recente por nome + apresentação.
        const seen = new Set<string>()
        const distinctProducts = accumulated.filter(product => {
          const key = productKey(product)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setProducts(distinctProducts.map(normalizeProduct))
      }
    } catch (error) { notify(`Falha ao carregar dados: ${cleanError(error)}`, true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const activeSession = sessionItems.find(item => item.id === selectedSessionId) || null
  const activeTemplate = templates.find(t => t.id === (activeSession?.template_id || selectedTemplateId)) || templates[0]
  const filtered = useMemo(() => products.filter(p => `${p.product_name} ${p.unit_label}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [products, search])
  const catalogFiltered = useMemo(() => products.filter(p => `${p.product_name} ${p.unit_label}`.toLocaleLowerCase('pt-BR').includes(librarySearch.toLocaleLowerCase('pt-BR'))), [products, librarySearch])
  const myModels = templates.filter(t => t.owner_id === user.id).length

  async function run<T>(task: () => Promise<T>, success: string): Promise<T | undefined> {
    setWorking(true)
    try { const value = await task(); notify(success); return value }
    catch (error) { notify(cleanError(error), true); return undefined }
    finally { setWorking(false) }
  }
  function useTemplate(templateId?: string) {
    if (!templates.length) { notify('Crie um modelo antes de montar cartazes.', true); setPage('templates'); return }
    setSelectedTemplateId(templateId || templates[0].id)
    setPage('posters'); setMobileNav(false)
  }
  function openProduct(product: CatalogProduct | null = null) {
    setProductEditing(product); setProductForm(product ? {
      product_name: product.product_name, price_from: product.price_from, price_to: product.price_to, unit_label: product.unit_label
    } : blankProduct())
    setPage('products'); setMobileNav(false)
  }
  function addProduct(product: CatalogProduct) {
    if (!templates.length) { notify('Cadastre um modelo primeiro.', true); setPage('templates'); return }
    const item: PrintItem = { ...product, id: id(), product_id: product.id,
      template_id: selectedTemplateId || templates[0].id, font_id: null, updated_at: NOW(), created_at: NOW() }
    setSessionItems(prev => [...prev, item]); setSelectedSessionId(item.id)
    setPage('posters'); notify('Produto adicionado à montagem.')
  }
  function updateItem(change: Partial<PrintItem>) {
    if (!activeSession) return
    setSessionItems(prev => prev.map(item => item.id === activeSession.id ? { ...item, ...change } : item))
  }
  function removeItem(itemId: string) {
    setSessionItems(prev => prev.filter(item => item.id !== itemId))
    if (selectedSessionId === itemId) setSelectedSessionId(sessionItems.find(item => item.id !== itemId)?.id || null)
  }
  function clearSession() {
    if (!sessionItems.length || window.confirm('Limpar toda a montagem atual? Os produtos cadastrados e os modelos continuarão salvos.')) {
      setSessionItems([]); setSelectedSessionId(null)
      notify('Área de montagem limpa. Biblioteca preservada.')
    }
  }
  async function saveProduct() {
    const item = cleanProduct(productForm)
    if (item.product_name.length < 2 || item.product_name.length > 350 || item.unit_label.length > 180) {
      notify('Confira nome do produto e apresentação.', true); return
    }
    if (!Number.isFinite(item.price_to) || item.price_to <= 0) { notify('Informe um preço POR válido.', true); return }
    const duplicate = products.find(p => p.id !== productEditing?.id && productKey(p) === productKey(item))
    if (duplicate) { notify('Esse produto e apresentação já estão cadastrados. Edite o item existente.', true); return }
    await run(async () => {
      if (supabase) {
        const response = productEditing
          ? await supabase.from('posters').update(item).eq('id', productEditing.id).select(PRODUCT_API_COLUMNS).single()
          : await supabase.from('posters').insert({ ...item, owner_id: user.id, template_id: null }).select(PRODUCT_API_COLUMNS).single()
        if (response.error) {
          if (response.error.code === '23502' && response.error.message.includes('template_id')) {
            throw new Error('Execute a migração 005 no SQL Editor: ela permite cadastrar produtos sem vincular a modelos.')
          }
          throw response.error
        }
        await refresh()
      } else {
        const updated: CatalogProduct = { ...item, id: productEditing?.id || id(), owner_id: productEditing?.owner_id || user.id,
          created_at: productEditing?.created_at || NOW(), updated_at: NOW() }
        setProducts(prev => [updated, ...prev.filter(p => p.id !== updated.id)])
      }
      setProductEditing(null); setProductForm(blankProduct())
    }, productEditing ? 'Cadastro atualizado na biblioteca.' : 'Produto cadastrado e disponível para todos.')
  }
  async function deleteProduct(product: CatalogProduct) {
    if (product.owner_id !== user.id) { notify('Somente o criador pode excluir este cadastro.', true); return }
    if (!window.confirm(`Excluir “${product.product_name}” da biblioteca? Itens já adicionados à montagem atual não serão removidos.`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('posters').delete().eq('id', product.id)
        if (error) throw error
        await refresh()
      } else setProducts(prev => prev.filter(p => p.id !== product.id))
      setProductEditing(null); setProductForm(blankProduct())
    }, 'Produto excluído da biblioteca.')
  }
  function openBatch() { setBatchOpen(true); setBatchRows(null); setBatchFilename(''); setBatchText('') }
  async function saveBulk() {
    const rows = (batchRows || parseBulk(batchText)).map(cleanProduct)
    const existing = new Set(products.map(productKey))
    const unique = rows.filter(row => {
      const key = productKey(row)
      if (existing.has(key)) return false
      existing.add(key); return true
    })
    if (!unique.length) { notify('Todos os itens já estão cadastrados. Nada foi duplicado.', true); setBatchOpen(false); return }
    await run(async () => {
      if (supabase) {
        // A importação usa somente as colunas antigas e reconhecidas pela API.
        // Não usa font_id nem catalog_key, que causavam erros de cache.
        const { error } = await supabase.from('posters').insert(
          unique.map(item => ({ ...item, owner_id: user.id, template_id: null }))
        )
        if (error) {
          if (error.code === '23502' && error.message.includes('template_id')) {
            throw new Error('Execute a migração 005 no SQL Editor antes de importar produtos.')
          }
          throw error
        }
        await refresh()
      } else setProducts(prev => [...unique.map(item => ({ ...item, id: id(), owner_id: user.id, created_at: NOW(), updated_at: NOW() })), ...prev])
      setBatchOpen(false); setBatchRows(null); setBatchFilename(''); setBatchText('')
    }, `${unique.length} produto(s) processado(s) na biblioteca; ${rows.length - unique.length} repetido(s) ignorado(s).`)
  }
  async function saveTemplate(input: TemplateInput, file: File | null, existing: PosterTemplate | null) {
    await run(async () => {
      if (supabase) {
        let path = existing?.image_path
        if (!existing || file) {
          let source = file
          if (!source) {
            const response = await fetch(DEMO_IMAGE_URL)
            if (!response.ok) throw new Error('Não foi possível carregar o modelo de exemplo.')
            source = new File([await response.blob()], 'modelo-seridoplast.jpg', { type: 'image/jpeg' })
          }
          path = randomFilePath(user.id, source)
          const { error } = await supabase.storage.from('cartaz-artes').upload(path, source, { upsert: false, contentType: source.type })
          if (error) throw error
        }
        const values = { ...input, image_path: path }
        const response = existing
          ? await supabase.from('poster_templates').update(values).eq('id', existing.id).select().single()
          : await supabase.from('poster_templates').insert({ ...values, owner_id: user.id }).select().single()
        if (response.error) throw response.error
        await refresh()
      } else {
        const entry: PosterTemplate = { ...input, id: existing?.id || id(), owner_id: existing?.owner_id || user.id,
          image_path: file ? URL.createObjectURL(file) : existing?.image_path || 'bundled', created_at: existing?.created_at || NOW() }
        setTemplates(prev => [entry, ...prev.filter(t => t.id !== entry.id)])
        setImageUrls(prev => ({ ...prev, [entry.id]: file ? entry.image_path : existing ? imageUrls[existing.id] : DEMO_IMAGE_URL }))
      }
      setModelEditing(null); setPage('templates')
    }, existing ? 'Modelo atualizado para toda a equipe.' : 'Modelo publicado para toda a equipe.')
  }
  async function deleteTemplate(template: PosterTemplate) {
    if (template.owner_id !== user.id) { notify('Só quem criou pode excluir o modelo.', true); return }
    if (!window.confirm(`Excluir modelo “${template.name}”? Modelos usados em cartazes antigos podem ter restrições históricas.`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('poster_templates').delete().eq('id', template.id)
        if (error) throw error
        await refresh()
      } else setTemplates(prev => prev.filter(t => t.id !== template.id))
      setSessionItems(prev => prev.filter(p => p.template_id !== template.id))
    }, 'Modelo excluído.')
  }
  async function saveFont(file: File, name: string) {
    if (!/\.(ttf|otf|woff|woff2)$/i.test(file.name) || file.size > 5 * 1024 * 1024) { notify('Use TTF, OTF, WOFF ou WOFF2 com até 5 MB.', true); return }
    await run(async () => {
      const family = `TeamFont_${id().replaceAll('-', '').slice(0, 14)}`
      if (supabase) {
        const path = randomFilePath(user.id, file)
        const { error: uploadError } = await supabase.storage.from('cartaz-fontes').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
        if (uploadError) throw uploadError
        const { error } = await supabase.from('font_assets').insert({ name: name.trim() || file.name.replace(/\.[^.]+$/, ''), family, file_path: path, owner_id: user.id })
        if (error) throw error
        await refresh()
      } else {
        const font: FontAsset = { id: id(), name, family, file_path: file.name, owner_id: user.id, created_at: NOW() }
        await loadCustomFont(font, URL.createObjectURL(file))
        setFonts(prev => [font, ...prev])
      }
    }, 'Fonte instalada e compartilhada com a equipe.')
  }
  async function deleteFont(font: FontAsset) {
    if (font.owner_id !== user.id) { notify('Só quem enviou a fonte pode excluí-la.', true); return }
    if (templates.some(t => t.style.fontId === font.id) || sessionItems.some(p => p.font_id === font.id)) { notify('A fonte está em uso por um modelo ou sessão.', true); return }
    if (!window.confirm(`Excluir a fonte “${font.name}”?`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('font_assets').delete().eq('id', font.id)
        if (error) throw error
        await refresh()
      } else setFonts(prev => prev.filter(f => f.id !== font.id))
    }, 'Fonte removida.')
  }
  async function doExport(items: PrintItem[]) {
    if (!items.length) { notify('Adicione pelo menos um produto à montagem.', true); return }
    if (items.some(item => item.product_name.trim().length < 2 || !Number.isFinite(item.price_to) || item.price_to <= 0)) {
      notify('Confira nome e preço POR de todos os cartazes antes de exportar.', true); return
    }
    setWorking(true); setExportProgress('Preparando PDF...')
    try {
      await exportPostersPDF({ posters: items, templates, urls: imageUrls, fonts, layout, repeatLast,
        onProgress: (current, total) => setExportProgress(`Gerando PDF · ${current} de ${total}`) })
      if (!keepAfterExport) {
        const exportedIds = new Set(items.map(item => item.id))
        setSessionItems(prev => prev.filter(item => !exportedIds.has(item.id)))
        setSelectedSessionId(prev => prev && !exportedIds.has(prev) ? prev : (sessionItems.find(item => !exportedIds.has(item.id))?.id ?? null))
        notify('Download solicitado. Montagem exportada foi limpa; produtos continuam salvos.')
      } else notify('Download solicitado. Montagem mantida para reimprimir.')
    } catch (error) { notify(cleanError(error), true) }
    finally { setWorking(false); setExportProgress('') }
  }
  async function downloadBlankTemplate(template: PosterTemplate) {
    setWorking(true)
    try {
      const { jsPDF } = await import('jspdf')
      const image = await loadImage(imageUrls[template.id])
      const cvs = document.createElement('canvas'); cvs.width = 1654; cvs.height = 2339
      const ctx = cvs.getContext('2d')!; ctx.drawImage(image, 0, 0, cvs.width, cvs.height)
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
      doc.addImage(cvs.toDataURL('image/jpeg', .95), 'JPEG', 0, 0, 210, 297)
      doc.save(`modelo-${template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)
      notify('Modelo em branco exportado.')
    } catch (error) { notify(cleanError(error), true) } finally { setWorking(false) }
  }
  function editModel(template: PosterTemplate | null) { setModelEditing(template); setPage('edit-template') }
  const menu = [
    { id: 'dashboard' as Page, label: 'Visão geral', icon: LayoutDashboard },
    { id: 'posters' as Page, label: 'Montar cartazes', icon: FileSpreadsheet, count: sessionItems.length },
    { id: 'products' as Page, label: 'Produtos', icon: FolderOpen, count: products.length },
    { id: 'templates' as Page, label: 'Modelos', icon: LibraryBig, count: templates.length },
    { id: 'fonts' as Page, label: 'Fontes', icon: Type, count: fonts.length },
    { id: 'tutorial' as Page, label: 'Tutorial de uso', icon: CircleHelp }
  ]
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="sidebar-head"><BrandLogo className="sidebar-logo"/><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={19}/></button></div>
      <div className="side-caption">ESPAÇO DE TRABALHO</div>
      <nav className="nav-menu">{menu.map(item => <button key={item.id} className={`nav-link ${page === item.id || (page === 'edit-template' && item.id === 'templates') ? 'active' : ''}`}
        onClick={() => { setPage(item.id); setMobileNav(false) }}><item.icon size={20}/><span>{item.label}</span>{'count' in item && item.count !== undefined && <em>{item.count}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="team-info"><div className="team-icon"><Cloud size={18}/></div><div><strong>{isConfigured ? 'Sincronizado' : 'Modo demonstração'}</strong><small>{isConfigured ? 'Biblioteca no Supabase' : 'Dados desta aba'}</small></div><span className={`online-dot ${!isConfigured ? 'warn' : ''}`}/></div>
        <button className="sidebar-help" onClick={() => setPage('tutorial')}><CircleHelp size={17}/> Como utilizar <ChevronRight size={15}/></button></div>
    </aside>
    {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)}/>}
    <div className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={22}/></button><span className="topbar-location">Seridóplast <ChevronRight size={14}/> <strong>{page === 'edit-template' ? 'Editor de modelos' : menu.find(item => item.id === page)?.label}</strong></span></div>
        <div className="topbar-actions"><button className="icon-button" onClick={() => setDark(v => !v)} title="Alternar tema" aria-label="Alternar tema">{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-button" onClick={() => void refresh()} title="Atualizar biblioteca" aria-label="Atualizar biblioteca" disabled={loading}><RefreshCw size={19} className={loading ? 'spinning' : ''}/></button>
          <div className="avatar" title={user.email}>{user.email.charAt(0).toUpperCase()}</div><div className="account-email" title={user.email}>{user.email}</div>
          <button className="icon-button" onClick={onLogout} title="Sair" aria-label="Sair"><LogOut size={18}/></button>
        </div></header>
      {loading && <div className="loading-line"/>}
      {!isConfigured && <div className="demo-banner"><Sparkles size={17}/><strong>Modo demonstração:</strong> dados de exemplo, sem nuvem.</div>}
      {catalogError && <div className="catalog-warning"><CircleHelp size={20}/><span><strong>Configuração necessária: biblioteca de produtos.</strong> {catalogError}</span><button className="btn btn-outline btn-small" onClick={() => void refresh()}>Verificar novamente</button></div>}
      <main className="content">
      {page === 'dashboard' && <>
        <div className="welcome-banner"><div><div className="eyebrow">ESTÚDIO DE CAMPANHAS <span>•</span> SERIDÓPLAST</div><h1>Cartazes prontos,<br/><em>sem retrabalho.</em></h1><p>Uma biblioteca de produtos para todos, modelos independentes e montagem limpa após a impressão.</p><button className="btn btn-white" onClick={() => useTemplate()}><Plus size={17}/> Montar cartazes <ArrowRight size={17}/></button></div>
          <div className="hero-poster"><PosterCanvas template={templates[0] || EXAMPLE_TEMPLATE} poster={EXAMPLE_POSTER} imageURL={templates[0] ? imageUrls[templates[0].id] || DEMO_IMAGE_URL : DEMO_IMAGE_URL}/></div>
          <div className="welcome-circle circle-a"/><div className="welcome-circle circle-b"/></div>
        <div className="stat-grid"><div className="stat-card"><div className="stat-icon"><FolderOpen size={20}/></div><span>Produtos no catálogo</span><strong>{products.length}</strong><small>Reutilizáveis em qualquer modelo</small></div>
          <div className="stat-card"><div className="stat-icon lavender"><LibraryBig size={20}/></div><span>Modelos disponíveis</span><strong>{templates.length}</strong><small>{myModels} criados por você</small></div>
          <div className="stat-card"><div className="stat-icon yellow"><FileSpreadsheet size={20}/></div><span>Cartazes na montagem</span><strong>{sessionItems.length}</strong><small>Temporários, só nesta sessão</small></div></div>
        <div className="section-title"><div><h2>Comece por aqui</h2><p>Escolha como preparar suas ofertas.</p></div></div>
        <div className="quick-grid"><button className="quick-card" onClick={() => useTemplate()}><span className="quick-icon"><FilePlus2 size={22}/></span><strong>Montar cartazes</strong><p>Escolha produtos e modelos para imprimir.</p><span>Começar <ArrowRight size={16}/></span></button>
          <button className="quick-card" onClick={openBatch}><span className="quick-icon"><CopyPlus size={22}/></span><strong>Importar produtos</strong><p>Cadastre itens por planilha Excel ou colagem.</p><span>Importar <ArrowRight size={16}/></span></button>
          <button className="quick-card" onClick={() => setPage('tutorial')}><span className="quick-icon"><CircleHelp size={22}/></span><strong>Tutorial de uso</strong><p>Veja como cadastrar, diagramar e exportar.</p><span>Abrir tutorial <ArrowRight size={16}/></span></button></div>
        <div className="how-to"><div className="how-icon"><WandSparkles size={22}/></div><div><strong>Fluxo recomendado</strong><p>1. Cadastre os produtos → 2. Escolha um modelo → 3. Adicione itens à montagem → 4. Exporte o PDF. A montagem é limpa; o catálogo fica salvo.</p></div></div>
      </>}
      {page === 'posters' && <>
        <div className="page-heading"><div><div className="eyebrow muted">MONTAGEM TEMPORÁRIA</div><h1>Montar cartazes</h1><p>O produto fica na biblioteca; o modelo e os valores desta impressão não alteram o cadastro.</p></div><div className="page-buttons"><button className="btn btn-subtle" onClick={() => openProduct()}><Plus size={17}/> Cadastrar produto</button><button className="btn btn-outline" onClick={clearSession} disabled={!sessionItems.length}><Trash2 size={16}/> Limpar montagem</button></div></div>
        <div className="print-toolbar"><div className="print-left"><label className="inline-choice">Modelo inicial <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><span className="session-count">{sessionItems.length} cartaz(es) nesta montagem</span></div>
          <div className="print-right"><label className="inline-choice">Distribuição <select value={layout} onChange={e => setLayout(e.target.value as ExportLayout)}><option value="single">1 por A4</option><option value="double">2 por A4</option></select></label>
            {layout === 'double' && <label className="repeat-toggle"><input type="checkbox" checked={repeatLast} onChange={e => setRepeatLast(e.target.checked)}/> Repetir último</label>}
            <label className="repeat-toggle"><input type="checkbox" checked={keepAfterExport} onChange={e => setKeepAfterExport(e.target.checked)}/> Manter após PDF</label>
            <button className="btn btn-primary" disabled={working || !sessionItems.length} onClick={() => void doExport(sessionItems)}><FileDown size={17}/>{working && exportProgress ? exportProgress : 'Exportar e finalizar'}</button></div></div>
        <div className="session-strip"><div className="session-strip-heading"><strong>Cartazes desta impressão</strong><span>{sessionItems.length ? 'Clique em um item para ajustar somente esta impressão.' : 'Adicione produtos da biblioteca abaixo.'}</span></div>
          <div className="session-items">{sessionItems.length ? sessionItems.map(item => <div className={`session-chip ${selectedSessionId === item.id ? 'active' : ''}`} key={item.id}>
            <button onClick={() => setSelectedSessionId(item.id)} title="Editar este cartaz"><strong>{item.product_name}</strong><small>R$ {money(item.price_to)}</small></button>
            <button className="session-chip-remove" onClick={() => removeItem(item.id)} aria-label={`Remover ${item.product_name} desta montagem`} title="Remover da montagem"><X size={15}/></button>
          </div>) : <div className="session-empty">Nenhum cartaz nesta montagem. A arte do modelo começa em branco.</div>}</div></div>
        <div className="work-grid"><section className="poster-list panel"><div className="panel-title"><h3>Biblioteca de produtos <span className="count-chip">{filtered.length}</span></h3></div><div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos cadastrados..."/></div>
          {filtered.length > 250 && <p className="catalog-list-info">Exibindo 250 de {filtered.length} itens. Pesquise para encontrar os demais.</p>}<div className="list-scroll">{filtered.length ? filtered.slice(0, 250).map(product => <div className="poster-row" key={product.id}>
            <button className="poster-row-body" onClick={() => addProduct(product)} title="Adicionar à montagem"><strong>{product.product_name}</strong><span>{product.unit_label || 'Unidade não informada'}</span><div><b>R$ {money(product.price_to)}</b> {product.price_from !== null && <del>R$ {money(product.price_from)}</del>}</div></button>
            <button className="icon-button add-list-item" onClick={() => addProduct(product)} title="Adicionar ao cartaz" aria-label={`Adicionar ${product.product_name}`}><Plus size={18}/></button></div>) : <div className="empty-list"><FolderOpen size={28}/><strong>Nenhum produto encontrado</strong><p>Cadastre ou importe produtos no catálogo.</p></div>}</div>
          <div className="panel-bottom"><button className="link-action" onClick={openBatch}><CopyPlus size={17}/> Importar vários produtos</button></div></section>
          <section className="preview-panel panel"><div className="panel-title"><div><h3>Pré-visualização</h3><span>{activeSession ? 'Cartaz em edição (temporário)' : 'Modelo vazio, pronto para uso'}</span></div><span className="preview-tag">A4 · 210×297 mm</span></div>
            {activeTemplate && imageUrls[activeTemplate.id] ? <div className="preview-wrap">{activeSession ? <PosterCanvas template={activeTemplate} poster={activeSession} imageURL={imageUrls[activeTemplate.id]} fontFamily={fonts.find(f => f.id === (activeSession.font_id || activeTemplate.style.fontId))?.family}/> : <img className="blank-preview" src={imageUrls[activeTemplate.id]} alt="Modelo vazio, sem dados do último cartaz"/>}</div>
              : <div className="empty-preview"><ImagePlus size={34}/><strong>Sem modelo disponível</strong><p>Crie um modelo para começar.</p><button className="btn btn-outline" onClick={() => editModel(null)}>Criar modelo</button></div>}
            <div className="preview-footer"><span><CheckCircle2 size={16}/> Modelo independente dos produtos</span>{activeSession && <button className="btn btn-outline btn-small" disabled={working} onClick={() => void doExport([activeSession])}><Download size={16}/> Exportar este</button>}</div></section>
          <section className="form-panel panel"><div className="panel-title"><div><h3>{activeSession ? 'Ajustar este cartaz' : 'Aguardando produto'}</h3><span>Alterações só nesta impressão</span></div><Settings2 size={19} className="muted-icon"/></div>
            {activeSession ? <div className="editor-form" key={activeSession.id}>
              <label>Modelo deste cartaz<select value={activeSession.template_id} onChange={e => updateItem({ template_id: e.target.value })}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label>Fonte deste cartaz<select value={activeSession.font_id || ''} onChange={e => updateItem({ font_id: e.target.value || null })}><option value="">Padrão do modelo</option>{fonts.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Nome do produto<textarea rows={3} maxLength={350} value={activeSession.product_name} onChange={e => updateItem({ product_name: e.target.value })}/></label>
              <div className="divider-label"><span>Valores desta impressão</span></div><div className="price-fields"><label>DE (opcional)<span className="input-prefix">R$</span><CurrencyInput value={activeSession.price_from} onChange={value => updateItem({ price_from: value })} placeholder="99,90"/></label>
                <label>POR<span className="input-prefix">R$</span><CurrencyInput value={activeSession.price_to} onChange={value => updateItem({ price_to: value ?? 0 })} placeholder="78,75"/></label></div>
              <label>Apresentação<input maxLength={180} value={activeSession.unit_label} onChange={e => updateItem({ unit_label: e.target.value })}/></label>
              <div className="session-edit-note"><ShieldCheck size={17}/> As alterações acima não mudam o preço da biblioteca. Para atualizar o cadastro, abra Produtos.</div>
              <button className="btn btn-outline full" onClick={() => { const copy = { ...activeSession, id: id() }; setSessionItems(prev => [...prev, copy]); setSelectedSessionId(copy.id) }}><CopyPlus size={17}/> Duplicar nesta montagem</button>
              <button className="danger-link" onClick={() => removeItem(activeSession.id)}><Trash2 size={16}/> Remover desta montagem</button>
            </div> : <div className="empty-editor"><FilePlus2 size={28}/><p>Escolha um produto à esquerda. Ele será adicionado ao modelo somente para esta impressão.</p><button className="btn btn-outline" onClick={() => openProduct()}><Plus size={16}/> Cadastrar produto</button></div>}
          </section></div>
      </>}
      {page === 'products' && <>
        <div className="page-heading"><div><div className="eyebrow muted">CATÁLOGO COMPARTILHADO</div><h1>Biblioteca de produtos</h1><p>Produtos ficam salvos aqui e podem ser usados em qualquer modelo, quantas vezes quiser.</p></div><div className="page-buttons"><button className="btn btn-subtle" onClick={openBatch}><FileSpreadsheet size={17}/> Importar Excel</button><button className="btn btn-primary" onClick={() => openProduct()}><Plus size={18}/> Novo produto</button></div></div>
        <div className="products-grid"><section className="panel poster-list"><div className="panel-title"><h3>Produtos cadastrados <span className="count-chip">{catalogFiltered.length}</span></h3></div><div className="search-box"><Search size={18}/><input value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} placeholder="Pesquisar nome ou apresentação..."/></div>
          {catalogFiltered.length > 250 && <p className="catalog-list-info">Exibindo 250 de {catalogFiltered.length} itens. Refine a busca.</p>}<div className="list-scroll">{catalogFiltered.slice(0, 250).map(product => <div className={`poster-row ${productEditing?.id === product.id ? 'selected' : ''}`} key={product.id}>
            <button className="poster-row-body" onClick={() => openProduct(product)}><strong>{product.product_name}</strong><span>{product.unit_label}</span><div><b>R$ {money(product.price_to)}</b>{product.price_from !== null && <del>R$ {money(product.price_from)}</del>}</div></button>
            <button className="icon-button add-list-item" title="Adicionar à montagem" onClick={() => addProduct(product)}><Plus size={18}/></button></div>)}
            {!catalogFiltered.length && <div className="empty-list"><FolderOpen size={28}/><strong>Biblioteca vazia</strong><p>Cadastre o primeiro produto ou importe o Excel.</p></div>}</div></section>
          <section className="panel"><div className="panel-title"><div><h3>{productEditing ? 'Editar produto cadastrado' : 'Novo produto'}</h3><span>Esses dados ficarão disponíveis para toda a equipe.</span></div><button className="icon-button" onClick={() => openProduct()} title="Limpar formulário"><Plus size={18}/></button></div>
            <div className="editor-form" key={productEditing?.id || 'new'}><label>Descrição <span className="required">*</span><textarea rows={3} maxLength={350} value={productForm.product_name} placeholder="Ex.: CRISTALCOPO COPO PS 150ML 100UN" onChange={e => setProductForm(p => ({ ...p, product_name: e.target.value }))}/></label>
              <label>Apresentação<input maxLength={180} value={productForm.unit_label} placeholder="Ex.: CX C/ 25PC X 100UND" onChange={e => setProductForm(p => ({ ...p, unit_label: e.target.value }))}/></label>
              <div className="price-fields"><label>Preço DE<span className="input-prefix">R$</span><CurrencyInput value={productForm.price_from} onChange={v => setProductForm(p => ({ ...p, price_from: v }))} placeholder="99,90"/></label>
                <label>Preço POR <span className="required">*</span><span className="input-prefix">R$</span><CurrencyInput value={productForm.price_to} onChange={v => setProductForm(p => ({ ...p, price_to: v ?? 0 }))} placeholder="78,75"/></label></div>
              <button className="btn btn-primary full" onClick={() => void saveProduct()} disabled={working || !!catalogError}><Save size={18}/>{productEditing ? 'Salvar alterações na biblioteca' : 'Cadastrar na biblioteca'}</button>
              {productEditing && <><button className="btn btn-outline full" onClick={() => addProduct(productEditing)}><Plus size={17}/> Adicionar à montagem</button>
                {productEditing.owner_id === user.id && <button className="danger-link" onClick={() => void deleteProduct(productEditing)}><Trash2 size={16}/> Excluir cadastro</button>}</>}
              <div className="session-edit-note"><ShieldCheck size={17}/> Os produtos não têm modelo associado. Alterações aqui afetam futuras montagens, não os cartazes já preparados nesta aba.</div>
            </div></section></div>
      </>}
      {page === 'templates' && <>
        <div className="page-heading"><div><div className="eyebrow muted">IDENTIDADE VISUAL</div><h1>Biblioteca de modelos</h1><p>Salve a arte e as posições dos elementos; nenhum produto fica preso ao modelo.</p></div><button className="btn btn-primary" onClick={() => editModel(null)}><Plus size={18}/> Criar modelo</button></div>
        <div className="tip-strip"><ImagePlus size={19}/><span>Use imagem vertical A4, preferencialmente <strong>1447 × 2048 px</strong> ou maior. Na edição, arraste individualmente os elementos e salve o padrão para a equipe.</span></div>
        {templates.length ? <div className="template-grid">{templates.map(t => <article className="template-card" key={t.id}><div className="template-image"><img src={imageUrls[t.id]} alt={`Modelo ${t.name}`}/><span className="shared-label"><Cloud size={13}/> Compartilhado</span></div><div className="template-info"><strong>{t.name}</strong><small>{t.image_width} × {t.image_height} px · Reutilizável</small><div className="template-actions"><button className="btn btn-outline btn-small" onClick={() => editModel(t)}><Settings2 size={15}/> Editar</button><button className="btn btn-subtle btn-small" onClick={() => useTemplate(t.id)}><Plus size={15}/> Usar</button><button className="icon-button" onClick={() => void downloadBlankTemplate(t)} title="Baixar modelo vazio"><Download size={17}/></button>{t.owner_id === user.id && <button className="icon-button danger" title="Excluir modelo" onClick={() => void deleteTemplate(t)}><Trash2 size={16}/></button>}</div></div></article>)}</div>
          : <div className="empty-page"><ImagePlus size={34}/><h3>Publique seu primeiro modelo</h3><p>O projeto inclui uma arte de exemplo. Você também pode enviar seu próprio JPG/PNG.</p><button className="btn btn-primary" onClick={() => editModel(null)}><Plus size={17}/> Criar modelo</button></div>}
      </>}
      {page === 'fonts' && <FontsPage fonts={fonts} working={working} userId={user.id} onUpload={saveFont} onDelete={deleteFont}/>}
      {page === 'tutorial' && <TutorialPage onBegin={() => useTemplate()} onProducts={() => openProduct()} onTemplates={() => setPage('templates')}/>}
      {page === 'edit-template' && <TemplateEditor template={modelEditing} imageUrl={modelEditing ? imageUrls[modelEditing.id] : DEMO_IMAGE_URL} fonts={fonts} working={working} onClose={() => setPage('templates')} onSave={saveTemplate} onNotify={notify}/>}
      </main>
      <footer className="app-footer"><span>Seridóplast <b>•</b> Cartazes de preço</span><span>Acreditamos na força do trabalho!</span></footer>
    </div>
    {toast && <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>{toast.error ? <CircleHelp size={19}/> : <CheckCircle2 size={19}/>}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={17}/></button></div>}
    {batchOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setBatchOpen(false) }}><section className="modal batch-modal" role="dialog" aria-modal="true" aria-label="Importar produtos"><header><div><div className="eyebrow muted">BIBLIOTECA DE PRODUTOS</div><h2>Importar produtos em lote</h2><p>Os itens ficarão disponíveis em qualquer modelo, sem criar cartazes persistentes.</p></div><button className="icon-button" onClick={() => setBatchOpen(false)} aria-label="Fechar"><X size={20}/></button></header>
      <div className="modal-content"><div className="batch-columns"><span>PRODUTO</span><span>PREÇO DE</span><span>PREÇO POR</span><span>UNIDADE</span></div>
        <textarea rows={9} spellCheck={false} className="batch-input" value={batchText} onChange={e => { setBatchText(e.target.value); setBatchRows(null); setBatchFilename('') }} placeholder={'CRISTALCOPO COPO PS 150ML 100UN\t99,90\t78,75\tCX C/ 25PC X 100UND\nSACOLA NEWPLAST M\t39,90\t34,50\tFD C/ 1000 UN'}/>
        <p className="batch-hint"><FileSpreadsheet size={15}/> Excel .xlsx: A Produto, B De, C Por, D Unidade. Aceita colagem do Excel ou CSV separado por ponto e vírgula. Até 200 itens por importação; registros repetidos não são duplicados.</p>
        {batchFilename && <p className="batch-success"><CheckCircle2 size={16}/>{batchFilename} carregado · {batchRows?.length || 'revise as linhas'} produto(s).</p>}
        <div className="batch-file-actions"><a className="link-action" href={`${import.meta.env.BASE_URL}exemplo-cartazes.xlsx`} download="exemplo-cartazes.xlsx"><FileSpreadsheet size={16}/> Baixar Excel de exemplo</a>
          <button className="link-action" onClick={() => batchFileRef.current?.click()}><UploadCloud size={16}/> Escolher planilha</button>
          <button className="link-action" onClick={downloadCsvSample}><Download size={16}/> Baixar CSV</button></div>
        <input ref={batchFileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" className="sr-only" onChange={event => {
          const selected = event.target.files?.[0]; event.target.value = ''
          if (!selected) return
          if (/\.xlsx$/i.test(selected.name)) {
            void importExcel(selected).then(rows => { const converted = rows
              setBatchRows(converted); setBatchFilename(selected.name)
              setBatchText(converted.map(row => [row.product_name, row.price_from ?? '', row.price_to, row.unit_label].join('\t')).join('\n'))
              notify(`${converted.length} produtos do Excel preparados.`)
            }).catch(error => notify(cleanError(error), true))
          } else if (/\.(csv|tsv|txt)$/i.test(selected.name)) void selected.text().then(text => { setBatchText(text.replace(/^\uFEFF/, '')); setBatchRows(null); setBatchFilename(selected.name) }).catch(error => notify(cleanError(error), true))
          else notify('Formato inválido. Selecione Excel .xlsx, CSV ou TSV.', true)
        }}/></div>
      <footer><button className="btn btn-subtle" onClick={() => setBatchOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={working || !batchText.trim() || !!catalogError} onClick={() => { void saveBulk().catch(err => notify(cleanError(err), true)) }}><UploadCloud size={18}/> Salvar {batchRows?.length || batchText.split(/\r?\n/).filter(Boolean).length || ''} produtos</button></footer></section></div>}
  </div>
}

function TutorialPage({ onBegin, onProducts, onTemplates }: { onBegin: () => void; onProducts: () => void; onTemplates: () => void }) {
  const steps = [
    ['1', 'Cadastre os produtos', 'Abra Produtos e clique em Novo produto. Informe descrição, apresentação, preço DE (opcional) e preço POR. O cadastro será compartilhado e reutilizável.'],
    ['2', 'Importe uma planilha Excel', 'Em Produtos ou na montagem, escolha Importar Excel. Use as colunas A Produto, B De, C Por e D Unidade. Confirme para adicionar somente os produtos ainda não cadastrados.'],
    ['3', 'Crie ou escolha um modelo', 'Em Modelos, envie uma arte PNG/JPG vertical. Marque a área de conteúdo e abra a aba Elementos para arrastar cada texto e preço, inclusive DE com R$. Clique em Salvar modelo.'],
    ['4', 'Monte a impressão', 'Entre em Montar cartazes, selecione o modelo e clique nos produtos da biblioteca. Eles entram na fila desta sessão, sem criar registros novos de cartazes no Supabase.'],
    ['5', 'Ajuste somente esta impressão', 'Clique em um cartaz da fila. Altere valores, descrição, fonte ou modelo no painel lateral. Esses ajustes não modificam o cadastro do produto.'],
    ['6', 'Exporte e finalize', 'Escolha 1 ou 2 cartazes por A4 e clique em Exportar e finalizar. Após solicitar o download do PDF, a montagem é limpa. Marque Manter após PDF se precisar reimprimir.'],
  ]
  return <>
    <div className="page-heading"><div><div className="eyebrow muted">CENTRAL DE AJUDA</div><h1>Como usar o sistema</h1><p>Guia prático do Seridóplast Cartazes, desde o cadastro até a impressão.</p></div><button className="btn btn-primary" onClick={onBegin}><Plus size={17}/> Montar agora</button></div>
    <div className="tutorial-intro"><CircleHelp size={24}/><div><strong>Produtos, modelos e montagens são independentes.</strong><p>Produtos ficam salvos na biblioteca da equipe. A arte e o posicionamento dos elementos ficam no modelo. A fila de cartazes é temporária e é limpa após a exportação — sem apagar nenhum cadastro.</p></div></div>
    <div className="tutorial-grid">{steps.map(([n, title, body]) => <article className="tutorial-step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
    <section className="tutorial-faq"><h2>Dúvidas frequentes</h2>
      <details><summary>Se eu alterar o preço na montagem, muda o produto dos colegas?</summary><p>Não. É apenas um ajuste daquela impressão. Para alterar o preço cadastrado, entre em Produtos e edite o item na biblioteca.</p></details>
      <details><summary>Depois de gerar o PDF, perco os produtos?</summary><p>Não. Apenas a fila de cartazes é limpa. Todos os produtos, modelos e fontes continuam disponíveis para a equipe.</p></details>
      <details><summary>Como movimentar o nome e os preços na arte?</summary><p>Abra Modelos → Editar → Elementos. Arraste as caixas pela superfície e ajuste o tamanho pelo canto. Clique em Salvar modelo para que toda a equipe use o novo posicionamento.</p></details>
      <details><summary>O preço DE aparece com R$?</summary><p>Sim. Quando o campo DE estiver preenchido, ele será desenhado como “De: R$ 99,90”, com o valor antigo riscado. Você também pode ativar R$ junto ao preço POR no editor do modelo.</p></details>
      <details><summary>Como imprimir no tamanho correto?</summary><p>Abra o PDF e escolha papel A4, escala 100% ou tamanho real. Evite “Ajustar à página”, que pode alterar as medidas do cartaz.</p></details>
    </section>
    <div className="tutorial-actions"><button className="btn btn-outline" onClick={onProducts}><FolderOpen size={17}/> Cadastrar produto</button><button className="btn btn-outline" onClick={onTemplates}><ImagePlus size={17}/> Configurar modelos</button><button className="btn btn-primary" onClick={onBegin}><FileDown size={17}/> Começar montagem</button></div>
  </>
}

function FontsPage({ fonts, userId, working, onUpload, onDelete }: { fonts: FontAsset[]; userId: string; working: boolean; onUpload: (file: File, name: string) => Promise<void>; onDelete: (font: FontAsset) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  return <><div className="page-heading"><div><div className="eyebrow muted">PERSONALIZAÇÃO</div><h1>Fontes da equipe</h1><p>Envie fontes licenciadas para aplicar nos modelos ou em cartazes individuais.</p></div></div>
    <div className="fonts-grid"><section className="panel font-upload"><div className="panel-title"><h3>Instalar nova fonte</h3></div><label className="dropzone"><Type size={32}/><strong>{file ? file.name : 'Escolher arquivo de fonte'}</strong><span>TTF, OTF, WOFF ou WOFF2 · Máximo 5 MB</span><input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e => { const chosen = e.target.files?.[0] || null; setFile(chosen); setName(chosen?.name.replace(/\.[^.]+$/, '') || '') }}/></label>
      <label>Nome de exibição<input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Poppins Bold"/></label>
      <button className="btn btn-primary full" disabled={working || !file} onClick={() => { if (file) void onUpload(file, name).then(() => { setFile(null); setName('') }) }}><UploadCloud size={18}/> Adicionar fonte</button><div className="tip-strip compact"><ShieldCheck size={18}/><span>Envie somente fontes que a empresa tem licença para utilizar.</span></div></section>
      <section className="panel font-library"><div className="panel-title"><div><h3>Biblioteca de fontes</h3><span>{fonts.length} instalada(s) no espaço compartilhado</span></div></div>{fonts.length ? fonts.map(f => <div className="font-row" key={f.id}><div className="font-symbol">Aa</div><div><strong>{f.name}</strong><small>{f.file_path.split('.').at(-1)?.toUpperCase()} • Disponível para todos</small><div style={{ fontFamily: `"${f.family}", Arial, sans-serif` }}>Exemplo de texto 123,45</div></div>{f.owner_id === userId && <button className="icon-button danger" title="Remover fonte" onClick={() => void onDelete(f)}><Trash2 size={17}/></button>}</div>) : <div className="empty-list tall"><Type size={34}/><strong>Nenhuma fonte instalada</strong><p>Os cartazes usam Arial como padrão. Adicione uma fonte para personalizar.</p></div>}</section></div>
  </>
}

function TemplateEditor({ template, imageUrl, fonts, working, onClose, onSave, onNotify }: {
  template: PosterTemplate | null; imageUrl: string; fonts: FontAsset[]; working: boolean;
  onClose: () => void; onSave: (input: TemplateInput, file: File | null, existing: PosterTemplate | null) => Promise<void>; onNotify: (text: string, error?: boolean) => void
}) {
  const [name, setName] = useState(template?.name ?? 'Promoção da Semana · Seridóplast')
  const [zone, setZone] = useState<Zone>({ ...(template?.zone ?? INITIAL_ZONE) })
  const [style, setStyle] = useState<PosterStyle>({ ...INITIAL_STYLE, ...template?.style })
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: template?.image_width || 1447, height: template?.image_height || 2048 })
  const [tab, setTab] = useState<'area' | 'elements' | 'result'>('elements')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])
  const currentUrl = fileUrl || imageUrl
  const sample = { ...EXAMPLE_POSTER, template_id: template?.id || 'draft-template' }
  const data: PosterTemplate = { ...EXAMPLE_TEMPLATE, ...template, id: template?.id || 'draft-template', name, zone, style, image_width: dimensions.width, image_height: dimensions.height }
  function onChoose(selected: File | null) {
    if (!selected) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 15 * 1024 * 1024) {
      onNotify('Envie PNG, JPEG ou WEBP com no máximo 15 MB.', true); return
    }
    const url = URL.createObjectURL(selected)
    setFile(selected); setFileUrl(url)
    void loadImage(url).then(img => setDimensions({ width: img.naturalWidth, height: img.naturalHeight }))
  }
  const font = fonts.find(f => f.id === style.fontId)
  const aspect = dimensions.width / dimensions.height
  const risk = Math.abs(aspect - 210 / 297) / (210 / 297) > .04
  return <>
    <div className="page-heading"><div><button className="text-back" onClick={onClose}><ArrowLeft size={17}/> Voltar para modelos</button><h1>{template ? 'Editar modelo' : 'Criar modelo'}</h1><p>Posicione cada texto individualmente, sem associar produtos ao modelo.</p></div><button className="btn btn-primary" disabled={working || !name.trim()} onClick={() => void onSave({ name, zone, style, image_width: dimensions.width, image_height: dimensions.height }, file, template)}><Save size={18}/> Salvar modelo</button></div>
    <div className="template-editor-grid"><section className="panel model-edit-controls"><div className="panel-title"><h3>Configurações do modelo</h3></div><div className="editor-form">
      <label>Nome do modelo<input value={name} onChange={e => setName(e.target.value)} maxLength={120}/></label>
      <div className="divider-label"><span>Imagem de fundo</span></div><button className="upload-line" onClick={() => fileRef.current?.click()}><ImagePlus size={20}/><span><strong>{file?.name || (template ? 'Trocar imagem atual' : 'Usando arte Seridóplast inclusa')}</strong><small>Clique para escolher outra imagem</small></span><ChevronRight size={17}/></button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => onChoose(e.target.files?.[0] || null)}/>
      <div className="image-metadata"><span>{dimensions.width} × {dimensions.height} px</span><span className={risk ? 'text-warning' : 'text-success'}>{risk ? '⚠ Proporção diferente do A4' : '✓ Proporção adequada'}</span></div>
      <div className="divider-label"><span>Tipografia</span></div>
      <label>Fonte<select value={style.fontId ?? ''} onChange={e => setStyle(s => ({ ...s, fontId: e.target.value || null }))}><option value="">Arial (padrão)</option>{fonts.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label>Tamanho do nome <span className="range-value">{(style.titleScale * 100).toFixed(1).replace('.', ',')}%</span><input type="range" min="22" max="75" value={Math.round(style.titleScale * 1000)} onChange={e => setStyle(s => ({ ...s, titleScale: +e.target.value / 1000 }))}/></label>
      <label>Tamanho do preço <span className="range-value">{(style.priceScale * 100).toFixed(1).replace('.', ',')}%</span><input type="range" min="110" max="260" value={Math.round(style.priceScale * 1000)} onChange={e => setStyle(s => ({ ...s, priceScale: +e.target.value / 1000 }))}/></label>
      <label>Tamanho da unidade <span className="range-value">{(style.unitScale * 100).toFixed(1).replace('.', ',')}%</span><input type="range" min="26" max="90" value={Math.round(style.unitScale * 1000)} onChange={e => setStyle(s => ({ ...s, unitScale: +e.target.value / 1000 }))}/></label>
      <label>Tamanho do preço DE <span className="range-value">{(style.oldScale * 100).toFixed(1).replace('.', ',')}%</span><input type="range" min="20" max="110" value={Math.round(style.oldScale * 1000)} onChange={e => setStyle(s => ({ ...s, oldScale: +e.target.value / 1000 }))}/></label>
      <div className="color-grid"><label>Nome<input type="color" value={style.titleColor} onChange={e => setStyle(s => ({ ...s, titleColor: e.target.value }))}/></label><label>Preço<input type="color" value={style.priceColor} onChange={e => setStyle(s => ({ ...s, priceColor: e.target.value }))}/></label><label>De<input type="color" value={style.oldColor} onChange={e => setStyle(s => ({ ...s, oldColor: e.target.value }))}/></label><label>Unidade<input type="color" value={style.unitColor} onChange={e => setStyle(s => ({ ...s, unitColor: e.target.value }))}/></label></div>
      <div className="session-edit-note">O valor DE já inclui automaticamente “De: R$” no PDF. Abra Elementos para mover cada campo.</div><label className="switch-row"><input type="checkbox" checked={style.showCurrency} onChange={e => setStyle(s => ({ ...s, showCurrency: e.target.checked }))}/> Mostrar “R$” junto ao preço grande</label>
      <button className="btn btn-primary full" disabled={working || !name.trim()} onClick={() => void onSave({ name, zone, style, image_width: dimensions.width, image_height: dimensions.height }, file, template)}><Save size={18}/> Salvar alterações</button>
    </div></section>
    <section className="panel model-edit-stage"><div className="panel-title"><div><h3>{tab === 'area' ? 'Definir área geral' : tab === 'elements' ? 'Arrastar elementos livremente' : 'Resultado com preços'}</h3><span>{tab === 'area' ? 'Arraste a área e o canto inferior direito' : tab === 'elements' ? 'Arraste o texto ou o preço; redimensione pelo canto' : 'Prévia final com valores de exemplo'}</span></div><div className="mini-tabs"><button className={tab === 'area' ? 'on' : ''} onClick={() => setTab('area')}>Área</button><button className={tab === 'elements' ? 'on' : ''} onClick={() => setTab('elements')}>Elementos</button><button className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>Prévia</button></div></div>
      <div className="model-stage-content">{tab === 'area' ? <ZoneEditor imageURL={currentUrl} zone={zone} onChange={setZone}/> : tab === 'elements' ? <ElementsEditor template={data} poster={sample} imageURL={currentUrl} fontFamily={font?.family} onChange={(key: PosterElement, value: Zone) => setStyle(current => ({ ...current, elements: { ...defaultElementZones(zone), ...current.elements, [key]: value } }))}/> : <PosterCanvas template={data} poster={sample} imageURL={currentUrl} fontFamily={font?.family}/>}</div>
      <div className="stage-note"><MoveUpRight size={17}/><span>Área: X {Math.round(zone.x * 100)}% • Y {Math.round(zone.y * 100)}% • Largura {Math.round(zone.w * 100)}% • Altura {Math.round(zone.h * 100)}%</span><button className="text-button" onClick={() => setStyle(s => ({ ...s, elements: undefined }))}>Restaurar posições</button><button className="text-button" onClick={() => { setZone({ ...INITIAL_ZONE }); setStyle(s => ({ ...s, elements: undefined })) }}>Restaurar área</button></div>
    </section></div>
  </>
}

function PasswordRecovery({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 8 || password !== confirm) { setMessage('Digite a mesma senha de pelo menos 8 caracteres nos dois campos.'); return }
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      onDone()
    } catch (error) { setMessage(cleanError(error)) } finally { setBusy(false) }
  }
  return <main className="recovery-page"><section className="recovery-card">
    <div className="auth-icon"><LockKeyhole size={24}/></div><h1>Definir nova senha</h1><p>Crie uma senha de acesso à biblioteca de cartazes.</p>
    <form className="form-stack" onSubmit={submit}><label>Nova senha<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password"/></label>
      <label>Repita a nova senha<input type="password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"/></label>
      {message && <div className="inline-alert">{message}</div>}
      <button className="btn btn-primary btn-large" disabled={busy} type="submit">{busy ? 'Salvando...' : 'Atualizar senha'}</button></form>
  </section></main>
}

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(isConfigured ? null : DEMO_USER)
  const [authBusy, setAuthBusy] = useState(isConfigured)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!supabase) return
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email || '' } : null); setAuthBusy(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (!live) return
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email || '' } : null); setAuthBusy(false)
    })
    return () => { live = false; subscription.subscription.unsubscribe() }
  }, [])
  if (authBusy) return <div className="app-loading"><BrandLogo className="loading-logo"/><p>Carregando Seridóplast Cartazes...</p></div>
  if (recovering && user) return <PasswordRecovery onDone={() => setRecovering(false)}/>
  if (!user) return <Login onLogin={setUser}/>
  return <Workspace key={user.id} user={user} onLogout={() => { if (supabase) void supabase.auth.signOut(); else window.location.reload() }}/>
}
