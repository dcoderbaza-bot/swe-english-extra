/**
 * SWE ENGLISH EXTRA — Spaced Repetition System (SRS) Engine
 * Intervals:
 * - again (Bilmadim): +1 minute (learning)
 * - hard  (Qiyin):    +1 day    (learning)
 * - good  (Yaxshi):   +3 days   (review)
 * - easy  (Oson):     +7 days   (mastered)
 */
(function (root) {
  'use strict';

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const RATINGS = {
    again: {
      key: 'again',
      labelUz: 'Bilmadim',
      labelEn: 'Again',
      hintUz: '1 daqiqadan keyin',
      delayMs: MINUTE_MS,
      intervalDays: 0,
      status: 'learning',
      mastered: false
    },
    hard: {
      key: 'hard',
      labelUz: 'Qiyin',
      labelEn: 'Hard',
      hintUz: '1 kundan keyin',
      delayMs: DAY_MS,
      intervalDays: 1,
      status: 'learning',
      mastered: false
    },
    good: {
      key: 'good',
      labelUz: 'Yaxshi',
      labelEn: 'Good',
      hintUz: '3 kundan keyin',
      delayMs: 3 * DAY_MS,
      intervalDays: 3,
      status: 'review',
      mastered: false
    },
    easy: {
      key: 'easy',
      labelUz: 'Oson',
      labelEn: 'Easy',
      hintUz: '7 kun • Mastered',
      delayMs: 7 * DAY_MS,
      intervalDays: 7,
      status: 'mastered',
      mastered: true
    }
  };

  function createInitialSrsState(now) {
    const timestamp = typeof now === 'number' ? now : Date.now();
    return {
      status: 'new',
      mastered: false,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      lastRating: null,
      lastReviewedAt: null,
      nextReviewAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function applyReviewRating(card, ratingKey, now) {
    const rule = RATINGS[ratingKey];
    if (!rule) {
      throw new Error('Unknown SRS rating: ' + ratingKey);
    }

    const timestamp = typeof now === 'number' ? now : Date.now();
    const prevReps = Number(card.repetitions) || 0;
    const prevLapses = Number(card.lapses) || 0;

    return Object.assign({}, card, {
      status: rule.status,
      mastered: rule.mastered,
      intervalDays: rule.intervalDays,
      repetitions: ratingKey === 'again' ? 0 : prevReps + 1,
      lapses: ratingKey === 'again' ? prevLapses + 1 : prevLapses,
      lastRating: ratingKey,
      lastReviewedAt: timestamp,
      nextReviewAt: timestamp + rule.delayMs,
      updatedAt: timestamp
    });
  }

  function isCardDue(card, now) {
    const timestamp = typeof now === 'number' ? now : Date.now();
    if (!card || card.nextReviewAt === null || card.nextReviewAt === undefined) {
      return true;
    }
    return Number(card.nextReviewAt) <= timestamp;
  }

  function getDueCards(cards, now) {
    const timestamp = typeof now === 'number' ? now : Date.now();
    return (cards || []).filter(function (c) {
      return isCardDue(c, timestamp);
    });
  }

  function sortStudyQueue(cards, now) {
    const timestamp = typeof now === 'number' ? now : Date.now();
    const rank = { learning: 0, new: 1, review: 2, mastered: 3 };
    return (cards || []).slice().sort(function (a, b) {
      const aDue = isCardDue(a, timestamp) ? 0 : 1;
      const bDue = isCardDue(b, timestamp) ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;

      const aRank = rank[a.status] !== undefined ? rank[a.status] : 1;
      const bRank = rank[b.status] !== undefined ? rank[b.status] : 1;
      if (aRank !== bRank) return aRank - bRank;

      return (Number(a.nextReviewAt) || 0) - (Number(b.nextReviewAt) || 0);
    });
  }

  function formatNextReviewText(card, now) {
    const timestamp = typeof now === 'number' ? now : Date.now();
    if (!card || card.status === 'new' && !card.lastReviewedAt) {
      return 'Yangi so‘z';
    }
    if (isCardDue(card, timestamp)) {
      return 'Takrorlash vaqti';
    }
    const diffMs = Number(card.nextReviewAt) - timestamp;
    if (diffMs < MINUTE_MS) {
      return '1 daqiqa ichida';
    }
    if (diffMs < 60 * MINUTE_MS) {
      const mins = Math.ceil(diffMs / MINUTE_MS);
      return mins + ' daqiqadan keyin';
    }
    if (diffMs < DAY_MS) {
      const hours = Math.ceil(diffMs / (60 * MINUTE_MS));
      return hours + ' soatdan keyin';
    }
    const days = Math.ceil(diffMs / DAY_MS);
    return days + ' kundan keyin';
  }

  function getStatusMeta(card) {
    if (card && (card.mastered || card.status === 'mastered')) {
      return {
        key: 'mastered',
        label: 'Mastered',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
      };
    }
    if (card && card.status === 'review') {
      return {
        key: 'review',
        label: 'Takrorlanmoqda',
        badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25'
      };
    }
    if (card && card.status === 'learning') {
      return {
        key: 'learning',
        label: 'O‘rganilmoqda',
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25'
      };
    }
    return {
      key: 'new',
      label: 'Yangi',
      badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25'
    };
  }

  const api = {
    MINUTE_MS: MINUTE_MS,
    DAY_MS: DAY_MS,
    RATINGS: RATINGS,
    createInitialSrsState: createInitialSrsState,
    applyReviewRating: applyReviewRating,
    isCardDue: isCardDue,
    getDueCards: getDueCards,
    sortStudyQueue: sortStudyQueue,
    formatNextReviewText: formatNextReviewText,
    getStatusMeta: getStatusMeta
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWESRS = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
