import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RECURSOS, nomePlano, usePlano, type Recurso } from '../lib/planos'
import { Card } from './ui'

/** Mostra o conteúdo se o plano permite; senão, um convite para fazer upgrade. */
export default function Bloqueado({ recurso, titulo, texto, children, compacto }: {
  recurso: Recurso; titulo: string; texto: string; children?: ReactNode; compacto?: boolean
}) {
  const { pode } = usePlano()
  if (pode(recurso)) return <>{children}</>
  const minimo = nomePlano(RECURSOS[recurso])
  if (compacto) {
    return (
      <Link to="/planos" className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 px-3 py-2 text-sm text-brand-800 hover:bg-brand-50">
        🔒 <span><strong>{titulo}</strong> · disponível no {minimo}</span>
      </Link>
    )
  }
  return (
    <Card className="py-10 text-center">
      <div className="text-3xl">🔒</div>
      <h2 className="mt-2 text-lg font-semibold">{titulo}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{texto}</p>
      <Link to="/planos" className="mt-4 inline-block rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">Ver o {minimo}</Link>
    </Card>
  )
}
