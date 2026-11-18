# Bajarilgan Ishlar Hisoboti (Work Log) — SWE ENGLISH EXTRA

**Sana:** 2026-11-13  
**Loyiha:** SWE ENGLISH EXTRA (Single Page Application)

## 1. Yaratilgan fayllar ro‘yxati
- `index.html` — SPA tuzilmasi: Dashboard, Study Hub (Flashcards, Multiple Choice, Writing, Listening), Lug‘at bazasi (CRUD), Modallar (So‘z qo‘shish/tahrirlash, Kategoriya yaratish, Klaviatura shortcutlari, Tasdiqlash dialogi) va Toast tizimi.
- `css/styles.css` — Glassmorphism dizayn tokenlari, Dark/Light mavzu o‘zgaruvchilari, 3D karta aylantirish (`perspective: 1400px`, `preserve-3d`, `rotateY(180deg)`), tugma animatsiyalari va scrollbar stillari.
- `js/default-data.js` — 5 ta asosiy kategoriya (`IELTS`, `General English`, `Business`, `Phrasal Verbs`, `Idioms`) va 15 ta B2/C1 akademik/IELTS so‘zlar to‘plami (IPA transkripsiya, tarjima, izoh, 2 tadan bold qilingan misol gap, sinonim/antonim va mnemonika).
- `js/srs.js` — Anki uslubidagi 4 tugmali SRS tizimi (`Again` 1 min, `Hard` 1 kun, `Good` 3 kun, `Easy` 7 kun + `Mastered`).
- `js/storage.js` — `LocalStorage` (`swe_english_extra_v1`), Kunlik seriya (Daily Streak) va kunlik maqsad mexanizmi, JSON/CSV eksport va import (dublikatlarni aqlli birlashtirish).
- `js/speech.js` — `Web Speech API` (`speechSynthesis`) orqali `en-US` va `en-GB` aksentlarida so‘z va misol gaplarni o‘qish.
- `js/app.js` — To‘liq UI boshqaruvi, klaviatura shortcutlari (`Space`, `1–4`, `S`, `←`, `→`, `Esc`) va xavfsiz DOM rendering.
- `tests/verify.js` — Node.js unit va integratsiya testlari.
- `README.md`, `ARCHITECTURE.md`, `WORK_LOG.md`, `.gitignore` — Loyiha hujjatlari va Git konfiguratsiyasi.

## 2. Tekshiruv va QA natijalari (1-bosqich)

### Avtomatlashtirilgan Node.js testlari (`tests/verify.js`) — 1-bosqich
- `node --check` dastlabki 5 ta JS fayl sintaksisini xatosiz tasdiqladi.
- 4 ta test to‘plami 100% muvaffaqiyatli o‘tdi:
  1. 5 ta kategoriya va 15 ta B2/C1 boshlang‘ich so‘zlar to‘liqligi.
  2. SRS intervallari (`1 daqiqa`, `1 kun`, `3 kun`, `7 kun + Mastered`).
  3. `LocalStorage` saqlanishi va ko‘p kunlik `Daily Streak` hisob-kitobi.
  4. JSON/CSV eksport, vergul/qo‘shtirnoqli CSV parsing va import birlashtirish.

### Brauzerda jonli UI/UX QA tekshiruvi (1-bosqich)
- Lokal HTTP serverda barcha sahifalar konsol xatolarisiz yuklandi.
- Boshqaruv panelida 4 ta statistika kartasi, foizli progress bar va 5 ta kategoriya decklari tekshirildi.
- Dark Mode / Light Mode almashinuvi, 3D Flashcard 180° aylanishi, `Oson (Easy)` baholash natijasida Mastered (+1) va Streak (+1) yangilanishi tasdiqlandi.
- Multiple Choice (`Test`), `Yozma mashq`, `Listening` va `Lug‘at bazasi` CRUD modallari tekshirildi.
- Vizual skrinshot tekshiruvida planshet o‘lchamidagi header siqilishi aniqlandi va `index.html` da `lg` breakpoint hamda `whitespace-nowrap`/`shrink-0` klasslari bilan tuzatildi.

---

