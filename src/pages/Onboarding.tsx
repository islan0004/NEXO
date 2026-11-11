import { useState, type ReactNode } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { usePerfil } from '../lib/perfil'
import { useAuth } from '../lib/auth'
import { aplicarTema, type Tema } from '../lib/temas'
import TemaPicker from '../components/TemaPicker'
import { Alert, Button, Field, Logo } from '../components/ui'

export const SEGMENTOS = [
  { id: 'semijoias', label: 'Semijoias e acessórios', icone: '💍' },
  { id: 'roupas', label: 'Roupas e moda', icone: '👕' },
  { id: 'calcados', label: 'Calçados', icone: '👟' },
  { id: 'cosmeticos', label: 'Cosméticos e perfumaria', icone: '💄' },
  { id: 'variedades', label: 'Variedades e presentes', icone: '🎁' },
  { id: 'alimentos', label: 'Alimentos e bebidas', icone: '🥤' },
  { id: 'outro', label: 'Outro', icone: '🏪' },
]
const FATURAMENTO = ['Até R$ 5 mil', 'R$ 5 mil a R$ 15 mil', 'R$ 15 mil a R$ 30 mil', 'R$ 30 mil a R$ 60 mil', 'Acima de R$ 60 mil', 'Prefiro não dizer']
const CONTROLE = ['Caderno ou bloco de notas', 'Planilha (Excel, Google)', 'Outro sistema', 'De cabeça, sem anotar']
const FIADO = ['Sim, bastante', 'Às vezes', 'Não vendo fiado']
const OBJETIVOS = ['Saber meu lucro de verdade', 'Controlar o estoque', 'Organizar o fiado', 'Vender mais rápido no balcão', 'Ver relatórios do mês']
const EQUIPE = ['Só eu', '2 a 3 pessoas', '4 ou mais']

type Respostas = { segmento: string; faturamento: string; controle: string; fiado: string; objetivos: string[]; equipe: string }

