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
import { exportPostersPDF, loadCustomFont, loadImage, money, parseMoney } from './render'
import { PosterCanvas } from './components/PosterCanvas'
import { ZoneEditor } from './components/ZoneEditor'
import { BrandLogo } from './components/BrandLogo'
import { importExcel } from './excel'
import {
  EXAMPLE_POSTER, EXAMPLE_TEMPLATE, INITIAL_STYLE, INITIAL_ZONE,
  type FontAsset, type Poster, type PosterInput, type PosterStyle,
  type PosterTemplate, type TemplateInput, type Zone
} from './types'

type Page = 'dashboard' | 'posters' | 'templates' | 'fonts' | 'edit-template'
type ExportLayout = 'single' | 'double'
const NOW = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const DEMO_USER = { id: 'demo', email: 'demonstração@seridoplast.com.br' }
function makePoster(templateId: string): PosterInput {
  return { template_id: templateId, product_name: '', price_from: null, price_to: 0, unit_label: '', font_id: null }
}
function stripPoster(input: PosterInput): PosterInput {
  return { template_id: input.template_id, product_name: input.product_name.trim(), price_from: input.price_from,
    price_to: input.price_to, unit_label: input.unit_label.trim(), font_id: input.font_id ?? null }
}
const numeric = (value: unknown) => value == null ? null : Number(value)
function isMissingFontColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'PGRST204' && /font_id/i.test(error.message || '')
}
function withoutFontId<T extends { font_id?: string | null }>(row: T): Omit<T, 'font_id'> {
  const { font_id: _ignored, ...rest } = row
  return rest
}
function normalizedPoster(row: Poster): Poster { return { ...row, price_from: numeric(row.price_from), price_to: Number(row.price_to), font_id: row.font_id ?? null } }
function normalizeTemplate(row: PosterTemplate): PosterTemplate {
  return { ...row, zone: { ...INITIAL_ZONE, ...row.zone }, style: { ...INITIAL_STYLE, ...row.style } }
}
function parseBulk(text: string, templateId: string, fontId: string | null): PosterInput[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const result: PosterInput[] = []
  for (const line of lines) {
    const pieces = line.includes('\t') ? line.split('\t') : line.split(';')
    const [name = '', oldValue = '', newValue = '', unit = ''] = pieces.map(s => s.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''))
    if (/^(produto|descri[cç][aã]o|nome)/i.test(name)) continue
    const value = parseMoney(newValue)
    if (!name || value === null) throw new Error(`Linha inválida: “${line.slice(0, 90)}”. Use Produto | De | Por | Unidade.`)
    const old = parseMoney(oldValue)
    if (oldValue && old === null) throw new Error(`Preço antigo inválido em “${name}”.`)
    result.push({ product_name: name, price_from: old, price_to: value, unit_label: unit, template_id: templateId, font_id: fontId })
  }
  if (!result.length) throw new Error('Cole pelo menos um produto com preço de venda.')
  if (result.length > 200) throw new Error('Importe no máximo 200 produtos por vez.')
  return result
}
function saveTextFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function downloadCsvSample() {
  saveTextFile('exemplo-cartazes.csv', '\uFEFFProduto;De;Por;Unidade\nCRISTALCOPO COPO PS 150ML 100UN;99,90;78,75;CX C/ 25PC X 100UND\nSACOLA NEWPLAST M;39,90;34,50;FARDO C/ 1.000 UN\n', 'text/csv;charset=utf-8')
}

