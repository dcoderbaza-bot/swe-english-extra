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

## 2. Tekshiruv va QA natijalari

### Avtomatlashtirilgan Node.js testlari (`tests/verify.js`)
- `node --check` barcha 5 ta JS fayl sintaksisini xatosiz tasdiqladi.
- 4 ta test to‘plami 100% muvaffaqiyatli o‘tdi:
  1. 5 ta kategoriya va 15 ta B2/C1 boshlang‘ich so‘zlar to‘liqligi.
  2. SRS intervallari (`1 daqiqa`, `1 kun`, `3 kun`, `7 kun + Mastered`).
  3. `LocalStorage` saqlanishi va ko‘p kunlik `Daily Streak` hisob-kitobi.
  4. JSON/CSV eksport, vergul/qo‘shtirnoqli CSV parsing va import birlashtirish.

### Brauzerda jonli UI/UX QA tekshiruvi
- Lokal HTTP serverda barcha sahifalar konsol xatolarisiz yuklandi.
- Boshqaruv panelida 4 ta statistika kartasi, foizli progress bar va 5 ta kategoriya decklari tekshirildi.
- Dark Mode / Light Mode almashinuvi, 3D Flashcard 180° aylanishi, `Oson (Easy)` baholash natijasida Mastered (+1) va Streak (+1) yangilanishi tasdiqlandi.
- Multiple Choice (`Test`), `Yozma mashq`, `Listening` va `Lug‘at bazasi` CRUD modallari tekshirildi.
- Vizual skrinshot tekshiruvida planshet o‘lchamidagi header siqilishi aniqlandi va `index.html` da `lg` breakpoint hamda `whitespace-nowrap`/`shrink-0` klasslari bilan tuzatildi.
