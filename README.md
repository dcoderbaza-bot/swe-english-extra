# SWE ENGLISH EXTRA — Smart Flashcards & SRS Studio

**SWE ENGLISH EXTRA** — ingliz tili lug‘atini zamonaviy **3D Flashcards**, **Spaced Repetition (SRS)**, ovozli talaffuz (**Web Speech API: US / UK**) va **4 xil interaktiv mashq rejimi** orqali samarali yodlash uchun yaratilgan Single Page Application (SPA).

## Asosiy imkoniyatlar

### 1. Boshqaruv paneli (Dashboard)
- **Statistika kartalari:** Jami so‘zlar soni, Mastered (o‘zlashtirilgan) so‘zlar, bugun takrorlash kerak bo‘lgan so‘zlar (`Due`) va **Kunlik seriya (Daily Streak 🔥)**.
- **Progress bar:** Umumiy o‘zlashtirish foizi va so‘z holatlari bo‘yicha taqsimot (`Yangi`, `O‘rganilmoqda`, `Takrorlash`, `Mastered`).
- **Darsliklar (Lessons):** Har darslik bo‘yicha alohida lug‘atlar (`1-dars: Academic Foundations`, `2-dars: Society & Analysis`, `3-dars: Business & Expressions` va yangi darsliklar yaratish).
- **Kategoriyalar (Decks):** `IELTS`, `General English`, `Business`, `Phrasal Verbs`, `Idioms` hamda foydalanuvchi tomonidan yangi kategoriya yaratish va o‘chirish imkoniyati.

### 2. 3D Flashcard va Spaced Repetition (SRS)
- **180° silliq 3D aylanish:** Kartochka ustiga bosish yoki `Space` tugmasi orqali aylantirish.
- **Old tomoni:** Inglizcha so‘z, IPA transkripsiya, so‘z turkumi, kategoriya, CEFR darajasi (`A1–C2`) va 🔊 US/UK talaffuz tugmalari.
- **Orqa tomoni:** O‘zbekcha tarjima, inglizcha izoh (definition), target so‘z **qalin (bold)** qilib ajratilgan 2 ta kontekstual misol gap (alohida ovoz tugmasi bilan), sinonimlar, antonimlar va mnemonik assotsiatsiya.
- **4 bosqichli Anki uslubidagi baholash:**
  1. **Bilmadim (`Again` — 1):** 1 daqiqadan keyin qayta chiqadi (`learning`).
  2. **Qiyin (`Hard` — 2):** 1 kundan keyin takrorlanadi (`learning`).
  3. **Yaxshi (`Good` — 3):** 3 kundan keyin takrorlanadi (`review`).
  4. **Oson (`Easy` — 4):** 7 kundan keyin takrorlanadi va `Mastered` ro‘yxatiga o‘tadi.

### 3. Mashq rejimlari (Study Modes)
- **Flashcards:** Klassik 3D kartochkalar va SRS takrorlash.
- **Multiple Choice (Test):** 1 ta inglizcha so‘z va 4 ta o‘zbekcha variant, tezkor natija va xato so‘zlar ro‘yxati.
- **Writing / Spelling (Yozma mashq):** O‘zbekcha tarjima va audio asosida inglizcha so‘zni harflab yozish (`Ko‘rsatma` yordami bilan).
- **Listening Mode:** Faqat audio tinglash (normal va `0.75x` sekin tezlik, US/UK aksentlari) hamda `4 Variant` yoki `Eshitib yozish` rejimlari.

