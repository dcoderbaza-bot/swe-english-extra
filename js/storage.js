/**
 * SWE ENGLISH EXTRA — LocalStorage Persistence, Lessons, Streak Engine & JSON/CSV Import-Export
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'swe_english_extra_v1';

  function getDeps() {
    const dataMod = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
      ? require('./default-data.js')
      : root.SWEData;
    const srsMod = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
      ? require('./srs.js')
      : root.SWESRS;
    const authMod = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
      ? require('./auth.js')
      : root.SWEAuth;
    return { dataMod: dataMod, srsMod: srsMod, authMod: authMod };
  }

  function getLocalDateKey(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getPreviousDateKey(dateKey) {
    const parts = String(dateKey).split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
    return getLocalDateKey(d);
  }

  function normalizeListField(val) {
    if (Array.isArray(val)) {
      return val.map(function (s) { return String(s).trim(); }).filter(Boolean);
    }
    if (typeof val === 'string') {
      return val
        .split(/[;|,]/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }
    return [];
  }

  function resolveDefaultLessonForWord(wordObj, dataMod) {
    if (wordObj && wordObj.lesson && String(wordObj.lesson).trim()) {
      return String(wordObj.lesson).trim();
    }
    if (dataMod && Array.isArray(dataMod.DEFAULT_WORDS) && wordObj) {
      const targetWord = String(wordObj.word || '').trim().toLowerCase();
      const match = dataMod.DEFAULT_WORDS.find(function (dw) {
        return (wordObj.id && dw.id === wordObj.id) || (targetWord && dw.word.toLowerCase() === targetWord);
      });
      if (match && match.lesson) return match.lesson;
    }
    if (dataMod && Array.isArray(dataMod.DEFAULT_LESSONS) && dataMod.DEFAULT_LESSONS[0]) {
      return dataMod.DEFAULT_LESSONS[0].name;
    }
    return '1-dars: Academic Foundations';
  }

  function normalizeWordRecord(raw, now) {
    const deps = getDeps();
    const srsBase = deps.srsMod.createInitialSrsState(now);
    const wordText = String(raw.word || '').trim();
    const examples = Array.isArray(raw.examples)
      ? raw.examples.map(function (e) { return String(e || '').trim(); }).filter(Boolean)
      : [raw.example1, raw.example2].map(function (e) { return String(e || '').trim(); }).filter(Boolean);

    const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const levelUpper = String(raw.level || 'B2').trim().toUpperCase();
    const level = allowedLevels.indexOf(levelUpper) !== -1 ? levelUpper : 'B2';

    const mastered = Boolean(raw.mastered) || raw.status === 'mastered';
    const status = mastered
      ? 'mastered'
      : (['new', 'learning', 'review', 'mastered'].indexOf(raw.status) !== -1 ? raw.status : srsBase.status);

    return {
      id: raw.id ? String(raw.id) : ('w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
      word: wordText,
      phonetic: String(raw.phonetic || '').trim(),
      partOfSpeech: String(raw.partOfSpeech || 'noun').trim(),
      translation: String(raw.translation || '').trim(),
      definition: String(raw.definition || '').trim(),
      examples: examples,
      synonyms: normalizeListField(raw.synonyms),
      antonyms: normalizeListField(raw.antonyms),
      mnemonic: String(raw.mnemonic || '').trim(),
      category: String(raw.category || 'IELTS').trim() || 'IELTS',
      lesson: resolveDefaultLessonForWord(raw, deps.dataMod),
      level: level,
      status: status,
      mastered: mastered,
      intervalDays: Number.isFinite(Number(raw.intervalDays)) ? Number(raw.intervalDays) : srsBase.intervalDays,
      repetitions: Number.isFinite(Number(raw.repetitions)) ? Number(raw.repetitions) : srsBase.repetitions,
      lapses: Number.isFinite(Number(raw.lapses)) ? Number(raw.lapses) : srsBase.lapses,
      lastRating: raw.lastRating || null,
      lastReviewedAt: raw.lastReviewedAt ? Number(raw.lastReviewedAt) : null,
      nextReviewAt: raw.nextReviewAt !== undefined && raw.nextReviewAt !== null
        ? Number(raw.nextReviewAt)
        : srsBase.nextReviewAt,
      createdAt: raw.createdAt ? Number(raw.createdAt) : srsBase.createdAt,
      updatedAt: raw.updatedAt ? Number(raw.updatedAt) : srsBase.updatedAt
    };
  }

  function createDefaultAiConfig() {
    return {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      apiKey: '',
      customUrl: ''
    };
  }

  function createDefaultState(now) {
    const deps = getDeps();
    const ts = typeof now === 'number' ? now : Date.now();
    const todayKey = getLocalDateKey(new Date(ts));

    return {
      version: 2,
      words: deps.dataMod.DEFAULT_WORDS.map(function (w) {
        return normalizeWordRecord(w, ts);
      }),
      categories: deps.dataMod.DEFAULT_CATEGORIES.map(function (c) {
        return Object.assign({}, c);
      }),
      lessons: (deps.dataMod.DEFAULT_LESSONS || []).map(function (l) {
        return Object.assign({}, l);
      }),
      stats: {
        streakCount: 0,
        longestStreak: 0,
        lastStudyDate: null,
        todayDate: todayKey,
        todayReviewed: 0,
        totalReviews: 0,
        dailyGoal: 10
      },
      settings: {
        theme: 'light',
        accent: 'en-US'
      },
      aiConfig: createDefaultAiConfig(),
      auth: deps.authMod ? deps.authMod.createDefaultAuthState() : { hashes: {} },
      auditLog: []
    };
  }

  function getActiveStreak(stats, now) {
    if (!stats || !stats.lastStudyDate) return 0;
    const todayKey = getLocalDateKey(new Date(typeof now === 'number' ? now : Date.now()));
    const yesterdayKey = getPreviousDateKey(todayKey);
    if (stats.lastStudyDate === todayKey || stats.lastStudyDate === yesterdayKey) {
      return Number(stats.streakCount) || 0;
    }
    return 0;
  }

  function getTodayReviewedCount(stats, now) {
    if (!stats) return 0;
    const todayKey = getLocalDateKey(new Date(typeof now === 'number' ? now : Date.now()));
    return stats.todayDate === todayKey ? (Number(stats.todayReviewed) || 0) : 0;
  }

  function recordStudyActivity(state, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const todayKey = getLocalDateKey(new Date(ts));
    const yesterdayKey = getPreviousDateKey(todayKey);
    const stats = Object.assign({}, state.stats);

    const prevTodayCount = stats.todayDate === todayKey ? (Number(stats.todayReviewed) || 0) : 0;

    if (stats.lastStudyDate === todayKey) {
      stats.streakCount = Math.max(1, Number(stats.streakCount) || 1);
    } else if (stats.lastStudyDate === yesterdayKey) {
      stats.streakCount = (Number(stats.streakCount) || 0) + 1;
    } else {
      stats.streakCount = 1;
    }

    stats.lastStudyDate = todayKey;
    stats.todayDate = todayKey;
    stats.todayReviewed = prevTodayCount + 1;
    stats.totalReviews = (Number(stats.totalReviews) || 0) + 1;
    stats.longestStreak = Math.max(Number(stats.longestStreak) || 0, stats.streakCount);

    return Object.assign({}, state, { stats: stats });
  }

  function loadState(storageBackend, now) {
    const store = storageBackend || (typeof localStorage !== 'undefined' ? localStorage : null);
    const ts = typeof now === 'number' ? now : Date.now();
    const defaults = createDefaultState(ts);

    if (!store) return defaults;

    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) {
        saveState(defaults, store);
        return defaults;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.words)) {
        return defaults;
      }

      const mergedCategories = Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : defaults.categories;

      const normalizedWords = parsed.words.map(function (w) { return normalizeWordRecord(w, ts); });
      const lessonsList = Array.isArray(parsed.lessons) && parsed.lessons.length > 0
        ? parsed.lessons.slice()
        : defaults.lessons.slice();

      const lessonNames = new Set(lessonsList.map(function (l) { return l.name.toLowerCase(); }));
      normalizedWords.forEach(function (w) {
        if (w.lesson && !lessonNames.has(w.lesson.toLowerCase())) {
          lessonsList.push({
            id: 'lesson-' + (lessonsList.length + 1) + '-' + Math.random().toString(36).slice(2, 5),
            name: w.lesson,
            description: '',
            order: lessonsList.length + 1
          });
          lessonNames.add(w.lesson.toLowerCase());
        }
      });

      const mergedAuth = Object.assign({}, defaults.auth, parsed.auth || {}, {
        hashes: Object.assign({}, defaults.auth.hashes, (parsed.auth && parsed.auth.hashes) || {})
      });

      return {
        version: 2,
        words: normalizedWords,
        categories: mergedCategories,
        lessons: lessonsList,
        stats: Object.assign({}, defaults.stats, parsed.stats || {}),
        settings: Object.assign({}, defaults.settings, parsed.settings || {}),
        aiConfig: Object.assign({}, defaults.aiConfig, parsed.aiConfig || {}),
        auth: mergedAuth,
        auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : []
      };
    } catch (err) {
      return defaults;
    }
  }

  function saveState(state, storageBackend) {
    const store = storageBackend || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function exportToJSON(state) {
    return JSON.stringify({
      app: 'SWE ENGLISH EXTRA',
      version: 2,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      lessons: state.lessons,
      words: state.words
    }, null, 2);
  }

  function escapeCsvCell(value) {
    const str = String(value === undefined || value === null ? '' : value);
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportToCSV(words) {
    const headers = [
      'word',
      'phonetic',
      'partOfSpeech',
      'translation',
      'definition',
      'example1',
      'example2',
      'synonyms',
      'antonyms',
      'mnemonic',
      'category',
      'lesson',
      'level',
      'status',
      'mastered'
    ];

    const lines = [headers.join(',')];
    (words || []).forEach(function (w) {
      const ex = Array.isArray(w.examples) ? w.examples : [];
      const row = [
        w.word,
        w.phonetic,
        w.partOfSpeech,
        w.translation,
        w.definition,
        ex[0] || '',
        ex[1] || '',
        (w.synonyms || []).join('; '),
        (w.antonyms || []).join('; '),
        w.mnemonic,
        w.category,
        w.lesson || '',
        w.level,
        w.status,
        w.mastered ? 'true' : 'false'
      ].map(escapeCsvCell);
      lines.push(row.join(','));
    });

    return lines.join('\r\n');
  }

  function parseCSV(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      const next = clean[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          currentCell += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          currentCell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          currentRow.push(currentCell);
          currentCell = '';
        } else if (ch === '\r' && next === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i++;
        } else if (ch === '\n' || ch === '\r') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += ch;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    const nonEmptyRows = rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });

    if (nonEmptyRows.length < 2) {
      return [];
    }

    const headers = nonEmptyRows[0].map(function (h) { return h.trim(); });
    const records = [];

    for (let r = 1; r < nonEmptyRows.length; r++) {
      const row = nonEmptyRows[r];
      const obj = {};
      headers.forEach(function (header, idx) {
        obj[header] = row[idx] !== undefined ? row[idx].trim() : '';
      });

      const parsedExamples = [];
      if (obj.example1) parsedExamples.push(obj.example1);
      if (obj.example2) parsedExamples.push(obj.example2);
      if (parsedExamples.length === 0 && obj.examples) {
        obj.examples.split(/\s*\|\s*/).forEach(function (ex) {
          if (ex.trim()) parsedExamples.push(ex.trim());
        });
      }

      records.push({
        word: obj.word || '',
        phonetic: obj.phonetic || '',
        partOfSpeech: obj.partOfSpeech || 'noun',
        translation: obj.translation || '',
        definition: obj.definition || '',
        examples: parsedExamples,
        synonyms: obj.synonyms ? obj.synonyms.split(/[;|]/).map(function (s) { return s.trim(); }).filter(Boolean) : [],
        antonyms: obj.antonyms ? obj.antonyms.split(/[;|]/).map(function (s) { return s.trim(); }).filter(Boolean) : [],
        mnemonic: obj.mnemonic || '',
        category: obj.category || 'IELTS',
        lesson: obj.lesson || '',
        level: obj.level || 'B2',
        status: obj.status || 'new',
        mastered: obj.mastered === 'true' || obj.status === 'mastered'
      });
    }

    return records;
  }

  function mergeImportedWords(state, rawItems, importedCategories, now, importedLessons) {
    const ts = typeof now === 'number' ? now : Date.now();
    const existingWords = state.words.slice();
    const existingByKey = new Map();

    existingWords.forEach(function (w, idx) {
      existingByKey.set(w.word.trim().toLowerCase(), idx);
    });

    const categories = state.categories.slice();
    const categoryNames = new Set(categories.map(function (c) { return c.name.toLowerCase(); }));

    if (Array.isArray(importedCategories)) {
      importedCategories.forEach(function (c) {
        const name = String(c && c.name ? c.name : '').trim();
        if (name && !categoryNames.has(name.toLowerCase())) {
          categories.push({
            id: c.id || name,
            name: name,
            icon: c.icon || 'folder',
            color: c.color || 'indigo',
            builtIn: false
          });
          categoryNames.add(name.toLowerCase());
        }
      });
    }

    const lessons = Array.isArray(state.lessons) ? state.lessons.slice() : [];
    const lessonNames = new Set(lessons.map(function (l) { return l.name.toLowerCase(); }));

    if (Array.isArray(importedLessons)) {
      importedLessons.forEach(function (l) {
        const name = String(l && l.name ? l.name : l || '').trim();
        if (name && !lessonNames.has(name.toLowerCase())) {
          lessons.push({
            id: (l && l.id) || ('lesson-' + (lessons.length + 1) + '-' + Math.random().toString(36).slice(2, 5)),
            name: name,
            description: (l && l.description) || '',
            order: (l && l.order) || (lessons.length + 1)
          });
          lessonNames.add(name.toLowerCase());
        }
      });
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    (rawItems || []).forEach(function (raw) {
      if (!raw || !raw.word || !raw.translation || !String(raw.word).trim() || !String(raw.translation).trim()) {
        skipped++;
        return;
      }

      const normalized = normalizeWordRecord(raw, ts);
      const key = normalized.word.toLowerCase();

      if (!categoryNames.has(normalized.category.toLowerCase())) {
        categories.push({
          id: normalized.category,
          name: normalized.category,
          icon: 'folder',
          color: 'violet',
          builtIn: false
        });
        categoryNames.add(normalized.category.toLowerCase());
      }

      if (normalized.lesson && !lessonNames.has(normalized.lesson.toLowerCase())) {
        lessons.push({
          id: 'lesson-' + (lessons.length + 1) + '-' + Math.random().toString(36).slice(2, 5),
          name: normalized.lesson,
          description: '',
          order: lessons.length + 1
        });
        lessonNames.add(normalized.lesson.toLowerCase());
      }

      if (existingByKey.has(key)) {
        const idx = existingByKey.get(key);
        const current = existingWords[idx];
        existingWords[idx] = Object.assign({}, current, {
          phonetic: normalized.phonetic || current.phonetic,
          partOfSpeech: normalized.partOfSpeech || current.partOfSpeech,
          translation: normalized.translation || current.translation,
          definition: normalized.definition || current.definition,
          examples: normalized.examples.length ? normalized.examples : current.examples,
          synonyms: normalized.synonyms.length ? normalized.synonyms : current.synonyms,
          antonyms: normalized.antonyms.length ? normalized.antonyms : current.antonyms,
          mnemonic: normalized.mnemonic || current.mnemonic,
          category: normalized.category || current.category,
          lesson: (raw.lesson && String(raw.lesson).trim()) ? normalized.lesson : current.lesson,
          level: normalized.level || current.level,
          updatedAt: ts
        });
        updated++;
      } else {
        existingByKey.set(key, existingWords.length);
        existingWords.push(normalized);
        added++;
      }
    });

    const nextState = Object.assign({}, state, {
      words: existingWords,
      categories: categories,
      lessons: lessons
    });

    return {
      state: nextState,
      summary: { added: added, updated: updated, skipped: skipped }
    };
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    getLocalDateKey: getLocalDateKey,
    getPreviousDateKey: getPreviousDateKey,
    normalizeWordRecord: normalizeWordRecord,
    createDefaultAiConfig: createDefaultAiConfig,
    createDefaultState: createDefaultState,
    getActiveStreak: getActiveStreak,
    getTodayReviewedCount: getTodayReviewedCount,
    recordStudyActivity: recordStudyActivity,
    loadState: loadState,
    saveState: saveState,
    exportToJSON: exportToJSON,
    exportToCSV: exportToCSV,
    parseCSV: parseCSV,
    mergeImportedWords: mergeImportedWords
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWEStorage = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
