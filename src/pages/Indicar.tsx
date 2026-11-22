import { useEffect, useState } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { linkIndicacao } from '../lib/indicacao'
import { Alert, Badge, Button, Card, Spinner } from '../components/ui'

type Indicada = { store: string; created_at: string; status: 'testando' | 'assinou' | 'nao_assinou'; reward_status: string; reward_days: number | null }
type Dados = { code: string; trial_days: number; referrals: Indicada[] }

const STATUS: Record<Indicada['status'], { texto: string; tom: 'brand' | 'green' | 'gray' }> = {
  testando: { texto: 'Testando', tom: 'brand' },
  assinou: { texto: 'Assinou', tom: 'green' },
  nao_assinou: { texto: 'Não assinou', tom: 'gray' },
}

export default function Indicar() {
  const { current } = useStore()
  const toast = useToast()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!current) return
    supabase.rpc('get_my_referrals', { _store_id: current.id }).then(({ data, error }) => {
      if (error) setErro(traduzErro(error)); else setDados(data as Dados)
    })
  }, [current])

  if (erro) return <Alert>{erro}</Alert>
  if (!dados) return <Spinner />

  const link = linkIndicacao(dados.code)
  const msg = `Oi! Eu uso o Komando na ${current?.name} para controlar vendas, estoque, fiado e lucro pelo celular. Pelo meu link você testa grátis por ${dados.trial_days} dias (o normal é 7): ${link}`

  async function copiar() {
    try { await navigator.clipboard.writeText(link); toast('Link copiado') } catch { toast('Não deu para copiar. Segure no link para copiar.') }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Indique o Komando</h1>
        <p className="text-sm text-muted">Conhece outro lojista que ainda usa caderno ou planilha? Mande o seu link.</p>
      </div>

      <Card className="space-y-4">
        <div className="rounded-xl bg-brand-50 p-4">
          <div className="text-sm font-medium text-brand-900">Quem entrar pelo seu link ganha</div>
          <div className="mt-1 text-2xl font-semibold text-brand-800">{dados.trial_days} dias de teste grátis</div>
          <div className="text-sm text-muted">em vez de 7, sem cartão.</div>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Seu link</div>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm text-ink" />
            <Button variant="ghost" className="border border-brand-200" onClick={copiar}>Copiar</Button>
          </div>
          <div className="mt-1 text-xs text-muted">Código da sua loja: <strong className="text-ink">{dados.code}</strong></div>
        </div>

        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-base font-semibold text-white hover:brightness-95">
          Mandar no WhatsApp
        </a>
      </Card>

      <Card className="p-0">
        <h2 className="px-4 py-3 font-semibold">Lojas que você indicou</h2>
        {dados.referrals.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">Nenhuma ainda. Quando alguém criar a loja pelo seu link, ela aparece aqui.</p>
        ) : (
          <ul className="divide-y divide-brand-100 text-sm">
            {dados.referrals.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">{r.store}</div>
                  <div className="text-xs text-muted">Entrou em {new Date(r.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
                <Badge tone={STATUS[r.status].tom}>{STATUS[r.status].texto}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
