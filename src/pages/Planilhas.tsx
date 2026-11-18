import { useState } from 'react'
import { Link } from 'react-router-dom'
import { METODOS, labelVariant, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { periodo } from '../lib/periodo'
import { useToast } from '../lib/toast'
import { usePlano } from '../lib/planos'
import { Alert, Button, Card, cellInput } from '../components/ui'

// ---------- CSV (abre direto no Excel e no Google Planilhas) ----------
const num = (n: unknown) => (n === null || n === undefined || n === '' ? '' : String(Number(n).toFixed(2)).replace('.', ','))
function csv(linhas: (string | number | null | undefined)[][]) {
  const cel = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n')
}
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nome; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const dataHora = (d: string) => new Date(d).toLocaleString('pt-BR')

export default function Planilhas() {
  const { pode } = usePlano()
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planilhas</h1>
        <p className="text-sm text-muted">Baixe seus dados para guardar ou abrir no Excel, e traga seus produtos de uma planilha</p>
      </div>
      <Exportar />
      {pode('importar') ? <Importar /> : (
        <Link to="/planos" className="block rounded-xl border border-dashed border-brand-300 px-3 py-2 text-sm text-brand-800 hover:bg-brand-50">🔒 <strong>Importar produtos por planilha</strong> · disponível no NEXO Pro</Link>
      )}
    </div>
  )
}

