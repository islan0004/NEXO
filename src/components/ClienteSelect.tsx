import { useEffect, useMemo, useState } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { Button, cellInput } from './ui'

export type Cliente = { id: string; name: string; phone: string | null }

/** Busca cliente da loja ou cadastra um novo na hora (nome + telefone). */
export default function ClienteSelect({ storeId, value, onChange }: {
  storeId: string
  value: Cliente | null
  onChange: (c: Cliente | null) => void
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.from('customers').select('id, name, phone').eq('store_id', storeId).eq('active', true).order('name')
      .then(({ data }) => setClientes(data ?? []))
  }, [storeId])

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return []
    return clientes.filter((c) => c.name.toLowerCase().includes(t) || c.phone?.includes(t)).slice(0, 8)
  }, [busca, clientes])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm">
        <div><div className="font-medium">{value.name}</div>{value.phone && <div className="text-xs text-muted">{value.phone}</div>}</div>
        <button className="text-brand-700 hover:underline" onClick={() => onChange(null)}>Trocar</button>
      </div>
    )
  }

  if (novo) {
    return (
      <div className="space-y-2 rounded-xl border border-brand-100 p-3">
        <input autoFocus className={cellInput} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
        <input className={cellInput} inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="WhatsApp com DDD (opcional)" />
        {erro && <p className="text-xs text-red-600">{erro}</p>}
        <div className="flex gap-2">
          <Button type="button" loading={salvando} onClick={async () => {
            if (!nome.trim()) return setErro('Informe o nome.')
            setSalvando(true); setErro('')
            const { data, error } = await supabase.from('customers')
              .insert({ store_id: storeId, name: nome.trim(), phone: tel.trim() || null })
              .select('id, name, phone').single()
            setSalvando(false)
            if (error) return setErro(traduzErro(error))
            setClientes((cs) => [...cs, data])
            onChange(data); setNovo(false); setNome(''); setTel('')
          }}>Salvar cliente</Button>
          <Button type="button" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <input className={cellInput} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome ou telefone" />
      {achados.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-xl border border-brand-100 bg-white shadow-lg">
          {achados.map((c) => (
            <li key={c.id}>
              <button className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { onChange(c); setBusca('') }}>
                {c.name}{c.phone && <span className="text-xs text-muted"> · {c.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="mt-1 text-sm text-brand-700 hover:underline" onClick={() => { setNovo(true); setNome(busca) }}>+ Novo cliente</button>
    </div>
  )
}
