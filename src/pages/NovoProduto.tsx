import { useMemo, useState, type FormEvent } from 'react'
import { parseNum, supabase, traduzErro, type Attrs } from '../lib/supabase'
import type { Categoria } from '../lib/categories'
import CategoriaSelect from '../components/CategoriaSelect'
import { useStore } from '../lib/store'

// Sugestões conforme o segmento escolhido no quiz inicial
const POR_SEGMENTO: Record<string, { exemplo: string; variacoes: boolean; atributos: { nome: string; valores: string }[] }> = {
  roupas: { exemplo: 'Ex.: Camisa polo básica', variacoes: true, atributos: [{ nome: 'Tamanho', valores: 'P, M, G, GG' }, { nome: 'Cor', valores: '' }] },
  calcados: { exemplo: 'Ex.: Tênis casual', variacoes: true, atributos: [{ nome: 'Numeração', valores: '34, 35, 36, 37, 38, 39, 40' }, { nome: 'Cor', valores: '' }] },
  semijoias: { exemplo: 'Ex.: Brinco argola dourada', variacoes: false, atributos: [{ nome: 'Banho', valores: 'Dourado, Prata' }, { nome: 'Tamanho', valores: '' }] },
  cosmeticos: { exemplo: 'Ex.: Perfume floral 100ml', variacoes: false, atributos: [{ nome: 'Volume', valores: '' }, { nome: 'Fragrância', valores: '' }] },
}
const PADRAO = { exemplo: 'Ex.: Nome do produto', variacoes: false, atributos: [{ nome: 'Tamanho', valores: '' }, { nome: 'Cor', valores: '' }] }
import { Alert, Button, Field, Modal, cellInput } from '../components/ui'

type Atributo = { nome: string; valores: string }
type LinhaVar = { sku: string; preco: string; estoque: string }

const splitValores = (s: string) => [...new Set(s.split(',').map((v) => v.trim()).filter(Boolean))]

function combinar(atributos: Atributo[]): Attrs[] {
  const validos = atributos.filter((a) => a.nome.trim() && splitValores(a.valores).length)
  if (!validos.length) return []
  let res: Attrs[] = [{}]
  for (const a of validos) {
    const next: Attrs[] = []
    for (const r of res) for (const v of splitValores(a.valores)) next.push({ ...r, [a.nome.trim()]: v })
    res = next
  }
  return res
}
const chave = (a: Attrs) => Object.values(a).join(' / ')