function CurrencyInput({ value, onChange, placeholder }: {value: number | null; onChange: (value: number | null) => void; placeholder: string}) {
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
  const [posters, setPosters] = useState<Poster[]>(isConfigured ? [] : [EXAMPLE_POSTER])
  const [fonts, setFonts] = useState<FontAsset[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(isConfigured ? {} : { [EXAMPLE_TEMPLATE.id]: DEMO_IMAGE_URL })
  const [_fontUrls, setFontUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(isConfigured)
  const [working, setWorking] = useState(false)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(isConfigured ? null : EXAMPLE_POSTER.id)
  const [newPoster, setNewPoster] = useState(false)
  const [posterForm, setPosterForm] = useState<PosterInput>(makePoster(''))
  const [chosen, setChosen] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<ExportLayout>('single')
  const [repeatLast, setRepeatLast] = useState(true)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const batchFileRef = useRef<HTMLInputElement>(null)
  const [batchRows, setBatchRows] = useState<PosterInput[] | null>(null)
  const [batchFilename, setBatchFilename] = useState('')
  const [batchFontId, setBatchFontId] = useState<string>('')
  const [batchTemplateId, setBatchTemplateId] = useState('')
  const [modelEditing, setModelEditing] = useState<PosterTemplate | null>(null)
  const [exportProgress, setExportProgress] = useState('')

  const notify = (text: string, error = false) => setToast({ text, error })
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2000)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('cartazes-theme', dark ? 'dark' : 'light') }, [dark])
  const refresh = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [t, p, f] = await Promise.all([
        supabase.from('poster_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('posters').select('*').order('updated_at', { ascending: false }).limit(3000),
        supabase.from('font_assets').select('*').order('created_at', { ascending: false })
      ])
      if (t.error) throw t.error
      if (p.error) throw p.error
      if (f.error) throw f.error
      const templatesResult = ((t.data || []) as PosterTemplate[]).map(normalizeTemplate)
      const postersResult = ((p.data || []) as Poster[]).map(normalizedPoster)
      const fontsResult = (f.data || []) as FontAsset[]
      const imageEntries = await Promise.all(templatesResult.map(async template => [template.id, await signedUrl('cartaz-artes', template.image_path)] as const))
      const fontEntries = await Promise.all(fontsResult.map(async font => [font.id, await signedUrl('cartaz-fontes', font.file_path)] as const))
      await Promise.all(fontsResult.map(async font => {
        const signed = fontEntries.find(([id]) => id === font.id)?.[1]
        if (signed) try { await loadCustomFont(font, signed) } catch (err) { console.warn(`Fonte ${font.name}:`, err) }
      }))
      setTemplates(templatesResult); setPosters(postersResult); setFonts(fontsResult)
      setImageUrls(Object.fromEntries(imageEntries)); setFontUrls(Object.fromEntries(fontEntries))
      setSelectedId(prev => postersResult.some(p => p.id === prev) ? prev : (postersResult[0]?.id ?? null))
      setChosen(prev => prev.filter(id => postersResult.some(p => p.id === id)))
    } catch (err) { notify(`Falha ao carregar biblioteca: ${cleanError(err)}`, true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const activePoster = posters.find(p => p.id === selectedId) || null
  useEffect(() => {
    if (!newPoster && activePoster) setPosterForm(stripPoster(activePoster))
  }, [activePoster, newPoster])
  const activeTemplate = templates.find(t => t.id === posterForm.template_id) || templates[0]
  const posterPreview: Poster = { id: selectedId || 'unsaved', owner_id: user.id, created_at: NOW(), updated_at: NOW(), ...posterForm }
  const filtered = useMemo(() => posters.filter(p => `${p.product_name} ${p.unit_label} ${templates.find(t => t.id === p.template_id)?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [posters, search, templates])
  const myModels = templates.filter(t => t.owner_id === user.id).length

  async function run<T>(task: () => Promise<T>, success: string): Promise<T | undefined> {
    setWorking(true)
    try { const result = await task(); notify(success); return result }
    catch (err) { notify(cleanError(err), true); return undefined }
    finally { setWorking(false) }
  }
  function startPoster(templateId?: string) {
    if (!templates.length) { notify('Crie um modelo antes de cadastrar cartazes.', true); setPage('templates'); return }
    setPosterForm(makePoster(templateId || templates[0].id))
    setNewPoster(true); setSelectedId(null); setPage('posters'); setMobileNav(false)
  }
  function pickPoster(poster: Poster) {
    setNewPoster(false); setSelectedId(poster.id); setPosterForm(stripPoster(poster))
  }
  async function savePoster() {
    if (!posterForm.product_name.trim() || posterForm.product_name.trim().length < 2) { notify('Digite o nome do produto (mínimo 2 caracteres).', true); return }
    if (!posterForm.template_id || !templates.some(t => t.id === posterForm.template_id)) { notify('Selecione um modelo válido.', true); return }
    if (!Number.isFinite(posterForm.price_to) || posterForm.price_to <= 0) { notify('Informe um preço de venda válido.', true); return }
    const item = stripPoster(posterForm)
    await run(async () => {
      if (supabase) {
        let result = newPoster
          ? await supabase.from('posters').insert({ ...item, owner_id: user.id }).select().single()
          : await supabase.from('posters').update({ ...item, updated_by: user.id }).eq('id', selectedId!).select().single()
        if (isMissingFontColumn(result.error)) {
          // Compatibilidade com API cujo cache ainda não reconhece posters.font_id.
          result = newPoster
            ? await supabase.from('posters').insert({ ...withoutFontId(item), owner_id: user.id }).select().single()
            : await supabase.from('posters').update({ ...withoutFontId(item), updated_by: user.id }).eq('id', selectedId!).select().single()
        }
        if (result.error) throw result.error
        const saved = normalizedPoster(result.data as Poster)
        setSelectedId(saved.id); setNewPoster(false); await refresh()
      } else {
        const currentId = newPoster ? id() : selectedId!
        const current = posters.find(p => p.id === currentId)
        const saved: Poster = { ...item, id: currentId, owner_id: current?.owner_id || user.id,
          created_at: current?.created_at || NOW(), updated_at: NOW() }
        setPosters(prev => [saved, ...prev.filter(p => p.id !== saved.id)])
        setSelectedId(saved.id); setNewPoster(false)
      }
    }, 'Cartaz salvo na biblioteca compartilhada.')
  }
  async function deletePoster(poster: Poster) {
    if (poster.owner_id !== user.id) { notify('Apenas o criador pode excluir este cartaz.', true); return }
    if (!window.confirm(`Excluir “${poster.product_name}”? Esta ação não pode ser desfeita.`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('posters').delete().eq('id', poster.id)
        if (error) throw error
        await refresh()
      } else {
        setPosters(prev => prev.filter(p => p.id !== poster.id))
        setSelectedId(prev => prev === poster.id ? null : prev)
      }
    }, 'Cartaz excluído.')
  }
  async function saveBulk() {
    const rows = (batchRows || parseBulk(batchText, batchTemplateId, batchFontId || null))
      .map(row => ({ ...row, template_id: batchTemplateId, font_id: batchFontId || null }))
    if (!templates.some(t => t.id === batchTemplateId)) throw new Error('Selecione um modelo para o lote.')
    await run(async () => {
      if (supabase) {
        const payload = rows.map(row => ({ ...row, owner_id: user.id }))
        let { error } = await supabase.from('posters').insert(payload)
        if (isMissingFontColumn(error)) {
          const retry = await supabase.from('posters').insert(payload.map(withoutFontId))
          error = retry.error
        }
        if (error) throw error
        await refresh()
      } else {
        setPosters(prev => [...rows.map(row => ({ ...row, id: id(), owner_id: user.id, created_at: NOW(), updated_at: NOW() })), ...prev])
      }
      setBatchOpen(false); setBatchText(''); setBatchRows(null); setBatchFilename('')
    }, `${rows.length} cartazes adicionados à biblioteca.`)
  }
  function openBatch() {
    if (!templates.length) { notify('Crie um modelo antes de importar produtos.', true); setPage('templates'); return }
    setBatchTemplateId(activeTemplate?.id || templates[0].id); setBatchOpen(true); setBatchFontId(''); setBatchRows(null); setBatchFilename(''); setBatchText('')
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
        const template: PosterTemplate = { ...input, id: existing?.id || id(), owner_id: existing?.owner_id || user.id,
          image_path: file ? URL.createObjectURL(file) : existing?.image_path || 'bundled', created_at: existing?.created_at || NOW() }
        setTemplates(prev => [template, ...prev.filter(t => t.id !== template.id)])
        setImageUrls(prev => ({ ...prev, [template.id]: file ? template.image_path : existing ? imageUrls[existing.id] : DEMO_IMAGE_URL }))
      }
      setModelEditing(null); setPage('templates')
    }, existing ? 'Modelo compartilhado atualizado.' : 'Modelo disponível para toda a equipe.')
  }
  async function deleteTemplate(template: PosterTemplate) {
    if (template.owner_id !== user.id) { notify('Só o criador pode excluir este modelo.', true); return }
    if (posters.some(p => p.template_id === template.id)) { notify('Este modelo está em uso. Atualize os cartazes antes de excluir.', true); return }
    if (!window.confirm(`Excluir modelo “${template.name}”?`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('poster_templates').delete().eq('id', template.id)
        if (error) throw error
        await refresh()
      } else {
        setTemplates(prev => prev.filter(t => t.id !== template.id))
      }
    }, 'Modelo excluído.')
  }
  async function saveFont(file: File, name: string) {
    if (!/\.(ttf|otf|woff|woff2)$/i.test(file.name) || file.size > 5 * 1024 * 1024) { notify('Escolha uma fonte TTF, OTF, WOFF ou WOFF2 com até 5 MB.', true); return }
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
        const url = URL.createObjectURL(file)
        await loadCustomFont(font, url)
        setFonts(prev => [font, ...prev]); setFontUrls(prev => ({ ...prev, [font.id]: url }))
      }
    }, 'Fonte instalada e compartilhada com a equipe.')
  }
  async function deleteFont(font: FontAsset) {
    if (font.owner_id !== user.id) { notify('Só quem enviou a fonte pode excluí-la.', true); return }
    if (templates.some(t => t.style.fontId === font.id) || posters.some(p => p.font_id === font.id)) { notify('Esta fonte está sendo utilizada por um modelo ou cartaz. Troque-a antes de excluir.', true); return }
    if (!window.confirm(`Excluir a fonte “${font.name}”?`)) return
    await run(async () => {
      if (supabase) {
        const { error } = await supabase.from('font_assets').delete().eq('id', font.id)
        if (error) throw error
        await refresh()
      } else setFonts(prev => prev.filter(f => f.id !== font.id))
    }, 'Fonte removida da biblioteca.')
  }
  async function doExport(items: Poster[]) {
    if (!items.length) { notify('Selecione ao menos um cartaz para exportar.', true); return }
    setWorking(true); setExportProgress('Preparando imagens para impressão...')
    try {
      await exportPostersPDF({ posters: items, templates, urls: imageUrls, fonts, layout, repeatLast,
        onProgress: (current, total) => setExportProgress(`Gerando PDF · ${current} de ${total} cartazes`) })
      notify('PDF gerado. Confira a escala de impressão em 100%.')
    } catch (err) { notify(cleanError(err), true) }
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
      notify('Modelo em branco exportado em A4.')
    } catch (err) { notify(cleanError(err), true) } finally { setWorking(false) }
  }
  function editModel(template: PosterTemplate | null) { setModelEditing(template); setPage('edit-template') }
  const menu = [
    { id: 'dashboard' as Page, label: 'Visão geral', icon: LayoutDashboard },
    { id: 'posters' as Page, label: 'Cartazes', icon: FileSpreadsheet, count: posters.length },
    { id: 'templates' as Page, label: 'Modelos', icon: LibraryBig, count: templates.length },
    { id: 'fonts' as Page, label: 'Fontes', icon: Type, count: fonts.length }
  ]
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="sidebar-head"><BrandLogo className="sidebar-logo" /><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={19}/></button></div>
      <div className="side-caption">ESPAÇO DE TRABALHO</div>
      <nav className="nav-menu">{menu.map(item => <button key={item.id} className={`nav-link ${page === item.id || (page === 'edit-template' && item.id === 'templates') ? 'active' : ''}`}
        onClick={() => { setPage(item.id); setMobileNav(false) }}><item.icon size={20}/><span>{item.label}</span>{item.count !== undefined && <em>{item.count}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="team-info"><div className="team-icon"><Cloud size={18}/></div><div><strong>{isConfigured ? 'Sincronizado' : 'Modo demonstração'}</strong><small>{isConfigured ? 'Biblioteca no Supabase' : 'Dados temporários nesta aba'}</small></div><span className={`online-dot ${!isConfigured ? 'warn' : ''}`}/></div>
        <button className="sidebar-help" onClick={() => setPage('dashboard')}><CircleHelp size={17}/> Como utilizar <ChevronRight size={15}/></button></div>
    </aside>
    {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)}/>}
    <div className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={22}/></button><span className="topbar-location">Seridóplast <ChevronRight size={14}/> <strong>{page === 'dashboard' ? 'Visão geral' : page === 'posters' ? 'Cartazes' : page === 'fonts' ? 'Fontes' : 'Modelos'}</strong></span></div>
        <div className="topbar-actions"><button className="icon-button" onClick={() => setDark(v => !v)} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} title={dark ? 'Modo claro' : 'Modo escuro'}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-button" onClick={() => void refresh()} title="Atualizar biblioteca" aria-label="Atualizar biblioteca" disabled={loading}><RefreshCw size={19} className={loading ? 'spinning' : ''}/></button>
          <div className="avatar" title={user.email}>{user.email.charAt(0).toUpperCase()}</div><div className="account-email" title={user.email}>{user.email}</div>
          <button className="icon-button" onClick={onLogout} title="Sair" aria-label="Sair"><LogOut size={18}/></button>
        </div></header>
      {loading && <div className="loading-line"/>}
      {!isConfigured && <div className="demo-banner"><Sparkles size={17}/> <strong>Modo demonstração:</strong> experimente a ferramenta, mas os dados não são salvos na nuvem. Configure o Supabase para trabalhar em equipe.</div>}
      <main className="content">
      {page === 'dashboard' && <>
        <div className="welcome-banner"><div><div className="eyebrow">ESTÚDIO DE CAMPANHAS <span>•</span> SERIDÓPLAST</div><h1>Suas ofertas, com<br/><em>mais impacto.</em></h1><p>Do preço à impressão: cartazes profissionais para todas as suas lojas.</p><button className="btn btn-white" onClick={() => startPoster()}><Plus size={17}/> Criar cartaz <ArrowRight size={17}/></button></div>
          <div className="hero-poster"><PosterCanvas template={templates[0] || EXAMPLE_TEMPLATE} poster={{ ...EXAMPLE_POSTER, template_id: templates[0]?.id || EXAMPLE_TEMPLATE.id }} imageURL={templates[0] ? imageUrls[templates[0].id] || DEMO_IMAGE_URL : DEMO_IMAGE_URL}/></div>
          <div className="welcome-circle circle-a"/><div className="welcome-circle circle-b"/></div>
        <div className="stat-grid"><div className="stat-card"><div className="stat-icon"><FileSpreadsheet size={20}/></div><span>Cartazes na biblioteca</span><strong>{posters.length}</strong><small>Compartilhados com a equipe</small></div>
          <div className="stat-card"><div className="stat-icon lavender"><LibraryBig size={20}/></div><span>Modelos disponíveis</span><strong>{templates.length}</strong><small>{myModels} criados por você</small></div>
          <div className="stat-card"><div className="stat-icon yellow"><Type size={20}/></div><span>Fontes instaladas</span><strong>{fonts.length}</strong><small>Uso em todos os modelos</small></div></div>
        <div className="section-title"><div><h2>Comece por aqui</h2><p>Acesse rapidamente as ferramentas principais.</p></div></div>
        <div className="quick-grid"><button className="quick-card" onClick={() => startPoster()}><span className="quick-icon"><FilePlus2 size={22}/></span><strong>Novo cartaz</strong><p>Insira produto, preços e unidade de venda.</p><span>Começar <ArrowRight size={16}/></span></button>
          <button className="quick-card" onClick={openBatch}><span className="quick-icon"><CopyPlus size={22}/></span><strong>Cadastro em lote</strong><p>Abra um arquivo Excel .xlsx ou cole várias linhas.</p><span>Importar <ArrowRight size={16}/></span></button>
          <button className="quick-card" onClick={() => editModel(null)}><span className="quick-icon"><ImagePlus size={22}/></span><strong>Criar um modelo</strong><p>Envie sua arte e marque a área dos preços.</p><span>Criar modelo <ArrowRight size={16}/></span></button></div>
        <div className="how-to"><div className="how-icon"><WandSparkles size={22}/></div><div><strong>Fluxo recomendado</strong><p>1. Publique um modelo → 2. Cadastre produtos individualmente ou em lote → 3. Selecione os cartazes → 4. Exporte o PDF em A4 ou em duas unidades por folha.</p></div></div>
      </>}
      {page === 'posters' && <>
        <div className="page-heading"><div><div className="eyebrow muted">BIBLIOTECA COMPARTILHADA</div><h1>Cartazes de preço</h1><p>Crie, edite e imprima ofertas sem perder a padronização.</p></div><div className="page-buttons"><button className="btn btn-subtle" onClick={openBatch}><CopyPlus size={17}/> Importar em lote</button><button className="btn btn-primary" onClick={() => startPoster()}><Plus size={18}/> Novo cartaz</button></div></div>
        <div className="print-toolbar"><div className="print-left"><div className="checkbox-text"><input type="checkbox" aria-label="Selecionar todos os cartazes filtrados" checked={filtered.length > 0 && filtered.every(p => chosen.includes(p.id))} onChange={e => setChosen(e.target.checked ? Array.from(new Set([...chosen, ...filtered.map(p => p.id)])) : chosen.filter(id => !filtered.some(p => p.id === id)))}/><span>{chosen.length ? `${chosen.length} selecionado(s)` : 'Selecionar para imprimir'}</span></div></div>
          <div className="print-right"><label className="inline-choice">Distribuição <select value={layout} onChange={e => setLayout(e.target.value as ExportLayout)}><option value="single">1 por A4 · Retrato</option><option value="double">2 por A4 · Paisagem</option></select></label>
            {layout === 'double' && <label className="repeat-toggle"><input type="checkbox" checked={repeatLast} onChange={e => setRepeatLast(e.target.checked)}/> Repetir último</label>}
            <button className="btn btn-primary" disabled={working || !chosen.length} onClick={() => void doExport(posters.filter(p => chosen.includes(p.id)))}><FileDown size={17}/> {working && exportProgress ? exportProgress : 'Exportar PDF'}</button></div></div>
        <div className="work-grid"><section className="poster-list panel"><div className="panel-title"><h3>Produtos <span className="count-chip">{filtered.length}</span></h3></div><div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por produto ou modelo..."/></div>
          <div className="list-scroll">{filtered.length ? filtered.map(p => <div className={`poster-row ${!newPoster && selectedId === p.id ? 'selected' : ''}`} key={p.id}>
            <input type="checkbox" aria-label={`Selecionar ${p.product_name}`} checked={chosen.includes(p.id)} onChange={e => setChosen(prev => e.target.checked ? [...prev, p.id] : prev.filter(v => v !== p.id))}/>
            <button className="poster-row-body" onClick={() => pickPoster(p)}><strong>{p.product_name}</strong><span>{p.unit_label || 'Unidade não especificada'}</span><div><b>R$ {money(p.price_to)}</b> {p.price_from !== null && <del>R$ {money(p.price_from)}</del>}</div></button>
            <ChevronRight size={17} className="poster-row-arrow"/></div>) : <div className="empty-list"><FolderOpen size={28}/><strong>Nenhum cartaz encontrado</strong><p>Crie um novo cartaz ou altere sua busca.</p></div>}</div>
          <div className="panel-bottom"><button className="link-action" onClick={openBatch}><CopyPlus size={17}/> Adicionar vários produtos</button></div></section>
          <section className="preview-panel panel"><div className="panel-title"><div><h3>Pré-visualização</h3><span>Visualize antes de imprimir</span></div><span className="preview-tag">A4 · 210×297 mm</span></div>
            {activeTemplate && imageUrls[activeTemplate.id] ? <div className="preview-wrap"><PosterCanvas template={activeTemplate} poster={posterPreview} imageURL={imageUrls[activeTemplate.id]} fontFamily={fonts.find(f => f.id === (posterForm.font_id || activeTemplate.style.fontId))?.family}/></div> : <div className="empty-preview"><ImagePlus size={34}/><strong>Sem modelo disponível</strong><p>Crie ou publique o modelo de exemplo para começar.</p><button className="btn btn-outline" onClick={() => editModel(null)}>Adicionar modelo</button></div>}
            <div className="preview-footer"><span><CheckCircle2 size={16}/> Proporção de impressão A4</span><button className="btn btn-outline btn-small" disabled={working || !activeTemplate} onClick={() => void doExport([posterPreview])}><Download size={16}/> Baixar este</button></div></section>
          <section className="form-panel panel"><div className="panel-title"><div><h3>{newPoster ? 'Novo cartaz' : 'Editar cartaz'}</h3><span>Informações da oferta</span></div><Settings2 size={19} className="muted-icon"/></div>
            {newPoster || activePoster ? <div className="editor-form">
              <label>Modelo visual<select value={posterForm.template_id} onChange={e => setPosterForm(p => ({ ...p, template_id: e.target.value }))}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label>Fonte deste cartaz<select value={posterForm.font_id || ''} onChange={e => setPosterForm(p => ({ ...p, font_id: e.target.value || null }))}>
                <option value="">Usar a fonte definida no modelo</option>
                {fonts.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select><small>Altera apenas este cartaz, sem modificar o modelo ou os outros cartazes.</small></label>
              <label>Nome do produto <span className="required">*</span><textarea rows={3} maxLength={350} placeholder="Ex.: CRISTALCOPO COPO PS 150ML 100UN" value={posterForm.product_name} onChange={e => setPosterForm(p => ({ ...p, product_name: e.target.value }))}/><small>Centralizado automaticamente no cartaz</small></label>
              <div className="divider-label"><span>Valores da oferta</span></div><div className="price-fields"><label>De (opcional)<span className="input-prefix">R$</span><CurrencyInput key={`from-${selectedId}-${newPoster}`} value={posterForm.price_from} onChange={value => setPosterForm(p => ({ ...p, price_from: value }))} placeholder="99,90"/></label>
                <label>Por <span className="required">*</span><span className="input-prefix">R$</span><CurrencyInput key={`to-${selectedId}-${newPoster}`} value={posterForm.price_to} onChange={value => setPosterForm(p => ({ ...p, price_to: value ?? 0 }))} placeholder="78,75"/></label></div>
              <label>Unidade / apresentação<input maxLength={180} placeholder="Ex.: CX C/ 25PC X 100UND" value={posterForm.unit_label} onChange={e => setPosterForm(p => ({ ...p, unit_label: e.target.value }))}/><small>Caixa, pacote, fardo, unidade etc.</small></label>
              <button className="btn btn-primary full" disabled={working || !templates.length} onClick={() => void savePoster()}><Save size={18}/> {newPoster ? 'Salvar novo cartaz' : 'Salvar alterações'}</button>
              <button className="btn btn-subtle full" onClick={() => startPoster(posterForm.template_id)}><Plus size={17}/> Novo a partir deste modelo</button>
              {!newPoster && activePoster?.owner_id === user.id && <button className="danger-link" onClick={() => void deletePoster(activePoster)}><Trash2 size={16}/> Excluir este cartaz</button>}
            </div> : <div className="empty-editor"><FilePlus2 size={28}/><p>Selecione um cartaz para editar ou crie um novo.</p><button className="btn btn-primary" onClick={() => startPoster()}><Plus size={17}/> Criar</button></div>}
          </section></div>
      </>}
      {page === 'templates' && <>
        <div className="page-heading"><div><div className="eyebrow muted">IDENTIDADE VISUAL</div><h1>Biblioteca de modelos</h1><p>Artes compartilhadas: todos podem usar e editar.</p></div><button className="btn btn-primary" onClick={() => editModel(null)}><Plus size={18}/> Criar modelo</button></div>
        <div className="tip-strip"><ImagePlus size={19}/><span>Use uma imagem vertical proporcional ao A4, preferencialmente <strong>1447 × 2048 px</strong> ou maior. Marque a área branca onde o conteúdo deve aparecer.</span></div>
        {templates.length ? <div className="template-grid">{templates.map(t => <article className="template-card" key={t.id}><div className="template-image"><img src={imageUrls[t.id]} alt={`Modelo ${t.name}`}/><span className="shared-label"><Cloud size={13}/> Compartilhado</span></div><div className="template-info"><strong>{t.name}</strong><small>{t.image_width} × {t.image_height} px • {posters.filter(p => p.template_id === t.id).length} cartazes</small><div className="template-actions"><button className="btn btn-outline btn-small" onClick={() => editModel(t)}><Settings2 size={15}/> Editar</button><button className="btn btn-subtle btn-small" onClick={() => startPoster(t.id)}><Plus size={15}/> Usar</button><button className="icon-button" onClick={() => void downloadBlankTemplate(t)} title="Baixar modelo em branco em PDF"><Download size={17}/></button>{t.owner_id === user.id && <button className="icon-button danger" title="Excluir modelo" onClick={() => void deleteTemplate(t)}><Trash2 size={16}/></button>}</div></div></article>)}</div> : <div className="empty-page"><ImagePlus size={34}/><h3>Publique seu primeiro modelo</h3><p>O arquivo de exemplo da Seridóplast já está incluído no projeto. Abra o editor e clique em Salvar modelo para compartilhá-lo.</p><button className="btn btn-primary" onClick={() => editModel(null)}><Plus size={17}/> Publicar modelo de exemplo</button></div>}
      </>}
      {page === 'fonts' && <FontsPage fonts={fonts} working={working} userId={user.id} onUpload={saveFont} onDelete={deleteFont} />}
      {page === 'edit-template' && <TemplateEditor template={modelEditing} imageUrl={modelEditing ? imageUrls[modelEditing.id] : DEMO_IMAGE_URL} fonts={fonts} working={working} onClose={() => setPage('templates')} onSave={saveTemplate} onNotify={notify}/>}
      </main>
      <footer className="app-footer"><span>Seridóplast <b>•</b> Cartazes de preço</span><span>Acreditamos na força do trabalho!</span></footer>
    </div>
    {toast && <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>{toast.error ? <CircleHelp size={19}/> : <CheckCircle2 size={19}/>}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={17}/></button></div>}
    {batchOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setBatchOpen(false) }}><section className="modal batch-modal" role="dialog" aria-modal="true" aria-label="Cadastro em lote"><header><div><div className="eyebrow muted">IMPORTAÇÃO RÁPIDA</div><h2>Vários cartazes de uma vez</h2><p>Envie um Excel .xlsx ou cole as quatro colunas abaixo.</p></div><button className="icon-button" onClick={() => setBatchOpen(false)} aria-label="Fechar"><X size={20}/></button></header>
        <div className="modal-content"><label>Modelo para todos os itens<select value={batchTemplateId} onChange={e => setBatchTemplateId(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="batch-font-select">Fonte para o lote<select value={batchFontId} onChange={e => setBatchFontId(e.target.value)}>
          <option value="">Usar fonte padrão do modelo</option>{fonts.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select></label>
        <div className="batch-columns"><span>PRODUTO</span><span>PREÇO DE</span><span>PREÇO POR</span><span>UNIDADE</span></div>
        <textarea rows={9} spellCheck={false} className="batch-input" value={batchText} onChange={e => { setBatchText(e.target.value); setBatchRows(null); setBatchFilename('') }} placeholder={'CRISTALCOPO COPO PS 150ML 100UN\t99,90\t78,75\tCX C/ 25PC X 100UND\nSACOLA NEWPLAST M\t39,90\t34,50\tFD C/ 1000 UN'}/>
        <p className="batch-hint"><FileSpreadsheet size={15}/> Excel (.xlsx) com colunas A: Produto, B: De, C: Por, D: Unidade; usa a primeira aba. Também aceita colagem do Excel e CSV/TSV. Até 200 itens.</p>
        {batchFilename && <p className="batch-success"><CheckCircle2 size={16}/> {batchFilename} carregado {batchRows ? `· ${batchRows.length} cartaz(es) validado(s)` : '· revise as linhas antes de salvar'}.</p>}
        <div className="batch-file-actions"><a className="link-action" href={`${import.meta.env.BASE_URL}exemplo-cartazes.xlsx`} download="exemplo-cartazes.xlsx"><FileSpreadsheet size={16}/> Baixar Excel de exemplo</a>
        <button className="link-action" onClick={() => batchFileRef.current?.click()}><UploadCloud size={16}/> Importar Excel (.xlsx), CSV ou TSV</button>
        <button className="link-action" onClick={downloadCsvSample}><Download size={16}/> Baixar CSV</button></div>
        <input ref={batchFileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" className="sr-only" onChange={event => {
          const selected = event.target.files?.[0]
          event.target.value = ''
          if (!selected) return
          if (/\.xlsx$/i.test(selected.name)) {
            void importExcel(selected, batchTemplateId, batchFontId || null).then(rows => {
              setBatchRows(rows); setBatchFilename(selected.name)
              setBatchText(rows.map(row => [row.product_name, row.price_from ?? '', row.price_to, row.unit_label].join('\t')).join('\n'))
              notify(`${rows.length} itens do Excel carregados. Revise e clique em Salvar.`)
            }).catch(error => notify(cleanError(error), true))
          } else if (/\.(csv|tsv|txt)$/i.test(selected.name)) {
            void selected.text().then(text => { setBatchText(text.replace(/^\uFEFF/, '')); setBatchRows(null); setBatchFilename(selected.name) }).catch(error => notify(cleanError(error), true))
          } else notify('Arquivo não suportado. Escolha Excel .xlsx, CSV ou TSV.', true)
        }}/></div>
        <footer><button className="btn btn-subtle" onClick={() => setBatchOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={working || !batchText.trim()} onClick={() => { try { void saveBulk().catch(err => notify(cleanError(err), true)) } catch (err) { notify(cleanError(err), true) } }}><UploadCloud size={18}/> Salvar {batchRows?.length || batchText.split(/\r?\n/).filter(Boolean).length || ''} cartazes</button></footer></section></div>}
  </div>
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
  const [tab, setTab] = useState<'area' | 'result'>('area')
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
    <div className="page-heading"><div><button className="text-back" onClick={onClose}><ArrowLeft size={17}/> Voltar para modelos</button><h1>{template ? 'Editar modelo' : 'Criar modelo'}</h1><p>Arraste a área de conteúdo até o local exato da arte.</p></div><button className="btn btn-primary" disabled={working || !name.trim()} onClick={() => void onSave({ name, zone, style, image_width: dimensions.width, image_height: dimensions.height }, file, template)}><Save size={18}/> Salvar modelo</button></div>
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
      <div className="color-grid"><label>Nome<input type="color" value={style.titleColor} onChange={e => setStyle(s => ({ ...s, titleColor: e.target.value }))}/></label><label>Preço<input type="color" value={style.priceColor} onChange={e => setStyle(s => ({ ...s, priceColor: e.target.value }))}/></label><label>De<input type="color" value={style.oldColor} onChange={e => setStyle(s => ({ ...s, oldColor: e.target.value }))}/></label><label>Unidade<input type="color" value={style.unitColor} onChange={e => setStyle(s => ({ ...s, unitColor: e.target.value }))}/></label></div>
      <label className="switch-row"><input type="checkbox" checked={style.showCurrency} onChange={e => setStyle(s => ({ ...s, showCurrency: e.target.checked }))}/> Mostrar “R$” junto ao preço grande</label>
      <button className="btn btn-primary full" disabled={working || !name.trim()} onClick={() => void onSave({ name, zone, style, image_width: dimensions.width, image_height: dimensions.height }, file, template)}><Save size={18}/> Salvar alterações</button>
    </div></section>
    <section className="panel model-edit-stage"><div className="panel-title"><div><h3>{tab === 'area' ? 'Definir área de conteúdo' : 'Resultado com preços'}</h3><span>{tab === 'area' ? 'Arraste o retângulo e puxe o canto inferior direito' : 'Prévia com produto e valores de exemplo'}</span></div><div className="mini-tabs"><button className={tab === 'area' ? 'on' : ''} onClick={() => setTab('area')}>Área</button><button className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>Prévia</button></div></div>
      <div className="model-stage-content">{tab === 'area' ? <ZoneEditor imageURL={currentUrl} zone={zone} onChange={setZone}/> : <PosterCanvas template={data} poster={sample} imageURL={currentUrl} fontFamily={font?.family}/>}</div>
      <div className="stage-note"><MoveUpRight size={17}/><span>Área: X {Math.round(zone.x * 100)}% • Y {Math.round(zone.y * 100)}% • Largura {Math.round(zone.w * 100)}% • Altura {Math.round(zone.h * 100)}%</span><button className="text-button" onClick={() => setZone({ ...INITIAL_ZONE })}>Restaurar área</button></div>
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
