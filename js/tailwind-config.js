/**
 * SWE ENGLISH EXTRA — Tailwind CDN Configuration (CSP-safe external script)
 */
(function () {
  'use strict';
  if (typeof tailwind !== 'undefined') {
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          }
        }
      }
    };
  }
})();
