import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { brl, supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Dica } from '../components/Tour'
import { Badge, Button, Card, Spinner } from '../components/ui'

type Venda = {
  id: string; number: number; status: 'completed' | 'canceled'; total: number; discount_total: number
  sold_at: string; seller_name: string | null; gross_profit: number | null
}
const PAGINA = 50

export default function Vendas() {
  const { current, canManage } = useStore()
  const nav = useNavigate()
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [temMais, setTemMais] = useState(false)

  const carregar = useCallback(async (offset: number) => {
    if (!current) return
    const { data } = await supabase.rpc('get_sales_stage33', { _store_id: current.id, _limit: PAGINA, _offset: offset })
    const lista = (data as Venda[]) ?? []
    setVendas((v) => (offset === 0 ? lista : [...v, ...lista]))
    setTemMais(lista.length === PAGINA)
    setLoading(false)
  }, [current])

  useEffect(() => { carregar(0) }, [carregar])

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <Dica id="vendas" titulo="Histórico de vendas" texto="Aqui ficam todas as vendas. Toque em uma para ver os detalhes, enviar o comprovante pelo WhatsApp ou cancelar." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted">Histórico das vendas da loja</p>
        </div>
        <Button onClick={() => nav('/vendas/nova')}>+ Nova venda</Button>
      </div>

      {vendas.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-medium">Nenhuma venda registrada ainda.</p>
          <Button className="mt-4" onClick={() => nav('/vendas/nova')}>Registrar a primeira venda</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-brand-100">
            {vendas.map((v) => (
              <li key={v.id}>
                <Link to={`/vendas/${v.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/50">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      Venda #{v.number}
                      {v.status === 'canceled' && <Badge tone="red">Cancelada</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(v.sold_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      {v.seller_name ? ` · ${v.seller_name}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${v.status === 'canceled' ? 'text-muted line-through' : ''}`}>{brl(v.total)}</div>
                    {canManage && v.status === 'completed' && v.gross_profit !== null && (
                      <div className="text-xs text-emerald-700">lucro {brl(v.gross_profit)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {temMais && (
            <div className="border-t border-brand-100 p-3 text-center">
              <Button variant="ghost" onClick={() => carregar(vendas.length)}>Carregar mais</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
