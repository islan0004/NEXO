// Service worker mínimo: permite instalar o NEXO como app.
// Não guarda cache de dados — tudo vem sempre atualizado do servidor.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
