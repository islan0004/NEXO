import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { METODOS, brl, labelVariant, parseNum, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Dica } from '../components/Tour'
import { Alert, Button, Card, Spinner, cellInput } from '../components/ui'
import ClienteSelect, { type Cliente } from '../components/ClienteSelect'

type Item = {
  variant_id: string; product_id: string; product_name: string; sku: string | null; attributes: Attrs
  sale_price: string; stock_quantity: string; active: boolean
}
type Linha = { item: Item; quantidade: string; preco: string }
type Pagamento = { method: keyof typeof METODOS; valor: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function NovaVenda() {
  const { current } = useStore()
  const nav = useNavigate()
  const [catalogo, setCatalogo] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<Linha[]>([])
  const [descTipo, setDescTipo] = useState<'fixed' | 'percentage'>('fixed')
  const [descValor, setDescValor] = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([{ method: 'pix', valor: '' }])
  const [recebido, setRecebido] = useState('')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [chave, setChave] = useState(() => crypto.randomUUID())

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
  const dv = parseNum(descValor) || 0
  const desconto = descTipo === 'fixed' ? r2(dv) : r2((subtotal * Math.min(dv, 100)) / 100)
  const total = r2(Math.max(subtotal - desconto, 0))
  const pago = r2(pagamentos.reduce((s, p) => s + (parseNum(p.valor) || 0), 0))
  const restante = r2(total - pago)
  const emDinheiro = r2(pagamentos.filter((p) => p.method === 'cash').reduce((s, p) => s + (parseNum(p.valor) || 0), 0))
  const troco = recebido.trim() ? r2((parseNum(recebido) || 0) - emDinheiro) : null

  // Com um único pagamento, ele acompanha o total automaticamente
  useEffect(() => {
    setPagamentos((ps) => (ps.length === 1 ? [{ ...ps[0], valor: total ? fmt2(total) : '' }] : ps))
  }, [total])

  function adicionar(item: Item) {
    setCarrinho((c) => {
      const i = c.findIndex((l) => l.item.variant_id === item.variant_id)
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantidade: String((parseNum(l.quantidade) || 0) + 1) } : l))
      return [...c, { item, quantidade: '1', preco: fmt2(Number(item.sale_price)) }]
    })
    setBusca('')
  }
  const setLinha = (i: number, campo: 'quantidade' | 'preco', v: string) =>
    setCarrinho((c) => c.map((l, j) => (j === i ? { ...l, [campo]: v } : l)))
  const setPag = (i: number, campo: keyof Pagamento, v: string) =>
    setPagamentos((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)))

  async function finalizar() {
    setErro('')
    if (!carrinho.length) return setErro('Adicione ao menos um produto.')
    const items = []
    for (const l of carrinho) {
      const q = parseNum(l.quantidade), p = parseNum(l.preco)
      if (!(q > 0) || Number.isNaN(p) || p < 0) return setErro(`Confira quantidade e preço de ${l.item.product_name}.`)
      items.push({ variant_id: l.item.variant_id, quantity: q, unit_price: r2(p) })
    }
    if (Number.isNaN(parseNum(descValor)) || dv < 0) return setErro('Confira o desconto.')
    if (descTipo === 'percentage' && dv > 100) return setErro('Desconto máximo de 100%.')
    if (desconto > subtotal) return setErro('O desconto é maior que o valor da venda.')
    const payments = pagamentos.map((p) => ({ method: p.method, amount: r2(parseNum(p.valor) || 0) })).filter((p) => p.amount > 0)
    if (total > 0 && !payments.length) return setErro('Informe a forma de pagamento.')
    if (payments.some((p) => p.method === 'fiado') && !cliente) return setErro('Para vender fiado, escolha o cliente.')
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
    nav(`/vendas/${data}`, { replace: true, state: { nova: true } })
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <Dica id="nova-venda" titulo="Registrando uma venda" texto="Busque o produto pelo nome, código, tamanho ou cor. Ajuste quantidade e preço se precisar, escolha a forma de pagamento e toque em “Finalizar venda”." />
      <Link to="/vendas" className="text-sm text-brand-700 hover:underline">← Vendas</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nova venda</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="relative">
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder={catalogo.length ? 'Buscar produto por nome, código, tamanho…' : 'Cadastre produtos para vender'}
              className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {resultados.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-brand-100 bg-white shadow-lg">
                {resultados.map((i) => {
                  const est = Number(i.stock_quantity)
                  return (
                    <li key={i.variant_id}>
                      <button onClick={() => adicionar(i)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-50">
                        <div>
                          <div className="font-medium">{i.product_name}{Object.keys(i.attributes).length ? <span className="font-normal text-muted"> · {labelVariant(i.attributes)}</span> : null}</div>
                          <div className={`text-xs ${est <= 0 ? 'text-red-600' : 'text-muted'}`}>{est <= 0 ? 'Sem estoque' : `${qtd(est)} em estoque`}{i.sku ? ` · ${i.sku}` : ''}</div>
                        </div>
                        <div className="font-medium">{brl(i.sale_price)}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {busca.trim() && resultados.length === 0 && <p className="mt-2 text-sm text-muted">Nenhum produto encontrado.</p>}
          </div>

          <Card className="p-0">
            {carrinho.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">Busque e adicione produtos acima.</p>
            ) : (
              <ul className="divide-y divide-brand-100">
                {carrinho.map((l, i) => {
                  const q = parseNum(l.quantidade) || 0
                  const semEstoque = q > Number(l.item.stock_quantity)
                  return (
                    <li key={l.item.variant_id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 sm:grid-cols-[1fr_90px_110px_100px_24px] sm:items-center">
                      <div>
                        <div className="text-sm font-medium">{l.item.product_name}</div>
                        <div className="text-xs text-muted">{Object.keys(l.item.attributes).length ? labelVariant(l.item.attributes) : ''}
                          {semEstoque && <span className="text-red-600"> · só {qtd(l.item.stock_quantity)} em estoque</span>}</div>
                      </div>
                      <button className="text-muted hover:text-red-600 sm:order-last" onClick={() => setCarrinho((c) => c.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
                      <label className="text-xs text-muted">Qtd<input className={cellInput} inputMode="decimal" value={l.quantidade} onChange={(e) => setLinha(i, 'quantidade', e.target.value)} /></label>
                      <label className="text-xs text-muted">Preço un.<input className={cellInput} inputMode="decimal" value={l.preco} onChange={(e) => setLinha(i, 'preco', e.target.value)} /></label>
                      <div className="self-end pb-1.5 text-right text-sm font-semibold">{brl(r2(q * (parseNum(l.preco) || 0)))}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 lg:sticky lg:top-6">
          <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span>{brl(subtotal)}</span></div>
          <div>
            <span className="mb-1.5 block text-sm text-muted">Desconto</span>
            <div className="flex gap-2">
              <select value={descTipo} onChange={(e) => setDescTipo(e.target.value as 'fixed' | 'percentage')} className={`${cellInput} w-20`}>
                <option value="fixed">R$</option><option value="percentage">%</option>
              </select>
              <input className={cellInput} inputMode="decimal" value={descValor} onChange={(e) => setDescValor(e.target.value)} placeholder="0" />
            </div>
            {desconto > 0 && <p className="mt-1 text-right text-xs text-muted">− {brl(desconto)}</p>}
          </div>
          <div className="flex justify-between border-t border-brand-100 pt-3 text-lg font-semibold"><span>Total</span><span className="text-brand-900">{brl(total)}</span></div>

          <div className="space-y-2">
            <span className="block text-sm text-muted">Pagamento</span>
            {pagamentos.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select value={p.method} onChange={(e) => setPag(i, 'method', e.target.value)} className={`${cellInput} w-36`}>
                  {Object.entries(METODOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input className={cellInput} inputMode="decimal" value={p.valor} onChange={(e) => setPag(i, 'valor', e.target.value)} placeholder="0,00" />
                {pagamentos.length > 1 && <button className="px-1 text-muted hover:text-red-600" onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            <button className="text-sm text-brand-700 hover:underline"
              onClick={() => setPagamentos((ps) => [...ps, { method: 'cash', valor: restante > 0 ? fmt2(restante) : '' }])}>+ Dividir pagamento</button>
            {restante !== 0 && carrinho.length > 0 && (
              <p className={`text-sm ${restante > 0 ? 'text-amber-700' : 'text-red-600'}`}>{restante > 0 ? `Faltam ${brl(restante)}` : `Passou ${brl(-restante)}`}</p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-sm text-muted">Cliente {pagamentos.some((p) => p.method === 'fiado') ? <span className="text-red-600">(obrigatório no fiado)</span> : '(opcional)'}</span>
            <ClienteSelect storeId={current!.id} value={cliente} onChange={setCliente} />
          </div>

          {emDinheiro > 0 && (
            <div className="rounded-xl bg-brand-50 p-3">
              <label className="text-sm text-muted">Valor recebido em dinheiro
                <input className={cellInput} inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder={fmt2(emDinheiro)} />
              </label>
              {troco !== null && <p className={`mt-2 text-sm font-semibold ${troco < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{troco < 0 ? `Faltam ${brl(-troco)}` : `Troco: ${brl(troco)}`}</p>}
            </div>
          )}

          {erro && <Alert>{erro}</Alert>}
          <Button className="w-full py-3 text-base" loading={salvando} onClick={finalizar} disabled={!carrinho.length}>Finalizar venda</Button>
        </Card>
      </div>
    </div>
  )
}
