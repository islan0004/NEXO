import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, traduzErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, AuthShell, Button, Spinner } from '../components/ui'

export const CHAVE_CONVITE = 'nexo.convite'
type Info = { store_name: string; role: 'seller' | 'manager'; valid: boolean; member?: boolean } | null

/** Página do link de convite. Sem login: guarda o código e manda criar conta. Com login: entra na equipe. */
export default function Convite({ codigo: codigoProp, aoConcluir }: { codigo?: string; aoConcluir?: () => void }) {
  const params = useParams()
  const codigo = codigoProp ?? params.code ?? ''
  const { session } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<Info>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(CHAVE_CONVITE, codigo) } catch { /* sem storage */ }
    if (!session) { setLoading(false); return }
    supabase.rpc('get_invite', { _code: codigo }).then(({ data }) => { setInfo(data as Info); setLoading(false) })
  }, [codigo, session])

  function esquecer() { try { localStorage.removeItem(CHAVE_CONVITE) } catch { /* sem storage */ } }

  async function aceitar() {
    setEntrando(true); setErro('')
    const { data, error } = await supabase.rpc('accept_invite', { _code: codigo })
    setEntrando(false)
    if (error) {
      if (error.message.includes('invite_invalid')) { esquecer(); return setErro('Este convite não vale mais. Peça um novo para o dono da loja.') }
      if (error.message.includes('plan_user_limit')) return setErro('A loja já está no limite de usuários do plano. Avise o dono.')
      return setErro(traduzErro(error))
    }
    esquecer()
    try { localStorage.setItem('nexo.store', data as string) } catch { /* sem storage */ }
    if (aoConcluir) aoConcluir()
    else window.location.assign('/')
  }

  if (loading) return <Spinner />

  if (!session) {
    return (
      <AuthShell title="Você foi convidado(a) para o Komando" subtitle="Crie sua conta ou entre para fazer parte da equipe da loja.">
        <div className="space-y-3">
          <Button className="w-full" onClick={() => nav('/cadastro')}>Criar minha conta</Button>
          <Link to="/entrar" className="block text-center text-sm text-brand-700 hover:underline">Já tenho conta, entrar</Link>
        </div>
      </AuthShell>
    )
  }

  if (info?.member) {
    return (
      <AuthShell title={`Você já faz parte da ${info.store_name}`} subtitle="Este convite é para outra pessoa. Mande o link para quem vai usar.">
        <Button className="w-full" onClick={() => { esquecer(); if (aoConcluir) aoConcluir(); else nav('/') }}>Voltar para o Komando</Button>
      </AuthShell>
    )
  }

  if (!info || !info.valid) {
    return (
      <AuthShell title="Convite inválido" subtitle="Este link expirou ou já foi usado. Peça um novo ao dono da loja.">
        <Button className="w-full" onClick={() => { esquecer(); if (aoConcluir) aoConcluir(); else nav('/') }}>Continuar</Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={`Entrar na equipe da ${info.store_name}`} subtitle={`Você vai entrar como ${info.role === 'seller' ? 'vendedor(a)' : 'gerente'}.`}>
      <div className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Button className="w-full" loading={entrando} onClick={aceitar}>Entrar na equipe</Button>
        <button className="block w-full text-center text-sm text-muted hover:underline" onClick={() => { esquecer(); if (aoConcluir) aoConcluir(); else nav('/') }}>Agora não</button>
      </div>
    </AuthShell>
  )
}