### 4. Teacher uchun faqat `.TXT` Lug‘at Kiritish va Minimal API AI Boyitish
- **Faqat `.TXT` oqimi (Teacher & IT Manager):** O‘qituvchi lug‘atni **faqat `.txt` fayl** yuklash (yoki Drag-and-Drop dropzone / matn joylash) hamda eksport qilish orqali boshqaradi; `Lug‘atlar` bo‘limida esa so‘z yoki **butun darslik lug‘atini** tasdiqlash dialogi (`#confirmModal`) bilan o‘chirish mumkin.
- **Umumiy `.TXT` Parser & Exporter:** Barcha darslik lug‘atlarini bitta `.txt` faylga (`To‘liq` yoki `Oddiy: So‘z - Tarjima`) eksport qilish hamda istalgan tartibdagi `.txt` fayllarni yuklash (`# 4-dars`, `=== Unit ===`, `word - tarjima`, yoki faqat inglizcha so‘zlar).
- **Minimal API sarfli AI Auto-Formatter (`5` qatlamli tejamkorlik):**
  - **API Key sozlamalari faqat IT Manager uchun:** API kalitini kiritish/ko‘rish/test qilish/o‘chirish (`#toggleAiSettingsBtn` + `#aiSettingsDrawer` + `/api/ai-config`) faqat IT Manager’ga ruxsat etilgan; Teacher faqat tayyorlik holatini ko‘radi va server proxy orqali so‘z boyitishni ishlatadi.
  - **0 API qidiruvi va kesh:** AI so‘rovidan oldin mavjud baza (`state.words`) va brauzer leksika keshi (`swe_english_ai_cache_v1`) tekshiriladi hamda bitta `.txt` dagi takror so‘zlar birlashtiriladi. Barcha so‘zlar baza/keshdan topilsa **0 ta API so‘rovi** ketadi.
  - **Katta paket (`40` so‘z) + ixcham JSON sxema + server proxy keshi:** Qisqa kalitlar (`w,p,pos,tr,d,ex,syn,ant,m,cat,lvl`), `lesson` ni qaytadan yubormaslik va serverda `aiProxyCache` (24 soatlik + in-flight birlashtirish) orqali API xarajatlari minimal darajaga tushirilgan.
- Boshlang‘ich holatda darhol sinab ko‘rish uchun **3 ta darslikda 15 ta B2/C1 akademik va IELTS so‘zlari** tayyor holda yuklanadi.

### 5. Saralangan Rol Menyulari, O‘quvchi Akkauntlari va Kiberxavfsizlik
- **Yagona kirish ekrani (`#view-login`):** Rolni tanlab (**O‘quvchi**, **Teacher**, **IT Manager**) kirish hamda Kiberhimoya qalqoni (HMAC · CSP · 5x Lockout). Boshlang‘ich to‘plamda `student1`, `ali`, `madina` nomli namuna o‘quvchi loginlari tayyor bo‘ladi.
- **Har bir rol uchun alohida saralangan menyu (ichma-ich tablar yo‘q):**
  - **O‘quvchi:** `Boshqaruv` · `Mashqlar` · `Lug‘atlar`
  - **Teacher:** `Jonli Kuzatuv` · `.TXT Kiritish` · `O‘quvchilar` · `Lug‘atlar`
  - **IT Manager:** `Jonli Kuzatuv` · `.TXT Kiritish` · `O‘quvchilar` · `Lug‘atlar` · `Xavfsizlik`
- **Ajratilgan o‘quvchi progressi va Jonli Monitoring (`#view-monitor`):** Har bir o‘quvchining SRS holatlari va `Daily Streak` mustaqil saqlanadi; o‘qituvchi real vaqtda (`SSE /api/stream`) o‘quvchilarning joriy bo‘limi, so‘zi, aniqligi va jonli harakatlar oqimini kuzatadi.
- **Kiberxavfsizlik (v4):**
  - `swe3:4000:<salt>:<sha256>` ko‘p raundli tuzlangan parol xeshlash + kuchli parol siyosati (min 8 belgi, harf + raqam/belgi, jonli kuch o‘lchagich).
  - Brute-force himoyasi: 5 ta xato kirishdan so‘ng 3 daqiqalik `429 Too Many Requests` (`Retry-After`) + lokal blokirovka va IT Manager tomonidan `Xavfsizlik` bo‘limidan blokni ochish (`clearRateLimits`).
  - Server sessiyalari: `12h` muddatli HMAC-SHA256 token (`iat`/`exp`/`jti`), `/api/logout` da tezkor token bekor qilish (`revokedTokens`) va token bilan himoyalangan SSE `/api/stream`.
  - Qat’iy CSP (`script-src 'self' https://cdn.tailwindcss.com https://unpkg.com` — nol inline script), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `COOP`, API kalitlarni maskalash hamda `/api/ai-proxy` da HTTPS-only + SSRF blokirovkasi. Boshlang‘ich parollar topshirish vaqtida alohida beriladi hamda IT Manager tomonidan `Xavfsizlik` bo‘limida o‘zgartiriladi.

### 6. UI/UX va Klaviatura boshqaruvi
- **Zamonaviy Glassmorphism + Minimalizm** dizayni, gradient `.nav-pill` menyular, foydalanuvchi initsial avatarlari, `.TXT` drag-and-drop dropzone va **Dark Mode / Light Mode** almashinuvi.
- Mobil, planshet va kompyuter ekranlariga to‘liq moslashuvchan (`Responsive`).

