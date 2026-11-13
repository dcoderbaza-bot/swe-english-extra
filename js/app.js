/**
 * SWE ENGLISH EXTRA — Main SPA Controller
 */
(function () {
  'use strict';

  const Storage = window.SWEStorage;
  const SRS = window.SWESRS;
  const Speech = window.SWESpeech;
  const DefaultData = window.SWEData;

  let state = Storage.loadState();
  let currentView = 'dashboard';
  let currentStudyMode = 'flashcards';
  let activeDeck = 'ALL';
  let studyScope = 'due'; // 'due' | 'all'

  // Flashcards session state
  let fcSession = {
    queue: [],
    index: 0,
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
    answered: false,
    wrongWords: []
  };

  // Writing session state
  let writeSession = {
    items: [],
    index: 0,
    score: 0,
    answered: false,
    hintStep: 0
  };

  // Listening session state
  let listenSession = {
    type: 'quiz', // 'quiz' | 'dictation'
    items: [],
    index: 0,
    score: 0,
    answered: false
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

  function persist() {
    Storage.saveState(state);
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

  function speakText(text, options) {
    const opts = options || {};
    const accent = opts.accent || state.settings.accent || 'en-US';
    const triggerEl = opts.triggerEl || null;

    const ok = Speech.speak(text, {
      accent: accent,
      rate: opts.rate || 0.96,
      onStart: function () {
        if (triggerEl) triggerEl.classList.add('audio-speaking');
      },
      onEnd: function () {
        if (triggerEl) triggerEl.classList.remove('audio-speaking');
      },
      onUnsupported: function () {
        showToast('Brauzeringiz Web Speech API ovozli talaffuzni qo‘llab-quvvatlamaydi.', 'warning');
      },
      onError: function () {
        showToast('Ovozni ijro etishda xatolik yuz berdi.', 'warning');
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
    $('themeIconLight').classList.toggle('hidden', isDark);
    $('themeIconDark').classList.toggle('hidden', !isDark);
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

  function switchView(viewName) {
    currentView = viewName;
    ['dashboard', 'study', 'vocabulary'].forEach(function (v) {
      const el = $('view-' + v);
      if (el) el.classList.toggle('hidden', v !== viewName);
    });

    document.querySelectorAll('[data-nav-view]').forEach(function (btn) {
      const isActive = btn.getAttribute('data-nav-view') === viewName;
      btn.className = btn.className
        .replace(/bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm/g, '')
        .replace(/text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white/g, '')
        .trim();
      if (isActive) {
        btn.className += ' bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm';
      } else {
        btn.className += ' text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
      }
    });

    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'study') {
      syncDeckSelects();
      setStudyMode(currentStudyMode);
    } else if (viewName === 'vocabulary') {
      syncDeckSelects();
      renderVocabulary();
    }
    refreshIcons();
  }

  /* ==================== DASHBOARD RENDERING ==================== */

  function renderDashboard() {
    const now = Date.now();
    const words = state.words;
    const total = words.length;
    const mastered = words.filter(function (w) { return w.mastered || w.status === 'mastered'; }).length;
    const newWords = words.filter(function (w) { return w.status === 'new' && !w.lastReviewedAt; }).length;
    const learning = words.filter(function (w) { return w.status === 'learning'; }).length;
    const review = words.filter(function (w) { return w.status === 'review'; }).length;
    const dueCount = SRS.getDueCards(words, now).length;
    const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    const streak = Storage.getActiveStreak(state.stats, now);
    const todayReviewed = Storage.getTodayReviewedCount(state.stats, now);
    const dailyGoal = Number(state.stats.dailyGoal) || 10;
    const goalPct = Math.min(100, Math.round((todayReviewed / dailyGoal) * 100));

    $('statTotalWords').textContent = String(total);
    $('statNewCount').textContent = newWords + ' ta yangi so‘z';
    $('statMasteredWords').textContent = String(mastered);
    $('statMasteredPct').textContent = masteryPct + '% to‘liq yodlangan';
    $('statDueWords').textContent = String(dueCount);
    $('statDueStatus').textContent = dueCount > 0 ? 'Takrorlash tayyor' : 'Bugungi reja bajarildi!';
    $('statStreakDays').textContent = String(streak);
    $('statLongestStreak').textContent = 'Rekord: ' + (Number(state.stats.longestStreak) || 0) + ' kun';

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

    renderDecksGrid(now);
    refreshIcons();
  }

  function renderDecksGrid(now) {
    const grid = $('decksGrid');
    grid.innerHTML = '';

    const allCards = state.words;
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
      card.className = 'glass-panel rounded-3xl p-5 flex flex-col justify-between gap-4 transition-all cursor-pointer border ' + palette.border;
      card.addEventListener('click', function () {
        activeDeck = deck.isVirtualAll ? 'ALL' : deck.name;
        studyScope = dueCount > 0 ? 'due' : 'all';
        currentStudyMode = 'flashcards';
        switchView('study');
      });

      const deleteBtnHtml = !deck.builtIn
        ? '<button type="button" data-delete-cat="' + escapeHtml(deck.name) + '" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors" title="Kategoriyani o‘chirish"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
        : '';

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
            deleteBtnHtml +
          '</div>' +
        '</div>' +
        '<div class="space-y-1.5">' +
          '<div class="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">' +
            '<span>O‘zlashtirish</span>' +
            '<span>' + pct + '% (' + masteredCount + '/' + totalCount + ')</span>' +
          '</div>' +
          '<div class="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">' +
            '<div class="h-full rounded-full bg-gradient-to-r ' + palette.bar + ' transition-all duration-500" style="width: ' + pct + '%"></div>' +
          '</div>' +
        '</div>';

      const delBtn = card.querySelector('[data-delete-cat]');
      if (delBtn) {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteCategory(deck.name);
        });
      }

      grid.appendChild(card);
    });
  }

  /* ==================== STUDY CONTROLS & DECK SYNC ==================== */

  function getFilteredStudyWords() {
    if (activeDeck === 'ALL') return state.words.slice();
    return state.words.filter(function (w) { return w.category === activeDeck; });
  }

  function syncDeckSelects() {
    const studySel = $('studyDeckSelect');
    const vocabCatFilter = $('vocabCategoryFilter');
    const modalCatSel = $('wordCategoryInput');

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

    if (vocabCatFilter) {
      const prev = vocabCatFilter.value || 'ALL';
      vocabCatFilter.innerHTML = '<option value="ALL">Barcha kategoriyalar</option>';
      state.categories.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        vocabCatFilter.appendChild(opt);
      });
      vocabCatFilter.value = prev;
    }

    if (modalCatSel) {
      const prev = modalCatSel.value;
      modalCatSel.innerHTML = '';
      state.categories.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        modalCatSel.appendChild(opt);
      });
      if (prev && state.categories.some(function (c) { return c.name === prev; })) {
        modalCatSel.value = prev;
      }
    }
  }

  function setStudyMode(mode) {
    currentStudyMode = mode;

    document.querySelectorAll('.study-mode-tab').forEach(function (btn) {
      const active = btn.getAttribute('data-study-mode') === mode;
      btn.className = 'study-mode-tab px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ' +
        (active
          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white');
    });

    ['flashcards', 'quiz', 'writing', 'listening'].forEach(function (m) {
      $('mode-' + m).classList.toggle('hidden', m !== mode);
    });

    $('studyScopeToggle').classList.toggle('hidden', mode !== 'flashcards');

    startCurrentStudyMode();
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
    if (currentStudyMode === 'flashcards') {
      initFlashcardsSession();
    } else if (currentStudyMode === 'quiz') {
      initQuizSession();
    } else if (currentStudyMode === 'writing') {
      initWritingSession();
    } else if (currentStudyMode === 'listening') {
      initListeningSession();
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
        $('fcEmptyTitle').textContent = 'Bu kategoriyada hali so‘z yo‘q';
        $('fcEmptyDesc').textContent = 'Yangi so‘z qo‘shib o‘rganishni boshlashingiz mumkin.';
        $('fcPracticeAllBtn').classList.add('hidden');
      } else if (fcSession.waitingWordId && fcSession.waitingRetryUntil && fcSession.waitingRetryUntil > Date.now()) {
        const secs = Math.max(1, Math.ceil((fcSession.waitingRetryUntil - Date.now()) / 1000));
        $('fcEmptyTitle').textContent = '1 daqiqalik takrorlash kutilyapti';
        $('fcEmptyDesc').textContent = '"Bilmadim" deb belgilangan so‘z taxminan ' + secs + ' soniyadan keyin avtomatik chiqadi yoki hoziroq qayta boshlashingiz mumkin.';
        $('fcPracticeAllBtn').textContent = 'Darhol qayta ko‘rish';
        $('fcPracticeAllBtn').classList.remove('hidden');
      } else {
        $('fcEmptyTitle').textContent = 'Ajoyib! Bugungi takrorlash yakunlandi';
        $('fcEmptyDesc').textContent = 'Ushbu kategoriyada hozircha takrorlanishi kerak bo‘lgan so‘z qolmadi.';
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
    $('fcDueBadge').textContent = dueCount > 0 ? dueCount + ' ta due' : 'Mashq rejimi';
    $('fcProgressBar').style.width = Math.round(((fcSession.index + 1) / total) * 100) + '%';

    // Front face
    $('fcCategoryBadge').textContent = card.category;
    $('fcLevelBadge').textContent = card.level;
    const statusMeta = SRS.getStatusMeta(card);
    const statusEl = $('fcStatusBadge');
    statusEl.textContent = statusMeta.label;
    statusEl.className = 'px-2.5 py-1 rounded-full text-xs font-bold border ' + statusMeta.badgeClass;

    $('fcPosText').textContent = card.partOfSpeech || 'word';
    $('fcWordText').textContent = card.word;
    $('fcPhoneticText').textContent = card.phonetic || '';

    // Back face
    $('fcBackWord').textContent = card.word;
    $('fcBackPhonetic').textContent = card.phonetic || '';
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
  }

  function moveFlashcard(delta) {
    if (fcSession.queue.length === 0) return;
    fcSession.index = (fcSession.index + delta + fcSession.queue.length) % fcSession.queue.length;
    fcSession.isFlipped = false;
    renderFlashcard();
  }

  function rateCurrentFlashcard(ratingKey) {
    if (fcSession.queue.length === 0) return;
    const currentCard = fcSession.queue[fcSession.index];
    const now = Date.now();
    const updatedCard = SRS.applyReviewRating(currentCard, ratingKey, now);

    state.words = state.words.map(function (w) {
      return w.id === updatedCard.id ? updatedCard : w;
    });
    state = Storage.recordStudyActivity(state, now);
    persist();

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
    const distractorsPool = shuffleArray(
      state.words.filter(function (w) {
        return w.id !== targetWord.id &&
          w.translation.trim().toLowerCase() !== targetWord.translation.trim().toLowerCase();
      })
    );
    const chosen = [targetWord];
    const usedTranslations = new Set([targetWord.translation.trim().toLowerCase()]);

    for (let i = 0; i < distractorsPool.length && chosen.length < 4; i++) {
      const trKey = distractorsPool[i].translation.trim().toLowerCase();
      if (!usedTranslations.has(trKey)) {
        usedTranslations.add(trKey);
        chosen.push(distractorsPool[i]);
      }
    }
    return shuffleArray(chosen);
  }

  function initQuizSession() {
    const pool = shuffleArray(getFilteredStudyWords());
    quizSession.items = pool.slice(0, Math.min(10, pool.length));
    quizSession.index = 0;
    quizSession.score = 0;
    quizSession.answered = false;
    quizSession.wrongWords = [];

    $('quizSummaryBox').classList.add('hidden');
    $('quizCardBox').classList.remove('hidden');

    if (quizSession.items.length === 0) {
      $('quizCardBox').classList.add('hidden');
      $('quizSummaryBox').classList.remove('hidden');
      $('quizSummaryStats').textContent = 'Ushbu kategoriyada test uchun so‘z topilmadi.';
      $('quizWrongList').innerHTML = '';
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
    $('quizPhonetic').textContent = q.phonetic || '';

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
    if (quizSession.answered || !quizSession.currentOptions || !quizSession.currentOptions[idx]) return;
    quizSession.answered = true;

    const target = quizSession.items[quizSession.index];
    const selected = quizSession.currentOptions[idx];
    const isCorrect = selected.id === target.id;

    if (isCorrect) {
      quizSession.score++;
    } else {
      quizSession.wrongWords.push(target);
    }

    state = Storage.recordStudyActivity(state, Date.now());
    persist();

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
    $('quizCardBox').classList.add('hidden');
    $('quizSummaryBox').classList.remove('hidden');
    const total = quizSession.items.length;
    const pct = total > 0 ? Math.round((quizSession.score / total) * 100) : 0;
    $('quizSummaryStats').textContent = total + ' ta savoldan ' + quizSession.score + ' tasi to‘g‘ri (' + pct + '%).';

    const wrongWrap = $('quizWrongList');
    wrongWrap.innerHTML = '';
    if (quizSession.wrongWords.length > 0) {
      const title = document.createElement('p');
      title.className = 'text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-300 mb-2';
      title.textContent = 'Qayta ko‘rib chiqish kerak bo‘lgan so‘zlar:';
      wrongWrap.appendChild(title);

      quizSession.wrongWords.forEach(function (w) {
        const row = document.createElement('div');
        row.className = 'p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 flex items-center justify-between gap-2 text-xs sm:text-sm';
        row.innerHTML = '<span class="font-extrabold">' + escapeHtml(w.word) + '</span><span class="text-slate-600 dark:text-slate-300">' + escapeHtml(w.translation) + '</span>';
        wrongWrap.appendChild(row);
      });
    }
    refreshIcons();
  }

  /* ==================== MODE C: WRITING / SPELLING ==================== */

  function initWritingSession() {
    const pool = shuffleArray(getFilteredStudyWords());
    writeSession.items = pool.slice(0, Math.min(10, pool.length));
    writeSession.index = 0;
    writeSession.score = 0;
    writeSession.answered = false;
    writeSession.hintStep = 0;

    $('writeSummaryBox').classList.add('hidden');
    $('writeCardBox').classList.remove('hidden');

    if (writeSession.items.length === 0) {
      $('writeCardBox').classList.add('hidden');
      $('writeSummaryBox').classList.remove('hidden');
      $('writeSummaryStats').textContent = 'Ushbu kategoriyada yozma mashq uchun so‘z topilmadi.';
      return;
    }
    renderWritingQuestion();
  }

  function renderWritingQuestion() {
    const total = writeSession.items.length;
    if (writeSession.index >= total) {
      $('writeCardBox').classList.add('hidden');
      $('writeSummaryBox').classList.remove('hidden');
      const pct = total > 0 ? Math.round((writeSession.score / total) * 100) : 0;
      $('writeSummaryStats').textContent = total + ' ta so‘zdan ' + writeSession.score + ' tasini to‘g‘ri yozdingiz (' + pct + '%).';
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

    const chars = word.split('').map(function (ch, idx) {
      if (ch === ' ' || ch === '-') return ch;
      if (idx === 0) return ch;
      if (writeSession.hintStep >= 2 && idx === word.length - 1) return ch;
      if (writeSession.hintStep >= 3 && idx % 3 === 0) return ch;
      return '_';
    });

    $('writeHintText').textContent = chars.join(' ');
  }

  function checkWritingAnswer(e) {
    if (e) e.preventDefault();
    if (writeSession.answered) {
      writeSession.index++;
      renderWritingQuestion();
      return;
    }

    const target = writeSession.items[writeSession.index];
    if (!target) return;

    const rawAnswer = $('writeInput').value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!rawAnswer) {
      showToast('Iltimos, javobni kiriting!', 'warning');
      return;
    }

    const expected = target.word.trim().replace(/\s+/g, ' ').toLowerCase();
    const isCorrect = rawAnswer === expected;

    writeSession.answered = true;
    if (isCorrect) writeSession.score++;

    state = Storage.recordStudyActivity(state, Date.now());
    persist();

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
      '<p class="font-mono-ipa text-xs opacity-85">' + escapeHtml(target.phonetic || '') + '</p>';
    fb.classList.remove('hidden');

    const nextBtn = $('writeNextBtn');
    nextBtn.classList.remove('hidden');
    nextBtn.classList.add('inline-flex');
    speakText(target.word);
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
    initListeningSession();
  }

  function initListeningSession() {
    const pool = shuffleArray(getFilteredStudyWords());
    listenSession.items = pool.slice(0, Math.min(10, pool.length));
    listenSession.index = 0;
    listenSession.score = 0;
    listenSession.answered = false;

    $('listenSummaryBox').classList.add('hidden');
    $('listenCardBox').classList.remove('hidden');

    if (listenSession.items.length === 0) {
      $('listenCardBox').classList.add('hidden');
      $('listenSummaryBox').classList.remove('hidden');
      $('listenSummaryStats').textContent = 'Ushbu kategoriyada listening mashqi uchun so‘z topilmadi.';
      return;
    }
    renderListeningQuestion(true);
  }

  function renderListeningQuestion(autoSpeak) {
    const total = listenSession.items.length;
    if (listenSession.index >= total) {
      $('listenCardBox').classList.add('hidden');
      $('listenSummaryBox').classList.remove('hidden');
      const pct = total > 0 ? Math.round((listenSession.score / total) * 100) : 0;
      $('listenSummaryStats').textContent = total + ' ta audiodan ' + listenSession.score + ' tasi to‘g‘ri topildi (' + pct + '%).';
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

    if (autoSpeak) {
      speakText(target.word, { triggerEl: $('listenSpeakBtn') });
    }
  }

  function selectListeningOption(idx) {
    if (listenSession.answered || !listenSession.currentOptions || !listenSession.currentOptions[idx]) return;
    const target = listenSession.items[listenSession.index];
    const selected = listenSession.currentOptions[idx];
    const isCorrect = selected.id === target.id;
    finishListeningAnswer(isCorrect, idx);
  }

  function checkListeningDictation(e) {
    if (e) e.preventDefault();
    if (listenSession.answered) {
      listenSession.index++;
      renderListeningQuestion(true);
      return;
    }
    const target = listenSession.items[listenSession.index];
    if (!target) return;
    const typed = $('listenDictationInput').value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!typed) {
      showToast('Eshitgan so‘zingizni yozing!', 'warning');
      return;
    }
    const expected = target.word.trim().replace(/\s+/g, ' ').toLowerCase();
    finishListeningAnswer(typed === expected, -1);
  }

  function finishListeningAnswer(isCorrect, chosenIdx) {
    listenSession.answered = true;
    const target = listenSession.items[listenSession.index];
    if (isCorrect) listenSession.score++;

    state = Storage.recordStudyActivity(state, Date.now());
    persist();
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
      '<p class="font-extrabold">' + escapeHtml(target.word) + ' <span class="font-mono-ipa font-normal opacity-80">' + escapeHtml(target.phonetic || '') + '</span></p>' +
      '<p class="text-xs sm:text-sm">' + escapeHtml(target.translation) + '</p>';
    fb.classList.remove('hidden');

    const nextBtn = $('listenNextBtn');
    nextBtn.classList.remove('hidden');
    nextBtn.classList.add('inline-flex');
  }

  /* ==================== VOCABULARY CRUD & IMPORT/EXPORT ==================== */

  function getFilteredVocabList() {
    const query = ($('vocabSearchInput').value || '').trim().toLowerCase();
    const cat = $('vocabCategoryFilter').value || 'ALL';
    const level = $('vocabLevelFilter').value || 'ALL';
    const status = $('vocabStatusFilter').value || 'ALL';
    const now = Date.now();

    return state.words.filter(function (w) {
      if (cat !== 'ALL' && w.category !== cat) return false;
      if (level !== 'ALL' && w.level !== level) return false;
      if (status === 'due' && !SRS.isCardDue(w, now)) return false;
      if (status !== 'ALL' && status !== 'due') {
        const meta = SRS.getStatusMeta(w);
        if (meta.key !== status) return false;
      }
      if (query) {
        const hay = (w.word + ' ' + w.translation + ' ' + (w.definition || '') + ' ' + w.category).toLowerCase();
        if (hay.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function renderVocabulary() {
    const list = getFilteredVocabList();
    const now = Date.now();
    $('vocabCountBadge').textContent = list.length + ' ta so‘z';

    const tbody = $('vocabTableBody');
    const mobileWrap = $('vocabMobileCards');
    const emptyEl = $('vocabEmptyState');

    tbody.innerHTML = '';
    mobileWrap.innerHTML = '';

    if (list.length === 0) {
      emptyEl.classList.remove('hidden');
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
          '<div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">' +
            '<span class="font-mono-ipa">' + escapeHtml(w.phonetic || '') + '</span>' +
            '<span class="italic">' + escapeHtml(w.partOfSpeech || '') + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-200 max-w-xs">' + escapeHtml(w.translation) + '</td>' +
        '<td class="py-3.5 px-4">' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/12 text-indigo-700 dark:text-indigo-300">' + escapeHtml(w.category) + '</span>' +
            '<span class="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 dark:bg-slate-800">' + escapeHtml(w.level) + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="py-3.5 px-4">' +
          '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ' + meta.badgeClass + '">' + escapeHtml(meta.label) + '</span>' +
          '<div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">' + escapeHtml(nextText) + '</div>' +
        '</td>' +
        '<td class="py-3.5 px-5 text-right">' +
          '<div class="inline-flex items-center gap-1">' +
            '<button type="button" data-action="speak" class="p-2 rounded-xl hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" title="Talaffuz"><i data-lucide="volume-2" class="w-4 h-4"></i></button>' +
            '<button type="button" data-action="edit" class="p-2 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300" title="Tahrirlash"><i data-lucide="pencil" class="w-4 h-4"></i></button>' +
            '<button type="button" data-action="delete" class="p-2 rounded-xl hover:bg-rose-500/15 text-rose-600 dark:text-rose-400" title="O‘chirish"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
          '</div>' +
        '</td>';

      tr.querySelector('[data-action="speak"]').addEventListener('click', function (e) { speakText(w.word, { triggerEl: e.currentTarget }); });
      tr.querySelector('[data-action="edit"]').addEventListener('click', function () { openWordModal(w); });
      tr.querySelector('[data-action="delete"]').addEventListener('click', function () { deleteWord(w); });
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
            '<p class="font-mono-ipa text-xs text-slate-500 dark:text-slate-400">' + escapeHtml(w.phonetic || '') + ' • ' + escapeHtml(w.partOfSpeech || '') + '</p>' +
          '</div>' +
          '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ' + meta.badgeClass + '">' + escapeHtml(meta.label) + '</span>' +
        '</div>' +
        '<p class="text-sm font-semibold">' + escapeHtml(w.translation) + '</p>' +
        '<div class="flex items-center justify-between pt-1">' +
          '<span class="text-xs font-bold text-indigo-600 dark:text-indigo-300">' + escapeHtml(w.category) + '</span>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" data-action="speak" class="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><i data-lucide="volume-2" class="w-4 h-4"></i></button>' +
            '<button type="button" data-action="edit" class="p-2 rounded-xl bg-slate-200/70 dark:bg-slate-800"><i data-lucide="pencil" class="w-4 h-4"></i></button>' +
            '<button type="button" data-action="delete" class="p-2 rounded-xl bg-rose-500/10 text-rose-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
          '</div>' +
        '</div>';

      mCard.querySelector('[data-action="speak"]').addEventListener('click', function (e) { speakText(w.word, { triggerEl: e.currentTarget }); });
      mCard.querySelector('[data-action="edit"]').addEventListener('click', function () { openWordModal(w); });
      mCard.querySelector('[data-action="delete"]').addEventListener('click', function () { deleteWord(w); });
      mobileWrap.appendChild(mCard);
    });

    refreshIcons();
  }

  /* ==================== MODALS (WORD, CATEGORY, CONFIRM, SHORTCUTS) ==================== */

  function openWordModal(wordObj) {
    syncDeckSelects();
    const isEdit = Boolean(wordObj && wordObj.id);
    $('wordModalTitle').textContent = isEdit ? 'So‘zni tahrirlash' : 'Yangi so‘z qo‘shish';
    $('wordIdInput').value = isEdit ? wordObj.id : '';
    $('wordTextInput').value = isEdit ? wordObj.word : '';
    $('wordPhoneticInput').value = isEdit ? (wordObj.phonetic || '') : '';
    $('wordPosInput').value = isEdit ? (wordObj.partOfSpeech || 'noun') : 'noun';
    $('wordCategoryInput').value = isEdit ? wordObj.category : (activeDeck !== 'ALL' ? activeDeck : 'IELTS');
    $('wordLevelInput').value = isEdit ? wordObj.level : 'B2';
    $('wordTranslationInput').value = isEdit ? wordObj.translation : '';
    $('wordDefinitionInput').value = isEdit ? (wordObj.definition || '') : '';
    const ex = isEdit && Array.isArray(wordObj.examples) ? wordObj.examples : [];
    $('wordExample1Input').value = ex[0] || '';
    $('wordExample2Input').value = ex[1] || '';
    $('wordSynonymsInput').value = isEdit && Array.isArray(wordObj.synonyms) ? wordObj.synonyms.join(', ') : '';
    $('wordAntonymsInput').value = isEdit && Array.isArray(wordObj.antonyms) ? wordObj.antonyms.join(', ') : '';
    $('wordMnemonicInput').value = isEdit ? (wordObj.mnemonic || '') : '';

    $('wordModal').classList.remove('hidden');
    $('wordTextInput').focus();
    refreshIcons();
  }

  function closeWordModal() {
    $('wordModal').classList.add('hidden');
  }

  function handleWordFormSubmit(e) {
    e.preventDefault();
    const id = $('wordIdInput').value.trim();
    const wordText = $('wordTextInput').value.trim();
    const translation = $('wordTranslationInput').value.trim();

    if (!wordText || !translation) {
      showToast('So‘z va o‘zbekcha tarjima majburiy!', 'warning');
      return;
    }

    const now = Date.now();
    const examples = [$('wordExample1Input').value.trim(), $('wordExample2Input').value.trim()].filter(Boolean);

    const payload = {
      word: wordText,
      phonetic: $('wordPhoneticInput').value.trim(),
      partOfSpeech: $('wordPosInput').value,
      category: $('wordCategoryInput').value,
      level: $('wordLevelInput').value,
      translation: translation,
      definition: $('wordDefinitionInput').value.trim(),
      examples: examples,
      synonyms: $('wordSynonymsInput').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      antonyms: $('wordAntonymsInput').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      mnemonic: $('wordMnemonicInput').value.trim()
    };

    if (id) {
      state.words = state.words.map(function (w) {
        if (w.id !== id) return w;
        return Object.assign({}, w, payload, { updatedAt: now });
      });
      showToast('"' + wordText + '" yangilandi!', 'success');
    } else {
      const created = Storage.normalizeWordRecord(payload, now);
      state.words.unshift(created);
      showToast('"' + wordText + '" lug‘atga qo‘shildi!', 'success');
    }

    persist();
    closeWordModal();
    refreshActiveView();
  }

  function deleteWord(wordObj) {
    openConfirm(
      'So‘zni o‘chirish',
      '"' + wordObj.word + '" so‘zini lug‘atdan butunlay o‘chirmoqchimisiz?',
      function () {
        state.words = state.words.filter(function (w) { return w.id !== wordObj.id; });
        persist();
        showToast('"' + wordObj.word + '" o‘chirildi.', 'info');
        refreshActiveView();
      }
    );
  }

  function openCategoryModal() {
    $('categoryNameInput').value = '';
    $('categoryModal').classList.remove('hidden');
    $('categoryNameInput').focus();
    refreshIcons();
  }

  function closeCategoryModal() {
    $('categoryModal').classList.add('hidden');
  }

  function handleCategoryFormSubmit(e) {
    e.preventDefault();
    const name = $('categoryNameInput').value.trim();
    if (!name) return;

    const exists = state.categories.some(function (c) {
      return c.name.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      showToast('Bu nomdagi kategoriya allaqachon mavjud!', 'warning');
      return;
    }

    state.categories.push({
      id: name,
      name: name,
      color: $('categoryColorSelect').value,
      icon: $('categoryIconSelect').value,
      builtIn: false
    });
    persist();
    closeCategoryModal();
    syncDeckSelects();
    renderDashboard();
    showToast('"' + name + '" kategoriyasi yaratildi!', 'success');
  }

  function deleteCategory(catName) {
    openConfirm(
      'Kategoriyani o‘chirish',
      '"' + catName + '" kategoriyasini o‘chirsangiz, undagi so‘zlar "General English" bo‘limiga o‘tkaziladi.',
      function () {
        state.categories = state.categories.filter(function (c) { return c.name !== catName; });
        state.words = state.words.map(function (w) {
          return w.category === catName ? Object.assign({}, w, { category: 'General English' }) : w;
        });
        if (activeDeck === catName) activeDeck = 'ALL';
        persist();
        syncDeckSelects();
        refreshActiveView();
        showToast('"' + catName + '" kategoriyasi o‘chirildi.', 'info');
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
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'study') startCurrentStudyMode();
    if (currentView === 'vocabulary') renderVocabulary();
  }

  /* ==================== IMPORT / EXPORT ==================== */

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

  function handleExportJSON() {
    const json = Storage.exportToJSON(state);
    downloadFile('swe-english-extra-vocabulary.json', json, 'application/json;charset=utf-8');
    showToast('Lug‘at JSON formatida yuklab olindi!', 'success');
  }

  function handleExportCSV() {
    const csv = '\uFEFF' + Storage.exportToCSV(state.words);
    downloadFile('swe-english-extra-vocabulary.csv', csv, 'text/csv;charset=utf-8');
    showToast('Lug‘at CSV (Excel) formatida yuklab olindi!', 'success');
  }

  function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const text = String(reader.result || '');
        const lowerName = file.name.toLowerCase();
        let items = [];
        let importedCats = [];

        if (lowerName.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            items = parsed;
          } else if (parsed && Array.isArray(parsed.words)) {
            items = parsed.words;
            if (Array.isArray(parsed.categories)) importedCats = parsed.categories;
          } else {
            throw new Error('Noto‘g‘ri JSON tuzilmasi');
          }
        } else {
          items = Storage.parseCSV(text);
        }

        const result = Storage.mergeImportedWords(state, items, importedCats, Date.now());
        state = result.state;
        persist();
        syncDeckSelects();
        refreshActiveView();
        showToast(
          'Import yakunlandi: +' + result.summary.added + ' yangi, ' + result.summary.updated + ' yangilandi.',
          'success'
        );
      } catch (err) {
        showToast('Faylni o‘qishda xatolik: JSON yoki CSV formatini tekshiring.', 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleRestoreDefaults() {
    const result = Storage.mergeImportedWords(state, DefaultData.DEFAULT_WORDS, DefaultData.DEFAULT_CATEGORIES, Date.now());
    state = result.state;
    persist();
    syncDeckSelects();
    refreshActiveView();
    showToast(
      'B2/C1 standart lug‘at tekshirildi: +' + result.summary.added + ' ta qo‘shildi, ' + result.summary.updated + ' ta yangilandi.',
      'success'
    );
  }

  /* ==================== KEYBOARD SHORTCUTS ==================== */

  function isAnyModalOpen() {
    return !['wordModal', 'categoryModal', 'shortcutsModal', 'confirmModal'].every(function (id) {
      return $(id).classList.contains('hidden');
    });
  }

  function closeAllModals() {
    closeWordModal();
    closeCategoryModal();
    closeConfirm();
    $('shortcutsModal').classList.add('hidden');
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

    // 'S' speaks the current word across all study modes
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (currentStudyMode === 'flashcards' && fcSession.queue[fcSession.index]) {
        speakText(fcSession.queue[fcSession.index].word, { triggerEl: $('fcSpeakBtn') });
      } else if (currentStudyMode === 'quiz' && quizSession.items[quizSession.index]) {
        speakText(quizSession.items[quizSession.index].word, { triggerEl: $('quizSpeakBtn') });
      } else if (currentStudyMode === 'writing' && writeSession.items[writeSession.index]) {
        speakText(writeSession.items[writeSession.index].word, { triggerEl: $('writeSpeakBtn') });
      } else if (currentStudyMode === 'listening' && listenSession.items[listenSession.index]) {
        speakText(listenSession.items[listenSession.index].word, { triggerEl: $('listenSpeakBtn') });
      }
      return;
    }

    if (currentStudyMode === 'flashcards') {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
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
      if (['1', '2', '3', '4'].indexOf(e.key) !== -1) {
        e.preventDefault();
        selectQuizOption(Number(e.key) - 1);
      } else if (e.key === 'ArrowRight' && quizSession.answered) {
        e.preventDefault();
        quizSession.index++;
        renderQuizQuestion();
      }
    }

    if (currentStudyMode === 'listening' && listenSession.type === 'quiz') {
      if (['1', '2', '3', '4'].indexOf(e.key) !== -1) {
        e.preventDefault();
        selectListeningOption(Number(e.key) - 1);
      } else if (e.key === 'ArrowRight' && listenSession.answered) {
        e.preventDefault();
        listenSession.index++;
        renderListeningQuestion(true);
      }
    }
  }

  /* ==================== INITIALIZATION & EVENT WIRING ==================== */

  function bindEvents() {
    // Theme & Accent
    $('themeToggleBtn').addEventListener('click', toggleTheme);
    $('accentUsBtn').addEventListener('click', function () { setAccent('en-US'); });
    $('accentUkBtn').addEventListener('click', function () { setAccent('en-GB'); });

    // Navigation
    document.querySelectorAll('[data-nav-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.getAttribute('data-nav-view'));
      });
    });

    // Dashboard CTAs
    $('dashDueCtaBtn').addEventListener('click', function () {
      activeDeck = 'ALL';
      studyScope = SRS.getDueCards(state.words, Date.now()).length > 0 ? 'due' : 'all';
      currentStudyMode = 'flashcards';
      switchView('study');
    });
    $('openAddCategoryBtn').addEventListener('click', openCategoryModal);
    $('openAddWordHeaderBtn').addEventListener('click', function () { openWordModal(null); });

    // Study controls
    document.querySelectorAll('[data-study-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setStudyMode(btn.getAttribute('data-study-mode'));
      });
    });

    $('studyDeckSelect').addEventListener('change', function (e) {
      activeDeck = e.target.value;
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
    $('fcCardInner').addEventListener('click', function () { toggleFlashcardFlip(); });
    $('fcCardInner').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleFlashcardFlip();
      }
    });
    $('fcFlipBtn').addEventListener('click', function () { toggleFlashcardFlip(); });
    $('fcPrevBtn').addEventListener('click', function () { moveFlashcard(-1); });
    $('fcNextBtn').addEventListener('click', function () { moveFlashcard(1); });

    $('fcSpeakBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { triggerEl: e.currentTarget });
    });
    $('fcSpeakUsBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { accent: 'en-US', triggerEl: e.currentTarget });
    });
    $('fcSpeakUkBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { accent: 'en-GB', triggerEl: e.currentTarget });
    });
    $('fcBackSpeakBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) speakText(card.word, { triggerEl: e.currentTarget });
    });
    $('fcEditBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      const card = fcSession.queue[fcSession.index];
      if (card) openWordModal(card);
    });

    document.querySelectorAll('[data-srs-rate]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        rateCurrentFlashcard(btn.getAttribute('data-srs-rate'));
      });
    });

    $('fcPracticeAllBtn').addEventListener('click', function () {
      if (fcSession.waitingWordId) {
        // Immediate retry for waiting word
        fcSession.waitingRetryUntil = null;
        const word = state.words.find(function (w) { return w.id === fcSession.waitingWordId; });
        fcSession.waitingWordId = null;
        if (word) {
          fcSession.queue = [word];
          fcSession.index = 0;
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
      if (q) speakText(q.word, { triggerEl: e.currentTarget });
    });
    $('quizNextBtn').addEventListener('click', function () {
      quizSession.index++;
      renderQuizQuestion();
    });
    $('quizRestartBtn').addEventListener('click', initQuizSession);

    // Writing interactions
    $('writeSpeakBtn').addEventListener('click', function (e) {
      const item = writeSession.items[writeSession.index];
      if (item) speakText(item.word, { triggerEl: e.currentTarget });
    });
    $('writeHintBtn').addEventListener('click', revealWritingHint);
    $('writeForm').addEventListener('submit', checkWritingAnswer);
    $('writeNextBtn').addEventListener('click', function () {
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
      if (item) speakText(item.word, { triggerEl: e.currentTarget });
    });
    $('listenSlowBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { rate: 0.72, triggerEl: $('listenSpeakBtn') });
    });
    $('listenUsBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { accent: 'en-US', triggerEl: $('listenSpeakBtn') });
    });
    $('listenUkBtn').addEventListener('click', function () {
      const item = listenSession.items[listenSession.index];
      if (item) speakText(item.word, { accent: 'en-GB', triggerEl: $('listenSpeakBtn') });
    });
    $('listenDictationForm').addEventListener('submit', checkListeningDictation);
    $('listenNextBtn').addEventListener('click', function () {
      listenSession.index++;
      renderListeningQuestion(true);
    });
    $('listenRestartBtn').addEventListener('click', initListeningSession);

    // Vocabulary CRUD & Filters
    $('vocabSearchInput').addEventListener('input', renderVocabulary);
    $('vocabCategoryFilter').addEventListener('change', renderVocabulary);
    $('vocabLevelFilter').addEventListener('change', renderVocabulary);
    $('vocabStatusFilter').addEventListener('change', renderVocabulary);
    $('vocabAddWordBtn').addEventListener('click', function () { openWordModal(null); });
    $('vocabExportJsonBtn').addEventListener('click', handleExportJSON);
    $('vocabExportCsvBtn').addEventListener('click', handleExportCSV);
    $('vocabImportBtn').addEventListener('click', function () { $('vocabImportInput').click(); });
    $('vocabImportInput').addEventListener('change', handleImportFile);
    $('vocabRestoreDefaultsBtn').addEventListener('click', handleRestoreDefaults);

    // Modals
    $('wordForm').addEventListener('submit', handleWordFormSubmit);
    $('closeWordModalBtn').addEventListener('click', closeWordModal);
    $('cancelWordModalBtn').addEventListener('click', closeWordModal);
    $('wordModal').addEventListener('click', function (e) { if (e.target === $('wordModal')) closeWordModal(); });

    $('categoryForm').addEventListener('submit', handleCategoryFormSubmit);
    $('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
    $('cancelCategoryModalBtn').addEventListener('click', closeCategoryModal);
    $('categoryModal').addEventListener('click', function (e) { if (e.target === $('categoryModal')) closeCategoryModal(); });

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

  function init() {
    applyTheme(state.settings.theme);
    applyAccentUI();
    syncDeckSelects();
    bindEvents();
    setStudyMode('flashcards');
    setListeningType('quiz');
    switchView('dashboard');
    refreshIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
