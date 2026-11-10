import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { METODOS, brl, labelVariant, pct, qtd, supabase, traduzErro, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Alert, Badge, Button, Card, Field, Modal, Spinner } from '../components/ui'
import { abrirWhatsApp, textoComprovante } from '../lib/mensagens'
import { useToast } from '../lib/toast'

type Detalhe = {
  sale: { id: string; number: number; customer_id: string | null; status: string; total: number; subtotal: number; discount_total: number; sold_at: string }
  items: { id: string; product_name: string; attributes: Attrs; quantity: number; unit_price: number; line_total: number; unit_cost: number | null; line_cost: number | null }[]
  payments: { method: string; amount: number }[]
  cancellation: { created_at: string; reason: string | null; responsible_name: string | null } | null
  cost_total: number | null
  gross_profit: number | null
}

export default function VendaDetalhe() {
  const { id } = useParams()
  const { canManage, current } = useStore()
  const toast = useToast()
  const loc = useLocation()
  const nav = useNavigate()
  const nova = (loc.state as { nova?: boolean } | null)?.nova
  const [d, setD] = useState<Detalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelar, setCancelar] = useState(false)
  const [cliente, setCliente] = useState<{ id: string; name: string; phone: string | null } | null>(null)
  const [saldoFiado, setSaldoFiado] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('get_sale_stage33', { _sale_id: id })
    const det = (data as Detalhe) ?? null
    setD(det)
    if (det?.sale.customer_id) {
      const { data: c } = await supabase.from('customers').select('id, name, phone, store_id').eq('id', det.sale.customer_id).maybeSingle()
      setCliente(c)
      if (c) {
        const { data: b } = await supabase.rpc('get_customer_balances', { _store_id: c.store_id })
        const meu = ((b as { customer_id: string; balance: number }[]) ?? []).find((x) => x.customer_id === c.id)
        setSaldoFiado(meu ? Number(meu.balance) : null)
      }
    }
    setLoading(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <Spinner />
  if (!d) return <Card className="py-12 text-center"><p>Venda não encontrada.</p><Link to="/vendas" className="mt-3 inline-block text-sm text-brand-700 hover:underline">Voltar</Link></Card>

  const cancelada = d.sale.status === 'canceled'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/vendas" className="text-sm text-brand-700 hover:underline">← Vendas</Link>
      {nova && !cancelada && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <svg viewBox="0 0 24 24" className="nexo-check h-9 w-9 shrink-0 rounded-full bg-emerald-500 p-1.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <div className="text-sm"><div className="font-semibold text-emerald-800">Venda #{d.sale.number} registrada!</div><div className="text-emerald-700">O estoque já foi atualizado.</div></div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">Venda #{d.sale.number} {cancelada && <Badge tone="red">Cancelada</Badge>}</h1>
          <p className="text-sm text-muted">{new Date(d.sale.sold_at).toLocaleString('pt-BR')}
            {cliente && <> · Cliente: <Link to={`/fiado/${cliente.id}`} className="text-brand-700 hover:underline">{cliente.name}</Link></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!cancelada && (
            <a href={abrirWhatsApp(textoComprovante({
                loja: current?.name ?? '', numero: d.sale.number, data: d.sale.sold_at, cliente: cliente?.name,
                itens: d.items, subtotal: d.sale.subtotal, desconto: d.sale.discount_total, total: d.sale.total,
                pagamentos: d.payments, saldoFiado,
              }), cliente?.phone)}
              target="_blank" rel="noreferrer" onClick={() => toast('Abrindo o WhatsApp…')}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              Enviar comprovante
            </a>
          )}
          {nova && <Button onClick={() => nav('/vendas/nova')}>+ Nova venda</Button>}
          {canManage && !cancelada && <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setCancelar(true)}>Cancelar venda</Button>}
        </div>
      </div>

      {cancelada && d.cancellation && (
        <Alert>Cancelada em {new Date(d.cancellation.created_at).toLocaleString('pt-BR')}{d.cancellation.responsible_name ? ` por ${d.cancellation.responsible_name}` : ''}{d.cancellation.reason ? ` — ${d.cancellation.reason}` : ''}. Os itens voltaram para o estoque.</Alert>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-brand-100">
          {d.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{i.product_name}{Object.keys(i.attributes ?? {}).length ? <span className="font-normal text-muted"> · {labelVariant(i.attributes)}</span> : null}</div>
                <div className="text-xs text-muted">{qtd(i.quantity)} × {brl(i.unit_price)}{canManage && i.line_cost !== null ? ` · custo ${brl(i.line_cost)}` : ''}</div>
              </div>
              <div className="font-medium">{brl(i.line_total)}</div>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 border-t border-brand-100 px-4 py-3 text-sm">
          {d.sale.discount_total > 0 && <>
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{brl(d.sale.subtotal)}</span></div>
            <div className="flex justify-between text-muted"><span>Desconto</span><span>− {brl(d.sale.discount_total)}</span></div>
          </>}
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{brl(d.sale.total)}</span></div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Pagamento</h2>
          {d.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm"><span>{METODOS[p.method] ?? p.method}</span><span>{brl(p.amount)}</span></div>
          ))}
        </Card>
        {canManage && !cancelada && d.gross_profit !== null && (
          <Card>
            <h2 className="mb-2 font-semibold">Resultado</h2>
            <div className="flex justify-between text-sm"><span className="text-muted">Custo</span><span>{brl(d.cost_total)}</span></div>
            <div className="flex justify-between text-sm font-semibold text-emerald-700"><span>Lucro bruto</span><span>{brl(d.gross_profit)}</span></div>
            <div className="text-right text-xs text-muted">margem {pct(d.sale.total > 0 ? (d.gross_profit / d.sale.total) * 100 : 0)}</div>
          </Card>
        )}
      </div>

      {cancelar && <CancelarVenda saleId={d.sale.id} numero={d.sale.number} onClose={() => setCancelar(false)} onDone={() => { setCancelar(false); toast('Venda cancelada e itens devolvidos ao estoque'); nav(`/vendas/${id}`, { replace: true, state: {} }); carregar() }} />}
    </div>
  )
}

function CancelarVenda({ saleId, numero, onClose, onDone }: { saleId: string; numero: number; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [chave] = useState(() => crypto.randomUUID())

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true)
    const { error } = await supabase.rpc('cancel_sale', { _sale_id: saleId, _idempotency_key: chave, _confirmed: true, _reason: motivo.trim() || null })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onDone()
  }

  return (
    <Modal title={`Cancelar venda #${numero}?`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Os itens voltam para o estoque e a venda sai do faturamento. Isso não pode ser desfeito.</p>
        <Field label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu, troca" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" loading={loading} className="bg-red-600 hover:bg-red-700">Cancelar venda</Button>
        </div>
      </form>
    </Modal>
  )
}
