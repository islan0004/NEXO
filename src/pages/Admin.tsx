import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { brl, parseNum, supabase, traduzErro } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Alert, Badge, Button, Card, Field, Modal, Select, Spinner } from '../components/ui'

type Overview = {
  users: number; users_7d: number; stores: number; stores_30d: number; active_7d: number
  trial: number; trial_expired: number; paying: number; past_due: number; free: number; canceled: number
  mrr: number; received_month: number; received_total: number; gmv_30d: number; sales_30d: number
  settings: { default_trial_days: number; default_monthly_price: number | null }
}
type Status = 'trial' | 'active' | 'past_due' | 'canceled' | 'free'
type Loja = {
  store_id: string; store_name: string; owner_name: string | null; owner_email: string | null; created_at: string
  status: Status | null; trial_ends_at: string | null; current_period_end: string | null; monthly_price: number | null; notes: string | null
  members: number; products: number; sales_30d: number; gmv_30d: number; last_sale_at: string | null; last_payment_at: string | null; paid_total: number
}

const STATUS: Record<Status, string> = { trial: 'Em teste', active: 'Pagante', past_due: 'Atrasado', canceled: 'Cancelado', free: 'Cortesia' }
const PAGTO: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', transfer: 'Transferência', other: 'Outro' }

const dias = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null)
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const toInputDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
const fromInputDate = (d: string) => (d ? new Date(`${d}T23:59:00-03:00`).toISOString() : null)

/** Situação efetiva (teste vencido, mensalidade vencida) */
function situacao(l: Loja): { texto: string; tom: 'brand' | 'red' | 'gray' } {
  const s = l.status ?? 'trial'
  if (s === 'trial') {
    const d = dias(l.trial_ends_at)
    return d !== null && d < 0 ? { texto: 'Teste vencido', tom: 'red' } : { texto: `Teste · ${d ?? '?'} dia(s)`, tom: 'brand' }
  }
  if (s === 'active' && l.current_period_end && dias(l.current_period_end)! < 0) return { texto: 'Mensalidade vencida', tom: 'red' }
  return { texto: STATUS[s], tom: s === 'active' ? 'brand' : s === 'past_due' ? 'red' : 'gray' }
}