export default function Onboarding() {
  const { current, reload } = useStore()
  const { perfil, reload: reloadPerfil, setTema } = usePerfil()
  const { session } = useAuth()
  const [passo, setPasso] = useState(0) // 0..4 quiz, 5 tema
  const [nome, setNome] = useState(perfil?.full_name ?? (session?.user.user_metadata?.full_name as string) ?? '')
  const [loja, setLoja] = useState(current?.name ?? '')
  const [r, setR] = useState<Respostas>({ segmento: '', faturamento: '', controle: '', fiado: '', objetivos: [], equipe: '' })
  const [tema, setTemaLocal] = useState<Tema>(perfil?.theme ?? 'nexo')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const podeAvancar = [
    nome.trim().length > 0 && loja.trim().length > 0,
    !!r.segmento,
    !!r.faturamento,
    !!r.controle && !!r.fiado,
    r.objetivos.length > 0 && !!r.equipe,
    true,
  ][passo]

  async function concluir() {
    setErro(''); setSalvando(true)
    const { error } = await supabase.rpc('complete_onboarding', {
      _store_id: current?.id ?? null, _store_name: loja, _owner_name: nome, _answers: r,
    })
    if (error) { setSalvando(false); return setErro(traduzErro(error)) }
    await setTema(tema)
    await Promise.all([reload(), reloadPerfil()])
    setSalvando(false)
  }

  const escolha = (campo: keyof Respostas, valor: string) => setR((x) => ({ ...x, [campo]: valor }))
  const alternar = (valor: string) => setR((x) => ({ ...x, objetivos: x.objetivos.includes(valor) ? x.objetivos.filter((o) => o !== valor) : [...x.objetivos, valor] }))
  const primeiroNome = nome.trim().split(' ')[0]

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-brand-100 to-white px-4 py-6">
      <div className="mx-auto w-full max-w-lg flex-1">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="text-sm text-muted">{passo < 5 ? `Passo ${passo + 1} de 5` : 'Último toque'}</span>
        </div>
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-brand-100">
          <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${((passo + 1) / 6) * 100}%` }} />
        </div>

        <div key={passo} className="nexo-step rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
          {passo === 0 && (
            <Passo titulo="Bem-vindo ao NEXO! 👋" sub="Vamos deixar tudo do jeito da sua loja. Leva menos de 1 minuto.">
              <div className="space-y-4">
                <Field label="Seu nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
                <Field label="Nome da loja" value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="Ex.: Brilho Semijoias" />
              </div>
            </Passo>
          )}
          {passo === 1 && (
            <Passo titulo={`${primeiroNome ? `${primeiroNome}, o` : 'O'} que a sua loja vende?`} sub="Assim já deixamos o cadastro de produtos no jeito certo.">
              <div className="grid grid-cols-2 gap-2">
                {SEGMENTOS.map((s) => (
                  <Opcao key={s.id} ativo={r.segmento === s.id} onClick={() => escolha('segmento', s.id)}><span className="text-xl">{s.icone}</span><span>{s.label}</span></Opcao>
                ))}
              </div>
            </Passo>
          )}
          {passo === 2 && (
            <Passo titulo="Quanto a loja fatura por mês, mais ou menos?" sub="É só uma estimativa. Ninguém além de você vê isso na loja.">
              <div className="space-y-2">{FATURAMENTO.map((f) => <Opcao key={f} ativo={r.faturamento === f} onClick={() => escolha('faturamento', f)}>{f}</Opcao>)}</div>
            </Passo>
          )}
          {passo === 3 && (
            <Passo titulo="Como você controla as vendas hoje?">
              <div className="space-y-2">{CONTROLE.map((c) => <Opcao key={c} ativo={r.controle === c} onClick={() => escolha('controle', c)}>{c}</Opcao>)}</div>
              <p className="mb-2 mt-5 font-medium">Você vende fiado?</p>
              <div className="grid grid-cols-3 gap-2">{FIADO.map((f) => <Opcao key={f} ativo={r.fiado === f} onClick={() => escolha('fiado', f)} centro>{f}</Opcao>)}</div>
            </Passo>
          )}
          {passo === 4 && (
            <Passo titulo="O que você mais quer resolver?" sub="Pode marcar mais de um.">
              <div className="space-y-2">{OBJETIVOS.map((o) => <Opcao key={o} ativo={r.objetivos.includes(o)} onClick={() => alternar(o)} check>{o}</Opcao>)}</div>
              <p className="mb-2 mt-5 font-medium">Quantas pessoas vendem na loja?</p>
              <div className="grid grid-cols-3 gap-2">{EQUIPE.map((e) => <Opcao key={e} ativo={r.equipe === e} onClick={() => escolha('equipe', e)} centro>{e}</Opcao>)}</div>
            </Passo>
          )}
          {passo === 5 && (
            <Passo titulo="Escolha a cara do seu NEXO" sub="Dá para trocar depois, quando quiser.">
              <TemaPicker value={tema} onChange={(t) => { setTemaLocal(t); aplicarTema(t) }} />
            </Passo>
          )}

          {erro && <div className="mt-4"><Alert>{erro}</Alert></div>}

          <div className="mt-6 flex items-center justify-between gap-3">
            {passo > 0 ? <Button variant="ghost" onClick={() => setPasso((p) => p - 1)}>Voltar</Button> : <span />}
            {passo < 5
              ? <Button onClick={() => setPasso((p) => p + 1)} disabled={!podeAvancar}>Continuar</Button>
              : <Button onClick={concluir} loading={salvando}>Entrar no NEXO →</Button>}
          </div>
        </div>
        {passo === 0 && (
          <button onClick={() => supabase.auth.signOut()} className="mt-4 block w-full text-center text-sm text-muted hover:underline">Sair</button>
        )}
      </div>
    </div>
  )
}

function Passo({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

function Opcao({ ativo, onClick, children, centro, check }: { ativo: boolean; onClick: () => void; children: ReactNode; centro?: boolean; check?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition active:scale-[.98] ${centro ? 'justify-center text-center' : 'text-left'} ${ativo ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-brand-100 hover:border-brand-300'}`}>
      {check && <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs ${ativo ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-200'}`}>{ativo ? '✓' : ''}</span>}
      {children}
    </button>
  )
}
