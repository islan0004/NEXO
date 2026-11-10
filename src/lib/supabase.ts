import { createClient } from '@supabase/supabase-js'

// Chave publicável: é pública por natureza. A segurança vem do RLS e das funções no banco.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://mdnbpxwibkvxuzezobss.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_HzIgbM6erqKd35PsihgqnA_C67XPSb3'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const messages: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.',
  'User already registered': 'Já existe uma conta com este e-mail.',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
  'email rate limit exceeded': 'Muitas tentativas de e-mail. Aguarde alguns minutos e tente de novo.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Você não tem permissão para isso.',
  store_name_required: 'Informe o nome da loja.',
}

export function traduzErro(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err)
  for (const [k, v] of Object.entries(messages)) if (msg.includes(k)) return v
  return 'Algo deu errado. Tente novamente.'
}

export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
