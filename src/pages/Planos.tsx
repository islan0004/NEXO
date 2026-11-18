import { useState, type FormEvent } from 'react'
import { brl, supabase } from '../lib/supabase'
import { useStore, type Plano } from '../lib/store'
import { ORDEM, PLANOS, nomePlano, usePlano } from '../lib/planos'
import { abrirWhatsApp } from '../lib/mensagens'
import { Alert, Badge, Button, Card, Field, Modal } from '../components/ui'

export default function Planos() {
  const { current, recarregarAssinatura } = useStore()
  const { plano, assinatura } = usePlano()
  const [assinar, setAssinar] = useState<Plano | null>(null)
  const dono = current?.role === 'owner'
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

      {assinatura?.invoice_url && dono && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
          <div>
            <div className="font-semibold text-amber-900">Mensalidade {assinatura.pending_plan ? `do ${nomePlano(assinatura.pending_plan)} ` : ''}aguardando pagamento</div>
            <div className="text-sm text-amber-800">{assinatura.invoice_due ? `Vence em ${assinatura.invoice_due.split('-').reverse().join('/')}. ` : ''}Pague por Pix, boleto ou cartão. A liberação é automática.</div>
          </div>
          <a href={assinatura.invoice_url} target="_blank" rel="noreferrer" className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">Pagar agora</a>
        </Card>
      )}

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
              ) : dono ? (
                <button onClick={() => setAssinar(p.id)}
                  className={`mt-5 block w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${p.id === 'black' ? 'bg-[#d4af37] text-[#15120d]' : 'bg-brand-700 text-white hover:bg-brand-800'}`}>
                  {contratado && ORDEM[p.id] < ORDEM[contratado] ? 'Mudar para este' : `Assinar o ${p.nome.replace('NEXO ', '')}`}
                </button>
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
      <p className="text-center text-xs text-muted">Pagamento mensal por Pix, boleto ou cartão. Liberação automática assim que o pagamento cai.{assinatura?.support_whatsapp && <> Dúvidas? <a className="underline" href={abrirWhatsApp('Olá! Tenho uma dúvida sobre os planos do NEXO.', assinatura.support_whatsapp)} target="_blank" rel="noreferrer">Fale com a gente</a>.</>}</p>
      {assinar && <Assinar plano={assinar} preco={assinatura?.prices?.[assinar]} onClose={() => setAssinar(null)} onPronto={() => { setAssinar(null); recarregarAssinatura() }} />}
    </div>
  )
}

function Assinar({ plano, preco, onClose, onPronto }: { plano: Plano; preco?: number; onClose: () => void; onPronto: () => void }) {
  const { current, assinatura } = useStore()
  const [nome, setNome] = useState('')
  const [doc, setDoc] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState<{ url: string | null; due: string } | null>(null)
  const emTeste = assinatura?.status === 'trial' && assinatura.trial_ends_at && new Date(assinatura.trial_ends_at) > new Date()

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('')
    const d = doc.replace(/\D/g, '')
    if (!nome.trim()) return setErro('Informe o nome do responsável ou da empresa.')
    if (d.length !== 11 && d.length !== 14) return setErro('Informe um CPF (11 números) ou CNPJ (14 números).')
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('asaas?acao=assinar', { body: { store_id: current!.id, plan: plano, nome, documento: d } })
    setLoading(false)
    if (error || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && error && 'context' in error) { try { msg = (await (error as { context: Response }).context.json()).error } catch { /* sem corpo */ } }
      return setErro(msg || 'Não foi possível gerar a cobrança. Tente de novo.')
    }
    setLink({ url: data.invoice_url, due: data.due })
    if (data.invoice_url) window.open(data.invoice_url, '_blank')
  }

  if (link) {
    return (
      <Modal title="Cobrança criada" onClose={onPronto}>
        <div className="space-y-3 text-sm">
          <p>Assinatura do <strong>{nomePlano(plano)}</strong> criada. {emTeste ? `A primeira mensalidade vence em ${link.due.split('-').reverse().join('/')}, no fim do seu teste.` : 'Pague agora para liberar.'}</p>
          <p className="text-muted">Pode pagar por Pix, boleto ou cartão. Quando o pagamento cair, o plano é liberado sozinho.</p>
          {link.url && <a href={link.url} target="_blank" rel="noreferrer" className="block rounded-xl bg-brand-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-brand-800">Abrir página de pagamento</a>}
          <Button variant="ghost" className="w-full" onClick={onPronto}>Fechar</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Assinar o ${nomePlano(plano)}`} onClose={onClose}>
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">{preco ? `${brl(preco)} por mês. ` : ''}{emTeste ? 'Você continua no teste grátis; a primeira cobrança só vence quando ele acabar.' : 'A cobrança é gerada agora.'}</p>
        <Field label="Nome do responsável ou da empresa" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        <Field label="CPF ou CNPJ" inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Só números" />
        <p className="text-xs text-muted">Usado só para emitir a cobrança (exigência do banco). O pagamento é processado pelo Asaas.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Gerar cobrança</Button></div>
      </form>
    </Modal>
  )
}
