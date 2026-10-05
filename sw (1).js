/* 28-maktab: ilovani o'rnatish uchun minimal service worker.
   Hech narsa keshlanmaydi: sahifa va Firebase so'rovlari doim to'g'ridan-to'g'ri tarmoqdan ishlaydi. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* brauzer o'zi hal qiladi */ });
