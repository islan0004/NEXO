import { useEffect, useState } from 'react'
import { METODOS, brl, labelVariant, pct, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Dica } from '../components/Tour'
import { dataBR, periodo, type Atalho } from '../lib/periodo'
import { Alert, Card, Spinner, cellInput } from '../components/ui'

export type Relatorio = {
  revenue: number; cost: number; gross_profit: number; discounts: number
  sales_count: number; canceled_count: number; canceled_total: number
  by_day: { day: string; revenue: number; profit: number; sales: number }[]
  by_method: { method: string; total: number }[]
  top_products: { product_name: string; attributes: Attrs; qtd: number; receita: number; lucro: number }[]
}

const ATALHOS: [Atalho, string][] = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['mes_anterior', 'Mês passado'], ['30d', '30 dias']]

export default function Relatorios() {
  const { current, canManage } = useStore()
  const [atalho, setAtalho] = useState<Atalho | null>('mes')
  const [de, setDe] = useState(periodo('mes').de)
  const [ate, setAte] = useState(periodo('mes').ate)
  const [r, setR] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!current || !canManage || !de || !ate) return
    let vivo = true
    setLoading(true); setErro('')
    supabase.rpc('get_sales_report', { _store_id: current.id, _from: de, _to: ate }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setErro(error.message.includes('invalid_period') ? 'Período inválido (máximo de 2 anos).' : traduzErro(error))
      setR((data as Relatorio) ?? null)
      setLoading(false)
    })
    return () => { vivo = false }
  }, [current, canManage, de, ate])

  if (!canManage) return <Card className="py-12 text-center text-sm text-muted">Relatórios disponíveis para dono e gerente.</Card>

  const escolher = (a: Atalho) => { const p = periodo(a); setAtalho(a); setDe(p.de); setAte(p.ate) }
  const margem = r && r.revenue > 0 ? (r.gross_profit / r.revenue) * 100 : 0
  const ticket = r && r.sales_count > 0 ? r.revenue / r.sales_count : 0
  const maxDia = Math.max(1, ...(r?.by_day ?? []).map((d) => Number(d.revenue)))
  const totalMetodos = (r?.by_method ?? []).reduce((s, m) => s + Number(m.total), 0)

  return (
    <div className="space-y-5">
      <Dica id="relatorios" titulo="Relatórios" texto="Escolha o período nos atalhos ou nas datas. Você vê faturamento, lucro, ticket médio, os produtos que mais vendem e as formas de pagamento." />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted">Faturamento e lucro por período ({dataBR(de)} a {dataBR(ate)})</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-xl bg-brand-50 p-1 text-sm">
          {ATALHOS.map(([k, l]) => (
            <button key={k} onClick={() => escolher(k)} className={`rounded-lg px-3 py-1.5 font-medium ${atalho === k ? 'bg-white text-brand-800 shadow-sm' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" className={`${cellInput} w-auto`} value={de} max={ate} onChange={(e) => { setAtalho(null); setDe(e.target.value) }} />
          <span className="text-muted">até</span>
          <input type="date" className={`${cellInput} w-auto`} value={ate} min={de} onChange={(e) => { setAtalho(null); setAte(e.target.value) }} />
        </div>
      </div>

      {erro && <Alert>{erro}</Alert>}
      {loading || !r ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Faturamento" valor={brl(r.revenue)} dica={r.discounts > 0 ? `${brl(r.discounts)} em descontos` : undefined} />
            <Stat label="Lucro bruto" valor={brl(r.gross_profit)} dica={`Margem ${pct(margem)}`} destaque />
            <Stat label="Vendas" valor={String(r.sales_count)} dica={r.canceled_count > 0 ? `${r.canceled_count} cancelada(s)` : undefined} />
            <Stat label="Ticket médio" valor={brl(ticket)} />
          </div>

          {r.by_day.length > 1 && (
            <Card>
              <h2 className="mb-4 font-semibold">Faturamento por dia</h2>
              <div className="flex h-40 items-end gap-[2px]">
                {r.by_day.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${dataBR(d.day)}: ${brl(d.revenue)} · ${d.sales} venda(s)`}>
                    <div className="w-full rounded-t bg-brand-300 transition group-hover:bg-brand-600"
                      style={{ height: `${Math.max((Number(d.revenue) / maxDia) * 100, Number(d.revenue) > 0 ? 3 : 0)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted"><span>{dataBR(r.by_day[0].day)}</span><span>{dataBR(r.by_day[r.by_day.length - 1].day)}</span></div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card className="overflow-x-auto p-0">
              <h2 className="px-4 py-3 font-semibold">Produtos mais vendidos</h2>
              {r.top_products.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Nenhuma venda no período.</p> : (
                <table className="w-full text-sm">
                  <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-muted">
                    <tr><th className="px-4 py-2 font-medium">Produto</th><th className="px-4 py-2 text-right font-medium">Qtd</th><th className="px-4 py-2 text-right font-medium">Receita</th><th className="px-4 py-2 text-right font-medium">Lucro</th></tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {r.top_products.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5"><div className="font-medium">{p.product_name}</div>{Object.keys(p.attributes ?? {}).length > 0 && <div className="text-xs text-muted">{labelVariant(p.attributes)}</div>}</td>
                        <td className="px-4 py-2.5 text-right">{qtd(p.qtd)}</td>
                        <td className="px-4 py-2.5 text-right">{brl(p.receita)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">{brl(p.lucro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Formas de pagamento</h2>
              {r.by_method.length === 0 ? <p className="text-sm text-muted">Sem pagamentos no período.</p> : (
                <ul className="space-y-3 text-sm">
                  {r.by_method.map((m) => (
                    <li key={m.method}>
                      <div className="flex justify-between"><span>{METODOS[m.method] ?? m.method}</span><span className="font-medium">{brl(m.total)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(Number(m.total) / totalMetodos) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted">Vendas fiado entram no faturamento na data da venda.</p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, valor, dica, destaque }: { label: string; valor: string; dica?: string; destaque?: boolean }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${destaque ? 'text-emerald-700' : 'text-brand-900'}`}>{valor}</div>
      {dica && <div className="mt-0.5 text-xs text-muted">{dica}</div>}
    </Card>
  )
}
