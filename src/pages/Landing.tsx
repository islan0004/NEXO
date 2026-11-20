import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { brl, supabase } from '../lib/supabase'
import { PLANOS } from '../lib/planos'
import { abrirWhatsApp } from '../lib/mensagens'
import { Logo } from '../components/ui'
import { usarTemaDaMarca } from '../lib/temas'

type Precos = { start: number; pro: number; black: number; trial_days: number; whatsapp: string | null }

const RECURSOS: { icone: string; titulo: string; texto: string; plano?: string }[] = [
  { icone: '⚡', titulo: 'Venda em segundos', texto: 'Escolha o produto ou digite só o valor. Pix, dinheiro, cartão ou fiado, com troco calculado.' },
  { icone: '📦', titulo: 'Estoque que bate', texto: 'Cada venda baixa o estoque sozinha. Você recebe aviso quando um produto está acabando.' },
  { icone: '📒', titulo: 'Fiado sem caderno', texto: 'Quem deve, quanto e desde quando. Cobrança pronta no WhatsApp com um toque.' },
  { icone: '💵', titulo: 'Caixa do dia', texto: 'Abra com o troco, feche contando a gaveta. O Komando mostra se faltou ou sobrou.' },
  { icone: '📈', titulo: 'Lucro de verdade', texto: 'Desconta custo, taxa da maquininha e despesas. Você vê quanto sobrou no mês.', plano: 'Pro' },
  { icone: '🛍️', titulo: 'Catálogo online', texto: 'Um link com seus produtos para a bio do Instagram. O pedido chega no seu WhatsApp.', plano: 'Pro' },
  { icone: '👥', titulo: 'Equipe', texto: 'Convide vendedoras. Elas registram vendas sem ver seu custo e seu lucro.', plano: 'Pro' },
  { icone: '⭐', titulo: 'Clientes que voltam', texto: 'Aniversariantes, clientes sumidos e cartão fidelidade, com mensagem pronta.', plano: 'Black' },
]

const DORES = [
  { titulo: 'O fiado vive no caderno', texto: 'E todo mês alguém some sem pagar porque ninguém lembrou de cobrar.' },
  { titulo: 'O estoque nunca bate', texto: 'Você só descobre que acabou quando o cliente pede.' },
  { titulo: 'Vende bem, mas não sobra', texto: 'Sem contar custo, taxa e aluguel, o lucro é um chute.' },
]

const PERGUNTAS: [string, string][] = [
  ['Preciso instalar alguma coisa?', 'Não. O Komando abre no navegador do celular ou do computador. Se quiser, dá para colocar o ícone na tela inicial do celular, como um aplicativo.'],
  ['Funciona sem internet?', 'Não. O Komando precisa de internet (Wi-Fi ou dados do celular) para salvar suas vendas com segurança.'],
  ['Emite nota fiscal?', 'Não. O Komando cuida da gestão: vendas, estoque, fiado, caixa e lucro. A nota fiscal continua com o sistema que você já usa ou com o seu contador.'],
  ['Como funciona o teste grátis?', 'Você cria a conta e usa tudo liberado durante o teste, sem cadastrar cartão. No fim, escolhe um plano para continuar. Se não assinar, nada é cobrado.'],
  ['Posso mudar de plano depois?', 'Sim. Na tela Planos, dentro do app, você escolhe outro plano quando quiser. A próxima cobrança já vem no valor do plano novo.'],
  ['Como pago a mensalidade?', 'Por Pix, boleto ou cartão, direto pelo app. O plano é liberado automaticamente assim que o pagamento cai.'],
  ['Meus dados ficam seguros?', 'Cada loja só enxerga os próprios dados, e cada pessoa da equipe vê apenas o que o cargo permite. Você pode baixar tudo em planilha quando quiser.'],
]

