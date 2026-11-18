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

---

## 7. 6-bosqich yangilanishlari (Yakuniy Yopiq Test, Anti-Cheating Nazorati va Ustoz Ruxsati)

### Qo‘shilgan imkoniyatlar
- **Yakuniy Yopiq Lug‘at Testi (`js/exam.js`, `index.html`, `js/app.js`, `css/styles.css`):**
  - `Mashqlar` bo‘limiga 5-rejim (`Yakuniy Yopiq Test`, `#mode-exam`) qo‘shildi: inglizcha so‘z ko‘rsatiladi (`translate="no"`, `.notranslate`, `.exam-locked-surface`), o‘quvchi esa o‘zbekcha tarjimasini **faqat klaviaturadan** kiritadi.
  - `SWEExam.gradeUzbekTranslation` o‘zbek lotin apostroflarini (`'`/`‘`/`’`), tirelarni hamda vergul/nuqta-vergul/slesh bilan ajratilgan sinonimlarni qabul qiladi; yakuniy natija va batafsil so‘zlar tahlili Teacher kuzatuviga uzatiladi.
- **Kengaytirilgan Proctoring va Anti-Cheating himoyasi (`js/app.js`, `index.html`):**
  - Test boshlanganda bloklanmaydigan `tryEnterFullscreen()` orqali Fullscreen rejimi yoqiladi (`notranslate` meta + `data-gramm="false"` + `data-lt-active="false"` + `autocomplete="off"`).
  - `visibilitychange` (tab almashtirish/yashirish), `window.blur` (Alt+Tab / boshqa oyna / extension popup), `fullscreenchange` (Fullscreen’dan chiqish), o‘ng tugma (`contextmenu`), `copy`/`cut`/`paste`/`drop` + `beforeinput` (`insertFromPaste`/`insertFromDrop`/`insertReplacementText`), `F12` / `Ctrl+Shift+I/J/C/K` / `Ctrl+U/S/P/C/V/X` / `PrintScreen`, boshqa bo‘lim/rejim/darslikka o‘tish va `MutationObserver` (Google Translate `<font>` / `translated-ltr`, Grammarly/LanguageTool/DeepL DOM aralashuvi) kuzatiladi.
  - **2 marta ogohlantirish -> 3-chi urinishda CHEATING bloki:** Dastlabki 2 qoidabuzarlikda `Ogohlantirish 1/2` va `2/2` (`EXAM_WARNING`), 3-chi qoidabuzarlikda esa test avtomatik **`cheating_locked`** holatiga tushadi (`EXAM_CHEATING`) va sahifa yangilansa ham (`F5`) blok saqlanadi (hamda `in_progress` testda sahifa yangilashning o‘zi ham qoidabuzarlik sifatida qayd etiladi).
- **Server nazorati va O‘qituvchi kuzatuvi / qayta topshirish ruxsati (`server.js`, `js/storage.js`, `js/sync.js`, `js/app.js`):**
  - `POST /api/exam` (`start`, `answer`, `violation`, `finish`) va `POST /api/students` (`action: 'approveExamRetake'`) qo‘shildi: bloklangan yoki tugallangan testni qayta boshlash serverda ham `403` bilan bloklanadi, faqat Teacher yoki IT Manager tasdiqlash dialogi (`#confirmModal`) orqali qayta topshirishga ruxsat bera oladi (real vaqt SSE orqali o‘quvchi oynasi ham ochiladi).
  - `Kuzatuv` bo‘limida `#monitorCheatingBanner`, kartochkalarda Yakuniy Test holati + tezkor `Qayta ruxsat` tugmasi va `#studentDetailModal` da (`#stuModalExamSection`) ball, qoidabuzarliklar tarixi hamda har bir so‘z bo‘yicha yozilgan javoblar ko‘rsatiladi.
  - Jonli E2E tekshiruvi jarayonida topilgan `requestFullscreen()` kutish muammosi (`tryEnterFullscreen`), `getStudentFinalExam()` da `studentProgress` manzilini o‘qish va `#confirmModal` ning `#studentDetailModal` ortida qolib ketish xatosi (`z-[80]`) tuzatildi.

