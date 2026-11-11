import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { usePerfil } from '../lib/perfil'
import { useStore } from '../lib/store'

type Passo = { alvos: string[]; titulo: string; texto: string; gestor?: boolean }

/** Tutorial da primeira entrada: aponta para cada parte do app. Sem alvo visível, aparece centralizado. */
const PASSOS: Passo[] = [
  { alvos: [], titulo: 'Bem-vindo ao NEXO! 🎉', texto: 'Vou te mostrar rapidinho onde fica cada coisa. São poucos passos.' },
  { alvos: ['[data-tour="vender-fab"]', '[data-tour="nova-venda"]'], titulo: 'Vender', texto: 'Toque aqui para registrar uma venda. Busque o produto, escolha o pagamento e pronto: o estoque baixa sozinho.' },
  { alvos: ['[data-tour="nav-produtos"]', '[data-tour="menu"]'], titulo: 'Produtos e estoque', texto: 'Cadastre seus produtos com custo e preço. Com o custo, o NEXO calcula o seu lucro em cada venda.' },
  { alvos: ['[data-tour="nav-fiado"]', '[data-tour="menu"]'], titulo: 'Fiado', texto: 'Venda fiado com o nome do cliente, receba aos poucos e cobre pelo WhatsApp com um toque.' },
  { alvos: ['[data-tour="nav-relatorios"]', '[data-tour="menu"]'], titulo: 'Relatórios', texto: 'Veja faturamento, lucro e os produtos que mais vendem no dia, na semana ou no mês.', gestor: true },
  { alvos: ['[data-tour="fechar-dia"]'], titulo: 'Fechar o dia', texto: 'No fim do expediente, mande o resumo do dia para o seu WhatsApp.', gestor: true },
  { alvos: ['[data-tour="nav-duvidas"]', '[data-tour="menu"]'], titulo: 'Dúvidas', texto: 'Ficou alguma dúvida? As respostas rápidas estão aqui. Bom trabalho! 💪' },
]

function visivel(sel: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? el : null
}

export function Tour() {
  const { perfil, setTour } = usePerfil()
  const { canManage } = useStore()
  const passos = PASSOS.filter((p) => !p.gestor || canManage)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [noMenu, setNoMenu] = useState(false)
  const ativo = !!perfil && !perfil.tour.done && !perfil.tour.global
  const passo = passos[i]

  useLayoutEffect(() => {
    if (!ativo || !passo) return
    const medir = () => {
      const el = passo.alvos.map(visivel).find(Boolean) ?? null
      if (el) el.scrollIntoView({ block: 'nearest' })
      setRect(el ? el.getBoundingClientRect() : null)
      setNoMenu(el?.dataset.tour === 'menu')
    }
    const t = setTimeout(medir, 80)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [ativo, passo])

  if (!ativo || !passo) return null

  const ultimo = i === passos.length - 1
  const ok = () => (ultimo ? setTour({ ...perfil!.tour, global: true }) : setI(i + 1))
  const pular = () => setTour({ ...perfil!.tour, done: true, global: true })

  return <Balao rect={rect} titulo={passo.titulo} texto={noMenu ? `${passo.texto} Fica no Menu, aqui em cima.` : passo.texto} progresso={`${i + 1}/${passos.length}`} ok={ok} pular={pular} okTexto={ultimo ? 'Começar' : 'OK'} />
}

/** Dica de primeira visita em uma tela (aparece depois do tutorial geral). */
export function Dica({ id, titulo, texto }: { id: string; titulo: string; texto: string }) {
  const { perfil, setTour } = usePerfil()
  const [pronto, setPronto] = useState(false)
  useEffect(() => { const t = setTimeout(() => setPronto(true), 350); return () => clearTimeout(t) }, [])
  if (!pronto || !perfil || perfil.tour.done || !perfil.tour.global || perfil.tour.seen?.includes(id)) return null
  return (
    <Balao rect={null} titulo={titulo} texto={texto}
      ok={() => setTour({ ...perfil.tour, seen: [...(perfil.tour.seen ?? []), id] })}
      pular={() => setTour({ ...perfil.tour, done: true })} okTexto="OK, entendi" />
  )
}

function Balao({ rect, titulo, texto, progresso, ok, pular, okTexto }: {
  rect: DOMRect | null; titulo: string; texto: string; progresso?: string; ok: () => void; pular: () => void; okTexto: string
}) {
  const pad = 6
  const vw = window.innerWidth, vh = window.innerHeight
  const largura = Math.min(320, vw - 24)
  let estilo: CSSProperties = { left: (vw - largura) / 2, top: vh / 2 - 90, width: largura }
  if (rect) {
    const abaixo = rect.bottom + 12 + 170 < vh
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - largura / 2), vw - largura - 12)
    estilo = { left, width: largura, ...(abaixo ? { top: rect.bottom + 12 } : { top: Math.max(12, rect.top - 12 - 170) }) }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      {rect ? (
        <div className="pointer-events-none absolute rounded-xl transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(15,12,30,.55)', outline: '2px solid var(--color-brand-400)' }} />
      ) : <div className="absolute inset-0 bg-ink/50" />}
      <div className="nexo-toast absolute rounded-2xl border border-brand-100 bg-white p-4 shadow-2xl" style={estilo}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{titulo}</h3>
          {progresso && <span className="text-xs text-muted">{progresso}</span>}
        </div>
        <p className="mt-1 text-sm text-muted">{texto}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={pular} className="text-sm text-muted hover:text-ink hover:underline">Pular tudo</button>
          <button onClick={ok} className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">{okTexto}</button>
        </div>
      </div>
    </div>
  )
}
