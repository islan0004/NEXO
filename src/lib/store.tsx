import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type Role = 'owner' | 'manager' | 'seller'
export type Store = { id: string; name: string; role: Role }

type StoreCtx = {
  stores: Store[]
  current: Store | null
  loading: boolean
  select: (id: string) => void
  reload: () => Promise<void>
  canManage: boolean
}
const Ctx = createContext<StoreCtx>(null as unknown as StoreCtx)
const KEY = 'nexo.store'

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) { setStores([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('store_members')
      .select('role, active, stores(id, name)')
      .eq('user_id', session.user.id)
      .eq('active', true)
    if (!error && data) {
      const list = data
        .map((m) => {
          const s = m.stores as unknown as { id: string; name: string } | null
          return s ? { id: s.id, name: s.name, role: m.role as Role } : null
        })
        .filter(Boolean) as Store[]
      setStores(list)
    }
    setLoading(false)
  }, [session])

  useEffect(() => { reload() }, [reload])

  const current = stores.find((s) => s.id === currentId) ?? stores[0] ?? null
  const select = (id: string) => {
    setCurrentId(id)
    try { localStorage.setItem(KEY, id) } catch { /* sem storage */ }
  }

  return (
    <Ctx.Provider value={{ stores, current, loading, select, reload, canManage: current?.role === 'owner' || current?.role === 'manager' }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
