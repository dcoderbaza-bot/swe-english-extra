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

### 4. Lug‘at bazasi (CRUD), `.TXT` Import/Export va AI Boyitish
- Yangi so‘z qo‘shish, tahrirlash, o‘chirish, darslik/kategoriya/daraja bo‘yicha qidirish va filtrlash.
- **Umumiy `.TXT` Import & Export:** Barcha darslik lug‘atlarini bitta `.txt` faylga (`To‘liq` yoki `Oddiy: So‘z - Tarjima`) eksport qilish hamda istalgan tartibdagi `.txt` fayllarni yuklash (`# 4-dars`, `=== Unit ===`, `word - tarjima`, yoki faqat inglizcha so‘zlar).
- **AI Auto-Formatter (`Admin Studio` -> `TXT + AI`):** Foydalanuvchi o‘z **API Key** ini (**DeepSeek AI (`deepseek-chat`)**, **Google Gemini**, **OpenAI GPT**, yoki **Custom OpenAI-Compatible** endpoint) kiritganda, `.txt` ichidagi xato yozilgan so‘zlarni to‘g‘rilaydi, IPA transkripsiya, o‘zbekcha tarjima, izoh, 2 ta bold qilingan misol gap, sinonim/antonim va mnemonika yaratib beradi (`<think>` teglarini avtomatik tozalaydi, server rejimida `/api/ai-proxy` CORS fallback bilan ishlaydi).
- **JSON va CSV (Excel UTF-8 BOM) Export / Import** — dublikatlarni aqlli birlashtirish va v1/v2->v3 migratsiya bilan.
- Boshlang‘ich holatda darhol sinab ko‘rish uchun **3 ta darslikda 15 ta B2/C1 akademik va IELTS so‘zlari** tayyor holda yuklanadi.

### 5. Yagona Login Tizimi, O‘quvchi Akkauntlari va Jonli Teacher Monitoring
- **Yagona kirish ekrani (`#view-login`):** Tizimga kirishdan oldin foydalanuvchi o‘z rolini (**O‘quvchi**, **Teacher**, yoki **IT Manager**) tanlab login/parol bilan kiradi. Boshlang‘ich to‘plamda `student1`, `ali`, `madina` nomli namuna o‘quvchi loginlari tayyor bo‘ladi.
- **Ajratilgan o‘quvchi progressi:** Har bir o‘quvchining SRS kartochka holatlari, `Mastered` ko‘rsatkichi, `Daily Streak` va test aniqligi boshqalarnikidan mustaqil saqlanadi; o‘quvchilarda admin/tahrirlash tugmalari yashiriladi.
- **Jonli Teacher Monitoring (`Live` bo‘limi):** O‘qituvchi (va IT Manager) barcha o‘quvchilarni real vaqt rejimida kuzatadi: `Online / Yaqinda / Oflayn` holati, joriy bo‘lim/rejim/so‘z, bugungi takrorlar soni, o‘zlashtirish foizi, test aniqligi, jonli harakatlar oqimi (`LOGIN`, `VIEW_CHANGE`, `MODE_CHANGE`, `FLASHCARD_FLIP`, `FLASHCARD_RATE`, `QUIZ_ANSWER`, `WRITING_CHECK`, `LISTENING_CHECK`, `LOGOUT`) va har bir o‘quvchi kartochkasini bosganda batafsil modal.
- **Gibrid Sinxronizatsiya (`Live Server Sync` + `Local Multi-Tab`):**
  - `node server.js` orqali ishga tushirilganda **REST API + Server-Sent Events (`/api/stream`)** orqali turli brauzer va qurilmalardan kirgan o‘quvchilarning harakatlari o‘qituvchi ekranida darhol aks etadi (`data/db.json` faylida saqlanadi).
  - Serverisiz (`file:///` yoki statik hostingda) ham `LocalStorage` + `BroadcastChannel` + `storage` eventlari orqali bitta brauzerdagi ko‘p tabli sinxron rejimda to‘liq ishlaydi.
- **Teacher & IT Manager huquqlari:**
  - **Teacher:** Jonli monitoring, o‘quvchilar yaratish / parolini yangilash / bloklash (`Admin -> O‘quvchilar`), darsliklar, lug‘at CRUD, `.TXT + AI (DeepSeek)` import.
  - **IT Manager:** Yuqoridagi barcha imkoniyatlardan tashqari **Parollar & Jurnal** paneli (Teacher va IT Manager parollarini almashtirish, `Audit Log` hamda bazani tiklash).
- **Xavfsizlik:** Kodda va omborda ochiq parollar saqlanmaydi; faqat tuzlangan `SHA-256` (`SWE_ENG_EXTRA_V2_SALT:`) xeshlari va serverda HMAC-SHA256 imzolangan sessiya tokenlari (`data/.session-secret`) ishlatiladi. Boshlang‘ich parollar topshirish vaqtida alohida beriladi hamda Admin/IT Manager panelidan istalgan vaqt o‘zgartiriladi.

### 6. UI/UX va Klaviatura boshqaruvi
- **Glassmorphism + Minimalizm** dizayni, **Dark Mode / Light Mode** almashinuvi.
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
- **Vanilla JavaScript** (modulli struktura, `file://` va HTTP/Node serverda bevosita ishlaydi)
- **Gibrid Ma’lumotlar Qatlami:** Zero-dependency **Node.js HTTP + SSE serveri (`server.js` -> `data/db.json`)** hamda **`LocalStorage` (`swe_english_extra_v1`, v3 sxema) + `BroadcastChannel`**
- **Web Speech API** (`speechSynthesis` — `en-US` va `en-GB` aksentlari)
- **AI Integratsiyasi:** DeepSeek AI (`https://api.deepseek.com/chat/completions`), Google Gemini, OpenAI va Custom OpenAI-Compatible API lar (`/api/ai-proxy` server CORS himoyasi bilan)
- **Lucide Icons CDN**

## Loyiha tuzilmasi
```text
swe-english-extra/
├── index.html            # Login Gate, Header, Live Monitor, Dashboard, Study Hub, Admin Studio va modallar
├── server.js             # Zero-dependency Node HTTP + SSE real-time sinxronizatsiya va AI proxy serveri
├── css/
│   └── styles.css        # Glassmorphism, Dark/Light o‘zgaruvchilar va 3D Flip CSS
├── js/
│   ├── default-data.js   # 5 ta kategoriya, 3 ta boshlang‘ich darslik va 15 ta B2/C1 so‘z
│   ├── srs.js            # Spaced Repetition algoritmi
│   ├── auth.js           # Salted SHA-256 ko‘p foydalanuvchili auth (O‘quvchi, Teacher, IT Manager), Student CRUD
│   ├── storage.js        # v3 sxema (v1/v2->v3 migratsiya), per-student SRS/telemetriya va JSON/CSV Import-Export
│   ├── ai-txt.js         # Umumiy .TXT parser/exporter va DeepSeek/Gemini/OpenAI/Custom AI boyitish moduli
│   ├── sync.js           # Gibrid sinxronizatsiya (REST + SSE / BroadcastChannel + storage events)
│   ├── speech.js         # Web Speech API (US/UK) ovozli tizim
│   └── app.js            # Asosiy UI kontroller, Live Monitor, O‘quvchi CRUD, telemetriya va shortcutlar
├── tests/
│   └── verify.js         # Node.js avtomatlashtirilgan unit + server integratsiya testlari (10 ta suite)
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
