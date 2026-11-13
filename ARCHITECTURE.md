# Texnik Arxitektura — SWE ENGLISH EXTRA

## 1. Umumiy arxitektura tamoyillari
Ilova build bosqichisiz (zero-bundler) ham **Local Multi-Tab (`file:///`)**, ham **Live Node.js Server (`server.js`)** rejimlarida bir xil kod bazasi bilan ishlaydi:
1. Barcha biznes modullari (`IIFE` + `window.*` va Node `module.exports` ikki tomonlama eksporti) ham brauzerda, ham `server.js` va `tests/verify.js` da qayta ishlatiladi.
2. `SWESync` (`js/sync.js`) ishga tushganda `/api/health` ni tekshiradi: agar Node serveri faol bo‘lsa **REST + Server-Sent Events (`/api/stream`)** rejimi yoqiladi (`data/db.json` persistensiyasi bilan); aks holda **LocalStorage + `BroadcastChannel`** rejimiga avtomatik tushadi.

## 2. Modullar taqsimoti

| Fayl | Mas'uliyati |
| --- | --- |
| `server.js` | Zero-dependency Node HTTP + SSE serveri, HMAC-SHA256 sessiyalar, per-student/curriculum endpointlar va `/api/ai-proxy` |
| `js/default-data.js` | 5 ta standart kategoriya, 3 ta boshlang‘ich darslik va 15 ta B2/C1 darajadagi akademik/IELTS so‘zlar bazasi |
| `js/srs.js` | Intervalli takrorlash (SRS) holatlari, navbat saralash, due tekshiruvi |
| `js/auth.js` | Sof JS tuzlangan `SHA-256` (`SWE_ENG_EXTRA_V2_SALT:`) autentifikatsiyasi (`student`, `teacher`, `it_manager`), o‘quvchi CRUD, `sessionStorage` v2 va `auditLog` |
| `js/storage.js` | v3 ma’lumot modeli (v1/v2->v3 migratsiya), ajratilgan per-student SRS & telemetriya (`applyWordReviewForSession`, `recordStudentEvent`, `getStudentSummary`), RFC-4180 CSV va JSON Import-Export |
| `js/ai-txt.js` | Ko‘p formatli `.TXT` parser, batafsil/oddiy `.TXT` exporter hamda **DeepSeek AI**, Google Gemini, OpenAI va Custom AI boyitish (`<think>` tozalash va `/api/ai-proxy` fallback bilan) |
| `js/sync.js` | Gibrid sinxronizatsiya (`Live Server Sync` SSE / `Local Multi-Tab` BroadcastChannel) |
| `js/speech.js` | `window.speechSynthesis` orqali `en-US` va `en-GB` ovozlarini tanlash va ijro etish |
| `js/app.js` | Yagona Login Gate, Live Teacher Monitoring, O‘quvchi CRUD, Dashboard, 4 ta Study Mode, Admin Studio va klaviatura shortcutlari |

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

## 4. Ma'lumotlar sxemasi (`v3`: `data/db.json` va `LocalStorage` `swe_english_extra_v1`)
```json
{
  "version": 3,
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
      "level": "C1"
    }
  ],
  "categories": [
    { "id": "IELTS", "name": "IELTS", "icon": "graduation-cap", "color": "indigo", "builtIn": true }
  ],
  "lessons": [
    { "id": "lesson-1", "name": "1-dars: Academic Foundations", "description": "...", "order": 1 }
  ],
  "students": [
    {
      "id": "stu-student1",
      "username": "student1",
      "fullName": "O‘quvchi 1 (Namuna)",
      "group": "Group A",
      "active": true,
      "passwordHash": "<salted-sha256-hex>"
    }
  ],
  "studentProgress": {
    "stu-student1": {
      "srsByWordId": {},
      "stats": { "streakCount": 0, "todayReviewed": 0, "totalReviews": 0, "dailyGoal": 10 },
      "modeStats": { "flashcardsReviewed": 0, "quizCorrect": 0, "quizTotal": 0, "writingCorrect": 0, "writingTotal": 0, "listeningCorrect": 0, "listeningTotal": 0 },
      "liveStatus": { "online": false, "lastSeenAt": null, "currentView": "dashboard", "currentMode": "flashcards", "currentWord": "", "currentAction": "" }
    }
  },
  "studentActivityLog": [],
  "aiConfig": {
    "provider": "deepseek",
    "model": "deepseek-chat",
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
- Foydalanuvchi kiritgan, o‘quvchi telemetriyasidan kelgan va AI qaytargan barcha matnlar DOM ga chiqarilishidan oldin `escapeHtml()` orqali tozalanadi; `**word**` ajratmasi esa escapingdan so‘ng xavfsiz `<strong>` tegiga o‘giriladi.
- Matn kiritish maydonlarida (`input`, `textarea`, `select`) yozilayotganda global klaviatura shortcutlari (`Space`, `1–4`, `S`, `←`, `→`) avtomatik bloklanadi.
- Admin va o‘quvchi parollari hech qachon ochiq matnda saqlanmaydi (`SHA-256` + `SWE_ENG_EXTRA_V2_SALT:`). Server rejimida `/api/state` o‘quvchi sessiyasiga boshqa o‘quvchilar va admin ma’lumotlarini qirqib yuboradi, static server esa `server.js`, `.gitignore`, `.git` va `data/` fayllariga to‘g‘ridan-to‘g‘ri kirishni `403` bilan bloklaydi.
- O‘quv dasturi o‘zgarishi (`POST /api/curriculum`) faqat `words`, `categories`, `lessons` va `auditLog` ni yangilab, parallel ishlayotgan o‘quvchilarning `studentProgress` va `studentActivityLog` ma’lumotlarini ustidan yozib yubormaydi.
- CSV eksportida Windows Excel o‘zbek harflarini to‘g‘ri ochishi uchun UTF-8 BOM (`\uFEFF`) qo‘shiladi.
