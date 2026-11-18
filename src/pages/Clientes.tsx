import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { brl, parseNum, supabase, traduzErro } from '../lib/supabase'
import { abrirWhatsApp } from '../lib/mensagens'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { Alert, Button, Card, Field, Spinner } from '../components/ui'
import Bloqueado from '../components/Bloqueado'

type Sumido = { id: string; name: string; phone: string | null; last_sale: string; days: number; purchases: number; total: number }
type Aniv = { id: string; name: string; phone: string | null; day: number; today: boolean }
type Insights = { sumidos: Sumido[]; aniversariantes: Aniv[] }
export type Fidelidade = { enabled: boolean; every: number; min_value: number; reward: string }

const PRAZOS = [30, 45, 60, 90]

export default function Clientes() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted">Quem faz aniversário, quem sumiu e o cartão fidelidade: motivos para chamar no WhatsApp e vender de novo</p>
      </div>
      <Bloqueado recurso="clientes" titulo="Clientes que voltam a comprar"
        texto="Veja os aniversariantes do mês, quem não compra há um tempo e dê um cartão fidelidade digital. Tudo com mensagem pronta no WhatsApp.">
        <Conteudo />
      </Bloqueado>
    </div>
  )
}

function Conteudo() {
  const { current, canManage } = useStore()
  const [dias, setDias] = useState(45)
  const [dados, setDados] = useState<Insights | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!current) return
    const { data, error } = await supabase.rpc('get_customer_insights', { _store_id: current.id, _days: dias })
    if (error) return setErro(traduzErro(error))
    setDados(data as Insights)
  }, [current, dias])
  useEffect(() => { carregar() }, [carregar])

  if (erro) return <Alert>{erro}</Alert>
  if (!dados) return <Spinner />
  const loja = current?.name ?? ''
  const primeiro = (n: string) => n.trim().split(' ')[0]

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="font-semibold">🎂 Aniversariantes do mês</h2>
        {dados.aniversariantes.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Ninguém com aniversário este mês. Para aparecer aqui, coloque a data no cadastro do cliente (em Fiado, abra o cliente e toque em Editar).</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-100 text-sm">
            {dados.aniversariantes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/fiado/${a.id}`} className="hover:underline">
                  <span className="font-medium">{a.name}</span>
                  <span className={a.today ? 'ml-2 font-semibold text-emerald-700' : 'ml-2 text-muted'}>{a.today ? 'é hoje!' : `dia ${a.day}`}</span>
                </Link>
                {a.phone && (
                  <a href={abrirWhatsApp(`Feliz aniversário, ${primeiro(a.name)}! 🎉 A equipe da ${loja} deseja um dia lindo. Passa aqui esta semana que tem um mimo esperando por você!`, a.phone)}
                    target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50">Dar parabéns</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">👋 Clientes sumidos</h2>
          <div className="flex gap-1">
            {PRAZOS.map((p) => (
              <button key={p} onClick={() => setDias(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${dias === p ? 'bg-brand-700 text-white' : 'border border-brand-200 text-muted hover:bg-brand-50'}`}>{p} dias</button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">Já compraram e não voltam há mais de {dias} dias. Os que mais gastaram aparecem primeiro.</p>
        {dados.sumidos.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum cliente sumido. Só aparecem aqui clientes escolhidos na venda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-100 text-sm">
            {[...dados.sumidos].sort((a, b) => Number(b.total) - Number(a.total)).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/fiado/${c.id}`} className="min-w-0 hover:underline">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-muted">{c.days} dias sem comprar · {c.purchases} compra(s) · {brl(c.total)} no total</div>
                </Link>
                {c.phone && (
                  <a href={abrirWhatsApp(`Oi, ${primeiro(c.name)}! Tudo bem? Aqui é da ${loja}. Chegaram novidades que têm a sua cara. Quer que eu te mande umas fotos?`, c.phone)}
                    target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-50">Chamar</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && <ConfigFidelidade />}
    </div>
  )
}

function ConfigFidelidade() {
  const { current } = useStore()
  const toast = useToast()
  const [cfg, setCfg] = useState<Fidelidade | null>(null)
  const [ligado, setLigado] = useState(false)
  const [cada, setCada] = useState('10')
  const [minimo, setMinimo] = useState('')
  const [premio, setPremio] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!current) return
    supabase.from('store_settings').select('loyalty').eq('store_id', current.id).single().then(({ data }) => {
      const l = (data?.loyalty ?? { enabled: false, every: 10, min_value: 0, reward: '' }) as Fidelidade
      setCfg(l); setLigado(l.enabled); setCada(String(l.every)); setMinimo(Number(l.min_value) > 0 ? String(l.min_value).replace('.', ',') : ''); setPremio(l.reward)
    })
  }, [current])

  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro('')
    const n = parseInt(cada, 10)
    const m = minimo.trim() ? parseNum(minimo) : 0
    if (Number.isNaN(m) || m < 0) return setErro('Confira o valor mínimo.')
    setSalvando(true)
    const { error } = await supabase.rpc('update_loyalty', { _store_id: current!.id, _enabled: ligado, _every: n, _min_value: m, _reward: premio })
    setSalvando(false)
    if (error) return setErro(traduzErro(error))
    toast(ligado ? 'Cartão fidelidade ligado' : 'Cartão fidelidade desligado')
  }

  if (!cfg) return null
  return (
    <Card>
      <h2 className="font-semibold">⭐ Cartão fidelidade</h2>
      <p className="mt-1 text-xs text-muted">Cada venda com o cliente escolhido conta um selo. Quando completar, o NEXO avisa na venda e no cadastro do cliente.</p>
      <form onSubmit={salvar} className="mt-3 space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} /> Usar cartão fidelidade</label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compras para ganhar" inputMode="numeric" value={cada} onChange={(e) => setCada(e.target.value)} />
          <Field label="Valor mínimo da compra (R$)" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Qualquer valor" />
        </div>
        <Field label="Prêmio" value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ex.: 20% de desconto na próxima compra" />
        <Button type="submit" loading={salvando}>Salvar cartão</Button>
      </form>
    </Card>
  )
}

/** Mostra os selos do cliente e permite resgatar o prêmio. Some se o cartão estiver desligado. */
export function CartaoCliente({ customerId, compacto }: { customerId: string; compacto?: boolean }) {
  const toast = useToast()
  const [info, setInfo] = useState<{ enabled: boolean; count: number; every: number; reward: string; ready: boolean } | null>(null)
  const [resgatando, setResgatando] = useState(false)
  const carregar = useCallback(() => {
    supabase.rpc('get_loyalty', { _customer_id: customerId }).then(({ data }) => setInfo(data as typeof info))
  }, [customerId])
  useEffect(() => { carregar() }, [carregar])

  if (!info?.enabled) return null
  const feitos = Math.min(info.count, info.every)
  async function resgatar() {
    setResgatando(true)
    const { error } = await supabase.rpc('redeem_loyalty', { _customer_id: customerId })
    setResgatando(false)
    if (error) return toast(traduzErro(error), 'erro')
    toast('Prêmio entregue. O cartão recomeçou.')
    carregar()
  }

  return (
    <Card className={compacto ? 'p-3' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">⭐ Cartão fidelidade · {feitos}/{info.every}</div>
          <div className="text-xs text-muted">{info.ready ? `Completou! Prêmio: ${info.reward}` : `Faltam ${info.every - feitos} compra(s) para: ${info.reward}`}</div>
        </div>
        {info.ready && <Button onClick={resgatar} loading={resgatando}>Entregar prêmio</Button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: info.every }).map((_, i) => (
          <span key={i} className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < feitos ? 'bg-brand-700 text-white' : 'border border-brand-200 text-brand-300'}`}>{i < feitos ? '★' : '·'}</span>
        ))}
      </div>
    </Card>
  )
}
