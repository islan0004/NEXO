import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { aplicarTema, type Tema } from './temas'

export type TourState = { done?: boolean; global?: boolean; seen?: string[] }
export type Perfil = { full_name: string | null; onboarding_completed_at: string | null; theme: Tema; tour: TourState }

type Ctx = {
  perfil: Perfil | null
  loading: boolean
  reload: () => Promise<void>
  setTema: (t: Tema) => Promise<void>
  setTour: (t: TourState) => Promise<void>
}
const PerfilCtx = createContext<Ctx>(null as unknown as Ctx)

export function PerfilProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const uid = session?.user.id

  const reload = useCallback(async () => {
    if (!uid) { setPerfil(null); setLoading(false); return }
    const { data } = await supabase.from('profiles').select('full_name, onboarding_completed_at, theme, tour').eq('id', uid).maybeSingle()
    const p = (data as Perfil | null) ?? { full_name: null, onboarding_completed_at: null, theme: 'nexo', tour: {} }
    setPerfil(p)
    aplicarTema(p.theme)
    setLoading(false)
  }, [uid])

  useEffect(() => { reload() }, [reload])

  const setTema = async (t: Tema) => {
    aplicarTema(t)
    setPerfil((p) => (p ? { ...p, theme: t } : p))
    if (uid) await supabase.from('profiles').update({ theme: t }).eq('id', uid)
  }

  const setTour = async (t: TourState) => {
    setPerfil((p) => (p ? { ...p, tour: t } : p))
    if (uid) await supabase.from('profiles').update({ tour: t }).eq('id', uid)
  }

  return <PerfilCtx.Provider value={{ perfil, loading, reload, setTema, setTour }}>{children}</PerfilCtx.Provider>
}

export const usePerfil = () => useContext(PerfilCtx)
