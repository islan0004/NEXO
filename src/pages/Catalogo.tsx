import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { abrirWhatsApp } from '../lib/mensagens'
import { Dica } from '../components/Tour'
import Bloqueado from '../components/Bloqueado'
import { Button, Card, Field, Spinner } from '../components/ui'

const paraSlug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export default function Catalogo() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo online</h1>
        <p className="text-sm text-muted">Uma vitrine da sua loja com link para mandar no WhatsApp e colocar na bio do Instagram</p>
      </div>
      <Bloqueado recurso="catalogo" titulo="Catálogo online" texto="Uma vitrine com fotos e preços. O cliente escolhe e o pedido chega pronto no seu WhatsApp.">
        <Dica id="catalogo" titulo="Seu catálogo" texto="Ligue o catálogo, escolha o endereço e coloque seu WhatsApp. Para aparecer foto, abra o produto e toque em “Adicionar foto”." />
        <Config />
      </Bloqueado>
    </div>
  )
}

function Config() {
  const { current } = useStore()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [ativo, setAtivo] = useState(false)
  const [slug, setSlug] = useState('')
  const [zap, setZap] = useState('')
  const [sobre, setSobre] = useState('')
  const [salvo, setSalvo] = useState<{ ativo: boolean; slug: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!current) return
    supabase.from('stores').select('slug, catalog_enabled, catalog_whatsapp, catalog_about').eq('id', current.id).single().then(({ data }) => {
      setAtivo(!!data?.catalog_enabled); setSlug(data?.slug ?? paraSlug(current.name)); setZap(data?.catalog_whatsapp ?? ''); setSobre(data?.catalog_about ?? '')
      setSalvo(data?.slug ? { ativo: !!data.catalog_enabled, slug: data.slug } : null)
      setLoading(false)
    })
  }, [current])

  async function salvar() {
    const s = paraSlug(slug)
    if (s.length < 3) return toast('O endereço precisa ter pelo menos 3 letras.', 'erro')
    if (ativo && zap.replace(/\D/g, '').length < 10) return toast('Informe o WhatsApp com DDD para receber os pedidos.', 'erro')
    setSalvando(true)
    const { error } = await supabase.rpc('update_catalog', { _store_id: current!.id, _enabled: ativo, _slug: s, _whatsapp: zap, _about: sobre })
    setSalvando(false)
    if (error) return toast(error.message.includes('slug_taken') ? 'Esse endereço já é de outra loja. Tente outro.' : traduzErro(error), 'erro')
    setSlug(s); setSalvo({ ativo, slug: s })
    toast(ativo ? 'Catálogo no ar!' : 'Catálogo salvo (desligado)')
  }

  if (loading) return <Spinner />
  const link = salvo ? `${window.location.origin}/loja/${salvo.slug}` : ''

  return (
    <div className="space-y-4">
      {salvo?.ativo && (
        <Card className="space-y-3 border-2 border-brand-300">
          <div className="text-sm font-semibold text-brand-900">✅ Seu catálogo está no ar</div>
          <div className="break-all rounded-xl bg-brand-50 p-3 font-mono text-xs">{link}</div>
          <div className="flex flex-wrap gap-2">
            <a href={link} target="_blank" rel="noreferrer" className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">Abrir catálogo</a>
            <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copiado') }}>Copiar link</Button>
            <a href={abrirWhatsApp(`Confira nossos produtos e faça seu pedido pelo catálogo da ${current?.name}: ${link}`)} target="_blank" rel="noreferrer"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-800 hover:bg-brand-100">Divulgar no WhatsApp</a>
          </div>
        </Card>
      )}
      <Card className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Catálogo ligado (visível para qualquer pessoa com o link)</label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Endereço do catálogo</span>
          <div className="flex items-center overflow-hidden rounded-xl border border-brand-200 bg-white text-sm">
            <span className="whitespace-nowrap bg-brand-50 px-3 py-2.5 text-muted">/loja/</span>
            <input className="w-full px-2 py-2.5 outline-none" value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(paraSlug(slug))} />
          </div>
        </div>
        <Field label="WhatsApp que recebe os pedidos" inputMode="tel" value={zap} onChange={(e) => setZap(e.target.value)} placeholder="(82) 99999-0000" />
        <Field label="Recado no topo do catálogo (opcional)" value={sobre} onChange={(e) => setSobre(e.target.value)} placeholder="Ex.: Entregamos em Arapiraca. Pix ou cartão." />
        <p className="text-xs text-muted">Aparecem os produtos ativos com preço. Os sem estoque aparecem como “sob encomenda”. Fotos: abra o produto em <Link to="/produtos" className="text-brand-700 hover:underline">Produtos</Link>.</p>
        <Button className="w-full" loading={salvando} onClick={salvar}>Salvar</Button>
      </Card>
    </div>
  )
}
