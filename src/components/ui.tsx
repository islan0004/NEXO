import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
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

export function Spinner() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700" />
    </div>
  )
}
