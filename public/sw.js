// Service worker mínimo: permite instalar o Komando como app e receber avisos (push) do admin.
// Não guarda cache de dados — tudo vem sempre atualizado do servidor.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

self.addEventListener('push', (e) => {
  let d = { titulo: 'Komando', corpo: '', url: '/admin' }
  try { d = { ...d, ...e.data.json() } } catch { /* payload vazio */ }
  e.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.corpo,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/admin'
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abertas) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return }
    }
    await self.clients.openWindow(url)
  })())
})