function Secao({ id, titulo, sub, children, className = '' }: { id?: string; titulo: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`px-5 py-16 md:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{titulo}</h2>
          {sub && <p className="mt-3 text-muted md:text-lg">{sub}</p>}
        </div>
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  )
}

export default function Landing() {
  const [precos, setPrecos] = useState<Precos | null>(null)
  const [aberta, setAberta] = useState<number | null>(0)
  useEffect(() => usarTemaDaMarca(), [])
  useEffect(() => {
    document.title = 'Komando — vendas, estoque, fiado e lucro da sua loja'
    supabase.rpc('get_public_pricing').then(({ data }) => setPrecos(data as Precos))
  }, [])
  const dias = precos?.trial_days ?? 7
  const cta = `Testar grátis por ${dias} dias`

  return (
    <div className="min-h-full bg-white text-ink">
      {/* topo */}
      <header className="sticky top-0 z-30 border-b border-brand-100/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo />
          <nav className="flex items-center gap-2 text-sm">
            <a href="#planos" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">Planos</a>
            <a href="#duvidas" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">Dúvidas</a>
            <Link to="/entrar" className="rounded-lg px-3 py-2 font-medium text-brand-800 hover:bg-brand-50">Entrar</Link>
            <Link to="/cadastro" className="rounded-xl bg-brand-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-brand-800">Testar grátis</Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-12 md:pb-24 md:pt-20">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_10%,#ede9fe_0%,transparent_70%),radial-gradient(40%_40%_at_10%_90%,#f5f3ff_0%,transparent_70%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-800">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" /> Feito para lojistas
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              Sua loja no <span className="text-brand-700">Komando</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted md:text-xl">
              Vendas, estoque, fiado, caixa e lucro em um só lugar. Troque o caderno e a planilha por um app simples, direto no seu celular.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/cadastro" className="rounded-xl bg-brand-700 px-6 py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-brand-700/25 transition hover:bg-brand-800 active:scale-[.98]">{cta}</Link>
              <a href="#video" className="rounded-xl border border-brand-200 bg-white px-6 py-3.5 text-center text-base font-medium text-brand-800 hover:bg-brand-50">▶ Ver como funciona (1 min)</a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <li>✓ Não pede cartão para testar</li><li>✓ Conta pronta em 1 minuto</li><li>✓ Celular e computador</li>
            </ul>
          </div>
          <Celular />
        </div>
      </section>

      {/* vídeo */}
      <section id="video" className="scroll-mt-16 px-5 pb-16 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Veja o Komando em 1 minuto</h2>
            <p className="mt-3 text-muted md:text-lg">Uma venda, o estoque, o fiado e o lucro do mês, no app de verdade.</p>
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-brand-100 bg-[#15112a] shadow-2xl shadow-brand-900/20">
            <VideoDemo />
          </div>
          <div className="mt-6 text-center">
            <Link to="/cadastro" className="inline-block rounded-xl bg-brand-700 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-700/25 hover:bg-brand-800">{cta}</Link>
          </div>
        </div>
      </section>

      {/* dores */}
      <Secao titulo="Se a sua loja ainda roda no caderno…" sub="Você não está sozinho. E dá para resolver sem complicação." className="bg-brand-50/50">
        <div className="grid gap-4 md:grid-cols-3">
          {DORES.map((d) => (
            <div key={d.titulo} className="rounded-2xl border border-brand-100 bg-white p-6">
              <div className="text-lg font-semibold">{d.titulo}</div>
              <p className="mt-2 text-muted">{d.texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* recursos */}
      <Secao id="recursos" titulo="Tudo que a loja precisa. Nada que complica." sub="Pensado para quem vende no balcão, no Instagram e no WhatsApp.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS.map((r) => (
            <div key={r.titulo} className="group rounded-2xl border border-brand-100 bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-700/5">
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-xl">{r.icone}</div>
                {r.plano && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">Plano {r.plano}</span>}
              </div>
              <div className="mt-4 font-semibold">{r.titulo}</div>
              <p className="mt-1.5 text-sm text-muted">{r.texto}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted">Sem etiqueta: disponível em todos os planos. No teste grátis, tudo fica liberado.</p>
      </Secao>

      {/* como começar */}
      <Secao titulo="Comece hoje, em 3 passos" className="bg-[#15112a] text-white [&_p]:text-white/70">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['1', 'Crie sua conta', 'Nome da loja, e-mail e senha. Leva 1 minuto.'],
            ['2', 'Cadastre o que mais vende', 'Nome, preço e quantidade. O resto você completa depois.'],
            ['3', 'Faça a primeira venda', 'E veja na hora quanto vendeu e quanto lucrou.'],
          ].map(([n, t, x]) => (
            <div key={n} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-semibold">{n}</div>
              <div className="mt-4 text-lg font-semibold">{t}</div>
              <p className="mt-1.5">{x}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/cadastro" className="inline-block rounded-xl bg-white px-6 py-3.5 font-semibold text-brand-800 hover:bg-brand-50">{cta}</Link>
        </div>
      </Secao>

      {/* planos */}
      <Secao id="planos" titulo="Um plano para cada fase da sua loja" sub={`Teste tudo grátis por ${dias} dias. Depois, escolha o plano que cabe na sua loja.`}>
        <div className="grid gap-5 md:grid-cols-3">
          {PLANOS.map((p) => {
            const preco = precos?.[p.id]
            const black = p.id === 'black'
            const destaque = p.id === 'pro'
            return (
              <div key={p.id} className={`relative flex flex-col rounded-2xl border p-7 ${black ? 'border-[#3a3222] bg-[#15120d] text-[#f3ede1]' : destaque ? 'border-2 border-brand-600 bg-white shadow-xl shadow-brand-700/10' : 'border-brand-100 bg-white'}`}>
                {destaque && <span className="absolute -top-3 left-6 rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold text-white">Recomendado</span>}
                <div className={`text-lg font-semibold ${black ? 'text-[#d4af37]' : 'text-brand-900'}`}>{p.nome}</div>
                <p className={`mt-1 text-sm ${black ? 'text-[#a99f8c]' : 'text-muted'}`}>{p.frase}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{preco ? brl(preco) : '—'}</span>
                  <span className={`pb-1.5 text-sm ${black ? 'text-[#a99f8c]' : 'text-muted'}`}>/mês</span>
                </div>
                <div className={`text-xs ${black ? 'text-[#a99f8c]' : 'text-muted'}`}>{p.usuarios}</div>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.itens.map((i) => <li key={i} className="flex gap-2"><span className={black ? 'text-[#d4af37]' : 'text-brand-600'}>✓</span>{i}</li>)}
                </ul>
                <Link to="/cadastro" className={`mt-7 block rounded-xl px-4 py-3 text-center text-sm font-semibold ${black ? 'bg-[#d4af37] text-[#15120d] hover:bg-[#e2c15a]' : destaque ? 'bg-brand-700 text-white hover:bg-brand-800' : 'border border-brand-200 text-brand-800 hover:bg-brand-50'}`}>Começar grátis</Link>
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-center text-sm text-muted">Pagamento mensal por Pix, boleto ou cartão. Liberação automática.</p>
      </Secao>

      {/* dúvidas */}
      <Secao id="duvidas" titulo="Dúvidas frequentes" className="bg-brand-50/50">
        <div className="mx-auto max-w-3xl divide-y divide-brand-100 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          {PERGUNTAS.map(([q, r], i) => (
            <div key={q}>
              <button onClick={() => setAberta(aberta === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left font-medium">
                {q}<span className={`text-brand-600 transition ${aberta === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {aberta === i && <p className="px-6 pb-5 text-muted">{r}</p>}
            </div>
          ))}
        </div>
      </Secao>

      {/* cta final */}
      <section className="px-5 py-16 md:py-24">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-12 text-center text-white md:px-12 md:py-16">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Assuma o komando da sua loja.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">Crie sua conta agora e faça sua primeira venda em minutos.</p>
          <Link to="/cadastro" className="mt-8 inline-block rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-800 hover:bg-brand-50">{cta}</Link>
          {precos?.whatsapp && (
            <div className="mt-4 text-sm"><a href={abrirWhatsApp('Olá! Quero saber mais sobre o Komando para a minha loja.', precos.whatsapp)} target="_blank" rel="noreferrer" className="text-white/80 underline hover:text-white">Prefere conversar? Fale com a gente no WhatsApp</a></div>
          )}
        </div>
      </section>

      <footer className="border-t border-brand-100 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
          <Logo />
          <div className="flex gap-5">
            <Link to="/termos" className="hover:text-ink">Termos de uso</Link>
            <Link to="/privacidade" className="hover:text-ink">Privacidade</Link>
            <Link to="/entrar" className="hover:text-ink">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Vídeo de demonstração: capa com botão de play; os controles aparecem só depois de tocar. */
