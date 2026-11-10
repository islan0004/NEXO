import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brl, labelVariant, pct, qtd, supabase, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { dataBR, periodo } from '../lib/periodo'
import { abrirWhatsApp, textoResumoDia } from '../lib/mensagens'
import { Card, Spinner } from '../components/ui'
import type { Relatorio } from './Relatorios'

type Receber = { total: number; overdue: number; customers_open: number; customers_overdue: number }
type Item = { variant_id: string; product_id: string; product_name: string; attributes: Attrs; stock_quantity: number; min_stock: number; active: boolean }

export default function Dashboard() {
  const { current, canManage } = useStore()
  const [mes, setMes] = useState<Relatorio | null>(null)
  const [dia, setDia] = useState<Relatorio | null>(null)
  const [receber, setReceber] = useState<Receber | null>(null)
  const [catalogo, setCatalogo] = useState<Item[]>([])
  const [recebidoHoje, setRecebidoHoje] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!current) return
    let alive = true
    setLoading(true)
    const m = periodo('mes'), h = periodo('hoje')
    const nada = Promise.resolve({ data: null })
    Promise.all([
      canManage ? supabase.rpc('get_sales_report', { _store_id: current.id, _from: m.de, _to: m.ate }) : nada,
      canManage ? supabase.rpc('get_sales_report', { _store_id: current.id, _from: h.de, _to: h.ate }) : nada,
      supabase.rpc('get_product_catalog', { _store_id: current.id }),
      supabase.rpc('get_receivables_summary', { _store_id: current.id }),
      supabase.from('customer_payments').select('amount').eq('store_id', current.id).gte('paid_at', new Date(`${h.de}T00:00:00-03:00`).toISOString()),
    ]).then(([rm, rh, c, r, cp]) => {
      setRecebidoHoje(((cp.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0))
      if (!alive) return
      setMes((rm.data as Relatorio) ?? null)
      setDia((rh.data as Relatorio) ?? null)
      setCatalogo(((c.data as Item[]) ?? []).filter((i) => i.active))
      setReceber((r.data as Receber) ?? null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [current, canManage])

  if (loading) return <Spinner />

  const baixo = catalogo.filter((i) => Number(i.stock_quantity) <= Number(i.min_stock))
  const produtos = new Set(catalogo.map((i) => i.product_id)).size
  const margem = mes && mes.revenue > 0 ? (mes.gross_profit / mes.revenue) * 100 : 0
  const resumo = () => textoResumoDia({
    loja: current?.name ?? '', data: dataBR(periodo('hoje').de),
    vendido: Number(dia?.revenue ?? 0), lucro: Number(dia?.gross_profit ?? 0), vendas: dia?.sales_count ?? 0,
    ticket: dia && dia.sales_count ? dia.revenue / dia.sales_count : 0, metodos: dia?.by_method ?? [],
    recebidoFiado: recebidoHoje, aReceber: Number(receber?.total ?? 0), atrasados: receber?.customers_overdue ?? 0,
    estoqueBaixo: baixo.map((i) => `${i.product_name}${Object.keys(i.attributes ?? {}).length ? ` (${labelVariant(i.attributes)})` : ''}: ${qtd(i.stock_quantity)} un.`),
  })

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
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Vendido hoje" value={brl(dia?.revenue)} hint={`${dia?.sales_count ?? 0} venda(s)`} />
            <Stat label="Faturamento do mês" value={brl(mes?.revenue)} hint={`${mes?.sales_count ?? 0} venda(s)`} />
            <Stat label="Lucro bruto do mês" value={brl(mes?.gross_profit)} hint={`Margem ${pct(margem)}`} green />
            <Stat label="Ticket médio do mês" value={brl(mes && mes.sales_count ? mes.revenue / mes.sales_count : 0)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={abrirWhatsApp(resumo())} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              Fechar o dia · enviar resumo no WhatsApp
            </a>
            <Link to="/relatorios" className="text-sm font-medium text-brand-700 hover:underline">Ver relatórios por período →</Link>
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Fiado a receber</h2>
          <div className="mt-1 text-xl font-semibold text-brand-900">{brl(receber?.total)}</div>
          <p className="mt-1 text-sm text-muted">{receber?.customers_open ?? 0} cliente(s) devendo
            {receber && receber.customers_overdue > 0 && <span className="text-red-600"> · {receber.customers_overdue} em atraso ({brl(receber.overdue)})</span>}</p>
          <Link to="/fiado" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Ver clientes →</Link>
        </Card>
        <Card>
          <h2 className="font-semibold">Produtos</h2>
          <p className="mt-1 text-sm text-muted">{produtos} produto(s) ativo(s){catalogo.length > produtos ? `, ${catalogo.length} itens contando variações` : ''}</p>
          <Link to="/produtos" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
            {catalogo.length === 0 ? 'Cadastrar o primeiro produto →' : 'Ver produtos →'}
          </Link>
        </Card>
        <Card>
          <h2 className="font-semibold">Estoque baixo</h2>
          {baixo.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nenhum produto abaixo do mínimo.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {baixo.slice(0, 6).map((i) => (
                <li key={i.variant_id}>
                  <Link to={canManage ? `/produtos/${i.product_id}` : '/produtos'} className="flex justify-between gap-2 hover:underline">
                    <span>{i.product_name}{Object.keys(i.attributes ?? {}).length > 0 && <span className="text-muted"> · {labelVariant(i.attributes)}</span>}</span>
                    <span className="whitespace-nowrap font-medium text-red-600">{qtd(i.stock_quantity)} un.</span>
                  </Link>
                </li>
              ))}
              {baixo.length > 6 && <li className="text-xs text-muted">e mais {baixo.length - 6}</li>}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, hint, green }: { label: string; value: string; hint?: string; green?: boolean }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${green ? 'text-emerald-700' : 'text-brand-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  )
}
