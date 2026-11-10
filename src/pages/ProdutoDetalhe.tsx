import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { brl, labelVariant, parseNum, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useCategorias } from '../lib/categories'
import CategoriaSelect from '../components/CategoriaSelect'
import { Alert, Badge, Button, Card, Field, Modal, Spinner } from '../components/ui'

type Produto = { id: string; name: string; category_id: string | null; active: boolean }
type Variante = {
  id: string; is_default: boolean; sku: string | null; attributes: Attrs; unit_cost: string
  sale_price: string; stock_quantity: string; min_stock: string; active: boolean
}
type Mov = {
  id: string; variant_id: string; type: string; quantity: string; unit_cost: string | null
  balance_after: string; reason: string | null; created_at: string
}

const TIPOS: Record<string, string> = {
  initial: 'Estoque inicial', purchase: 'Entrada (compra)', sale: 'Venda', sale_cancel: 'Venda cancelada',
  return: 'Devolução', adjustment: 'Ajuste',
}

export default function ProdutoDetalhe() {
  const { id } = useParams()
  const { current, canManage } = useStore()
  const { categorias, criar } = useCategorias(current?.id)
  const [produto, setProduto] = useState<Produto | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [movs, setMovs] = useState<Mov[]>([])
  const [loading, setLoading] = useState(true)
  const [editProduto, setEditProduto] = useState(false)
  const [editVar, setEditVar] = useState<Variante | null>(null)
  const [movVar, setMovVar] = useState<Variante | null>(null)
  const [novaVar, setNovaVar] = useState(false)

  const carregar = useCallback(async () => {
    if (!id || !current) return
    const [p, v] = await Promise.all([
      supabase.from('products').select('id, name, category_id, active').eq('id', id).eq('store_id', current.id).maybeSingle(),
      supabase.from('product_variants').select('id, is_default, sku, attributes, unit_cost, sale_price, stock_quantity, min_stock, active')
        .eq('product_id', id).order('is_default', { ascending: false }).order('created_at'),
    ])
    setProduto(p.data)
    const vs = (v.data as Variante[]) ?? []
    setVariantes(vs)
    if (vs.length) {
      const { data } = await supabase.from('stock_movements')
        .select('id, variant_id, type, quantity, unit_cost, balance_after, reason, created_at')
        .in('variant_id', vs.map((x) => x.id)).order('created_at', { ascending: false }).limit(50)
      setMovs((data as Mov[]) ?? [])
    }
    setLoading(false)
  }, [id, current])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <Spinner />
  if (!produto || !canManage) {
    return <Card className="py-12 text-center"><p>Produto não encontrado.</p><Link to="/produtos" className="mt-3 inline-block text-sm text-brand-700 hover:underline">Voltar</Link></Card>
  }

  const temVariacoes = variantes.length > 1 || Object.keys(variantes[0]?.attributes ?? {}).length > 0
  const nomeVar = new Map(variantes.map((v) => [v.id, labelVariant(v.attributes)]))
  const categoria = categorias.find((c) => c.id === produto.category_id)?.name
  const totalEstoque = variantes.filter((v) => v.active).reduce((s, v) => s + Number(v.stock_quantity), 0)
  const valorEstoque = variantes.filter((v) => v.active).reduce((s, v) => s + Number(v.stock_quantity) * Number(v.unit_cost), 0)

  return (
    <div className="space-y-5">
      <Link to="/produtos" className="text-sm text-brand-700 hover:underline">← Produtos</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{produto.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{categoria ?? 'Sem categoria'}</span>
            {!produto.active && <Badge tone="gray">Inativo</Badge>}
          </div>
        </div>
        <Button variant="ghost" onClick={() => setEditProduto(true)}>Editar produto</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card><div className="text-sm text-muted">Estoque total</div><div className="mt-1 text-xl font-semibold text-brand-900">{qtd(totalEstoque)} un.</div></Card>
        <Card><div className="text-sm text-muted">Valor em estoque (custo)</div><div className="mt-1 text-xl font-semibold text-brand-900">{brl(valorEstoque)}</div></Card>
        <Card className="col-span-2 sm:col-span-1"><div className="text-sm text-muted">Variações</div><div className="mt-1 text-xl font-semibold text-brand-900">{temVariacoes ? variantes.length : '—'}</div></Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">{temVariacoes ? 'Variações' : 'Estoque e preço'}</h2>
          {temVariacoes && <Button variant="ghost" onClick={() => setNovaVar(true)}>+ Variação</Button>}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {temVariacoes && <th className="px-4 py-2 font-medium">Variação</th>}
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 text-right font-medium">Custo</th>
              <th className="px-4 py-2 text-right font-medium">Preço</th>
              <th className="px-4 py-2 text-right font-medium">Margem</th>
              <th className="px-4 py-2 text-right font-medium">Estoque</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {variantes.map((v) => {
              const preco = Number(v.sale_price), custo = Number(v.unit_cost)
              const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0
              const baixo = Number(v.stock_quantity) <= Number(v.min_stock)
              return (
                <tr key={v.id} className={v.active ? '' : 'opacity-50'}>
                  {temVariacoes && <td className="px-4 py-2.5 font-medium">{labelVariant(v.attributes)} {!v.active && <Badge tone="gray">Inativa</Badge>}</td>}
                  <td className="px-4 py-2.5 text-muted">{v.sku ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">{brl(custo)}</td>
                  <td className="px-4 py-2.5 text-right">{brl(preco)}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{margem.toFixed(0)}%</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${baixo && v.active ? 'text-red-600' : ''}`}>
                    {qtd(v.stock_quantity)}<span className="block text-xs font-normal text-muted">mín. {qtd(v.min_stock)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button className="mr-3 text-brand-700 hover:underline" onClick={() => setMovVar(v)}>Estoque</button>
                    <button className="text-brand-700 hover:underline" onClick={() => setEditVar(v)}>Editar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-0">
        <h2 className="px-4 py-3 font-semibold">Histórico de estoque</h2>
        {movs.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Nenhuma movimentação ainda.</p> : (
          <ul className="divide-y divide-brand-100 text-sm">
            {movs.map((m) => {
              const q = Number(m.quantity)
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div>
                    <div className="font-medium">{TIPOS[m.type] ?? m.type}{temVariacoes && <span className="font-normal text-muted"> · {nomeVar.get(m.variant_id)}</span>}</div>
                    <div className="text-xs text-muted">{new Date(m.created_at).toLocaleString('pt-BR')}{m.reason ? ` · ${m.reason}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${q < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{q > 0 ? '+' : ''}{qtd(q)}</div>
                    <div className="text-xs text-muted">saldo {qtd(m.balance_after)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editProduto && (
        <EditarProduto produto={produto} categorias={categorias} criar={criar}
          onClose={() => setEditProduto(false)} onSaved={() => { setEditProduto(false); carregar() }} />
      )}
      {editVar && <EditarVariante v={editVar} temVariacoes={temVariacoes} onClose={() => setEditVar(null)} onSaved={() => { setEditVar(null); carregar() }} />}
      {movVar && <MovimentarEstoque v={movVar} titulo={temVariacoes ? labelVariant(movVar.attributes) : produto.name} onClose={() => setMovVar(null)} onSaved={() => { setMovVar(null); carregar() }} />}
      {novaVar && <NovaVariante productId={produto.id} chaves={Object.keys(variantes[0]?.attributes ?? {})} base={variantes[0]}
        onClose={() => setNovaVar(false)} onSaved={() => { setNovaVar(false); carregar() }} />}
    </div>
  )
}

function EditarProduto({ produto, categorias, criar, onClose, onSaved }: {
  produto: Produto; categorias: { id: string; name: string }[]; criar: (n: string) => Promise<{ id: string; name: string }>
  onClose: () => void; onSaved: () => void
}) {
  const [nome, setNome] = useState(produto.name)
  const [cat, setCat] = useState(produto.category_id ?? '')
  const [ativo, setAtivo] = useState(produto.active)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true)
    const { error } = await supabase.from('products').update({ name: nome.trim(), category_id: cat || null, active: ativo }).eq('id', produto.id)
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title="Editar produto" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <CategoriaSelect categorias={categorias} value={cat} onChange={setCat} criar={criar} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Produto ativo (aparece para venda)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
      </form>
    </Modal>
  )
}

function EditarVariante({ v, temVariacoes, onClose, onSaved }: { v: Variante; temVariacoes: boolean; onClose: () => void; onSaved: () => void }) {
  const fmt = (n: string) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const [sku, setSku] = useState(v.sku ?? '')
  const [custo, setCusto] = useState(fmt(v.unit_cost))
  const [preco, setPreco] = useState(fmt(v.sale_price))
  const [minimo, setMinimo] = useState(qtd(v.min_stock))
  const [ativo, setAtivo] = useState(v.active)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const c = parseNum(custo), p = parseNum(preco), m = parseNum(minimo)
    if ([c, p, m].some((n) => Number.isNaN(n) || n < 0)) return setErro('Confira os valores.')
    setLoading(true)
    const { error } = await supabase.from('product_variants')
      .update({ sku: sku.trim() || null, unit_cost: c, sale_price: p, min_stock: m, active: ativo }).eq('id', v.id)
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title={temVariacoes ? `Editar ${labelVariant(v.attributes)}` : 'Editar preço e estoque mínimo'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo (R$)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
          <Field label="Preço de venda (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          <Field label="Estoque mínimo" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          <Field label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        {temVariacoes && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Variação ativa</label>}
        <p className="text-xs text-muted">Para mudar a quantidade em estoque, use o botão “Estoque”, que registra a movimentação no histórico.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
      </form>
    </Modal>
  )
}

function MovimentarEstoque({ v, titulo, onClose, onSaved }: { v: Variante; titulo: string; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'entrada' | 'saida' | 'corrigir'>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [custo, setCusto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const atual = Number(v.stock_quantity)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const q = parseNum(quantidade)
    if (Number.isNaN(q) || q < 0 || (tipo !== 'corrigir' && q === 0)) return setErro('Informe uma quantidade válida.')
    let delta: number
    let type: 'purchase' | 'adjustment'
    if (tipo === 'entrada') { delta = q; type = 'purchase' }
    else if (tipo === 'saida') { delta = -q; type = 'adjustment' }
    else { delta = q - atual; type = 'adjustment' }
    if (delta === 0) return setErro('O estoque já está nessa quantidade.')
    if (type === 'adjustment' && !motivo.trim()) return setErro('Informe o motivo do ajuste.')
    const c = custo.trim() ? parseNum(custo) : null
    if (c !== null && (Number.isNaN(c) || c < 0)) return setErro('Confira o custo.')

    setLoading(true)
    const { error } = await supabase.rpc('adjust_stock', {
      _variant_id: v.id, _quantity: delta, _type: type,
      _reason: motivo.trim() || (type === 'purchase' ? 'Entrada de mercadoria' : null),
      _idempotency_key: crypto.randomUUID(), _unit_cost: c,
    })
    if (!error && type === 'purchase' && c !== null && c !== Number(v.unit_cost)) {
      // Atualiza o custo do produto para o da última compra
      await supabase.from('product_variants').update({ unit_cost: c }).eq('id', v.id)
    }
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  const opcoes = [
    { k: 'entrada', l: 'Entrada (compra)' },
    { k: 'saida', l: 'Saída / perda' },
    { k: 'corrigir', l: 'Corrigir contagem' },
  ] as const

  return (
    <Modal title={`Estoque · ${titulo}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Estoque atual: <strong className="text-ink">{qtd(atual)} un.</strong></p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-brand-50 p-1">
          {opcoes.map((o) => (
            <button key={o.k} type="button" onClick={() => setTipo(o.k)}
              className={`rounded-lg px-2 py-2 text-xs font-medium ${tipo === o.k ? 'bg-white text-brand-800 shadow-sm' : 'text-muted'}`}>{o.l}</button>
          ))}
        </div>
        <Field label={tipo === 'corrigir' ? 'Quantidade real contada' : 'Quantidade'} inputMode="decimal" required value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        {tipo === 'entrada' && <Field label="Custo unitário desta compra (opcional)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder={Number(v.unit_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />}
        <Field label={tipo === 'entrada' ? 'Observação (opcional)' : 'Motivo'} required={tipo !== 'entrada'} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder={tipo === 'saida' ? 'Ex.: peça com defeito, brinde' : tipo === 'corrigir' ? 'Ex.: contagem de fim de mês' : 'Ex.: fornecedor X'} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Registrar</Button></div>
      </form>
    </Modal>
  )
}

function NovaVariante({ productId, chaves, base, onClose, onSaved }: {
  productId: string; chaves: string[]; base?: Variante; onClose: () => void; onSaved: () => void
}) {
  const fmt = (n?: string) => (n ? Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')
  const [attrs, setAttrs] = useState<Attrs>(Object.fromEntries(chaves.map((k) => [k, ''])))
  const [custo, setCusto] = useState(fmt(base?.unit_cost))
  const [preco, setPreco] = useState(fmt(base?.sale_price))
  const [estoque, setEstoque] = useState('')
  const [minimo, setMinimo] = useState(base ? qtd(base.min_stock) : '')
  const [sku, setSku] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (Object.values(attrs).some((v) => !v.trim())) return setErro('Preencha todos os atributos.')
    const c = parseNum(custo), p = parseNum(preco), est = parseNum(estoque), m = parseNum(minimo)
    if ([c, p, est, m].some((n) => Number.isNaN(n) || n < 0)) return setErro('Confira os valores.')
    setLoading(true)
    const limpos = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v.trim()]))
    const { error } = await supabase.rpc('create_variant', {
      _product_id: productId, _sku: sku || null, _attributes: limpos, _unit_cost: c, _sale_price: p, _initial_stock: est, _min_stock: m,
    })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title="Nova variação" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          {chaves.map((k) => (
            <Field key={k} label={k} required value={attrs[k]} onChange={(e) => setAttrs((a) => ({ ...a, [k]: e.target.value }))} />
          ))}
          <Field label="Custo (R$)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
          <Field label="Preço (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          <Field label="Estoque inicial" inputMode="decimal" value={estoque} onChange={(e) => setEstoque(e.target.value)} placeholder="0" />
          <Field label="Estoque mínimo" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          <Field label="SKU (opcional)" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Adicionar</Button></div>
      </form>
    </Modal>
  )
}
