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
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: '',
      customUrl: ''
    };
  }

  function createEmptyStats(now) {
    const ts = typeof now === 'number' ? now : Date.now();
    return {
      streakCount: 0,
      longestStreak: 0,
      lastStudyDate: null,
      todayDate: getLocalDateKey(new Date(ts)),
      todayReviewed: 0,
      totalReviews: 0,
      dailyGoal: 10
    };
  }

  function createEmptyStudentProgress(now) {
    const ts = typeof now === 'number' ? now : Date.now();
    return {
      srsByWordId: {},
      stats: createEmptyStats(ts),
      modeStats: {
        flashcardsReviewed: 0,
        quizCompleted: 0,
        quizCorrect: 0,
        quizTotal: 0,
        writingCompleted: 0,
        writingCorrect: 0,
        writingTotal: 0,
        listeningCompleted: 0,
        listeningCorrect: 0,
        listeningTotal: 0
      },
      liveStatus: {
        online: false,
        lastSeenAt: null,
        currentView: 'dashboard',
        currentMode: 'flashcards',
        currentLesson: 'ALL',
        currentDeck: 'ALL',
        currentWord: '',
        currentAction: 'Tizimga kirmagan',
        sessionStartedAt: null
      }
    };
  }

  function createDefaultState(now) {
    const deps = getDeps();
    const ts = typeof now === 'number' ? now : Date.now();
    const students = deps.authMod && typeof deps.authMod.createDefaultStudents === 'function'
      ? deps.authMod.createDefaultStudents(ts)
      : [];

    const studentProgress = {};
    students.forEach(function (stu) {
      studentProgress[stu.id] = createEmptyStudentProgress(ts);
    });

    return {
      version: 3,
      words: deps.dataMod.DEFAULT_WORDS.map(function (w) {
        return normalizeWordRecord(w, ts);
      }),
      categories: deps.dataMod.DEFAULT_CATEGORIES.map(function (c) {
        return Object.assign({}, c);
      }),
      lessons: (deps.dataMod.DEFAULT_LESSONS || []).map(function (l) {
        return Object.assign({}, l);
      }),
      students: students,
      studentProgress: studentProgress,
      studentActivityLog: [],
      stats: createEmptyStats(ts),
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

  function applyStatsStudyActivity(rawStats, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const todayKey = getLocalDateKey(new Date(ts));
    const yesterdayKey = getPreviousDateKey(todayKey);
    const stats = Object.assign(createEmptyStats(ts), rawStats || {});

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

    return stats;
  }

  function recordStudyActivity(state, now) {
    return Object.assign({}, state, {
      stats: applyStatsStudyActivity(state.stats, now)
    });
  }

  function ensureStudentProgress(state, studentId, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const map = Object.assign({}, (state && state.studentProgress) || {});
    if (!studentId) return map;
    const base = createEmptyStudentProgress(ts);
    const current = map[studentId] || {};
    map[studentId] = {
      srsByWordId: Object.assign({}, current.srsByWordId || {}),
      stats: Object.assign(base.stats, current.stats || {}),
      modeStats: Object.assign(base.modeStats, current.modeStats || {}),
      liveStatus: Object.assign(base.liveStatus, current.liveStatus || {})
    };
    return map;
  }

  function getWordsForSession(state, userSession, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const baseWords = Array.isArray(state && state.words) ? state.words : [];
    if (!userSession || userSession.role !== 'student' || !userSession.userId) {
      return baseWords;
    }

    const deps = getDeps();
    const progress = (state.studentProgress && state.studentProgress[userSession.userId]) || null;
    const srsMap = (progress && progress.srsByWordId) || {};

    return baseWords.map(function (w) {
      const srsState = srsMap[w.id];
      if (!srsState) {
        const fresh = deps.srsMod.createInitialSrsState(ts);
        return Object.assign({}, w, {
          status: fresh.status,
          mastered: false,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          lastRating: null,
          lastReviewedAt: null,
          nextReviewAt: w.createdAt || ts
        });
      }
      return Object.assign({}, w, srsState);
    });
  }

  function getStatsForSession(state, userSession) {
    if (userSession && userSession.role === 'student' && userSession.userId) {
      const progress = state && state.studentProgress && state.studentProgress[userSession.userId];
      if (progress && progress.stats) return progress.stats;
      return createEmptyStats(Date.now());
    }
    return (state && state.stats) || createEmptyStats(Date.now());
  }

  function appendStudentActivityLog(logList, studentSession, eventPayload, now) {
    const list = Array.isArray(logList) ? logList.slice() : [];
    const ts = typeof now === 'number' ? now : Date.now();
    const ev = eventPayload || {};

    list.unshift({
      id: 'act-' + ts + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: ts,
      studentId: (studentSession && studentSession.userId) || '',
      username: (studentSession && studentSession.username) || '',
      fullName: (studentSession && studentSession.fullName) || 'O‘quvchi',
      group: (studentSession && studentSession.group) || 'General',
      type: String(ev.type || 'ACTIVITY'),
      mode: String(ev.mode || ''),
      lesson: String(ev.lesson || ''),
      word: String(ev.word || ''),
      detail: String(ev.detail || ''),
      isCorrect: ev.isCorrect !== undefined ? Boolean(ev.isCorrect) : null
    });

    return list.slice(0, 300);
  }

  function recordStudentEvent(state, studentSession, eventPayload, now) {
    if (!studentSession || studentSession.role !== 'student' || !studentSession.userId) {
      return state;
    }

    const ts = typeof now === 'number' ? now : Date.now();
    const ev = eventPayload || {};
    const studentId = studentSession.userId;
    const nextProgress = ensureStudentProgress(state, studentId, ts);
    const cur = nextProgress[studentId];

    const nextLive = Object.assign({}, cur.liveStatus, {
      online: ev.type !== 'LOGOUT',
      lastSeenAt: ts,
      currentView: ev.view !== undefined ? ev.view : cur.liveStatus.currentView,
      currentMode: ev.mode !== undefined ? ev.mode : cur.liveStatus.currentMode,
      currentLesson: ev.lesson !== undefined ? ev.lesson : cur.liveStatus.currentLesson,
      currentDeck: ev.deck !== undefined ? ev.deck : cur.liveStatus.currentDeck,
      currentWord: ev.word !== undefined ? ev.word : cur.liveStatus.currentWord,
      currentAction: ev.detail ? String(ev.detail) : cur.liveStatus.currentAction,
      sessionStartedAt: cur.liveStatus.sessionStartedAt || (ev.type === 'LOGIN' ? ts : ts)
    });

    const nextModeStats = Object.assign({}, cur.modeStats);
    if (ev.quizCorrectDelta || ev.quizTotalDelta) {
      nextModeStats.quizCorrect += Number(ev.quizCorrectDelta) || 0;
      nextModeStats.quizTotal += Number(ev.quizTotalDelta) || 0;
    }
    if (ev.quizFinished) nextModeStats.quizCompleted += 1;

    if (ev.writingCorrectDelta || ev.writingTotalDelta) {
      nextModeStats.writingCorrect += Number(ev.writingCorrectDelta) || 0;
      nextModeStats.writingTotal += Number(ev.writingTotalDelta) || 0;
    }
    if (ev.writingFinished) nextModeStats.writingCompleted += 1;

    if (ev.listeningCorrectDelta || ev.listeningTotalDelta) {
      nextModeStats.listeningCorrect += Number(ev.listeningCorrectDelta) || 0;
      nextModeStats.listeningTotal += Number(ev.listeningTotalDelta) || 0;
    }
    if (ev.listeningFinished) nextModeStats.listeningCompleted += 1;

    let nextStats = cur.stats;
    if (ev.countAsStudyActivity) {
      nextStats = applyStatsStudyActivity(cur.stats, ts);
    }

    nextProgress[studentId] = Object.assign({}, cur, {
      stats: nextStats,
      modeStats: nextModeStats,
      liveStatus: nextLive
    });

    const nextLog = ev.type === 'HEARTBEAT'
      ? (state.studentActivityLog || [])
      : appendStudentActivityLog(state.studentActivityLog, studentSession, ev, ts);

    return Object.assign({}, state, {
      studentProgress: nextProgress,
      studentActivityLog: nextLog
    });
  }

  function applyWordReviewForSession(state, userSession, wordId, ratingKey, srsMod, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const deps = getDeps();
    const srs = srsMod || deps.srsMod;
    const baseWord = (state.words || []).find(function (w) { return w.id === wordId; });
    if (!baseWord) return { state: state, updatedCard: null };

    if (!userSession || userSession.role !== 'student' || !userSession.userId) {
      const updated = srs.applyReviewRating(baseWord, ratingKey, ts);
      const nextWords = state.words.map(function (w) { return w.id === wordId ? updated : w; });
      const nextState = recordStudyActivity(Object.assign({}, state, { words: nextWords }), ts);
      return { state: nextState, updatedCard: updated };
    }

    const studentId = userSession.userId;
    const nextProgress = ensureStudentProgress(state, studentId, ts);
    const cur = nextProgress[studentId];
    const existingSrs = cur.srsByWordId[wordId] || Object.assign({ id: baseWord.id, word: baseWord.word }, srs.createInitialSrsState(ts));
    const rated = srs.applyReviewRating(existingSrs, ratingKey, ts);

    const srsEntry = {
      status: rated.status,
      mastered: rated.mastered,
      intervalDays: rated.intervalDays,
      repetitions: rated.repetitions,
      lapses: rated.lapses,
      lastRating: rated.lastRating,
      lastReviewedAt: rated.lastReviewedAt,
      nextReviewAt: rated.nextReviewAt,
      updatedAt: rated.updatedAt
    };

    const nextSrsMap = Object.assign({}, cur.srsByWordId);
    nextSrsMap[wordId] = srsEntry;

    const rule = srs.RATINGS[ratingKey] || { labelUz: ratingKey };
    const nextStats = applyStatsStudyActivity(cur.stats, ts);
    const nextModeStats = Object.assign({}, cur.modeStats, {
      flashcardsReviewed: (Number(cur.modeStats.flashcardsReviewed) || 0) + 1
    });

    const detail = '"' + baseWord.word + '" so‘zini "' + rule.labelUz + '" deb baholadi (' + rated.status + ')';
    const nextLive = Object.assign({}, cur.liveStatus, {
      online: true,
      lastSeenAt: ts,
      currentView: 'study',
      currentMode: 'flashcards',
      currentLesson: baseWord.lesson || cur.liveStatus.currentLesson,
      currentWord: baseWord.word,
      currentAction: detail
    });

    nextProgress[studentId] = Object.assign({}, cur, {
      srsByWordId: nextSrsMap,
      stats: nextStats,
      modeStats: nextModeStats,
      liveStatus: nextLive
    });

    const nextLog = appendStudentActivityLog(state.studentActivityLog, userSession, {
      type: 'FLASHCARD_RATE',
      mode: 'flashcards',
      lesson: baseWord.lesson || '',
      word: baseWord.word,
      detail: detail,
      isCorrect: ratingKey !== 'again'
    }, ts);

    return {
      state: Object.assign({}, state, {
        studentProgress: nextProgress,
        studentActivityLog: nextLog
      }),
      updatedCard: Object.assign({}, baseWord, srsEntry)
    };
  }

  function getStudentSummary(state, student, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const deps = getDeps();
    const words = getWordsForSession(state, { role: 'student', userId: student.id }, ts);
    const totalWords = words.length;
    const masteredCount = words.filter(function (w) { return w.mastered || w.status === 'mastered'; }).length;
    const learningCount = words.filter(function (w) { return w.status === 'learning' || w.status === 'review'; }).length;
    const dueCount = deps.srsMod.getDueCards(words, ts).length;
    const masteryPct = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

    const progress = (state.studentProgress && state.studentProgress[student.id]) || createEmptyStudentProgress(ts);
    const live = progress.liveStatus || {};
    const stats = progress.stats || {};
    const mStats = progress.modeStats || {};

    const lastSeenAt = live.lastSeenAt ? Number(live.lastSeenAt) : 0;
    const ageMs = lastSeenAt ? (ts - lastSeenAt) : Infinity;
    let presence = 'offline';
    if (live.online && ageMs <= 120 * 1000) {
      presence = 'online';
    } else if (lastSeenAt && ageMs <= 15 * 60 * 1000) {
      presence = 'recent';
    }

    const totalAnswered = (Number(mStats.quizTotal) || 0) + (Number(mStats.writingTotal) || 0) + (Number(mStats.listeningTotal) || 0);
    const totalCorrect = (Number(mStats.quizCorrect) || 0) + (Number(mStats.writingCorrect) || 0) + (Number(mStats.listeningCorrect) || 0);
    const accuracyPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

    return {
      student: student,
      totalWords: totalWords,
      masteredCount: masteredCount,
      learningCount: learningCount,
      dueCount: dueCount,
      masteryPct: masteryPct,
      streakCount: getActiveStreak(stats, ts),
      todayReviewed: getTodayReviewedCount(stats, ts),
      totalReviews: Number(stats.totalReviews) || 0,
      modeStats: mStats,
      accuracyPct: accuracyPct,
      liveStatus: live,
      presence: presence
    };
  }

  function normalizeState(parsed, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const defaults = createDefaultState(ts);
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

    const studentsList = Array.isArray(parsed.students) && parsed.students.length > 0
      ? parsed.students.map(function (s) { return Object.assign({ active: true, group: 'General' }, s); })
      : defaults.students;

    const mergedProgress = Object.assign({}, defaults.studentProgress, parsed.studentProgress || {});
    studentsList.forEach(function (s) {
      if (!mergedProgress[s.id]) {
        mergedProgress[s.id] = createEmptyStudentProgress(ts);
      } else {
        const base = createEmptyStudentProgress(ts);
        mergedProgress[s.id] = {
          srsByWordId: Object.assign({}, mergedProgress[s.id].srsByWordId || {}),
          stats: Object.assign(base.stats, mergedProgress[s.id].stats || {}),
          modeStats: Object.assign(base.modeStats, mergedProgress[s.id].modeStats || {}),
          liveStatus: Object.assign(base.liveStatus, mergedProgress[s.id].liveStatus || {})
        };
      }
    });

    const mergedAuth = Object.assign({}, defaults.auth, parsed.auth || {}, {
      hashes: Object.assign({}, defaults.auth.hashes, (parsed.auth && parsed.auth.hashes) || {})
    });

    const mergedAi = Object.assign({
      provider: 'deepseek',
      model: 'deepseek-chat',
      customUrl: '',
      apiKey: '',
      hasApiKey: false,
      apiKeyMasked: ''
    }, defaults.aiConfig, parsed.aiConfig || {});
    mergedAi.hasApiKey = Boolean(mergedAi.hasApiKey || mergedAi.apiKey);

    return {
      version: 3,
      words: normalizedWords,
      categories: mergedCategories,
      lessons: lessonsList,
      students: studentsList,
      studentProgress: mergedProgress,
      studentActivityLog: Array.isArray(parsed.studentActivityLog) ? parsed.studentActivityLog.slice(0, 300) : [],
      stats: Object.assign({}, defaults.stats, parsed.stats || {}),
      settings: Object.assign({}, defaults.settings, parsed.settings || {}),
      aiConfig: mergedAi,
      auth: mergedAuth,
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(0, 150) : []
    };
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
      return normalizeState(parsed, ts);
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
      version: 3,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      lessons: state.lessons,
      words: state.words
    }, null, 2);
  }

  function escapeCsvCell(value) {
    let str = String(value === undefined || value === null ? '' : value);
    // Guard against CSV formula injection (CWE-1236) in Excel / Sheets
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
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
    createEmptyStats: createEmptyStats,
    createEmptyStudentProgress: createEmptyStudentProgress,
    createDefaultState: createDefaultState,
    ensureStudentProgress: ensureStudentProgress,
    getActiveStreak: getActiveStreak,
    getTodayReviewedCount: getTodayReviewedCount,
    applyStatsStudyActivity: applyStatsStudyActivity,
    recordStudyActivity: recordStudyActivity,
    getWordsForSession: getWordsForSession,
    getStatsForSession: getStatsForSession,
    applyWordReviewForSession: applyWordReviewForSession,
    recordStudentEvent: recordStudentEvent,
    getStudentSummary: getStudentSummary,
    normalizeState: normalizeState,
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
