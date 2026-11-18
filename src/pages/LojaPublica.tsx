import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { brl, labelVariant, supabase, type Attrs } from '../lib/supabase'
import { abrirWhatsApp } from '../lib/mensagens'

type Variante = { id: string; attributes: Attrs; price: number; available: boolean }
type Produto = { id: string; name: string; image_url: string | null; category: string | null; variants: Variante[] }
type Catalogo = { store: { name: string; whatsapp: string | null; about: string | null }; products: Produto[] }
type Item = { produto: Produto; variante: Variante; qtd: number }

/** Vitrine pública da loja (sem login). O pedido vai pronto para o WhatsApp da loja. */
export default function LojaPublica() {
  const { slug } = useParams()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [escolha, setEscolha] = useState<Record<string, string>>({})
  const [carrinho, setCarrinho] = useState<Item[]>([])
  const [verCarrinho, setVerCarrinho] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = 'nexo'
    supabase.rpc('get_public_catalog', { _slug: slug }).then(({ data }) => {
      setCat((data as Catalogo) ?? null); setLoading(false)
      if (data) document.title = `${(data as Catalogo).store.name} · Catálogo`
    })
  }, [slug])

  const categorias = useMemo(() => [...new Set((cat?.products ?? []).map((p) => p.category).filter(Boolean))] as string[], [cat])
  const lista = useMemo(() => (cat?.products ?? []).filter((p) => (!filtro || p.category === filtro) && (!busca.trim() || p.name.toLowerCase().includes(busca.trim().toLowerCase()))), [cat, filtro, busca])
  const total = carrinho.reduce((s, i) => s + i.qtd * Number(i.variante.price), 0)
  const itens = carrinho.reduce((s, i) => s + i.qtd, 0)

  function adicionar(p: Produto) {
    const v = p.variants.find((x) => x.id === escolha[p.id]) ?? p.variants[0]
    setCarrinho((c) => {
      const i = c.findIndex((x) => x.variante.id === v.id)
      return i >= 0 ? c.map((x, j) => (j === i ? { ...x, qtd: x.qtd + 1 } : x)) : [...c, { produto: p, variante: v, qtd: 1 }]
    })
  }

  if (loading) return <div className="flex min-h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700" /></div>
  if (!cat) return <div className="flex min-h-full items-center justify-center p-6 text-center text-muted">Catálogo não encontrado ou desligado.</div>

  const pedido = [
    `Olá, ${cat.store.name}! Quero fazer um pedido pelo catálogo:`, '',
    ...carrinho.map((i) => `• ${i.qtd}x ${i.produto.name}${Object.keys(i.variante.attributes).length ? ` (${labelVariant(i.variante.attributes)})` : ''} — ${brl(i.qtd * Number(i.variante.price))}`),
    '', `Total: ${brl(total)}`,
  ].join('\n')

  return (
    <div className="min-h-full bg-brand-50/40 pb-28">
      <header className="bg-brand-700 px-4 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-semibold">{cat.store.name}</h1>
          {cat.store.about && <p className="mt-1 text-sm text-white/85">{cat.store.about}</p>}
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto"
          className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500" />
        {categorias.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['', ...categorias].map((c) => (
              <button key={c || 'todos'} onClick={() => setFiltro(c)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${filtro === c ? 'bg-brand-700 text-white' : 'bg-white text-ink'}`}>{c || 'Todos'}</button>
            ))}
          </div>
        )}
        {lista.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum produto por aqui ainda.</p> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {lista.map((p) => {
              const v = p.variants.find((x) => x.id === escolha[p.id]) ?? p.variants[0]
              return (
                <div key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white">
                  <div className="aspect-square bg-brand-50">
                    {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center text-3xl text-brand-300">🛍️</div>}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="text-sm font-medium leading-snug">{p.name}</div>
                    {p.variants.length > 1 && (
                      <select value={v.id} onChange={(e) => setEscolha((x) => ({ ...x, [p.id]: e.target.value }))}
                        className="rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs">
                        {p.variants.map((x) => <option key={x.id} value={x.id}>{labelVariant(x.attributes)}{x.available ? '' : ' (sob encomenda)'}</option>)}
                      </select>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-2">
                      <div>
                        <div className="font-semibold text-brand-900">{brl(v.price)}</div>
                        {!v.available && <div className="text-[11px] text-muted">sob encomenda</div>}
                      </div>
                      <button onClick={() => adicionar(p)} className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white active:scale-95">+</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="pt-4 text-center text-xs text-muted">Catálogo feito com NEXO</p>
      </div>

      {itens > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-brand-100 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <button onClick={() => setVerCarrinho(true)} className="text-left text-sm"><div className="font-semibold">{itens} item(ns) · {brl(total)}</div><div className="text-xs text-brand-700">ver pedido</div></button>
            <a href={abrirWhatsApp(pedido, cat.store.whatsapp)} target="_blank" rel="noreferrer"
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">Enviar pedido no WhatsApp</a>
          </div>
        </div>
      )}
      {verCarrinho && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setVerCarrinho(false)}>
          <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 font-semibold">Seu pedido</h2>
            <ul className="space-y-2 text-sm">
              {carrinho.map((i, k) => (
                <li key={i.variante.id} className="flex items-center justify-between gap-2">
                  <span>{i.produto.name}{Object.keys(i.variante.attributes).length ? ` (${labelVariant(i.variante.attributes)})` : ''}</span>
                  <span className="flex items-center gap-2">
                    <button className="rounded-md bg-brand-50 px-2" onClick={() => setCarrinho((c) => c.map((x, j) => (j === k ? { ...x, qtd: x.qtd - 1 } : x)).filter((x) => x.qtd > 0))}>−</button>
                    {i.qtd}
                    <button className="rounded-md bg-brand-50 px-2" onClick={() => setCarrinho((c) => c.map((x, j) => (j === k ? { ...x, qtd: x.qtd + 1 } : x)))}>+</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between font-semibold"><span>Total</span><span>{brl(total)}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
