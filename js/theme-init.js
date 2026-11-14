/**
 * SWE ENGLISH EXTRA — Initial Theme Loader (CSP-safe external script)
 * Prevents theme flicker before CSS/Tailwind applies.
 */
(function () {
  'use strict';
  try {
    var raw = localStorage.getItem('swe_english_extra_v1');
    var theme = 'light';
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.settings && parsed.settings.theme) {
        theme = parsed.settings.theme;
      }
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    // Ignore storage access restriction
  }
})();
