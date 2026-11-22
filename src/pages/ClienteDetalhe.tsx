import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { METODOS, METODOS_RECEBIMENTO, brl, linkWhatsApp, parseNum, supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Alert, Badge, Button, Card, Field, Modal, Select, Spinner } from '../components/ui'
import { ClienteForm, atrasado, type Saldo } from './Fiado'
import { useToast } from '../lib/toast'
import { CartaoCliente } from './Clientes'

type Cliente = { id: string; name: string; phone: string | null; notes: string | null; active: boolean; birthday: string | null }
type Lanc = { kind: 'charge' | 'payment' | 'opening'; ref_id: string; sale_number: number | null; amount: number; method: string; note: string | null; happened_at: string; canceled: boolean }

export default function ClienteDetalhe() {
  const { id } = useParams()
  const { current, canManage } = useStore()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [saldo, setSaldo] = useState<Saldo | null>(null)
  const [extrato, setExtrato] = useState<Lanc[]>([])
  const [loading, setLoading] = useState(true)
  const [receber, setReceber] = useState<false | 'parcial' | 'tudo'>(false)
  const [dividaAnt, setDividaAnt] = useState(false)
  const [excluir, setExcluir] = useState<Lanc | null>(null)
  const [editar, setEditar] = useState(false)
  const toast = useToast()

  const carregar = useCallback(async () => {
    if (!id || !current) return
    const [c, s, e] = await Promise.all([
      supabase.from('customers').select('id, name, phone, notes, active, birthday').eq('id', id).eq('store_id', current.id).maybeSingle(),
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
  const quitado = Number(saldo?.charged ?? 0) > 0

  const excluirDivida = (l: Lanc) => setExcluir(l)
  const venc = saldo?.due_at ? new Date(saldo.due_at).toLocaleDateString('pt-BR') : null
  const msg = `Olá, ${cliente.name.split(' ')[0]}! Tudo bem? Passando para lembrar do seu saldo de ${brl(devendo)} na ${current?.name}${venc ? `, com vencimento em ${venc}` : ''}. Qualquer dúvida, é só chamar. Obrigado!`

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/fiado" className="text-sm text-brand-700 hover:underline">← Fiado</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">{cliente.name}{!cliente.active && <Badge tone="gray">Inativo</Badge>}</h1>
          <p className="text-sm text-muted">{cliente.phone ?? 'Sem telefone'}{cliente.birthday ? ` · 🎂 ${Number(cliente.birthday.slice(8, 10))}/${cliente.birthday.slice(5, 7)}` : ''}{cliente.notes ? ` · ${cliente.notes}` : ''}</p>
        </div>
        <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>
      </div>

      <Card>
        {devendo === 0 && canManage ? (
          <button onClick={() => setDividaAnt(true)} className="group -m-2 block w-[calc(100%+1rem)] rounded-xl p-2 text-left transition hover:bg-brand-50 active:scale-[.99]">
            <div className="text-sm text-muted">Saldo devedor</div>
            <div className="mt-1 flex items-center gap-3">
              <span className={`text-3xl font-semibold ${quitado ? 'text-emerald-700' : 'text-brand-900'}`}>{brl(0)}</span>
              <span className="rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-sm font-medium text-brand-700 group-hover:border-brand-500">✎ Informar</span>
            </div>
            {quitado && <div className="mt-2"><Badge tone="green">✓ Quitado · não deve nada</Badge></div>}
            <div className="mt-2 text-sm text-muted">Toque aqui para informar quanto {cliente.name.split(' ')[0]} está devendo.</div>
          </button>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm text-muted">{devendo < 0 ? 'Crédito do cliente' : 'Saldo devedor'}</div>
              <div className={`mt-1 text-3xl font-semibold ${saldo && atrasado(saldo) ? 'text-red-600' : devendo === 0 && quitado ? 'text-emerald-700' : 'text-brand-900'}`}>{brl(Math.abs(devendo))}</div>
              {devendo === 0 && quitado && <div className="mt-1"><Badge tone="green">✓ Quitado · não deve nada</Badge></div>}
              {devendo > 0 && venc && <div className={`mt-1 text-sm ${saldo && atrasado(saldo) ? 'font-medium text-red-600' : 'text-muted'}`}>{saldo && atrasado(saldo) ? 'Atrasado desde' : 'Vence em'} {venc}</div>}
            </div>
            {devendo > 0 && (
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <Button onClick={() => setReceber('tudo')} className="col-span-2 py-3 text-base">✓ Pagou tudo · quitar</Button>
                <Button variant="ghost" className="border border-brand-200" onClick={() => setReceber('parcial')}>Pagou uma parte</Button>
                {cliente.phone
                  ? <a href={linkWhatsApp(cliente.phone, msg)} target="_blank" rel="noreferrer" className="rounded-xl border border-brand-200 px-4 py-2.5 text-center text-sm font-medium text-brand-800 hover:bg-brand-50">Cobrar no WhatsApp</a>
                  : <span />}
              </div>
            )}
          </div>
        )}
        {canManage && devendo !== 0 && (
          <div className="mt-4 border-t border-brand-100 pt-3">
            <button onClick={() => setDividaAnt(true)} className="text-sm font-medium text-brand-700 hover:underline">+ Somar outra dívida anterior (do caderno)</button>
          </div>
        )}
      </Card>

      <CartaoCliente customerId={cliente.id} />

      <Card className="p-0">
        <h2 className="px-4 py-3 font-semibold">Extrato</h2>
        {extrato.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Nenhuma compra fiado ainda. Na tela de venda, escolha a forma de pagamento “Fiado” e este cliente. Se ele já devia antes, use “Lançar dívida anterior”.</p> : (
          <ul className="divide-y divide-brand-100 text-sm">
            {extrato.map((l) => (
              <li key={l.kind + l.ref_id} className={`flex justify-between gap-3 px-4 py-2.5 ${l.canceled ? 'opacity-50' : ''}`}>
                <div>
                  {l.kind === 'charge'
                    ? <Link to={`/vendas/${l.ref_id}`} className="font-medium hover:underline">Compra · venda #{l.sale_number}</Link>
                    : l.kind === 'opening'
                    ? <span className="font-medium">Dívida anterior</span>
                    : <span className="font-medium">{l.method === 'Vale de devolução' ? `Vale de devolução · venda #${l.sale_number}` : `Pagamento · ${METODOS[l.method] ?? l.method}`}</span>}
                  {l.canceled && <Badge tone="gray">{l.kind === 'opening' ? 'Excluída' : 'Cancelada'}</Badge>}
                  {l.kind === 'opening' && !l.canceled && canManage && devendo >= Number(l.amount) && <button onClick={() => excluirDivida(l)} className="ml-2 text-xs text-red-600 hover:underline">Excluir</button>}
                  <div className="text-xs text-muted">{new Date(l.happened_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{l.note ? ` · ${l.note}` : ''}</div>
                </div>
                <div className={`shrink-0 whitespace-nowrap font-medium ${l.kind === 'payment' ? 'text-emerald-700' : ''} ${l.canceled ? 'line-through' : ''}`}>{l.kind === 'payment' ? '−' : '+'} {brl(l.amount)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {receber && <Receber customerId={cliente.id} saldo={devendo} tudo={receber === 'tudo'} onClose={() => setReceber(false)}
        onDone={(v, quitou) => { setReceber(false); toast(quitou ? `Pronto! ${cliente.name.split(' ')[0]} quitou tudo (${brl(v)})` : `Pagamento de ${brl(v)} registrado`); carregar() }} />}
      {excluir && <ExcluirDivida lanc={excluir} onClose={() => setExcluir(null)}
        onDone={() => { setExcluir(null); toast('Dívida anterior excluída'); carregar() }} />}
      {dividaAnt && <DividaAnterior customerId={cliente.id} onClose={() => setDividaAnt(false)}
        onDone={(v) => { setDividaAnt(false); toast(`Dívida anterior de ${brl(v)} lançada`); carregar() }} />}
      {editar && current && <ClienteForm storeId={current.id} cliente={cliente} onClose={() => setEditar(false)} onSaved={() => { setEditar(false); toast('Cliente atualizado'); carregar() }} />}
    </div>
  )
}

function Receber({ customerId, saldo, tudo, onClose, onDone }: { customerId: string; saldo: number; tudo: boolean; onClose: () => void; onDone: (v: number, quitou: boolean) => void }) {
  const [valor, setValor] = useState(tudo ? saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')
  const [metodo, setMetodo] = useState<string>('pix')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [chave] = useState(() => crypto.randomUUID())

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = tudo ? saldo : Math.round(parseNum(valor) * 100) / 100
    if (!(v > 0)) return setErro('Informe um valor válido.')
    if (v > saldo) return setErro(`O valor passa da dívida (${brl(saldo)}).`)
    setLoading(true)
    const { error } = await supabase.rpc('receive_customer_payment', { _customer_id: customerId, _amount: v, _method: metodo, _idempotency_key: chave, _note: obs || null })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onDone(v, Math.abs(v - saldo) < 0.005)
  }

  return (
    <Modal title={tudo ? 'Quitar a dívida toda' : 'Registrar pagamento de uma parte'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        {tudo ? (
          <div className="rounded-xl bg-emerald-50 p-4 text-center">
            <div className="text-sm text-emerald-800">O cliente pagou tudo</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">{brl(saldo)}</div>
            <div className="mt-1 text-xs text-emerald-800">O saldo fica zerado e o cliente aparece como quitado.</div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Dívida atual: <strong className="text-ink">{brl(saldo)}</strong>. Digite quanto ele pagou agora.</p>
            <Field label="Valor recebido (R$)" inputMode="decimal" required autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 50,00" />
          </>
        )}
        <Select label="Como ele pagou?" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS_RECEBIMENTO.map((m) => <option key={m} value={m}>{METODOS[m]}</option>)}
        </Select>
        <Field label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>{tudo ? `Confirmar ${brl(saldo)}` : 'Registrar'}</Button></div>
      </form>
    </Modal>
  )
}

function DividaAnterior({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: (v: number) => void }) {
  const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje)
  const [obs, setObs] = useState('Dívida anterior (caderno)')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [chave] = useState(() => crypto.randomUUID())

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = Math.round(parseNum(valor) * 100) / 100
    if (!(v > 0)) return setErro('Informe um valor válido.')
    if (data > hoje) return setErro('A data não pode ser no futuro.')
    setLoading(true)
    const { error } = await supabase.rpc('add_customer_opening_debt', { _customer_id: customerId, _amount: v, _idempotency_key: chave, _note: obs || null, _occurred_on: data || null })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onDone(v)
  }

  return (
    <Modal title="Quanto ele está devendo?" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Para o que o cliente já devia antes de usar o Komando, como o fiado do caderno. Entra no saldo e na cobrança, mas <strong className="text-ink">não conta como venda</strong> no faturamento, no lucro nem no caixa.</p>
        <Field label="Quanto ele deve? (R$)" inputMode="decimal" required autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 250,00" />
        <Field label="Desde quando? (data da compra)" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
        <Field label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Lançar</Button></div>
      </form>
    </Modal>
  )
}

function ExcluirDivida({ lanc, onClose, onDone }: { lanc: Lanc; onClose: () => void; onDone: () => void }) {
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  async function excluir() {
    setErro(''); setLoading(true)
    const { error } = await supabase.rpc('cancel_customer_opening_debt', { _id: lanc.ref_id })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onDone()
  }
  return (
    <Modal title="Excluir dívida anterior?" onClose={onClose}>
      <div className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">A dívida anterior de <strong className="text-ink">{brl(lanc.amount)}</strong> sai do saldo do cliente. Use isso só para corrigir um lançamento errado.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Voltar</Button><Button type="button" loading={loading} onClick={excluir} className="bg-red-600! hover:bg-red-700!">Excluir</Button></div>
      </div>
    </Modal>
  )
}