### 6-bosqich tekshiruv natijalari
- `node --check`: [server.js](file:///c:/Users/dcode/Documents/Chiziqli/swe-english-extra/server.js) va barcha 11 ta `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **14/14** test to‘plami muvaffaqiyatli o‘tdi (o‘zbekcha tarjima tekshiruvi, 2-warning -> 3rd strike `cheating_locked`, `403` himoya, reloadda saqlanish va Teacher retake ruxsati integratsiya testlari bilan).
- Jonli brauzer E2E QA (`http://127.0.0.1:4176/`, 0 ta konsol/sahifa/HTTP xatosi): `student1` da test boshlash, klaviaturadan javob kiritish, `Ctrl+V` va `contextmenu` orqali 2 ta ogohlantirish + 3-chi urinishda `CHEATING` bloki, reloaddan keyin blok saqlanishi, Teacher `#monitorCheatingBanner` / `#studentDetailModal` da tahlil ko‘rinishi, `#confirmModal` (`z-[80]`) orqali qayta ruxsat berish va o‘quvchida test qayta ochilishi to‘liq tasdiqlandi.

---

## 8. 7-bosqich yangilanishlari (Istalgan IP dan ulanish va boshqa qurilmalarda parol sinxronizatsiyasi)

### Tuzatilgan muammolar
- **Istalgan IP va tarmoqda ishlash (`server.js`):** Server standart `HOST` qiymati `'127.0.0.1'` dan `'0.0.0.0'` ga o‘tkazildi (`PORT` `4175`), ishga tushishda barcha lokal va LAN IPv4 manzillari (`Network: http://<IP>:<port>`) chop etiladi; `/api/*` uchun `CORS` + `OPTIONS` preflight, `HTML_CSP` da `http:` + `https:` `connect-src`, `::ffff:` IP normallashuvi hamda LAN HTTP da COOP sarlavhasini o‘chirish qo‘shildi.
- **Boshqa qurilmalarda parol va server ulanishi (`js/sync.js`, `js/auth.js`, `index.html`, `js/app.js`):**
  - `Sync` moduliga `setServerBaseUrl` / `?server=http://...` va `#toggleServerUrlBtn` ("Server IP") ulash oynasi qo‘shildi, server tekshiruv timeouti `3500ms` gacha oshirildi va Local rejimdagi xatolik xabarida boshqa qurilma uchun aniq ko‘rsatma berildi.
  - Kirish maydonlariga `autocapitalize="none" autocorrect="off" spellcheck="false"` va `Auth.authenticate` ga mobil nusxalashdagi chetki bo‘sh joyga (`password.trim()` fallback) moslashuv qo‘shildi.

### 7-bosqich tekshiruv natijalari
- `node --check`: `server.js` va barcha `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **15/15** test to‘plami muvaffaqiyatli o‘tdi (`0.0.0.0` bind, CORS `OPTIONS`, cross-origin `localhost`/`127.0.0.1`/LAN IP login va mobil bo‘sh joy toleransi testlari bilan).
- Jonli brauzer QA (`http://127.0.0.1:4177`, `http://192.168.1.15:4177`, `http://localhost:4177`): IT Manager parolni yangilagandan so‘ng boshqa IP (`192.168.1.15:4177`) orqali Teacher kirishi va `localhost` dan `Server IP` ulash orqali `student1` kirishi tasdiqlandi.

---

## 9. 8-bosqich yangilanishlari (API Key orqali Neural Talaffuz va Mukammal IPA / Bo‘g‘in-Urg‘u Tizimi)

### Qo‘shilgan imkoniyatlar
- **Server-side Neural TTS Proksi va Disk Kesh (`server.js`, `js/speech.js`, `js/sync.js`):**
  - `POST /api/tts` endpointi qo‘shildi (`OpenAI tts-1 / gpt-4o-mini-tts` MP3, `Google Gemini gemini-2.5-flash-preview-tts` PCM16 -> 44-baytli RIFF/WAV `pcm16ToWavUint8Array`, `ElevenLabs`, `Custom HTTPS TTS`, hamda `browser-fallback` Web Speech).
  - Har bir `(provider, model, voice, accent, word)` audio javobi `data/tts-cache/<sha256>` da diskka va mijozda `audioBlobCache` (max 240 ta Blob) ga saqlanadi; sekin (`0.72x`) va oddiy tezlik bitta keshlangan audiodan `playbackRate` orqali ijro etiladi — takror tinglashda **0 ta qo‘shimcha API so‘rovi** ketadi.
  - TTS API kalitlari ham faqat IT Manager’ga ko‘rinadi/o‘zgartiriladi (`hasTtsKey`, `ttsApiKeyMasked`), Teacher va Studentlarga aslo uzatilmaydi; `ttsCustomUrl` esa `validateAiEndpoint` HTTPS/SSRF himoyasidan o‘tkaziladi.
- **Mukammal Yozma Talaffuz (`js/default-data.js`, `js/ai-txt.js`, `js/storage.js`, `js/app.js`, `index.html`):**
  - So‘zlar modeliga `phoneticUk` (US dan farqli Britaniya IPA) va `syllables` (`in·DEV·er`, `ig·ZAS·er·bayt`, urg‘uli bo‘g‘in katta harfda) qo‘shildi; boshlang‘ich 15 ta so‘z va AI `.TXT` prompt (`p`, `pUk`, `syl`) bilan boyitildi hamda Flashcards, Quiz, Yozma/Listening va Lug‘atlarda `formatWordPronunciation` bilan ko‘rsatildi.
  - `setListeningType` / `renderListeningQuestion` ga `currentView === 'study' && currentStudyMode === 'listening'` cheklovi qo‘yilib, sahifa yuklanganda yashirin fonda avtomatik `/api/tts` chaqiruvi ketishining oldi olindi.

### 8-bosqich tekshiruv natijalari
- `node --check`: `server.js` va barcha `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **16/16** test to‘plami o‘tdi (US/UK IPA + `syllables`, `pcm16ToWavUint8Array`, OpenAI TTS disk-kesh `0 API`, Gemini WAV va IT-only masking / SSRF testlari bilan).
- Jonli brauzer E2E QA (`http://127.0.0.1:4178` va `4179`): IT Manager TTS API kalitini saqlash/reload/maskalash/tozalash, sahifa yuklanganda `0` ta avtomatik `/api/tts` chaqiruvi, va `student1` Flashcard’da `US /ɪnˈdev.ər/ · UK /ɪnˈdev.ə(r)/ · in·DEV·er` ko‘rinishi `0` konsol/sahifa/HTTP xatosi bilan tasdiqlandi.

---

## 10. 9-bosqich yangilanishlari (Birlamchi AI / DeepSeek orqali talaffuzni birinchi aniqlash)

### Qo‘shilgan imkoniyatlar
- **Birlamchi AI (`DeepSeek`) Talaffuz Dvigateli (`js/ai-txt.js`, `server.js`, `js/sync.js`, `js/storage.js`, `js/app.js`, `index.html`):**
  - `AiTxt.buildPronunciationPrompt` va `AiTxt.resolvePronunciationWithAI` qo‘shildi: US IPA, UK IPA, bo‘g‘in-urg‘u (`syllables`) hamda o‘qilish qo‘llanmasi (`pronunciationNote` / `"say"`) ni ixcham JSON formatda birinchi navbatda **birlamchi AI (DeepSeek)** orqali aniqlaydi va `state.words` / keshda saqlaydi (`0` takror so‘rov).
  - Serverda **`POST /api/pronounce`** endpointi qo‘shildi va `POST /api/tts` ham so‘zda talaffuz to‘liq bo‘lmasa **avval DeepSeek** orqali talaffuz shaklini aniqlab `db.words` ga saqlaydi, so‘ngra 2-bosqichda audio TTS (yoki brauzer Web Speech) ga o‘tadi.
  - `.TXT Kiritish` bo‘limiga Teacher va IT Manager uchun `#batchPronounceBtn` (`"Talaffuzlarni AI bilan aniqlash"`) tugmasi qo‘shildi; shuningdek `#aiModelInput` da `defaultModel` o‘rniga `undefined` ko‘rinishiga sabab bo‘lgan xato (`getDefaultAiModel`) tuzatildi.

### 9-bosqich tekshiruv natijalari
- `node --check`: `server.js` va barcha `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **17/17** test to‘plami muvaffaqiyatli o‘tdi (`/api/pronounce`, `resolvePronunciationWithAI` DB/cache `0 API` qayta ishlatish, student bulk `403` cheklovi va `/api/tts` ichida `['deepseek', 'openai-tts']` ketma-ketligi tasdiqlandi).
- Jonli brauzer QA (`http://127.0.0.1:4180`, 0 konsol/sahifa/HTTP xatosi): `#batchPronounceBtn` IT Manager va Teacher’da ko‘rinishi (Teacher’da API kalit yashirin qolishi) va to‘liq bazada `0 API` xabari bilan ishlashi tasdiqlandi.

---

## 11. 10-bosqich yangilanishlari (Telefonlar uchun ochiq ro‘yxatdan o‘tish va Wi-Fi IP ulanish yordamchisi)

### Qo‘shilgan imkoniyatlar
- **Hamma o‘quvchilar uchun ochiq mustaqil ro‘yxatdan o‘tish (`js/auth.js`, `server.js`, `js/sync.js`, `index.html`, `js/app.js`):**
  - `settings.allowOpenSignup: true` standart holatda yoqildi. Endi istalgan o‘quvchi telefoni brauzeridan **`"Ro‘yxatdan o‘tish"`** (`#stuAuthSignupModeBtn`) orqali ism-familiya, guruh, login va parolini kiritib (`POST /api/register`, sinf Wi-Fi NAT uchun IP boshiga 15 daqiqada 30 ta gacha ruxsat) bir zumda tizimga kira oladi.
  - Teacher va IT Manager `O‘quvchilar` bo‘limidagi `#toggleOpenSignupBtn` orqali ochiq ro‘yxatdan o‘tishni istalgan payt yoqishi/yopishi (`POST /api/students -> setOpenSignup`) hamda `#staffPhoneAccessCard` (`GET /api/network-info`) dan telefonlar uchun tayyor Wi-Fi/Hotspot IP havolalarini (`listReachableLanUrls` virtual adapterlarni pastga surib, real `Wi-Fi` IP larni birinchi chiqaradi) bir bosishda nusxalashi mumkin.
  - `HTML_CSP` ga `media-src 'self' blob: data:` qo‘shildi (iOS/Android brauzerlarda `blob:` TTS audio bloklanmasligi uchun) va Windows foydalanuvchilari uchun [`start-server.bat`](start-server.bat) yaratildi.

### 10-bosqich tekshiruv natijalari
- `node --check`: `server.js` va barcha `js/*.js` fayllar xatosiz o‘tdi.
- `node tests/verify.js`: **18/18** test to‘plami muvaffaqiyatli o‘tdi (`POST /api/register`, dublikat login `400`, `/api/network-info` Teacher `200` / Student `403`, `setOpenSignup` yopish `403` -> ochish `200` va `media-src` CSP testlari bilan).
- Jonli mobil brauzer E2E QA (`http://192.168.1.15:4181/`): telefondan to‘g‘ridan-to‘g‘ri `@nodira_mob` ro‘yxatdan o‘tib kirishi, Teacher `O‘quvchilar` sahifasida Wi-Fi havolalari (`http://192.168.1.15:4181`) ko‘rinishi va ochiq ro‘yxatdan o‘tishni yopib/qayta ochish `0` konsol/sahifa/HTTP xatosi bilan tasdiqlandi.
