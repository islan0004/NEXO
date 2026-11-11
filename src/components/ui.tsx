import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden><rect width="32" height="32" rx="8" fill="var(--color-brand-700)" /><path d="M10 22V10l12 12V10" stroke="var(--color-white)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="text-xl font-semibold tracking-tight text-brand-900">NEXO</span>
    </div>
  )
}

export function Button({ variant = 'primary', loading, children, className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost'; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed'
  const styles = variant === 'primary'
    ? 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm'
    : 'text-brand-800 hover:bg-brand-100'
  return (
    <button className={`${base} ${styles} ${className}`} disabled={loading || p.disabled} {...p}>
      {loading ? 'Aguarde…' : children}
    </button>
  )
}

export function Field({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        {...p}
      />
    </label>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok'; children: ReactNode }) {
  const s = kind === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${s}`}>{children}</div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-brand-100 bg-white p-5 shadow-[0_1px_2px_rgba(76,29,149,0.04)] ${className}`}>{children}</div>
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-brand-100 to-white px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <Card className="p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </Card>
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-brand-50" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Select({ label, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <select className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" {...p}>
        {children}
      </select>
    </label>
  )
}

export function Badge({ tone = 'brand', children }: { tone?: 'brand' | 'red' | 'gray'; children: ReactNode }) {
  const s = tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'gray' ? 'bg-gray-100 text-gray-600' : 'bg-brand-100 text-brand-800'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s}`}>{children}</span>
}

export const cellInput = 'w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function Spinner() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700" />
    </div>
  )
}
