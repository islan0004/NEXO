import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; texto: string; tipo: 'ok' | 'erro' }
const Ctx = createContext<(texto: string, tipo?: 'ok' | 'erro') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const mostrar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, texto, tipo }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={`nexo-toast pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${t.tipo === 'ok' ? 'bg-ink text-white' : 'bg-red-600 text-white'}`}>
            <span aria-hidden>{t.tipo === 'ok' ? '✓' : '!'}</span>{t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
