import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { StoreProvider, useStore } from './lib/store'
import { Spinner } from './components/ui'
import AppLayout from './components/AppLayout'
import { Cadastro, Entrar, EsqueciSenha, RedefinirSenha } from './pages/Auth'
import CriarLoja from './pages/CriarLoja'
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

function Protegido() {
  const { stores, loading } = useStore()
  if (loading) return <Spinner />
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
      {!session ? (
        <>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}
