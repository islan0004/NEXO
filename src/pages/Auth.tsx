import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, traduzErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, AuthShell, Button, Field } from '../components/ui'

export function Entrar() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    nav('/')
  }

  return (
    <AuthShell title="Entrar" subtitle="Acesse a gestão da sua loja">
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Button type="submit" loading={loading} className="w-full">Entrar</Button>
        <div className="flex justify-between text-sm">
          <Link to="/esqueci-senha" className="text-brand-700 hover:underline">Esqueci a senha</Link>
          <Link to="/cadastro" className="text-brand-700 hover:underline">Criar conta</Link>
        </div>
      </form>
    </AuthShell>
  )
}

export function Cadastro() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (senha.length < 8) return setErro('Use uma senha com pelo menos 8 caracteres.')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { full_name: nome.trim() }, emailRedirectTo: `${window.location.origin}/` },
    })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    // Se a confirmação de e-mail estiver desligada, a sessão já vem pronta
    if (data.session) return nav('/')
    // Supabase devolve usuário sem identidades quando o e-mail já existe
    if (data.user && data.user.identities?.length === 0) return setErro('Já existe uma conta com este e-mail.')
    setOk(true)
  }

  if (ok) {
    return (
      <AuthShell title="Confirme seu e-mail" subtitle={`Enviamos um link para ${email}. Abra o e-mail e clique para ativar sua conta.`}>
        <Link to="/entrar" className="text-sm text-brand-700 hover:underline">Voltar para entrar</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Criar conta" subtitle="Comece a organizar vendas, estoque e lucro">
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Seu nome" required autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Field label="E-mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Senha" type="password" required autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres" />
        <Button type="submit" loading={loading} className="w-full">Criar conta</Button>
        <p className="text-center text-sm text-muted">Já tem conta? <Link to="/entrar" className="text-brand-700 hover:underline">Entrar</Link></p>
      </form>
    </AuthShell>
  )
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    setEnviado(true)
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha">
      {enviado ? (
        <div className="space-y-4">
          <Alert kind="ok">Se existir uma conta com {email}, o link foi enviado.</Alert>
          <Link to="/entrar" className="text-sm text-brand-700 hover:underline">Voltar para entrar</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {erro && <Alert>{erro}</Alert>}
          <Field label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={loading} className="w-full">Enviar link</Button>
          <Link to="/entrar" className="block text-center text-sm text-brand-700 hover:underline">Voltar</Link>
        </form>
      )}
    </AuthShell>
  )
}

export function RedefinirSenha() {
  const { session, clearRecovery } = useAuth()
  const nav = useNavigate()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (senha.length < 8) return setErro('Use uma senha com pelo menos 8 caracteres.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    clearRecovery()
    nav('/')
  }

  if (!session) {
    return (
      <AuthShell title="Link inválido ou expirado" subtitle="Peça um novo link de recuperação.">
        <Link to="/esqueci-senha" className="text-sm text-brand-700 hover:underline">Pedir novo link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Nova senha">
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nova senha" type="password" required autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Button type="submit" loading={loading} className="w-full">Salvar senha</Button>
      </form>
    </AuthShell>
  )
}
