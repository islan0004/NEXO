import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brl, pct, supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Card, Spinner } from '../components/ui'

type Totais = { revenue: number; cost: number; gross_profit: number; valid_count: number }
type Item = { variant_id: string; product_name: string; stock_quantity: number; min_stock: number; active: boolean }

export default function Dashboard() {
  const { current, canManage } = useStore()
  const [totais, setTotais] = useState<Totais | null>(null)
  const [catalogo, setCatalogo] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!current) return
    let alive = true
    setLoading(true)
    Promise.all([
      canManage ? supabase.rpc('get_sales_totals_stage33', { _store_id: current.id }) : Promise.resolve({ data: null }),
      supabase.rpc('get_product_catalog', { _store_id: current.id }),
    ]).then(([t, c]) => {
      if (!alive) return
      setTotais((t.data as Totais) ?? null)
      setCatalogo(((c.data as Item[]) ?? []).filter((i) => i.active))
      setLoading(false)
    })
    return () => { alive = false }
  }, [current, canManage])

  if (loading) return <Spinner />

  const baixo = catalogo.filter((i) => Number(i.stock_quantity) <= Number(i.min_stock))
  const margem = totais && totais.revenue > 0 ? (totais.gross_profit / totais.revenue) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Olá! Aqui está sua loja</h1>
          <p className="text-sm text-muted">{current?.name}</p>
        </div>
        <Link to="/vendas/nova" className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-800">+ Nova venda</Link>
      </div>

      {canManage && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Faturamento" value={brl(totais?.revenue)} />
          <Stat label="Lucro bruto" value={brl(totais?.gross_profit)} hint={`Margem ${pct(margem)}`} />
          <Stat label="Custo das vendas" value={brl(totais?.cost)} />
          <Stat label="Vendas" value={String(totais?.valid_count ?? 0)} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Produtos</h2>
          <p className="mt-1 text-sm text-muted">{catalogo.length} itens ativos no catálogo</p>
          {catalogo.length === 0 && (
            <Link to="/produtos" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Cadastrar o primeiro produto →</Link>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Estoque baixo</h2>
          {baixo.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nenhum produto abaixo do mínimo.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {baixo.slice(0, 6).map((i) => (
                <li key={i.variant_id} className="flex justify-between">
                  <span>{i.product_name}</span>
                  <span className="font-medium text-red-600">{Number(i.stock_quantity)} un.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-brand-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  )
}

export function EmBreve({ titulo }: { titulo: string }) {
  return (
    <Card className="py-12 text-center">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      <p className="mt-1 text-sm text-muted">Próxima etapa do NEXO.</p>
    </Card>
  )
}
