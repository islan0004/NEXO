// NEXO × Asaas: cria a assinatura do lojista e recebe os avisos de pagamento.
// Rotas (POST): ?acao=assinar | ?acao=webhook | ?acao=configurar (só admin da plataforma)
// Segredos: ASAAS_API_KEY (obrigatório), ASAAS_BASE_URL (padrão: sandbox), ASAAS_WEBHOOK_TOKEN (opcional)
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// chave: segredo da função ou, se não houver, a salva pelo Admin (tabela platform_secrets, só o servidor lê)
let ASAAS_KEY = (Deno.env.get('ASAAS_API_KEY') ?? '').trim()
let ASAAS_URL = Deno.env.get('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3'
async function carregarChave() {
  if (!Deno.env.get('ASAAS_API_KEY')) {
    const { data } = await admin.from('platform_secrets').select('value').eq('name', 'ASAAS_API_KEY').maybeSingle()
    ASAAS_KEY = (data?.value ?? '').trim()
  }
  if (!Deno.env.get('ASAAS_BASE_URL')) {
    ASAAS_URL = ASAAS_KEY.startsWith('$aact_prod_') ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
  }
}
// token do webhook: derivado da service key (não precisa de outro segredo; ninguém de fora consegue calcular)
const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? [...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(`nexo-asaas-webhook:${SERVICE_KEY}`)))].map((b) => b.toString(16).padStart(2, '0')).join('')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function asaas(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'NEXO/1.0', access_token: ASAAS_KEY },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  let d: any = null
  try { d = t ? JSON.parse(t) : null } catch { d = { raw: t } }
  if (!r.ok) {
    const msg = d?.errors?.[0]?.description ?? `Erro ${r.status} no Asaas`
    throw new Error(msg)
  }
  return d
}

function iguais(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function maisUmMes(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // último dia do mês seguinte
  const mes = m === 12 ? 1 : m + 1
  const ano = m === 12 ? y + 1 : y
  // fim do período: dia seguinte ao vencimento + 1 mês, às 23:59 de Brasília
  return new Date(`${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}T23:59:59-03:00`).toISOString()
}

// ---------------- assinar ----------------
async function assinar(req: Request) {
  if (!ASAAS_KEY) return json({ error: 'Cobrança ainda não configurada.' }, 503)
  const auth = req.headers.get('Authorization') ?? ''
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: u } = await user.auth.getUser()
  if (!u?.user) return json({ error: 'Entre na sua conta.' }, 401)

  const { store_id, plan, nome, documento, email } = await req.json()
  if (!['start', 'pro', 'black'].includes(plan)) return json({ error: 'Plano inválido.' }, 400)
  const doc = String(documento ?? '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) return json({ error: 'Informe um CPF ou CNPJ válido.' }, 400)
  if (!String(nome ?? '').trim()) return json({ error: 'Informe o nome.' }, 400)

  // só o dono assina (checado com a sessão do próprio usuário)
  const { data: dono } = await user.rpc('has_store_role', { _store_id: store_id, _roles: ['owner'] })
  if (!dono) return json({ error: 'Só o dono da loja pode assinar.' }, 403)

  const [{ data: ss }, { data: ps }, { data: loja }] = await Promise.all([
    admin.from('store_subscriptions').select('*').eq('store_id', store_id).single(),
    admin.from('platform_settings').select('price_start, price_pro, price_black').single(),
    admin.from('stores').select('name').eq('id', store_id).single(),
  ])
  const valor = Number({ start: ps?.price_start, pro: ps?.price_pro, black: ps?.price_black }[plan as 'start'])
  if (!valor) return json({ error: 'Preço do plano não definido.' }, 500)

  // cliente no Asaas (sem notificações pagas do Asaas: o aviso aparece no app)
  let cliente = ss?.asaas_customer_id
  if (!cliente) {
    const c = await asaas('/customers', 'POST', {
      name: String(nome).trim(), cpfCnpj: doc, email: email || u.user.email, externalReference: store_id, notificationDisabled: true,
    })
    cliente = c.id
  } else {
    await asaas(`/customers/${cliente}`, 'PUT', { name: String(nome).trim(), cpfCnpj: doc })
  }

  // troca de plano: cancela a assinatura anterior e cria a nova
  if (ss?.asaas_subscription_id) {
    try { await asaas(`/subscriptions/${ss.asaas_subscription_id}`, 'DELETE') } catch { /* já removida */ }
  }
  // se ainda tem dias pagos ou de teste, a 1ª cobrança vence no fim deles; senão, hoje
  const fimAtual = ss?.status === 'trial' ? ss?.trial_ends_at : ss?.status === 'active' ? ss?.current_period_end : null
  const hoje = hojeSP()
  const vencimento = fimAtual && new Date(fimAtual) > new Date()
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(fimAtual))
    : hoje
  const nomes = { start: 'NEXO Start', pro: 'NEXO Pro', black: 'NEXO Black' } as const
  const sub = await asaas('/subscriptions', 'POST', {
    customer: cliente, billingType: 'UNDEFINED', value: valor, nextDueDate: vencimento, cycle: 'MONTHLY',
    description: `${nomes[plan as 'start']} · ${loja?.name ?? ''}`.slice(0, 500), externalReference: `${store_id}|${plan}`,
  })
  const pags = await asaas(`/subscriptions/${sub.id}/payments`)
  const primeira = pags?.data?.[0]

  await admin.from('store_subscriptions').update({
    asaas_customer_id: cliente, asaas_subscription_id: sub.id, pending_plan: plan,
    invoice_url: primeira?.invoiceUrl ?? null, invoice_due: primeira?.dueDate ?? vencimento,
    // durante o período já pago/de teste, a loja já fica no plano escolhido
    ...(ss?.status === 'active' && fimAtual && new Date(fimAtual) > new Date() ? { plan, monthly_price: valor } : {}),
  }).eq('store_id', store_id)

  return json({ invoice_url: primeira?.invoiceUrl ?? null, due: primeira?.dueDate ?? vencimento, value: valor, payment_id: primeira?.id ?? null })
}

