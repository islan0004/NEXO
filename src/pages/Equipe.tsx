import { useCallback, useEffect, useState } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { useStore, type Role } from '../lib/store'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { nomePlano, usePlano } from '../lib/planos'
import { abrirWhatsApp } from '../lib/mensagens'
import { Badge, Button, Card, Modal, Spinner } from '../components/ui'
import { Link } from 'react-router-dom'

type Membro = { user_id: string; full_name: string | null; role: Role; active: boolean; joined_at: string }
const CARGOS: Record<Role, string> = { owner: 'Dono', manager: 'Gerente', seller: 'Vendedor' }
const LIMITE = { start: 1, pro: 3, black: Infinity } as const

export default function Equipe() {
  const { current } = useStore()
  const { session } = useAuth()
  const { plano } = usePlano()
  const toast = useToast()
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [loading, setLoading] = useState(true)
  const [convite, setConvite] = useState<{ link: string; cargo: string } | null>(null)
  const [gerando, setGerando] = useState(false)

  const carregar = useCallback(async () => {
    if (!current) return
    const { data } = await supabase.rpc('get_team', { _store_id: current.id })
    setEquipe((data as Membro[]) ?? [])
    setLoading(false)
  }, [current])
  useEffect(() => { carregar() }, [carregar])

  const ativos = equipe.filter((m) => m.active).length
  const limite = LIMITE[plano]
  const cheio = ativos >= limite
  const dono = current?.role === 'owner'

  async function convidar(role: 'seller' | 'manager') {
    setGerando(true)
    const { data, error } = await supabase.rpc('create_invite', { _store_id: current!.id, _role: role })
    setGerando(false)
    if (error) return toast(error.message.includes('plan_user_limit') ? `Seu plano permite ${limite} usuário(s).` : traduzErro(error), 'erro')
    setConvite({ link: `${window.location.origin}/convite/${data}`, cargo: role === 'seller' ? 'vendedor(a)' : 'gerente' })
  }

  async function alterar(m: Membro, role: Role, active: boolean) {
    const { error } = await supabase.rpc('set_member', { _store_id: current!.id, _user_id: m.user_id, _role: role, _active: active })
    if (error) return toast(error.message.includes('plan_user_limit') ? `Seu plano permite ${limite} usuário(s).` : traduzErro(error), 'erro')
    toast('Equipe atualizada'); carregar()
  }

  if (loading) return <Spinner />

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="text-sm text-muted">{ativos} de {limite === Infinity ? 'ilimitados' : limite} usuário(s) no {nomePlano(plano)}</p>
      </div>

      {dono && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Convidar alguém</h2>
          <p className="text-sm text-muted">Vendedor(a) registra vendas e fiado, mas não vê custo, lucro nem relatórios. Gerente vê tudo, menos a equipe.</p>
          {cheio ? (
            <Link to="/planos" className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 px-3 py-2 text-sm text-brand-800 hover:bg-brand-50">
              🔒 Seu plano já está no limite de usuários. <strong>Ver planos</strong>
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button loading={gerando} onClick={() => convidar('seller')}>+ Convidar vendedor(a)</Button>
              <Button variant="ghost" className="border border-brand-200" loading={gerando} onClick={() => convidar('manager')}>+ Convidar gerente</Button>
            </div>
          )}
        </Card>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-brand-100">
          {equipe.map((m) => (
            <li key={m.user_id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${m.active ? '' : 'opacity-50'}`}>
              <div>
                <div className="font-medium">{m.full_name ?? 'Sem nome'}{m.user_id === session?.user.id && <span className="text-muted"> (você)</span>}</div>
                <div className="mt-0.5 flex gap-1.5"><Badge tone={m.role === 'owner' ? 'brand' : 'gray'}>{CARGOS[m.role]}</Badge>{!m.active && <Badge tone="red">Sem acesso</Badge>}</div>
              </div>
              {dono && m.role !== 'owner' && (
                <div className="flex gap-3 text-sm">
                  {m.active && <button className="text-brand-700 hover:underline" onClick={() => alterar(m, m.role === 'seller' ? 'manager' : 'seller', true)}>
                    Tornar {m.role === 'seller' ? 'gerente' : 'vendedor'}</button>}
                  <button className={m.active ? 'text-red-600 hover:underline' : 'text-brand-700 hover:underline'} onClick={() => alterar(m, m.role, !m.active)}>
                    {m.active ? 'Tirar acesso' : 'Devolver acesso'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {convite && (
        <Modal title="Convite criado" onClose={() => setConvite(null)}>
          <div className="space-y-4 text-sm">
            <p>Mande este link para o(a) {convite.cargo}. Vale por 7 dias e para uma pessoa só.</p>
            <div className="break-all rounded-xl bg-brand-50 p-3 font-mono text-xs">{convite.link}</div>
            <div className="flex flex-wrap gap-2">
              <a className="rounded-xl bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800" target="_blank" rel="noreferrer"
                href={abrirWhatsApp(`Oi! Te convidei para a equipe da ${current?.name} no NEXO. Crie sua conta por este link: ${convite.link}`)}>Enviar no WhatsApp</a>
              <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(convite.link); toast('Link copiado') }}>Copiar link</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
