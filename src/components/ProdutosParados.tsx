import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brl, labelVariant, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Card } from './ui'

type Parado = { product_id: string; name: string; attributes: Attrs; stock: number; price: number; value_cost: number; value_price: number; last_sale: string | null; days: number }
const PRAZOS = [30, 60, 90]

/** Itens com estoque que não vendem há X dias: dinheiro parado na prateleira. */
export default function ProdutosParados() {
  const { current } = useStore()
  const [dias, setDias] = useState(60)
  const [lista, setLista] = useState<Parado[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!current) return
    setLista(null)
    supabase.rpc('get_stale_products', { _store_id: current.id, _days: dias }).then(({ data, error }) => {
      if (error) return setErro(traduzErro(error))
      setLista((data as Parado[]) ?? [])
    })
  }, [current, dias])

  const custo = (lista ?? []).reduce((a, p) => a + Number(p.value_cost), 0)
  const venda = (lista ?? []).reduce((a, p) => a + Number(p.value_price), 0)

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="font-semibold">🐢 Produtos parados</h2>
          <p className="text-xs text-muted">Têm estoque e não vendem há mais de {dias} dias. Bons para promoção.</p>
        </div>
        <div className="flex gap-1">
          {PRAZOS.map((p) => (
            <button key={p} onClick={() => setDias(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${dias === p ? 'bg-brand-700 text-white' : 'border border-brand-200 text-muted hover:bg-brand-50'}`}>{p} dias</button>
          ))}
        </div>
      </div>
      {erro ? <p className="px-4 pb-4 text-sm text-red-600">{erro}</p> : lista === null ? <p className="px-4 pb-4 text-sm text-muted">Carregando…</p> : lista.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">Nada parado. Tudo que tem estoque vendeu nos últimos {dias} dias.</p>
      ) : (
        <>
          <div className="border-y border-brand-100 bg-brand-50/60 px-4 py-2 text-sm">
            <strong>{lista.length}</strong> item(ns) · {custo > 0 && <>{brl(custo)} pagos em mercadoria · </>}{brl(venda)} no preço de venda
          </div>
          <ul className="divide-y divide-brand-100 text-sm">
            {lista.slice(0, 30).map((p, i) => (
              <li key={i}>
                <Link to={`/produtos/${p.product_id}`} className="flex justify-between gap-3 px-4 py-2.5 hover:bg-brand-50/50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}{Object.keys(p.attributes ?? {}).length > 0 && <span className="font-normal text-muted"> · {labelVariant(p.attributes)}</span>}</div>
                    <div className="text-xs text-muted">{p.last_sale ? `Última venda há ${p.days} dias` : `Nunca vendeu · cadastrado há ${p.days} dias`}</div>
                  </div>
                  <div className="whitespace-nowrap text-right"><div>{qtd(p.stock)} un.</div><div className="text-xs text-muted">{brl(p.value_price)}</div></div>
                </Link>
              </li>
            ))}
          </ul>
          {lista.length > 30 && <p className="px-4 py-2 text-xs text-muted">e mais {lista.length - 30}</p>}
        </>
      )}
    </Card>
  )
}
