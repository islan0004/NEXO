import { brl } from '../lib/supabase'
import { useStore } from '../lib/store'
import { ORDEM, PLANOS, nomePlano, usePlano } from '../lib/planos'
import { abrirWhatsApp } from '../lib/mensagens'
import { Badge, Card } from '../components/ui'

export default function Planos() {
  const { current } = useStore()
  const { plano, assinatura } = usePlano()
  const dias = assinatura?.trial_ends_at ? Math.ceil((new Date(assinatura.trial_ends_at).getTime() - Date.now()) / 86400000) : null
  const emTeste = assinatura?.status === 'trial' && dias !== null && dias >= 0
  const contratado = assinatura?.status === 'active' ? assinatura.plan : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos</h1>
        <p className="text-sm text-muted">
          {emTeste ? `Você está no teste grátis com tudo liberado (${dias} dia(s) restante(s)).`
            : contratado ? `Seu plano: ${nomePlano(contratado)}.`
            : assinatura?.status === 'free' ? 'Sua loja tem acesso cortesia a todos os recursos.'
            : `Plano atual: ${nomePlano(plano)}.`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANOS.map((p) => {
          const preco = assinatura?.prices?.[p.id]
          const atual = contratado === p.id
          const destaque = p.id === 'pro'
          const msg = `Olá! Quero assinar o ${p.nome}${preco ? ` (${brl(preco)}/mês)` : ''} para a loja ${current?.name ?? ''}.`
          return (
            <Card key={p.id} className={`relative flex flex-col ${destaque ? 'border-2 border-brand-600' : ''} ${p.id === 'black' ? 'bg-[#15120d] text-[#f3ede1]' : ''}`}>
              {destaque && <span className="absolute -top-3 left-5"><Badge>Mais escolhido</Badge></span>}
              <h2 className={`text-lg font-semibold ${p.id === 'black' ? 'text-[#d4af37]' : 'text-brand-900'}`}>{p.nome}</h2>
              <p className={`mt-1 text-sm ${p.id === 'black' ? 'text-[#a99f8c]' : 'text-muted'}`}>{p.frase}</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-3xl font-semibold">{preco ? brl(preco) : '—'}</span>
                <span className={`pb-1 text-sm ${p.id === 'black' ? 'text-[#a99f8c]' : 'text-muted'}`}>/mês</span>
              </div>
              <p className={`text-xs ${p.id === 'black' ? 'text-[#a99f8c]' : 'text-muted'}`}>{p.usuarios}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.itens.map((i) => <li key={i} className="flex gap-2"><span className={p.id === 'black' ? 'text-[#d4af37]' : 'text-brand-600'}>✓</span>{i}</li>)}
              </ul>
              {atual ? (
                <div className="mt-5 rounded-xl border border-current/20 py-2.5 text-center text-sm font-medium opacity-80">Seu plano atual</div>
              ) : assinatura?.support_whatsapp ? (
                <a href={abrirWhatsApp(msg, assinatura.support_whatsapp)} target="_blank" rel="noreferrer"
                  className={`mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${p.id === 'black' ? 'bg-[#d4af37] text-[#15120d]' : 'bg-brand-700 text-white hover:bg-brand-800'}`}>
                  {contratado && ORDEM[p.id] < ORDEM[contratado] ? 'Mudar para este' : 'Quero este plano'}
                </a>
              ) : (
                <p className="mt-5 text-center text-xs opacity-70">Fale com a equipe NEXO para assinar.</p>
              )}
            </Card>
          )
        })}
      </div>
      <p className="text-center text-xs text-muted">Pagamento mensal por Pix.</p>
    </div>
  )
}
