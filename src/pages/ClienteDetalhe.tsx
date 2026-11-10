import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { METODOS, METODOS_RECEBIMENTO, brl, linkWhatsApp, parseNum, supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Alert, Badge, Button, Card, Field, Modal, Select, Spinner } from '../components/ui'
import { ClienteForm, atrasado, type Saldo } from './Fiado'
import { useToast } from '../lib/toast'

type Cliente = { id: string; name: string; phone: string | null; notes: string | null; active: boolean }
type Lanc = { kind: 'charge' | 'payment'; ref_id: string; sale_number: number | null; amount: number; method: string; note: string | null; happened_at: string; canceled: boolean }

export default function ClienteDetalhe() {
  const { id } = useParams()
  const { current } = useStore()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [saldo, setSaldo] = useState<Saldo | null>(null)
  const [extrato, setExtrato] = useState<Lanc[]>([])
  const [loading, setLoading] = useState(true)
  const [receber, setReceber] = useState(false)
  const [editar, setEditar] = useState(false)
  const toast = useToast()

  const carregar = useCallback(async () => {
    if (!id || !current) return
    const [c, s, e] = await Promise.all([
      supabase.from('customers').select('id, name, phone, notes, active').eq('id', id).eq('store_id', current.id).maybeSingle(),
      supabase.rpc('get_customer_balances', { _store_id: current.id }),
      supabase.rpc('get_customer_statement', { _customer_id: id }),
    ])
    setCliente(c.data)
    setSaldo(((s.data as Saldo[]) ?? []).find((x) => x.customer_id === id) ?? null)
    setExtrato((e.data as Lanc[]) ?? [])
    setLoading(false)
  }, [id, current])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <Spinner />
  if (!cliente) return <Card className="py-12 text-center"><p>Cliente não encontrado.</p><Link to="/fiado" className="mt-3 inline-block text-sm text-brand-700 hover:underline">Voltar</Link></Card>

  const devendo = Number(saldo?.balance ?? 0)
  const venc = saldo?.due_at ? new Date(saldo.due_at).toLocaleDateString('pt-BR') : null
  const msg = `Olá, ${cliente.name.split(' ')[0]}! Tudo bem? Passando para lembrar do seu saldo de ${brl(devendo)} na ${current?.name}${venc ? `, com vencimento em ${venc}` : ''}. Qualquer dúvida, é só chamar. Obrigado!`

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/fiado" className="text-sm text-brand-700 hover:underline">← Fiado</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">{cliente.name}{!cliente.active && <Badge tone="gray">Inativo</Badge>}</h1>
          <p className="text-sm text-muted">{cliente.phone ?? 'Sem telefone'}{cliente.notes ? ` · ${cliente.notes}` : ''}</p>
        </div>
        <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted">{devendo < 0 ? 'Crédito do cliente' : 'Saldo devedor'}</div>
            <div className={`mt-1 text-3xl font-semibold ${saldo && atrasado(saldo) ? 'text-red-600' : 'text-brand-900'}`}>{brl(Math.abs(devendo))}</div>
            {devendo > 0 && venc && <div className={`mt-1 text-sm ${saldo && atrasado(saldo) ? 'font-medium text-red-600' : 'text-muted'}`}>{saldo && atrasado(saldo) ? 'Atrasado desde' : 'Vence em'} {venc}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {devendo > 0 && cliente.phone && (
              <a href={linkWhatsApp(cliente.phone, msg)} target="_blank" rel="noreferrer"
                className="rounded-xl border border-brand-200 px-4 py-2.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Cobrar no WhatsApp</a>
            )}
            {devendo > 0 && <Button onClick={() => setReceber(true)}>Registrar pagamento</Button>}
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <h2 className="px-4 py-3 font-semibold">Extrato</h2>
        {extrato.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Nenhuma compra fiado ainda. Na tela de venda, escolha a forma de pagamento “Fiado” e este cliente.</p> : (
          <ul className="divide-y divide-brand-100 text-sm">
            {extrato.map((l) => (
              <li key={l.kind + l.ref_id} className={`flex justify-between gap-3 px-4 py-2.5 ${l.canceled ? 'opacity-50' : ''}`}>
                <div>
                  {l.kind === 'charge'
                    ? <Link to={`/vendas/${l.ref_id}`} className="font-medium hover:underline">Compra · venda #{l.sale_number}</Link>
                    : <span className="font-medium">Pagamento · {METODOS[l.method] ?? l.method}</span>}
                  {l.canceled && <Badge tone="gray">Cancelada</Badge>}
                  <div className="text-xs text-muted">{new Date(l.happened_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{l.note ? ` · ${l.note}` : ''}</div>
                </div>
                <div className={`font-medium ${l.kind === 'payment' ? 'text-emerald-700' : ''} ${l.canceled ? 'line-through' : ''}`}>{l.kind === 'payment' ? '−' : '+'} {brl(l.amount)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {receber && <Receber customerId={cliente.id} saldo={devendo} onClose={() => setReceber(false)}
        onDone={(v) => { setReceber(false); toast(`Pagamento de ${brl(v)} registrado`); carregar() }} />}
      {editar && current && <ClienteForm storeId={current.id} cliente={cliente} onClose={() => setEditar(false)} onSaved={() => { setEditar(false); toast('Cliente atualizado'); carregar() }} />}
    </div>
  )
}

function Receber({ customerId, saldo, onClose, onDone }: { customerId: string; saldo: number; onClose: () => void; onDone: (v: number) => void }) {
  const [valor, setValor] = useState(saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
  const [metodo, setMetodo] = useState<string>('pix')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [chave] = useState(() => crypto.randomUUID())

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = Math.round(parseNum(valor) * 100) / 100
    if (!(v > 0)) return setErro('Informe um valor válido.')
    if (v > saldo) return setErro(`O valor passa da dívida (${brl(saldo)}).`)
    setLoading(true)
    const { error } = await supabase.rpc('receive_customer_payment', { _customer_id: customerId, _amount: v, _method: metodo, _idempotency_key: chave, _note: obs || null })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onDone(v)
  }

  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Dívida atual: <strong className="text-ink">{brl(saldo)}</strong>. Pode ser pagamento parcial.</p>
        <Field label="Valor recebido (R$)" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} />
        <Select label="Forma de pagamento" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS_RECEBIMENTO.map((m) => <option key={m} value={m}>{METODOS[m]}</option>)}
        </Select>
        <Field label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Registrar</Button></div>
      </form>
    </Modal>
  )
}
