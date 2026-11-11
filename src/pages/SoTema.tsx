import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'
import { aplicarTema, type Tema } from '../lib/temas'
import TemaPicker from '../components/TemaPicker'
import { AuthShell, Button } from '../components/ui'

/** Para vendedores/gerentes convidados: só escolhem o tema na primeira entrada. */
export default function SoTema() {
  const { perfil, setTema, reload } = usePerfil()
  const [tema, setLocal] = useState<Tema>(perfil?.theme ?? 'nexo')
  const [salvando, setSalvando] = useState(false)
  return (
    <AuthShell title="Escolha a cara do seu NEXO" subtitle="Dá para trocar depois em Dúvidas.">
      <TemaPicker value={tema} onChange={(t) => { setLocal(t); aplicarTema(t) }} />
      <Button className="mt-5 w-full" loading={salvando} onClick={async () => {
        setSalvando(true); await setTema(tema); await supabase.rpc('skip_onboarding'); await reload(); setSalvando(false)
      }}>Entrar no NEXO →</Button>
    </AuthShell>
  )
}
