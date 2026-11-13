/**
 * SWE ENGLISH EXTRA — Web Speech API Pronunciation Engine (US & UK Accents)
 */
(function (root) {
  'use strict';

  let cachedVoices = [];

  function isSupported() {
    return typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  function refreshVoices() {
    if (!isSupported()) return [];
    cachedVoices = window.speechSynthesis.getVoices() || [];
    return cachedVoices;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  function pickVoice(accent) {
    const voices = cachedVoices.length ? cachedVoices : refreshVoices();
    if (!voices.length) return null;

    const targetLang = accent === 'en-GB' ? 'en-gb' : 'en-us';
    const altLang = accent === 'en-GB' ? 'en_gb' : 'en_us';

    const preferredKeywords = accent === 'en-GB'
      ? ['google uk', 'daniel', 'libby', 'ryan', 'sonia', 'hazel', 'kate', 'serena']
      : ['google us', 'aria', 'guy', 'jenny', 'samantha', 'alex', 'zira', 'david'];

    const exactMatches = voices.filter(function (v) {
      const lang = String(v.lang || '').toLowerCase();
      return lang === targetLang || lang === altLang || lang.indexOf(targetLang) === 0;
    });

    if (exactMatches.length > 0) {
      const preferred = exactMatches.find(function (v) {
        const name = String(v.name || '').toLowerCase();
        return preferredKeywords.some(function (kw) { return name.indexOf(kw) !== -1; });
      });
      return preferred || exactMatches[0];
    }

    const englishAny = voices.filter(function (v) {
      return String(v.lang || '').toLowerCase().indexOf('en') === 0;
    });
    return englishAny[0] || null;
  }

  function stop() {
    if (isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        // Ignore browser cancel quirk
      }
    }
  }

  function speak(text, options) {
    const opts = options || {};
    const content = String(text || '').trim();
    if (!content) return false;

    if (!isSupported()) {
      if (typeof opts.onUnsupported === 'function') {
        opts.onUnsupported();
      }
      return false;
    }

    const accent = opts.accent === 'en-GB' ? 'en-GB' : 'en-US';
    const rate = typeof opts.rate === 'number' ? opts.rate : 0.96;

    stop();

    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.lang = accent;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    const voice = pickVoice(accent);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = function () {
      if (typeof opts.onStart === 'function') opts.onStart();
    };
    utterance.onend = function () {
      if (typeof opts.onEnd === 'function') opts.onEnd();
    };
    utterance.onerror = function (event) {
      if (typeof opts.onEnd === 'function') opts.onEnd();
      if (event && event.error !== 'interrupted' && event.error !== 'canceled') {
        if (typeof opts.onError === 'function') opts.onError(event);
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      if (typeof opts.onError === 'function') opts.onError(err);
      return false;
    }
  }

  const api = {
    isSupported: isSupported,
    refreshVoices: refreshVoices,
    pickVoice: pickVoice,
    speak: speak,
    stop: stop
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWESpeech = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
