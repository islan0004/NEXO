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
  product_name_required: 'Informe o nome do produto.',
  duplicate_variant: 'Há variações repetidas. Cada combinação deve ser única.',
  invalid_variants: 'Confira os valores das variações (não podem ser negativos).',
  insufficient_stock: 'Estoque insuficiente para essa saída.',
  reason_required: 'Informe o motivo do ajuste.',
  invalid_quantity: 'Informe uma quantidade válida.',
  product_variants_store_sku_uidx: 'Já existe um produto com esse código (SKU).',
  categories_store_id_type_name_key: 'Já existe uma categoria com esse nome.',
  invalid_product_category: 'Categoria inválida.',
}

export function traduzErro(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err)
  for (const [k, v] of Object.entries(messages)) if (msg.includes(k)) return v
  return 'Algo deu errado. Tente novamente.'
}

export const brl = (v: number | string | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Aceita "1.234,56", "1234,56" ou "1234.56". Retorna NaN se inválido. */
export function parseNum(s: string): number {
  const t = s.trim()
  if (!t) return 0
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN
}

export const qtd = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export type Attrs = Record<string, string>
export const labelVariant = (a: Attrs | null | undefined) =>
  a && Object.keys(a).length ? Object.values(a).join(' / ') : 'Padrão'
