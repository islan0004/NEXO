import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { StoreProvider, useStore } from './lib/store'
import { Spinner } from './components/ui'
import AppLayout from './components/AppLayout'
import { Cadastro, Entrar, EsqueciSenha, RedefinirSenha } from './pages/Auth'
import CriarLoja from './pages/CriarLoja'
import Dashboard, { EmBreve } from './pages/Dashboard'

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
          <Route path="/produtos" element={<EmBreve titulo="Produtos e estoque" />} />
          <Route path="/vendas" element={<EmBreve titulo="Vendas" />} />
          <Route path="/fiado" element={<EmBreve titulo="Fiado" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}