| Tugma | Vazifasi |
| --- | --- |
| `Space` | Kartochkani aylantirish (Flashcards) |
| `S` | Joriy so‘zni ovozli talaffuz qilish |
| `1`, `2`, `3`, `4` | SRS baholash (kartochka aylantirilganda) yoki Test/Listening variantini tanlash |
| `←` / `→` | Oldingi / Keyingi kartochkaga o‘tish |
| `Esc` | Ochiq modal oynani yopish |

## Texnologik stek
- **HTML5**, **CSS3** (**Tailwind CSS CDN** + custom 3D flip va glassmorphism stillari)
- **Vanilla JavaScript** (CSP-xavfsiz tashqi skriptlar: `js/theme-init.js`, `js/tailwind-config.js`, modulli app arxitekturasi)
- **Gibrid Ma’lumotlar Qatlami:** Zero-dependency **Node.js HTTP + SSE serveri (`server.js` -> `data/db.json`)** hamda **`LocalStorage` (`swe_english_extra_v1`, v3 sxema) + `BroadcastChannel`**
- **Web Speech API** (`speechSynthesis` — `en-US` va `en-GB` aksentlari)
- **AI Integratsiyasi:** DeepSeek AI (`https://api.deepseek.com/chat/completions`), Google Gemini, OpenAI va Custom HTTPS endpointlar (`/api/ai-proxy` SSRF/CORS himoyasi bilan)
- **Lucide Icons CDN**

## Loyiha tuzilmasi
```text
swe-english-extra/
├── index.html            # Login Gate, saralangan Header, Live Monitor, TXT Kiritish, O‘quvchilar, Xavfsizlik va modallar
├── server.js             # Zero-dependency Node HTTP + SSE server, brute-force 429, token revocation, AI proxy (SSRF/HTTPS)
├── css/
│   └── styles.css        # Glassmorphism v4 tokenlari, .nav-pill, .txt-dropzone, pw-meter va 3D Flip CSS
├── js/
│   ├── theme-init.js     # CSP-xavfsiz dastlabki Dark/Light tema yuklovchi skript
│   ├── tailwind-config.js# CSP-xavfsiz Tailwind konfiguratsiyasi
│   ├── default-data.js   # 5 ta kategoriya, 3 ta boshlang‘ich darslik va 15 ta B2/C1 so‘z
│   ├── srs.js            # Spaced Repetition algoritmi
│   ├── auth.js           # swe3:4000 tuzlangan xeshlash, brute-force cheklovi, parol kuchi va Student CRUD
│   ├── storage.js        # v3 sxema, per-student SRS/telemetriya, API kalit maskalash va CWE-1236 CSV himoyasi
│   ├── ai-txt.js         # .TXT parser/exporter, HTTPS/SSRF validator va DeepSeek/Gemini/OpenAI/Custom AI boyitish
│   ├── sync.js           # Gibrid sinxronizatsiya (tokenli SSE /api/stream + REST va BroadcastChannel)
│   ├── speech.js         # Web Speech API (US/UK) ovozli tizim
│   └── app.js            # UI kontroller, saralangan rol menyulari, drag-and-drop .TXT va jonli monitoring
├── tests/
│   └── verify.js         # Node.js avtomatlashtirilgan unit, kiberxavfsizlik va minimal-API testlari (13 ta suite)
├── README.md             # Loyiha hujjati
├── ARCHITECTURE.md       # Texnik arxitektura va ma'lumotlar modeli
└── WORK_LOG.md           # Bajarilgan ishlar va tekshiruv hisoboti
```

## Ishga tushirish va Tekshirish
1. **Real-Time ko‘p qurilmali rejim (Tavsiya etiladi):**
   ```bash
   node server.js
   ```
   So‘ngra brauzerda `http://127.0.0.1:4175` manzilini oching (o‘quvchi va o‘qituvchi alohida brauzer/qurilmadan kirib real vaqtda ishlay oladi).
2. **Yoki** `index.html` faylini to‘g‘ridan-to‘g‘ri brauzerda oching (`Local Multi-Tab` rejimida ishlaydi).
3. Avtomatlashtirilgan testlarni ishga tushirish:
   ```bash
   node tests/verify.js
   ```
