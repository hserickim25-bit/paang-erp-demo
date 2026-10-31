// Ticktap test build — offline cache
const CACHE = 'balik-v69';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin || e.request.url.includes('firebase-config.js')) return;
  const isPage = e.request.mode === 'navigate' || /\/(index\.html)?(\?.*)?$/.test(new URL(e.request.url).pathname);
  if (isPage) {   // pages: always try the network first so every phone gets the newest build
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html').then(h => h || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(res => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
// lock-screen alerts sent by the Ticktap server (Firebase Cloud Messaging, data-only messages)
self.addEventListener('push', e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j; } catch (x) { d = { title: 'Ticktap', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    if (cs.some(c => c.visibilityState === 'visible' && c.focused)) return;   // app on screen: it already chimed in-app
    return self.registration.showNotification(d.title || 'Ticktap', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, vibrate: d.kind === 'request' ? [300, 120, 300, 120, 300] : [200, 100, 200], requireInteraction: d.kind === 'request', data: { url: d.url || './' } });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
