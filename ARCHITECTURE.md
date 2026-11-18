# Texnik Arxitektura — SWE ENGLISH EXTRA

## 1. Umumiy arxitektura tamoyillari
Ilova build bosqichisiz (zero-bundler) ham **Local Multi-Tab (`file:///`)**, ham **Live Node.js Server (`server.js`)** rejimlarida bir xil kod bazasi bilan ishlaydi:
1. Barcha biznes modullari (`IIFE` + `window.*` va Node `module.exports` ikki tomonlama eksporti) ham brauzerda, ham `server.js` va `tests/verify.js` da qayta ishlatiladi.
2. `SWESync` (`js/sync.js`) ishga tushganda `/api/health` ni tekshiradi: agar Node serveri faol bo‘lsa **REST + Server-Sent Events (`/api/stream`)** rejimi yoqiladi (`data/db.json` persistensiyasi bilan); aks holda **LocalStorage + `BroadcastChannel`** rejimiga avtomatik tushadi.

## 2. Modullar taqsimoti

| Fayl | Mas'uliyati |
| --- | --- |
| `server.js` | Zero-dependency Node HTTP + SSE serveri, qat’iy CSP & xavfsizlik headerlari, brute-force `429` cheklovi, `12h` HMAC `jti`/`revokedTokens` sessiyalari, tokenli SSE `/api/stream`, API kalitni serverda maskalash va SSRF himoyali `/api/ai-proxy` |
| `js/theme-init.js` | CSP-mos (inline scriptlarsiz) Dark/Light tema initsializatori |
| `js/tailwind-config.js` | CSP-mos Tailwind shrift va dark-mode konfiguratsiyasi |
| `js/default-data.js` | 5 ta standart kategoriya, 3 ta boshlang‘ich darslik va 15 ta B2/C1 darajadagi akademik/IELTS so‘zlar bazasi |
| `js/srs.js` | Intervalli takrorlash (SRS) holatlari, navbat saralash, due tekshiruvi |
| `js/auth.js` | `swe3:4000:<salt>:<sha256>` ko‘p raundli tuzlangan autentifikatsiya (boshlang‘ich xeshlar bilan moslik), kuchli parol tekshiruvi (`validatePasswordStrength`), brute-force cheklovi, `canManageAiConfig` (faqat IT Manager), O‘quvchi CRUD + `deleteStudentAccount` va `auditLog` |
| `js/storage.js` | v3 ma’lumot modeli (v1/v2->v3 migratsiya), ajratilgan per-student SRS & telemetriya, `hasApiKey` / `apiKeyMasked` normalizatsiyasi va CWE-1236 formula-in’yeksiya himoyali CSV/JSON utilitalari |
| `js/ai-txt.js` | Ko‘p formatli `.TXT` parser, batafsil/oddiy `.TXT` exporter, `validateAiEndpoint` HTTPS-only + SSRF himoyasi hamda minimal-API boyitish (`planAiEnrichment`, DB + `swe_english_ai_cache_v1` kesh, deduplikatsiya, 40-so‘zli paket, ixcham `w/p/pos/tr/d/ex/syn/ant/m/cat/lvl` JSON) |
| `js/sync.js` | Gibrid sinxronizatsiya (`?token=...` orqali himoyalangan SSE `/api/stream`, `429 Retry-After` uzatish / Local `BroadcastChannel`) |
| `js/speech.js` | `window.speechSynthesis` orqali `en-US` va `en-GB` ovozlarini tanlash va ijro etish |
| `js/app.js` | Saralangan rol menyulari (`O‘quvchi`: 3 tab, `Teacher`: `.TXT`-only 4 tab, `IT Manager`: 5 tab), Drag-and-Drop `.TXT Kiritish`, yig‘iluvchi AI drawer, jonli parol kuch o‘lchagichlari va real-time kuzatuv |

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
      "liveStatus": { "online": false, "lastSeenAt": null, "currentView": "dashboard", "currentMode": "flashcards", "currentWord": "", "currentAction": "" },
      "finalExam": {
        "status": "not_started | in_progress | completed | cheating_locked",
        "lessonScope": "ALL",
        "categoryScope": "ALL",
        "totalQuestions": 0,
        "answeredCount": 0,
        "correctCount": 0,
        "scorePct": null,
        "warningsCount": 0,
        "cheatingFlags": [],
        "questionQueueIds": [],
        "answers": [],
        "startedAt": null,
        "finishedAt": null,
        "retakeApprovedAt": null,
        "retakeApprovedBy": ""
      }
    }
  },
  "studentActivityLog": [],
  "aiConfig": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "customUrl": "",
    "apiKey": "",
    "ttsProvider": "auto",
    "ttsModel": "",
    "ttsCustomUrl": "",
    "ttsApiKey": "",
    "ttsVoiceUs": "",
    "ttsVoiceUk": ""
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
- `index.html` da inline `<script>` lar butunlay olib tashlangan (`js/theme-init.js` + `js/tailwind-config.js`); server HTML ga qat’iy `Content-Security-Policy` (`script-src 'self' https://cdn.tailwindcss.com https://unpkg.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` va `Cross-Origin-Opener-Policy: same-origin` yuboradi.
- **Brute-force va Sessiya Himoyasi:** Server (`0.0.0.0:4175`, barcha lokal/LAN IP lar uchun CORS `OPTIONS` + `Access-Control-Allow-Origin: *` bilan; ishonchsiz HTTP LAN IP da COOP ogohlantirishi chiqmasligi uchun COOP faqat `localhost`/HTTPS da yuboriladi) va Lokal rejimda ketma-ket 5 ta xato urinishda login 3 daqiqaga bloklanadi (`429` + `Retry-After` + `AUTH_LOCKOUT` audit jurnali; IT Manager `clearRateLimits` bilan ocha oladi). Server sessiya tokenlari `12h` muddatga (`iat`/`exp`/`jti`) ega bo‘lib, `/api/logout` da `revokedTokens` ro‘yxatiga qo‘shiladi; `/api/stream` endi valid tokensiz `401` qaytaradi.
- **Parollar va API Kalit Himoyasi:** Yangi va o‘zgartirilgan parollar `swe3:4000:<salt>:<sha256>` ko‘p raundli xeshlash va min 8 belgili kuch siyosati bilan saqlanadi. Server rejimida `aiConfig.apiKey` saqlangandan so‘ng mijozga hech qachon ochiq holda qaytarilmaydi (`hasApiKey: true`, `apiKeyMasked: "sk-••••"`), `/api/ai-proxy` esa kalitni server xotirasidan qo‘yadi hamda `validateAiEndpoint` va `redirect: 'error'` bilan faqat ommaviy HTTPS AI hostlariga ruxsat beradi (private/loopback SSRF bloklanadi).
- Static server `server.js`, `tests/`, `package.json`, `.gitignore`, `.git` va `data/` ga kirishni `403` bilan bloklaydi; CSV eksportida formula-in’yeksiya (`^[=+\-@\t\r]` -> `'` prefiksi, CWE-1236) va UTF-8 BOM (`\uFEFF`) himoyasi qo‘llanadi.
- **Yakuniy Yopiq Test (Proctoring) va Server Tekshiruvi:** `POST /api/exam` (`start`, `answer`, `violation`, `finish`) holatni serverda yuritadi (`cheating_locked` yoki `completed` bo‘lsa qayta boshlashni `403` bilan bloklaydi; faqat Teacher/IT Manager `POST /api/students` -> `approveExamRetake` orqali qayta topshirishga ruxsat beradi). Mijoz (`js/app.js`) esa `notranslate`, `Fullscreen`, clipboard/contextmenu/shortcut blokirovkasi, `visibilitychange`/`window.blur` va extension DOM `MutationObserver` orqali 2 ta ogohlantirishdan keyin 3-chi urinishda testni bloklaydi.
- O‘quv dasturi o‘zgarishi (`POST /api/curriculum`) faqat `words`, `categories`, `lessons` va `auditLog` ni yangilab, parallel ishlayotgan o‘quvchilarning `studentProgress` va `studentActivityLog` ma’lumotlarini ustidan yozib yubormaydi.
