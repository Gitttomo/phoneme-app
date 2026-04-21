// Minimal Service Worker to satisfy Chrome's installability criteria.
// Network-first: simply forwards every request. No offline caching yet.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Let the browser handle the request normally.
  // Having a fetch handler is required for install prompts in Chrome.
  event.respondWith(fetch(event.request).catch(() => new Response("", { status: 504 })));
});