// ---------------- webhook ----------------
async function webhook(req: Request) {
  if (!WEBHOOK_TOKEN || !iguais(req.headers.get('asaas-access-token') ?? '', WEBHOOK_TOKEN)) return json({ error: 'forbidden' }, 401)
  const ev = await req.json()
  const p = ev?.payment
  if (!ev?.id || !p?.subscription) return json({ ok: true, ignorado: true })

  const { data: ss } = await admin.from('store_subscriptions').select('store_id, pending_plan, plan, current_period_end')
    .eq('asaas_subscription_id', p.subscription).maybeSingle()
  // evento já processado? (o Asaas reenvia em caso de falha; o processamento abaixo é idempotente)
  const { data: ja } = await admin.from('billing_events').select('id').eq('id', ev.id).maybeSingle()
  if (ja) return json({ ok: true, repetido: true })
  if (!ss) {
    await admin.from('billing_events').insert({ id: ev.id, event: ev.event, store_id: null, payload: ev })
    return json({ ok: true, sem_loja: true })
  }

  if (ev.event === 'PAYMENT_CONFIRMED' || ev.event === 'PAYMENT_RECEIVED') {
    const plano = ss.pending_plan ?? ss.plan ?? 'start'
    const fimNovo = maisUmMes(p.dueDate ?? hojeSP())
    const fim = ss.current_period_end && new Date(ss.current_period_end) > new Date(fimNovo) ? ss.current_period_end : fimNovo
    await admin.from('store_subscriptions').update({
      status: 'active', plan: plano, monthly_price: p.value, current_period_end: fim, invoice_url: null, invoice_due: null,
    }).eq('store_id', ss.store_id)
    // registra no Admin uma vez por cobrança (cartão manda CONFIRMED e depois RECEIVED)
    const { data: reg } = await admin.from('platform_payments').select('id').eq('note', `Asaas ${p.id}`).maybeSingle()
    if (!reg) await admin.from('platform_payments').insert({
      store_id: ss.store_id, amount: p.value, method: String(p.billingType ?? 'asaas').toLowerCase(), months: 1, note: `Asaas ${p.id}`,
    })
  } else if (ev.event === 'PAYMENT_CREATED' || ev.event === 'PAYMENT_UPDATED') {
    if (p.status === 'PENDING' || p.status === 'OVERDUE') {
      await admin.from('store_subscriptions').update({ invoice_url: p.invoiceUrl, invoice_due: p.dueDate }).eq('store_id', ss.store_id)
    }
  } else if (ev.event === 'PAYMENT_OVERDUE') {
    await admin.from('store_subscriptions').update({ status: 'past_due', invoice_url: p.invoiceUrl, invoice_due: p.dueDate }).eq('store_id', ss.store_id)
  } else if (ev.event === 'PAYMENT_REFUNDED' || ev.event === 'PAYMENT_DELETED') {
    // nada automático: o admin decide no painel
  }
  await admin.from('billing_events').insert({ id: ev.id, event: ev.event, store_id: ss.store_id, payload: ev })
  return json({ ok: true })
}

// ---------------- configurar (admin) ----------------
async function configurar(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: ehAdmin } = await user.rpc('is_platform_admin')
  if (!ehAdmin) return json({ error: 'forbidden' }, 403)
  if (!ASAAS_KEY) return json({ ok: false, chave: false, error: 'Falta salvar a chave do Asaas aqui em Configurações.' })
  const conta = await asaas('/myAccount/commercialInfo').catch((e) => ({ erro: (e as Error).message }))
  if ((conta as any)?.erro) return json({ ok: false, chave: true, error: `A chave não funcionou: ${(conta as any).erro}` })
  const url = `${SUPABASE_URL}/functions/v1/asaas?acao=webhook`
  const lista = await asaas('/webhooks')
  const existente = (lista?.data ?? []).find((w: any) => w.url === url)
  const corpo = {
    name: 'NEXO assinaturas', url, email: (await user.auth.getUser()).data.user?.email, enabled: true, interrupted: false,
    apiVersion: 3, authToken: WEBHOOK_TOKEN, sendType: 'SEQUENTIALLY',
    events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED'],
  }
  const w = existente ? await asaas(`/webhooks/${existente.id}`, 'PUT', corpo) : await asaas('/webhooks', 'POST', corpo)
  return json({ ok: true, ambiente: ASAAS_URL.includes('sandbox') ? 'teste' : 'produção', webhook: w?.id ?? existente?.id })
}

// ---------------- simular pagamento (só sandbox, só admin) ----------------
async function simular(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: ehAdmin } = await user.rpc('is_platform_admin')
  if (!ehAdmin || !ASAAS_URL.includes('sandbox')) return json({ error: 'forbidden' }, 403)
  const { payment_id } = await req.json()
  const r = await asaas(`/sandbox/payment/${payment_id}/confirm`, 'POST', {})
  return json({ ok: true, status: r?.status })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const acao = new URL(req.url).searchParams.get('acao')
  try {
    await carregarChave()
    if (acao === 'webhook') return await webhook(req)
    if (acao === 'assinar') return await assinar(req)
    if (acao === 'configurar') return await configurar(req)
    if (acao === 'simular') return await simular(req)
    return json({ error: 'acao' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message || 'Erro inesperado' }, acao === 'webhook' ? 500 : 400)
  }
})
