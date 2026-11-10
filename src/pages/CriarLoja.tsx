import { useState, type FormEvent } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Alert, AuthShell, Button, Field } from '../components/ui'

export default function CriarLoja() {
  const { reload, select } = useStore()
  const [nome, setNome] = useState('')
  const [doc, setDoc] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true)
    const { data, error } = await supabase.rpc('create_store', { _name: nome, _document: doc || null })
    if (error) { setLoading(false); return setErro(traduzErro(error)) }
    select(data as string)
    await reload()
    setLoading(false)
  }

  return (
    <AuthShell title="Cadastre sua loja" subtitle="Último passo antes de começar">
      <form onSubmit={onSubmit} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome da loja" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Brilho Semijoias" />
        <Field label="CPF ou CNPJ (opcional)" value={doc} onChange={(e) => setDoc(e.target.value)} />
        <Button type="submit" loading={loading} className="w-full">Criar loja</Button>
        <button type="button" onClick={() => supabase.auth.signOut()} className="block w-full text-center text-sm text-muted hover:underline">Sair</button>
      </form>
    </AuthShell>
  )
}
