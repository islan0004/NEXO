// Komando: notificação push para o admin da plataforma.
// Chamada pelo banco (pg_net) com o cabeçalho x-komando-token, ou pelo app do admin
// com { acao: 'testar' } e o login dele (Authorization).
// Chaves VAPID e token ficam em platform_secrets (só o servidor lê).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-komando-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function segredos() {
  const { data } = await admin.from('platform_secrets').select('name, value').in('name', ['VAPID_PUBLIC', 'VAPID_PRIVATE', 'NOTIFY_TOKEN'])
  const m = Object.fromEntries((data ?? []).map((r: { name: string; value: string }) => [r.name, r.value]))
  return m as { VAPID_PUBLIC?: string; VAPID_PRIVATE?: string; NOTIFY_TOKEN?: string }
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function enviar(s: Awaited<ReturnType<typeof segredos>>, titulo: string, corpo: string, url: string) {
  webpush.setVapidDetails('mailto:contato@usekomando.app', s.VAPID_PUBLIC!, s.VAPID_PRIVATE!)
  const { data: subs } = await admin.from('admin_push_subscriptions').select('id, endpoint, p256dh, auth')
  const payload = JSON.stringify({ titulo: titulo.slice(0, 80), corpo: corpo.slice(0, 200), url: url.startsWith('/') ? url : '/admin' })
  let ok = 0, removidas = 0, falhas = 0
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 60 * 60 * 24 })
      ok++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) { await admin.from('admin_push_subscriptions').delete().eq('id', sub.id); removidas++ }
      else { falhas++; console.error('push falhou', code, (e as Error).message) }
    }
  }
  return { enviadas: ok, removidas, falhas }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'method' }, 405)
  const s = await segredos()
  if (!s.VAPID_PUBLIC || !s.VAPID_PRIVATE) return json({ erro: 'sem_chaves' }, 500)
  let body: { titulo?: string; corpo?: string; url?: string; acao?: string } = {}
  try { body = await req.json() } catch { /* vazio */ }

  // 1) Chamada do banco
  const token = req.headers.get('x-komando-token')
  if (token) {
    if (!s.NOTIFY_TOKEN || !iguais(token, s.NOTIFY_TOKEN)) return json({ erro: 'forbidden' }, 403)
    if (!body.titulo) return json({ erro: 'titulo' }, 400)
    return json(await enviar(s, body.titulo, body.corpo ?? '', body.url ?? '/admin'))
  }

  // 2) Teste pelo app do admin
  const auth = req.headers.get('Authorization')
  if (!auth) return json({ erro: 'forbidden' }, 403)
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: ehAdmin } = await user.rpc('is_platform_admin')
  if (ehAdmin !== true) return json({ erro: 'forbidden' }, 403)
  if (body.acao !== 'testar') return json({ erro: 'acao' }, 400)
  return json(await enviar(s, '🔔 Teste do Komando', 'As notificações estão funcionando neste aparelho.', '/admin'))
})
