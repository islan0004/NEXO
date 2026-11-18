import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { METODOS, brl, labelVariant, parseNum, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { usePlano } from '../lib/planos'
import LeitorCodigo from '../components/LeitorCodigo'
import { Dica } from '../components/Tour'
import { Alert, Button, Card, Spinner, cellInput } from '../components/ui'
import ClienteSelect, { type Cliente } from '../components/ClienteSelect'

type Item = {
  variant_id: string; product_id: string; product_name: string; sku: string | null; attributes: Attrs
  sale_price: string; stock_quantity: string; active: boolean
}
/** Linha do carrinho: produto cadastrado ou valor avulso (sem produto, não mexe no estoque) */
type Linha =
  | { tipo: 'produto'; key: string; item: Item; quantidade: string; preco: string }
  | { tipo: 'avulso'; key: string; descricao: string; quantidade: string; preco: string; custo: string }
type Pagamento = { method: keyof typeof METODOS; valor: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const RAPIDOS: { k: keyof typeof METODOS; l: string }[] = [
  { k: 'pix', l: 'Pix' }, { k: 'cash', l: 'Dinheiro' }, { k: 'debit_card', l: 'Débito' }, { k: 'credit_card', l: 'Crédito' }, { k: 'fiado', l: 'Fiado' },
]

export default function NovaVenda() {
  const { current, canManage } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const [catalogo, setCatalogo] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [lendo, setLendo] = useState(false)
  const { pode } = usePlano()
  const [carrinho, setCarrinho] = useState<Linha[]>([])
  const [comDesconto, setComDesconto] = useState(false)
  const [descTipo, setDescTipo] = useState<'fixed' | 'percentage'>('fixed')
  const [descValor, setDescValor] = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([{ method: 'pix', valor: '' }])
  const [recebido, setRecebido] = useState('')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [mostrarCliente, setMostrarCliente] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [cadastrando, setCadastrando] = useState(false)
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const ultimoValor = useRef<HTMLInputElement | null>(null)
  const criadosNaHora = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!current) return
    supabase.rpc('get_product_catalog', { _store_id: current.id }).then(({ data }) => {
      setCatalogo(((data as Item[]) ?? []).filter((i) => i.active))
      setLoading(false)
    })
  }, [current])

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return []
    return catalogo.filter((i) => i.product_name.toLowerCase().includes(t) || i.sku?.toLowerCase().includes(t) ||
      labelVariant(i.attributes).toLowerCase().includes(t)).slice(0, 12)
  }, [busca, catalogo])

  // Cálculos espelham os do banco (create_paid_sale)
  const subtotal = r2(carrinho.reduce((s, l) => s + r2((parseNum(l.quantidade) || 0) * (parseNum(l.preco) || 0)), 0))
  const dv = comDesconto ? parseNum(descValor) || 0 : 0
  const desconto = descTipo === 'fixed' ? r2(dv) : r2((subtotal * Math.min(dv, 100)) / 100)
  const total = r2(Math.max(subtotal - desconto, 0))
  const pago = r2(pagamentos.reduce((s, p) => s + (parseNum(p.valor) || 0), 0))
  const restante = r2(total - pago)
  const emDinheiro = r2(pagamentos.filter((p) => p.method === 'cash').reduce((s, p) => s + (parseNum(p.valor) || 0), 0))
  const troco = recebido.trim() ? r2((parseNum(recebido) || 0) - emDinheiro) : null
  const temFiado = pagamentos.some((p) => p.method === 'fiado')

  // Com um único pagamento, ele acompanha o total automaticamente
  useEffect(() => {
    setPagamentos((ps) => (ps.length === 1 ? [{ ...ps[0], valor: total ? fmt2(total) : '' }] : ps))
  }, [total])

  const lerCodigo = useCallback((c: string) => { setLendo(false); porCodigoRef.current(c) }, [])
  const porCodigoRef = useRef(porCodigo)
  porCodigoRef.current = porCodigo

  function adicionar(item: Item) {
    setCarrinho((c) => {
      const i = c.findIndex((l) => l.tipo === 'produto' && l.item.variant_id === item.variant_id)
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantidade: String((parseNum(l.quantidade) || 0) + 1) } : l))
      return [...c, { tipo: 'produto', key: item.variant_id, item, quantidade: '1', preco: Number(item.sale_price) > 0 ? fmt2(Number(item.sale_price)) : '' }]
    })
    setBusca('')
  }

  /** Código lido (câmera ou leitor USB): adiciona o item com esse código. */
  function porCodigo(codigo: string, avisar = true) {
    const c = codigo.trim().toLowerCase()
    const achado = catalogo.find((i) => i.sku?.toLowerCase() === c)
    if (achado) { adicionar(achado); toast(`${achado.product_name} adicionado`); return }
    if (avisar) { setBusca(codigo.trim()); toast('Código não cadastrado. Cadastre o produto com esse código.', 'erro') }
  }

  function adicionarAvulso(descricao = '') {
    setCarrinho((c) => [...c, { tipo: 'avulso', key: crypto.randomUUID(), descricao, quantidade: '1', preco: '', custo: '' }])
    setBusca('')
    setTimeout(() => ultimoValor.current?.focus(), 50)
  }

  /** Cadastra o produto na hora (nome + preço) e já coloca na venda */
  async function cadastrarNaHora(nome: string) {
    if (!current) return
    setCadastrando(true); setErro('')
    const { data: pid, error } = await supabase.rpc('create_product_with_variants', {
      _store_id: current.id, _name: nome, _category_id: null, _variants: [{ attributes: {}, unit_cost: 0, sale_price: 0, initial_stock: 0, min_stock: 0 }],
    })
    if (error) { setCadastrando(false); return setErro(traduzErro(error)) }
    const { data } = await supabase.rpc('get_product_catalog', { _store_id: current.id })
    const lista = ((data as Item[]) ?? []).filter((i) => i.active)
    setCatalogo(lista)
    const novo = lista.find((i) => i.product_id === pid)
    setCadastrando(false)
    if (novo) { criadosNaHora.current.add(novo.variant_id); adicionar(novo); toast('Produto cadastrado. Informe o preço da venda.'); setTimeout(() => ultimoValor.current?.focus(), 50) }
  }

  const setLinha = (i: number, campo: 'quantidade' | 'preco' | 'descricao' | 'custo', v: string) =>
    setCarrinho((c) => c.map((l, j) => (j === i ? ({ ...l, [campo]: v } as Linha) : l)))
  const setPag = (i: number, campo: keyof Pagamento, v: string) =>
    setPagamentos((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)))

  async function finalizar() {
    setErro('')
    if (!carrinho.length) return setErro('Adicione um produto ou um valor avulso.')
    const items = []
    for (const l of carrinho) {
      const q = parseNum(l.quantidade), p = parseNum(l.preco)
      const nome = l.tipo === 'produto' ? l.item.product_name : l.descricao || 'o valor avulso'
      if (!(q > 0) || Number.isNaN(p) || !(p > 0)) return setErro(`Confira quantidade e valor de ${nome}.`)
      if (l.tipo === 'produto') items.push({ variant_id: l.item.variant_id, quantity: q, unit_price: r2(p) })
      else {
        const c = l.custo.trim() ? parseNum(l.custo) : 0
        if (Number.isNaN(c) || c < 0) return setErro(`Confira o custo de ${nome}.`)
        items.push({ description: l.descricao.trim(), quantity: q, unit_price: r2(p), unit_cost: r2(c) })
      }
    }
    if (comDesconto && (Number.isNaN(parseNum(descValor)) || dv < 0)) return setErro('Confira o desconto.')
    if (descTipo === 'percentage' && dv > 100) return setErro('Desconto máximo de 100%.')
    if (desconto > subtotal) return setErro('O desconto é maior que o valor da venda.')
    const payments = pagamentos.map((p) => ({ method: p.method, amount: r2(parseNum(p.valor) || 0) })).filter((p) => p.amount > 0)
    if (total > 0 && !payments.length) return setErro('Informe a forma de pagamento.')
    if (temFiado && !cliente) { setMostrarCliente(true); return setErro('Para vender fiado, escolha o cliente.') }
    if (restante !== 0) return setErro(restante > 0 ? `Faltam ${brl(restante)} nos pagamentos.` : `Os pagamentos passam ${brl(-restante)} do total.`)

    setSalvando(true)
    const { data, error } = await supabase.rpc('create_paid_sale', {
      _store_id: current!.id, _items: items, _payments: payments, _idempotency_key: chave,
      _discount_type: dv > 0 ? descTipo : null, _discount_value: dv > 0 ? (descTipo === 'fixed' ? r2(dv) : dv) : 0, _sold_at: null,
      _customer_id: cliente?.id ?? null,
    })
    setSalvando(false)
    if (error) {
      // Erro de validação: a próxima tentativa é uma nova operação
      if (!error.message.includes('idempotency')) setChave(crypto.randomUUID())
      return setErro(traduzErro(error))
    }
    // Produto cadastrado na hora: guarda o preço usado como preço de venda
    for (const l of carrinho) {
      if (l.tipo === 'produto' && criadosNaHora.current.has(l.item.variant_id)) {
        await supabase.from('product_variants').update({ sale_price: r2(parseNum(l.preco)) }).eq('id', l.item.variant_id)
      }
    }
    nav(`/vendas/${data}`, { replace: true, state: { nova: true } })
  }

  if (loading) return <Spinner />
  const termo = busca.trim()

  return (
    <div className="space-y-5">
      <Dica id="nova-venda" titulo="Registrando uma venda" texto="Busque um produto ou toque em “Valor avulso” para lançar só o valor, sem cadastrar nada. Escolha a forma de pagamento e finalize." />
      <Link to="/vendas" className="text-sm text-brand-700 hover:underline">← Vendas</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nova venda</h1>
      {lendo && <LeitorCodigo onClose={() => setLendo(false)} onLido={lerCodigo} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && busca.trim()) { e.preventDefault(); porCodigo(busca, false) } }}
                placeholder={catalogo.length ? 'Buscar produto ou código…' : 'Digite o nome do produto'}
                className={`w-full rounded-xl border border-brand-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 ${pode('codigo') ? 'pr-12' : ''}`} />
              {pode('codigo') && (
                <button type="button" onClick={() => setLendo(true)} aria-label="Ler código de barras" title="Ler código de barras"
                  className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-lg hover:bg-brand-50">📷</button>
              )}
              {termo && (
                <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-brand-100 bg-white shadow-lg">
                  {resultados.map((i) => {
                    const est = Number(i.stock_quantity)
                    return (
                      <li key={i.variant_id}>
                        <button onClick={() => adicionar(i)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-50">
                          <div>
                            <div className="font-medium">{i.product_name}{Object.keys(i.attributes).length ? <span className="font-normal text-muted"> · {labelVariant(i.attributes)}</span> : null}</div>
                            <div className="text-xs text-muted">{est <= 0 ? 'Sem estoque' : `${qtd(est)} em estoque`}</div>
                          </div>
                          <div className="font-medium">{brl(i.sale_price)}</div>
                        </button>
                      </li>
                    )
                  })}
                  <li className="border-t border-brand-100">
                    <button onClick={() => adicionarAvulso(termo)} className="w-full px-4 py-2.5 text-left text-sm text-brand-800 hover:bg-brand-50">
                      ⚡ Vender “{termo}” sem cadastrar <span className="text-xs text-muted">(valor avulso)</span>
                    </button>
                  </li>
                  {canManage && resultados.length === 0 && (
                    <li>
                      <button disabled={cadastrando} onClick={() => cadastrarNaHora(termo)} className="w-full px-4 py-2.5 text-left text-sm text-brand-800 hover:bg-brand-50 disabled:opacity-50">
                        + {cadastrando ? 'Cadastrando…' : `Cadastrar “${termo}” como produto e vender`}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <Button variant="ghost" className="shrink-0 border border-brand-200" onClick={() => adicionarAvulso()}>⚡ Valor avulso</Button>
          </div>

          <Card className="p-0">
            {carrinho.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">
                <p>Busque um produto acima</p>
                <p className="mt-1">ou toque em <button className="font-medium text-brand-700 hover:underline" onClick={() => adicionarAvulso()}>⚡ Valor avulso</button> para lançar só o valor da venda.</p>
              </div>
            ) : (
              <ul className="divide-y divide-brand-100">
                {carrinho.map((l, i) => {
                  const q = parseNum(l.quantidade) || 0
                  const ultimo = i === carrinho.length - 1
                  const negativo = l.tipo === 'produto' && Number(l.item.stock_quantity) > 0 && q > Number(l.item.stock_quantity)
                  return (
                    <li key={l.key} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 sm:grid-cols-[1fr_80px_110px_100px_24px] sm:items-center">
                      <div>
                        {l.tipo === 'produto' ? (
                          <>
                            <div className="text-sm font-medium">{l.item.product_name}</div>
                            <div className="text-xs text-muted">{Object.keys(l.item.attributes).length ? labelVariant(l.item.attributes) : ''}
                              {negativo && <span className="text-amber-700"> · estoque vai ficar negativo</span>}</div>
                          </>
                        ) : (
                          <>
                            <input className={`${cellInput} font-medium`} value={l.descricao} onChange={(e) => setLinha(i, 'descricao', e.target.value)} placeholder="O que foi vendido? (opcional)" />
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                              ⚡ Avulso, não mexe no estoque ·
                              <input className="w-24 rounded-md border border-brand-200 bg-white px-1.5 py-0.5 text-xs outline-none" inputMode="decimal" value={l.custo} onChange={(e) => setLinha(i, 'custo', e.target.value)} placeholder="custo (opcional)" />
                            </div>
                          </>
                        )}
                      </div>
                      <button className="text-muted hover:text-red-600 sm:order-last" onClick={() => setCarrinho((c) => c.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
                      <label className="text-xs text-muted">Qtd<input className={cellInput} inputMode="decimal" value={l.quantidade} onChange={(e) => setLinha(i, 'quantidade', e.target.value)} /></label>
                      <label className="text-xs text-muted">{l.tipo === 'avulso' ? 'Valor' : 'Preço un.'}<input ref={ultimo ? ultimoValor : undefined} className={cellInput} inputMode="decimal" value={l.preco} onChange={(e) => setLinha(i, 'preco', e.target.value)} placeholder="0,00" /></label>
                      <div className="self-end pb-1.5 text-right text-sm font-semibold">{brl(r2(q * (parseNum(l.preco) || 0)))}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 lg:sticky lg:top-6">
          {comDesconto ? (
            <div>
              <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span>{brl(subtotal)}</span></div>
              <div className="mt-2 flex gap-2">
                <select value={descTipo} onChange={(e) => setDescTipo(e.target.value as 'fixed' | 'percentage')} className={`${cellInput} w-20`}>
                  <option value="fixed">R$</option><option value="percentage">%</option>
                </select>
                <input autoFocus className={cellInput} inputMode="decimal" value={descValor} onChange={(e) => setDescValor(e.target.value)} placeholder="Desconto" />
                <button className="px-1 text-muted hover:text-red-600" onClick={() => { setComDesconto(false); setDescValor('') }} aria-label="Tirar desconto">✕</button>
              </div>
              {desconto > 0 && <p className="mt-1 text-right text-xs text-muted">− {brl(desconto)}</p>}
            </div>
          ) : null}
          <div className="flex items-end justify-between border-b border-brand-100 pb-3">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-semibold text-brand-900">{brl(total)}</span>
          </div>

          <div className="space-y-2">
            <span className="block text-sm text-muted">Como o cliente pagou?</span>
            {pagamentos.length === 1 ? (
              <div className="grid grid-cols-3 gap-2">
                {RAPIDOS.map((m) => (
                  <button key={m.k} onClick={() => { setPag(0, 'method', m.k); if (m.k === 'fiado') setMostrarCliente(true) }}
                    className={`rounded-xl border-2 px-2 py-2.5 text-sm font-medium transition active:scale-95 ${pagamentos[0].method === m.k ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-brand-100 hover:border-brand-300'}`}>
                    {m.l}
                  </button>
                ))}
              </div>
            ) : (
              pagamentos.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <select value={p.method} onChange={(e) => { setPag(i, 'method', e.target.value); if (e.target.value === 'fiado') setMostrarCliente(true) }} className={`${cellInput} w-32`}>
                    {Object.entries(METODOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input className={cellInput} inputMode="decimal" value={p.valor} onChange={(e) => setPag(i, 'valor', e.target.value)} placeholder="0,00" />
                  <button className="px-1 text-muted hover:text-red-600" onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))
            )}
            {restante !== 0 && carrinho.length > 0 && pagamentos.length > 1 && (
              <p className={`text-sm ${restante > 0 ? 'text-amber-700' : 'text-red-600'}`}>{restante > 0 ? `Faltam ${brl(restante)}` : `Passou ${brl(-restante)}`}</p>
            )}
          </div>

          {emDinheiro > 0 && (
            <div className="rounded-xl bg-brand-50 p-3">
              <label className="text-sm text-muted">Recebeu quanto em dinheiro? (para o troco)
                <input className={cellInput} inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder={fmt2(emDinheiro)} />
              </label>
              {troco !== null && <p className={`mt-2 text-sm font-semibold ${troco < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{troco < 0 ? `Faltam ${brl(-troco)}` : `Troco: ${brl(troco)}`}</p>}
            </div>
          )}

          {(mostrarCliente || temFiado || cliente) && (
            <div>
              <span className="mb-1.5 block text-sm text-muted">Cliente {temFiado ? <span className="text-red-600">(obrigatório no fiado)</span> : '(opcional)'}</span>
              <ClienteSelect storeId={current!.id} value={cliente} onChange={setCliente} />
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {!comDesconto && <button className="text-brand-700 hover:underline" onClick={() => setComDesconto(true)}>+ Desconto</button>}
            <button className="text-brand-700 hover:underline"
              onClick={() => setPagamentos((ps) => [...(ps.length === 1 ? [{ ...ps[0] }] : ps), { method: 'cash', valor: restante > 0 ? fmt2(restante) : '' }])}>+ Dividir pagamento</button>
            {!(mostrarCliente || temFiado || cliente) && <button className="text-brand-700 hover:underline" onClick={() => setMostrarCliente(true)}>+ Cliente</button>}
          </div>

          {erro && <Alert>{erro}</Alert>}
          <Button className="w-full py-3 text-base" loading={salvando} onClick={finalizar} disabled={!carrinho.length}>Finalizar venda · {brl(total)}</Button>
        </Card>
      </div>
    </div>
  )
}
