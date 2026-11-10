import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Categoria = { id: string; name: string }

export function useCategorias(storeId: string | undefined) {
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const reload = useCallback(async () => {
    if (!storeId) return
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('type', 'product')
      .eq('active', true)
      .order('name')
    setCategorias(data ?? [])
  }, [storeId])

  useEffect(() => { reload() }, [reload])

  async function criar(name: string): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categories')
      .insert({ store_id: storeId, name: name.trim(), type: 'product' })
      .select('id, name')
      .single()
    if (error) throw error
    await reload()
    return data
  }

  return { categorias, reload, criar }
}