## 3. 2-bosqich yangilanishlari (Darsliklar, Umumiy `.TXT` + AI va Admin Rollar)

### Yangi va yangilangan fayllar
- `js/default-data.js` — `DEFAULT_LESSONS` (3 ta boshlang‘ich darslik) qo‘shildi va 15 ta standart so‘zga `lesson` maydoni biriktirildi.
- `js/auth.js` — **IT Manager** va **Teacher** rollari uchun sof JS tuzlangan `SHA-256` autentifikatsiya, `sessionStorage` sessiyasi, parolni yangilash, ruxsatlar nazorati va `Audit Log` moduli yaratildi.
- `js/ai-txt.js` — Umumiy `.txt` fayllarni tahlil qilish (`#`, `===`, `1-dars`, `Unit`, `-`, `—`, `=`, `:`, qavs va bo‘sh inglizcha so‘zlar), batafsil/oddiy `.txt` eksporti hamda **Google Gemini**, **OpenAI** va **Custom OpenAI-Compatible** API lar orqali so‘zlarni to‘g‘rilab boyitish (`enrichEntriesWithAI`) qo‘shildi.
- `js/storage.js` — v2 sxema (`lessons`, `aiConfig`, `auth`, `auditLog`, `word.lesson`), v1->v2 avtomatik migratsiya, CSV `lesson` ustuni va `mergeImportedWords` da `importedLessons` qo‘llab-quvvatlovi joriy etildi.
- `index.html` va `js/app.js` — Dashboard darsliklar tarmog‘i, Study va Vocabulary darslik filtrlari, flashcard darslik nishoni (`#fcLessonBadge`), `.TXT Export` / `TXT + AI` tezkor tugmalari hamda 4 bo‘limli `Admin Studio` va `Admin Login` modali integratsiya qilindi.
- `tests/verify.js` — 8 ta avtomatlashtirilgan test to‘plami (v1->v2 migratsiya, `SWEAuth` SHA-256 + RBAC, `SWEAiTxt` parser/exporter va Gemini/OpenAI mock API testlari).

### 2-bosqich tekshiruv natijalari
- `node --check` barcha 7 ta JS fayl (`default-data.js`, `srs.js`, `auth.js`, `storage.js`, `ai-txt.js`, `speech.js`, `app.js`) sintaksisini xatosiz tasdiqladi.
- `node tests/verify.js`: **8/8** test to‘plami 100% o‘tdi.
- Brauzer QA tekshiruvida (`127.0.0.1:4175`, 0 ta konsol xatosi / 0 ta sahifa xatosi):
  - Dashboard darsliklar kartalari, Study darslik filtri va `#fcLessonBadge` 3D aylantirish bilan birga tekshirildi.
  - `Teacher` login noto‘g‘ri parolni rad etishi, to‘g‘ri parol bilan `TXT + AI` namuna importi va darslik yaratish, hamda `IT Manager` parollar bo‘limi Teacher uchun bloklanganligi tasdiqlandi.
  - `IT Manager` login orqali `AI & API Key` provayder almashinuvi, Parol boshqaruvi va xronologik `Audit Log` (`LOGIN`, `TXT_IMPORT`, `LESSON_ADD`, `LOGOUT`) yozuvlari tasdiqlandi.

---

## 4. 3-bosqich yangilanishlari (DeepSeek AI, O‘quvchi Loginlari va Jonli Teacher Monitoring)

