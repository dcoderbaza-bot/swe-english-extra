/**
 * SWE ENGLISH EXTRA — Main SPA Controller
 */
(function () {
  'use strict';

  const Storage = window.SWEStorage;
  const SRS = window.SWESRS;
  const Speech = window.SWESpeech;
  const DefaultData = window.SWEData;
  const Auth = window.SWEAuth;
  const Exam = window.SWEExam;
  const AiTxt = window.SWEAiTxt;
  const Sync = window.SWESync;

  let state = Storage.loadState();
  let currentSession = Auth.getSession();
  let currentView = 'dashboard';
  let currentStudyMode = 'flashcards';
  let activeDeck = 'ALL';
  let activeLesson = 'ALL';
  let studyScope = 'due'; // 'due' | 'all'
  let currentRole = (currentSession && currentSession.role) || 'guest';
  let loginRoleSelection = 'student';
  let loginAuthMode = 'login';
  let txtPreviewItems = [];
  let selectedMonitorStudentId = null;
  let heartbeatTimerId = null;
  let syncRefreshTimerId = null;
  let examSessionRuntime = {
    activeQueueIds: [],
    currentIndex: 0,
    currentWordId: null,
    isRenderingPrompt: false,
    finishingEmpty: false,
    proctoringBound: false,
    armedAt: 0,
    lastStrikeAt: 0,
    blurTimerId: null,
    lastInputValue: '',
    observer: null,
    handlers: null
  };

  // Flashcards session state
  let fcSession = {
    queue: [],
    index: 0,
    scopeKey: '',
    scopeMode: '',
    isFlipped: false,
    waitingRetryUntil: null,
    waitingWordId: null,
    retryTimerId: null
  };

  // Quiz session state
  let quizSession = {
    items: [],
    index: 0,
    score: 0,
    scopeKey: '',
    answered: false,
    currentOptions: [],
    wrongWords: []
  };

  // Writing session state
  let writeSession = {
    items: [],
    index: 0,
    score: 0,
    scopeKey: '',
    answered: false,
    hintStep: 0,
    wrongWords: []
  };

  // Listening session state
  let listenSession = {
    type: 'quiz', // 'quiz' | 'dictation'
    items: [],
    index: 0,
    score: 0,
    scopeKey: '',
    answered: false,
    currentOptions: [],
    wrongWords: []
  };

  let confirmCallback = null;

  const COLOR_STYLES = {
    indigo: {
      bg: 'bg-indigo-500/15',
      text: 'text-indigo-600 dark:text-indigo-300',
      bar: 'from-indigo-500 to-violet-500',
      border: 'hover:border-indigo-400/50'
    },
    sky: {
      bg: 'bg-sky-500/15',
      text: 'text-sky-600 dark:text-sky-300',
      bar: 'from-sky-500 to-cyan-500',
      border: 'hover:border-sky-400/50'
    },
    amber: {
      bg: 'bg-amber-500/15',
      text: 'text-amber-600 dark:text-amber-300',
      bar: 'from-amber-500 to-orange-500',
      border: 'hover:border-amber-400/50'
    },
    emerald: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-300',
      bar: 'from-emerald-500 to-teal-500',
      border: 'hover:border-emerald-400/50'
    },
    rose: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-600 dark:text-rose-300',
      bar: 'from-rose-500 to-pink-500',
      border: 'hover:border-rose-400/50'
    },
    violet: {
      bg: 'bg-violet-500/15',
      text: 'text-violet-600 dark:text-violet-300',
      bar: 'from-violet-500 to-fuchsia-500',
      border: 'hover:border-violet-400/50'
    }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function formatExampleHtml(sentence, targetWord) {
    const escaped = escapeHtml(sentence);
    if (/\*\*[^*]+\*\*/.test(escaped)) {
      return escaped.replace(
        /\*\*([^*]+)\*\*/g,
        '<strong class="font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-1 rounded">$1</strong>'
      );
    }
    const cleanWord = String(targetWord || '').trim();
    if (!cleanWord) return escaped;
    const regex = new RegExp('(' + escapeRegExp(escapeHtml(cleanWord)) + ')', 'gi');
    return escaped.replace(
      regex,
      '<strong class="font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-1 rounded">$1</strong>'
    );
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function isStaff() {
    return Auth.isAdminRole(currentRole);
  }

  function isStudentSession() {
    return Boolean(currentSession && currentSession.role === 'student' && currentSession.userId);
  }

  function getSessionWords() {
    return Storage.getWordsForSession(state, currentSession, Date.now());
  }

  function getSessionStats() {
    return Storage.getStatsForSession(state, currentSession);
  }

  function formatRelativeTime(ts, now) {
    if (!ts) return 'Hali faollik yo‘q';
    const diffSec = Math.max(0, Math.floor(((now || Date.now()) - ts) / 1000));
    if (diffSec < 15) return 'Hozirgina';
    if (diffSec < 60) return diffSec + ' soniya oldin';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + ' daqiqa oldin';
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return diffHrs + ' soat oldin';
    return new Date(ts).toLocaleDateString();
  }

  function mergeRemoteState(nextRemoteState) {
    if (!nextRemoteState || typeof nextRemoteState !== 'object') return;
    const savedTheme = (state.settings && state.settings.theme) || 'light';
    const savedAccent = (state.settings && state.settings.accent) || 'en-US';
    const prevAuthHashes = (state && state.auth && state.auth.hashes) ? Object.assign({}, state.auth.hashes) : null;
    state = Storage.normalizeState(nextRemoteState, Date.now());
    if (prevAuthHashes && (!nextRemoteState.auth || !nextRemoteState.auth.hashes || Object.keys(nextRemoteState.auth.hashes).length === 0)) {
      state.auth.hashes = Object.assign({}, state.auth.hashes, prevAuthHashes);
    }
    state.settings.theme = savedTheme;
    state.settings.accent = savedAccent;
  }

  function persist(reason) {
    Storage.saveState(state);
    if (Sync && !Sync.isServerMode()) {
      Sync.notifyLocalTabs(reason || 'local');
    }
  }

  function persistCurriculum(auditAction, auditDetail) {
    if (auditAction) {
      recordAudit(auditAction, auditDetail);
    }
    persist('curriculum');
    if (Sync && Sync.isServerMode() && isStaff()) {
      Sync.pushCurriculumRemote({
        words: state.words,
        categories: state.categories,
        lessons: state.lessons,
        auditAction: auditAction || '',
        auditDetail: auditDetail || ''
      }).then(function (res) {
        if (res && res.state) mergeRemoteState(res.state);
      }).catch(function (err) {
        showToast((err && err.message) || 'Serverga saqlashda xatolik.', 'error');
      });
    }
  }

  function emitStudentTelemetry(eventPayload) {
    if (!isStudentSession()) return;
    const now = Date.now();
    state = Storage.recordStudentEvent(state, currentSession, eventPayload, now);
    if (Sync && Sync.isServerMode()) {
      Sync.pushTelemetryRemote(eventPayload).then(function (res) {
        if (res && res.state) mergeRemoteState(res.state);
      }).catch(function () {
        // Ignore transient background telemetry error
      });
    } else {
      persist(eventPayload && eventPayload.type === 'HEARTBEAT' ? 'heartbeat' : 'telemetry');
    }
  }

  function stopHeartbeat() {
    if (heartbeatTimerId) {
      clearInterval(heartbeatTimerId);
      heartbeatTimerId = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (!isStudentSession()) return;
    heartbeatTimerId = setInterval(function () {
      if (!isStudentSession()) {
        stopHeartbeat();
        return;
      }
      emitStudentTelemetry({
        type: 'HEARTBEAT',
        view: currentView,
        mode: currentView === 'study' ? currentStudyMode : '',
        lesson: activeLesson !== 'ALL' ? activeLesson : '',
        deck: activeDeck !== 'ALL' ? activeDeck : ''
      });
    }, 25000);
  }

  function showToast(message, type) {
    const container = $('toastContainer');
    if (!container) return;

    const styles = {
      success: 'bg-emerald-600 text-white border-emerald-400/40',
      error: 'bg-rose-600 text-white border-rose-400/40',
      warning: 'bg-amber-500 text-white border-amber-300/40',
      info: 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700/60'
    };

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto px-4 py-3 rounded-2xl border shadow-xl text-xs sm:text-sm font-bold transition-all duration-300 transform translate-y-2 opacity-0 ' + (styles[type] || styles.info);
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(function () {
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 280);
    }, 3000);
  }

  function hasUsableTtsApi(cfg) {
    const c = cfg || (state && state.aiConfig) || {};
    if (Speech && typeof Speech.resolveEffectiveTtsConfig === 'function') {
      return Boolean(Speech.resolveEffectiveTtsConfig(c, state && state.settings && state.settings.accent).hasKey);
    }
    return false;
  }

  const pendingPrimaryPronounce = new Set();

  function formatWordPronunciation(wordObj) {
    if (!wordObj) return '';
    const us = String(wordObj.phonetic || '').trim();
    const uk = String(wordObj.phoneticUk || '').trim();
    const syl = String(wordObj.syllables || '').trim();
    const note = String(wordObj.pronunciationNote || '').trim();
    const parts = [];
    if (us && uk && uk !== us) {
      parts.push('US ' + us + ' · UK ' + uk);
    } else if (us || uk) {
      parts.push(us || uk);
    }
    if (syl) {
      parts.push(syl);
    }
    if (note) {
      parts.push('[' + note + ']');
    }
    return parts.join(' · ');
  }

  function applyUpdatedWordsToStudySessions() {
    const byId = new Map();
    (state.words || []).forEach(function (w) {
      if (w && w.id) byId.set(w.id, w);
    });

    function refreshList(list) {
      return (Array.isArray(list) ? list : []).map(function (item) {
        const latest = item && item.id ? byId.get(item.id) : null;
        if (!latest) return item;
        return Object.assign({}, item, {
          phonetic: latest.phonetic || item.phonetic || '',
          phoneticUk: latest.phoneticUk || item.phoneticUk || '',
          syllables: latest.syllables || item.syllables || '',
          pronunciationNote: latest.pronunciationNote || item.pronunciationNote || ''
        });
      });
    }

    fcSession.queue = refreshList(fcSession.queue);
    quizSession.items = refreshList(quizSession.items);
    writeSession.items = refreshList(writeSession.items);
    listenSession.items = refreshList(listenSession.items);

    if (currentView !== 'study') return;
    if (currentStudyMode === 'flashcards' && fcSession.queue[fcSession.index]) {
      const fcPron = formatWordPronunciation(fcSession.queue[fcSession.index]);
      if ($('fcPhoneticText')) $('fcPhoneticText').textContent = fcPron;
      if ($('fcBackPhonetic')) $('fcBackPhonetic').textContent = fcPron;
    } else if (currentStudyMode === 'quiz' && quizSession.items[quizSession.index]) {
      if ($('quizPhonetic')) $('quizPhonetic').textContent = formatWordPronunciation(quizSession.items[quizSession.index]);
    }
  }

  function ensurePrimaryAiPronunciation(text, wordId) {
    const clean = String(text || '').trim();
    if (!clean || !hasSavedAiKey(state && state.aiConfig)) return;
    const match = (state.words || []).find(function (w) {
      return (wordId && w.id === wordId) || String(w.word || '').trim().toLowerCase() === clean.toLowerCase();
    });
    if (!match || (AiTxt && AiTxt.hasCompletePronunciation(match))) return;
    const key = String(match.id || clean.toLowerCase());
    if (pendingPrimaryPronounce.has(key)) return;
    pendingPrimaryPronounce.add(key);

    (async function () {
      try {
        if (Sync && Sync.isServerMode()) {
          const res = await Sync.resolvePronunciationRemote({ wordId: match.id, word: match.word });
          if (res && res.state) mergeRemoteState(res.state);
          if (res && res.updatedCount > 0) {
            if (currentView === 'study') applyUpdatedWordsToStudySessions();
            else refreshActiveView();
          }
        } else if (AiTxt && typeof AiTxt.resolvePronunciationWithAI === 'function') {
          const items = await AiTxt.resolvePronunciationWithAI([match], state.aiConfig, {
            existingWords: state.words
          });
          const resolved = items && items[0];
          if (resolved && resolved.phonetic) {
            state.words = (state.words || []).map(function (w) {
              if (w.id !== match.id) return w;
              return Object.assign({}, w, {
                phonetic: w.phonetic || resolved.phonetic,
                phoneticUk: w.phoneticUk || resolved.phoneticUk || '',
                syllables: w.syllables || resolved.syllables || '',
                pronunciationNote: w.pronunciationNote || resolved.pronunciationNote || '',
                updatedAt: Date.now()
              });
            });
            persist('curriculum');
            if (currentView === 'study') applyUpdatedWordsToStudySessions();
            else refreshActiveView();
          }
        }
      } catch (_) {
        // Silent background enrichment — never disrupt audio playback
      } finally {
        pendingPrimaryPronounce.delete(key);
      }
    })();
  }

  function speakText(text, options) {
    const opts = options || {};
    const accent = opts.accent || state.settings.accent || 'en-US';
    const triggerEl = opts.triggerEl || null;
    const canUseServerTts = Boolean(Sync && Sync.isServerMode() && hasUsableTtsApi());

    if (!opts.testConfig && !opts.skipPrimaryPronounce) {
      ensurePrimaryAiPronunciation(text, opts.wordId);
    }

    const ok = Speech.speak(text, {
      accent: accent,
      rate: opts.rate || 0.96,
      useApiTts: opts.testConfig ? true : canUseServerTts,
      bypassCache: Boolean(opts.bypassCache),
      strictApiError: Boolean(opts.strictApiError),
      testConfig: opts.testConfig || null,
      onStart: function (engine) {
        if (triggerEl) triggerEl.classList.add('audio-speaking');
        if (typeof opts.onStart === 'function') opts.onStart(engine);
      },
      onEnd: function () {
        if (triggerEl) triggerEl.classList.remove('audio-speaking');
        if (typeof opts.onEnd === 'function') opts.onEnd();
      },
      onApiSuccess: function (res) {
        if (typeof opts.onApiSuccess === 'function') opts.onApiSuccess(res);
      },
      onUnsupported: function () {
        showToast('Brauzeringiz Web Speech API ovozli talaffuzni qo‘llab-quvvatlamaydi.', 'warning');
      },
      onError: function (err) {
        if (opts.strictApiError) {
          showToast((err && err.message) || 'Talaffuz API xatoligi.', 'error');
        } else {
          showToast('Ovozni ijro etishda xatolik yuz berdi.', 'warning');
        }
      }
    });

    if (!ok && triggerEl) {
      triggerEl.classList.remove('audio-speaking');
    }
  }

  /* ==================== THEME & ACCENT ==================== */

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    if ($('themeIconLight')) $('themeIconLight').classList.toggle('hidden', isDark);
    if ($('themeIconDark')) $('themeIconDark').classList.toggle('hidden', !isDark);
    if ($('loginThemeIconLight')) $('loginThemeIconLight').classList.toggle('hidden', isDark);
    if ($('loginThemeIconDark')) $('loginThemeIconDark').classList.toggle('hidden', !isDark);
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    persist();
  }

  function applyAccentUI() {
    const accent = state.settings.accent || 'en-US';
    const usBtn = $('accentUsBtn');
    const ukBtn = $('accentUkBtn');
    const activeCls = 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm';
    const idleCls = 'text-slate-500 dark:text-slate-400';

    usBtn.className = 'accent-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-all ' + (accent === 'en-US' ? activeCls : idleCls);
    ukBtn.className = 'accent-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-all ' + (accent === 'en-GB' ? activeCls : idleCls);
  }

  function setAccent(accent) {
    state.settings.accent = accent === 'en-GB' ? 'en-GB' : 'en-US';
    applyAccentUI();
    persist();
    showToast('Talaffuz aksenti: ' + (state.settings.accent === 'en-GB' ? 'UK (Britaniya)' : 'US (Amerika)'), 'info');
  }

  /* ==================== NAVIGATION ==================== */

  function switchView(viewName, options) {
    const opts = options || {};
    if (!currentSession) {
      applyAuthGateUI();
      return;
    }

    if (isExamActivelyProctored() && viewName !== 'study') {
      recordExamViolation('Yopiq test paytida boshqa bo‘limga o‘tishga urinish (' + viewName + ')');
      showToast('Yopiq test paytida boshqa bo‘limga o‘tish taqiqlanadi!', 'warning');
      return;
    }

    const staffViews = ['monitor', 'txt-import', 'students'];
    if (staffViews.indexOf(viewName) !== -1 && !isStaff()) {
      showToast('Bu bo‘lim faqat Teacher va IT Manager uchun!', 'warning');
      viewName = 'dashboard';
    }
    if (viewName === 'security' && !Auth.canManageSecurity(currentRole)) {
      showToast('Xavfsizlik bo‘limi faqat IT Manager uchun!', 'warning');
      viewName = isStaff() ? 'monitor' : 'dashboard';
    }

    if (Speech && typeof Speech.stop === 'function' && currentView !== viewName) {
      Speech.stop();
    }

    currentView = viewName;
    ['monitor', 'dashboard', 'study', 'vocabulary', 'txt-import', 'students', 'security'].forEach(function (v) {
      const el = $('view-' + v);
      if (el) el.classList.toggle('hidden', v !== viewName);
    });

    document.querySelectorAll('[data-nav-view]').forEach(function (btn) {
      const isActive = btn.getAttribute('data-nav-view') === viewName;
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('text-slate-600', !isActive);
      btn.classList.toggle('dark:text-slate-300', !isActive);
    });

    if (isStudentSession()) {
      const viewLabels = {
        dashboard: 'Bosh sahifaga kirdi',
        study: 'Mashq bo‘limiga o‘tdi',
        vocabulary: 'Lug‘at ro‘yxatini ochdi'
      };
      emitStudentTelemetry({
        type: 'VIEW_CHANGE',
        view: viewName,
        mode: viewName === 'study' ? currentStudyMode : '',
        lesson: activeLesson !== 'ALL' ? activeLesson : '',
        deck: activeDeck !== 'ALL' ? activeDeck : '',
        detail: viewLabels[viewName] || ('Bo‘lim: ' + viewName)
      });
    }

    if (viewName === 'monitor') {
      renderMonitorView();
    } else if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'study') {
      syncDeckSelects();
      setStudyMode(currentStudyMode, { preserveIfActive: !opts.restartStudy });
    } else if (viewName === 'vocabulary') {
      syncDeckSelects();
      renderVocabulary();
    } else if (viewName === 'txt-import') {
      syncDeckSelects();
      renderTxtAiStatus();
      renderAiConfigForm();
    } else if (viewName === 'students') {
      renderAdminStudentsList();
    } else if (viewName === 'security') {
      renderSecurityTab();
    }
    refreshIcons();
  }

  /* ==================== DASHBOARD RENDERING ==================== */

  function renderDashboard() {
    const now = Date.now();
    const words = getSessionWords();
    const stats = getSessionStats();
    const total = words.length;
    const mastered = words.filter(function (w) { return w.mastered || w.status === 'mastered'; }).length;
    const newWords = words.filter(function (w) { return w.status === 'new' && !w.lastReviewedAt; }).length;
    const learning = words.filter(function (w) { return w.status === 'learning'; }).length;
    const review = words.filter(function (w) { return w.status === 'review'; }).length;
    const dueCount = SRS.getDueCards(words, now).length;
    const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    const streak = Storage.getActiveStreak(stats, now);
    const todayReviewed = Storage.getTodayReviewedCount(stats, now);
    const dailyGoal = Number(stats.dailyGoal) || 10;
    const goalPct = Math.min(100, Math.round((todayReviewed / dailyGoal) * 100));

    $('statTotalWords').textContent = String(total);
    $('statNewCount').textContent = newWords + ' ta yangi so‘z';
    $('statMasteredWords').textContent = String(mastered);
    $('statMasteredPct').textContent = masteryPct + '% to‘liq yodlangan';
    $('statDueWords').textContent = String(dueCount);
    $('statDueStatus').textContent = dueCount > 0 ? 'Takrorlash tayyor' : 'Bugungi reja bajarildi!';
    $('statStreakDays').textContent = String(streak);
    $('statLongestStreak').textContent = 'Rekord: ' + (Number(stats.longestStreak) || 0) + ' kun';

    $('dashHeroDueText').textContent = dueCount > 0
      ? 'Bugun takrorlash uchun ' + dueCount + ' ta so‘z sizni kutmoqda. Qisqa mashg‘ulotni hozir boshlang!'
      : 'Ajoyib! Bugungi barcha takrorlanadigan so‘zlar yakunlangan. Yangi so‘z qo‘shishingiz yoki test ishlashingiz mumkin.';

    $('dashDailyGoalText').textContent = todayReviewed + ' / ' + dailyGoal;
    $('dashDailyGoalBar').style.width = goalPct + '%';

    $('overallMasteryPercent').textContent = masteryPct + '%';
    $('overallMasteryBar').style.width = masteryPct + '%';
    $('breakdownNew').textContent = String(newWords);
    $('breakdownLearning').textContent = String(learning);
    $('breakdownReview').textContent = String(review);
    $('breakdownMastered').textContent = String(mastered);

    renderLessonsGrid(now, words);
    renderDecksGrid(now, words);
    refreshIcons();
  }

  function renderLessonsGrid(now, sessionWords) {
    const grid = $('lessonsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const allWords = Array.isArray(sessionWords) ? sessionWords : getSessionWords();
    const lessons = Array.isArray(state.lessons) ? state.lessons : [];
    const items = [{ id: 'ALL', name: 'Barcha darsliklar', description: 'Barcha darslardan umumiy lug‘at', isVirtualAll: true }].concat(lessons);

    items.forEach(function (lesson, idx) {
      const wordsInLesson = lesson.isVirtualAll
        ? allWords
        : allWords.filter(function (w) { return w.lesson === lesson.name; });

      const totalCount = wordsInLesson.length;
      const dueCount = SRS.getDueCards(wordsInLesson, now).length;
      const masteredCount = wordsInLesson.filter(function (w) { return w.mastered || w.status === 'mastered'; }).length;
      const pct = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'glass-panel rounded-3xl p-5 flex flex-col justify-between gap-3.5 transition-all cursor-pointer border hover:border-emerald-400/50';
      card.addEventListener('click', function () {
        activeLesson = lesson.isVirtualAll ? 'ALL' : lesson.name;
        activeDeck = 'ALL';
        studyScope = dueCount > 0 ? 'due' : 'all';
        currentStudyMode = 'flashcards';
        switchView('study', { restartStudy: true });
      });

      card.innerHTML =
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<div class="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 font-extrabold text-sm">' +
              (lesson.isVirtualAll ? '<i data-lucide="book-copy" class="w-5 h-5"></i>' : String(idx)) +
            '</div>' +
            '<div class="min-w-0">' +
              '<h3 class="font-extrabold text-sm sm:text-base truncate">' + escapeHtml(lesson.name) + '</h3>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + escapeHtml(lesson.description || (totalCount + ' ta so‘z')) + '</p>' +
            '</div>' +
          '</div>' +
          '<span class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold ' + (dueCount > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300') + '">' +
            (dueCount > 0 ? (dueCount + ' due') : (totalCount + ' so‘z')) +
          '</span>' +
        '</div>' +
        '<div class="space-y-1">' +
          '<div class="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">' +
            '<span>' + totalCount + ' ta so‘z</span>' +
            '<span>' + pct + '% (' + masteredCount + '/' + totalCount + ')</span>' +
          '</div>' +
          '<div class="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">' +
            '<div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style="width: ' + pct + '%"></div>' +
          '</div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  function renderDecksGrid(now, sessionWords) {
    const grid = $('decksGrid');
    grid.innerHTML = '';

    const allCards = Array.isArray(sessionWords) ? sessionWords : getSessionWords();
    const allDeck = {
      id: 'ALL',
      name: 'Barcha so‘zlar',
      icon: 'layers',
      color: 'indigo',
      builtIn: true,
      isVirtualAll: true
    };

    const deckItems = [allDeck].concat(state.categories);

    deckItems.forEach(function (deck) {
      const wordsInDeck = deck.isVirtualAll
        ? allCards
        : allCards.filter(function (w) { return w.category === deck.name; });

      const totalCount = wordsInDeck.length;
      const dueCount = SRS.getDueCards(wordsInDeck, now).length;
      const masteredCount = wordsInDeck.filter(function (w) { return w.mastered || w.status === 'mastered'; }).length;
      const pct = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
      const palette = COLOR_STYLES[deck.color] || COLOR_STYLES.indigo;

      const card = document.createElement('div');
      card.className = 'glass-panel interactive-card rounded-3xl p-5 flex flex-col justify-between gap-4 cursor-pointer border ' + palette.border;
      card.addEventListener('click', function () {
        activeDeck = deck.isVirtualAll ? 'ALL' : deck.name;
        activeLesson = 'ALL';
        studyScope = dueCount > 0 ? 'due' : 'all';
        currentStudyMode = 'flashcards';
        switchView('study', { restartStudy: true });
      });

      card.innerHTML =
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<div class="w-11 h-11 rounded-2xl ' + palette.bg + ' ' + palette.text + ' flex items-center justify-center shrink-0">' +
              '<i data-lucide="' + escapeHtml(deck.icon || 'folder') + '" class="w-5 h-5"></i>' +
            '</div>' +
            '<div class="min-w-0">' +
              '<h3 class="font-extrabold text-base truncate">' + escapeHtml(deck.name) + '</h3>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 font-semibold">' + totalCount + ' ta so‘z</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5">' +
            (dueCount > 0
              ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300">' + dueCount + ' due</span>'
              : '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Tayyor</span>') +
          '</div>' +
        '</div>' +
        '<div class="space-y-1.5">' +
          '<div class="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">' +
            '<span>O‘zlashtirish</span>' +
            '<span class="tabular-nums">' + pct + '% (' + masteredCount + '/' + totalCount + ')</span>' +
          '</div>' +
          '<div class="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">' +
            '<div class="h-full rounded-full bg-gradient-to-r ' + palette.bar + ' transition-all duration-500" style="width: ' + pct + '%"></div>' +
          '</div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  /* ==================== STUDY CONTROLS & DECK SYNC ==================== */

  function normalizeFilterValue(val) {
    return String(val || '').trim().toLowerCase();
  }

  function getStudyScopeKey() {
    return normalizeFilterValue(activeLesson) + '|' + normalizeFilterValue(activeDeck);
  }

  function getFilteredStudyWords() {
    const targetDeck = normalizeFilterValue(activeDeck);
    const targetLesson = normalizeFilterValue(activeLesson);
    return getSessionWords().filter(function (w) {
      if (!w || !String(w.word || '').trim()) return false;
      if (activeDeck !== 'ALL' && normalizeFilterValue(w.category) !== targetDeck) return false;
      if (activeLesson !== 'ALL' && normalizeFilterValue(w.lesson) !== targetLesson) return false;
      return true;
    });
  }

  function syncDeckSelects() {
    const studySel = $('studyDeckSelect');
    const studyLessonSel = $('studyLessonSelect');
    const vocabCatFilter = $('vocabCategoryFilter');
    const vocabLessonFilter = $('vocabLessonFilter');
    const txtLessonSel = $('txtTargetLessonSelect');
    const txtCatSel = $('txtTargetCategorySelect');

    if (activeDeck !== 'ALL' && !(state.categories || []).some(function (c) { return c.name === activeDeck; })) {
      activeDeck = 'ALL';
    }
    if (activeLesson !== 'ALL' && !(state.lessons || []).some(function (l) { return l.name === activeLesson; })) {
      activeLesson = 'ALL';
    }

    if (studySel) {
      studySel.innerHTML = '<option value="ALL">Barcha kategoriyalar</option>';
      state.categories.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        studySel.appendChild(opt);
      });
      studySel.value = activeDeck;
    }

    if (studyLessonSel) {
      studyLessonSel.innerHTML = '<option value="ALL">Barcha darsliklar</option>';
      (state.lessons || []).forEach(function (l) {
        const opt = document.createElement('option');
        opt.value = l.name;
        opt.textContent = l.name;
        studyLessonSel.appendChild(opt);
      });
      studyLessonSel.value = activeLesson;
    }

    if (vocabCatFilter) {
      const prev = vocabCatFilter.value || 'ALL';
      vocabCatFilter.innerHTML = '<option value="ALL">Barcha kategoriyalar</option>';
      state.categories.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        vocabCatFilter.appendChild(opt);
      });
      vocabCatFilter.value = (prev === 'ALL' || state.categories.some(function (c) { return c.name === prev; })) ? prev : 'ALL';
    }

    if (vocabLessonFilter) {
      const prevL = vocabLessonFilter.value || 'ALL';
      vocabLessonFilter.innerHTML = '<option value="ALL">Barcha darsliklar</option>';
      (state.lessons || []).forEach(function (l) {
        const opt = document.createElement('option');
        opt.value = l.name;
        opt.textContent = l.name;
        vocabLessonFilter.appendChild(opt);
      });
      vocabLessonFilter.value = (prevL === 'ALL' || (state.lessons || []).some(function (l) { return l.name === prevL; })) ? prevL : 'ALL';
    }

    if (txtLessonSel) {
      const prevTxtL = txtLessonSel.value || 'AUTO';
      txtLessonSel.innerHTML = '<option value="AUTO">Avtomatik (# / dars sarlavhasidan)</option><option value="__CUSTOM__">+ Yangi darslik nomi kiritish</option>';
      (state.lessons || []).forEach(function (l) {
        const opt = document.createElement('option');
        opt.value = l.name;
        opt.textContent = l.name;
        txtLessonSel.appendChild(opt);
      });
      txtLessonSel.value = prevTxtL;
    }

    if (txtCatSel) {
      const prevTxtC = txtCatSel.value || 'AUTO';
      txtCatSel.innerHTML = '<option value="AUTO">AI avtomatik aniqlasin</option>';
      state.categories.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        txtCatSel.appendChild(opt);
      });
      txtCatSel.value = prevTxtC;
    }
  }

  function hasActiveUnfinishedSession(mode) {
    const scopeKey = getStudyScopeKey();
    if (mode === 'flashcards') {
      return fcSession.queue.length > 0 && fcSession.scopeKey === scopeKey && fcSession.scopeMode === studyScope;
    }
    if (mode === 'quiz') {
      return quizSession.items.length > 0 && quizSession.index < quizSession.items.length && quizSession.scopeKey === scopeKey;
    }
    if (mode === 'writing') {
      return writeSession.items.length > 0 && writeSession.index < writeSession.items.length && writeSession.scopeKey === scopeKey;
    }
    if (mode === 'listening') {
      return listenSession.items.length > 0 && listenSession.index < listenSession.items.length && listenSession.scopeKey === scopeKey;
    }
    return false;
  }

  function resumeCurrentStudyMode() {
    applyStudyScopeUI();
    if (currentStudyMode === 'flashcards') {
      renderFlashcard();
    } else if (currentStudyMode === 'quiz') {
      $('quizSummaryBox').classList.add('hidden');
      $('quizCardBox').classList.remove('hidden');
      if (!quizSession.answered) renderQuizQuestion();
    } else if (currentStudyMode === 'writing') {
      $('writeSummaryBox').classList.add('hidden');
      $('writeCardBox').classList.remove('hidden');
      if (!writeSession.answered) renderWritingQuestion();
    } else if (currentStudyMode === 'listening') {
      $('listenSummaryBox').classList.add('hidden');
      $('listenCardBox').classList.remove('hidden');
      if (!listenSession.answered) renderListeningQuestion(false);
    } else if (currentStudyMode === 'exam') {
      initExamSession();
    }
  }

  function setStudyMode(mode, options) {
    const opts = options || {};
    if (isExamActivelyProctored() && mode !== 'exam') {
      recordExamViolation('Yopiq test paytida yordamchi mashq rejimiga o‘tish urinish (' + mode + ')');
      showToast('Yopiq test tugamaguncha Flashcard/Test rejimlariga o‘tish mumkin emas!', 'warning');
      return;
    }

    const modeChanged = currentStudyMode !== mode;
    if (modeChanged && Speech && typeof Speech.stop === 'function') {
      Speech.stop();
    }
    if (mode !== 'flashcards') {
      clearRetryTimer();
    }

    currentStudyMode = mode;

    document.querySelectorAll('.study-mode-tab').forEach(function (btn) {
      const active = btn.getAttribute('data-study-mode') === mode;
      const isExamBtn = btn.getAttribute('data-study-mode') === 'exam';
      btn.className = 'study-mode-tab ' + (isExamBtn ? 'col-span-2 sm:col-span-1 ' : '') +
        'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ' +
        (active
          ? (isExamBtn ? 'bg-rose-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm')
          : (isExamBtn ? 'text-rose-600 dark:text-rose-300 hover:bg-rose-500/10' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'));
    });

    ['flashcards', 'quiz', 'writing', 'listening', 'exam'].forEach(function (m) {
      const el = $('mode-' + m);
      if (el) el.classList.toggle('hidden', m !== mode);
    });

    $('studyScopeToggle').classList.toggle('hidden', mode !== 'flashcards');

    if (isStudentSession()) {
      emitStudentTelemetry({
        type: 'MODE_CHANGE',
        view: 'study',
        mode: mode,
        lesson: activeLesson !== 'ALL' ? activeLesson : '',
        deck: activeDeck !== 'ALL' ? activeDeck : '',
        detail: 'Mashq rejimiga o‘tdi: ' + mode
      });
    }

    if (opts.preserveIfActive && hasActiveUnfinishedSession(mode)) {
      resumeCurrentStudyMode();
    } else {
      startCurrentStudyMode();
    }
    refreshIcons();
  }

  function applyStudyScopeUI() {
    document.querySelectorAll('.scope-btn').forEach(function (btn) {
      const active = btn.getAttribute('data-study-scope') === studyScope;
      btn.className = 'scope-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ' +
        (active
          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
          : 'text-slate-600 dark:text-slate-300');
    });
  }

  function startCurrentStudyMode() {
    applyStudyScopeUI();
    if (Speech && typeof Speech.stop === 'function') {
      Speech.stop();
    }
    if (currentStudyMode === 'flashcards') {
      initFlashcardsSession();
    } else if (currentStudyMode === 'quiz') {
      initQuizSession();
    } else if (currentStudyMode === 'writing') {
      initWritingSession();
    } else if (currentStudyMode === 'listening') {
      initListeningSession();
    } else if (currentStudyMode === 'exam') {
      initExamSession();
    }
  }

  /* ==================== MODE A: 3D FLASHCARDS ==================== */

  function clearRetryTimer() {
    if (fcSession.retryTimerId) {
      clearTimeout(fcSession.retryTimerId);
      fcSession.retryTimerId = null;
    }
  }

  function initFlashcardsSession() {
    clearRetryTimer();
    const now = Date.now();
    const pool = getFilteredStudyWords();
    const filtered = studyScope === 'due'
      ? SRS.getDueCards(pool, now)
      : pool;

    fcSession.queue = SRS.sortStudyQueue(filtered, now);
    fcSession.index = 0;
    fcSession.scopeKey = getStudyScopeKey();
    fcSession.scopeMode = studyScope;
    fcSession.isFlipped = false;
    fcSession.waitingRetryUntil = null;
    fcSession.waitingWordId = null;

    renderFlashcard();
  }

  function renderFlashcard() {
    const activeWrap = $('fcActiveWrap');
    const emptyState = $('fcEmptyState');

    if (fcSession.queue.length === 0) {
      activeWrap.classList.add('hidden');
      emptyState.classList.remove('hidden');

      const totalInDeck = getFilteredStudyWords().length;
      if (totalInDeck === 0) {
        $('fcEmptyTitle').textContent = 'Tanlangan to‘plamda hali so‘z yo‘q';
        $('fcEmptyDesc').textContent = 'Boshqa darslik/kategoriyani tanlang yoki yangi so‘z qo‘shing.';
        $('fcPracticeAllBtn').classList.add('hidden');
      } else if (fcSession.waitingWordId && fcSession.waitingRetryUntil && fcSession.waitingRetryUntil > Date.now()) {
        const secs = Math.max(1, Math.ceil((fcSession.waitingRetryUntil - Date.now()) / 1000));
        $('fcEmptyTitle').textContent = '1 daqiqalik takrorlash kutilyapti';
        $('fcEmptyDesc').textContent = '"Bilmadim" deb belgilangan so‘z taxminan ' + secs + ' soniyadan keyin avtomatik chiqadi yoki hoziroq qayta boshlashingiz mumkin.';
        $('fcPracticeAllBtn').textContent = 'Darhol qayta ko‘rish';
        $('fcPracticeAllBtn').classList.remove('hidden');
      } else {
        $('fcEmptyTitle').textContent = 'Ajoyib! Bugungi takrorlash yakunlandi';
        $('fcEmptyDesc').textContent = 'Ushbu darslikda hozircha takrorlanishi kerak bo‘lgan so‘z qolmadi.';
        $('fcPracticeAllBtn').textContent = 'Barcha so‘zlarni mashq qilish';
        $('fcPracticeAllBtn').classList.remove('hidden');
      }
      refreshIcons();
      return;
    }

    activeWrap.classList.remove('hidden');
    emptyState.classList.add('hidden');

    if (fcSession.index >= fcSession.queue.length) {
      fcSession.index = 0;
    }
    if (fcSession.index < 0) {
      fcSession.index = fcSession.queue.length - 1;
    }

    const card = fcSession.queue[fcSession.index];
    const total = fcSession.queue.length;
    const dueCount = SRS.getDueCards(getFilteredStudyWords(), Date.now()).length;

    document.querySelectorAll('.flashcard-face').forEach(function (face) {
      face.scrollTop = 0;
    });

    $('fcCounter').textContent = 'Karta ' + (fcSession.index + 1) + ' / ' + total;
    $('fcDueBadge').textContent = dueCount > 0
      ? (dueCount + ' ta due')
      : (studyScope === 'due' ? (total + ' ta qayta takror') : 'Mashq rejimi');
    $('fcProgressBar').style.width = Math.round(((fcSession.index + 1) / total) * 100) + '%';

    // Front face
    const lessonEl = $('fcLessonBadge');
    if (lessonEl) lessonEl.textContent = card.lesson || 'Umumiy';
    $('fcCategoryBadge').textContent = card.category;
    $('fcLevelBadge').textContent = card.level;
    const statusMeta = SRS.getStatusMeta(card);
    const statusEl = $('fcStatusBadge');
    statusEl.textContent = statusMeta.label;
    statusEl.className = 'px-2.5 py-1 rounded-full text-xs font-bold border ' + statusMeta.badgeClass;

    $('fcPosText').textContent = card.partOfSpeech || 'word';
    $('fcWordText').textContent = card.word;
    const fcPron = formatWordPronunciation(card);
    $('fcPhoneticText').textContent = fcPron;

    // Back face
    $('fcBackWord').textContent = card.word;
    $('fcBackPhonetic').textContent = fcPron;
    $('fcTranslation').textContent = card.translation;
    $('fcDefinition').textContent = card.definition || 'Izoh kiritilmagan.';

    // Examples (up to 2, bolded target word + mini audio button)
    const exList = $('fcExamplesList');
    exList.innerHTML = '';
    const examples = Array.isArray(card.examples) && card.examples.length ? card.examples.slice(0, 2) : [];
    if (examples.length === 0) {
      const li = document.createElement('li');
      li.className = 'text-xs text-slate-400 italic';
      li.textContent = 'Misol gap qo‘shilmagan.';
      exList.appendChild(li);
    } else {
      examples.forEach(function (ex, idx) {
        const li = document.createElement('li');
        li.className = 'flex items-start justify-between gap-2.5 p-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50';
        const cleanSpeech = ex.replace(/\*\*/g, '');
        li.innerHTML =
          '<span class="leading-relaxed"><span class="font-bold text-indigo-500 mr-1.5">' + (idx + 1) + '.</span>' + formatExampleHtml(ex, card.word) + '</span>' +
          '<button type="button" class="shrink-0 p-1.5 rounded-lg hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" title="Gapni eshitish"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i></button>';
        li.querySelector('button').addEventListener('click', function (e) {
          e.stopPropagation();
          speakText(cleanSpeech, { triggerEl: e.currentTarget });
        });
        exList.appendChild(li);
      });
    }

    // Synonyms & Antonyms
    renderWordChipList($('fcSynonymsWrap'), card.synonyms, 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300');
    renderWordChipList($('fcAntonymsWrap'), card.antonyms, 'bg-rose-500/12 text-rose-700 dark:text-rose-300');

    // Mnemonic
    if (card.mnemonic) {
      $('fcMnemonicBox').classList.remove('hidden');
      $('fcMnemonicText').textContent = card.mnemonic;
    } else {
      $('fcMnemonicBox').classList.add('hidden');
    }

    // Flip state & SRS Rating visibility
    $('fcCardInner').classList.toggle('is-flipped', fcSession.isFlipped);
    $('fcSrsBar').classList.toggle('hidden', !fcSession.isFlipped);

    refreshIcons();
  }

  function renderWordChipList(container, items, chipClass) {
    container.innerHTML = '';
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.length === 0) {
      const span = document.createElement('span');
      span.className = 'text-xs text-slate-400';
      span.textContent = '—';
      container.appendChild(span);
      return;
    }
    list.forEach(function (item) {
      const chip = document.createElement('span');
      chip.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold ' + chipClass;
      chip.textContent = item;
      container.appendChild(chip);
    });
  }

  function toggleFlashcardFlip(forceState) {
    if (fcSession.queue.length === 0) return;
    fcSession.isFlipped = typeof forceState === 'boolean' ? forceState : !fcSession.isFlipped;
    $('fcCardInner').classList.toggle('is-flipped', fcSession.isFlipped);
    $('fcSrsBar').classList.toggle('hidden', !fcSession.isFlipped);

    if (fcSession.isFlipped && isStudentSession()) {
      const card = fcSession.queue[fcSession.index];
      if (card) {
        emitStudentTelemetry({
          type: 'FLASHCARD_FLIP',
          view: 'study',
          mode: 'flashcards',
          lesson: card.lesson || '',
          word: card.word,
          detail: '"' + card.word + '" kartochkasining tarjimasini ochdi'
        });
      }
    }
  }

  function moveFlashcard(delta) {
    if (fcSession.queue.length === 0) return;
    fcSession.index = (fcSession.index + delta + fcSession.queue.length) % fcSession.queue.length;
    fcSession.isFlipped = false;
    renderFlashcard();
  }

  function rateCurrentFlashcard(ratingKey) {
    if (fcSession.queue.length === 0 || !fcSession.isFlipped) return;
    const currentCard = fcSession.queue[fcSession.index];
    if (!currentCard) return;
    const now = Date.now();
    const reviewRes = Storage.applyWordReviewForSession(state, currentSession, currentCard.id, ratingKey, SRS, now);
    state = reviewRes.state;
    const updatedCard = reviewRes.updatedCard || currentCard;

    if (Sync && Sync.isServerMode() && currentSession) {
      Storage.saveState(state);
      Sync.pushReviewRemote(currentCard.id, ratingKey).then(function (res) {
        if (res && res.state) mergeRemoteState(res.state);
      }).catch(function () {
        // Keep local optimistic update
      });
    } else {
      persist('review');
    }

    const rule = SRS.RATINGS[ratingKey];
    showToast(updatedCard.word + ' → ' + rule.labelUz + ' (' + rule.hintUz + ')', ratingKey === 'again' ? 'warning' : 'success');

    fcSession.isFlipped = false;

    if (studyScope === 'due') {
      fcSession.queue.splice(fcSession.index, 1);
      if (ratingKey === 'again') {
        if (fcSession.queue.length > 0) {
          // Re-queue inside current session after remaining cards
          fcSession.queue.push(updatedCard);
        } else {
          // Only card left in due queue: wait 1 min or allow instant retry
          fcSession.waitingRetryUntil = now + SRS.MINUTE_MS;
          fcSession.waitingWordId = updatedCard.id;
          clearRetryTimer();
          fcSession.retryTimerId = setTimeout(function () {
            if (currentView === 'study' && currentStudyMode === 'flashcards') {
              initFlashcardsSession();
              showToast('1 daqiqa tugadi! So‘z qayta chiqdi.', 'info');
            }
          }, SRS.MINUTE_MS + 150);
        }
      }
      if (fcSession.index >= fcSession.queue.length) {
        fcSession.index = 0;
      }
    } else {
      fcSession.queue[fcSession.index] = updatedCard;
      fcSession.index = (fcSession.index + 1) % fcSession.queue.length;
    }

    renderFlashcard();
  }

  /* ==================== MODE B: MULTIPLE CHOICE (TEST) ==================== */

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function buildQuizOptions(targetWord) {
    const primaryPool = shuffleArray(getFilteredStudyWords());
    const fallbackPool = shuffleArray(getSessionWords());
    return shuffleArray(SRS.selectQuizDistractors(targetWord, primaryPool, fallbackPool, 4));
  }

  function renderWrongWordsSummary(container, wrongWords) {
    if (!container) return;
    container.innerHTML = '';
    const list = Array.isArray(wrongWords) ? wrongWords : [];
    if (list.length === 0) return;

    const title = document.createElement('p');
    title.className = 'text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-300 mb-2';
    title.textContent = 'Qayta ko‘rib chiqish kerak bo‘lgan so‘zlar:';
    container.appendChild(title);

    list.forEach(function (w) {
      const row = document.createElement('div');
      row.className = 'p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 flex items-center justify-between gap-2 text-xs sm:text-sm';
      row.innerHTML = '<span class="font-extrabold">' + escapeHtml(w.word) + '</span><span class="text-slate-600 dark:text-slate-300 text-right">' + escapeHtml(w.translation) + '</span>';
      container.appendChild(row);
    });
  }

  function initQuizSession() {
    const pool = shuffleArray(getFilteredStudyWords().filter(function (w) {
      return Boolean(w.word && w.word.trim() && w.translation && w.translation.trim());
    }));
    quizSession.items = pool.slice(0, Math.min(10, pool.length));
    quizSession.index = 0;
    quizSession.score = 0;
    quizSession.scopeKey = getStudyScopeKey();
    quizSession.answered = false;
    quizSession.currentOptions = [];
    quizSession.wrongWords = [];

    $('quizSummaryBox').classList.add('hidden');
    $('quizCardBox').classList.remove('hidden');

    if (quizSession.items.length === 0) {
      $('quizProgressText').textContent = 'Savol 0 / 0';
      $('quizScoreText').textContent = 'To‘g‘ri: 0';
      $('quizProgressBar').style.width = '0%';
      $('quizCardBox').classList.add('hidden');
      $('quizSummaryBox').classList.remove('hidden');
      if ($('quizSummaryTitle')) $('quizSummaryTitle').textContent = 'Test uchun so‘z topilmadi';
      $('quizSummaryStats').textContent = 'Tanlangan darslik yoki kategoriyada tarjimali so‘z topilmadi.';
      $('quizWrongList').innerHTML = '';
      refreshIcons();
      return;
    }
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const total = quizSession.items.length;
    if (quizSession.index >= total) {
      showQuizSummary();
      return;
    }

    const q = quizSession.items[quizSession.index];
    quizSession.answered = false;
    quizSession.currentOptions = buildQuizOptions(q);

    $('quizProgressText').textContent = 'Savol ' + (quizSession.index + 1) + ' / ' + total;
    $('quizScoreText').textContent = 'To‘g‘ri: ' + quizSession.score;
    $('quizProgressBar').style.width = Math.round(((quizSession.index + 1) / total) * 100) + '%';

    $('quizCategoryBadge').textContent = q.category;
    $('quizLevelBadge').textContent = q.level;
    $('quizPos').textContent = q.partOfSpeech || '';
    $('quizWord').textContent = q.word;
    $('quizPhonetic').textContent = formatWordPronunciation(q);

    const grid = $('quizOptionsGrid');
    grid.innerHTML = '';
    quizSession.currentOptions.forEach(function (opt, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-quiz-idx', String(idx));
      btn.className = 'btn-tactile w-full p-4 rounded-2xl glass-panel border border-slate-200/80 dark:border-slate-700/80 text-left flex items-center justify-between gap-3 hover:border-indigo-400/70 transition-all';
      btn.innerHTML =
        '<div class="flex items-center gap-3 min-w-0">' +
          '<kbd class="kbd-badge shrink-0">' + (idx + 1) + '</kbd>' +
          '<span class="font-bold text-sm sm:text-base">' + escapeHtml(opt.translation) + '</span>' +
        '</div>' +
        '<span class="quiz-mark text-sm font-extrabold"></span>';
      btn.addEventListener('click', function () {
        selectQuizOption(idx);
      });
      grid.appendChild(btn);
    });

    $('quizFeedbackBox').classList.add('hidden');
    $('quizNextBtn').classList.add('hidden');
    $('quizNextBtn').classList.remove('inline-flex');
  }

  function selectQuizOption(idx) {
    if (quizSession.answered || quizSession.index >= quizSession.items.length || !quizSession.currentOptions || !quizSession.currentOptions[idx]) return;
    quizSession.answered = true;

    const target = quizSession.items[quizSession.index];
    const selected = quizSession.currentOptions[idx];
    const isCorrect = selected.id === target.id;

    if (isCorrect) {
      quizSession.score++;
    } else {
      quizSession.wrongWords.push(target);
    }

    if (isStudentSession()) {
      emitStudentTelemetry({
        type: 'QUIZ_ANSWER',
        view: 'study',
        mode: 'quiz',
        lesson: target.lesson || '',
        deck: activeDeck !== 'ALL' ? activeDeck : '',
        word: target.word,
        isCorrect: isCorrect,
        quizCorrectDelta: isCorrect ? 1 : 0,
        quizTotalDelta: 1,
        countAsStudyActivity: true,
        detail: 'Test: "' + target.word + '" — ' + (isCorrect ? 'to‘g‘ri javob' : 'noto‘g‘ri javob')
      });
    } else {
      state = Storage.recordStudyActivity(state, Date.now());
      persist('study');
    }

    $('quizScoreText').textContent = 'To‘g‘ri: ' + quizSession.score;

    const buttons = $('quizOptionsGrid').querySelectorAll('button');
    buttons.forEach(function (btn, i) {
      btn.disabled = true;
      const opt = quizSession.currentOptions[i];
      const mark = btn.querySelector('.quiz-mark');
      if (opt.id === target.id) {
        btn.classList.add('border-emerald-500', 'bg-emerald-500/15', 'text-emerald-800', 'dark:text-emerald-200');
        mark.textContent = '✓';
      } else if (i === idx && !isCorrect) {
        btn.classList.add('border-rose-500', 'bg-rose-500/15', 'text-rose-800', 'dark:text-rose-200');
        mark.textContent = '✕';
      }
    });

    const fb = $('quizFeedbackBox');
    fb.className = 'p-4 rounded-2xl border text-sm space-y-1.5 ' +
      (isCorrect
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200');
    const ex = target.examples && target.examples[0] ? formatExampleHtml(target.examples[0], target.word) : escapeHtml(target.definition);
    fb.innerHTML =
      '<p class="font-extrabold">' + (isCorrect ? 'To‘g‘ri javob!' : 'Noto‘g‘ri. To‘g‘ri tarjima: ' + escapeHtml(target.translation)) + '</p>' +
      (ex ? '<p class="text-xs opacity-90">' + ex + '</p>' : '');
    fb.classList.remove('hidden');

    const nextBtn = $('quizNextBtn');
    nextBtn.classList.remove('hidden');
    nextBtn.classList.add('inline-flex');
  }

  function showQuizSummary() {
    quizSession.answered = false;
    quizSession.currentOptions = [];
    $('quizCardBox').classList.add('hidden');
    $('quizSummaryBox').classList.remove('hidden');
    if ($('quizSummaryTitle')) $('quizSummaryTitle').textContent = 'Test yakunlandi!';
    const total = quizSession.items.length;
    const pct = total > 0 ? Math.round((quizSession.score / total) * 100) : 0;
    $('quizSummaryStats').textContent = total + ' ta savoldan ' + quizSession.score + ' tasi to‘g‘ri (' + pct + '%).';

    if (isStudentSession() && total > 0) {
      emitStudentTelemetry({
        type: 'QUIZ_FINISH',
        view: 'study',
        mode: 'quiz',
        lesson: activeLesson !== 'ALL' ? activeLesson : '',
        quizFinished: true,
        isCorrect: pct >= 60,
        detail: 'Test yakunlandi: ' + quizSession.score + '/' + total + ' (' + pct + '%)'
      });
    }

    renderWrongWordsSummary($('quizWrongList'), quizSession.wrongWords);
    refreshIcons();
  }

  /* ==================== MODE C: WRITING / SPELLING ==================== */

  function initWritingSession() {
    const pool = shuffleArray(getFilteredStudyWords().filter(function (w) {
      return Boolean(w.word && w.word.trim() && w.translation && w.translation.trim());
    }));
    writeSession.items = pool.slice(0, Math.min(10, pool.length));
    writeSession.index = 0;
    writeSession.score = 0;
    writeSession.scopeKey = getStudyScopeKey();
    writeSession.answered = false;
    writeSession.hintStep = 0;
    writeSession.wrongWords = [];

    $('writeSummaryBox').classList.add('hidden');
    $('writeCardBox').classList.remove('hidden');

    if (writeSession.items.length === 0) {
      $('writeProgressText').textContent = 'Mashq 0 / 0';
      $('writeScoreText').textContent = 'To‘g‘ri: 0';
      $('writeProgressBar').style.width = '0%';
      $('writeCardBox').classList.add('hidden');
      $('writeSummaryBox').classList.remove('hidden');
      if ($('writeSummaryTitle')) $('writeSummaryTitle').textContent = 'Yozma mashq uchun so‘z topilmadi';
      $('writeSummaryStats').textContent = 'Tanlangan darslik yoki kategoriyada tarjimali so‘z topilmadi.';
      if ($('writeWrongList')) $('writeWrongList').innerHTML = '';
      refreshIcons();
      return;
    }
    renderWritingQuestion();
  }

  function renderWritingQuestion() {
    const total = writeSession.items.length;
    if (writeSession.index >= total) {
      writeSession.answered = false;
      $('writeCardBox').classList.add('hidden');
      $('writeSummaryBox').classList.remove('hidden');
      if ($('writeSummaryTitle')) $('writeSummaryTitle').textContent = 'Yozma mashq yakunlandi!';
      const pct = total > 0 ? Math.round((writeSession.score / total) * 100) : 0;
      $('writeSummaryStats').textContent = total + ' ta so‘zdan ' + writeSession.score + ' tasini to‘g‘ri yozdingiz (' + pct + '%).';
      if (isStudentSession() && total > 0) {
        emitStudentTelemetry({
          type: 'WRITING_FINISH',
          view: 'study',
          mode: 'writing',
          lesson: activeLesson !== 'ALL' ? activeLesson : '',
          writingFinished: true,
          isCorrect: pct >= 60,
          detail: 'Yozma mashq yakunlandi: ' + writeSession.score + '/' + total + ' (' + pct + '%)'
        });
      }
      renderWrongWordsSummary($('writeWrongList'), writeSession.wrongWords);
      refreshIcons();
      return;
    }

    const item = writeSession.items[writeSession.index];
    writeSession.answered = false;
    writeSession.hintStep = 0;

    $('writeProgressText').textContent = 'Mashq ' + (writeSession.index + 1) + ' / ' + total;
    $('writeScoreText').textContent = 'To‘g‘ri: ' + writeSession.score;
    $('writeProgressBar').style.width = Math.round(((writeSession.index + 1) / total) * 100) + '%';

    $('writeCategoryBadge').textContent = item.category;
    $('writeLevelBadge').textContent = item.level;
    $('writePos').textContent = item.partOfSpeech || '';
    $('writeTranslation').textContent = item.translation;
    $('writeDefinition').textContent = item.definition || '';
    $('writeHintText').textContent = '';

    const input = $('writeInput');
    input.value = '';
    input.disabled = false;
    input.focus();

    $('writeCheckBtn').disabled = false;
    $('writeHintBtn').disabled = false;
    $('writeFeedbackBox').classList.add('hidden');
    $('writeNextBtn').classList.add('hidden');
    $('writeNextBtn').classList.remove('inline-flex');
  }

  function revealWritingHint() {
    if (writeSession.answered || !writeSession.items[writeSession.index]) return;
    const word = writeSession.items[writeSession.index].word;
    writeSession.hintStep = Math.min(3, writeSession.hintStep + 1);

    let prevWasSep = true;
    const chars = word.split('').map(function (ch, idx) {
      if (ch === ' ' || ch === '-' || ch === "'") {
        prevWasSep = ch === ' ' || ch === '-';
        return ch;
      }
      const isWordStart = idx === 0 || prevWasSep;
      prevWasSep = false;
      if (isWordStart) return ch;
      if (writeSession.hintStep >= 2 && idx === word.length - 1) return ch;
      if (writeSession.hintStep >= 3 && idx % 3 === 0) return ch;
      return '_';
    });

    $('writeHintText').textContent = chars.join(' ');
  }

  function checkWritingAnswer(e) {
    if (e) e.preventDefault();
    if (writeSession.answered) {
      if (writeSession.index < writeSession.items.length) {
        writeSession.index++;
        renderWritingQuestion();
      }
      return;
    }

    const target = writeSession.items[writeSession.index];
    if (!target) return;

    const rawAnswer = $('writeInput').value.trim();
    if (!rawAnswer) {
      showToast('Iltimos, javobni kiriting!', 'warning');
      return;
    }

    const isCorrect = SRS.gradeEnglishTypingAnswer(rawAnswer, target.word);

    writeSession.answered = true;
    if (isCorrect) {
      writeSession.score++;
    } else {
      writeSession.wrongWords.push(target);
    }

    if (isStudentSession()) {
      emitStudentTelemetry({
        type: 'WRITING_CHECK',
        view: 'study',
        mode: 'writing',
        lesson: target.lesson || '',
        deck: activeDeck !== 'ALL' ? activeDeck : '',
        word: target.word,
        isCorrect: isCorrect,
        writingCorrectDelta: isCorrect ? 1 : 0,
        writingTotalDelta: 1,
        countAsStudyActivity: true,
        detail: 'Yozma mashq: "' + target.word + '" — ' + (isCorrect ? 'to‘g‘ri yozdi' : 'xato yozdi')
      });
    } else {
      state = Storage.recordStudyActivity(state, Date.now());
      persist('study');
    }

    $('writeScoreText').textContent = 'To‘g‘ri: ' + writeSession.score;
    $('writeInput').disabled = true;
    $('writeCheckBtn').disabled = true;
    $('writeHintBtn').disabled = true;

    const fb = $('writeFeedbackBox');
    fb.className = 'p-4 rounded-2xl border text-sm space-y-1.5 ' +
      (isCorrect
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200');
    fb.innerHTML =
      '<p class="font-extrabold">' + (isCorrect ? 'Barakalla! Mutlaqo to‘g‘ri.' : 'Xato. To‘g‘ri yozilishi: ' + escapeHtml(target.word)) + '</p>' +
      '<p class="font-mono-ipa text-xs opacity-85">' + escapeHtml(formatWordPronunciation(target)) + '</p>';
    fb.classList.remove('hidden');

    const nextBtn = $('writeNextBtn');
    nextBtn.classList.remove('hidden');
    nextBtn.classList.add('inline-flex');
    speakText(target.word, { wordId: target.id });
  }

  /* ==================== MODE D: LISTENING MODE ==================== */

  function setListeningType(type) {
    listenSession.type = type === 'dictation' ? 'dictation' : 'quiz';
    document.querySelectorAll('.listen-type-btn').forEach(function (btn) {
      const active = btn.getAttribute('data-listen-type') === listenSession.type;
      btn.className = 'listen-type-btn px-3 py-1 rounded-lg text-xs font-bold transition-all ' +
        (active
          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
          : 'text-slate-600 dark:text-slate-300');
    });
    if (currentView === 'study' && currentStudyMode === 'listening') {
      if (Speech && typeof Speech.stop === 'function') Speech.stop();
      initListeningSession();
    }
  }

  function initListeningSession() {
    const pool = shuffleArray(getFilteredStudyWords().filter(function (w) {
      return Boolean(w.word && w.word.trim());
    }));
    listenSession.items = pool.slice(0, Math.min(10, pool.length));
    listenSession.index = 0;
    listenSession.score = 0;
    listenSession.scopeKey = getStudyScopeKey();
    listenSession.answered = false;
    listenSession.currentOptions = [];
    listenSession.wrongWords = [];

    $('listenSummaryBox').classList.add('hidden');
    $('listenCardBox').classList.remove('hidden');

    if (listenSession.items.length === 0) {
      $('listenProgressText').textContent = 'Audio 0 / 0';
      $('listenScoreText').textContent = 'To‘g‘ri: 0';
      $('listenProgressBar').style.width = '0%';
      $('listenCardBox').classList.add('hidden');
      $('listenSummaryBox').classList.remove('hidden');
      if ($('listenSummaryTitle')) $('listenSummaryTitle').textContent = 'Listening uchun so‘z topilmadi';
      $('listenSummaryStats').textContent = 'Tanlangan darslik yoki kategoriyada listening mashqi uchun so‘z topilmadi.';
      if ($('listenWrongList')) $('listenWrongList').innerHTML = '';
      refreshIcons();
      return;
    }
    renderListeningQuestion(true);
  }

  function renderListeningQuestion(autoSpeak) {
    const total = listenSession.items.length;
    if (listenSession.index >= total) {
      listenSession.answered = false;
      listenSession.currentOptions = [];
      $('listenCardBox').classList.add('hidden');
      $('listenSummaryBox').classList.remove('hidden');
      if ($('listenSummaryTitle')) $('listenSummaryTitle').textContent = 'Listening mashqi yakunlandi!';
      const pct = total > 0 ? Math.round((listenSession.score / total) * 100) : 0;
      $('listenSummaryStats').textContent = total + ' ta audiodan ' + listenSession.score + ' tasi to‘g‘ri topildi (' + pct + '%).';
      if (isStudentSession() && total > 0) {
        emitStudentTelemetry({
          type: 'LISTENING_FINISH',
          view: 'study',
          mode: 'listening',
          lesson: activeLesson !== 'ALL' ? activeLesson : '',
          listeningFinished: true,
          isCorrect: pct >= 60,
          detail: 'Listening yakunlandi: ' + listenSession.score + '/' + total + ' (' + pct + '%)'
        });
      }
      renderWrongWordsSummary($('listenWrongList'), listenSession.wrongWords);
      refreshIcons();
      return;
    }

    const target = listenSession.items[listenSession.index];
    listenSession.answered = false;

    $('listenProgressText').textContent = 'Audio ' + (listenSession.index + 1) + ' / ' + total;
    $('listenScoreText').textContent = 'To‘g‘ri: ' + listenSession.score;
    $('listenProgressBar').style.width = Math.round(((listenSession.index + 1) / total) * 100) + '%';

    $('listenFeedbackBox').classList.add('hidden');
    $('listenNextBtn').classList.add('hidden');
    $('listenNextBtn').classList.remove('inline-flex');

    if (listenSession.type === 'quiz') {
      $('listenQuizOptions').classList.remove('hidden');
      $('listenDictationForm').classList.add('hidden');

      listenSession.currentOptions = buildQuizOptions(target);
      const grid = $('listenQuizOptions');
      grid.innerHTML = '';
      listenSession.currentOptions.forEach(function (opt, idx) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-tactile p-4 rounded-2xl glass-panel border border-slate-200/80 dark:border-slate-700/80 text-left flex items-center justify-between gap-2 hover:border-sky-400/70 transition-all';
        btn.innerHTML =
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<kbd class="kbd-badge shrink-0">' + (idx + 1) + '</kbd>' +
            '<span class="font-extrabold text-sm sm:text-base truncate">' + escapeHtml(opt.word) + '</span>' +
          '</div>' +
          '<span class="listen-mark text-sm font-extrabold"></span>';
        btn.addEventListener('click', function () {
          selectListeningOption(idx);
        });
        grid.appendChild(btn);
      });
    } else {
      $('listenQuizOptions').classList.add('hidden');
      $('listenDictationForm').classList.remove('hidden');
      const input = $('listenDictationInput');
      input.value = '';
      input.disabled = false;
      $('listenDictationCheckBtn').disabled = false;
      input.focus();
    }

    if (autoSpeak && currentView === 'study' && currentStudyMode === 'listening') {
      speakText(target.word, { wordId: target.id, triggerEl: $('listenSpeakBtn') });
    }
  }

  function selectListeningOption(idx) {
    if (listenSession.answered || listenSession.index >= listenSession.items.length || !listenSession.currentOptions || !listenSession.currentOptions[idx]) return;
    const target = listenSession.items[listenSession.index];
    const selected = listenSession.currentOptions[idx];
    const isCorrect = selected.id === target.id;
    finishListeningAnswer(isCorrect, idx);
  }

  function checkListeningDictation(e) {
    if (e) e.preventDefault();
    if (listenSession.answered) {
      if (listenSession.index < listenSession.items.length) {
        listenSession.index++;
        renderListeningQuestion(true);
      }
      return;
    }
    const target = listenSession.items[listenSession.index];
    if (!target) return;
    const typed = $('listenDictationInput').value.trim();
    if (!typed) {
      showToast('Eshitgan so‘zingizni yozing!', 'warning');
      return;
    }
    finishListeningAnswer(SRS.gradeEnglishTypingAnswer(typed, target.word), -1);
  }

  function finishListeningAnswer(isCorrect, chosenIdx) {
    listenSession.answered = true;
    const target = listenSession.items[listenSession.index];
    if (isCorrect) {
      listenSession.score++;
    } else {
      listenSession.wrongWords.push(target);
    }

    if (isStudentSession()) {
      emitStudentTelemetry({
        type: 'LISTENING_CHECK',
        view: 'study',
        mode: 'listening',
        lesson: target.lesson || '',
        deck: activeDeck !== 'ALL' ? activeDeck : '',
        word: target.word,
        isCorrect: isCorrect,
        listeningCorrectDelta: isCorrect ? 1 : 0,
        listeningTotalDelta: 1,
        countAsStudyActivity: true,
        detail: 'Listening (' + listenSession.type + '): "' + target.word + '" — ' + (isCorrect ? 'to‘g‘ri' : 'xato')
      });
    } else {
      state = Storage.recordStudyActivity(state, Date.now());
      persist('study');
    }
    $('listenScoreText').textContent = 'To‘g‘ri: ' + listenSession.score;

    if (listenSession.type === 'quiz') {
      const buttons = $('listenQuizOptions').querySelectorAll('button');
      buttons.forEach(function (btn, i) {
        btn.disabled = true;
        const opt = listenSession.currentOptions[i];
        const mark = btn.querySelector('.listen-mark');
        if (opt.id === target.id) {
          btn.classList.add('border-emerald-500', 'bg-emerald-500/15', 'text-emerald-800', 'dark:text-emerald-200');
          mark.textContent = '✓';
        } else if (i === chosenIdx && !isCorrect) {
          btn.classList.add('border-rose-500', 'bg-rose-500/15', 'text-rose-800', 'dark:text-rose-200');
          mark.textContent = '✕';
        }
      });
    } else {
      $('listenDictationInput').disabled = true;
      $('listenDictationCheckBtn').disabled = true;
    }

    const fb = $('listenFeedbackBox');
    fb.className = 'p-4 rounded-2xl border text-sm space-y-1 ' +
      (isCorrect
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200');
    fb.innerHTML =
      '<p class="font-extrabold">' + escapeHtml(target.word) + ' <span class="font-mono-ipa font-normal opacity-80">' + escapeHtml(formatWordPronunciation(target)) + '</span></p>' +
      '<p class="text-xs sm:text-sm">' + escapeHtml(target.translation) + '</p>';
    fb.classList.remove('hidden');

    const nextBtn = $('listenNextBtn');
    nextBtn.classList.remove('hidden');
    nextBtn.classList.add('inline-flex');
  }

  /* ==================== MODE E: YAKUNIY YOPIQ TEST (PROCTORED EXAM) ==================== */

  let examActionChain = Promise.resolve();

  function queueExamAction(fn) {
    const run = examActionChain.then(fn, fn);
    examActionChain = run.catch(function () {});
    return run;
  }

  function getStudentFinalExam() {
    if (!isStudentSession()) return Exam.createEmptyFinalExam();
    const prog = state && state.studentProgress ? state.studentProgress[currentSession.userId] : null;
    return Exam.normalizeExamRecord(prog ? prog.finalExam : null);
  }

  function isExamActivelyProctored() {
    return Boolean(isStudentSession() && getStudentFinalExam().status === 'in_progress');
  }

  function getExamStatusMeta(finalExam) {
    const exam = Exam.normalizeExamRecord(finalExam);
    if (exam.status === 'cheating_locked') {
      return {
        label: 'CHEATING (' + exam.warningsCount + '/' + Exam.MAX_WARNINGS + ')',
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
        dotClass: 'bg-rose-500 animate-pulse'
      };
    }
    if (exam.status === 'completed') {
      const pct = exam.scorePct !== null ? exam.scorePct : 0;
      return {
        label: 'Yakuniy test: ' + pct + '%',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
        dotClass: 'bg-emerald-500'
      };
    }
    if (exam.status === 'in_progress') {
      return {
        label: 'Testda (' + exam.answeredCount + '/' + exam.totalQuestions + ')',
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
        dotClass: 'bg-amber-500 animate-pulse'
      };
    }
    return {
      label: 'Yakuniy test: Topshirmagan',
      badgeClass: 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300/60 dark:border-slate-700',
      dotClass: 'bg-slate-400'
    };
  }

  async function applyExamActionLocalOrRemote(payload) {
    return queueExamAction(async function () {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushExamActionRemote(payload);
        if (res && res.state) mergeRemoteState(res.state);
        return Exam.normalizeExamRecord((res && res.finalExam) || getStudentFinalExam());
      }
      const out = Exam.applyExamAction(state, currentSession, payload, Date.now());
      state = out.state;
      persist('exam');
      return Exam.normalizeExamRecord(out.finalExam);
    });
  }

  function updateExamFullscreenBadge() {
    const fsBadge = $('examFullscreenBadge');
    const fsBtn = $('examReturnFullscreenBtn');
    const inFullscreen = Boolean(document.fullscreenElement);
    if (fsBadge) {
      fsBadge.textContent = inFullscreen ? 'Fullscreen: Faol' : 'Fullscreen: Chiqilgan';
      fsBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold border ' + (inFullscreen
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30');
    }
    if (fsBtn) {
      fsBtn.classList.toggle('hidden', inFullscreen || !isExamActivelyProctored());
      fsBtn.classList.toggle('inline-flex', !inFullscreen && isExamActivelyProctored());
    }
  }

  function resetAllStudyRuntimeSessions() {
    clearRetryTimer();
    unbindExamProctoring();
    if (Speech && typeof Speech.stop === 'function') {
      Speech.stop();
    }
    fcSession.queue = [];
    fcSession.index = 0;
    fcSession.scopeKey = '';
    fcSession.scopeMode = '';
    fcSession.isFlipped = false;
    fcSession.waitingRetryUntil = null;
    fcSession.waitingWordId = null;

    quizSession.items = [];
    quizSession.index = 0;
    quizSession.score = 0;
    quizSession.scopeKey = '';
    quizSession.answered = false;
    quizSession.currentOptions = [];
    quizSession.wrongWords = [];

    writeSession.items = [];
    writeSession.index = 0;
    writeSession.score = 0;
    writeSession.scopeKey = '';
    writeSession.answered = false;
    writeSession.hintStep = 0;
    writeSession.wrongWords = [];

    listenSession.items = [];
    listenSession.index = 0;
    listenSession.score = 0;
    listenSession.scopeKey = '';
    listenSession.answered = false;
    listenSession.currentOptions = [];
    listenSession.wrongWords = [];

    examSessionRuntime.currentWordId = null;
    examSessionRuntime.finishingEmpty = false;
    examSessionRuntime.armedAt = 0;
    examSessionRuntime.lastStrikeAt = 0;
    examSessionRuntime.lastInputValue = '';
  }

  function unbindExamProctoring() {
    if (examSessionRuntime.blurTimerId) {
      clearTimeout(examSessionRuntime.blurTimerId);
      examSessionRuntime.blurTimerId = null;
    }
    if (examSessionRuntime.observer) {
      try {
        examSessionRuntime.observer.disconnect();
      } catch (_) {}
      examSessionRuntime.observer = null;
    }
    const h = examSessionRuntime.handlers;
    if (h) {
      document.removeEventListener('visibilitychange', h.onVisibility);
      window.removeEventListener('blur', h.onWindowBlur);
      if (h.onWindowFocus) window.removeEventListener('focus', h.onWindowFocus);
      document.removeEventListener('fullscreenchange', h.onFullscreenChange);
      document.removeEventListener('contextmenu', h.onContextMenu, true);
      document.removeEventListener('keydown', h.onKeydown, true);
      ['copy', 'cut', 'paste', 'drop', 'dragstart'].forEach(function (evtName) {
        document.removeEventListener(evtName, h.onClipboardOrDrop, true);
      });
      window.removeEventListener('beforeunload', h.onBeforeUnload);
      if (h.inputEl) {
        h.inputEl.removeEventListener('beforeinput', h.onBeforeInput, true);
        h.inputEl.removeEventListener('input', h.onInputGuard);
      }
      examSessionRuntime.handlers = null;
    }
    examSessionRuntime.proctoringBound = false;
  }

  function hasExtensionDomTampering(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'FONT') return true;
    if (tag.indexOf('GRAMMARLY') !== -1 || tag.indexOf('TRANSLATE') !== -1) return true;
    const marker = [
      node.id || '',
      typeof node.className === 'string' ? node.className : '',
      node.getAttribute ? (node.getAttribute('data-lt-tmp-id') || '') : ''
    ].join(' ');
    return /goog-gt|skiptranslate|grammarly|languagetool|lt-mirror|deepl|gtx-|immersive-translate/i.test(marker);
  }

  function bindExamProctoring() {
    if (examSessionRuntime.proctoringBound || !isExamActivelyProctored()) return;

    const inputEl = $('examAnswerInput');
    const examRoot = $('mode-exam');

    const handlers = {
      inputEl: inputEl,
      onVisibility: function () {
        if (document.hidden && isExamActivelyProctored()) {
          if (examSessionRuntime.blurTimerId) {
            clearTimeout(examSessionRuntime.blurTimerId);
            examSessionRuntime.blurTimerId = null;
          }
          recordExamViolation('Boshqa tab yoki oynaga o‘tildi (visibilitychange)');
        }
      },
      onWindowFocus: function () {
        if (examSessionRuntime.blurTimerId) {
          clearTimeout(examSessionRuntime.blurTimerId);
          examSessionRuntime.blurTimerId = null;
        }
      },
      onWindowBlur: function () {
        if (!isExamActivelyProctored()) return;
        if (Date.now() - examSessionRuntime.armedAt < 1500) return;
        if (examSessionRuntime.blurTimerId) clearTimeout(examSessionRuntime.blurTimerId);
        // Short 250ms debounce eliminates OS IME / Alt+Shift keyboard language switch flicker
        // while still catching any real window switch, devtools popout, or extension popup.
        examSessionRuntime.blurTimerId = setTimeout(function () {
          examSessionRuntime.blurTimerId = null;
          if (!isExamActivelyProctored()) return;
          if (document.hidden || !document.hasFocus()) {
            recordExamViolation('Faol test oynasidan chiqildi (window blur / Alt+Tab / extension)');
          }
        }, 250);
      },
      onFullscreenChange: function () {
        updateExamFullscreenBadge();
        if (!document.fullscreenElement && isExamActivelyProctored()) {
          if (Date.now() - examSessionRuntime.armedAt < 1500) return;
          recordExamViolation('To‘liq ekran (Fullscreen) rejimi yopildi');
        }
      },
      onContextMenu: function (e) {
        if (!isExamActivelyProctored()) return;
        e.preventDefault();
        e.stopPropagation();
        recordExamViolation('Sichqoncha o‘ng tugmasi (Context Menu) bosildi');
      },
      onClipboardOrDrop: function (e) {
        if (!isExamActivelyProctored()) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.type !== 'dragstart') {
          recordExamViolation('Nusxa olish / joylashtirish taqiqlanadi (' + e.type + ')');
        }
      },
      onKeydown: function (e) {
        if (!isExamActivelyProctored()) return;
        const keyLower = String(e.key || '').toLowerCase();
        const keyUpper = String(e.key || '').toUpperCase();
        const code = String(e.code || '');
        const mod = Boolean(e.ctrlKey || e.metaKey);
        const isDevtools = e.key === 'F12' ||
          (mod && e.shiftKey && (['I', 'J', 'C', 'K', 'E'].indexOf(keyUpper) !== -1 || ['KeyI', 'KeyJ', 'KeyC', 'KeyK', 'KeyE'].indexOf(code) !== -1));
        const isCheatCombo = mod && !e.shiftKey && !e.altKey && (
          ['c', 'v', 'x', 'u', 's', 'p'].indexOf(keyLower) !== -1 ||
          ['KeyC', 'KeyV', 'KeyX', 'KeyU', 'KeyS', 'KeyP'].indexOf(code) !== -1
        );
        const isPrintScreen = e.key === 'PrintScreen';
        if (isDevtools || isCheatCombo || isPrintScreen) {
          e.preventDefault();
          e.stopPropagation();
          recordExamViolation('Taqiqlangan klaviatura buyrug‘i (' + (mod ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.key || code) + ')');
        }
      },
      onBeforeInput: function (e) {
        if (!isExamActivelyProctored()) return;
        const t = String(e.inputType || '');
        if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertReplacementText' || t === 'insertFromYank') {
          e.preventDefault();
          e.stopPropagation();
          recordExamViolation('Clipboard yoki extension orqali matn kiritishga urinish (' + t + ')');
        }
      },
      onInputGuard: function () {
        if (!inputEl) return;
        examSessionRuntime.lastInputValue = inputEl.value || '';
      },
      onBeforeUnload: function (e) {
        if (!isExamActivelyProctored()) return;
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', handlers.onVisibility);
    window.addEventListener('blur', handlers.onWindowBlur);
    window.addEventListener('focus', handlers.onWindowFocus);
    document.addEventListener('fullscreenchange', handlers.onFullscreenChange);
    document.addEventListener('contextmenu', handlers.onContextMenu, true);
    document.addEventListener('keydown', handlers.onKeydown, true);
    ['copy', 'cut', 'paste', 'drop', 'dragstart'].forEach(function (evtName) {
      document.addEventListener(evtName, handlers.onClipboardOrDrop, true);
    });
    window.addEventListener('beforeunload', handlers.onBeforeUnload);
    if (inputEl) {
      inputEl.addEventListener('beforeinput', handlers.onBeforeInput, true);
      inputEl.addEventListener('input', handlers.onInputGuard);
      examSessionRuntime.lastInputValue = inputEl.value || '';
    }

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(function (mutations) {
        if (!isExamActivelyProctored() || examSessionRuntime.isRenderingPrompt) return;
        const rootTranslated = document.documentElement.classList.contains('translated-ltr') ||
          document.documentElement.classList.contains('translated-rtl');
        if (rootTranslated) {
          document.documentElement.classList.remove('translated-ltr', 'translated-rtl');
          recordExamViolation('Brauzer tarjimoni (Page Translate) yoqilgani aniqlandi');
          return;
        }
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type === 'childList' && m.addedNodes) {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const node = m.addedNodes[j];
              if (hasExtensionDomTampering(node) || (m.target === $('examPromptWord') && node.nodeType === 1)) {
                try { if (node.parentNode) node.parentNode.removeChild(node); } catch (_) {}
                renderExamQuestion(getStudentFinalExam());
                recordExamViolation('Tashqi kengaytma (extension) DOM aralashuvi aniqlandi');
                return;
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (examRoot) {
        observer.observe(examRoot, { childList: true, subtree: true });
      }
      examSessionRuntime.observer = observer;
    }

    examSessionRuntime.handlers = handlers;
    examSessionRuntime.proctoringBound = true;
    updateExamFullscreenBadge();
  }

  function renderExamQuestion(exam) {
    const answeredIds = {};
    (exam.answers || []).forEach(function (a) { answeredIds[a.wordId] = true; });
    const nextId = (exam.questionQueueIds || []).find(function (id) { return !answeredIds[id]; });
    const wordObj = nextId ? (state.words || []).find(function (w) { return w.id === nextId; }) : null;

    const promptEl = $('examPromptWord');
    const metaEl = $('examPromptMeta');
    const inputEl = $('examAnswerInput');

    if (!wordObj) {
      if (exam.status === 'in_progress' && !examSessionRuntime.finishingEmpty) {
        examSessionRuntime.finishingEmpty = true;
        finishExamEarly(true).finally(function () {
          examSessionRuntime.finishingEmpty = false;
        });
      }
      return;
    }

    examSessionRuntime.isRenderingPrompt = true;
    try {
      const isNewWord = examSessionRuntime.currentWordId !== wordObj.id;
      examSessionRuntime.currentWordId = wordObj.id;
      if (promptEl) {
        promptEl.textContent = wordObj.word;
      }
      if (metaEl) {
        const parts = [wordObj.lesson || 'Umumiy'];
        if (wordObj.category) parts.push(wordObj.category);
        if (wordObj.partOfSpeech) parts.push(wordObj.partOfSpeech);
        metaEl.textContent = parts.join(' · ');
      }
      if (inputEl && isNewWord) {
        inputEl.value = '';
        examSessionRuntime.lastInputValue = '';
      }
      if (examSessionRuntime.observer) examSessionRuntime.observer.takeRecords();
    } finally {
      examSessionRuntime.isRenderingPrompt = false;
    }
  }

  function renderExamViewFromState() {
    const introCard = $('examIntroCard');
    const activeCard = $('examActiveCard');
    const lockedCard = $('examLockedCard');
    const resultCard = $('examResultCard');
    if (!introCard || !activeCard || !lockedCard || !resultCard) return;

    examSessionRuntime.isRenderingPrompt = true;
    try {
      const scopedWords = getFilteredStudyWords();
      if (!isStudentSession()) {
        unbindExamProctoring();
        introCard.classList.remove('hidden');
        activeCard.classList.add('hidden');
        lockedCard.classList.add('hidden');
        resultCard.classList.add('hidden');
        if ($('examStaffNotice')) $('examStaffNotice').classList.remove('hidden');
        if ($('examQuestionCountLabel')) $('examQuestionCountLabel').textContent = scopedWords.length + ' ta so‘z';
        if ($('examStartBtn')) $('examStartBtn').disabled = true;
        return;
      }

      if ($('examStaffNotice')) $('examStaffNotice').classList.add('hidden');
      const exam = getStudentFinalExam();

      if (exam.status === 'cheating_locked') {
        unbindExamProctoring();
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(function () {});
        }
        introCard.classList.add('hidden');
        activeCard.classList.add('hidden');
        lockedCard.classList.remove('hidden');
        resultCard.classList.add('hidden');
        const violEl = $('examViolationList');
        if (violEl) {
          const flags = Array.isArray(exam.cheatingFlags) ? exam.cheatingFlags : [];
          violEl.innerHTML = flags.length === 0
            ? '<p class="text-xs text-rose-700 dark:text-rose-300 font-semibold">Qoidabuzarliklar qayd etilgan.</p>'
            : flags.map(function (f) {
                return '<div class="flex items-start justify-between gap-2 text-xs p-2 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-rose-300/40 dark:border-rose-500/30">' +
                  '<span class="font-bold text-rose-700 dark:text-rose-300">#' + escapeHtml(String(f.warningNumber || '?')) + ': ' + escapeHtml(f.reason || 'Qoidabuzarlik') + '</span>' +
                  '<span class="shrink-0 text-[10px] font-mono text-slate-400">' + (f.timestamp ? escapeHtml(new Date(f.timestamp).toLocaleTimeString()) : '') + '</span>' +
                '</div>';
              }).join('');
        }
        refreshIcons();
        return;
      }

      if (exam.status === 'completed') {
        unbindExamProctoring();
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(function () {});
        }
        introCard.classList.add('hidden');
        activeCard.classList.add('hidden');
        lockedCard.classList.add('hidden');
        resultCard.classList.remove('hidden');
        const pct = exam.scorePct !== null ? exam.scorePct : 0;
        if ($('examResultStats')) {
          $('examResultStats').textContent = exam.correctCount + ' / ' + exam.totalQuestions + ' ta to‘g‘ri javob · Ogohlantirishlar: ' + exam.warningsCount + ' / ' + Exam.MAX_WARNINGS;
        }
        if ($('examResultPct')) {
          $('examResultPct').textContent = pct + '%';
          $('examResultPct').className = 'text-2xl sm:text-3xl font-extrabold ' + (pct >= 80
            ? 'text-emerald-600 dark:text-emerald-300'
            : (pct >= 50 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300'));
        }
        if ($('examResultAnswersList')) {
          const answers = Array.isArray(exam.answers) ? exam.answers : [];
          $('examResultAnswersList').innerHTML = answers.length === 0
            ? '<p class="text-xs text-slate-500 text-center py-3">Javoblar kiritilmagan.</p>'
            : answers.map(function (a, idx) {
                return '<div class="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-white/65 dark:bg-slate-900/65 border border-slate-200/60 dark:border-slate-800 text-xs">' +
                  '<div class="min-w-0">' +
                    '<p class="font-extrabold">' + (idx + 1) + '. ' + escapeHtml(a.word) + '</p>' +
                    '<p class="text-slate-600 dark:text-slate-300">Sizning javobingiz: <strong>' + escapeHtml(a.userAnswer || '—') + '</strong></p>' +
                    (!a.isCorrect ? '<p class="text-emerald-600 dark:text-emerald-300 font-semibold">To‘g‘ri tarjima: ' + escapeHtml(a.expectedTranslation) + '</p>' : '') +
                  '</div>' +
                  '<span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ' + (a.isCorrect
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30') + '">' +
                    (a.isCorrect ? 'To‘g‘ri' : 'Xato') +
                  '</span>' +
                '</div>';
              }).join('');
        }
        refreshIcons();
        return;
      }

      if (exam.status === 'in_progress') {
        if (exam.lessonScope && exam.lessonScope !== activeLesson) {
          activeLesson = exam.lessonScope;
          if ($('studyLessonSelect')) $('studyLessonSelect').value = activeLesson;
        }
        if (exam.categoryScope && exam.categoryScope !== activeDeck) {
          activeDeck = exam.categoryScope;
          if ($('studyDeckSelect')) $('studyDeckSelect').value = activeDeck;
        }
        introCard.classList.add('hidden');
        activeCard.classList.remove('hidden');
        lockedCard.classList.add('hidden');
        resultCard.classList.add('hidden');
        const qNum = Math.min((exam.answers || []).length + 1, Math.max(1, exam.totalQuestions));
        if ($('examCounter')) $('examCounter').textContent = 'Savol ' + qNum + ' / ' + exam.totalQuestions;
        if ($('examWarningBadge')) {
          $('examWarningBadge').textContent = 'Ogohlantirish: ' + exam.warningsCount + ' / ' + Exam.MAX_WARNINGS;
          $('examWarningBadge').className = 'px-2.5 py-1 rounded-full text-xs font-extrabold border ' + (exam.warningsCount > 0
            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/40'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30');
        }
        if ($('examProgressBar')) {
          const progPct = exam.totalQuestions > 0 ? Math.round(((exam.answers || []).length / exam.totalQuestions) * 100) : 0;
          $('examProgressBar').style.width = progPct + '%';
        }
        if ($('examWarningBanner')) {
          if (exam.warningsCount > 0) {
            const lastFlag = (exam.cheatingFlags && exam.cheatingFlags[exam.cheatingFlags.length - 1]) || null;
            $('examWarningBanner').classList.remove('hidden');
            if ($('examWarningTitle')) {
              $('examWarningTitle').textContent = 'Ogohlantirish ' + exam.warningsCount + ' / ' + Exam.MAX_WARNINGS + '!';
            }
            if ($('examWarningDetail')) {
              $('examWarningDetail').textContent = ((lastFlag && lastFlag.reason) ? lastFlag.reason + ' ' : '') +
                'Keyingi (3-marta) qoidabuzarlikda test CHEATING sifatida avtomatik bloklanadi!';
            }
          } else {
            $('examWarningBanner').classList.add('hidden');
          }
        }
        updateExamFullscreenBadge();
        bindExamProctoring();
        renderExamQuestion(exam);
        refreshIcons();
        return;
      }

      // not_started
      unbindExamProctoring();
      const wasActiveOrFinished = Boolean(examSessionRuntime.currentWordId);
      examSessionRuntime.currentWordId = null;
      if (wasActiveOrFinished && $('examAgreeCheck')) {
        $('examAgreeCheck').checked = false;
      }
      introCard.classList.remove('hidden');
      activeCard.classList.add('hidden');
      lockedCard.classList.add('hidden');
      resultCard.classList.add('hidden');
      if ($('examQuestionCountLabel')) {
        const scopeLabel = (activeLesson === 'ALL' ? 'Barcha darsliklar' : activeLesson) +
          (activeDeck === 'ALL' ? '' : ' · ' + activeDeck);
        $('examQuestionCountLabel').textContent = scopeLabel + ' — ' + scopedWords.length + ' ta so‘z';
      }
      if ($('examStartBtn')) {
        const agreed = Boolean($('examAgreeCheck') && $('examAgreeCheck').checked);
        $('examStartBtn').disabled = scopedWords.length === 0 || !agreed;
      }
      refreshIcons();
    } finally {
      if (examSessionRuntime.observer) {
        try { examSessionRuntime.observer.takeRecords(); } catch (_) {}
      }
      examSessionRuntime.isRenderingPrompt = false;
    }
  }

  function initExamSession() {
    const exam = getStudentFinalExam();
    if (isStudentSession() && exam.status === 'in_progress') {
      if (!examSessionRuntime.proctoringBound) {
        bindExamProctoring();
        if (examSessionRuntime.armedAt === 0) {
          examSessionRuntime.armedAt = Date.now();
          recordExamViolation('Faol test sahifasi yangilandi yoki sessiya uzildi');
        }
      }
    } else {
      unbindExamProctoring();
    }
    renderExamViewFromState();
  }

  async function recordExamViolation(reason) {
    if (!isExamActivelyProctored()) return;
    const now = Date.now();
    if (now - examSessionRuntime.lastStrikeAt < 1200) return;
    examSessionRuntime.lastStrikeAt = now;

    let updatedExam;
    try {
      updatedExam = await applyExamActionLocalOrRemote({
        action: 'violation',
        reason: String(reason || 'Yopiq test qoidasi buzildi').slice(0, 200)
      });
    } catch (err) {
      showToast((err && err.message) || 'Nazorat signalini yuborishda xatolik.', 'error');
      return;
    }

    renderExamViewFromState();
    if (updatedExam.status === 'cheating_locked') {
      showToast('3-marta qoidabuzarlik! Test CHEATING sifatida bloklandi. Ustozdan ruxsat oling.', 'error');
    } else {
      showToast('Ogohlantirish (' + updatedExam.warningsCount + '/' + Exam.MAX_WARNINGS + '): ' + reason, 'warning');
    }
  }

  function tryEnterFullscreen() {
    examSessionRuntime.armedAt = Date.now();
    if (document.documentElement && typeof document.documentElement.requestFullscreen === 'function') {
      try {
        const fsPromise = document.documentElement.requestFullscreen();
        if (fsPromise && typeof fsPromise.then === 'function') {
          fsPromise.then(function () {
            examSessionRuntime.armedAt = Date.now();
            updateExamFullscreenBadge();
          }).catch(function () {});
        }
      } catch (_) {}
    }
  }

  async function startFinalExam() {
    if (!isStudentSession()) {
      showToast('Yopiq testni faqat Student sifatida topshirish mumkin.', 'warning');
      return;
    }
    if (!($('examAgreeCheck') && $('examAgreeCheck').checked)) {
      showToast('Avval test qoidalariga rozilik belgisini qo‘ying.', 'warning');
      return;
    }
    if (getFilteredStudyWords().length === 0) {
      showToast('Tanlangan dars/turkumda so‘zlar mavjud emas.', 'warning');
      return;
    }
    if (document.documentElement.classList.contains('translated-ltr') || document.documentElement.classList.contains('translated-rtl')) {
      document.documentElement.classList.remove('translated-ltr', 'translated-rtl');
      showToast('Iltimos avval brauzer tarjimonini o‘chiring.', 'error');
      return;
    }

    const startBtn = $('examStartBtn');
    if (startBtn) startBtn.disabled = true;

    tryEnterFullscreen();

    try {
      await applyExamActionLocalOrRemote({
        action: 'start',
        lessonScope: activeLesson,
        categoryScope: activeDeck
      });
      examSessionRuntime.armedAt = Date.now();
      bindExamProctoring();
      renderExamViewFromState();
      if ($('examAnswerInput')) $('examAnswerInput').focus();
      showToast('Yakuniy yopiq test boshlandi! Oynadan chiqmang.', 'info');
    } catch (err) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      renderExamViewFromState();
      showToast((err && err.message) || 'Yopiq testni boshlab bo‘lmadi.', 'error');
    } finally {
      if (startBtn && !isExamActivelyProctored()) {
        startBtn.disabled = !isStudentSession() || getFilteredStudyWords().length === 0 || !($('examAgreeCheck') && $('examAgreeCheck').checked);
      }
    }
  }

  async function handleExamAnswerSubmit(e) {
    e.preventDefault();
    if (!isExamActivelyProctored()) return;
    const inputEl = $('examAnswerInput');
    const submitBtn = $('examSubmitAnswerBtn');
    const userAnswer = (inputEl ? inputEl.value : '').trim();
    if (!userAnswer) {
      showToast('Iltimos, avval o‘zbekcha tarjimani klaviaturadan yozing.', 'warning');
      if (inputEl) inputEl.focus();
      return;
    }

    const exam = getStudentFinalExam();
    const wordId = examSessionRuntime.currentWordId;
    if (!wordId) {
      renderExamViewFromState();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const updated = await applyExamActionLocalOrRemote({
        action: 'answer',
        wordId: wordId,
        userAnswer: userAnswer
      });
      if (inputEl) inputEl.value = '';
      examSessionRuntime.lastInputValue = '';
      examSessionRuntime.currentWordId = null;
      renderExamViewFromState();
      if (updated.status === 'completed') {
        showToast('Yakuniy yopiq test yakunlandi! Natija: ' + updated.scorePct + '%', 'success');
      } else if (inputEl) {
        inputEl.focus();
      }
    } catch (err) {
      renderExamViewFromState();
      showToast((err && err.message) || 'Javobni yuborishda xatolik.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function finishExamEarly(silentAuto) {
    if (!isExamActivelyProctored()) return;
    try {
      const updated = await applyExamActionLocalOrRemote({ action: 'finish' });
      unbindExamProctoring();
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      renderExamViewFromState();
      if (!silentAuto) {
        showToast('Yakuniy test yakunlandi! Natija: ' + (updated.scorePct || 0) + '%', 'info');
      }
    } catch (err) {
      showToast((err && err.message) || 'Testni yakunlashda xatolik.', 'error');
    }
  }

  async function checkExamUnlockStatus() {
    if (Sync && Sync.isServerMode()) {
      try {
        const res = await Sync.fetchRemoteState();
        if (res && res.state) mergeRemoteState(res.state);
      } catch (err) {
        showToast((err && err.message) || 'Holatni tekshirishda xatolik.', 'error');
        return;
      }
    } else {
      state = Storage.loadState();
    }
    const exam = getStudentFinalExam();
    renderExamViewFromState();
    if (exam.status === 'not_started') {
      showToast('Ustoz qayta topshirishga ruxsat berdi! Testni boshlashingiz mumkin.', 'success');
    } else if (exam.status === 'cheating_locked') {
      showToast('Hali CHEATING bloki ochilmagan. Ustozdan ruxsat so‘rang.', 'warning');
    } else if (exam.status === 'completed') {
      showToast('Test yakunlangan. Qayta topshirish uchun ustoz ruxsati kerak.', 'info');
    }
  }

  function approveStudentExamRetake(student) {
    if (!Auth.canMonitorStudents(currentRole) || !student) {
      showToast('Qayta topshirishga ruxsat berish uchun Teacher yoki IT Manager huquqi kerak.', 'error');
      return;
    }
    openConfirm(
      'Yakuniy testga qayta ruxsat berish',
      student.fullName + ' (@' + student.username + ') uchun Yakuniy Yopiq Test bloki / natijasini tozalab qayta topshirishga ruxsat berilsinmi?',
      async function () {
        if (Sync && Sync.isServerMode()) {
          try {
            const res = await Sync.pushStudentActionRemote({
              action: 'approveExamRetake',
              studentId: student.id
            });
            mergeRemoteState(res.state);
          } catch (err) {
            showToast((err && err.message) || 'Ruxsat berishda xatolik.', 'error');
            return;
          }
        } else {
          try {
            const out = Exam.approveExamRetake(state, currentRole, student.id, Date.now());
            state = out.state;
            persist('exam');
          } catch (err2) {
            showToast((err2 && err2.message) || 'Ruxsat berishda xatolik.', 'error');
            return;
          }
        }
        renderMonitorView();
        renderAdminStudentsList();
        if (selectedMonitorStudentId === student.id) {
          openStudentDetailModal(student.id, true);
        }
        showToast(student.fullName + ' uchun qayta test topshirishga ruxsat berildi!', 'success');
      }
    );
  }

  /* ==================== VOCABULARY CRUD & IMPORT/EXPORT ==================== */

  function getFilteredVocabList() {
    const query = ($('vocabSearchInput').value || '').trim().toLowerCase();
    const lesson = ($('vocabLessonFilter') && $('vocabLessonFilter').value) || 'ALL';
    const cat = $('vocabCategoryFilter').value || 'ALL';
    const level = $('vocabLevelFilter').value || 'ALL';
    const status = $('vocabStatusFilter').value || 'ALL';
    const now = Date.now();

    return getSessionWords().filter(function (w) {
      if (lesson !== 'ALL' && (w.lesson || '') !== lesson) return false;
      if (cat !== 'ALL' && w.category !== cat) return false;
      if (level !== 'ALL' && w.level !== level) return false;
      if (status === 'due' && !SRS.isCardDue(w, now)) return false;
      if (status !== 'ALL' && status !== 'due') {
        const meta = SRS.getStatusMeta(w);
        if (meta.key !== status) return false;
      }
      if (query) {
        const hay = (w.word + ' ' + w.translation + ' ' + (w.definition || '') + ' ' + w.category + ' ' + (w.lesson || '')).toLowerCase();
        if (hay.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function renderVocabLessonsBar() {
    const bar = $('vocabLessonsBar');
    const pillsWrap = $('vocabLessonPills');
    const delSelectedBtn = $('vocabDeleteSelectedLessonBtn');
    const lessonFilter = $('vocabLessonFilter');
    const staffCanDelete = isStaff();

    if (delSelectedBtn) {
      const selectedLesson = (lessonFilter && lessonFilter.value) || 'ALL';
      delSelectedBtn.classList.toggle('hidden', !staffCanDelete || selectedLesson === 'ALL');
    }

    if (!bar || !pillsWrap) return;
    if (!staffCanDelete) {
      bar.classList.add('hidden');
      pillsWrap.innerHTML = '';
      return;
    }

    const lessons = Array.isArray(state.lessons) ? state.lessons : [];
    const currentFilter = (lessonFilter && lessonFilter.value) || 'ALL';
    pillsWrap.innerHTML = '';

    if (lessons.length === 0) {
      pillsWrap.innerHTML = '<span class="text-xs text-slate-400">Hali darsliklar yo‘q (.TXT Kiritish bo‘limidan yuklang)</span>';
      return;
    }

    lessons.forEach(function (lesson) {
      const count = state.words.filter(function (w) {
        return (w.lesson || '').toLowerCase() === (lesson.name || '').toLowerCase();
      }).length;
      const isSelected = currentFilter === lesson.name;

      const chip = document.createElement('div');
      chip.className = 'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-bold border transition-all ' +
        (isSelected
          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
          : 'bg-white/75 dark:bg-slate-900/75 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200');

      chip.innerHTML =
        '<button type="button" data-filter-lesson class="inline-flex items-center gap-1.5 hover:opacity-90">' +
          '<span>' + escapeHtml(lesson.name) + '</span>' +
          '<span class="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ' + (isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300') + ' tabular-nums">' + count + '</span>' +
        '</button>' +
        '<button type="button" data-delete-lesson-chip class="p-1 rounded-full hover:bg-rose-500/20 ' + (isSelected ? 'text-rose-200 hover:text-white' : 'text-rose-500') + '" title="' + escapeHtml(lesson.name) + ' dars lug‘atini o‘chirish">' +
          '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>' +
        '</button>';

      chip.querySelector('[data-filter-lesson]').addEventListener('click', function () {
        if (lessonFilter) {
          lessonFilter.value = isSelected ? 'ALL' : lesson.name;
          renderVocabulary();
        }
      });
      chip.querySelector('[data-delete-lesson-chip]').addEventListener('click', function (e) {
        e.stopPropagation();
        deleteLessonVocabulary(lesson.name);
      });

      pillsWrap.appendChild(chip);
    });
  }

  function renderVocabulary() {
    renderVocabLessonsBar();
    const list = getFilteredVocabList();
    const now = Date.now();
    const staffCanDelete = isStaff();
    $('vocabCountBadge').textContent = list.length + ' ta so‘z';

    const tbody = $('vocabTableBody');
    const mobileWrap = $('vocabMobileCards');
    const emptyEl = $('vocabEmptyState');

    tbody.innerHTML = '';
    mobileWrap.innerHTML = '';

    if (list.length === 0) {
      emptyEl.classList.remove('hidden');
      refreshIcons();
      return;
    }
    emptyEl.classList.add('hidden');

    list.forEach(function (w) {
      const meta = SRS.getStatusMeta(w);
      const nextText = SRS.formatNextReviewText(w, now);

      // Desktop Row
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-white/50 dark:hover:bg-slate-900/50 transition-colors';
      tr.innerHTML =
        '<td class="py-3.5 px-5">' +
          '<div class="font-extrabold text-slate-900 dark:text-white">' + escapeHtml(w.word) + '</div>' +
          '<div class="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">' +
            '<span class="font-mono-ipa">' + escapeHtml(formatWordPronunciation(w)) + '</span>' +
            '<span class="italic">' + escapeHtml(w.partOfSpeech || '') + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-200 max-w-xs">' + escapeHtml(w.translation) + '</td>' +
        '<td class="py-3.5 px-4">' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            (w.lesson ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">' + escapeHtml(w.lesson) + '</span>' : '') +
            '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/12 text-indigo-700 dark:text-indigo-300">' + escapeHtml(w.category) + '</span>' +
            '<span class="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 dark:bg-slate-800">' + escapeHtml(w.level) + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="py-3.5 px-4">' +
          '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ' + meta.badgeClass + '">' + escapeHtml(meta.label) + '</span>' +
          '<div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">' + escapeHtml(nextText) + '</div>' +
        '</td>' +
        '<td class="py-3.5 px-5 text-right">' +
          '<div class="inline-flex items-center gap-1">' +
            '<button type="button" data-action="speak" class="p-2 rounded-xl hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" title="Talaffuz"><i data-lucide="volume-2" class="w-4 h-4"></i></button>' +
            (staffCanDelete
              ? '<button type="button" data-action="delete" class="p-2 rounded-xl hover:bg-rose-500/15 text-rose-600 dark:text-rose-400" title="O‘chirish"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
              : '') +
          '</div>' +
        '</td>';

      tr.querySelector('[data-action="speak"]').addEventListener('click', function (e) { speakText(w.word, { triggerEl: e.currentTarget }); });
      const desktopDelBtn = tr.querySelector('[data-action="delete"]');
      if (desktopDelBtn) desktopDelBtn.addEventListener('click', function () { deleteWord(w); });
      tbody.appendChild(tr);

      // Mobile Card
      const mCard = document.createElement('div');
      mCard.className = 'glass-panel rounded-2xl p-4 space-y-2.5';
      mCard.innerHTML =
        '<div class="flex items-start justify-between gap-2">' +
          '<div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-extrabold text-base">' + escapeHtml(w.word) + '</span>' +
              '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 dark:bg-slate-800">' + escapeHtml(w.level) + '</span>' +
            '</div>' +
            '<p class="font-mono-ipa text-xs text-slate-500 dark:text-slate-400">' + escapeHtml(formatWordPronunciation(w)) + ' • ' + escapeHtml(w.partOfSpeech || '') + '</p>' +
          '</div>' +
          '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ' + meta.badgeClass + '">' + escapeHtml(meta.label) + '</span>' +
        '</div>' +
        '<p class="text-sm font-semibold">' + escapeHtml(w.translation) + '</p>' +
        '<div class="flex items-center justify-between pt-1 gap-2">' +
          '<div class="flex flex-wrap gap-1.5 text-xs font-bold">' +
            (w.lesson ? '<span class="text-emerald-600 dark:text-emerald-300">' + escapeHtml(w.lesson) + '</span>' : '') +
            '<span class="text-indigo-600 dark:text-indigo-300">' + escapeHtml(w.category) + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-1 shrink-0">' +
            '<button type="button" data-action="speak" class="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><i data-lucide="volume-2" class="w-4 h-4"></i></button>' +
            (staffCanDelete
              ? '<button type="button" data-action="delete" class="p-2 rounded-xl bg-rose-500/10 text-rose-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
              : '') +
          '</div>' +
        '</div>';

      mCard.querySelector('[data-action="speak"]').addEventListener('click', function (e) { speakText(w.word, { triggerEl: e.currentTarget }); });
      const mobDelBtn = mCard.querySelector('[data-action="delete"]');
      if (mobDelBtn) mobDelBtn.addEventListener('click', function () { deleteWord(w); });
      mobileWrap.appendChild(mCard);
    });

    refreshIcons();
  }

  /* ==================== MODALS & TXT EXPORT ==================== */

  function deleteWord(wordObj) {
    if (!isStaff()) return;
    openConfirm(
      'So‘zni o‘chirish',
      '"' + wordObj.word + '" so‘zini lug‘atdan butunlay o‘chirmoqchimisiz?',
      function () {
        state.words = state.words.filter(function (w) { return w.id !== wordObj.id; });
        persistCurriculum('WORD_DELETE', wordObj.word);
        showToast('"' + wordObj.word + '" o‘chirildi.', 'info');
        refreshActiveView();
      }
    );
  }

  function deleteLessonVocabulary(lessonName) {
    if (!isStaff()) return;
    const cleanName = String(lessonName || '').trim();
    if (!cleanName || cleanName === 'ALL') return;
    const targetLower = cleanName.toLowerCase();
    const affectedWords = state.words.filter(function (w) {
      return (w.lesson || '').toLowerCase() === targetLower;
    });

    openConfirm(
      'Dars lug‘atini o‘chirish',
      '"' + cleanName + '" darsligi va uning barcha ' + affectedWords.length + ' ta so‘zini butunlay o‘chirmoqchimisiz?',
      function () {
        state.words = state.words.filter(function (w) {
          return (w.lesson || '').toLowerCase() !== targetLower;
        });
        state.lessons = (state.lessons || []).filter(function (l) {
          return (l.name || '').toLowerCase() !== targetLower;
        });
        if (activeLesson && activeLesson.toLowerCase() === targetLower) activeLesson = 'ALL';
        if ($('vocabLessonFilter') && $('vocabLessonFilter').value.toLowerCase() === targetLower) {
          $('vocabLessonFilter').value = 'ALL';
        }
        persistCurriculum('LESSON_VOCAB_DELETE', cleanName + ' (' + affectedWords.length + ' ta so‘z o‘chirildi)');
        syncDeckSelects();
        refreshActiveView();
        showToast('"' + cleanName + '" darsligi va ' + affectedWords.length + ' ta so‘z o‘chirildi.', 'info');
      }
    );
  }

  function openConfirm(title, message, onConfirm) {
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    confirmCallback = onConfirm;
    $('confirmModal').classList.remove('hidden');
  }

  function closeConfirm() {
    $('confirmModal').classList.add('hidden');
    confirmCallback = null;
  }

  function refreshActiveView() {
    if (currentView === 'monitor') renderMonitorView();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'study') startCurrentStudyMode();
    if (currentView === 'vocabulary') renderVocabulary();
    if (currentView === 'txt-import') {
      syncDeckSelects();
      renderTxtAiStatus();
      renderAiConfigForm();
    }
    if (currentView === 'students') renderAdminStudentsList();
    if (currentView === 'security') renderSecurityTab();
    if (selectedMonitorStudentId && $('studentDetailModal') && !$('studentDetailModal').classList.contains('hidden')) {
      openStudentDetailModal(selectedMonitorStudentId, true);
    }
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportTXT(mode) {
    const content = AiTxt.exportToTXT(state.words, state.lessons, mode);
    const filename = mode === 'simple'
      ? 'swe-english-extra-simple.txt'
      : 'swe-english-extra-all-lessons.txt';
    downloadFile(filename, content, 'text/plain;charset=utf-8');
    showToast('Barcha darslik lug‘atlari .TXT faylga yuklab olindi!', 'success');
  }

  /* ==================== AUTH GATE, ROLES & LIVE SYNC ==================== */

  function applySyncBadgeUI() {
    const isSrv = Boolean(Sync && Sync.isServerMode());
    const extUrl = (Sync && typeof Sync.getServerBaseUrl === 'function') ? Sync.getServerBaseUrl() : '';
    const fullTitle = isSrv
      ? ('Real-time Server Sync (SSE)' + (extUrl ? ': ' + extUrl : ''))
      : 'Local Multi-Tab Sync (faqat shu qurilma brauzerida)';
    const compactLabel = isSrv ? 'Live Sync' : 'Local Sync';
    const cls = isSrv
      ? 'inline-flex whitespace-nowrap shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30'
      : 'inline-flex whitespace-nowrap shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-400/25';

    [$('syncModeBadge'), $('loginSyncBadge')].forEach(function (badge) {
      if (!badge) return;
      badge.title = fullTitle;
      badge.className = badge.id === 'syncModeBadge'
        ? cls.replace('inline-flex', 'hidden sm:inline-flex')
        : cls;
      const text = badge.id === 'loginSyncBadge' ? (isSrv ? 'Live Server Sync' : 'Local Multi-Tab') : compactLabel;
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full ' + (isSrv ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500') + '"></span><span>' + escapeHtml(text) + '</span>';
    });

    applyLoginRoleUI();
  }

  function applyRoleUI() {
    const staff = isStaff();
    const canSecurity = Auth.canManageSecurity(currentRole);
    const meta = Auth.ROLE_META[currentRole] || Auth.ROLE_META.student;

    document.querySelectorAll('.student-only-ui').forEach(function (el) {
      el.classList.toggle('hidden', staff);
    });
    document.querySelectorAll('.staff-only-ui').forEach(function (el) {
      el.classList.toggle('hidden', !staff);
    });
    document.querySelectorAll('.it-only-ui').forEach(function (el) {
      el.classList.toggle('hidden', !canSecurity);
    });
    if (!Auth.canManageAiConfig(currentRole)) {
      if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.add('hidden');
      if ($('aiApiKeyInput')) $('aiApiKeyInput').value = '';
    }

    const userBadgeBtn = $('userBadgeBtn');
    const userBadgeLabel = $('userBadgeLabel');
    const initialsEl = $('userAvatarInitials');
    const displayLabel = isStudentSession()
      ? (currentSession.fullName + ' (@' + currentSession.username + ')')
      : meta.label;

    if (userBadgeLabel) {
      userBadgeLabel.textContent = displayLabel;
    }
    if (initialsEl) {
      const source = isStudentSession() ? (currentSession.fullName || currentSession.username || 'ST') : meta.label;
      const parts = String(source).trim().split(/\s+/);
      const letters = parts.length >= 2
        ? (parts[0][0] + parts[1][0])
        : String(source).slice(0, 2);
      initialsEl.textContent = letters.toUpperCase();
    }
    if (userBadgeBtn) {
      userBadgeBtn.className = 'btn-tactile whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ' +
        (meta.badgeClass || 'glass-panel');
    }

    refreshIcons();
  }

  function isOpenSignupEnabled() {
    if (Sync && Sync.isServerMode() && typeof Sync.isOpenSignupAllowed === 'function') {
      return Sync.isOpenSignupAllowed();
    }
    return !(state && state.settings && state.settings.allowOpenSignup === false);
  }

  function applyLoginRoleUI() {
    document.querySelectorAll('[data-auth-role]').forEach(function (btn) {
      const active = btn.getAttribute('data-auth-role') === loginRoleSelection;
      btn.className = 'auth-role-btn py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ' +
        (active
          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white');
    });

    const isStudentRole = loginRoleSelection === 'student';
    const openSignup = isOpenSignupEnabled();
    if (!isStudentRole || !openSignup) {
      loginAuthMode = 'login';
    }
    const isSignup = isStudentRole && loginAuthMode === 'signup';
    const passwordOptional = isStudentRole && openSignup;

    if ($('studentAuthModeTabs')) {
      $('studentAuthModeTabs').classList.toggle('hidden', !(isStudentRole && openSignup));
    }
    if ($('stuAuthLoginModeBtn') && $('stuAuthSignupModeBtn')) {
      $('stuAuthLoginModeBtn').className = 'py-1.5 px-2 rounded-lg text-xs transition-all ' + (!isSignup
        ? 'font-extrabold bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
        : 'font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600');
      $('stuAuthSignupModeBtn').className = 'py-1.5 px-2 rounded-lg text-xs transition-all ' + (isSignup
        ? 'font-extrabold bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
        : 'font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600');
    }
    if ($('signupExtraWrap')) $('signupExtraWrap').classList.toggle('hidden', !isSignup);
    if ($('signupPwHint')) $('signupPwHint').classList.toggle('hidden', !passwordOptional);

    const userWrap = $('loginUsernameWrap');
    if (userWrap) {
      userWrap.classList.toggle('hidden', !isStudentRole);
    }
    if ($('loginUsernameLabel')) {
      $('loginUsernameLabel').textContent = isSignup
        ? 'Login (ixtiyoriy — bo‘sh qolsa ismdan yasaladi)'
        : (openSignup ? 'Ism-familiya yoki Login *' : 'O‘quvchi logini *');
    }
    if ($('loginUsernameInput')) {
      $('loginUsernameInput').placeholder = isSignup
        ? 'masalan: azizbek01 (yoki bo‘sh qoldiring)'
        : (openSignup ? 'masalan: Azizbek Aliyev yoki student1' : 'masalan: student1, ali, madina');
    }

    const roleMeta = Auth.ROLE_META[loginRoleSelection] || Auth.ROLE_META.student;
    if ($('loginPasswordInput')) {
      $('loginPasswordInput').required = !passwordOptional;
      $('loginPasswordInput').placeholder = passwordOptional
        ? 'Bo‘sh qoldirsa ham kiradi (yoki min 4 belgili kod)...'
        : 'Parolni kiriting...';
    }
    if ($('loginPasswordLabel')) {
      $('loginPasswordLabel').textContent = passwordOptional
        ? 'Shaxsiy kod / Parol (ixtiyoriy)'
        : (roleMeta.label + ' paroli *');
    }
    if ($('loginSubmitBtn')) {
      $('loginSubmitBtn').textContent = isStudentRole
        ? (isSignup ? 'Profil ochish va kirish' : (openSignup ? 'Darsga kirish' : 'O‘quvchi sifatida kirish'))
        : (roleMeta.label + ' sifatida kirish');
    }
  }

  function applyAuthGateUI() {
    const isLoggedIn = Boolean(
      currentSession &&
      (Auth.isAdminRole(currentSession.role) || (currentSession.role === 'student' && currentSession.userId))
    );

    if ($('view-login')) $('view-login').classList.toggle('hidden', isLoggedIn);
    if ($('appHeader')) $('appHeader').classList.toggle('hidden', !isLoggedIn);
    if ($('appMain')) $('appMain').classList.toggle('hidden', !isLoggedIn);
    applySyncBadgeUI();

    if (!isLoggedIn) {
      currentRole = 'guest';
      stopHeartbeat();
      applyLoginRoleUI();
      if ($('loginPasswordInput')) $('loginPasswordInput').value = '';
      if ($('loginErrorBox')) {
        $('loginErrorBox').classList.add('hidden');
        $('loginErrorBox').textContent = '';
      }
      refreshIcons();
      return;
    }

    currentRole = currentSession.role;
    applyRoleUI();
    syncDeckSelects();
    if (isStudentSession()) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }

  function recordAudit(action, detail) {
    state.auditLog = Auth.appendAuditLog(state.auditLog, currentRole, action, detail, Date.now());
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const role = loginRoleSelection;
    const username = $('loginUsernameInput') ? $('loginUsernameInput').value.trim() : '';
    const password = $('loginPasswordInput') ? $('loginPasswordInput').value : '';
    const errEl = $('loginErrorBox');
    const submitBtn = $('loginSubmitBtn');

    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const hasCustomServer = Boolean(Sync && typeof Sync.getServerBaseUrl === 'function' && Sync.getServerBaseUrl());
      if (Sync && !Sync.isServerMode() && (hasCustomServer || (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:'))) {
        await Sync.detectServer();
        applySyncBadgeUI();
      }
      const openSignup = isOpenSignupEnabled();
      const isSignup = role === 'student' && loginAuthMode === 'signup';
      let nextSession = null;

      if (role === 'student' && (isSignup || openSignup)) {
        const fullName = $('signupFullNameInput') ? $('signupFullNameInput').value.trim() : '';
        const group = $('signupGroupInput') ? $('signupGroupInput').value.trim() : '';
        const effectiveUsername = username || fullName;

        if (Sync && Sync.isServerMode() && typeof Sync.joinStudentRemote === 'function') {
          try {
            const joinRes = await Sync.joinStudentRemote({
              username: effectiveUsername,
              fullName: isSignup ? fullName : '',
              group: isSignup ? group : '',
              password: password
            });
            mergeRemoteState(joinRes.state);
            nextSession = Auth.setSession(joinRes.session);
          } catch (joinErr) {
            if (joinErr && $('loginPasswordInput') && !password) {
              $('loginPasswordInput').focus();
            }
            throw joinErr;
          }
        } else {
          state = Storage.loadState();
          const localJoin = Auth.joinOrAuthenticateStudent({
            students: state.students,
            username: effectiveUsername,
            fullName: isSignup ? fullName : '',
            group: isSignup ? group : '',
            password: password,
            allowOpenSignup: !(state.settings && state.settings.allowOpenSignup === false),
            enforceRateLimit: true,
            rateLimitStore: typeof localStorage !== 'undefined' ? localStorage : null,
            now: Date.now()
          });
          if (!localJoin.ok) {
            if (localJoin.needsPassword && $('loginPasswordInput') && !password) {
              $('loginPasswordInput').focus();
            }
            throw new Error(localJoin.error || 'Kirishda xatolik yuz berdi.');
          }
          state.students = localJoin.students;
          state.studentProgress = Storage.ensureStudentProgress(state, localJoin.session.userId, Date.now());
          state = Storage.recordStudentEvent(state, localJoin.session, {
            type: localJoin.mode === 'created' ? 'REGISTER' : 'LOGIN',
            view: 'dashboard',
            detail: localJoin.mode === 'created' ? 'Tezkor qo‘shilib kirdi' : 'Tizimga kirdi'
          }, Date.now());
          nextSession = Auth.setSession(localJoin.session);
          persist(localJoin.mode === 'created' ? 'students' : 'login');
        }
        if ($('signupFullNameInput')) $('signupFullNameInput').value = '';
        if ($('signupGroupInput')) $('signupGroupInput').value = '';
        loginAuthMode = 'login';
      } else if (Sync && Sync.isServerMode()) {
        const res = await Sync.loginRemote({ role: role, username: username, password: password });
        mergeRemoteState(res.state);
        nextSession = Auth.setSession(res.session);
      } else {
        state = Storage.loadState();
        const authRes = Auth.authenticate({
          authState: state.auth,
          students: state.students,
          role: role,
          username: username,
          password: password,
          enforceRateLimit: true,
          rateLimitStore: typeof localStorage !== 'undefined' ? localStorage : null
        });
        if (!authRes.ok) {
          const hint = ' (Hozir Local rejimda: boshqa qurilmadagi parollar uchun Node server orqali kiring.)';
          throw new Error((authRes.error || 'Login yoki parol noto‘g‘ri!') + (authRes.rateLimited ? '' : hint));
        }
        nextSession = Auth.setSession(authRes.session);
        currentSession = nextSession;
        currentRole = nextSession.role;
        if (nextSession.role === 'student') {
          state = Storage.recordStudentEvent(state, nextSession, {
            type: 'LOGIN',
            view: 'dashboard',
            detail: 'Tizimga kirdi'
          }, Date.now());
        } else {
          recordAudit('LOGIN', Auth.ROLE_META[nextSession.role].label + ' sifatida tizimga kirdi');
        }
        persist('login');
      }

      currentSession = nextSession;
      currentRole = nextSession.role;
      applyAuthGateUI();
      setListeningType('quiz');
      if (isExamActivelyProctored()) {
        currentStudyMode = 'exam';
        switchView('study');
      } else {
        currentStudyMode = 'flashcards';
        switchView(isStaff() ? 'monitor' : 'dashboard');
      }
      showToast('Xush kelibsiz, ' + nextSession.fullName + '!', 'success');
    } catch (err) {
      if (errEl) {
        errEl.textContent = (err && err.message) || 'Kirishda xatolik yuz berdi.';
        errEl.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function handleLogout() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
    resetAllStudyRuntimeSessions();
    activeDeck = 'ALL';
    activeLesson = 'ALL';
    studyScope = 'due';
    currentStudyMode = 'flashcards';
    stopHeartbeat();
    const prevSession = currentSession;
    const prevRole = currentRole;

    if (Sync && Sync.isServerMode()) {
      await Sync.logoutRemote();
    } else if (prevSession) {
      if (prevSession.role === 'student') {
        state = Storage.recordStudentEvent(state, prevSession, {
          type: 'LOGOUT',
          detail: 'Tizimdan chiqdi'
        }, Date.now());
      } else {
        state.auditLog = Auth.appendAuditLog(
          state.auditLog,
          prevRole,
          'LOGOUT',
          (Auth.ROLE_META[prevRole] || {}).label + ' sessiyani yopdi',
          Date.now()
        );
      }
      persist('logout');
    }

    currentSession = Auth.setSession(null);
    currentRole = 'guest';
    closeAllModals();
    applyAuthGateUI();
    showToast('Tizimdan muvaffaqiyatli chiqdingiz.', 'info');
  }

  /* ==================== TEACHER LIVE STUDENT MONITORING ==================== */

  function presenceBadgeMeta(presence, active) {
    if (active === false) {
      return {
        label: 'Bloklangan',
        dotClass: 'bg-rose-500',
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30'
      };
    }
    if (presence === 'online') {
      return {
        label: 'Online',
        dotClass: 'bg-emerald-500 animate-pulse',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30'
      };
    }
    if (presence === 'recent') {
      return {
        label: 'Yaqinda',
        dotClass: 'bg-amber-500',
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30'
      };
    }
    return {
      label: 'Oflayn',
      dotClass: 'bg-slate-400',
      badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
    };
  }

  function renderMonitorView() {
    if (!Auth.canMonitorStudents(currentRole)) {
      switchView('dashboard');
      return;
    }

    const now = Date.now();
    const isSrv = Boolean(Sync && Sync.isServerMode());
    refreshPhoneJoinButtonUI();
    if ($('monitorLivePill')) {
      $('monitorLivePill').innerHTML =
        '<span class="w-2 h-2 rounded-full ' + (isSrv ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500') + '"></span>' +
        '<span>' + (isSrv ? 'Real-Time SSE ulangan' : 'Local Multi-Tab Sync') + '</span>';
    }

    const students = Array.isArray(state.students) ? state.students : [];
    const summaries = students.map(function (s) {
      return Storage.getStudentSummary(state, s, now);
    });

    const onlineCount = summaries.filter(function (x) { return x.presence === 'online'; }).length;
    const todayTotal = summaries.reduce(function (acc, x) { return acc + x.todayReviewed; }, 0);
    const avgMastery = summaries.length > 0
      ? Math.round(summaries.reduce(function (acc, x) { return acc + x.masteryPct; }, 0) / summaries.length)
      : 0;

    if ($('monTotalStudents')) $('monTotalStudents').textContent = String(summaries.length);
    if ($('monOnlineStudents')) $('monOnlineStudents').textContent = String(onlineCount);
    if ($('monTodayReviews')) $('monTodayReviews').textContent = String(todayTotal);
    if ($('monAvgMastery')) $('monAvgMastery').textContent = avgMastery + '%';

    const cheatingLockedList = summaries.filter(function (x) {
      return x.finalExam && x.finalExam.status === 'cheating_locked';
    });
    const cheatingBanner = $('monitorCheatingBanner');
    const cheatingListEl = $('monitorCheatingList');
    if (cheatingBanner && cheatingListEl) {
      if (cheatingLockedList.length === 0) {
        cheatingBanner.classList.add('hidden');
        cheatingListEl.innerHTML = '';
      } else {
        cheatingBanner.classList.remove('hidden');
        cheatingListEl.innerHTML = '';
        cheatingLockedList.forEach(function (item) {
          const st = item.student;
          const ex = item.finalExam;
          const lastReason = (ex.cheatingFlags && ex.cheatingFlags[ex.cheatingFlags.length - 1] && ex.cheatingFlags[ex.cheatingFlags.length - 1].reason) || 'Qoidabuzarlik';
          const row = document.createElement('div');
          row.className = 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-rose-300/60 dark:border-rose-500/30';
          row.innerHTML =
            '<div class="min-w-0">' +
              '<p class="text-xs sm:text-sm font-extrabold text-rose-800 dark:text-rose-200">' + escapeHtml(st.fullName) + ' <span class="font-mono text-xs">@' + escapeHtml(st.username) + '</span> · CHEATING (' + ex.warningsCount + ' ta ogohlantirish)</p>' +
              '<p class="text-[11px] text-rose-700/85 dark:text-rose-300/85 truncate">Oxirgi sabab: ' + escapeHtml(lastReason) + '</p>' +
            '</div>' +
            '<div class="flex items-center gap-2 shrink-0">' +
              '<button type="button" data-cheat-detail class="btn-tactile px-2.5 py-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-xs font-bold">Batafsil</button>' +
              '<button type="button" data-cheat-approve class="btn-tactile px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold">Qayta topshirishga ruxsat</button>' +
            '</div>';
          row.querySelector('[data-cheat-detail]').addEventListener('click', function () {
            openStudentDetailModal(st.id);
          });
          row.querySelector('[data-cheat-approve]').addEventListener('click', function () {
            approveStudentExamRetake(st);
          });
          cheatingListEl.appendChild(row);
        });
      }
    }

    // Populate group & feed filters keeping selection
    const groupSel = $('monitorGroupFilter');
    if (groupSel) {
      const prevG = groupSel.value || 'ALL';
      const groups = Array.from(new Set(students.map(function (s) { return s.group || 'General'; }))).sort();
      groupSel.innerHTML = '<option value="ALL">Barcha guruhlar</option>';
      groups.forEach(function (g) {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        groupSel.appendChild(opt);
      });
      groupSel.value = groups.indexOf(prevG) !== -1 ? prevG : 'ALL';
    }

    const feedFilterSel = $('monitorFeedStudentFilter');
    if (feedFilterSel) {
      const prevF = feedFilterSel.value || 'ALL';
      feedFilterSel.innerHTML = '<option value="ALL">Barcha o‘quvchilar</option>';
      students.forEach(function (s) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.fullName + ' (@' + s.username + ')';
        feedFilterSel.appendChild(opt);
      });
      feedFilterSel.value = students.some(function (s) { return s.id === prevF; }) ? prevF : 'ALL';
    }

    const searchQ = ($('monitorSearchInput') ? $('monitorSearchInput').value : '').trim().toLowerCase();
    const groupVal = ($('monitorGroupFilter') && $('monitorGroupFilter').value) || 'ALL';
    const presVal = ($('monitorPresenceFilter') && $('monitorPresenceFilter').value) || 'ALL';

    const filtered = summaries.filter(function (x) {
      if (groupVal !== 'ALL' && (x.student.group || 'General') !== groupVal) return false;
      if (presVal !== 'ALL' && x.presence !== presVal) return false;
      if (searchQ) {
        const hay = (x.student.fullName + ' ' + x.student.username + ' ' + (x.student.group || '')).toLowerCase();
        if (hay.indexOf(searchQ) === -1) return false;
      }
      return true;
    });

    const grid = $('monitorStudentsGrid');
    if (grid) {
      grid.innerHTML = '';
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="md:col-span-2 xl:col-span-3 glass-panel rounded-3xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">Filtr bo‘yicha o‘quvchi topilmadi.</div>';
      } else {
        filtered.forEach(function (item) {
          const s = item.student;
          const live = item.liveStatus || {};
          const pMeta = presenceBadgeMeta(item.presence, s.active);
          const examMeta = getExamStatusMeta(item.finalExam);
          const examStatus = (item.finalExam && item.finalExam.status) || 'not_started';
          const canApproveExam = examStatus === 'cheating_locked' || examStatus === 'completed';
          const curLocation = [live.currentView, live.currentMode, live.currentWord].filter(Boolean).join(' · ');

          const card = document.createElement('div');
          card.className = 'glass-panel rounded-3xl p-5 flex flex-col justify-between gap-4 border ' +
            (examStatus === 'cheating_locked'
              ? 'border-rose-500/70 dark:border-rose-500/60 hover:border-rose-500'
              : 'border-slate-200/70 dark:border-slate-800/80 hover:border-indigo-400/60') +
            ' transition-all cursor-pointer';
          card.innerHTML =
            '<div class="flex items-start justify-between gap-3">' +
              '<div class="min-w-0">' +
                '<div class="flex items-center gap-2">' +
                  '<h3 class="font-extrabold text-base truncate">' + escapeHtml(s.fullName) + '</h3>' +
                '</div>' +
                '<p class="text-xs text-slate-500 dark:text-slate-400 font-semibold">@' + escapeHtml(s.username) + ' · ' + escapeHtml(s.group || 'General') + '</p>' +
              '</div>' +
              '<span class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ' + pMeta.badgeClass + '">' +
                '<span class="w-1.5 h-1.5 rounded-full ' + pMeta.dotClass + '"></span>' +
                escapeHtml(pMeta.label) +
              '</span>' +
            '</div>' +
            '<div class="flex items-center justify-between gap-2">' +
              '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ' + examMeta.badgeClass + '">' +
                '<span class="w-1.5 h-1.5 rounded-full ' + examMeta.dotClass + '"></span>' +
                escapeHtml(examMeta.label) +
              '</span>' +
              (canApproveExam
                ? '<button type="button" data-card-approve-exam class="btn-tactile px-2.5 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 text-[11px] font-extrabold">Qayta ruxsat</button>'
                : '') +
            '</div>' +
            '<div class="p-3 rounded-2xl bg-white/55 dark:bg-slate-900/55 border border-slate-200/60 dark:border-slate-800/70 space-y-1">' +
              '<div class="flex items-center justify-between text-[11px] font-bold text-slate-400">' +
                '<span>Joriy faoliyat</span>' +
                '<span>' + escapeHtml(formatRelativeTime(live.lastSeenAt, now)) + '</span>' +
              '</div>' +
              '<p class="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-2">' + escapeHtml(live.currentAction || 'Hali mashq boshlamagan') + '</p>' +
              (curLocation ? '<p class="text-[11px] font-mono text-indigo-600 dark:text-indigo-300 truncate">' + escapeHtml(curLocation) + '</p>' : '') +
            '</div>' +
            '<div class="space-y-2">' +
              '<div class="flex items-center justify-between text-xs font-bold">' +
                '<span class="text-slate-500 dark:text-slate-400">O‘zlashtirish</span>' +
                '<span>' + item.masteryPct + '% (' + item.masteredCount + '/' + item.totalWords + ')</span>' +
              '</div>' +
              '<div class="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">' +
                '<div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500" style="width: ' + item.masteryPct + '%"></div>' +
              '</div>' +
            '</div>' +
            '<div class="grid grid-cols-3 gap-2 text-center text-xs">' +
              '<div class="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-800/60"><p class="text-[10px] text-slate-500 font-bold">Bugun</p><p class="font-extrabold">' + item.todayReviewed + '</p></div>' +
              '<div class="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-800/60"><p class="text-[10px] text-slate-500 font-bold">Seriya</p><p class="font-extrabold">' + item.streakCount + ' kun</p></div>' +
              '<div class="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-800/60"><p class="text-[10px] text-slate-500 font-bold">Aniqlik</p><p class="font-extrabold">' + (item.accuracyPct !== null ? item.accuracyPct + '%' : '—') + '</p></div>' +
            '</div>' +
            '<button type="button" data-open-stu="' + escapeHtml(s.id) + '" class="btn-tactile w-full py-2 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold flex items-center justify-center gap-1.5">' +
              '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Batafsil ko‘rish' +
            '</button>';

          const approveBtn = card.querySelector('[data-card-approve-exam]');
          if (approveBtn) {
            approveBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              approveStudentExamRetake(s);
            });
          }
          card.addEventListener('click', function () {
            openStudentDetailModal(s.id);
          });
          grid.appendChild(card);
        });
      }
    }

    // Live Activity Feed
    const feedEl = $('monitorActivityFeed');
    if (feedEl) {
      const selectedStudentId = ($('monitorFeedStudentFilter') && $('monitorFeedStudentFilter').value) || 'ALL';
      const rawLogs = Array.isArray(state.studentActivityLog) ? state.studentActivityLog : [];
      const feedLogs = rawLogs.filter(function (entry) {
        return selectedStudentId === 'ALL' || entry.studentId === selectedStudentId;
      }).slice(0, 60);

      if (feedLogs.length === 0) {
        feedEl.innerHTML = '<div class="p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">Hozircha o‘quvchi faoliyati qayd etilmagan. O‘quvchi tizimga kirib so‘z yoki test yechganda bu yerda jonli ko‘rinadi.</div>';
      } else {
        feedEl.innerHTML = feedLogs.map(function (entry) {
          const timeStr = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          let statusBadge = '';
          if (entry.isCorrect === true) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">To‘g‘ri</span>';
          } else if (entry.isCorrect === false) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-700 dark:text-rose-300">Takror</span>';
          }
          return '<div class="flex items-start justify-between gap-3 p-3 rounded-2xl bg-white/55 dark:bg-slate-900/55 border border-slate-200/60 dark:border-slate-800/70">' +
            '<div class="min-w-0 space-y-0.5">' +
              '<div class="flex flex-wrap items-center gap-1.5">' +
                '<span class="font-extrabold text-xs text-indigo-600 dark:text-indigo-300">' + escapeHtml(entry.fullName) + ' (@' + escapeHtml(entry.username) + ')</span>' +
                '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">' + escapeHtml(entry.type) + '</span>' +
                statusBadge +
              '</div>' +
              '<p class="text-xs text-slate-700 dark:text-slate-200 break-words">' + escapeHtml(entry.detail || entry.word || 'Faoliyat') + '</p>' +
            '</div>' +
            '<span class="shrink-0 text-[11px] text-slate-400 font-mono">' + escapeHtml(timeStr) + '</span>' +
          '</div>';
        }).join('');
      }
    }

    refreshIcons();
  }

  function openStudentDetailModal(studentId, isLiveRefresh) {
    const student = (state.students || []).find(function (s) { return s.id === studentId; });
    if (!student) {
      if (isLiveRefresh) closeStudentDetailModal();
      return;
    }
    selectedMonitorStudentId = student.id;

    const now = Date.now();
    const summary = Storage.getStudentSummary(state, student, now);
    const pMeta = presenceBadgeMeta(summary.presence, student.active);

    if ($('stuModalName')) $('stuModalName').textContent = student.fullName;
    if ($('stuModalPresence')) {
      $('stuModalPresence').className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold border ' + pMeta.badgeClass;
      $('stuModalPresence').innerHTML = '<span class="w-1.5 h-1.5 rounded-full ' + pMeta.dotClass + '"></span>' + escapeHtml(pMeta.label);
    }
    if ($('stuModalMeta')) {
      $('stuModalMeta').textContent = '@' + student.username + ' · Guruh: ' + (student.group || 'General') +
        ' · Oxirgi faollik: ' + formatRelativeTime(summary.liveStatus && summary.liveStatus.lastSeenAt, now);
    }

    if ($('stuModalStatsRow')) {
      const m = summary.modeStats || {};
      $('stuModalStatsRow').innerHTML =
        '<div class="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"><p class="text-[11px] text-slate-500 font-bold">Mastered</p><p class="text-lg font-extrabold text-emerald-600 dark:text-emerald-300">' + summary.masteredCount + ' / ' + summary.totalWords + ' (' + summary.masteryPct + '%)</p></div>' +
        '<div class="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"><p class="text-[11px] text-slate-500 font-bold">Bugun / Seriya</p><p class="text-lg font-extrabold">' + summary.todayReviewed + ' ta · ' + summary.streakCount + ' kun 🔥</p></div>' +
        '<div class="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"><p class="text-[11px] text-slate-500 font-bold">Testlar aniqligi</p><p class="text-lg font-extrabold">' + (summary.accuracyPct !== null ? summary.accuracyPct + '%' : '—') + '</p></div>' +
        '<div class="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"><p class="text-[11px] text-slate-500 font-bold">Rejimlar (F/Q/W/L)</p><p class="text-sm font-extrabold mt-0.5">' + (m.flashcardsReviewed || 0) + ' / ' + (m.quizTotal || 0) + ' / ' + (m.writingTotal || 0) + ' / ' + (m.listeningTotal || 0) + '</p></div>';
    }

    const exam = Exam.normalizeExamRecord(summary.finalExam);
    const examMeta = getExamStatusMeta(exam);
    if ($('stuModalExamBadge')) {
      $('stuModalExamBadge').className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ' + examMeta.badgeClass;
      $('stuModalExamBadge').innerHTML = '<span class="w-1.5 h-1.5 rounded-full ' + examMeta.dotClass + '"></span>' + escapeHtml(examMeta.label);
    }
    if ($('stuModalApproveRetakeBtn')) {
      const canResetExam = exam.status === 'cheating_locked' || exam.status === 'completed';
      $('stuModalApproveRetakeBtn').classList.toggle('hidden', !canResetExam);
      $('stuModalApproveRetakeBtn').onclick = function () {
        approveStudentExamRetake(student);
      };
    }
    if ($('stuModalExamSummary')) {
      if (exam.status === 'not_started') {
        $('stuModalExamSummary').textContent = 'O‘quvchi hali Yakuniy Yopiq Testni boshlamagan.' +
          (exam.retakeApprovedAt ? ' (Ustoz ruxsati berilgan: ' + new Date(exam.retakeApprovedAt).toLocaleString() + ')' : '');
      } else {
        $('stuModalExamSummary').textContent =
          'Natija: ' + exam.correctCount + ' / ' + exam.totalQuestions +
          ' (' + (exam.scorePct !== null ? exam.scorePct + '%' : '0%') + ')' +
          ' · Javoblar: ' + exam.answeredCount + ' / ' + exam.totalQuestions +
          ' · Ogohlantirishlar: ' + exam.warningsCount + ' / ' + Exam.MAX_WARNINGS +
          (exam.finishedAt ? ' · Yakunlangan: ' + new Date(exam.finishedAt).toLocaleTimeString() : '');
      }
    }
    if ($('stuModalExamFlags')) {
      const flags = Array.isArray(exam.cheatingFlags) ? exam.cheatingFlags : [];
      if (flags.length === 0) {
        $('stuModalExamFlags').classList.add('hidden');
        $('stuModalExamFlags').innerHTML = '';
      } else {
        $('stuModalExamFlags').classList.remove('hidden');
        $('stuModalExamFlags').innerHTML = '<p class="text-[11px] font-extrabold text-rose-600 dark:text-rose-300 uppercase tracking-wider">Qoidabuzarliklar tarixi:</p>' +
          flags.map(function (f) {
            return '<div class="flex items-start justify-between gap-2 p-2 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs">' +
              '<span class="font-bold text-rose-700 dark:text-rose-200">#' + escapeHtml(String(f.warningNumber || '?')) + ': ' + escapeHtml(f.reason || 'Qoidabuzarlik') + '</span>' +
              '<span class="shrink-0 text-[10px] font-mono text-slate-400">' + (f.timestamp ? escapeHtml(new Date(f.timestamp).toLocaleTimeString()) : '') + '</span>' +
            '</div>';
          }).join('');
      }
    }
    if ($('stuModalExamAnswers')) {
      const answers = Array.isArray(exam.answers) ? exam.answers : [];
      $('stuModalExamAnswers').innerHTML = answers.length === 0
        ? ''
        : answers.map(function (a, idx) {
            return '<div class="flex items-start justify-between gap-2 p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">' +
              '<div class="min-w-0">' +
                '<span class="font-extrabold">' + (idx + 1) + '. ' + escapeHtml(a.word) + '</span> ' +
                '<span class="text-slate-600 dark:text-slate-300">→ <strong>' + escapeHtml(a.userAnswer || '—') + '</strong></span> ' +
                '<span class="text-slate-400">(To‘g‘risi: ' + escapeHtml(a.expectedTranslation) + ')</span>' +
              '</div>' +
              '<span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ' + (a.isCorrect
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30') + '">' +
                (a.isCorrect ? 'To‘g‘ri' : 'Xato') +
              '</span>' +
            '</div>';
          }).join('');
    }

    const stuWords = Storage.getWordsForSession(state, { role: 'student', userId: student.id }, now).slice().sort(function (a, b) {
      return (b.lastReviewedAt || 0) - (a.lastReviewedAt || 0);
    });
    if ($('stuModalWordsList')) {
      $('stuModalWordsList').innerHTML = stuWords.slice(0, 40).map(function (w) {
        const meta = SRS.getStatusMeta(w);
        return '<div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">' +
          '<div class="min-w-0">' +
            '<span class="font-extrabold">' + escapeHtml(w.word) + '</span> ' +
            '<span class="text-slate-500 dark:text-slate-400">— ' + escapeHtml(w.translation) + '</span>' +
          '</div>' +
          '<span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ' + meta.badgeClass + '">' + escapeHtml(meta.label) + '</span>' +
        '</div>';
      }).join('');
    }

    const stuLogs = (state.studentActivityLog || []).filter(function (entry) {
      return entry.studentId === student.id;
    }).slice(0, 30);
    if ($('stuModalActivityList')) {
      $('stuModalActivityList').innerHTML = stuLogs.length === 0
        ? '<p class="text-xs text-slate-500 p-2">Hali amallar yo‘q.</p>'
        : stuLogs.map(function (entry) {
            return '<div class="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">' +
              '<div class="min-w-0">' +
                '<span class="font-extrabold text-indigo-600 dark:text-indigo-300">[' + escapeHtml(entry.type) + ']</span> ' +
                '<span>' + escapeHtml(entry.detail) + '</span>' +
              '</div>' +
              '<span class="shrink-0 text-[10px] text-slate-400 font-mono">' + escapeHtml(new Date(entry.timestamp).toLocaleTimeString()) + '</span>' +
            '</div>';
          }).join('');
    }

    if (!isLiveRefresh && $('studentDetailModal')) {
      $('studentDetailModal').classList.remove('hidden');
      refreshIcons();
    }
  }

  function closeStudentDetailModal() {
    selectedMonitorStudentId = null;
    if ($('studentDetailModal')) $('studentDetailModal').classList.add('hidden');
  }

  function updatePasswordMeter(password, barId, labelId, isStudentTarget) {
    const bar = $(barId);
    const label = $(labelId);
    if (!bar || !label) return;

    const pw = String(password || '');
    if (!pw) {
      bar.style.width = '0%';
      bar.className = 'pw-meter-fill bg-slate-300';
      label.textContent = isStudentTarget ? 'Kamida 4 belgi' : 'Kamida 8 belgi';
      label.className = 'text-[10px] font-bold text-slate-400 whitespace-nowrap';
      return;
    }

    const res = (isStudentTarget && typeof Auth.validateStudentPassword === 'function')
      ? Auth.validateStudentPassword(pw, false)
      : Auth.validatePasswordStrength(pw);
    const widths = { 1: '25%', 2: '50%', 3: '78%', 4: '100%' };
    const colors = {
      1: 'bg-rose-500',
      2: 'bg-amber-500',
      3: 'bg-sky-500',
      4: 'bg-emerald-500'
    };
    const textColors = {
      1: 'text-rose-500',
      2: 'text-amber-500',
      3: 'text-sky-600 dark:text-sky-400',
      4: 'text-emerald-600 dark:text-emerald-400'
    };
    bar.style.width = widths[res.score] || '25%';
    bar.className = 'pw-meter-fill ' + (colors[res.score] || 'bg-rose-500');
    label.textContent = res.label;
    label.className = 'text-[10px] font-bold whitespace-nowrap ' + (textColors[res.score] || 'text-rose-500');
  }

  function refreshPhoneJoinButtonUI() {
    const btn = $('copyPhoneJoinLinkBtn');
    const lbl = $('copyPhoneJoinLinkLabel');
    if (!btn || !lbl) return;
    const pubUrl = (Sync && typeof Sync.getPublicShareUrl === 'function') ? Sync.getPublicShareUrl() : '';
    if (pubUrl) {
      lbl.textContent = '4G/Wi-Fi Havolani Nusxalash';
      btn.title = pubUrl;
    } else if (Sync && Sync.isServerMode()) {
      lbl.textContent = 'Telefon havolasi';
      btn.title = 'O‘quvchilar telefonidan kirish havolasini olish';
    } else {
      lbl.textContent = 'Telefon havolasi (Server o‘chiq)';
      btn.title = 'Telefonlardan kirish uchun start-server.bat yoki bulutli serverni yoqing';
    }
  }

  async function handleCopyPhoneJoinLink() {
    let shareUrl = (Sync && typeof Sync.getPublicShareUrl === 'function') ? Sync.getPublicShareUrl() : '';
    if (!shareUrl && Sync && Sync.isServerMode() && typeof Sync.fetchPublicLinkRemote === 'function') {
      try {
        const info = await Sync.fetchPublicLinkRemote();
        if (info && info.publicUrl) {
          shareUrl = info.publicUrl;
        } else if (info && info.tunnelStatus === 'connecting') {
          showToast('Global 4G/5G HTTPS havola ulanmoqda... 3 soniyadan keyin qayta bosing!', 'info');
          refreshPhoneJoinButtonUI();
          return;
        }
      } catch (_) {}
    }

    if (!shareUrl) {
      showToast('Global HTTPS havola topilmadi. start-server.bat ni ishga tushiring yoki bulutga joylang!', 'warning');
      return;
    }

    refreshPhoneJoinButtonUI();
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {}
    }

    showToast(
      copied
        ? ('Telefon kirish havolasi nusxalandi: ' + shareUrl)
        : ('Telefon kirish havolasi: ' + shareUrl),
      'success'
    );
  }

  function openStudentResetPwModal(student) {
    if (!student || !Auth.canManageStudents(currentRole)) return;
    $('stuResetIdInput').value = student.id;
    $('stuResetTargetLabel').textContent = student.fullName + ' (@' + student.username + ')';
    $('stuResetNewPwInput').value = '';
    updatePasswordMeter('', 'stuResetPwMeterBar', 'stuResetPwMeterLabel');
    $('studentResetPwModal').classList.remove('hidden');
    $('stuResetNewPwInput').focus();
  }

  function closeStudentResetPwModal() {
    if ($('studentResetPwModal')) $('studentResetPwModal').classList.add('hidden');
    if ($('stuResetNewPwInput')) $('stuResetNewPwInput').value = '';
    updatePasswordMeter('', 'stuResetPwMeterBar', 'stuResetPwMeterLabel');
  }

  /* ==================== STAFF MANAGEMENT (STUDENTS, TXT+AI, SECURITY) ==================== */

  function renderOpenSignupToggle() {
    const toggleBtn = $('toggleOpenSignupBtn');
    const isOpen = isOpenSignupEnabled();

    if (toggleBtn) {
      toggleBtn.textContent = isOpen
        ? 'Ochiq ro‘yxatdan o‘tish: YOQILGAN (Hamma kira oladi)'
        : 'Ochiq ro‘yxatdan o‘tish: YOPILGAN';
      toggleBtn.className = 'btn-tactile shrink-0 px-3.5 py-2 rounded-xl text-xs font-extrabold text-white ' +
        (isOpen ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-600 hover:bg-slate-500');
    }
  }

  async function handleToggleOpenSignup() {
    if (!Auth.canManageStudents(currentRole)) {
      showToast('Ushbu sozlamani faqat Teacher yoki IT Manager o‘zgartira oladi.', 'error');
      return;
    }
    const nextVal = !isOpenSignupEnabled();
    try {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushStudentActionRemote({
          action: 'setOpenSignup',
          allowOpenSignup: nextVal
        });
        if (res && res.state) mergeRemoteState(res.state);
        await Sync.detectServer();
      } else {
        state.settings = Object.assign({}, state.settings || {}, { allowOpenSignup: nextVal });
        recordAudit('OPEN_SIGNUP', 'Ochiq ro‘yxatdan o‘tish ' + (nextVal ? 'yoqildi' : 'yopildi'));
        persist('students');
      }
      renderOpenSignupToggle();
      applyLoginRoleUI();
      showToast(
        nextVal ? 'Hamma o‘quvchilar uchun ochiq ro‘yxatdan o‘tish yoqildi!' : 'Ochiq ro‘yxatdan o‘tish vaqtincha yopildi.',
        nextVal ? 'success' : 'info'
      );
    } catch (err) {
      showToast((err && err.message) || 'Sozlamani saqlashda xatolik.', 'error');
    }
  }

  function renderAdminStudentsList() {
    renderOpenSignupToggle();
    const listEl = $('adminStudentsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const students = Array.isArray(state.students) ? state.students : [];
    if (students.length === 0) {
      listEl.innerHTML = '<div class="glass-panel rounded-3xl p-6 text-sm text-slate-500">Hali o‘quvchilar qo‘shilmagan.</div>';
      return;
    }

    const now = Date.now();
    students.forEach(function (s) {
      const summary = Storage.getStudentSummary(state, s, now);
      const pMeta = presenceBadgeMeta(summary.presence, s.active);
      const examMeta = getExamStatusMeta(summary.finalExam);
      const examStatus = (summary.finalExam && summary.finalExam.status) || 'not_started';
      const canResetExam = examStatus === 'cheating_locked' || examStatus === 'completed';

      const row = document.createElement('div');
      row.className = 'glass-panel rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-200/70 dark:border-slate-800/80';
      row.innerHTML =
        '<div class="min-w-0 space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<h4 class="font-extrabold text-sm sm:text-base">' + escapeHtml(s.fullName) + '</h4>' +
            '<span class="text-xs font-mono text-indigo-600 dark:text-indigo-300">@' + escapeHtml(s.username) + '</span>' +
            '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800">' + escapeHtml(s.group || 'General') + '</span>' +
            '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold border ' + pMeta.badgeClass + '">' +
              '<span class="w-1.5 h-1.5 rounded-full ' + pMeta.dotClass + '"></span>' + escapeHtml(pMeta.label) +
            '</span>' +
            '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold border ' + examMeta.badgeClass + '">' +
              '<span class="w-1.5 h-1.5 rounded-full ' + examMeta.dotClass + '"></span>' + escapeHtml(examMeta.label) +
            '</span>' +
          '</div>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400">O‘zlashtirish: <strong>' + summary.masteryPct + '%</strong> (' + summary.masteredCount + '/' + summary.totalWords + ') · Bugun: <strong>' + summary.todayReviewed + '</strong> · Seriya: <strong>' + summary.streakCount + ' kun</strong></p>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2 shrink-0">' +
          (canResetExam
            ? '<button type="button" data-stu-approve-exam="' + escapeHtml(s.id) + '" class="btn-tactile px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-extrabold">Qayta ruxsat</button>'
            : '') +
          '<button type="button" data-stu-watch="' + escapeHtml(s.id) + '" class="btn-tactile px-3 py-1.5 rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-bold">Kuzatish</button>' +
          '<button type="button" data-stu-resetpw="' + escapeHtml(s.id) + '" class="btn-tactile px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold">Parolni yangilash</button>' +
          '<button type="button" data-stu-toggle="' + escapeHtml(s.id) + '" class="btn-tactile px-3 py-1.5 rounded-xl ' + (s.active === false ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300') + ' text-xs font-bold">' + (s.active === false ? 'Faollashtirish' : 'Bloklash') + '</button>' +
          '<button type="button" data-stu-delete="' + escapeHtml(s.id) + '" class="btn-tactile px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1">' +
            '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>O‘chirish' +
          '</button>' +
        '</div>';

      const approveStuBtn = row.querySelector('[data-stu-approve-exam]');
      if (approveStuBtn) {
        approveStuBtn.addEventListener('click', function () {
          approveStudentExamRetake(s);
        });
      }
      row.querySelector('[data-stu-watch]').addEventListener('click', function () {
        switchView('monitor');
        openStudentDetailModal(s.id);
      });
      row.querySelector('[data-stu-resetpw]').addEventListener('click', function () {
        openStudentResetPwModal(s);
      });
      row.querySelector('[data-stu-toggle]').addEventListener('click', function () {
        handleToggleStudentActive(s);
      });
      row.querySelector('[data-stu-delete]').addEventListener('click', function () {
        deleteStudent(s);
      });

      listEl.appendChild(row);
    });
    refreshIcons();
  }

  async function handleStudentCreateSubmit(e) {
    e.preventDefault();
    if (!Auth.canManageStudents(currentRole)) {
      showToast('O‘quvchi qo‘shish uchun Teacher yoki IT Manager huquqi kerak.', 'error');
      return;
    }

    const payload = {
      fullName: $('stuFullNameInput').value.trim(),
      username: $('stuUsernameInput').value.trim(),
      group: $('stuGroupInput').value.trim() || 'General',
      password: $('stuPasswordInput').value
    };

    try {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushStudentActionRemote({ action: 'create', student: payload });
        mergeRemoteState(res.state);
      } else {
        const now = Date.now();
        const createdRes = Auth.createStudentAccount(state.students, currentRole, payload, now);
        state.students = createdRes.students;
        state.studentProgress = Storage.ensureStudentProgress(state, createdRes.created.id, now);
        recordAudit('STUDENT_ADD', createdRes.created.fullName + ' (@' + createdRes.created.username + ') qo‘shildi');
        persist('students');
      }

      $('studentCreateForm').reset();
      updatePasswordMeter('', 'stuPwMeterBar', 'stuPwMeterLabel');
      renderAdminStudentsList();
      showToast('Yangi o‘quvchi yaratildi: @' + Auth.normalizeUsername(payload.username), 'success');
    } catch (err) {
      showToast((err && err.message) || 'O‘quvchini yaratishda xatolik.', 'error');
    }
  }

  async function handleStudentResetPwSubmit(e) {
    e.preventDefault();
    const studentId = $('stuResetIdInput').value;
    const newPassword = $('stuResetNewPwInput').value;

    try {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushStudentActionRemote({
          action: 'resetPassword',
          studentId: studentId,
          newPassword: newPassword
        });
        mergeRemoteState(res.state);
      } else {
        state.students = Auth.resetStudentPassword(state.students, currentRole, studentId, newPassword);
        const resetStu = (state.students || []).find(function (s) { return s.id === studentId; });
        if (resetStu) {
          Auth.clearLoginFailures('student:' + Auth.normalizeUsername(resetStu.username), typeof localStorage !== 'undefined' ? localStorage : null);
        }
        recordAudit('STUDENT_PW_RESET', 'O‘quvchi paroli yangilandi: ' + studentId);
        persist('students');
      }
      closeStudentResetPwModal();
      renderAdminStudentsList();
      showToast('O‘quvchi paroli yangilandi!', 'success');
    } catch (err) {
      showToast((err && err.message) || 'Parolni yangilashda xatolik.', 'error');
    }
  }

  async function handleToggleStudentActive(student) {
    if (!student || !Auth.canManageStudents(currentRole)) return;
    try {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushStudentActionRemote({ action: 'toggleActive', studentId: student.id });
        mergeRemoteState(res.state);
      } else {
        state.students = Auth.toggleStudentActive(state.students, currentRole, student.id);
        recordAudit('STUDENT_STATUS', student.username + ' holati o‘zgartirildi');
        persist('students');
      }
      renderAdminStudentsList();
      showToast('"' + student.fullName + '" akkaunt holati yangilandi.', 'info');
    } catch (err) {
      showToast((err && err.message) || 'Holatni o‘zgartirishda xatolik.', 'error');
    }
  }

  function deleteStudent(student) {
    if (!student || !Auth.canManageStudents(currentRole)) return;
    openConfirm(
      'O‘quvchini o‘chirish',
      '"' + student.fullName + '" (@' + student.username + ') akkaunti va uning barcha o‘zlashtirish statistikasi butunlay o‘chiriladi. Davom etasizmi?',
      async function () {
        try {
          if (Sync && Sync.isServerMode()) {
            const res = await Sync.pushStudentActionRemote({ action: 'delete', studentId: student.id });
            mergeRemoteState(res.state);
          } else {
            const delRes = Auth.deleteStudentAccount(state.students, currentRole, student.id);
            state.students = delRes.students;
            if (state.studentProgress && delRes.deleted && delRes.deleted.id) {
              delete state.studentProgress[delRes.deleted.id];
            }
            if (Array.isArray(state.studentActivityLog) && delRes.deleted && delRes.deleted.id) {
              state.studentActivityLog = state.studentActivityLog.filter(function (ev) {
                return ev.studentId !== delRes.deleted.id;
              });
            }
            if (delRes.deleted && delRes.deleted.username) {
              Auth.clearLoginFailures('student:' + Auth.normalizeUsername(delRes.deleted.username), typeof localStorage !== 'undefined' ? localStorage : null);
            }
            recordAudit('STUDENT_DELETE', student.fullName + ' (@' + student.username + ') o‘chirildi');
            persist('students');
          }
          if (selectedMonitorStudentId === student.id) {
            closeStudentDetailModal();
          }
          renderAdminStudentsList();
          showToast('"' + student.fullName + '" o‘chirildi.', 'info');
        } catch (err) {
          showToast((err && err.message) || 'O‘quvchini o‘chirishda xatolik.', 'error');
        }
      }
    );
  }

  /* ----- TXT + AI Bulk Importer ----- */

  function getDefaultAiModel(provider) {
    const d = (AiTxt.PROVIDER_DEFAULTS && AiTxt.PROVIDER_DEFAULTS[provider]) || {};
    return d.defaultModel || d.model || 'deepseek-chat';
  }

  function hasSavedAiKey(cfg) {
    const c = cfg || state.aiConfig || {};
    return Boolean((c.apiKey && String(c.apiKey).trim()) || (Sync && Sync.isServerMode() && c.hasApiKey));
  }

  function renderTxtAiStatus() {
    const el = $('txtAiStatusIndicator');
    const ttsEl = $('txtTtsStatusIndicator');
    const secBadge = $('aiKeySecurityBadge');
    const ttsSecBadge = $('ttsKeySecurityBadge');
    const cfg = state.aiConfig || {};
    const ready = hasSavedAiKey(cfg);
    const canManageKey = Auth.canManageAiConfig(currentRole);
    const effectiveTts = Speech.resolveEffectiveTtsConfig(cfg, state.settings && state.settings.accent);
    const ttsReady = Boolean(Sync && Sync.isServerMode() && effectiveTts.provider !== 'browser' && effectiveTts.hasKey);

    if (el) {
      if (ready) {
        const defaults = (AiTxt.PROVIDER_DEFAULTS && AiTxt.PROVIDER_DEFAULTS[cfg.provider]) || {};
        const label = defaults.label || cfg.provider || 'AI';
        el.textContent = 'AI Tayyor (' + label + ' · ' + (cfg.model || getDefaultAiModel(cfg.provider)) + ')';
        el.className = 'font-bold text-emerald-600 dark:text-emerald-400';
      } else {
        el.textContent = canManageKey
          ? 'API Key kiritilmagan ("API Key Sozlamasi"dan kiriting)'
          : 'API Key kiritilmagan (IT Manager kiritishi kerak)';
        el.className = 'font-bold text-amber-600 dark:text-amber-400';
      }
    }

    if (ttsEl) {
      if (ttsReady) {
        const ttsPreset = (Speech.TTS_PROVIDER_DEFAULTS && Speech.TTS_PROVIDER_DEFAULTS[effectiveTts.provider]) || {};
        ttsEl.textContent = 'Ovoz: HD ' + (ttsPreset.label ? ttsPreset.label.split(' ')[0] : effectiveTts.provider.toUpperCase()) + ' API';
        ttsEl.className = 'text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300';
      } else {
        ttsEl.textContent = 'Ovoz: Brauzer Web Speech';
        ttsEl.className = 'text-[11px] font-bold text-slate-500 dark:text-slate-400';
      }
    }

    if (secBadge) {
      if (!canManageKey) {
        secBadge.textContent = 'Faqat IT Manager uchun';
        secBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      } else if (Sync && Sync.isServerMode() && cfg.hasApiKey) {
        secBadge.textContent = 'Server proxy · Kalit himoyalangan (' + (cfg.apiKeyMasked || 'sk-••••') + ')';
        secBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
      } else if (cfg.apiKey && String(cfg.apiKey).trim()) {
        secBadge.textContent = 'Faol · Tayyor';
        secBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
      } else {
        secBadge.textContent = 'Kalit kiritilmagan';
        secBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      }
    }

    if (ttsSecBadge) {
      if (!canManageKey) {
        ttsSecBadge.textContent = 'Faqat IT Manager uchun';
        ttsSecBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      } else if (ttsReady) {
        const keyInfo = cfg.ttsApiKeyMasked
          ? ('Alohida kalit: ' + cfg.ttsApiKeyMasked)
          : (effectiveTts.sharesPrimaryAiKey ? 'Asosiy API kalitdan' : 'Server TTS kalit himoyalangan');
        ttsSecBadge.textContent = 'HD TTS Faol (' + effectiveTts.provider.toUpperCase() + ' · ' + keyInfo + ')';
        ttsSecBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300';
      } else {
        ttsSecBadge.textContent = effectiveTts.provider === 'browser' ? 'Brauzer ovozi (0 API)' : 'TTS kalit kutilmoqda -> Brauzer fallback';
        ttsSecBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      }
    }
  }

  function resolveTxtTargetLesson() {
    const sel = $('txtTargetLessonSelect');
    if (!sel) return '1-dars: Academic Foundations';
    if (sel.value === '__CUSTOM__') {
      return $('txtCustomLessonInput').value.trim() || 'Yangi darslik';
    }
    if (sel.value === 'AUTO') {
      return (state.lessons && state.lessons[0] && state.lessons[0].name) || '1-dars: Academic Foundations';
    }
    return sel.value;
  }

  function loadTxtFiles(fileList) {
    const files = Array.from(fileList || []).filter(function (f) {
      return !f.name || /\.txt$/i.test(f.name) || (f.type && f.type.indexOf('text') === 0);
    });
    if (files.length === 0) {
      showToast('Faqat .txt formatidagi matn fayllarini yuklang!', 'warning');
      return;
    }

    if ($('txtSelectedFilesLabel')) {
      $('txtSelectedFilesLabel').textContent = files.map(function (f) { return f.name; }).join(', ');
    }

    Promise.all(files.map(function (file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
          resolve({ name: file.name, content: String(reader.result || '') });
        };
        reader.onerror = function () {
          reject(new Error(file.name + ' o‘qilmadi'));
        };
        reader.readAsText(file, 'utf-8');
      });
    })).then(function (results) {
      const combined = results.map(function (r) {
        const trimmed = r.content.trim();
        const hasHeader = /^(?:#{1,3}\s+|={2,}|\d+\s*[-.]?\s*dars|lesson\s+\d+|unit\s+\d+)/im.test(trimmed);
        if (hasHeader) return trimmed;
        const fallbackTitle = r.name.replace(/\.txt$/i, '').trim();
        return '# ' + fallbackTitle + '\n' + trimmed;
      }).join('\n\n');

      $('txtRawInput').value = combined;
      runTxtParseOnly();
      showToast(files.length + ' ta .txt fayl yuklandi va tahlil qilindi.', 'success');
    }).catch(function (err) {
      showToast('TXT faylni o‘qishda xatolik: ' + err.message, 'error');
    });
  }

  function handleTxtFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    loadTxtFiles(files);
  }

  function buildQuickParsedPreview(rawText) {
    const selVal = $('txtTargetLessonSelect').value;
    const defaultLesson = resolveTxtTargetLesson();
    const forcedLesson = selVal !== 'AUTO' ? defaultLesson : null;
    const forcedCategory = $('txtTargetCategorySelect').value !== 'AUTO'
      ? $('txtTargetCategorySelect').value
      : 'AUTO';

    const parsed = AiTxt.parseRawTxtVocabulary(rawText, defaultLesson);
    const plan = AiTxt.planAiEnrichment(parsed.entries, {
      existingWords: state.words,
      forcedCategory: forcedCategory,
      forcedLesson: forcedLesson || 'AUTO'
    });

    return parsed.entries.map(function (entry, idx) {
      const reused = plan.resolvedByIndex[idx];
      if (reused) {
        return Object.assign({ selected: true }, reused);
      }
      return {
        selected: true,
        word: entry.word,
        phonetic: entry.phonetic || '',
        partOfSpeech: 'word',
        translation: entry.translation || '',
        definition: '',
        examples: [],
        synonyms: [],
        antonyms: [],
        mnemonic: '',
        category: forcedCategory !== 'AUTO' ? forcedCategory : 'IELTS',
        lesson: forcedLesson || entry.lesson || defaultLesson,
        level: 'B2'
      };
    });
  }

  function runTxtParseOnly() {
    const rawText = $('txtRawInput').value.trim();
    if (!rawText) {
      showToast('Avval .txt fayl yuklang yoki matn kiriting!', 'warning');
      return;
    }

    txtPreviewItems = buildQuickParsedPreview(rawText);
    if (txtPreviewItems.length === 0) {
      showToast('Matndan birorta ham so‘z ajratib bo‘lmadi.', 'warning');
      $('txtPreviewWrap').classList.add('hidden');
      return;
    }

    renderTxtPreview();
    showToast(txtPreviewItems.length + ' ta so‘z tezkor parse qilindi.', 'info');
  }

  async function runTxtAiEnrich() {
    if ($('txtAiEnrichBtn') && $('txtAiEnrichBtn').disabled) return;
    const rawText = $('txtRawInput').value.trim();
    if (!rawText) {
      showToast('Avval .txt fayl yuklang yoki matn kiriting!', 'warning');
      return;
    }

    const defaultLesson = resolveTxtTargetLesson();
    const parsed = AiTxt.parseRawTxtVocabulary(rawText, defaultLesson);
    if (parsed.entries.length === 0) {
      showToast('Matnda ajratiladigan so‘z topilmadi.', 'warning');
      return;
    }

    const forcedLesson = $('txtTargetLessonSelect').value !== 'AUTO' ? defaultLesson : 'AUTO';
    const forcedCategory = $('txtTargetCategorySelect').value || 'AUTO';
    const plan = AiTxt.planAiEnrichment(parsed.entries, {
      existingWords: state.words,
      forcedCategory: forcedCategory,
      forcedLesson: forcedLesson
    });

    // Zero API calls when every word is already in DB or lexicon cache!
    if (plan.missingEntries.length === 0) {
      txtPreviewItems = plan.resolvedByIndex.filter(Boolean).map(function (item) {
        return Object.assign({ selected: true }, item);
      });
      renderTxtPreview();
      showToast(txtPreviewItems.length + ' ta so‘z bazadan/keshdan olindi — 0 ta AI so‘rovi!', 'success');
      return;
    }

    const cfg = state.aiConfig || {};
    if (!hasSavedAiKey(cfg)) {
      if (Auth.canManageAiConfig(currentRole)) {
        showToast('AI bilan boyitish uchun avval "API Key Sozlamasi" bo‘limida kalit kiriting!', 'warning');
        if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.remove('hidden');
        if ($('aiApiKeyInput')) $('aiApiKeyInput').focus();
      } else {
        showToast('AI API kaliti kiritilmagan! IT Manager sozlamalar bo‘limida kiritishi kerak.', 'warning');
      }
      return;
    }

    const progressWrap = $('txtAiProgressWrap');
    const progressText = $('txtAiProgressText');
    const progressPct = $('txtAiProgressPct');
    const progressBar = $('txtAiProgressBar');

    progressWrap.classList.remove('hidden');
    progressText.textContent = 'AI faqat ' + plan.missingEntries.length + ' ta yangi so‘zni tekshirmoqda...';
    progressPct.textContent = '5%';
    progressBar.style.width = '5%';
    $('txtAiEnrichBtn').disabled = true;
    $('txtParseOnlyBtn').disabled = true;

    let runStats = null;
    try {
      const enriched = await AiTxt.enrichEntriesWithAI(parsed.entries, cfg, {
        batchSize: AiTxt.DEFAULT_BATCH_SIZE || 40,
        existingWords: state.words,
        existingCategories: state.categories.map(function (c) { return c.name; }),
        forcedCategory: forcedCategory,
        forcedLesson: forcedLesson,
        onStats: function (st) { runStats = st; },
        onProgress: function (p) {
          const denom = Math.max(1, p.totalCount);
          const pct = Math.max(8, Math.round((p.processedCount / denom) * 100));
          progressText.textContent = 'AI paket ' + p.currentBatch + ' / ' + p.totalBatches + ' qayta ishlanmoqda...';
          progressPct.textContent = pct + '%';
          progressBar.style.width = pct + '%';
        }
      });

      txtPreviewItems = enriched.map(function (item) {
        return Object.assign({ selected: true }, item);
      });
      renderTxtPreview();

      if (runStats) {
        const savedWords = runStats.reusedFromDb + runStats.reusedFromCache + runStats.deduplicated;
        if (savedWords > 0) {
          showToast(runStats.sentToAi + ' ta so‘zga ' + runStats.apiCalls + ' ta AI so‘rovi (' + savedWords + ' ta so‘z kesh/bazadan tejaldi)!', 'success');
        } else {
          showToast('AI ' + txtPreviewItems.length + ' ta so‘zni ' + runStats.apiCalls + ' ta so‘rovda boyitdi!', 'success');
        }
      } else {
        showToast('AI ' + txtPreviewItems.length + ' ta so‘zni to‘liq boyitdi!', 'success');
      }
    } catch (err) {
      showToast(err.message || 'AI so‘rovi bajarilmadi.', 'error');
    } finally {
      $('txtAiEnrichBtn').disabled = false;
      $('txtParseOnlyBtn').disabled = false;
      setTimeout(function () { progressWrap.classList.add('hidden'); }, 900);
    }
  }

  function renderTxtPreview() {
    const wrap = $('txtPreviewWrap');
    const tbody = $('txtPreviewBody');
    const countEl = $('txtPreviewCount');

    if (!txtPreviewItems || txtPreviewItems.length === 0) {
      wrap.classList.add('hidden');
      tbody.innerHTML = '';
      return;
    }

    wrap.classList.remove('hidden');
    const selectedCount = txtPreviewItems.filter(function (x) { return x.selected; }).length;
    const missingTransCount = txtPreviewItems.filter(function (x) { return !x.translation || !x.translation.trim(); }).length;
    countEl.textContent = txtPreviewItems.length + ' ta so‘z (' + selectedCount + ' ta tanlangan' +
      (missingTransCount > 0 ? ', ' + missingTransCount + ' tasida tarjima bo‘sh — AI yoki qo‘lda kiriting' : '') + ')';

    tbody.innerHTML = '';
    txtPreviewItems.forEach(function (item, idx) {
      const tr = document.createElement('tr');
      tr.className = 'align-top hover:bg-white/40 dark:hover:bg-slate-800/40';
      const exHtml = (item.examples && item.examples.length)
        ? item.examples.map(function (ex) { return '<p class="text-[11px] leading-snug">' + formatExampleHtml(ex, item.word) + '</p>'; }).join('')
        : '<span class="text-[11px] text-slate-400">AI orqali to‘ldiriladi</span>';

      tr.innerHTML =
        '<td class="py-2.5 px-2">' +
          '<input type="checkbox" data-preview-check="' + idx + '" ' + (item.selected ? 'checked' : '') + ' class="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />' +
        '</td>' +
        '<td class="py-2.5 px-3 min-w-[170px] space-y-1">' +
          '<input type="text" data-preview-field="word" data-preview-idx="' + idx + '" value="' + escapeHtml(item.word) + '" class="w-full px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-extrabold" />' +
          '<div class="text-[11px] font-mono-ipa text-slate-500 dark:text-slate-400">' + escapeHtml(formatWordPronunciation(item) || '—') + ' · ' + escapeHtml(item.partOfSpeech || 'word') + '</div>' +
        '</td>' +
        '<td class="py-2.5 px-3 min-w-[190px] space-y-1">' +
          '<input type="text" data-preview-field="translation" data-preview-idx="' + idx + '" value="' + escapeHtml(item.translation) + '" placeholder="O‘zbekcha tarjima..." class="w-full px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900 border ' + (item.translation ? 'border-slate-200 dark:border-slate-700' : 'border-amber-400') + ' text-xs font-semibold" />' +
          (item.definition ? '<p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">' + escapeHtml(item.definition) + '</p>' : '') +
        '</td>' +
        '<td class="py-2.5 px-3 min-w-[160px]">' +
          '<input type="text" data-preview-field="lesson" data-preview-idx="' + idx + '" value="' + escapeHtml(item.lesson) + '" class="w-full px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />' +
        '</td>' +
        '<td class="py-2.5 px-3 whitespace-nowrap">' +
          '<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-900 text-white dark:bg-white dark:text-slate-900">' + escapeHtml(item.level || 'B2') + '</span>' +
          '<div class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 mt-1">' + escapeHtml(item.category || 'IELTS') + '</div>' +
        '</td>' +
        '<td class="py-2.5 px-3 min-w-[220px] space-y-1">' + exHtml + '</td>';

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-preview-check]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        const idx = Number(chk.getAttribute('data-preview-check'));
        if (txtPreviewItems[idx]) txtPreviewItems[idx].selected = chk.checked;
      });
    });

    tbody.querySelectorAll('[data-preview-field]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const idx = Number(inp.getAttribute('data-preview-idx'));
        const field = inp.getAttribute('data-preview-field');
        if (txtPreviewItems[idx]) txtPreviewItems[idx][field] = inp.value;
      });
    });

    refreshIcons();
  }

  function saveTxtPreviewItems() {
    const selected = txtPreviewItems.filter(function (x) { return x.selected; });
    if (selected.length === 0) {
      showToast('Saqlash uchun kamida 1 ta so‘z belgilang.', 'warning');
      return;
    }

    const validItems = selected.filter(function (x) {
      return x.word && x.word.trim() && x.translation && x.translation.trim();
    });
    if (validItems.length === 0) {
      showToast('Tanlangan so‘zlarning tarjimasi bo‘sh! Avval "AI bilan to‘g‘rilash" bosing yoki tarjima yozing.', 'warning');
      return;
    }

    const lessonNames = Array.from(new Set(validItems.map(function (x) { return x.lesson; }).filter(Boolean)))
      .map(function (name) { return { name: name, description: 'TXT + AI orqali qo‘shilgan darslik' }; });

    const result = Storage.mergeImportedWords(state, validItems, [], Date.now(), lessonNames);
    state = result.state;
    persistCurriculum('TXT_IMPORT', '+' + result.summary.added + ' qo‘shildi, ' + result.summary.updated + ' yangilandi');
    syncDeckSelects();
    refreshActiveView();

    txtPreviewItems = [];
    renderTxtPreview();

    const skippedNote = result.summary.skipped > 0 ? (' (' + result.summary.skipped + ' o‘tkazildi)') : '';
    showToast('Bazaga saqlandi: +' + result.summary.added + ' yangi, ' + result.summary.updated + ' yangilandi' + skippedNote, 'success');
  }

  /* ----- AI & API Key Settings (inside #aiSettingsDrawer) ----- */

  function renderAiConfigForm() {
    if (!Auth.canManageAiConfig(currentRole)) {
      if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.add('hidden');
      if ($('aiApiKeyInput')) $('aiApiKeyInput').value = '';
      if ($('ttsApiKeyInput')) $('ttsApiKeyInput').value = '';
      return;
    }
    const cfg = state.aiConfig || Storage.createDefaultAiConfig();
    const provider = cfg.provider || 'deepseek';
    const defaultModel = getDefaultAiModel(provider);
    if ($('aiProviderSelect')) $('aiProviderSelect').value = provider;
    if ($('aiModelInput')) $('aiModelInput').value = cfg.model || defaultModel;
    if ($('aiCustomUrlInput')) $('aiCustomUrlInput').value = cfg.customUrl || '';
    if ($('aiApiKeyInput')) {
      $('aiApiKeyInput').value = cfg.apiKey || '';
      $('aiApiKeyInput').placeholder = (Sync && Sync.isServerMode() && cfg.hasApiKey)
        ? ('Saqlangan: ' + (cfg.apiKeyMasked || 'sk-••••') + ' (o‘zgartirish uchun yangisini yozing)')
        : 'sk-...';
    }
    if ($('aiCustomUrlWrap')) $('aiCustomUrlWrap').classList.toggle('hidden', provider !== 'custom');

    const ttsProvider = cfg.ttsProvider || 'auto';
    if ($('ttsProviderSelect')) $('ttsProviderSelect').value = ttsProvider;
    if ($('ttsModelInput')) $('ttsModelInput').value = cfg.ttsModel || '';
    if ($('ttsVoiceUsInput')) $('ttsVoiceUsInput').value = cfg.ttsVoiceUs || '';
    if ($('ttsVoiceUkInput')) $('ttsVoiceUkInput').value = cfg.ttsVoiceUk || '';
    if ($('ttsCustomUrlInput')) $('ttsCustomUrlInput').value = cfg.ttsCustomUrl || '';
    if ($('ttsCustomUrlWrap')) $('ttsCustomUrlWrap').classList.toggle('hidden', ttsProvider !== 'custom');
    if ($('ttsApiKeyInput')) {
      $('ttsApiKeyInput').value = cfg.ttsApiKey || '';
      $('ttsApiKeyInput').placeholder = (Sync && Sync.isServerMode() && cfg.ttsApiKeyMasked)
        ? ('Saqlangan: ' + cfg.ttsApiKeyMasked + ' (o‘zgartirish uchun yozing)')
        : 'Bo‘sh = asosiy OpenAI/Gemini kaliti ishlaydi';
    }
  }

  function collectAiConfigFromForm() {
    const provider = $('aiProviderSelect').value || 'deepseek';
    const prev = state.aiConfig || {};
    const enteredKey = $('aiApiKeyInput').value.trim();
    const ttsProvider = $('ttsProviderSelect') ? ($('ttsProviderSelect').value || 'auto') : (prev.ttsProvider || 'auto');
    const enteredTtsKey = $('ttsApiKeyInput') ? $('ttsApiKeyInput').value.trim() : '';

    return {
      provider: provider,
      model: $('aiModelInput').value.trim() || getDefaultAiModel(provider),
      customUrl: $('aiCustomUrlInput').value.trim(),
      apiKey: enteredKey,
      hasApiKey: Boolean(enteredKey || (Sync && Sync.isServerMode() && prev.hasApiKey)),
      apiKeyMasked: (!enteredKey && prev.apiKeyMasked) ? prev.apiKeyMasked : '',
      ttsProvider: ttsProvider,
      ttsModel: $('ttsModelInput') ? $('ttsModelInput').value.trim() : '',
      ttsCustomUrl: $('ttsCustomUrlInput') ? $('ttsCustomUrlInput').value.trim() : '',
      ttsVoiceUs: $('ttsVoiceUsInput') ? $('ttsVoiceUsInput').value.trim() : '',
      ttsVoiceUk: $('ttsVoiceUkInput') ? $('ttsVoiceUkInput').value.trim() : '',
      ttsApiKey: enteredTtsKey,
      hasTtsKey: Boolean(enteredTtsKey || (Sync && Sync.isServerMode() && prev.hasTtsKey && Boolean(prev.ttsApiKeyMasked))),
      ttsApiKeyMasked: (!enteredTtsKey && prev.ttsApiKeyMasked) ? prev.ttsApiKeyMasked : ''
    };
  }

  async function syncAiConfigToServer(cfg) {
    if (Sync && Sync.isServerMode() && Auth.canManageAiConfig(currentRole)) {
      try {
        const res = await Sync.pushAiConfigRemote(cfg);
        if (res && res.state) mergeRemoteState(res.state);
        return true;
      } catch (err) {
        showToast((err && err.message) || 'AI sozlamasini serverga saqlashda xatolik.', 'error');
        return false;
      }
    }
    return true;
  }

  async function handleAiConfigSubmit(e) {
    e.preventDefault();
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('API kalit sozlamalarini faqat IT Manager boshqaradi!', 'error');
      return;
    }
    const nextCfg = collectAiConfigFromForm();
    if (nextCfg.provider === 'custom' || nextCfg.customUrl) {
      try {
        AiTxt.validateAiEndpoint(nextCfg.customUrl);
      } catch (urlErr) {
        showToast(urlErr.message, 'error');
        return;
      }
    }
    if (nextCfg.ttsProvider === 'custom' || nextCfg.ttsCustomUrl) {
      try {
        AiTxt.validateAiEndpoint(nextCfg.ttsCustomUrl);
      } catch (ttsUrlErr) {
        showToast(ttsUrlErr.message, 'error');
        return;
      }
    }

    const synced = await syncAiConfigToServer(nextCfg);
    if (!synced) return;

    if (!(Sync && Sync.isServerMode())) {
      state.aiConfig = nextCfg;
      recordAudit('AI_CONFIG', nextCfg.provider + ' (' + nextCfg.model + ') · TTS: ' + nextCfg.ttsProvider + ' saqlandi');
      persist('ai-config');
    } else {
      Storage.saveState(state);
    }

    Speech.clearCache();
    renderAiConfigForm();
    renderTxtAiStatus();
    showToast('AI va Talaffuz API sozlamalari xavfsiz saqlandi!', 'success');
  }

  async function handleTestAi() {
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('API kalit sozlamalarini faqat IT Manager boshqaradi!', 'error');
      return;
    }
    const tempCfg = collectAiConfigFromForm();
    if (!hasSavedAiKey(tempCfg)) {
      showToast('Tekshirish uchun API Key kiriting!', 'warning');
      return;
    }
    if (tempCfg.provider === 'custom' || tempCfg.customUrl) {
      try {
        AiTxt.validateAiEndpoint(tempCfg.customUrl);
      } catch (urlErr) {
        showToast(urlErr.message, 'error');
        return;
      }
    }

    const btn = $('testAiBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Tekshirilmoqda...';
    try {
      const ok = await AiTxt.testAiConnection(tempCfg);
      if (ok) {
        await syncAiConfigToServer(tempCfg);
        if (!(Sync && Sync.isServerMode())) {
          state.aiConfig = tempCfg;
          persist('ai-config');
        }
        renderAiConfigForm();
        renderTxtAiStatus();
        showToast('AI ulanishi muvaffaqiyatli tasdiqlandi!', 'success');
      } else {
        showToast('AI javob qaytardi, lekin JSON format mos kelmadi.', 'warning');
      }
    } catch (err) {
      showToast(err.message || 'AI ulanish xatosi.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function handleClearAiKey() {
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('API kalit sozlamalarini faqat IT Manager boshqaradi!', 'error');
      return;
    }
    const baseCfg = collectAiConfigFromForm();
    const clearPayload = Object.assign({}, baseCfg, { apiKey: '', clearKey: true });
    await syncAiConfigToServer(clearPayload);

    state.aiConfig = Object.assign({}, state.aiConfig || Storage.createDefaultAiConfig(), {
      apiKey: '',
      hasApiKey: false,
      apiKeyMasked: ''
    });
    if ($('aiApiKeyInput')) $('aiApiKeyInput').value = '';
    if (!(Sync && Sync.isServerMode())) {
      recordAudit('AI_KEY_CLEAR', 'API Key xavfsiz o‘chirildi');
      persist('ai-config');
    }
    renderAiConfigForm();
    renderTxtAiStatus();
    showToast('API Key xavfsiz o‘chirildi.', 'info');
  }

  async function handleClearTtsKey() {
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('API kalit sozlamalarini faqat IT Manager boshqaradi!', 'error');
      return;
    }
    const baseCfg = collectAiConfigFromForm();
    const clearPayload = Object.assign({}, baseCfg, { ttsApiKey: '', clearTtsKey: true });
    await syncAiConfigToServer(clearPayload);

    state.aiConfig = Object.assign({}, state.aiConfig || Storage.createDefaultAiConfig(), {
      ttsApiKey: '',
      hasTtsKey: false,
      ttsApiKeyMasked: ''
    });
    if ($('ttsApiKeyInput')) $('ttsApiKeyInput').value = '';
    Speech.clearCache();
    if (!(Sync && Sync.isServerMode())) {
      recordAudit('TTS_KEY_CLEAR', 'TTS API Key xavfsiz o‘chirildi');
      persist('ai-config');
    }
    renderAiConfigForm();
    renderTxtAiStatus();
    showToast('TTS API Key xavfsiz o‘chirildi.', 'info');
  }

  async function handleTestTts() {
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('API kalit sozlamalarini faqat IT Manager boshqaradi!', 'error');
      return;
    }
    if (!(Sync && Sync.isServerMode())) {
      showToast('TTS API faqat Node Server rejimida ishlaydi (`node server.js`). Hozir brauzer ovozi ijro etiladi.', 'info');
      speakText('ubiquitous', { useApiTts: false, triggerEl: $('testTtsBtn') });
      return;
    }

    const tempCfg = collectAiConfigFromForm();
    if (tempCfg.ttsProvider === 'custom' || tempCfg.ttsCustomUrl) {
      try {
        AiTxt.validateAiEndpoint(tempCfg.ttsCustomUrl);
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
    }
    const eff = Speech.resolveEffectiveTtsConfig(tempCfg, state.settings.accent);
    if (eff.provider === 'browser' || !eff.hasKey) {
      showToast('Avval OpenAI/Gemini/ElevenLabs TTS kalitini kiriting (yoki OpenAI/Gemini asosiy kalitini saqlang).', 'warning');
      return;
    }

    const btn = $('testTtsBtn');
    if (btn) btn.disabled = true;
    speakText('ubiquitous', {
      triggerEl: btn,
      bypassCache: true,
      strictApiError: true,
      testConfig: tempCfg,
      onApiSuccess: function (res) {
        showToast('Talaffuz API ishlayapti (' + (res.provider || eff.provider).toUpperCase() + ')!', 'success');
      },
      onEnd: function () {
        if (btn) btn.disabled = false;
      }
    });
    setTimeout(function () {
      if (btn) btn.disabled = false;
    }, 5000);
  }

  async function handleEnrichIncompleteWords() {
    if (!Auth.canManageAiConfig(currentRole)) {
      showToast('Ushbu amal faqat IT Manager uchun!', 'error');
      return;
    }
    const cfg = state.aiConfig || {};
    if (!hasSavedAiKey(cfg)) {
      showToast('Avval yuqoridagi shaklda API Key saqlang!', 'warning');
      if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.remove('hidden');
      if ($('aiApiKeyInput')) $('aiApiKeyInput').focus();
      return;
    }

    const incomplete = state.words.filter(function (w) {
      return !w.phonetic || !w.definition || !Array.isArray(w.examples) || w.examples.length < 2 || !w.mnemonic;
    });

    if (incomplete.length === 0) {
      showToast('Barcha so‘zlarning transkripsiya, misol va izohlari allaqachon to‘liq!', 'info');
      return;
    }

    const entries = incomplete.map(function (w) {
      return { rawLine: w.word + ' - ' + w.translation, word: w.word, translation: w.translation, lesson: w.lesson };
    });
    const plan = AiTxt.planAiEnrichment(entries, { existingWords: state.words });

    const btn = $('enrichIncompleteBtn');
    btn.disabled = true;
    showToast(
      plan.missingEntries.length === 0
        ? (incomplete.length + ' ta so‘z keshdan to‘ldirilmoqda (0 ta AI so‘rovi)...')
        : (plan.missingEntries.length + ' ta so‘z AI orqali boyitilmoqda...'),
      'info'
    );

    try {
      const enriched = await AiTxt.enrichEntriesWithAI(entries, cfg, {
        batchSize: AiTxt.DEFAULT_BATCH_SIZE || 40,
        existingWords: state.words,
        existingCategories: state.categories.map(function (c) { return c.name; }),
        forcedCategory: 'AUTO',
        forcedLesson: 'AUTO'
      });

      const byWord = new Map();
      enriched.forEach(function (item) {
        byWord.set(item.word.toLowerCase(), item);
      });

      let updatedCount = 0;
      const now = Date.now();
      state.words = state.words.map(function (w) {
        const ai = byWord.get(w.word.toLowerCase());
        if (!ai) return w;
        updatedCount++;
        return Object.assign({}, w, {
          phonetic: w.phonetic || ai.phonetic,
          phoneticUk: w.phoneticUk || ai.phoneticUk || '',
          syllables: w.syllables || ai.syllables || '',
          pronunciationNote: w.pronunciationNote || ai.pronunciationNote || '',
          partOfSpeech: (!w.partOfSpeech || w.partOfSpeech === 'word') ? ai.partOfSpeech : w.partOfSpeech,
          definition: w.definition || ai.definition,
          examples: (Array.isArray(w.examples) && w.examples.length >= 2) ? w.examples : ai.examples,
          synonyms: (Array.isArray(w.synonyms) && w.synonyms.length > 0) ? w.synonyms : ai.synonyms,
          antonyms: (Array.isArray(w.antonyms) && w.antonyms.length > 0) ? w.antonyms : ai.antonyms,
          mnemonic: w.mnemonic || ai.mnemonic,
          level: w.level || ai.level,
          updatedAt: now
        });
      });

      persistCurriculum('AI_ENRICH_DB', updatedCount + ' ta so‘z AI bilan to‘ldirildi');
      refreshActiveView();
      showToast(updatedCount + ' ta so‘z AI bilan muvaffaqiyatli boyitildi!', 'success');
    } catch (err) {
      showToast(err.message || 'AI bilan boyitishda xatolik.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function handleBatchPronounceWithPrimaryAi() {
    if (!Auth.isAdminRole(currentRole)) {
      showToast('Talaffuzlarni ommaviy aniqlash uchun Teacher yoki IT Manager huquqi kerak.', 'error');
      return;
    }
    const cfg = state.aiConfig || {};
    if (!hasSavedAiKey(cfg)) {
      showToast('Birlamchi AI (DeepSeek) API kaliti kiritilmagan! IT Manager sozlamalarda kiritishi kerak.', 'warning');
      if (Auth.canManageAiConfig(currentRole)) {
        if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.remove('hidden');
        if ($('aiApiKeyInput')) $('aiApiKeyInput').focus();
      }
      return;
    }

    const targets = (state.words || []).filter(function (w) {
      return !(AiTxt && AiTxt.hasCompletePronunciation(w));
    });
    if (targets.length === 0) {
      showToast('Barcha so‘zlarning US/UK IPA va bo‘g‘in talaffuzi allaqachon to‘liq (0 API)!', 'info');
      return;
    }

    const btn = $('batchPronounceBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Aniqlanmoqda...';
    }
    try {
      let updatedCount = 0;
      const providerName = (AiTxt.PROVIDER_DEFAULTS && AiTxt.PROVIDER_DEFAULTS[cfg.provider] && AiTxt.PROVIDER_DEFAULTS[cfg.provider].label) || cfg.provider || 'DeepSeek';
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.resolvePronunciationRemote({
          words: targets.map(function (w) { return { id: w.id, word: w.word, translation: w.translation }; })
        });
        if (res && res.state) mergeRemoteState(res.state);
        updatedCount = Number((res && res.updatedCount) || 0);
      } else {
        const resolved = await AiTxt.resolvePronunciationWithAI(targets, cfg, { existingWords: state.words });
        const byLower = new Map();
        resolved.forEach(function (it) { if (it && it.word) byLower.set(it.word.toLowerCase(), it); });
        const now = Date.now();
        state.words = (state.words || []).map(function (w) {
          const m = byLower.get(String(w.word || '').trim().toLowerCase());
          if (!m) return w;
          updatedCount++;
          return Object.assign({}, w, {
            phonetic: w.phonetic || m.phonetic || '',
            phoneticUk: w.phoneticUk || m.phoneticUk || '',
            syllables: w.syllables || m.syllables || '',
            pronunciationNote: w.pronunciationNote || m.pronunciationNote || '',
            updatedAt: now
          });
        });
        if (updatedCount > 0) {
          persistCurriculum('AI_PRONOUNCE', providerName + ' orqali ' + updatedCount + ' ta so‘z talaffuzi aniqlandi');
        }
      }
      refreshActiveView();
      showToast(providerName + ' orqali ' + updatedCount + ' ta so‘z talaffuzi aniqlandi!', 'success');
    } catch (err) {
      showToast((err && err.message) || 'Birlamchi AI bilan talaffuz aniqlashda xatolik.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="audio-waveform" class="w-3.5 h-3.5"></i> Talaffuzlarni AI bilan aniqlash';
        refreshIcons();
      }
    }
  }

  /* ----- IT Manager Security & Audit Log ----- */

  function renderSecurityTab() {
    const canSecurity = Auth.canManageSecurity(currentRole);
    if ($('securityLockedNotice')) $('securityLockedNotice').classList.toggle('hidden', canSecurity);
    if ($('securityPanelBody')) $('securityPanelBody').classList.toggle('hidden', !canSecurity);
    if (canSecurity) {
      renderAuditLog();
    }
  }

  function renderAuditLog() {
    const container = $('auditLogList');
    if (!container) return;
    const logs = Array.isArray(state.auditLog) ? state.auditLog : [];
    if (logs.length === 0) {
      container.innerHTML = '<p class="text-slate-500">Hali faoliyat jurnali yozilmagan.</p>';
      return;
    }
    container.innerHTML = logs.map(function (entry) {
      const dateStr = new Date(entry.timestamp).toLocaleString();
      const roleMeta = Auth.ROLE_META[entry.actorRole] || Auth.ROLE_META.student;
      return '<div class="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/70">' +
        '<div class="min-w-0">' +
          '<span class="font-extrabold text-indigo-600 dark:text-indigo-300">[' + escapeHtml(roleMeta.label) + '] ' + escapeHtml(entry.action) + '</span>' +
          '<p class="text-slate-600 dark:text-slate-300 break-words">' + escapeHtml(entry.detail) + '</p>' +
        '</div>' +
        '<span class="shrink-0 text-[11px] text-slate-400 tabular-nums">' + escapeHtml(dateStr) + '</span>' +
      '</div>';
    }).join('');
  }

  async function handleClearRateLimits() {
    if (!Auth.canManageSecurity(currentRole)) {
      showToast('Faqat IT Manager blokirovkalarni tozalay oladi!', 'error');
      return;
    }
    try {
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushSecurityRemote({ action: 'clearRateLimits' });
        if (res && res.state) mergeRemoteState(res.state);
      } else {
        recordAudit('RATE_LIMIT_CLEAR', 'Login blokirovka cheklovlari tozalandi');
        persist('security');
      }
      try { localStorage.removeItem('swe_auth_rate_limit_v1'); } catch (_) {}
      renderAuditLog();
      showToast('Barcha vaqtinchalik login blokirovkalari ochildi!', 'success');
    } catch (err) {
      showToast((err && err.message) || 'Blokirovkalarni tozalashda xatolik.', 'error');
    }
  }

  async function handleChangePassword(targetRole, newInpId, confirmInpId, meterBarId, meterLabelId) {
    if (!Auth.canManageSecurity(currentRole)) {
      showToast('Faqat IT Manager parollarni o‘zgartira oladi!', 'error');
      return;
    }

    const newPw = $(newInpId).value;
    const confirmPw = $(confirmInpId).value;
    if (newPw !== confirmPw) {
      showToast('Yangi parol va tasdiqlash paroli bir xil emas!', 'warning');
      return;
    }

    try {
      const ls = typeof localStorage !== 'undefined' ? localStorage : null;
      if (Sync && Sync.isServerMode()) {
        const res = await Sync.pushSecurityRemote({
          action: 'changeRolePassword',
          targetRole: targetRole,
          newPassword: newPw
        });
        mergeRemoteState(res.state);
        try {
          state.auth = Auth.changeRolePassword(state.auth, currentRole, targetRole, newPw);
          Storage.saveState(state);
        } catch (_) {}
      } else {
        state.auth = Auth.changeRolePassword(state.auth, currentRole, targetRole, newPw);
        recordAudit('PASSWORD_CHANGE', Auth.ROLE_META[targetRole].label + ' paroli yangilandi');
        persist('security');
      }
      Auth.clearLoginFailures('staff:' + targetRole, ls);
      $(newInpId).value = '';
      $(confirmInpId).value = '';
      if (meterBarId && meterLabelId) updatePasswordMeter('', meterBarId, meterLabelId);
      renderAuditLog();
      showToast(Auth.ROLE_META[targetRole].label + ' paroli muvaffaqiyatli yangilandi!', 'success');
    } catch (err) {
      showToast(err.message || 'Parolni saqlashda xatolik.', 'error');
    }
  }

  function handleResetDatabase() {
    if (!Auth.canManageSecurity(currentRole)) {
      showToast('Bu amal faqat IT Manager uchun!', 'error');
      return;
    }
    openConfirm(
      'Bazani standart holatga qaytarish',
      'Barcha foydalanuvchi qo‘shgan so‘zlar va statistika o‘chib, boshlang‘ich 3 darslik / 15 ta so‘z tiklanadi. Davom etasizmi?',
      async function () {
        const preservedTheme = state.settings.theme;
        const preservedAccent = state.settings.accent;
        if (Sync && Sync.isServerMode()) {
          try {
            const res = await Sync.pushSecurityRemote({ action: 'resetDatabase' });
            mergeRemoteState(res.state);
          } catch (err) {
            showToast((err && err.message) || 'Bazani tiklashda xatolik.', 'error');
            return;
          }
        } else {
          const preservedAuth = state.auth;
          const preservedStudents = state.students;
          const resetBase = Storage.createDefaultState(Date.now());
          resetBase.auth = preservedAuth;
          resetBase.students = preservedStudents;
          state = Storage.normalizeState(resetBase, Date.now());
          state.settings.theme = preservedTheme;
          state.settings.accent = preservedAccent;
          recordAudit('DB_RESET', 'Lug‘at bazasi standart holatga qaytarildi');
          persist('security');
        }
        activeDeck = 'ALL';
        activeLesson = 'ALL';
        resetAllStudyRuntimeSessions();
        syncDeckSelects();
        renderSecurityTab();
        refreshActiveView();
        showToast('Baza standart holatga qaytarildi!', 'info');
      }
    );
  }

  /* ==================== KEYBOARD SHORTCUTS ==================== */

  function isAnyModalOpen() {
    return !['shortcutsModal', 'confirmModal', 'studentDetailModal', 'studentResetPwModal'].every(function (id) {
      const el = $(id);
      return !el || el.classList.contains('hidden');
    });
  }

  function closeAllModals() {
    closeConfirm();
    closeStudentDetailModal();
    closeStudentResetPwModal();
    if ($('shortcutsModal')) $('shortcutsModal').classList.add('hidden');
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
      if (isAnyModalOpen()) {
        closeAllModals();
        return;
      }
    }

    if (isAnyModalOpen()) return;

    const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
      return;
    }

    if (currentView !== 'study') return;

    // 'S' speaks the current word across active practice modes (disabled during closed exam)
    if (e.key === 's' || e.key === 'S') {
      if (currentStudyMode === 'exam') return;
      e.preventDefault();
      if (currentStudyMode === 'flashcards' && fcSession.queue[fcSession.index]) {
        const fc = fcSession.queue[fcSession.index];
        speakText(fc.word, { wordId: fc.id, triggerEl: $('fcSpeakBtn') });
      } else if (currentStudyMode === 'quiz' && quizSession.index < quizSession.items.length && quizSession.items[quizSession.index]) {
        const q = quizSession.items[quizSession.index];
        speakText(q.word, { wordId: q.id, triggerEl: $('quizSpeakBtn') });
      } else if (currentStudyMode === 'writing' && writeSession.index < writeSession.items.length && writeSession.items[writeSession.index]) {
        const w = writeSession.items[writeSession.index];
        speakText(w.word, { wordId: w.id, triggerEl: $('writeSpeakBtn') });
      } else if (currentStudyMode === 'listening' && listenSession.index < listenSession.items.length && listenSession.items[listenSession.index]) {
        const l = listenSession.items[listenSession.index];
        speakText(l.word, { wordId: l.id, triggerEl: $('listenSpeakBtn') });
      }
      return;
    }

    if (currentStudyMode === 'flashcards') {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (tag === 'BUTTON' && e.target && typeof e.target.blur === 'function') {
          e.target.blur();
        }
        toggleFlashcardFlip();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFlashcard(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFlashcard(-1);
        return;
      }
      if (['1', '2', '3', '4'].indexOf(e.key) !== -1) {
        e.preventDefault();
        if (!fcSession.isFlipped) {
          showToast('Avval kartochkani aylantiring (Space)', 'info');
          return;
        }
        const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
        rateCurrentFlashcard(map[e.key]);
        return;
      }
    }

    if (currentStudyMode === 'quiz') {
      if (['1', '2', '3', '4'].indexOf(e.key) !== -1 && quizSession.index < quizSession.items.length) {
        e.preventDefault();
        selectQuizOption(Number(e.key) - 1);
      } else if ((e.key === 'ArrowRight' || (e.key === 'Enter' && tag !== 'BUTTON')) && quizSession.answered && quizSession.index < quizSession.items.length) {
        e.preventDefault();
        quizSession.index++;
        renderQuizQuestion();
      }
      return;
    }

    if (currentStudyMode === 'writing') {
      if ((e.key === 'ArrowRight' || (e.key === 'Enter' && tag !== 'BUTTON')) && writeSession.answered && writeSession.index < writeSession.items.length) {
        e.preventDefault();
        writeSession.index++;
        renderWritingQuestion();
      }
      return;
    }

    if (currentStudyMode === 'listening') {
      if (listenSession.type === 'quiz' && ['1', '2', '3', '4'].indexOf(e.key) !== -1 && listenSession.index < listenSession.items.length) {
        e.preventDefault();
        selectListeningOption(Number(e.key) - 1);
      } else if ((e.key === 'ArrowRight' || (e.key === 'Enter' && tag !== 'BUTTON')) && listenSession.answered && listenSession.index < listenSession.items.length) {
        e.preventDefault();
        listenSession.index++;
        renderListeningQuestion(true);
      }
    }
  }

  /* ==================== INITIALIZATION & EVENT WIRING ==================== */

  function bindPasswordMeter(inputId, barId, labelId, isStudentTarget) {
    const inp = $(inputId);
    if (!inp) return;
    inp.addEventListener('input', function () {
      updatePasswordMeter(inp.value, barId, labelId, Boolean(isStudentTarget));
    });
  }

  function bindEvents() {
    // Theme & Accent
    $('themeToggleBtn').addEventListener('click', toggleTheme);
    if ($('loginThemeToggleBtn')) $('loginThemeToggleBtn').addEventListener('click', toggleTheme);
    $('accentUsBtn').addEventListener('click', function () { setAccent('en-US'); });
    $('accentUkBtn').addEventListener('click', function () { setAccent('en-GB'); });

    // Unified Login View
    document.querySelectorAll('[data-auth-role]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loginRoleSelection = btn.getAttribute('data-auth-role') || 'student';
        applyLoginRoleUI();
        if ($('loginPasswordInput')) $('loginPasswordInput').value = '';
        if ($('loginErrorBox')) {
          $('loginErrorBox').classList.add('hidden');
          $('loginErrorBox').textContent = '';
        }
        if (loginRoleSelection === 'student' && $('loginUsernameInput')) {
          $('loginUsernameInput').focus();
        } else if ($('loginPasswordInput')) {
          $('loginPasswordInput').focus();
        }
      });
    });
    if ($('stuAuthLoginModeBtn')) {
      $('stuAuthLoginModeBtn').addEventListener('click', function () {
        loginAuthMode = 'login';
        applyLoginRoleUI();
        if ($('loginErrorBox')) $('loginErrorBox').classList.add('hidden');
      });
    }
    if ($('stuAuthSignupModeBtn')) {
      $('stuAuthSignupModeBtn').addEventListener('click', function () {
        loginRoleSelection = 'student';
        loginAuthMode = 'signup';
        applyLoginRoleUI();
        if ($('loginErrorBox')) $('loginErrorBox').classList.add('hidden');
        if ($('signupFullNameInput')) $('signupFullNameInput').focus();
      });
    }
    if ($('toggleLoginPwBtn')) {
      $('toggleLoginPwBtn').addEventListener('click', function () {
        const inp = $('loginPasswordInput');
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    }
    document.querySelectorAll('[data-toggle-pw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-toggle-pw');
        const inp = targetId ? $(targetId) : null;
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });
    if ($('loginForm')) {
      $('loginForm').addEventListener('submit', handleLoginSubmit);
    }

    // Navigation & Brand Home
    if ($('brandHomeBtn')) {
      $('brandHomeBtn').addEventListener('click', function () {
        switchView(isStaff() ? 'monitor' : 'dashboard');
      });
    }
    document.querySelectorAll('[data-nav-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.getAttribute('data-nav-view'));
      });
    });

    // Dashboard CTAs
    $('dashDueCtaBtn').addEventListener('click', function () {
      activeDeck = 'ALL';
      activeLesson = 'ALL';
      studyScope = SRS.getDueCards(getSessionWords(), Date.now()).length > 0 ? 'due' : 'all';
      currentStudyMode = 'flashcards';
      switchView('study', { restartStudy: true });
    });

    // User badge & Logout
    if ($('userBadgeBtn')) {
      $('userBadgeBtn').addEventListener('click', function () {
        if (Auth.canManageSecurity(currentRole)) {
          switchView('security');
        } else if (isStaff()) {
          switchView('txt-import');
        }
      });
    }
    if ($('headerLogoutBtn')) {
      $('headerLogoutBtn').addEventListener('click', handleLogout);
    }

    // Monitor View Controls
    if ($('copyPhoneJoinLinkBtn')) {
      $('copyPhoneJoinLinkBtn').addEventListener('click', handleCopyPhoneJoinLink);
    }
    if ($('monitorRefreshBtn')) {
      $('monitorRefreshBtn').addEventListener('click', async function () {
        if (Sync && Sync.isServerMode() && currentSession) {
          try {
            const res = await Sync.fetchRemoteState();
            if (res && res.state) mergeRemoteState(res.state);
          } catch (err) {
            showToast((err && err.message) || 'Yangilashda xatolik.', 'warning');
          }
        } else {
          state = Storage.loadState();
        }
        renderMonitorView();
        showToast('Jonli monitoring ma’lumotlari yangilandi.', 'info');
      });
    }
    if ($('monitorAddStudentBtn')) {
      $('monitorAddStudentBtn').addEventListener('click', function () {
        switchView('students');
      });
    }
    if ($('monitorTxtAiBtn')) {
      $('monitorTxtAiBtn').addEventListener('click', function () {
        switchView('txt-import');
      });
    }
    if ($('monitorSearchInput')) $('monitorSearchInput').addEventListener('input', renderMonitorView);
    if ($('monitorGroupFilter')) $('monitorGroupFilter').addEventListener('change', renderMonitorView);
    if ($('monitorPresenceFilter')) $('monitorPresenceFilter').addEventListener('change', renderMonitorView);
    if ($('monitorFeedStudentFilter')) $('monitorFeedStudentFilter').addEventListener('change', renderMonitorView);

    // Student Detail & Reset Password Modals
    if ($('closeStudentDetailBtn')) $('closeStudentDetailBtn').addEventListener('click', closeStudentDetailModal);
    if ($('studentDetailModal')) {
      $('studentDetailModal').addEventListener('click', function (e) {
        if (e.target === $('studentDetailModal')) closeStudentDetailModal();
      });
    }
    if ($('closeStuResetPwBtn')) $('closeStuResetPwBtn').addEventListener('click', closeStudentResetPwModal);
    if ($('cancelStuResetPwBtn')) $('cancelStuResetPwBtn').addEventListener('click', closeStudentResetPwModal);
    if ($('studentResetPwModal')) {
      $('studentResetPwModal').addEventListener('click', function (e) {
        if (e.target === $('studentResetPwModal')) closeStudentResetPwModal();
      });
    }
    if ($('studentResetPwForm')) {
      $('studentResetPwForm').addEventListener('submit', handleStudentResetPwSubmit);
    }

    // Study controls
    document.querySelectorAll('[data-study-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setStudyMode(btn.getAttribute('data-study-mode'));
      });
    });

    $('studyDeckSelect').addEventListener('change', function (e) {
      if (isExamActivelyProctored()) {
        e.target.value = activeDeck;
        showToast('Yopiq test paytida turkumni almashtirib bo‘lmaydi!', 'warning');
        return;
      }
      activeDeck = e.target.value;
      startCurrentStudyMode();
    });
    $('studyLessonSelect').addEventListener('change', function (e) {
      if (isExamActivelyProctored()) {
        e.target.value = activeLesson;
        showToast('Yopiq test paytida darslikni almashtirib bo‘lmaydi!', 'warning');
        return;
      }
      activeLesson = e.target.value;
      startCurrentStudyMode();
    });

    document.querySelectorAll('[data-study-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        studyScope = btn.getAttribute('data-study-scope');
        applyStudyScopeUI();
        initFlashcardsSession();
      });
    });

    // Flashcard interactions
    $('fcCardInner').addEventListener('click', function () {
      const selText = (window.getSelection && String(window.getSelection().toString() || '').trim()) || '';
      if (selText.length > 0) return;
      toggleFlashcardFlip();
    });
    $('fcCardInner').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleFlashcardFlip();
      }
    });
    if ($('fcActiveWrap')) {
      $('fcActiveWrap').addEventListener('keyup', function (e) {
        if ((e.code === 'Space' || e.key === ' ') && e.target && e.target.tagName === 'BUTTON') {
          e.preventDefault();
        }
      });
    }
    $('fcFlipBtn').addEventListener('click', function () { toggleFlashcardFlip(); });
    $('fcPrevBtn').addEventListener('click', function () { moveFlashcard(-1); });
    $('fcNextBtn').addEventListener('click', function () { moveFlashcard(1); });

    $('fcSpeakBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { wordId: card.id, triggerEl: e.currentTarget });
    });
    $('fcSpeakUsBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { wordId: card.id, accent: 'en-US', triggerEl: e.currentTarget });
    });
    $('fcSpeakUkBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { wordId: card.id, accent: 'en-GB', triggerEl: e.currentTarget });
    });
    $('fcBackSpeakBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { wordId: card.id, triggerEl: e.currentTarget });
    });

    document.querySelectorAll('[data-srs-rate]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        rateCurrentFlashcard(btn.getAttribute('data-srs-rate'));
      });
    });

    $('fcPracticeAllBtn').addEventListener('click', function () {
      clearRetryTimer();
      if (fcSession.waitingWordId) {
        fcSession.waitingRetryUntil = null;
        const word = getSessionWords().find(function (w) { return w.id === fcSession.waitingWordId; });
        fcSession.waitingWordId = null;
        if (word) {
          fcSession.queue = [word];
          fcSession.index = 0;
          fcSession.scopeKey = getStudyScopeKey();
          fcSession.scopeMode = studyScope;
          fcSession.isFlipped = false;
          renderFlashcard();
          return;
        }
      }
      studyScope = 'all';
      applyStudyScopeUI();
      initFlashcardsSession();
    });
    $('fcBackDashBtn').addEventListener('click', function () { switchView('dashboard'); });

    // Quiz interactions
    $('quizSpeakBtn').addEventListener('click', function (e) {
      const q = quizSession.items[quizSession.index];
      if (q) speakText(q.word, { wordId: q.id, triggerEl: e.currentTarget });
    });
    $('quizNextBtn').addEventListener('click', function () {
      if (!quizSession.answered || quizSession.index >= quizSession.items.length) return;
      quizSession.index++;
      renderQuizQuestion();
    });
    $('quizRestartBtn').addEventListener('click', initQuizSession);

    // Writing interactions
    $('writeSpeakBtn').addEventListener('click', function (e) {
      const item = writeSession.items[writeSession.index];
      if (item) speakText(item.word, { wordId: item.id, triggerEl: e.currentTarget });
    });
    $('writeHintBtn').addEventListener('click', revealWritingHint);
    $('writeForm').addEventListener('submit', checkWritingAnswer);
    $('writeNextBtn').addEventListener('click', function () {
      if (!writeSession.answered || writeSession.index >= writeSession.items.length) return;
      writeSession.index++;
      renderWritingQuestion();
    });
    $('writeRestartBtn').addEventListener('click', initWritingSession);

    // Listening interactions
    document.querySelectorAll('[data-listen-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setListeningType(btn.getAttribute('data-listen-type'));
      });
    });
    $('listenSpeakBtn').addEventListener('click', function (e) {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { wordId: item.id, triggerEl: e.currentTarget });
    });
    $('listenSlowBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { wordId: item.id, rate: 0.75, triggerEl: $('listenSpeakBtn') });
    });
    $('listenUsBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { wordId: item.id, accent: 'en-US', triggerEl: $('listenSpeakBtn') });
    });
    $('listenUkBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { wordId: item.id, accent: 'en-GB', triggerEl: $('listenSpeakBtn') });
    });
    $('listenDictationForm').addEventListener('submit', checkListeningDictation);
    $('listenNextBtn').addEventListener('click', function () {
      if (!listenSession.answered || listenSession.index >= listenSession.items.length) return;
      listenSession.index++;
      renderListeningQuestion(true);
    });
    $('listenRestartBtn').addEventListener('click', initListeningSession);

    // Final Closed Exam interactions
    if ($('examAgreeCheck')) {
      $('examAgreeCheck').addEventListener('change', function () {
        if ($('examStartBtn')) {
          $('examStartBtn').disabled = !isStudentSession() || getFilteredStudyWords().length === 0 || !$('examAgreeCheck').checked;
        }
      });
    }
    if ($('examStartBtn')) {
      $('examStartBtn').addEventListener('click', startFinalExam);
    }
    if ($('examReturnFullscreenBtn')) {
      $('examReturnFullscreenBtn').addEventListener('click', function () {
        tryEnterFullscreen();
        updateExamFullscreenBadge();
        if ($('examAnswerInput')) $('examAnswerInput').focus();
      });
    }
    if ($('examFinishEarlyBtn')) {
      $('examFinishEarlyBtn').addEventListener('click', function () {
        const exam = getStudentFinalExam();
        if (exam.status === 'in_progress' && exam.answeredCount < exam.totalQuestions) {
          openConfirm(
            'Yopiq testni muddatidan oldin yakunlash',
            'Siz hali ' + (exam.totalQuestions - exam.answeredCount) + ' ta savolga javob bermadingiz. Baribir yakunlansinmi? (Yakunlangach Teacher ruxsatisiz qayta topshirib bo‘lmaydi.)',
            function () {
              finishExamEarly(false);
            }
          );
          return;
        }
        finishExamEarly(false);
      });
    }
    if ($('examAnswerForm')) {
      $('examAnswerForm').addEventListener('submit', handleExamAnswerSubmit);
    }
    if ($('examCheckUnlockBtn')) {
      $('examCheckUnlockBtn').addEventListener('click', checkExamUnlockStatus);
    }
    if ($('examCheckRetakeBtn')) {
      $('examCheckRetakeBtn').addEventListener('click', checkExamUnlockStatus);
    }

    // Vocabulary Filters & TXT-only Teacher Action
    $('vocabSearchInput').addEventListener('input', renderVocabulary);
    $('vocabLessonFilter').addEventListener('change', renderVocabulary);
    $('vocabCategoryFilter').addEventListener('change', renderVocabulary);
    $('vocabLevelFilter').addEventListener('change', renderVocabulary);
    $('vocabStatusFilter').addEventListener('change', renderVocabulary);
    if ($('vocabExportTxtBtn')) {
      $('vocabExportTxtBtn').addEventListener('click', function () { handleExportTXT('detailed'); });
    }
    if ($('vocabDeleteSelectedLessonBtn')) {
      $('vocabDeleteSelectedLessonBtn').addEventListener('click', function () {
        const selectedLesson = ($('vocabLessonFilter') && $('vocabLessonFilter').value) || 'ALL';
        if (selectedLesson !== 'ALL') {
          deleteLessonVocabulary(selectedLesson);
        }
      });
    }
    if ($('vocabOpenTxtAiBtn')) {
      $('vocabOpenTxtAiBtn').addEventListener('click', function () {
        switchView('txt-import');
      });
    }

    // Students View
    if ($('toggleOpenSignupBtn')) {
      $('toggleOpenSignupBtn').addEventListener('click', handleToggleOpenSignup);
    }
    if ($('studentCreateForm')) {
      $('studentCreateForm').addEventListener('submit', handleStudentCreateSubmit);
    }
    bindPasswordMeter('stuPasswordInput', 'stuPwMeterBar', 'stuPwMeterLabel', true);
    bindPasswordMeter('stuResetNewPwInput', 'stuResetPwMeterBar', 'stuResetPwMeterLabel', true);

    // TXT + AI View & Collapsible DeepSeek Drawer (IT Manager ONLY)
    if ($('toggleAiSettingsBtn')) {
      $('toggleAiSettingsBtn').addEventListener('click', function () {
        if (!Auth.canManageAiConfig(currentRole)) return;
        if ($('aiSettingsDrawer')) {
          $('aiSettingsDrawer').classList.toggle('hidden');
          refreshIcons();
        }
      });
    }
    if ($('txtDropzone')) {
      const dz = $('txtDropzone');
      dz.addEventListener('dragover', function (e) {
        e.preventDefault();
        dz.classList.add('is-dragover');
      });
      dz.addEventListener('dragleave', function () {
        dz.classList.remove('is-dragover');
      });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          loadTxtFiles(e.dataTransfer.files);
        }
      });
    }
    $('txtLoadSampleBtn').addEventListener('click', function () {
      $('txtRawInput').value = AiTxt.SAMPLE_TXT;
      $('txtSelectedFilesLabel').textContent = 'Namuna matn yuklandi';
      runTxtParseOnly();
    });
    $('txtExportAllBtn').addEventListener('click', function () { handleExportTXT('detailed'); });
    if ($('batchPronounceBtn')) {
      $('batchPronounceBtn').addEventListener('click', handleBatchPronounceWithPrimaryAi);
    }
    $('txtExportSimpleBtn').addEventListener('click', function () { handleExportTXT('simple'); });
    $('txtFileInput').addEventListener('change', handleTxtFilesSelected);
    $('txtTargetLessonSelect').addEventListener('change', function (e) {
      $('txtCustomLessonWrap').classList.toggle('hidden', e.target.value !== '__CUSTOM__');
    });
    $('txtParseOnlyBtn').addEventListener('click', runTxtParseOnly);
    $('txtAiEnrichBtn').addEventListener('click', function () { runTxtAiEnrich(); });
    $('txtClearPreviewBtn').addEventListener('click', function () {
      txtPreviewItems = [];
      renderTxtPreview();
    });
    $('txtSaveAllBtn').addEventListener('click', saveTxtPreviewItems);

    // AI Config Drawer Controls
    $('aiProviderSelect').addEventListener('change', function (e) {
      const provider = e.target.value;
      $('aiCustomUrlWrap').classList.toggle('hidden', provider !== 'custom');
      const modelInput = $('aiModelInput');
      const curModel = modelInput.value.trim();
      const knownDefaults = ['deepseek-chat', 'gemini-2.5-flash', 'gpt-4o-mini'];
      if (!curModel || knownDefaults.indexOf(curModel) !== -1) {
        modelInput.value = getDefaultAiModel(provider);
      }
    });
    if ($('ttsProviderSelect')) {
      $('ttsProviderSelect').addEventListener('change', function (e) {
        const ttsProv = e.target.value;
        if ($('ttsCustomUrlWrap')) $('ttsCustomUrlWrap').classList.toggle('hidden', ttsProv !== 'custom');
        const ttsModelInp = $('ttsModelInput');
        if (ttsModelInp) {
          const cur = ttsModelInp.value.trim();
          const knownTts = ['gpt-4o-mini-tts', 'tts-1', 'gemini-2.5-flash-preview-tts', 'eleven_flash_v2_5'];
          if (!cur || knownTts.indexOf(cur) !== -1) {
            const d = Speech.TTS_PROVIDER_DEFAULTS && Speech.TTS_PROVIDER_DEFAULTS[ttsProv];
            ttsModelInp.value = (d && d.defaultModel) || '';
          }
        }
      });
    }
    if ($('testTtsBtn')) $('testTtsBtn').addEventListener('click', handleTestTts);
    if ($('clearTtsKeyBtn')) $('clearTtsKeyBtn').addEventListener('click', handleClearTtsKey);
    $('toggleApiKeyBtn').addEventListener('click', function () {
      const inp = $('aiApiKeyInput');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    $('aiConfigForm').addEventListener('submit', handleAiConfigSubmit);
    $('testAiBtn').addEventListener('click', function () { handleTestAi(); });
    $('clearAiKeyBtn').addEventListener('click', handleClearAiKey);
    $('enrichIncompleteBtn').addEventListener('click', function () { handleEnrichIncompleteWords(); });

    // Security View (IT Manager)
    if ($('securityOpenAiDrawerBtn')) {
      $('securityOpenAiDrawerBtn').addEventListener('click', function () {
        if (!Auth.canManageAiConfig(currentRole)) return;
        switchView('txt-import');
        if ($('aiSettingsDrawer')) $('aiSettingsDrawer').classList.remove('hidden');
        if ($('aiApiKeyInput')) $('aiApiKeyInput').focus();
      });
    }
    if ($('clearRateLimitsBtn')) {
      $('clearRateLimitsBtn').addEventListener('click', handleClearRateLimits);
    }
    bindPasswordMeter('newTeacherPwInput', 'teacherPwMeterBar', 'teacherPwMeterLabel');
    bindPasswordMeter('newItPwInput', 'itPwMeterBar', 'itPwMeterLabel');
    $('changeTeacherPwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      handleChangePassword('teacher', 'newTeacherPwInput', 'confirmTeacherPwInput', 'teacherPwMeterBar', 'teacherPwMeterLabel');
    });
    $('changeItPwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      handleChangePassword('it_manager', 'newItPwInput', 'confirmItPwInput', 'itPwMeterBar', 'itPwMeterLabel');
    });
    $('adminResetDbBtn').addEventListener('click', handleResetDatabase);

    // Confirm & Shortcuts Modals
    $('shortcutsBtn').addEventListener('click', function () {
      $('shortcutsModal').classList.remove('hidden');
      refreshIcons();
    });
    $('closeShortcutsModalBtn').addEventListener('click', function () { $('shortcutsModal').classList.add('hidden'); });
    $('shortcutsModal').addEventListener('click', function (e) { if (e.target === $('shortcutsModal')) $('shortcutsModal').classList.add('hidden'); });

    $('confirmCancelBtn').addEventListener('click', closeConfirm);
    $('confirmOkBtn').addEventListener('click', function () {
      const fn = confirmCallback;
      closeConfirm();
      if (typeof fn === 'function') fn();
    });
    $('confirmModal').addEventListener('click', function (e) { if (e.target === $('confirmModal')) closeConfirm(); });

    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function handleIncomingSyncUpdate(info) {
    if (!currentSession) return;
    if (syncRefreshTimerId) clearTimeout(syncRefreshTimerId);
    syncRefreshTimerId = setTimeout(async function () {
      const reason = (info && info.reason) || 'update';
      if (Sync && Sync.isServerMode()) {
        try {
          const res = await Sync.fetchRemoteState();
          if (res && res.state) mergeRemoteState(res.state);
        } catch (err) {
          if (err && err.status === 401) {
            currentSession = Auth.setSession(null);
            applyAuthGateUI();
            return;
          }
          return;
        }
      } else {
        state = Storage.loadState();
      }

      if (currentView === 'monitor') {
        renderMonitorView();
        if (selectedMonitorStudentId && $('studentDetailModal') && !$('studentDetailModal').classList.contains('hidden')) {
          openStudentDetailModal(selectedMonitorStudentId, true);
        }
      } else if (currentView === 'dashboard') {
        renderDashboard();
      } else if (currentView === 'vocabulary' && (reason === 'curriculum' || reason === 'local')) {
        syncDeckSelects();
        renderVocabulary();
      } else if (currentView === 'txt-import') {
        syncDeckSelects();
        renderTxtAiStatus();
        renderAiConfigForm();
      } else if (currentView === 'students') {
        renderAdminStudentsList();
      } else if (currentView === 'security') {
        renderSecurityTab();
      } else if (currentView === 'study') {
        if (currentStudyMode === 'exam') {
          renderExamViewFromState();
        } else if (reason === 'curriculum' || reason === 'local') {
          syncDeckSelects();
          applyUpdatedWordsToStudySessions();
        }
      }
      if (reason === 'tunnel' && Sync && Sync.isServerMode() && typeof Sync.fetchPublicLinkRemote === 'function' && isStaff()) {
        try { await Sync.fetchPublicLinkRemote(); } catch (_) {}
        refreshPhoneJoinButtonUI();
      }
      if (reason === 'ai-config' && Speech && typeof Speech.clearCache === 'function') {
        Speech.clearCache();
        renderTxtAiStatus();
      }
    }, 150);
  }

  async function init() {
    applyTheme(state.settings.theme);
    applyAccentUI();
    bindEvents();

    if (Speech && typeof Speech.setRemoteTtsHandler === 'function') {
      Speech.setRemoteTtsHandler(async function (reqPayload) {
        if (Sync && Sync.isServerMode()) {
          return Sync.fetchTtsAudio(reqPayload);
        }
        return { mode: 'browser-fallback' };
      });
    }

    if (Sync) {
      Sync.startLocalListeners(Storage);
      await Sync.detectServer();
      Sync.onSyncUpdate(handleIncomingSyncUpdate);
    }

    if (Sync && Sync.isServerMode()) {
      if (Sync.getSessionToken()) {
        try {
          const res = await Sync.fetchRemoteState();
          mergeRemoteState(res.state);
          currentSession = Auth.setSession(res.session);
        } catch (e) {
          Sync.setSessionToken('');
          currentSession = Auth.setSession(null);
        }
      } else {
        currentSession = Auth.setSession(null);
      }
    } else if (currentSession && currentSession.role === 'student') {
      const stillValid = (state.students || []).some(function (s) {
        return s.id === currentSession.userId && s.active !== false;
      });
      if (!stillValid) {
        currentSession = Auth.setSession(null);
      }
    }

    applyAuthGateUI();

    if (currentSession) {
      setListeningType('quiz');
      if (isExamActivelyProctored()) {
        currentStudyMode = 'exam';
        switchView('study');
      } else {
        currentStudyMode = 'flashcards';
        switchView(isStaff() ? 'monitor' : 'dashboard');
      }
    } else {
      refreshIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
