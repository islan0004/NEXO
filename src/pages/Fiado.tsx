import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { brl, supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Alert, Badge, Button, Card, Field, Modal, Spinner } from '../components/ui'

export type Saldo = {
  customer_id: string; name: string; phone: string | null; active: boolean
  charged: number; paid: number; balance: number; oldest_open_at: string | null; due_at: string | null
}

export const atrasado = (s: { balance: number; due_at: string | null }) => Number(s.balance) > 0 && !!s.due_at && new Date(s.due_at) < new Date()

export default function Fiado() {
  const { current } = useStore()
  const nav = useNavigate()
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'aberto' | 'atrasado' | 'todos'>('aberto')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    if (!current) return
    const { data } = await supabase.rpc('get_customer_balances', { _store_id: current.id })
    setSaldos((data as Saldo[]) ?? [])
    setLoading(false)
  }, [current])

  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return saldos
      .filter((s) => filtro === 'todos' ? s.active || Number(s.balance) !== 0 : filtro === 'atrasado' ? atrasado(s) : Number(s.balance) > 0)
      .filter((s) => !t || s.name.toLowerCase().includes(t) || s.phone?.includes(t))
  }, [saldos, filtro, busca])

  const total = saldos.reduce((a, s) => a + Math.max(Number(s.balance), 0), 0)
  const totalAtraso = saldos.filter(atrasado).reduce((a, s) => a + Number(s.balance), 0)

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fiado</h1>
          <p className="text-sm text-muted">Clientes, contas a receber e pagamentos</p>
        </div>
        <Button onClick={() => setNovo(true)}>+ Novo cliente</Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><div className="text-sm text-muted">A receber</div><div className="mt-1 text-xl font-semibold text-brand-900">{brl(total)}</div></Card>
        <Card><div className="text-sm text-muted">Em atraso</div><div className={`mt-1 text-xl font-semibold ${totalAtraso > 0 ? 'text-red-600' : 'text-brand-900'}`}>{brl(totalAtraso)}</div></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente"
          className="min-w-[200px] flex-1 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
        <div className="flex rounded-xl bg-brand-50 p-1 text-sm">
          {([['aberto', 'Em aberto'], ['atrasado', 'Atrasados'], ['todos', 'Todos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`rounded-lg px-3 py-1.5 font-medium ${filtro === k ? 'bg-white text-brand-800 shadow-sm' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted">
          {saldos.length === 0 ? 'Nenhum cliente cadastrado. Cadastre aqui ou na hora da venda.' : filtro === 'atrasado' ? 'Nenhum cliente em atraso.' : filtro === 'aberto' ? 'Ninguém está devendo.' : 'Nenhum cliente encontrado.'}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-brand-100">
            {lista.map((s) => (
              <li key={s.customer_id}>
                <button onClick={() => nav(`/fiado/${s.customer_id}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50/50">
                  <div>
                    <div className="flex items-center gap-2 font-medium">{s.name}{atrasado(s) && <Badge tone="red">Atrasado</Badge>}{!s.active && <Badge tone="gray">Inativo</Badge>}</div>
                    <div className="text-xs text-muted">
                      {s.phone ?? 'Sem telefone'}
                      {Number(s.balance) > 0 && s.due_at && ` · vence ${new Date(s.due_at).toLocaleDateString('pt-BR')}`}
                    </div>
                  </div>
                  <div className={`font-semibold ${Number(s.balance) > 0 ? (atrasado(s) ? 'text-red-600' : 'text-ink') : 'text-muted'}`}>
                    {Number(s.balance) < 0 ? `crédito ${brl(-s.balance)}` : brl(s.balance)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {novo && current && <ClienteForm storeId={current.id} onClose={() => setNovo(false)} onSaved={(id) => { setNovo(false); nav(`/fiado/${id}`) }} />}
    </div>
  )
}

export function ClienteForm({ storeId, cliente, onClose, onSaved }: {
  storeId: string
  cliente?: { id: string; name: string; phone: string | null; notes: string | null; active: boolean }
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [nome, setNome] = useState(cliente?.name ?? '')
  const [tel, setTel] = useState(cliente?.phone ?? '')
  const [obs, setObs] = useState(cliente?.notes ?? '')
  const [ativo, setAtivo] = useState(cliente?.active ?? true)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (!nome.trim()) return setErro('Informe o nome.')
    setLoading(true)
    const dados = { name: nome.trim(), phone: tel.trim() || null, notes: obs.trim() || null, active: ativo }
    const res = cliente
      ? await supabase.from('customers').update(dados).eq('id', cliente.id).select('id').single()
      : await supabase.from('customers').insert({ ...dados, store_id: storeId }).select('id').single()
    setLoading(false)
    if (res.error) return setErro(traduzErro(res.error))
    onSaved(res.data.id)
  }

  return (
    <Modal title={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Field label="WhatsApp com DDD" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(82) 99999-0000" />
        <Field label="Observações" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: paga todo dia 10" />
        {cliente && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Cliente ativo (pode comprar fiado)</label>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
      </form>
    </Modal>
  )
}
