import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { brl, parseNum, supabase, traduzErro } from '../lib/supabase'
import { abrirWhatsApp } from '../lib/mensagens'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { Alert, Button, Card, Field, Modal, Spinner } from '../components/ui'

type Totais = { opening: number; cash_sales: number; fiado_received: number; cash_in: number; cash_out: number; refunds: number; expected: number }
type Mov = { id: string; kind: 'in' | 'out'; amount: number; note: string | null; created_at: string }
type Aberto = { id: string; opened_at: string; opening_amount: number; opened_by_name: string | null; totals: Totais; movements: Mov[] }
type Fechado = { id: string; opened_at: string; closed_at: string; opening_amount: number; expected_amount: number; counted_amount: number; notes: string | null; opened_by_name: string | null; closed_by_name: string | null }
type Caixa = { open: Aberto | null; history: Fechado[] }

const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaHora = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Caixa() {
  const { current } = useStore()
  const [cx, setCx] = useState<Caixa | null>(null)
  const [erro, setErro] = useState('')
  const [mov, setMov] = useState<'in' | 'out' | null>(null)
  const [fechar, setFechar] = useState(false)
  const [resultado, setResultado] = useState<(Totais & { counted: number; difference: number }) | null>(null)

  const carregar = useCallback(async () => {
    if (!current) return
    const { data, error } = await supabase.rpc('get_cash', { _store_id: current.id })
    if (error) return setErro(traduzErro(error))
    setCx(data as Caixa)
  }, [current])
  useEffect(() => { carregar() }, [carregar])

  if (erro) return <Alert>{erro}</Alert>
  if (!cx) return <Spinner />
  const a = cx.open

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Caixa do dia</h1>
        <p className="text-sm text-muted">Confira o dinheiro da gaveta: abre com o troco, fecha contando as notas</p>
      </div>

      {resultado && <ResultadoFechamento r={resultado} loja={current?.name ?? ''} onOk={() => setResultado(null)} />}

      {!a ? <AbrirCaixa onAberto={carregar} /> : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted">Deve ter na gaveta agora</div>
                <div className="mt-1 text-3xl font-semibold text-brand-900">{brl(a.totals.expected)}</div>
                <div className="mt-1 text-xs text-muted">Aberto às {hora(a.opened_at)}{a.opened_by_name ? ` por ${a.opened_by_name}` : ''}</div>
              </div>
              <Button onClick={() => setFechar(true)}>Fechar caixa</Button>
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-brand-100 pt-3 text-sm">
              <Linha label="Troco inicial" v={a.totals.opening} />
              <Linha label="Vendas em dinheiro" v={a.totals.cash_sales} mais />
              {Number(a.totals.fiado_received) > 0 && <Linha label="Fiado recebido em dinheiro" v={a.totals.fiado_received} mais />}
              {Number(a.totals.cash_in) > 0 && <Linha label="Reforços" v={a.totals.cash_in} mais />}
              {Number(a.totals.cash_out) > 0 && <Linha label="Retiradas (sangria)" v={a.totals.cash_out} menos />}
              {Number(a.totals.refunds) > 0 && <Linha label="Devoluções em dinheiro" v={a.totals.refunds} menos />}
            </ul>
            <p className="mt-3 text-xs text-muted">Pix e cartão não entram na gaveta, por isso não aparecem aqui.</p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => setMov('out')}>− Retirar dinheiro</Button>
            <Button variant="ghost" onClick={() => setMov('in')}>+ Colocar dinheiro</Button>
          </div>

          {a.movements.length > 0 && (
            <Card className="p-0">
              <h2 className="px-4 py-3 font-semibold">Movimentos de hoje</h2>
              <ul className="divide-y divide-brand-100 text-sm">
                {a.movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 px-4 py-2.5">
                    <span>{hora(m.created_at)} · {m.kind === 'out' ? 'Retirada' : 'Reforço'}{m.note ? ` · ${m.note}` : ''}</span>
                    <span className={m.kind === 'out' ? 'text-red-600' : 'text-emerald-700'}>{m.kind === 'out' ? '−' : '+'}{brl(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {mov && <Movimento tipo={mov} sessao={a.id} onClose={() => setMov(null)} onFeito={() => { setMov(null); carregar() }} />}
          {fechar && <Fechar sessao={a.id} esperado={a.totals.expected} onClose={() => setFechar(false)} onFechado={(r) => { setFechar(false); setResultado(r); carregar() }} />}
        </>
      )}

      {cx.history.length > 0 && (
        <Card className="p-0">
          <h2 className="px-4 py-3 font-semibold">Fechamentos anteriores</h2>
          <ul className="divide-y divide-brand-100 text-sm">
            {cx.history.map((h) => {
              const dif = Number(h.counted_amount) - Number(h.expected_amount)
              return (
                <li key={h.id} className="flex justify-between gap-3 px-4 py-2.5">
                  <div>
                    <div>{diaHora(h.opened_at)} → {hora(h.closed_at)}</div>
                    <div className="text-xs text-muted">{h.closed_by_name ?? ''}{h.notes ? ` · ${h.notes}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div>{brl(h.counted_amount)}</div>
                    <div className={`text-xs ${Math.abs(dif) < 0.005 ? 'text-emerald-700' : dif < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                      {Math.abs(dif) < 0.005 ? 'Bateu certinho' : dif < 0 ? `Faltou ${brl(-dif)}` : `Sobrou ${brl(dif)}`}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Linha({ label, v, mais, menos }: { label: string; v: number; mais?: boolean; menos?: boolean }) {
  return <li className="flex justify-between"><span className="text-muted">{mais ? '+ ' : menos ? '− ' : ''}{label}</span><span>{brl(v)}</span></li>
}

function AbrirCaixa({ onAberto }: { onAberto: () => void }) {
  const { current } = useStore()
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  async function abrir(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = parseNum(valor)
    if (Number.isNaN(v) || v < 0) return setErro('Informe quanto tem de troco na gaveta (pode ser 0).')
    setLoading(true)
    const { error } = await supabase.rpc('open_cash', { _store_id: current!.id, _amount: v })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    toast('Caixa aberto')
    onAberto()
  }
  return (
    <Card>
      <h2 className="font-semibold">Abrir o caixa</h2>
      <p className="mt-1 text-sm text-muted">Conte o troco que está na gaveta antes da primeira venda.</p>
      <form onSubmit={abrir} className="mt-3 space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Troco inicial (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        <Button type="submit" loading={loading} className="w-full">Abrir caixa</Button>
      </form>
    </Card>
  )
}

function Movimento({ tipo, sessao, onClose, onFeito }: { tipo: 'in' | 'out'; sessao: string; onClose: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = parseNum(valor)
    if (Number.isNaN(v) || v <= 0) return setErro('Informe o valor.')
    setLoading(true)
    const { error } = await supabase.rpc('cash_move', { _session_id: sessao, _kind: tipo, _amount: v, _note: obs })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onFeito()
  }
  return (
    <Modal title={tipo === 'out' ? 'Retirar dinheiro do caixa' : 'Colocar dinheiro no caixa'} onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        <Field label="Motivo (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} placeholder={tipo === 'out' ? 'Ex.: pagar o motoboy, depósito' : 'Ex.: mais troco'} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Confirmar</Button></div>
      </form>
    </Modal>
  )
}

function Fechar({ sessao, esperado, onClose, onFechado }: { sessao: string; esperado: number; onClose: () => void; onFechado: (r: Totais & { counted: number; difference: number }) => void }) {
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = parseNum(contado)
    if (!contado.trim() || Number.isNaN(v) || v < 0) return setErro('Conte o dinheiro da gaveta e informe o total.')
    setLoading(true)
    const { data, error } = await supabase.rpc('close_cash', { _session_id: sessao, _counted: v, _notes: obs })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onFechado(data as Totais & { counted: number; difference: number })
  }
  return (
    <Modal title="Fechar caixa" onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Conte as notas e moedas da gaveta sem olhar o valor esperado. O NEXO compara depois.</p>
        <Field label="Quanto tem na gaveta (R$)" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
        <Field label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
        <p className="text-xs text-muted">O esperado agora é {brl(esperado)}.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Fechar caixa</Button></div>
      </form>
    </Modal>
  )
}

function ResultadoFechamento({ r, loja, onOk }: { r: Totais & { counted: number; difference: number }; loja: string; onOk: () => void }) {
  const d = Number(r.difference)
  const ok = Math.abs(d) < 0.005
  const texto = `*Fechamento de caixa · ${loja}*\n${new Date().toLocaleString('pt-BR')}\n\nTroco inicial: ${brl(r.opening)}\nVendas em dinheiro: ${brl(r.cash_sales)}\nFiado recebido: ${brl(r.fiado_received)}\nReforços: ${brl(r.cash_in)}\nRetiradas: ${brl(r.cash_out)}\nDevoluções: ${brl(r.refunds)}\n\nEsperado: ${brl(r.expected)}\nContado: ${brl(r.counted)}\n${ok ? '✅ Bateu certinho' : d < 0 ? `⚠️ Faltou ${brl(-d)}` : `⚠️ Sobrou ${brl(d)}`}`
  return (
    <Card className={ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}>
      <div className="text-lg font-semibold">{ok ? '✅ Caixa fechado. Bateu certinho!' : d < 0 ? `⚠️ Caixa fechado. Faltou ${brl(-d)}` : `⚠️ Caixa fechado. Sobrou ${brl(d)}`}</div>
      <p className="mt-1 text-sm text-muted">Esperado {brl(r.expected)} · contado {brl(r.counted)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={abrirWhatsApp(texto)} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">Enviar no WhatsApp</a>
        <Button variant="ghost" onClick={onOk}>OK</Button>
      </div>
    </Card>
  )
}
