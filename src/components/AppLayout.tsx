import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { useInstalar } from '../lib/instalar'
import { Logo, Modal } from './ui'

const nav = [
  { to: '/', label: 'Início', end: true },
  { to: '/produtos', label: 'Produtos e estoque' },
  { to: '/vendas', label: 'Vendas' },
  { to: '/fiado', label: 'Fiado' },
  { to: '/relatorios', label: 'Relatórios', gestor: true },
]

export default function AppLayout() {
  const { current, stores, select, canManage } = useStore()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const app = useInstalar()
  const [dicaIos, setDicaIos] = useState(false)
  const nome = (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email

  const links = (
    <nav className="space-y-1">
      {nav.filter((n) => !('gestor' in n) || canManage).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
          className={({ isActive }) => `block rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-100 text-brand-800' : 'text-muted hover:bg-brand-50 hover:text-ink'}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo />
      {stores.length > 1 ? (
        <select value={current?.id} onChange={(e) => select(e.target.value)}
          className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : (
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{current?.name}</div>
      )}
      {links}
      {app.disponivel && (
        <button onClick={async () => { if (app.ios) setDicaIos(true); else await app.instalar() }}
          className="rounded-xl border border-dashed border-brand-300 px-3 py-2.5 text-left text-sm text-brand-800 hover:bg-brand-50">
          📲 <span className="font-medium">Instalar o app</span><span className="block text-xs text-muted">Ícone na tela inicial, abre em tela cheia</span>
        </button>
      )}
      <div className="mt-auto border-t border-brand-100 pt-4 text-sm">
        <div className="truncate text-muted">{nome}</div>
        <button onClick={() => supabase.auth.signOut()} className="mt-1 text-brand-700 hover:underline">Sair</button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 shrink-0 border-r border-brand-100 bg-white md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/30" />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-brand-100 bg-white px-4 py-3 md:hidden">
          <Logo />
          <button onClick={() => setOpen(true)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100">Menu</button>
        </header>
        <main key={loc.pathname} className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-8"><Outlet /></main>
      </div>
      {!loc.pathname.startsWith('/vendas/nova') && (
        <Link to="/vendas/nova" className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-700/30 transition active:scale-95 md:hidden"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <span className="text-lg leading-none">+</span> Vender
        </Link>
      )}
      {dicaIos && (
        <Modal title="Instalar o NEXO no iPhone" onClose={() => setDicaIos(false)}>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Abra o NEXO no <strong>Safari</strong>.</li>
            <li>Toque no botão <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
            <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
          </ol>
        </Modal>
      )}
    </div>
  )
}
