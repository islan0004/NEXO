import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { useInstalar } from '../lib/instalar'
import { Logo, Modal } from './ui'
import { Tour } from './Tour'

const nav = [
  { to: '/', label: 'Início', end: true, tour: 'inicio' },
  { to: '/produtos', label: 'Produtos e estoque', tour: 'produtos' },
  { to: '/vendas', label: 'Vendas', tour: 'vendas' },
  { to: '/fiado', label: 'Fiado', tour: 'fiado' },
  { to: '/relatorios', label: 'Relatórios', gestor: true, tour: 'relatorios' },
  { to: '/duvidas', label: 'Dúvidas', tour: 'duvidas' },
]

export default function AppLayout() {
  const { current, stores, select, canManage, isAdmin, assinatura } = useStore()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const app = useInstalar()
  const [dicaIos, setDicaIos] = useState(false)
  const nome = (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email

  const links = (
    <nav className="space-y-1">
      {nav.filter((n) => !('gestor' in n) || canManage).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} data-tour={`nav-${n.tour}`}
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
      {isAdmin && (
        <NavLink to="/admin" onClick={() => setOpen(false)}
          className={({ isActive }) => `block rounded-xl border border-brand-200 px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-brand-700 text-white' : 'text-brand-800 hover:bg-brand-50'}`}>
          ⚙ Admin NEXO
        </NavLink>
      )}
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
          <button data-tour="menu" onClick={() => setOpen(true)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100">Menu</button>
        </header>
        {canManage && <AvisoAssinatura a={assinatura} />}
        <main key={loc.pathname} className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-8"><Outlet /></main>
      </div>
      {!loc.pathname.startsWith('/vendas/nova') && (
        <Link to="/vendas/nova" data-tour="vender-fab" className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-700/30 transition active:scale-95 md:hidden"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <span className="text-lg leading-none">+</span> Vender
        </Link>
      )}
      <Tour />
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

function AvisoAssinatura({ a }: { a: import('../lib/store').Assinatura | null }) {
  if (!a) return null
  const dias = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null)
  if (a.status === 'trial') {
    const d = dias(a.trial_ends_at)
    if (d === null) return null
    const vencido = d < 0
    return (
      <div className={`px-4 py-2 text-center text-sm ${vencido ? 'bg-red-50 text-red-700' : d <= 5 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-800'}`}>
        {vencido ? 'Seu período de teste terminou. Fale com a equipe NEXO para continuar usando.' : `Teste grátis: ${d === 0 ? 'último dia' : `${d} dia(s) restante(s)`}`}
      </div>
    )
  }
  if ((a.status === 'active' && a.current_period_end && dias(a.current_period_end)! < 0) || a.status === 'past_due') {
    return <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">Mensalidade em aberto. Fale com a equipe NEXO para regularizar.</div>
  }
  return null
}
