import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { brl, labelVariant, qtd, supabase, type Attrs } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useCategorias } from '../lib/categories'
import { Badge, Button, Card, Spinner } from '../components/ui'
import NovoProduto from './NovoProduto'

type Linha = {
  variant_id: string; product_id: string; product_name: string; category_id: string | null
  is_default: boolean; sku: string | null; attributes: Attrs; sale_price: string
  stock_quantity: string; min_stock: string; active: boolean
}

type Produto = {
  id: string; nome: string; categoria: string | null; ativo: boolean
  variantes: Linha[]; estoque: number; precoMin: number; precoMax: number; baixo: number
}

export default function Produtos() {
  const { current, canManage } = useStore()
  const { categorias, criar } = useCategorias(current?.id)
  const nav = useNavigate()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    if (!current) return
    const { data } = await supabase.rpc('get_product_catalog', { _store_id: current.id })
    setLinhas((data as Linha[]) ?? [])
    setLoading(false)
  }, [current])

  useEffect(() => { carregar() }, [carregar])

  const produtos = useMemo(() => {
    const nomeCat = new Map(categorias.map((c) => [c.id, c.name]))
    const map = new Map<string, Produto>()
    for (const l of linhas) {
      let p = map.get(l.product_id)
      if (!p) {
        p = { id: l.product_id, nome: l.product_name, categoria: l.category_id ? nomeCat.get(l.category_id) ?? null : null,
          ativo: false, variantes: [], estoque: 0, precoMin: Infinity, precoMax: 0, baixo: 0 }
        map.set(l.product_id, p)
      }
      p.variantes.push(l)
      if (l.active) {
        p.ativo = true
        const est = Number(l.stock_quantity)
        p.estoque += est
        p.precoMin = Math.min(p.precoMin, Number(l.sale_price))
        p.precoMax = Math.max(p.precoMax, Number(l.sale_price))
        if (est <= Number(l.min_stock)) p.baixo++
      }
    }
    const termo = busca.trim().toLowerCase()
    return [...map.values()]
      .filter((p) => mostrarInativos || p.ativo)
      .filter((p) => !cat || p.variantes[0].category_id === cat)
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo) ||
        p.variantes.some((v) => v.sku?.toLowerCase().includes(termo) || labelVariant(v.attributes).toLowerCase().includes(termo)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [linhas, categorias, busca, cat, mostrarInativos])

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos e estoque</h1>
          <p className="text-sm text-muted">{produtos.length} produto(s)</p>
        </div>
        {canManage && <Button onClick={() => setNovo(true)}>+ Novo produto</Button>}
      </div>

      <div className="flex flex-wrap gap-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, código, tamanho, cor…"
          className="min-w-[220px] flex-1 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos
        </label>
      </div>

      {produtos.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-medium">{linhas.length === 0 ? 'Nenhum produto cadastrado ainda.' : 'Nenhum produto encontrado.'}</p>
          {canManage && linhas.length === 0 && <Button className="mt-4" onClick={() => setNovo(true)}>Cadastrar o primeiro produto</Button>}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Categoria</th>
                <th className="px-4 py-3 text-right font-medium">Preço</th>
                <th className="px-4 py-3 text-right font-medium">Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {produtos.map((p) => (
                <tr key={p.id} onClick={canManage ? () => nav(`/produtos/${p.id}`) : undefined}
                  className={canManage ? 'cursor-pointer hover:bg-brand-50/50' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.nome}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                      {p.variantes.length > 1 && <span>{p.variantes.length} variações</span>}
                      {!p.ativo && <Badge tone="gray">Inativo</Badge>}
                      {p.baixo > 0 && p.ativo && <Badge tone="red">{p.variantes.length > 1 ? `${p.baixo} com estoque baixo` : 'Estoque baixo'}</Badge>}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{p.categoria ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {p.precoMin === Infinity ? '—' : p.precoMin === p.precoMax ? brl(p.precoMin) : `${brl(p.precoMin)} – ${brl(p.precoMax)}`}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${p.baixo > 0 && p.ativo ? 'text-red-600' : ''}`}>{qtd(p.estoque)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {novo && current && (
        <NovoProduto storeId={current.id} categorias={categorias} criarCategoria={criar}
          onClose={() => setNovo(false)}
          onCreated={(id) => { setNovo(false); nav(`/produtos/${id}`) }} />
      )}
    </div>
  )
}
