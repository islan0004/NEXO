import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { Logo } from './ui'

const nav = [
  { to: '/', label: 'Início', end: true },
  { to: '/produtos', label: 'Produtos e estoque' },
  { to: '/vendas', label: 'Vendas' },
  { to: '/fiado', label: 'Fiado' },
]

export default function AppLayout() {
  const { current, stores, select } = useStore()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const nome = (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email

  const links = (
    <nav className="space-y-1">
      {nav.map((n) => (
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
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
