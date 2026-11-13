# Texnik Arxitektura — SWE ENGLISH EXTRA

## 1. Umumiy arxitektura tamoyillari
Ilova build bosqichisiz (zero-bundler) ishlashi uchun klassik modul patterni (`IIFE` + `window.*` va Node `module.exports` ikki tomonlama eksporti) asosida qurilgan. Bu ikki muhim afzallikni beradi:
1. Foydalanuvchi `index.html` faylini to‘g‘ridan-to‘g‘ri `file:///` protokoli orqali ochganda ham CORS xatoliklarisiz ishlaydi.
2. Xuddi shu JavaScript modullari (`default-data.js`, `srs.js`, `storage.js`) `Node.js` muhitida avtomatlashtirilgan unit testlar orqali tekshiriladi.

## 2. Modullar taqsimoti

| Fayl | Mas'uliyati |
| --- | --- |
| `js/default-data.js` | 5 ta standart kategoriya, 3 ta boshlang‘ich darslik va 15 ta B2/C1 darajadagi akademik/IELTS so‘zlar bazasi |
| `js/srs.js` | Intervalli takrorlash (SRS) holatlari, navbat saralash, due tekshiruvi |
| `js/auth.js` | Sof JS tuzlangan `SHA-256` (`SWE_ENG_EXTRA_V2_SALT:`) autentifikatsiyasi, `sessionStorage` sessiyasi, RBAC (`teacher`, `it_manager`) va `auditLog` |
| `js/storage.js` | `LocalStorage` v2 CRUD (v1->v2 avtomatik migratsiya bilan), Streak hisob-kitobi, RFC-4180 CSV (`lesson` ustuni bilan) va JSON Import-Export |
| `js/ai-txt.js` | Ko‘p formatli `.TXT` parser, batafsil/oddiy `.TXT` exporter hamda Google Gemini / OpenAI / Custom AI paketli boyitish (`batchSize: 15`) |
| `js/speech.js` | `window.speechSynthesis` orqali `en-US` va `en-GB` ovozlarini tanlash va ijro etish |
| `js/app.js` | SPA navigatsiya, Dashboard (Darsliklar + Kategoriyalar), 4 ta Study Mode, Admin Studio (`TXT+AI`, `Lessons`, `AI Config`, `Security`), modallar va shortcutlar |

## 3. Spaced Repetition (SRS) algoritmi
Har bir so‘z kartochkasi quyidagi SRS maydonlariga ega:
- `status`: `'new' | 'learning' | 'review' | 'mastered'`
- `mastered`: `boolean`
- `intervalDays`: `0 | 1 | 3 | 7`
- `repetitions`: ketma-ket muvaffaqiyatli takrorlashlar soni
- `lapses`: `'again'` bosilgan holatlar soni
- `nextReviewAt`: keyingi takrorlash UNIX timestamp (ms)

Baholash qoidalari (`SWESRS.applyReviewRating`):
- **again (`Bilmadim`):** `nextReviewAt = now + 60_000` (1 daqiqa), `status = 'learning'`, `mastered = false`, `repetitions = 0`, `lapses += 1`. Aktiv sessiyada karta navbat oxiriga qayta qo‘shiladi.
- **hard (`Qiyin`):** `nextReviewAt = now + 86_400_000` (1 kun), `status = 'learning'`, `mastered = false`.
- **good (`Yaxshi`):** `nextReviewAt = now + 3 * 86_400_000` (3 kun), `status = 'review'`, `mastered = false`.
- **easy (`Oson`):** `nextReviewAt = now + 7 * 86_400_000` (7 kun), `status = 'mastered'`, `mastered = true`.

## 4. `LocalStorage` ma'lumotlar sxemasi (`swe_english_extra_v1` kalitida v2 payload + v1 migratsiya)
```json
{
  "version": 2,
  "words": [
    {
      "id": "w-endeavor",
      "word": "endeavor",
      "phonetic": "/ɪnˈdev.ər/",
      "partOfSpeech": "verb / noun",
      "translation": "astoydil harakat qilmoq, intilmoq; sa’y-harakat",
      "definition": "...",
      "examples": ["... **endeavor** ...", "... **endeavor** ..."],
      "synonyms": ["strive", "attempt"],
      "antonyms": ["neglect", "abandon"],
      "mnemonic": "...",
      "category": "IELTS",
      "lesson": "1-dars: Academic Foundations",
      "level": "C1",
      "status": "new",
      "mastered": false,
      "intervalDays": 0,
      "repetitions": 0,
      "lapses": 0,
      "lastRating": null,
      "lastReviewedAt": null,
      "nextReviewAt": 1700000000000
    }
  ],
  "categories": [
    { "id": "IELTS", "name": "IELTS", "icon": "graduation-cap", "color": "indigo", "builtIn": true }
  ],
  "lessons": [
    { "id": "lesson-1", "name": "1-dars: Academic Foundations", "description": "...", "order": 1 }
  ],
  "stats": {
    "streakCount": 0,
    "longestStreak": 0,
    "lastStudyDate": null,
    "todayDate": "2026-11-13",
    "todayReviewed": 0,
    "totalReviews": 0,
    "dailyGoal": 10
  },
  "settings": {
    "theme": "light",
    "accent": "en-US"
  },
  "aiConfig": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "customUrl": "",
    "apiKey": ""
  },
  "auth": {
    "hashes": {
      "it_manager": "<salted-sha256-hex>",
      "teacher": "<salted-sha256-hex>"
    },
    "updatedAt": null
  },
  "auditLog": []
}
```

## 5. Xavfsizlik va Barqarorlik
- Foydalanuvchi kiritgan va AI qaytargan barcha matnlar (so‘z, tarjima, darslik nomi, misol gaplar) DOM ga chiqarilishidan oldin `escapeHtml()` orqali tozalanadi; `**word**` ajratmasi esa escapingdan so‘ng xavfsiz `<strong>` tegiga o‘giriladi.
- Matn kiritish maydonlarida (`input`, `textarea`, `select`) yozilayotganda global klaviatura shortcutlari (`Space`, `1–4`, `S`, `←`, `→`) avtomatik bloklanadi.
- Admin parollari hech qachon ochiq matnda saqlanmaydi (`SHA-256` + `SWE_ENG_EXTRA_V2_SALT:`). AI API Key faqat foydalanuvchining o‘z brauzeri `LocalStorage` ida saqlanadi va to‘g‘ridan-to‘g‘ri tanlangan AI endpointiga yuboriladi.
- CSV eksportida Windows Excel o‘zbek harflarini to‘g‘ri ochishi uchun UTF-8 BOM (`\uFEFF`) qo‘shiladi.