function VideoDemo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState(false)
  return (
    <div className="relative">
      <video
        ref={ref}
        className="block aspect-video w-full"
        src="/video/komando-como-funciona.mp4"
        poster="/video/komando-capa.jpg"
        controls={tocando}
        playsInline
        preload="none"
      />
      {!tocando && (
        <button
          onClick={() => { setTocando(true); ref.current?.play() }}
          aria-label="Assistir ao vídeo"
          className="group absolute inset-0 grid place-items-center bg-[#15112a]/45 transition hover:bg-[#15112a]/30"
        >
          <span className="flex flex-col items-center gap-3">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white shadow-xl transition group-hover:scale-105 md:h-20 md:w-20">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-brand-700 md:h-8 md:w-8" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="rounded-full bg-black/40 px-3 py-1 text-sm font-medium text-white">Assistir · 1 min</span>
          </span>
        </button>
      )}
    </div>
  )
}

/** Ilustração do app (valores de exemplo). */
function Celular() {
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-brand-300/40 to-brand-100/0 blur-2xl" />
      <div className="rounded-[2.4rem] border-[10px] border-[#15112a] bg-brand-50 shadow-2xl shadow-brand-900/25">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5"><svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden><rect width="64" height="64" rx="16" fill="#6D28D9" /><path d="M21 18v28M25.5 32.5L41.5 46M25.5 31.5L43 16.5M34 16.5h9v9" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="text-sm font-bold"><span className="text-brand-700">K</span>omando</span></div>
            <span className="text-[11px] text-muted">Hoje</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="Vendido hoje" valor="R$ 1.280,00" />
            <Mini label="Lucro do mês" valor="R$ 6.940,00" verde />
          </div>
          <div className="rounded-xl bg-white p-3">
            <div className="text-[11px] text-muted">Meta do mês</div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-100"><div className="h-full w-[68%] rounded-full bg-brand-600" /></div>
            <div className="mt-1 text-[11px] text-muted">68% · faltam R$ 145 por dia</div>
          </div>
          <div className="rounded-xl bg-white p-3 text-[12px]">
            <div className="mb-1.5 text-[11px] text-muted">Fiado a receber</div>
            {[['Ana Paula', 'R$ 180,00'], ['Carla M.', 'R$ 95,50'], ['Juliana S.', 'R$ 240,00']].map(([n, v]) => (
              <div key={n} className="flex justify-between py-1"><span>{n}</span><span className="font-medium">{v}</span></div>
            ))}
          </div>
          <div className="rounded-xl bg-brand-700 py-2.5 text-center text-sm font-semibold text-white">+ Vender</div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Ilustração com valores de exemplo</p>
    </div>
  )
}

function Mini({ label, valor, verde }: { label: string; valor: string; verde?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${verde ? 'text-emerald-700' : 'text-brand-900'}`}>{valor}</div>
    </div>
  )
}
