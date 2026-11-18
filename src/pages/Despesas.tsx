import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { brl, parseNum, supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { hoje } from '../lib/periodo'
import { Dica } from '../components/Tour'
import Bloqueado from '../components/Bloqueado'
import { Alert, Button, Card, Field, Modal, Select, Spinner, cellInput } from '../components/ui'

type Despesa = { id: string; description: string; category: string | null; amount: number; spent_on: string }
const CATEGORIAS = ['Aluguel', 'Energia', 'Água', 'Internet e telefone', 'Funcionários', 'Fornecedores', 'Marketing', 'Impostos', 'Embalagens', 'Transporte', 'Outros']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const TAXAS: { k: string; l: string }[] = [{ k: 'debit_card', l: 'Débito' }, { k: 'credit_card', l: 'Crédito' }, { k: 'pix', l: 'Pix' }]

const fimDoMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
const mudaMes = (ym: string, d: number) => { const [y, m] = ym.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + d, 1)); return x.toISOString().slice(0, 7) }

export default function Despesas() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Despesas</h1>
        <p className="text-sm text-muted">Aluguel, contas e taxas: o que sai, para você ver o lucro de verdade</p>
      </div>
      <Bloqueado recurso="despesas" titulo="Despesas e lucro líquido"
        texto="Lance aluguel, contas e a taxa da maquininha, e veja quanto sobrou de verdade no mês.">
        <Dica id="despesas" titulo="Despesas" texto="Lance as contas do mês e configure a taxa da maquininha. Em Relatórios aparece o lucro líquido: o que sobrou de verdade." />
        <ConteudoDespesas />
      </Bloqueado>
    </div>
  )
}

function ConteudoDespesas() {
  const { current } = useStore()
  const toast = useToast()
  const [mes, setMes] = useState(hoje().slice(0, 7))
  const [lista, setLista] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const [nova, setNova] = useState(false)
  const [taxas, setTaxas] = useState<Record<string, string>>({})
  const [salvandoTaxas, setSalvandoTaxas] = useState(false)

  const carregar = useCallback(async () => {
    if (!current) return
    const { data } = await supabase.from('expenses').select('id, description, category, amount, spent_on')
      .eq('store_id', current.id).gte('spent_on', `${mes}-01`).lte('spent_on', fimDoMes(mes)).order('spent_on', { ascending: false })
    setLista((data as Despesa[]) ?? [])
    setLoading(false)
  }, [current, mes])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    if (!current) return
    supabase.from('store_settings').select('card_fees').eq('store_id', current.id).single().then(({ data }) => {
      const f = (data?.card_fees ?? {}) as Record<string, number>
      setTaxas(Object.fromEntries(TAXAS.map((t) => [t.k, f[t.k] ? String(f[t.k]).replace('.', ',') : ''])))
    })
  }, [current])

  async function salvarTaxas() {
    const fees: Record<string, number> = { cash: 0 }
    for (const t of TAXAS) {
      const v = taxas[t.k]?.trim() ? parseNum(taxas[t.k]) : 0
      if (Number.isNaN(v) || v < 0 || v > 30) return toast(`Confira a taxa do ${t.l}`, 'erro')
      fees[t.k] = v
    }
    setSalvandoTaxas(true)
    const { error } = await supabase.from('store_settings').update({ card_fees: fees }).eq('store_id', current!.id)
    setSalvandoTaxas(false)
    toast(error ? traduzErro(error) : 'Taxas salvas. Valem para as próximas vendas.', error ? 'erro' : 'ok')
  }

  async function repetirMesPassado() {
    const ant = mudaMes(mes, -1)
    const { data } = await supabase.from('expenses').select('description, category, amount, spent_on')
      .eq('store_id', current!.id).gte('spent_on', `${ant}-01`).lte('spent_on', fimDoMes(ant))
    const anteriores = (data as Despesa[]) ?? []
    if (!anteriores.length) return toast('O mês anterior não tem despesas.', 'erro')
    const ultimo = Number(fimDoMes(mes).slice(8))
    const novas = anteriores.map((d) => ({
      store_id: current!.id, description: d.description, category: d.category, amount: d.amount,
      spent_on: `${mes}-${String(Math.min(Number(d.spent_on.slice(8)), ultimo)).padStart(2, '0')}`,
    }))
    const { error } = await supabase.from('expenses').insert(novas)
    if (error) return toast(traduzErro(error), 'erro')
    toast(`${novas.length} despesa(s) copiada(s)`)
    carregar()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return toast(traduzErro(error), 'erro')
    toast('Despesa excluída'); carregar()
  }

  const total = lista.reduce((s, d) => s + Number(d.amount), 0)
  const [y, m] = mes.split('-').map(Number)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-50" onClick={() => setMes(mudaMes(mes, -1))} aria-label="Mês anterior">‹</button>
          <span className="min-w-36 text-center font-medium capitalize">{MESES[m - 1]} {y}</span>
          <button className="rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-50" onClick={() => setMes(mudaMes(mes, 1))} aria-label="Próximo mês">›</button>
        </div>
        <Button onClick={() => setNova(true)}>+ Nova despesa</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold">Total do mês: {brl(total)}</h2>
            {lista.length === 0 && <button className="text-sm text-brand-700 hover:underline" onClick={repetirMesPassado}>Repetir as do mês passado</button>}
          </div>
          {loading ? <Spinner /> : lista.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-muted">Nenhuma despesa neste mês.</p>
          ) : (
            <ul className="divide-y divide-brand-100 text-sm">
              {lista.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <div className="font-medium">{d.description}</div>
                    <div className="text-xs text-muted">{d.category ?? 'Outros'} · {d.spent_on.split('-').reverse().join('/')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{brl(d.amount)}</span>
                    <button className="text-muted hover:text-red-600" onClick={() => excluir(d.id)} aria-label="Excluir">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit space-y-3">
          <h2 className="font-semibold">Taxa da maquininha</h2>
          <p className="text-xs text-muted">Quanto a maquininha cobra em cada venda. O Komando desconta do lucro sozinho.</p>
          {TAXAS.map((t) => (
            <label key={t.k} className="flex items-center justify-between gap-3 text-sm">
              {t.l}
              <span className="flex items-center gap-1"><input className={`${cellInput} w-20 text-right`} inputMode="decimal" value={taxas[t.k] ?? ''}
                onChange={(e) => setTaxas((x) => ({ ...x, [t.k]: e.target.value }))} placeholder="0" /> %</span>
            </label>
          ))}
          <Button className="w-full" variant="ghost" loading={salvandoTaxas} onClick={salvarTaxas}>Salvar taxas</Button>
        </Card>
      </div>

      {nova && <NovaDespesa storeId={current!.id} onClose={() => setNova(false)} onSaved={() => { setNova(false); toast('Despesa lançada'); carregar() }} />}
    </div>
  )
}

function NovaDespesa({ storeId, onClose, onSaved }: { storeId: string; onClose: () => void; onSaved: () => void }) {
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('Aluguel')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje())
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    const v = Math.round(parseNum(valor) * 100) / 100
    if (!(v > 0)) return setErro('Informe o valor.')
    setLoading(true)
    const { error } = await supabase.from('expenses').insert({ store_id: storeId, description: descricao.trim() || categoria, category: categoria, amount: v, spent_on: data })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onSaved()
  }

  return (
    <Modal title="Nova despesa" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Select label="Tipo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" inputMode="decimal" required autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          <Field label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Field label="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: conta de luz de outubro" />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Lançar</Button></div>
      </form>
    </Modal>
  )
}