export default function Admin() {
  const toast = useToast()
  const [ov, setOv] = useState<Overview | null>(null)
  const [lojas, setLojas] = useState<Loja[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [editar, setEditar] = useState<Loja | null>(null)
  const [pagar, setPagar] = useState<Loja | null>(null)
  const [config, setConfig] = useState(false)

  const carregar = useCallback(async () => {
    const [o, l] = await Promise.all([supabase.rpc('admin_overview'), supabase.rpc('admin_stores')])
    if (o.error) setErro(o.error.message.includes('forbidden') ? 'Acesso restrito ao dono da plataforma.' : traduzErro(o.error))
    setOv(o.data as Overview)
    setLojas((l.data as Loja[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lojas.filter((l) => !t || l.store_name.toLowerCase().includes(t) || l.owner_name?.toLowerCase().includes(t) || l.owner_email?.toLowerCase().includes(t))
  }, [lojas, busca])

  if (loading) return <Spinner />
  if (erro || !ov) return <Alert>{erro || 'Não foi possível carregar.'}</Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin NEXO</h1>
          <p className="text-sm text-muted">Visão da plataforma: lojas, usuários e receita</p>
        </div>
        <Button variant="ghost" onClick={() => setConfig(true)}>Configurações</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Receita mensal (MRR)" valor={brl(ov.mrr)} dica={`${ov.paying} loja(s) pagante(s)`} verde />
        <Kpi label="Recebido no mês" valor={brl(ov.received_month)} dica={`Total recebido ${brl(ov.received_total)}`} />
        <Kpi label="Lojas" valor={String(ov.stores)} dica={`${ov.stores_30d} nova(s) em 30 dias`} />
        <Kpi label="Usuários" valor={String(ov.users)} dica={`${ov.users_7d} novo(s) em 7 dias`} />
        <Kpi label="Lojas ativas (7 dias)" valor={String(ov.active_7d)} dica="Com venda na última semana" />
        <Kpi label="Em teste" valor={String(ov.trial)} dica={ov.trial_expired ? `${ov.trial_expired} com teste vencido` : 'Nenhum teste vencido'} alerta={ov.trial_expired > 0} />
        <Kpi label="Atrasadas" valor={String(ov.past_due)} dica={`${ov.free} cortesia · ${ov.canceled} cancelada(s)`} alerta={ov.past_due > 0} />
        <Kpi label="Vendido pelas lojas (30 dias)" valor={brl(ov.gmv_30d)} dica={`${ov.sales_30d} venda(s) no sistema`} />
      </div>
      {ov.settings.default_monthly_price === null && (
        <p className="text-sm text-muted">Nenhum preço definido ainda. A receita começa a contar quando você registrar o primeiro pagamento ou definir o preço em Configurações.</p>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-semibold">Lojas ({lojas.length})</h2>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar loja ou dono"
            className="w-56 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Loja</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2 text-right font-medium">Mensalidade</th>
              <th className="px-4 py-2 text-right font-medium">Uso (30 dias)</th>
              <th className="px-4 py-2 font-medium">Última venda</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {lista.map((l) => {
              const s = situacao(l)
              return (
                <tr key={l.store_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.store_name}</div>
                    <div className="text-xs text-muted">{l.owner_name ?? '—'} · {l.owner_email ?? '—'}</div>
                    <div className="text-xs text-muted">desde {dt(l.created_at)}{l.notes ? ` · ${l.notes}` : ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.tom}>{s.texto}</Badge>
                    {l.status === 'active' && l.current_period_end && <div className="mt-1 text-xs text-muted">pago até {dt(l.current_period_end)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">{l.monthly_price !== null ? brl(l.monthly_price) : '—'}
                    {Number(l.paid_total) > 0 && <div className="text-xs text-muted">recebido {brl(l.paid_total)}</div>}</td>
                  <td className="px-4 py-3 text-right">{l.sales_30d} venda(s)<div className="text-xs text-muted">{brl(l.gmv_30d)} · {l.products} produto(s) · {l.members} usuário(s)</div></td>
                  <td className="px-4 py-3 text-muted">{l.last_sale_at ? dt(l.last_sale_at) : 'nunca'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className="text-brand-700 hover:underline" onClick={() => setPagar(l)}>Pagamento</button>
                    <button className="ml-3 text-brand-700 hover:underline" onClick={() => setEditar(l)}>Editar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {editar && <EditarAssinatura loja={editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); toast('Assinatura atualizada'); carregar() }} />}
      {pagar && <Pagamentos loja={pagar} precoPadrao={ov.settings.default_monthly_price} onClose={() => setPagar(null)} onSaved={() => { setPagar(null); toast('Pagamento registrado'); carregar() }} />}
      {config && <Configuracoes atual={ov.settings} onClose={() => setConfig(false)} onSaved={() => { setConfig(false); toast('Configurações salvas'); carregar() }} />}
    </div>
  )
}

function Kpi({ label, valor, dica, verde, alerta }: { label: string; valor: string; dica?: string; verde?: boolean; alerta?: boolean }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${verde ? 'text-emerald-700' : alerta ? 'text-red-600' : 'text-brand-900'}`}>{valor}</div>
      {dica && <div className="mt-0.5 text-xs text-muted">{dica}</div>}
    </Card>
  )
}

function EditarAssinatura({ loja, onClose, onSaved }: { loja: Loja; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Status>(loja.status ?? 'trial')
  const [fimTeste, setFimTeste] = useState(toInputDate(loja.trial_ends_at))
  const [pagoAte, setPagoAte] = useState(toInputDate(loja.current_period_end))
  const [preco, setPreco] = useState(loja.monthly_price !== null ? String(loja.monthly_price).replace('.', ',') : '')
  const [obs, setObs] = useState(loja.notes ?? '')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const p = preco.trim() ? parseNum(preco) : null
    if (p !== null && (Number.isNaN(p) || p < 0)) return setErro('Confira o preço.')
    setLoading(true)
    const { error } = await supabase.rpc('admin_update_subscription', {
      _store_id: loja.store_id, _status: status, _trial_ends_at: fromInputDate(fimTeste), _current_period_end: fromInputDate(pagoAte),
      _monthly_price: p, _notes: obs,
    })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title={`Assinatura · ${loja.store_name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Select label="Situação" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fim do teste" type="date" value={fimTeste} onChange={(e) => setFimTeste(e.target.value)} />
          <Field label="Pago até" type="date" value={pagoAte} onChange={(e) => setPagoAte(e.target.value)} />
        </div>
        <Field label="Mensalidade (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Ainda não definido" />
        <Field label="Observações" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: preço de fundador, piloto" />
        <p className="text-xs text-muted">Só lojas com situação “Pagante” entram na receita mensal (MRR).</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
      </form>
    </Modal>
  )
}

function Pagamentos({ loja, precoPadrao, onClose, onSaved }: { loja: Loja; precoPadrao: number | null; onClose: () => void; onSaved: () => void }) {
  const base = loja.monthly_price ?? precoPadrao
  const [valor, setValor] = useState(base !== null ? String(base).replace('.', ',') : '')
  const [meses, setMeses] = useState('1')
  const [metodo, setMetodo] = useState('pix')
  const [obs, setObs] = useState('')
  const [historico, setHistorico] = useState<{ id: string; amount: number; method: string; months: number; note: string | null; paid_at: string }[]>([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_store_payments', { _store_id: loja.store_id }).then(({ data }) => setHistorico((data as typeof historico) ?? []))
  }, [loja.store_id])

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = Math.round(parseNum(valor) * 100) / 100, m = parseInt(meses, 10)
    if (!(v > 0)) return setErro('Informe o valor recebido.')
    if (!(m >= 1 && m <= 24)) return setErro('Meses entre 1 e 24.')
    setLoading(true)
    const { error } = await supabase.rpc('admin_register_payment', { _store_id: loja.store_id, _amount: v, _method: metodo, _months: m, _note: obs })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title={`Pagamento · ${loja.store_name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Registrar o pagamento ativa a loja como pagante e estende o acesso pelo número de meses.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor recebido (R$)" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} />
          <Field label="Meses pagos" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value)} />
        </div>
        <Select label="Forma" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {Object.entries(PAGTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Field label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Registrar</Button></div>
      </form>
      {historico.length > 0 && (
        <div className="mt-5 border-t border-brand-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
          <ul className="space-y-1.5 text-sm">
            {historico.map((h) => (
              <li key={h.id} className="flex justify-between"><span className="text-muted">{dt(h.paid_at)} · {PAGTO[h.method] ?? h.method} · {h.months} mês(es){h.note ? ` · ${h.note}` : ''}</span><span className="font-medium">{brl(h.amount)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

function Configuracoes({ atual, onClose, onSaved }: { atual: Overview['settings']; onClose: () => void; onSaved: () => void }) {
  const [diasTeste, setDiasTeste] = useState(String(atual.default_trial_days))
  const [preco, setPreco] = useState(atual.default_monthly_price !== null ? String(atual.default_monthly_price).replace('.', ',') : '')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const d = parseInt(diasTeste, 10), p = preco.trim() ? parseNum(preco) : null
    if (!(d >= 0 && d <= 365)) return setErro('Dias de teste entre 0 e 365.')
    if (p !== null && (Number.isNaN(p) || p < 0)) return setErro('Confira o preço.')
    setLoading(true)
    const { error } = await supabase.rpc('admin_update_settings', { _default_trial_days: d, _default_monthly_price: p })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title="Configurações da plataforma" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Dias de teste para lojas novas" inputMode="numeric" value={diasTeste} onChange={(e) => setDiasTeste(e.target.value)} />
        <Field label="Mensalidade padrão (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Ainda não definido" />
        <p className="text-xs text-muted">Vale para lojas criadas daqui para frente. Lojas existentes você ajusta em “Editar”.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
      </form>
    </Modal>
  )
}