### Yangi va yangilangan fayllar
- `server.js` — Zero-dependency Node HTTP + SSE serveri (`/api/health`, `/api/stream`, `/api/login`, `/api/logout`, `/api/state`, `/api/review`, `/api/telemetry`, `/api/curriculum`, `/api/students`, `/api/ai-config`, `/api/ai-proxy`, `/api/security`), `data/db.json` persistensiyasi va HMAC-SHA256 sessiya tokenlari (`data/.session-secret`).
- `.gitignore` — Runtime `data/` papkasi va maxfiy sessiya kaliti Git dan chiqarib tashlandi.
- `js/sync.js` — Gibrid real-time sinxronizatsiya moduli (Server SSE + REST va Local `BroadcastChannel` + `storage`).
- `js/auth.js` — O‘quvchilar (`student1`, `ali`, `madina`) uchun tuzlangan `SHA-256` xeshlari, yagona `authenticate(...)`, `createStudentAccount`, `resetStudentPassword`, `toggleStudentActive` va `canMonitorStudents` / `canManageStudents` RBAC qoidalari.
- `js/ai-txt.js` — Birinchi darajali **DeepSeek AI** (`https://api.deepseek.com/chat/completions`, `deepseek-chat`) provayderi, `<think>` teglarini tozalash va `/api/ai-proxy` fallback qo‘shildi.
- `js/storage.js` — `v3` sxema (`students`, `studentProgress`, `studentActivityLog`, `deepseek` standart `aiConfig`), `getWordsForSession`, `applyWordReviewForSession`, `recordStudentEvent`, `getStudentSummary` va v1/v2->v3 migratsiyasi.
- `index.html` va `js/app.js` — Yagona `#view-login` kirish darvozasi, `#view-monitor` Jonli O‘quvchi Monitoringi, `#studentDetailModal` / `#studentResetPwModal`, `#admin-tab-students` o‘quvchi boshqaruvi va `.staff-only-ui` rol cheklovlari qo‘shildi; planshet o‘lchamida header qisilishini bartaraf etish uchun `flex-wrap` va kompakt badge moslashuvi bajarildi.
- `tests/verify.js` — 10 ta test to‘plamigacha kengaytirildi (v1->v3 migratsiya, DeepSeek mock + `<think>` tozalash, per-student izolyatsiya va real HTTP server `/api/review` + `/api/telemetry` integratsiyasi).

### 3-bosqich tekshiruv natijalari
- `node --check`: barcha JS fayllar (`server.js`, `js/*.js`, `tests/verify.js`) xatosiz o‘tdi.
- `node tests/verify.js`: **10/10** test to‘plami 100% muvaffaqiyatli o‘tdi.
- Real-time Server + Brauzer E2E QA (`http://127.0.0.1:4178`, 0 ta konsol xatosi / 0 ta sahifa xatosi):
  - Yagona login ekrani (`Live Server Sync`), noto‘g‘ri o‘quvchi parolini rad etish.
  - O‘quvchi (`ali`) kirishi: admin tugmalari yashirilgan, 3D Flashcard flip + `Oson (7 kun)` baholash, Quiz javobi va `Chiqish` tekshirildi.
  - Teacher kirishi: to‘g‘ridan-to‘g‘ri `#view-monitor` (`Real-Time SSE ulangan`) da `Ali Valiyev` (`7%`, `2 ta` bugun, jonli harakatlar oqimi va `#studentDetailModal`) ko‘rindi; `Admin -> O‘quvchilar` da `@zarina` yaratildi va `DeepSeek AI (deepseek-chat)` konfiguratsiyasi tasdiqlandi.
  - IT Manager kirishi: `Parollar & Jurnal` da xronologik `Audit Log` hamda 4 ta o‘quvchi monitori tasdiqlandi.

---

## 5. 4-bosqich yangilanishlari (Kiberxavfsizlik, Saralangan Rol Menyulari, Teacher `.TXT`-only va Dizayn Yangilash)

