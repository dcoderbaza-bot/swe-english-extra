/**
 * SWE ENGLISH EXTRA — Neural API-Key TTS & Web Speech Pronunciation Engine (US & UK Accents)
 * Shares TTS provider presets, key resolution, and PCM->WAV wrapping with server.js.
 */
(function (root) {
  'use strict';

  const TTS_PROVIDER_DEFAULTS = {
    auto: {
      label: 'Avtomatik (AI kalitidan: OpenAI / Gemini)',
      defaultModel: '',
      endpoint: '',
      voiceUs: 'coral',
      voiceUk: 'fable'
    },
    openai: {
      label: 'OpenAI Neural TTS (MP3)',
      defaultModel: 'gpt-4o-mini-tts',
      endpoint: 'https://api.openai.com/v1/audio/speech',
      voiceUs: 'coral',
      voiceUk: 'fable'
    },
    gemini: {
      label: 'Google Gemini Native Audio TTS (WAV)',
      defaultModel: 'gemini-2.5-flash-preview-tts',
      endpoint: '',
      voiceUs: 'Kore',
      voiceUk: 'Fenrir'
    },
    elevenlabs: {
      label: 'ElevenLabs Ultra-Realistic TTS (MP3)',
      defaultModel: 'eleven_flash_v2_5',
      endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
      voiceUs: 'EXAVITQu4vr4xnSDxMaL',
      voiceUk: 'JBFqnCBsd6RMkjVDRZzb'
    },
    custom: {
      label: 'Custom HTTPS OpenAI-Compatible TTS',
      defaultModel: 'tts-1',
      endpoint: '',
      voiceUs: 'alloy',
      voiceUk: 'fable'
    },
    browser: {
      label: 'Faqat Brauzer Ovozi (Web Speech, 0 API)',
      defaultModel: '',
      endpoint: '',
      voiceUs: '',
      voiceUk: ''
    }
  };

  function resolveEffectiveTtsConfig(rawConfig, accent) {
    const cfg = rawConfig || {};
    const aiProvider = String(cfg.provider || 'deepseek').toLowerCase();
    const rawTtsProvider = String(cfg.ttsProvider || 'auto').toLowerCase();
    const rawAiKey = String(cfg.apiKey || '').trim();
    const rawTtsKey = String(cfg.ttsApiKey || '').trim();
    const aiKeyClean = rawAiKey.indexOf('••') !== -1 ? '' : rawAiKey;
    const ttsKeyClean = rawTtsKey.indexOf('••') !== -1 ? '' : rawTtsKey;
    const hasAiFlag = Boolean(aiKeyClean || cfg.hasApiKey);
    const hasDedicatedTtsFlag = Boolean(ttsKeyClean || cfg.hasTtsKey);

    let provider = rawTtsProvider;
    if (provider === 'auto') {
      if (hasDedicatedTtsFlag) {
        provider = (aiProvider === 'gemini' && !cfg.ttsCustomUrl) ? 'gemini' : (cfg.ttsCustomUrl ? 'custom' : 'openai');
      } else if (aiProvider === 'openai' && hasAiFlag) {
        provider = 'openai';
      } else if (aiProvider === 'gemini' && hasAiFlag) {
        provider = 'gemini';
      } else {
        provider = 'browser';
      }
    }

    if (!TTS_PROVIDER_DEFAULTS[provider]) {
      provider = 'browser';
    }

    const preset = TTS_PROVIDER_DEFAULTS[provider];
    const canShareAiKey = (provider === aiProvider) && !ttsKeyClean && !cfg.hasTtsKey;
    const effectiveKey = provider === 'browser'
      ? ''
      : (ttsKeyClean || (canShareAiKey ? aiKeyClean : ''));
    const hasKey = provider !== 'browser' && Boolean(
      effectiveKey ||
      hasDedicatedTtsFlag ||
      (canShareAiKey && cfg.hasApiKey)
    );

    const isUk = accent === 'en-GB';
    const customVoice = isUk ? String(cfg.ttsVoiceUk || '').trim() : String(cfg.ttsVoiceUs || '').trim();
    const defaultVoice = isUk ? preset.voiceUk : preset.voiceUs;

    return {
      provider: provider,
      model: String(cfg.ttsModel || '').trim() || preset.defaultModel,
      customUrl: String(cfg.ttsCustomUrl || '').trim(),
      voice: customVoice || defaultVoice,
      apiKey: effectiveKey,
      hasKey: hasKey,
      sharesPrimaryAiKey: canShareAiKey && hasAiFlag
    };
  }

  function parseSampleRateFromMime(mimeType) {
    const match = String(mimeType || '').match(/rate=(\d{4,6})/i);
    if (!match) return 24000;
    const parsed = Number(match[1]);
    return (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 96000) ? parsed : 24000;
  }

  function pcm16ToWavUint8Array(pcmInput, sampleRate) {
    const pcmBytes = pcmInput instanceof Uint8Array
      ? pcmInput
      : new Uint8Array(pcmInput || 0);
    const rate = parseSampleRateFromMime(typeof sampleRate === 'string' ? sampleRate : ('rate=' + (sampleRate || 24000)));
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = rate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBytes.byteLength;
    const out = new Uint8Array(44 + dataSize);
    const view = new DataView(out.buffer);

    function writeAscii(offset, text) {
      for (let i = 0; i < text.length; i++) {
        out[offset + i] = text.charCodeAt(i);
      }
    }

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);
    out.set(pcmBytes, 44);
    return out;
  }

  let cachedVoices = [];
  let activeAudioEl = null;
  let activePlayToken = 0;
  let remoteTtsHandler = null;
  let lastEngineUsed = 'browser';
  const MAX_CLIENT_AUDIO_CACHE = 240;
  const audioBlobCache = new Map();

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

  function stopAudioEl() {
    if (activeAudioEl) {
      try {
        activeAudioEl.pause();
        activeAudioEl.currentTime = 0;
      } catch (e) {
        // Ignore pause cleanup errors
      }
      activeAudioEl = null;
    }
  }

  function stop() {
    activePlayToken++;
    stopAudioEl();
    if (isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        // Ignore browser cancel quirk
      }
    }
  }

  function clearCache() {
    audioBlobCache.forEach(function (entry) {
      if (entry && entry.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(entry.url); } catch (e) {}
      }
    });
    audioBlobCache.clear();
  }

  function setRemoteTtsHandler(fn) {
    remoteTtsHandler = typeof fn === 'function' ? fn : null;
  }

  function getLastEngineUsed() {
    return lastEngineUsed;
  }

  function putAudioCacheEntry(key, blob, provider) {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || !blob) return '';
    if (audioBlobCache.size >= MAX_CLIENT_AUDIO_CACHE) {
      const oldestKey = audioBlobCache.keys().next().value;
      const oldest = oldestKey ? audioBlobCache.get(oldestKey) : null;
      if (oldest && oldest.url && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(oldest.url); } catch (e) {}
      }
      if (oldestKey) audioBlobCache.delete(oldestKey);
    }
    const url = URL.createObjectURL(blob);
    audioBlobCache.set(key, { url: url, provider: provider || 'api' });
    return url;
  }

  function playObjectUrl(url, rate, providerLabel, token, opts) {
    if (typeof Audio === 'undefined' || !url) return false;
    stopAudioEl();
    const audio = new Audio(url);
    activeAudioEl = audio;
    const clampedRate = Math.max(0.55, Math.min(1.5, Number(rate) || 1.0));
    audio.playbackRate = clampedRate;
    if ('preservesPitch' in audio) audio.preservesPitch = true;

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (activeAudioEl === audio) activeAudioEl = null;
      if (opts && opts._revokeOnEnd && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }
      if (typeof opts.onEnd === 'function') opts.onEnd();
    }

    audio.onplaying = function () {
      if (token !== activePlayToken) return;
      lastEngineUsed = 'api:' + (providerLabel || 'tts');
      if (typeof opts.onStart === 'function') opts.onStart(lastEngineUsed);
    };
    audio.onended = finish;
    audio.onerror = function () {
      finish();
    };

    try {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          finish();
          if (token === activePlayToken) {
            speakViaBrowser(opts._content, opts);
          }
        });
      }
      return true;
    } catch (e) {
      finish();
      return false;
    }
  }

  function speakViaBrowser(content, opts) {
    if (!isSupported()) {
      if (typeof opts.onEnd === 'function') opts.onEnd();
      if (typeof opts.onUnsupported === 'function') opts.onUnsupported();
      return false;
    }

    const accent = opts.accent === 'en-GB' ? 'en-GB' : 'en-US';
    const rate = typeof opts.rate === 'number' ? opts.rate : 0.96;

    try { window.speechSynthesis.cancel(); } catch (e) {}

    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.lang = accent;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    const voice = pickVoice(accent);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = function () {
      lastEngineUsed = 'browser';
      if (typeof opts.onStart === 'function') opts.onStart('browser');
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

  function speak(text, options) {
    const opts = Object.assign({}, options || {});
    const content = String(text || '').trim();
    if (!content) return false;
    opts._content = content;

    const accent = opts.accent === 'en-GB' ? 'en-GB' : 'en-US';
    const rate = typeof opts.rate === 'number' ? opts.rate : 0.96;

    stop();
    const myToken = activePlayToken;

    const canTryApi = Boolean(opts.useApiTts !== false && remoteTtsHandler && typeof Audio !== 'undefined');
    if (canTryApi) {
      const cacheKey = accent + '|' + content.toLowerCase();
      const cached = audioBlobCache.get(cacheKey);
      if (cached && cached.url && !opts.bypassCache) {
        if (playObjectUrl(cached.url, rate, cached.provider, myToken, opts)) {
          return true;
        }
      }

      if (typeof opts.onStart === 'function') opts.onStart('loading');
      Promise.resolve(remoteTtsHandler({ text: content, accent: accent, testConfig: opts.testConfig || null }))
        .then(function (res) {
          if (myToken !== activePlayToken) return;
          if (res && res.mode === 'audio' && res.blob) {
            if (opts.bypassCache) opts._revokeOnEnd = true;
            const url = opts.bypassCache
              ? (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(res.blob) : '')
              : putAudioCacheEntry(cacheKey, res.blob, res.provider);
            if (url && playObjectUrl(url, rate, res.provider || 'api', myToken, opts)) {
              if (typeof opts.onApiSuccess === 'function') opts.onApiSuccess(res);
              return;
            }
          }
          if (res && res.mode === 'error' && opts.strictApiError && typeof opts.onError === 'function') {
            if (typeof opts.onEnd === 'function') opts.onEnd();
            opts.onError(new Error(res.error || 'TTS API xatosi.'));
            return;
          }
          speakViaBrowser(content, opts);
        })
        .catch(function (err) {
          if (myToken !== activePlayToken) return;
          if (opts.strictApiError && typeof opts.onError === 'function') {
            if (typeof opts.onEnd === 'function') opts.onEnd();
            opts.onError(err);
            return;
          }
          speakViaBrowser(content, opts);
        });
      return true;
    }

    return speakViaBrowser(content, opts);
  }

  const api = {
    TTS_PROVIDER_DEFAULTS: TTS_PROVIDER_DEFAULTS,
    resolveEffectiveTtsConfig: resolveEffectiveTtsConfig,
    parseSampleRateFromMime: parseSampleRateFromMime,
    pcm16ToWavUint8Array: pcm16ToWavUint8Array,
    isSupported: isSupported,
    refreshVoices: refreshVoices,
    pickVoice: pickVoice,
    setRemoteTtsHandler: setRemoteTtsHandler,
    getLastEngineUsed: getLastEngineUsed,
    clearCache: clearCache,
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
