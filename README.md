# 28-maktab

28-maktabning rasmiy sayti va ichki platformasi (ogohlantirish xatlari, davomat, yangiliklar, ota-onalar kabineti).
Sayt: https://28maktab.uz

## Qismlar

| Qism | Fayl | Vazifasi |
|---|---|---|
| Ochiq sayt | `index.html` | Yangiliklar, tadbirlar, jamoa, yutuqlar, jadval, galereya, aloqa. Ota-onalar kabineti (`#/kabinet`) va xodimlar kirishi (`#/xodim`) |
| Platforma | `platforma.html` (`/platforma`) | Xodimlar uchun: ogohlantirish va boshqa xatlar, imzo, o'quvchilar bazasi, davomat, statistika, yangiliklar, faollik jurnali, sozlamalar |
| Server | `api/*.js` | Vercel funksiyalari (Firebase Admin + Telegram Bot API) |
| Qoidalar | `firestore.rules` | Firestore xavfsizlik qoidalari |
| Eski fayllar | `maktab.html`, `davomat.html` | Eski nusxalar (`maktab.html` bosh sahifaga yo'naltiriladi, `davomat.html` platformadagi davomat bilan almashtirilgan) |

### `api/` funksiyalari

- `telegram-webhook.js` — Telegram bot: `/start`, kanalga obunani tekshirish, telefon raqamini ulash, «Tanishdim» tugmasi. Brauzerda ochilsa (GET), sozlamalarni tekshirish sahifasini ko'rsatadi (maxfiy kalitlarsiz).
- `parent.js` — ota-onalar kabineti: telefon raqami bo'yicha Telegramga bir martalik kod yuboradi, kod to'g'ri bo'lsa farzandning davomati va xatlarini qaytaradi.
- `send-parent-notice.js` — xatni ota-onaga Telegramda yuboradi.
- `news-telegram.js` — yangilikni Telegram kanaliga joylaydi/tahrirlaydi.
- `yangilik.js`, `rasm.js`, `sitemap.js` — yangilik sahifasi (ijtimoiy tarmoq ko'rinishi bilan), yangilik rasmi, sitemap.
- `seen.js` — ota-onaning QR orqali «Ko'rdim» tasdig'ini qabul qiladi (`letter_acks` ga yozadi; bitta IP dan 10 daqiqada 40 ta so'rov).
- `monthly-report.js` — oylik hisobot (cron, har oyning 1-sanasi).
- `seen.js` — ota-onaning QR orqali «Ko'rdim» tasdig'ini qabul qiladi (IP bo'yicha 10 daqiqada 40 ta so'rov chegarasi bilan).
- `_lib.js`, `_admin.js` — umumiy yordamchilar (Firebase Admin, Telegram).

## Muhit o'zgaruvchilari (Vercel → Settings → Environment Variables)

| Nomi | Majburiy | Izoh |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ha | BotFather bergan token. `TELEGRAM_TOKEN` ham qabul qilinadi (ikkalasi bo'lsa, bir xil qiymat bo'lsin) |
| `TELEGRAM_WEBHOOK_SECRET` | ha | Webhook siri: faqat lotin harflari, raqam, `_` va `-`. `setWebhook` dagi `secret_token` bilan **aynan bir xil** bo'lishi shart |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ha | Firebase xizmat hisobi kaliti (JSON yoki base64). Boshqa nomlar ham qabul qilinadi (`_admin.js`, `_lib.js` ga qarang) |
| `REQUIRED_CHANNEL` | yo'q | Majburiy obuna kanali (`@kanal_nomi`). Bo'sh bo'lsa, platformadagi «Telegram kanal nomi» olinadi. Bot kanalda **admin** bo'lishi kerak |
| `CRON_SECRET` | oylik hisobot uchun | O'zingiz kiritadigan uzun tasodifiy qator. Vercel cron so'rovni shu qiymat bilan yuboradi |
| `PARENT_SECRET` | yo'q | Ota-onalar kodlarini himoyalash kaliti. Bo'sh bo'lsa, bot tokeni ishlatiladi |

O'zgaruvchini o'zgartirgach, loyihani **qayta deploy** qiling (Deployments → ⋯ → Redeploy). Vercel o'zgarishni faqat yangi deploydan boshlab qo'llaydi.

## Telegram webhook

Botni birinchi marta ishga tushirishda va tokenni yoki sirni o'zgartirganda webhookni qayta o'rnating (brauzerda oching; `TOKEN` va `SECRET` ni haqiqiy qiymatga almashtiring, `<` `>` belgilarisiz):

```
https://api.telegram.org/botTOKEN/setWebhook?url=https://28maktab.uz/api/telegram-webhook&secret_token=SECRET&drop_pending_updates=true
```

Holatni tekshirish:

```
https://api.telegram.org/botTOKEN/getWebhookInfo
```

Javobdagi `url` to'lib turishi, `last_error_message` bo'sh bo'lishi kerak. Bot javob bermasa, odatda sabab: `url` bo'sh (webhook o'rnatilmagan), `401` (sir mos emas) yoki `301/302` (manzil `www` bilan). Sozlamalarning umumiy holatini `https://28maktab.uz/api/telegram-webhook` sahifasi ko'rsatadi.

Webhook manzilida `www.28maktab.uz` ishlatmang: `vercel.json` uni asosiy domenga yo'naltiradi, Telegram esa yo'naltirishga ergashmaydi.

## Firestore qoidalari

`firestore.rules` fayli Firebase Console'dagi joriy qoidalar bilan bir xil. O'zgartirsangiz, Console → Firestore Database → Rules orqali yoki `firebase deploy --only firestore:rules` bilan joylang. Qoidalardagi `news`, `audit_log`, `notify_log` bo'limlarini olib tashlamang: sayt va platforma ularga tayanadi.

Rollar: `owner` (asosiy admin), `full`, `viewer`, `homeroom` (sinf rahbari), `attendance` (davomat), `tletter` (o'qituvchi xatlari), `news` (yangilik yozuvchi: faqat sayt yangiliklarini yozadi, faqat o'zinikini tahrirlaydi va o'chiradi, o'z yangiligini Telegram kanaliga yubora oladi). Rol `admins/{email}` hujjatida saqlanadi. Yangilik yozuvchini Sozlamalar → Adminlar bo'limida qo'shasiz.

## Platforma imkoniyatlari (Sozlamalar bo'limida)

- **Watermark (suv belgisi):** xat orqasidagi xira yozuv yoki rasm (logotip). Yozuv/rasm, xiralik, kattalik va burchak sozlanadi. «Yangi xatlarga avtomatik qo'shilsin» yoqilsa, har bir yangi xatda belgi turadi; xat formasidagi «Watermark qo'shish» belgisi bilan har bir xat uchun alohida o'chirish mumkin. Chop etish, PDF va Telegramga yuborishda ham chiqadi. O'quvchi va o'qituvchi xatlarida ishlaydi.
- **O'quvchi raqamini tuzatish:** ism, sinf, telefon yoki ota-ona ismi bo'yicha qidiriladi. Raqam to'g'rilanib saqlansa, u bazada ham, shu o'quvchining (ism + sinf) barcha yozilgan xatlarida ham yangilanadi. «Xatlarida boshqa raqam bor» filtri ziddiyatlarni topadi. Yangi raqam botga ulanmagan bo'lsa, ota-ona botga `/start` yozib raqamini ulashi kerak.

- **Xatlar arxivi (Zaxira va arxiv):** xatlar bitta Firestore hujjatida turadi (chegarasi 1 MB). Kartada hajm o'lchagichi va o'quv yillari bo'yicha xatlar soni ko'rinadi. O'tgan o'quv yili (1-sentabrdan 31-avgustgacha) xatlari «Arxivga ko'chirish» bilan `m28_arch_<yil>` hujjatiga o'tadi: avval arxivga yoziladi, shundan keyingina faol ro'yxatdan olinadi (zaxira fayli ham yuklab olinadi). Arxivlangan xatlar jurnaldan, statistikadan va ota-onalar kabinetidan chiqadi; arxivda ko'rish, CSV yuklash va «Faolga qaytarish» mumkin. Joriy o'quv yili xatlari arxivlanmaydi.
- **QR orqali «Ko'rdim» tasdig'i:** har bir yangi xatga tasodifiy yashirin belgi (`qt`) beriladi va xatdagi QR manziliga qo'shiladi (`#x=...&k=<belgi>`). Ota-ona QR ni skanerlab, ochilgan sahifada «✅ Ko'rdim, tanishdim» tugmasini bossa, `api/seen.js` buni `letter_acks` ga yozadi va xatlar jurnalida «👁 QR orqali ko'rdi» belgisi chiqadi. Belgisiz eski xatlarning QR kodi avvalgidek ishlaydi (faqat ma'lumot ko'rsatadi). Sahifa faqat ism va sanani ko'rsatadi, sabab va ota-ona ismini emas.

- **QR orqali «Ko'rdim»:** har bir yangi xatga yashirin belgi beriladi va QR manziliga qo'shiladi (`#x=...&k=<belgi>`). Ota-ona QR ni skanerlab, ochilgan sahifada «Ko'rdim, tanishdim» tugmasini bossa, xatlar jurnalida «👁 QR orqali ko'rdi · sana» belgisi chiqadi (sinf rahbari faqat o'z sinfini ko'radi). Ochiq sahifa xat haqida yangi ma'lumot ko'rsatmaydi, server faqat holat va vaqtni qaytaradi. Belgisi yo'q eski xatlarda QR avvalgidek ishlaydi (faqat tekshirish).
- **Xatlar arxivi** (Sozlamalar → Zaxira va arxiv): xatlar bitta Firestore hujjatida turadi va uning hajmi 1 MB bilan cheklangan. Hajm ko'rsatkichi bor; eski o'quv yillari (1-sentabrdan 31-avgustgacha) xatlari arxivga ko'chiriladi (`m28_arch_<yil>` hujjatlari). Avval arxivga yoziladi, keyin faol ro'yxatdan olinadi; zaxira JSON fayli avtomatik yuklanadi. Arxivda ko'rish, qidirish, CSV yuklash va faolga qaytarish mumkin. Arxivlangan xatlar jurnaldan, statistikadan, ota-onalar kabinetidan va «3 ta ogohlantirish» hisobidan chiqadi. Arxivni faqat asosiy admin va to'liq adminlar boshqaradi.

## Oylik hisobot

`vercel.json` dagi `crons` har oyning 1-sanasi 08:00 da (Toshkent vaqti) `/api/monthly-report` ni chaqiradi va o'tgan oy statistikasini Sozlamalarda ko'rsatilgan Telegram raqamiga yuboradi. Ishlashi uchun `CRON_SECRET` kiritilgan bo'lishi, hisobot raqami esa botga ulangan bo'lishi kerak.

## Ijtimoiy tarmoqlarda ko'rinish

Havola ulashilganda chiqadigan rasm: `og-default.png` (1200×630). Yangilikda rasm bo'lsa, o'sha rasm ishlatiladi.
