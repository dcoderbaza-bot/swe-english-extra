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
