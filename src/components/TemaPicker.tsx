import { TEMAS, type Tema } from '../lib/temas'
import { usePlano } from '../lib/planos'

/** Grade de temas com prévia em miniatura do app. */
export default function TemaPicker({ value, onChange, semTrava }: { value: Tema; onChange: (t: Tema) => void; semTrava?: boolean }) {
  const { pode } = usePlano()
  const liberado = (t: Tema) => semTrava || t === 'nexo' || t === value || (t === 'noir' ? pode('noir') : pode('temas'))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {TEMAS.map((t) => {
        const [principal, suave, fundo] = t.cores
        const escuro = t.id === 'noir'
        const ativo = value === t.id
        return (
          <button key={t.id} type="button" disabled={!liberado(t.id)} onClick={() => onChange(t.id)}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${ativo ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}>
            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-black/10" style={{ background: fundo }}>
              <div className="h-3" style={{ background: principal }} />
              <div className="space-y-1 p-1.5">
                <div className="h-2 w-10 rounded" style={{ background: suave }} />
                <div className="h-2 w-14 rounded" style={{ background: escuro ? '#2a2418' : '#e5e7eb' }} />
                <div className="h-3 w-8 rounded" style={{ background: principal }} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">{t.nome}{ativo && <span className="text-brand-700">✓</span>}{!liberado(t.id) && <span className="text-xs font-normal text-muted">🔒 {t.id === 'noir' ? 'Black' : 'Pro'}</span>}</div>
              <div className="text-xs text-muted">{t.descricao}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
