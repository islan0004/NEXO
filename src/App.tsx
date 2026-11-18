import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { StoreProvider, useStore } from './lib/store'
import { Spinner } from './components/ui'
import AppLayout from './components/AppLayout'
import { Cadastro, Entrar, EsqueciSenha, RedefinirSenha } from './pages/Auth'
import CriarLoja from './pages/CriarLoja'
import Onboarding from './pages/Onboarding'
import SoTema from './pages/SoTema'
import Duvidas from './pages/Duvidas'
import { usePerfil } from './lib/perfil'
import Dashboard from './pages/Dashboard'
import Fiado from './pages/Fiado'
import ClienteDetalhe from './pages/ClienteDetalhe'
import Relatorios from './pages/Relatorios'
import Admin from './pages/Admin'
import Produtos from './pages/Produtos'
import ProdutoDetalhe from './pages/ProdutoDetalhe'
import Vendas from './pages/Vendas'
import NovaVenda from './pages/NovaVenda'
import VendaDetalhe from './pages/VendaDetalhe'
import Despesas from './pages/Despesas'
import Clientes from './pages/Clientes'
import Landing from './pages/Landing'
import { Privacidade, Termos } from './pages/Legal'
import Caixa from './pages/Caixa'
import Planilhas from './pages/Planilhas'
import Equipe from './pages/Equipe'
import Planos from './pages/Planos'
import Catalogo from './pages/Catalogo'
import LojaPublica from './pages/LojaPublica'
import Convite, { CHAVE_CONVITE } from './pages/Convite'

const conviteGuardado = () => { try { return localStorage.getItem(CHAVE_CONVITE) } catch { return null } }

function Protegido() {
  const { stores, current, loading, reload } = useStore()
  const { perfil, loading: carregandoPerfil } = usePerfil()
  const [convite, setConvite] = useState(conviteGuardado)
  if (loading || carregandoPerfil) return <Spinner />
  // Convite pendente (veio de um link /convite antes de criar conta): resolve antes de tudo
  if (convite) return <Convite codigo={convite} aoConcluir={() => { setConvite(null); reload() }} />
  // Quiz + tema na primeira entrada (novos e antigos). Quem não é dono pula o quiz.
  if (perfil && !perfil.onboarding_completed_at) {
    if (stores.length === 0 || current?.role === 'owner') return <Onboarding />
    return <SoTema />
  }
  if (stores.length === 0) return <CriarLoja />
  return <AppLayout />
}

export default function App() {
  const { session, loading, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (recovery && loc.pathname !== '/redefinir-senha') return <Navigate to="/redefinir-senha" replace />

  return (
    <Routes>
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/loja/:slug" element={<LojaPublica />} />
      <Route path="/termos" element={<Termos />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/convite/:code" element={session ? <StoreProvider><ConviteLogado /></StoreProvider> : <Convite />} />
      {!session ? (
        <>
          <Route path="/" element={<Landing />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="*" element={<Navigate to="/entrar" replace />} />
        </>
      ) : (
        <Route element={<StoreProvider><Protegido /></StoreProvider>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/produtos/:id" element={<ProdutoDetalhe />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/vendas/nova" element={<NovaVenda />} />
          <Route path="/vendas/:id" element={<VendaDetalhe />} />
          <Route path="/fiado" element={<Fiado />} />
          <Route path="/fiado/:id" element={<ClienteDetalhe />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/duvidas" element={<Duvidas />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/caixa" element={<Caixa />} />
          <Route path="/planilhas" element={<Planilhas />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/planos" element={<Planos />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}

function ConviteLogado() {
  const { reload } = useStore()
  return <Convite aoConcluir={() => { reload(); window.location.assign('/') }} />
}
