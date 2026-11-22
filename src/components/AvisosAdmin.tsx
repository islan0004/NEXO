import { useEffect, useState } from 'react'
import { supabase, traduzErro } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Button, Card } from './ui'

/** Admin da plataforma: ativa notificação push (loja nova, assinatura, pagamento) neste aparelho. */
const suportado = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function chaveParaBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export default function AvisosAdmin() {
  const toast = useToast()
  const [estado, setEstado] = useState<'carregando' | 'sem_suporte' | 'instalar_ios' | 'bloqueado' | 'desligado' | 'ligado'>('carregando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    (async () => {
      if (!suportado()) return setEstado(ehIOS() && !instalado() ? 'instalar_ios' : 'sem_suporte')
      if (Notification.permission === 'denied') return setEstado('bloqueado')
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub && Notification.permission === 'granted' ? 'ligado' : 'desligado')
    })().catch(() => setEstado('sem_suporte'))
  }, [])

  async function ativar() {
    setOcupado(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setEstado(perm === 'denied' ? 'bloqueado' : 'desligado'); return }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      const { data: chave, error } = await supabase.rpc('admin_push_public_key')
      if (error || !chave) throw error ?? new Error('sem chave')
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave as string) }))
      const j = sub.toJSON()
      const { error: e2 } = await supabase.rpc('admin_save_push', { _endpoint: j.endpoint, _p256dh: j.keys?.p256dh, _auth: j.keys?.auth, _user_agent: navigator.userAgent })
      if (e2) throw e2
      setEstado('ligado')
      toast('Avisos ativados neste aparelho')
      await testar()
    } catch (e) {
      toast(`Não deu para ativar: ${traduzErro(e)}`)
    } finally { setOcupado(false) }
  }

  async function testar() {
    const { data, error } = await supabase.functions.invoke('notificar', { body: { acao: 'testar' } })
    if (error) return toast('Falha ao enviar o teste')
    toast(`Teste enviado (${(data as { enviadas: number }).enviadas} aparelho(s))`)
  }

  async function desligar() {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) { await supabase.rpc('admin_remove_push', { _endpoint: sub.endpoint }); await sub.unsubscribe() }
      setEstado('desligado'); toast('Avisos desligados neste aparelho')
    } finally { setOcupado(false) }
  }

  if (estado === 'carregando') return null

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">🔔 Avisos no celular</div>
        <p className="text-sm text-muted">
          {estado === 'ligado' && 'Ligados neste aparelho: loja nova, assinatura nova e pagamento recebido.'}
          {estado === 'desligado' && 'Receba um aviso na hora quando entrar loja nova, assinatura ou pagamento.'}
          {estado === 'bloqueado' && 'As notificações estão bloqueadas para o Komando neste aparelho. Libere nos Ajustes do celular (Notificações → Komando) e volte aqui.'}
          {estado === 'instalar_ios' && 'No iPhone, primeiro instale o Komando: abra no Safari, toque em Compartilhar → “Adicionar à Tela de Início” e abra pelo ícone. Depois volte aqui.'}
          {estado === 'sem_suporte' && 'Este navegador não recebe notificações. No iPhone, use o Komando instalado na Tela de Início; no Android, o Chrome.'}
        </p>
      </div>
      {estado === 'desligado' && <Button loading={ocupado} onClick={ativar}>Ativar avisos</Button>}
      {estado === 'ligado' && (
        <div className="flex gap-2">
          <Button variant="ghost" className="border border-brand-200" onClick={testar}>Enviar teste</Button>
          <Button variant="ghost" loading={ocupado} onClick={desligar}>Desligar</Button>
        </div>
      )}
    </Card>
  )
}