### Yangi va yangilangan fayllar
- `js/theme-init.js` va `js/tailwind-config.js` — inline `<script>` teglaridan butunlay xoli CSP-mos tashqi konfiguratsiya skriptlari ajratildi.
- `server.js` — Qat’iy HTTP xavfsizlik headerlari va CSP (`script-src 'self' https://cdn.tailwindcss.com https://unpkg.com`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `COOP`), `/api/login` da 5 urinishli `429` + `Retry-After` brute-force blokirovkasi (`AUTH_LOCKOUT`), `12h` HMAC token (`iat`/`exp`/`jti`) + `/api/logout` `revokedTokens`, tokensiz `/api/stream` ni `401` bilan bloklash, `aiConfig.apiKey` ni maskalash (`hasApiKey`, `apiKeyMasked`), `/api/ai-proxy` da server kalit injeksiyasi + SSRF/HTTPS/Gemini/mock-fetch himoyasi, `clearRateLimits` va `tests/`/`package.json` static blokirovkasi qo‘shildi.
- `js/auth.js` — `swe3:4000:<salt>:<sha256>` ko‘p raundli tuzlangan parol xeshlash, kuchli parol siyosati (`validatePasswordStrength`: kamida 8 belgi, harf + raqam/belgi) va Lokal rejim uchun ham brute-force cheklovi (`checkLoginRateLimit`, `recordLoginFailure`, `clearLoginFailures`) joriy etildi.
- `js/ai-txt.js` va `js/storage.js` — `validateAiEndpoint` / `isPrivateOrLocalHostname` (HTTPS-only + localhost/private IP/metadata SSRF bloki), `/api/ai-proxy` dan kalitsiz xavfsiz foydalanish va CSV formula-in’yeksiya (`CWE-1236`) himoyasi qo‘shildi.
- `js/sync.js` — SSE `/api/stream?token=...` tokenli ulanish, `logoutRemote()` da SSE yopish va `429 Retry-After` xatolarini UI ga uzatish qo‘shildi.
- `index.html`, `css/styles.css` va `js/app.js` — Ichma-ich `Admin Studio` olib tashlanib, har bir rol uchun saralangan tekis menyu (`O‘quvchi`: 3 ta, `Teacher`: 4 ta, `IT Manager`: 5 ta) qurildi; O‘qituvchi uchun **faqat `.TXT`** lug‘at kiritish (`#view-txt-import` + drag-and-drop dropzone + yig‘iluvchi `DeepSeek API Sozlamasi`) qoldirilib qo‘lda so‘z/kategoriya modallari va JSON/CSV tugmalari olib tashlandi; qatlamli glassmorphism, gradient `.nav-pill.is-active`, avatar initsiallari, parol kuchi o‘lchagichlari va Chromium 3D `.flashcard-face--front` / `.flashcard-face--back` backface tuzatilishi joriy etildi.
- `tests/verify.js` — **12 ta** test to‘plamigacha kengaytirildi (`swe3` xesh, parol kuchi, client & server `429` lockout, SSRF/HTTPS, CWE-1236 CSV, CSP/inline-script/TXT-only HTML auditi, `jti` bekor qilish, API kalit maskalash va `/api/ai-proxy`).

### 4-bosqich tekshiruv natijalari
- `node --check`: `server.js` va barcha `js/*.js` (10 ta fayl) xatosiz o‘tdi.
- `node tests/verify.js`: **12/12** test to‘plami 100% muvaffaqiyatli o‘tdi.
- Live Server + Brauzer E2E QA (`http://127.0.0.1:4176`, 0 ta konsol xatosi, 0 ta CSP xatosi, 0 ta sahifa xatosi, 0 ta overflow):
  - Brute-force 5x xato paroldan keyin `429` blokirovka, IT Manager `Xavfsizlik` bo‘limidan `clearRateLimits` bilan blokni ochish va `AUTH_LOCKOUT` audit jurnali tekshirildi.
  - Teacher akkauntida 4 ta saralangan menyu, qo‘lda so‘z/JSON/CSV tugmalari yo‘qligi, faqat `.TXT` yuklash/boyitish/eksport va `15 -> 22` so‘z o‘sishi tasdiqlandi.
  - O‘quvchi (`student1`) da faqat 3 ta menyu, 3D Flashcard old/orqa tomonlarining Dark/Light rejimda ghostingsiz silliq aylanishi va SRS `Oson (7 kun)` baholash to‘liq tasdiqlandi.

---

## 6. 5-bosqich yangilanishlari (Parol tiklash ishonchliligi, O‘chirish tasdiqlari, IT-only API Key va Minimal AI Sarfi)

