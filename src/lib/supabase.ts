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
  payment_total_mismatch: 'A soma dos pagamentos precisa ser igual ao total da venda.',
  discount_exceeds_subtotal: 'O desconto é maior que o valor da venda.',
  invalid_variant: 'Um dos produtos está inativo ou não existe mais.',
  invalid_items: 'Confira quantidades e preços dos itens.',
  invalid_payment: 'Confira os valores dos pagamentos.',
  sale_already_canceled: 'Esta venda já foi cancelada.',
  idempotency_key_reused: 'Esta operação já foi registrada.',
  customer_required: 'Para vender fiado, escolha o cliente.',
  invalid_customer: 'Cliente inválido ou inativo.',
  'plan_required:pro': 'Esse recurso faz parte do plano Pro. Veja em Planos.',
  'plan_required:black': 'Esse recurso faz parte do plano Black. Veja em Planos.',
  cash_already_open: 'O caixa já está aberto.',
  cash_closed: 'Esse caixa já foi fechado.',
  sale_has_returns: 'Essa venda tem devolução registrada e não pode ser cancelada.',
  return_exceeds_sold: 'A quantidade devolvida é maior que a vendida.',
  customer_required_credit: 'Para dar crédito na loja, a venda precisa ter um cliente.',
  invalid_refund: 'Escolha como devolver o valor.',
  invalid_rows: 'A planilha está vazia ou tem mais de 1000 linhas.',
  loyalty_not_ready: 'O cliente ainda não completou o cartão.',
  reward_required: 'Escreva qual é o prêmio do cartão.',
  invalid_every: 'O cartão precisa ter entre 2 e 50 compras.',
  plan_user_limit: 'O plano da loja já está no limite de usuários.',
  slug_taken: 'Esse endereço já é de outra loja.',
  amount_exceeds_balance: 'O valor é maior que a dívida do cliente.',
  invalid_amount: 'Informe um valor válido.',
  invalid_date: 'A data não pode ser no futuro.',
  debt_already_paid: 'Essa dívida já tem pagamento registrado e não pode ser excluída.',
}

export const METODOS: Record<string, string> = {
  cash: 'Dinheiro', pix: 'Pix', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito', fiado: 'Fiado',
}
export const METODOS_RECEBIMENTO = ['cash', 'pix', 'debit_card', 'credit_card'] as const

/** Link do WhatsApp com DDI 55 quando o número vier só com DDD */
export function linkWhatsApp(telefone: string, texto: string) {
  let n = telefone.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
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
  // padrão BR: vírgula decimal; ponto com grupos de 3 dígitos é milhar (15.000 = 15000)
  const n = t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN
}

export const qtd = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export type Attrs = Record<string, string>
// O Postgres (jsonb) reordena as chaves; mostramos Tamanho primeiro, depois Cor, depois o resto
const ORDEM = ['tamanho', 'numeração', 'numero', 'cor']
const peso = (k: string) => { const i = ORDEM.indexOf(k.toLowerCase()); return i < 0 ? 99 : i }
export const labelVariant = (a: Attrs | null | undefined) =>
  a && Object.keys(a).length
    ? Object.keys(a).sort((x, y) => peso(x) - peso(y) || x.localeCompare(y, 'pt-BR')).map((k) => a[k]).join(' / ')
    : 'Padrão'

export const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
