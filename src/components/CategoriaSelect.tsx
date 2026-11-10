import { useState } from 'react'
import { traduzErro } from '../lib/supabase'
import type { Categoria } from '../lib/categories'
import { Button, Select, cellInput } from './ui'

export default function CategoriaSelect({ categorias, value, onChange, criar }: {
  categorias: Categoria[]
  value: string
  onChange: (id: string) => void
  criar: (name: string) => Promise<Categoria>
}) {
  const [nova, setNova] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  if (nova !== null) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium">Nova categoria</span>
        <div className="flex gap-2">
          <input autoFocus className={cellInput} value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Brincos" />
          <Button type="button" loading={loading} onClick={async () => {
            if (!nova.trim()) return
            setLoading(true); setErro('')
            try { const c = await criar(nova); onChange(c.id); setNova(null) }
            catch (e) { setErro(traduzErro(e)) }
            setLoading(false)
          }}>Salvar</Button>
          <Button type="button" variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
        </div>
        {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
      </div>
    )
  }

  return (
    <Select label="Categoria" value={value} onChange={(e) => e.target.value === '__nova' ? setNova('') : onChange(e.target.value)}>
      <option value="">Sem categoria</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__nova">+ Criar categoria</option>
    </Select>
  )
}