### Asosiy yaxshilanishlar
- **O‘qituvchi parolini yangilash ishonchliligi (`js/auth.js`, `js/app.js`, `js/sync.js`, `server.js`, `index.html`):**
  - `changeRolePassword`, `resetStudentPassword` va `toggleStudentActive` amallari server va lokal rejimda o‘sha akkauntning brute-force blokirovkasini avtomatik tozalaydi.
  - Server rejimida `mergeRemoteState` mahalliy `state.auth.hashes` ni standart (`DEFAULT_AUTH_HASHES`) ga qaytarib yubormasligi va parol yangilanganda mahalliy fallback ham yangilanishi ta’minlandi; `Sync.detectServer()` timeouti `1500ms` ga oshirilib login paytida qayta tekshiriladi.
  - Kirish formasida faol rol tugmasi gradient bilan ajratildi, tugma va parol yorlig‘i tanlangan rolga moslanadi (`Teacher paroli *` / `Teacher sifatida kirish`), xato xabarlari aniqlandi (`Teacher paroli noto‘g‘ri!` vs `IT Manager paroli noto‘g‘ri!`) va `Xavfsizlik` parol maydonlariga `autocomplete="new-password"` + ko‘rish (👁️) tugmalari qo‘shildi.
- **Tasdiqlash dialogi bilan O‘quvchi va Dars lug‘atlarini o‘chirish:**
  - `Auth.deleteStudentAccount`, `POST /api/students` (`action: 'delete'`) va `O‘quvchilar` ro‘yxatidagi `O‘chirish` tugmasi `#confirmModal` tasdig‘i orqali o‘quvchi akkaunti, progressi va faoliyat yozuvlarini o‘chiradi hamda aktiv tokenni darhol bekor qiladi (`401`).
  - `Lug‘atlar` bo‘limiga `#vocabLessonsBar` (`#vocabLessonPills`) va `#vocabDeleteSelectedLessonBtn` qo‘shildi; butun darslik va uning barcha so‘zlarini o‘chirish (`deleteLessonVocabulary`) avval `#confirmModal` orqali tasdiqlanadi.
- **API Key sozlamalari faqat IT Manager’da ko‘rinishi:**
  - `Auth.canManageAiConfig` (`role === 'it_manager'`) joriy etildi: `POST /api/ai-config` Teacher uchun `403`, `sanitizeDbForSession` esa Teacher uchun `apiKeyMasked` va `customUrl` ni yashiradi; `#toggleAiSettingsBtn` va `#aiSettingsDrawer` UI da faqat IT Manager uchun ko‘rsatiladi (`Xavfsizlik` dan to‘g‘ridan-to‘g‘ri havola bilan).
- **API so‘rovlari va tokenlarni minimallashtirish (`js/ai-txt.js`, `server.js`, `js/app.js`):**
  - `planAiEnrichment`: `.txt` dagi so‘zlarni avval mavjud baza (`state.words`) va brauzer leksika keshi (`swe_english_ai_cache_v1`, max 1500 so‘z) orqali tekshiradi, dublikatlarni birlashtiradi (`0 API` so‘rovi).
  - Paket hajmi `15` dan `40` ta so‘zgacha oshirildi (`DEFAULT_BATCH_SIZE = 40`); `buildEnrichPrompt` ixcham input (`word|hint`) va qisqa JSON kalitlariga (`w/p/pos/tr/d/ex/syn/ant/m/cat/lvl`) o‘tkazildi (`lesson` umuman yuborilmaydi).
  - `testAiConnection` minimal 1-qatorlik JSON pingga qisqartirildi; `server.js` `/api/ai-proxy` da 24 soatlik `aiProxyCache` (150 ta yozuv) va parallel `aiInFlight` birlashtirish joriy etildi.

### 5-bosqich tekshiruv natijalari
- `node --check`: [server.js](file:///c:/Users/dcode/Documents/Chiziqli/swe-english-extra/server.js) va barcha 10 ta `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **13/13** test to‘plami muvaffaqiyatli o‘tdi (Teacher lockout->reset login, IT-only AI config, student delete token invalidation, `/api/ai-proxy` cache va DB/cache/dedup `0 API` testlari bilan).
- Jonli brauzer QA (`http://127.0.0.1:4176/`, 0 konsol/CSP/sahifa xatosi): Teacher’da `API Key Sozlamasi` yashirilgani, `@madina` va `3-dars: Business & Expressions` tasdiqlash bilan o‘chirilgani hamda bazadagi so‘zlar API kalitsiz `0 ta AI so‘rovi!` bilan boyitilgani tasdiqlandi.
