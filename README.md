# SWE ENGLISH EXTRA — Smart Flashcards & SRS Studio

**SWE ENGLISH EXTRA** — ingliz tili lug‘atini zamonaviy **3D Flashcards**, **Spaced Repetition (SRS)**, ovozli talaffuz (**Web Speech API: US / UK**) va **4 xil interaktiv mashq rejimi** orqali samarali yodlash uchun yaratilgan Single Page Application (SPA).

## Asosiy imkoniyatlar

### 1. Boshqaruv paneli (Dashboard)
- **Statistika kartalari:** Jami so‘zlar soni, Mastered (o‘zlashtirilgan) so‘zlar, bugun takrorlash kerak bo‘lgan so‘zlar (`Due`) va **Kunlik seriya (Daily Streak 🔥)**.
- **Progress bar:** Umumiy o‘zlashtirish foizi va so‘z holatlari bo‘yicha taqsimot (`Yangi`, `O‘rganilmoqda`, `Takrorlash`, `Mastered`).
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

### 4. Lug‘at bazasi (CRUD) va Import/Export
- Yangi so‘z qo‘shish, tahrirlash, o‘chirish va qidirish/filtrlash.
- **JSON va CSV (Excel UTF-8 BOM) Export / Import** — dublikatlarni aqlli birlashtirish bilan.
- Boshlang‘ich holatda darhol sinab ko‘rish uchun **15 ta B2/C1 akademik va IELTS so‘zlari** tayyor holda yuklanadi.

### 5. UI/UX va Klaviatura boshqaruvi
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
- **Vanilla JavaScript** (modulli struktura, `file://` va HTTP serverda bevosita ishlaydi)
- **LocalStorage** (`swe_english_extra_v1` kaliti ostida barcha progress saqlanadi)
- **Web Speech API** (`speechSynthesis` — `en-US` va `en-GB` aksentlari)
- **Lucide Icons CDN**

## Loyiha tuzilmasi
```text
swe-english-extra/
├── index.html            # Asosiy SPA interfeysi va modallar
├── css/
│   └── styles.css        # Glassmorphism, Dark/Light o‘zgaruvchilar va 3D Flip CSS
├── js/
│   ├── default-data.js   # 5 ta kategoriya va 15 ta B2/C1 IELTS so‘zlar to‘plami
│   ├── srs.js            # Spaced Repetition algoritmi
│   ├── storage.js        # LocalStorage, Daily Streak va JSON/CSV Import-Export
│   ├── speech.js         # Web Speech API (US/UK) ovozli tizim
│   └── app.js            # Asosiy UI kontroller va klaviatura boshqaruvi
├── tests/
│   └── verify.js         # Node.js avtomatlashtirilgan testlar to‘plami
├── README.md             # Loyiha hujjati
├── ARCHITECTURE.md       # Texnik arxitektura va ma'lumotlar modeli
└── WORK_LOG.md           # Bajarilgan ishlar va tekshiruv hisoboti
```

## Ishga tushirish va Tekshirish
1. `index.html` faylini to‘g‘ridan-to‘g‘ri brauzerda oching yoki lokal server ishga tushiring:
   ```bash
   python -m http.server 4173 --directory .
   ```
2. Avtomatlashtirilgan testlarni ishga tushirish:
   ```bash
   node tests/verify.js
   ```