function Exportar() {
  const { current } = useStore()
  const toast = useToast()
  const m = periodo('mes')
  const [de, setDe] = useState(m.de)
  const [ate, setAte] = useState(m.ate)
  const [baixando, setBaixando] = useState('')
  const loja = (current?.name ?? 'loja').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

  async function rodar(qual: string, fn: () => Promise<void>) {
    setBaixando(qual)
    try { await fn() } catch (e) { toast((e as Error).message || 'Não foi possível baixar.', 'erro') }
    setBaixando('')
  }

  const produtos = () => rodar('produtos', async () => {
    const { data, error } = await supabase.from('product_variants')
      .select('sku, attributes, sale_price, unit_cost, stock_quantity, min_stock, active, products!inner(name, active, categories(name))')
      .eq('store_id', current!.id)
    if (error) throw new Error(traduzErro(error))
    type R = { sku: string | null; attributes: Attrs; sale_price: number; unit_cost: number | null; stock_quantity: number; min_stock: number; active: boolean; products: { name: string; active: boolean; categories: { name: string } | null } }
    const linhas = ((data ?? []) as unknown as R[]).sort((a, b) => a.products.name.localeCompare(b.products.name))
    baixar(`produtos-${loja}.csv`, csv([
      ['Nome', 'Variação', 'Categoria', 'Código', 'Preço', 'Custo', 'Estoque', 'Estoque mínimo', 'Ativo'],
      ...linhas.map((r) => [r.products.name, labelVariant(r.attributes ?? {}), r.products.categories?.name ?? '', r.sku ?? '', num(r.sale_price), num(r.unit_cost),
        String(r.stock_quantity).replace('.', ','), String(r.min_stock).replace('.', ','), r.active && r.products.active ? 'sim' : 'não']),
    ]))
  })

  const vendas = () => rodar('vendas', async () => {
    const ini = new Date(`${de}T00:00:00-03:00`).toISOString()
    const fim = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86400000).toISOString()
    const [vs, cs] = await Promise.all([
      supabase.from('sales').select('number, sold_at, status, subtotal, discount_total, total, customer_id, sale_items(product_name, attributes, quantity, unit_price, line_total), sale_payments(method, amount)')
        .eq('store_id', current!.id).gte('sold_at', ini).lt('sold_at', fim).order('sold_at'),
      supabase.from('customers').select('id, name').eq('store_id', current!.id),
    ])
    if (vs.error) throw new Error(traduzErro(vs.error))
    const nomes = new Map(((cs.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))
    type V = { number: number; sold_at: string; status: string; subtotal: number; discount_total: number; total: number; customer_id: string | null
      sale_items: { product_name: string; attributes: Attrs; quantity: number; unit_price: number; line_total: number }[]; sale_payments: { method: string; amount: number }[] }
    const lista = (vs.data ?? []) as unknown as V[]
    baixar(`vendas-${loja}-${de}-a-${ate}.csv`, csv([
      ['Venda', 'Data', 'Situação', 'Cliente', 'Itens', 'Subtotal', 'Desconto', 'Total', 'Pagamento'],
      ...lista.map((v) => [v.number, dataHora(v.sold_at), v.status === 'canceled' ? 'Cancelada' : 'Concluída', v.customer_id ? nomes.get(v.customer_id) ?? '' : '',
        v.sale_items.map((i) => `${String(i.quantity).replace('.', ',')}x ${i.product_name}${Object.keys(i.attributes ?? {}).length ? ` (${labelVariant(i.attributes)})` : ''}`).join(' | '),
        num(v.subtotal), num(v.discount_total), num(v.total), v.sale_payments.map((p) => `${METODOS[p.method] ?? p.method} ${num(p.amount)}`).join(' | ')]),
    ]))
  })

  const clientes = () => rodar('clientes', async () => {
    const [cs, bs] = await Promise.all([
      supabase.from('customers').select('id, name, phone, birthday, notes, active, created_at').eq('store_id', current!.id).order('name'),
      supabase.rpc('get_customer_balances', { _store_id: current!.id }),
    ])
    if (cs.error) throw new Error(traduzErro(cs.error))
    const saldo = new Map(((bs.data ?? []) as { customer_id: string; balance: number }[]).map((b) => [b.customer_id, b.balance]))
    type C = { id: string; name: string; phone: string | null; birthday: string | null; notes: string | null; active: boolean }
    baixar(`clientes-${loja}.csv`, csv([
      ['Nome', 'WhatsApp', 'Aniversário', 'Saldo fiado', 'Observações', 'Ativo'],
      ...((cs.data ?? []) as C[]).map((c) => [c.name, c.phone ?? '', c.birthday ? `${c.birthday.slice(8, 10)}/${c.birthday.slice(5, 7)}` : '', num(saldo.get(c.id) ?? 0), c.notes ?? '', c.active ? 'sim' : 'não']),
    ]))
  })

  const despesas = () => rodar('despesas', async () => {
    const { data, error } = await supabase.from('expenses').select('spent_on, category, description, amount').eq('store_id', current!.id).gte('spent_on', de).lte('spent_on', ate).order('spent_on')
    if (error) throw new Error(traduzErro(error))
    baixar(`despesas-${loja}-${de}-a-${ate}.csv`, csv([
      ['Data', 'Categoria', 'Descrição', 'Valor'],
      ...((data ?? []) as { spent_on: string; category: string | null; description: string | null; amount: number }[]).map((e) => [e.spent_on.split('-').reverse().join('/'), e.category ?? '', e.description ?? '', num(e.amount)]),
    ]))
  })

  const Botao = ({ id, label, onClick }: { id: string; label: string; onClick: () => void }) => (
    <Button variant="ghost" className="justify-start" loading={baixando === id} disabled={!!baixando} onClick={onClick}>⬇ {label}</Button>
  )

  return (
    <Card>
      <h2 className="font-semibold">Baixar planilhas (backup)</h2>
      <p className="mt-1 text-xs text-muted">Arquivos .csv: abrem no Excel, no Google Planilhas e no celular. Bom guardar uma cópia todo mês.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Botao id="produtos" label="Produtos e estoque" onClick={produtos} />
        <Botao id="clientes" label="Clientes e fiado" onClick={clientes} />
      </div>
      <div className="mt-4 rounded-xl bg-brand-50/60 p-3">
        <div className="text-sm font-medium">Período para vendas e despesas</div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={cellInput} />
          <span className="text-muted">até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={cellInput} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Botao id="vendas" label="Vendas do período" onClick={vendas} />
          <Botao id="despesas" label="Despesas do período" onClick={despesas} />
        </div>
      </div>
    </Card>
  )
}

// ---------- Importar ----------
type Linha = { name: string; price: number; stock: number; cost: number; sku: string; category: string }
const CAMPOS: Record<string, keyof Linha> = {
  nome: 'name', produto: 'name', descricao: 'name', preco: 'price', valor: 'price', 'preco de venda': 'price',
  quantidade: 'stock', estoque: 'stock', qtd: 'stock', custo: 'cost', 'preco de custo': 'cost',
  codigo: 'sku', 'codigo de barras': 'sku', sku: 'sku', categoria: 'category',
}
const limpa = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
function numero(t: string) {
  const s = t.replace(/r\$\s?/i, '').trim()
  if (!s) return 0
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const v = Number(n)
  return Number.isFinite(v) ? v : NaN
}
function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/)[0] ?? ''
  const sep = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0]
  const linhas: string[][] = []
  let cel = '', linha: string[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { cel += '"'; i++ } else if (c === '"') aspas = false; else cel += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(cel); cel = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(cel); linhas.push(linha); linha = []; cel = '' }
    else cel += c
  }
  if (cel || linha.length) { linha.push(cel); linhas.push(linha) }
  return linhas.filter((l) => l.some((x) => x.trim()))
}

