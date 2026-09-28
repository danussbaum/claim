// Service Worker: makes claim playable offline.
// - Game files (HTML, JS, CSS, icons): network first, cached copy when offline,
//   so updates show up immediately when online.
// - Voice packs (MP3, one per category and voice): cache first. Their URLs carry a content hash (?v=...), so a
//   regenerated file gets a new URL. js/pwa.js fills this cache in the background.
const CORE_CACHE = 'claim-core-v1';
const VOICE_CACHE = 'claim-voice';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    // Everything index.html loads (scripts, styles), read from the page itself
    const res = await fetch('index.html', { cache: 'reload' });
    const html = await res.clone().text();
    await cache.put('index.html', res);
    const urls = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
    for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
      if (!/^(https?:|data:)/.test(m[1])) urls.push(m[1]);
    }
    await Promise.all(urls.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CORE_CACHE && key !== VOICE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/audio/voice/') && url.pathname.endsWith('.mp3')) {
    event.respondWith((async () => {
      const cache = await caches.open(VOICE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CORE_CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});
