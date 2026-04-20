const CACHE_NAME = 'contacomigo-v010-preview';
const ASSETS = ['/', '/index.html', '/style.css', '/main.js', '/config.js', '/api.js', '/auth.js', '/cv-builder.js', '/ui.js', '/manifest.json', '/icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