export default function NovoProduto({ storeId, categorias, criarCategoria, onClose, onCreated }: {
  storeId: string
  categorias: Categoria[]
  criarCategoria: (n: string) => Promise<Categoria>
  onClose: () => void
  onCreated: (productId: string) => void
}) {
  const { current } = useStore()
  const sugestao = POR_SEGMENTO[current?.segment ?? ''] ?? PADRAO
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [comVariacoes, setComVariacoes] = useState(false)
  const [mais, setMais] = useState(false)
  const [sku, setSku] = useState('')
  const [custo, setCusto] = useState('')
  const [preco, setPreco] = useState('')
  const [estoque, setEstoque] = useState('')
  const [minimo, setMinimo] = useState('')
  const [atributos, setAtributos] = useState<Atributo[]>(sugestao.atributos)
  const [linhas, setLinhas] = useState<Record<string, LinhaVar>>({})
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const combinacoes = useMemo(() => combinar(atributos), [atributos])

  const setAttr = (i: number, campo: keyof Atributo, v: string) =>
    setAtributos((as) => as.map((a, j) => (j === i ? { ...a, [campo]: v } : a)))
  const setLinha = (k: string, campo: keyof LinhaVar, v: string) =>
    setLinhas((ls) => ({ ...ls, [k]: { ...{ sku: '', preco: '', estoque: '' }, ...ls[k], [campo]: v } }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (!nome.trim()) return setErro('Informe o nome do produto.')
    const c = parseNum(custo), p = parseNum(preco), m = parseNum(minimo)
    if ([c, p, m].some((n) => Number.isNaN(n) || n < 0)) return setErro('Confira preço, custo e aviso de estoque.')

    let variants: object[]
    if (!comVariacoes) {
      const est = parseNum(estoque)
      if (Number.isNaN(est) || est < 0) return setErro('Confira a quantidade.')
      variants = [{ sku, attributes: {}, unit_cost: c, sale_price: p, initial_stock: est, min_stock: m }]
    } else {
      if (!combinacoes.length) return setErro('Escreva os tamanhos ou cores (ex.: Tamanho: P, M, G).')
      if (combinacoes.length > 100) return setErro('Máximo de 100 variações por produto.')
      variants = []
      for (const attrs of combinacoes) {
        const l = linhas[chave(attrs)] ?? { sku: '', preco: '', estoque: '' }
        const pv = l.preco.trim() ? parseNum(l.preco) : p
        const ev = parseNum(l.estoque)
        if (Number.isNaN(pv) || pv < 0 || Number.isNaN(ev) || ev < 0) return setErro(`Confira os valores da variação ${chave(attrs)}.`)
        variants.push({ sku: l.sku, attributes: attrs, unit_cost: c, sale_price: pv, initial_stock: ev, min_stock: m })
      }
    }

    setLoading(true)
    const { data, error } = await supabase.rpc('create_product_with_variants', {
      _store_id: storeId, _name: nome, _category_id: categoria || null, _variants: variants,
    })
    setLoading(false)
    if (error) return setErro(traduzErro(error))
    onCreated(data as string)
  }

  return (
    <Modal title="Novo produto" onClose={onClose} wide={comVariacoes}>
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome do produto" required autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder={sugestao.exemplo} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de venda (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
          {!comVariacoes
            ? <Field label="Quantidade que tem" inputMode="decimal" value={estoque} onChange={(e) => setEstoque(e.target.value)} placeholder="0" />
            : <div />}
        </div>
        <div>
          <Field label="Quanto você pagou (custo)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="Opcional" />
          <p className="mt-1 text-xs text-muted">Com o custo, o NEXO mostra o seu lucro em cada venda.</p>
        </div>

        <label className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-medium">
          <input type="checkbox" checked={comVariacoes} onChange={(e) => setComVariacoes(e.target.checked)} />
          Tem tamanhos ou cores diferentes
        </label>

        <button type="button" onClick={() => setMais((m) => !m)} className="text-sm font-medium text-brand-700 hover:underline">
          {mais ? '− Menos opções' : '+ Mais opções (categoria, aviso de estoque, código)'}
        </button>
        {mais && (
          <div className="space-y-3 rounded-xl border border-brand-100 p-3">
            <CategoriaSelect categorias={categorias} value={categoria} onChange={setCategoria} criar={criarCategoria} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Avisar quando tiver menos de" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="0" />
              {!comVariacoes && <Field label="Código (opcional)" value={sku} onChange={(e) => setSku(e.target.value)} />}
            </div>
          </div>
        )}

        {!comVariacoes ? null : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted">Escreva as opções separadas por vírgula. Ex.: P, M, G</p>
              {atributos.map((a, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_auto] gap-2">
                  <input className={cellInput} value={a.nome} onChange={(e) => setAttr(i, 'nome', e.target.value)} placeholder="Atributo" />
                  <input className={cellInput} value={a.valores} onChange={(e) => setAttr(i, 'valores', e.target.value)} placeholder="Ex.: P, M, G" />
                  <button type="button" className="px-2 text-muted hover:text-red-600" onClick={() => setAtributos((as) => as.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {atributos.length < 3 && (
                <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => setAtributos((as) => [...as, { nome: '', valores: '' }])}>+ Adicionar atributo</button>
              )}
            </div>

            {combinacoes.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-brand-100">
                <table className="w-full text-sm">
                  <thead className="bg-brand-50/60 text-left text-xs text-muted">
                    <tr><th className="px-3 py-2">Variação</th><th className="px-3 py-2">Quantidade</th><th className="px-3 py-2">Preço (se diferente)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {combinacoes.map((attrs) => {
                      const k = chave(attrs); const l = linhas[k]
                      return (
                        <tr key={k}>
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{k}</td>
                          <td className="px-3 py-2"><input className={cellInput} inputMode="decimal" value={l?.estoque ?? ''} onChange={(e) => setLinha(k, 'estoque', e.target.value)} placeholder="0" /></td>
                          <td className="px-3 py-2"><input className={cellInput} inputMode="decimal" value={l?.preco ?? ''} onChange={(e) => setLinha(k, 'preco', e.target.value)} placeholder={preco || '0,00'} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Salvar produto</Button>
        </div>
      </form>
    </Modal>
  )
}
