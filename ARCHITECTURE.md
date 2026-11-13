# Texnik Arxitektura — SWE ENGLISH EXTRA

## 1. Umumiy arxitektura tamoyillari
Ilova build bosqichisiz (zero-bundler) ishlashi uchun klassik modul patterni (`IIFE` + `window.*` va Node `module.exports` ikki tomonlama eksporti) asosida qurilgan. Bu ikki muhim afzallikni beradi:
1. Foydalanuvchi `index.html` faylini to‘g‘ridan-to‘g‘ri `file:///` protokoli orqali ochganda ham CORS xatoliklarisiz ishlaydi.
2. Xuddi shu JavaScript modullari (`default-data.js`, `srs.js`, `storage.js`) `Node.js` muhitida avtomatlashtirilgan unit testlar orqali tekshiriladi.

## 2. Modullar taqsimoti

| Fayl | Mas'uliyati |
| --- | --- |
| `js/default-data.js` | 5 ta standart kategoriya va 15 ta B2/C1 darajadagi akademik/IELTS so‘zlar bazasi |
| `js/srs.js` | Intervalli takrorlash (SRS) holatlari, navbat saralash, due tekshiruvi |
| `js/storage.js` | `LocalStorage` CRUD, Kunlik seriya (Streak) hisob-kitobi, RFC-4180 CSV parser va JSON/CSV Import-Export |
| `js/speech.js` | `window.speechSynthesis` orqali `en-US` va `en-GB` ovozlarini tanlash va ijro etish |
| `js/app.js` | SPA navigatsiya, Dashboard, 4 ta Study Mode, CRUD modallar, xavfsiz HTML escaping va shortcutlar |

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

## 4. `LocalStorage` ma'lumotlar sxemasi (`swe_english_extra_v1`)
```json
{
  "version": 1,
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
  }
}
```

## 5. Xavfsizlik va Barqarorlik
- Foydalanuvchi kiritgan matnlar (so‘z, tarjima, misol gaplar) DOM ga chiqarilishidan oldin `escapeHtml()` orqali tozalanadi; `**word**` ajratmasi esa escapingdan so‘ng xavfsiz `<strong>` tegiga o‘giriladi.
- Matn kiritish maydonlarida (`input`, `textarea`, `select`) yozilayotganda global klaviatura shortcutlari (`Space`, `1–4`, `S`, `←`, `→`) avtomatik bloklanadi.
- CSV eksportida Windows Excel o‘zbek harflarini to‘g‘ri ochishi uchun UTF-8 BOM (`\uFEFF`) qo‘shiladi.
