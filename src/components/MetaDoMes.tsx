import { useState, type FormEvent } from 'react'
import { brl, parseNum, supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { Alert, Button, Card, Field, Modal } from './ui'

/** Barra de progresso da meta de faturamento do mês, com quanto falta por dia. */
export default function MetaDoMes({ faturado, meta, onSalvo }: { faturado: number; meta: number | null; onSalvo: (m: number | null) => void }) {
  const [editar, setEditar] = useState(false)
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()
  const restantes = ultimo - agora.getDate() + 1

  if (!meta) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">🎯 Meta do mês</div>
          <div className="text-sm text-muted">Defina quanto quer vender no mês e acompanhe o quanto falta por dia.</div>
        </div>
        <Button variant="ghost" onClick={() => setEditar(true)}>Definir meta</Button>
        {editar && <EditarMeta atual={null} onClose={() => setEditar(false)} onSalvo={(m) => { setEditar(false); onSalvo(m) }} />}
      </Card>
    )
  }

  const p = Math.min(100, (faturado / meta) * 100)
  const falta = Math.max(0, meta - faturado)
  const bateu = falta === 0
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">🎯 Meta do mês: {brl(meta)}</div>
        <button onClick={() => setEditar(true)} className="text-sm text-brand-700 hover:underline">Mudar</button>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-brand-100">
        <div className={`h-full rounded-full transition-all duration-700 ${bateu ? 'bg-emerald-500' : 'bg-brand-600'}`} style={{ width: `${p}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
        <span className="text-muted">{brl(faturado)} vendidos · {p.toFixed(0)}%</span>
        <span className={bateu ? 'font-semibold text-emerald-700' : 'font-medium text-brand-900'}>
          {bateu ? 'Meta batida! 🎉' : `Faltam ${brl(falta)} · ${brl(falta / restantes)} por dia (${restantes} dia(s))`}
        </span>
      </div>
      {editar && <EditarMeta atual={meta} onClose={() => setEditar(false)} onSalvo={(m) => { setEditar(false); onSalvo(m) }} />}
    </Card>
  )
}

function EditarMeta({ atual, onClose, onSalvo }: { atual: number | null; onClose: () => void; onSalvo: (m: number | null) => void }) {
  const { current } = useStore()
  const toast = useToast()
  const [valor, setValor] = useState(atual ? String(atual).replace('.', ',') : '')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  async function salvar(e: FormEvent, limpar = false) {
    e.preventDefault(); setErro('')
    const v = limpar ? null : parseNum(valor)
    if (v !== null && (Number.isNaN(v) || v <= 0)) return setErro('Informe um valor maior que zero.')
    setLoading(true)
    const { error } = await supabase.rpc('update_monthly_goal', { _store_id: current!.id, _goal: v })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    toast(v ? 'Meta salva' : 'Meta removida')
    onSalvo(v)
  }
  return (
    <Modal title="Meta do mês" onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Quanto quer faturar por mês (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 15.000" autoFocus />
        <p className="text-xs text-muted">A meta vale para todos os meses até você mudar.</p>
        <div className="flex justify-between gap-2">
          {atual ? <Button type="button" variant="ghost" onClick={(e) => salvar(e as unknown as FormEvent, true)}>Remover meta</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Salvar</Button></div>
        </div>
      </form>
    </Modal>
  )
}