function Importar() {
  const { current } = useStore()
  const toast = useToast()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ created: number; skipped: { line: number; name?: string; why: string }[] } | null>(null)

  async function arquivo(f: File | undefined) {
    setErro(''); setResultado(null); setLinhas(null)
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return setErro('Use um arquivo .csv. No Excel: Arquivo > Salvar como > CSV. No Google Planilhas: Arquivo > Fazer download > CSV.')
    const tab = lerCsv(await f.text())
    if (tab.length < 2) return setErro('A planilha precisa ter o cabeçalho e pelo menos um produto.')
    const cab = tab[0].map((h) => CAMPOS[limpa(h)])
    if (!cab.includes('name')) return setErro('Não achei a coluna “Nome”. Use o modelo abaixo.')
    const ls: Linha[] = []
    for (const l of tab.slice(1)) {
      const r: Linha = { name: '', price: 0, stock: 0, cost: 0, sku: '', category: '' }
      cab.forEach((campo, i) => {
        if (!campo) return
        const v = (l[i] ?? '').trim()
        if (campo === 'price' || campo === 'stock' || campo === 'cost') r[campo] = numero(v)
        else r[campo] = v
      })
      ls.push(r)
    }
    const ruins = ls.filter((r) => [r.price, r.stock, r.cost].some((n) => Number.isNaN(n) || n < 0)).length
    if (ruins) return setErro(`${ruins} linha(s) com número inválido em preço, quantidade ou custo. Confira e tente de novo.`)
    if (ls.length > 1000) return setErro('Máximo de 1000 produtos por vez.')
    setLinhas(ls)
  }

  async function importar() {
    if (!linhas) return
    setEnviando(true)
    const { data, error } = await supabase.rpc('import_products', { _store_id: current!.id, _rows: linhas })
    setEnviando(false)
    if (error) return setErro(traduzErro(error))
    setResultado(data as typeof resultado)
    setLinhas(null)
    toast(`${(data as { created: number }).created} produto(s) importado(s)`)
  }

  const modelo = () => baixar('modelo-produtos-nexo.csv', csv([
    ['Nome', 'Preço', 'Quantidade', 'Custo', 'Categoria', 'Código'],
    ['Exemplo: Brinco argola dourada', '39,90', '10', '12,00', 'Brincos', ''],
  ]))

  return (
    <Card>
      <h2 className="font-semibold">Importar produtos de uma planilha</h2>
      <p className="mt-1 text-xs text-muted">Colunas aceitas: Nome, Preço, Quantidade, Custo, Categoria e Código. Só o nome é obrigatório. Produtos com nome já cadastrado são pulados.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
          Escolher arquivo .csv
          <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => { arquivo(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button onClick={modelo} className="text-sm text-brand-700 hover:underline">Baixar modelo</button>
      </div>
      {erro && <div className="mt-3"><Alert>{erro}</Alert></div>}
      {linhas && (
        <div className="mt-4 space-y-3">
          <div className="text-sm"><strong>{linhas.length}</strong> produto(s) encontrados. Confira os primeiros:</div>
          <div className="overflow-x-auto rounded-xl border border-brand-100">
            <table className="w-full text-xs">
              <thead className="bg-brand-50/60 text-left text-muted"><tr><th className="px-2 py-1.5">Nome</th><th className="px-2 py-1.5 text-right">Preço</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Custo</th><th className="px-2 py-1.5">Categoria</th></tr></thead>
              <tbody className="divide-y divide-brand-100">
                {linhas.slice(0, 8).map((l, i) => (
                  <tr key={i}><td className="px-2 py-1.5">{l.name || <span className="text-red-600">sem nome</span>}</td><td className="px-2 py-1.5 text-right">{num(l.price)}</td><td className="px-2 py-1.5 text-right">{l.stock}</td><td className="px-2 py-1.5 text-right">{num(l.cost)}</td><td className="px-2 py-1.5">{l.category}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2"><Button onClick={importar} loading={enviando}>Importar {linhas.length} produto(s)</Button><Button variant="ghost" onClick={() => setLinhas(null)}>Cancelar</Button></div>
        </div>
      )}
      {resultado && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
          <div className="font-medium text-emerald-800">✅ {resultado.created} produto(s) criados.</div>
          {resultado.skipped.length > 0 && (
            <ul className="mt-1 text-xs text-muted">
              {resultado.skipped.slice(0, 10).map((s, i) => <li key={i}>Linha {s.line + 1}{s.name ? ` (${s.name})` : ''}: {s.why}</li>)}
              {resultado.skipped.length > 10 && <li>e mais {resultado.skipped.length - 10} pulados</li>}
            </ul>
          )}
          <Link to="/produtos" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">Ver produtos →</Link>
        </div>
      )}
    </Card>
  )
}
