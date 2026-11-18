/**
 * SWE ENGLISH EXTRA — Bulk .TXT Vocabulary Parser/Exporter & AI Auto-Formatter
 * Supports Google Gemini, OpenAI, and Custom OpenAI-Compatible APIs
 */
(function (root) {
  'use strict';

  const PROVIDER_DEFAULTS = {
    deepseek: {
      label: 'DeepSeek AI',
      defaultModel: 'deepseek-chat',
      endpoint: 'https://api.deepseek.com/chat/completions'
    },
    gemini: {
      label: 'Google Gemini',
      defaultModel: 'gemini-2.5-flash',
      endpoint: ''
    },
    openai: {
      label: 'OpenAI (GPT)',
      defaultModel: 'gpt-4o-mini',
      endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    custom: {
      label: 'Custom OpenAI-Compatible',
      defaultModel: 'gpt-4o-mini',
      endpoint: ''
    }
  };

  const SAMPLE_TXT = [
    '# 4-dars: Technology & Innovation',
    '1. ubiquitous - hamma joyda uchraydigan',
    '2. breakthrough — kashfiyot, keskin yutuq',
    '3. obsolete (eskirgan, foydalanishdan chiqqan)',
    '4. streamline',
    '5. scalable: kengaytirishga moslashuvchan',
    '',
    '# 5-dars: Environment & Policy',
    'sustainable = barqaror, ekologik toza',
    'deplete - tugatmoq, kamaytirmoq',
    'carbon footprint'
  ].join('\n');

  function cleanWordToken(str) {
    return String(str || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLessonHeader(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (/^#{1,3}\s+(.+)$/.test(trimmed)) {
      return trimmed.replace(/^#{1,3}\s+/, '').trim();
    }
    if (/^={2,}\s*(.+?)\s*={2,}$/.test(trimmed)) {
      return trimmed.replace(/^={2,}\s*/, '').replace(/\s*={2,}$/, '').trim();
    }
    if (/^(?:\d+\s*[-.]?\s*dars|lesson\s+\d+|unit\s+\d+|module\s+\d+)(?:\s*[:\-–—]\s*.*)?$/i.test(trimmed)) {
      // Only treat as header if it doesn't look like "1. lesson - dars" vocabulary pair
      if (!/^lesson\s*[-–—:=]\s*dars/i.test(trimmed)) {
        return trimmed;
      }
    }
    return null;
  }

  function parseRawTxtVocabulary(rawText, defaultLesson) {
    const lines = String(rawText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    let activeLesson = String(defaultLesson || '1-dars: Academic Foundations').trim();
    const detectedLessons = [];
    const seenLessons = new Set();
    const entries = [];

    function trackLesson(name) {
      const clean = String(name || '').trim();
      if (clean && !seenLessons.has(clean.toLowerCase())) {
        seenLessons.add(clean.toLowerCase());
        detectedLessons.push(clean);
      }
    }

    trackLesson(activeLesson);

    lines.forEach(function (rawLine) {
      const trimmed = rawLine.trim();
      if (!trimmed) return;
      if (/^\/\//.test(trimmed) || /^;/.test(trimmed)) return;

      const header = isLessonHeader(trimmed);
      if (header) {
        activeLesson = header;
        trackLesson(activeLesson);
        return;
      }

      // Remove leading bullets / numbering like "1.", "1)", "-", "*", "•"
      let line = trimmed.replace(/^(?:\d+[.)]\s*|[-*•]\s+)/, '').trim();
      if (!line) return;

      // Extract optional IPA /.../
      let phonetic = '';
      const ipaMatch = line.match(/(\/[^/\n]{2,40}\/)/);
      if (ipaMatch) {
        phonetic = ipaMatch[1].trim();
        line = (line.slice(0, ipaMatch.index) + ' ' + line.slice(ipaMatch.index + ipaMatch[0].length)).trim();
      }

      let word = '';
      let translation = '';
      let extraNote = '';

      if (line.indexOf('\t') !== -1) {
        const parts = line.split('\t').map(function (s) { return s.trim(); }).filter(Boolean);
        word = parts[0] || '';
        translation = parts[1] || '';
        extraNote = parts.slice(2).join(' | ');
      } else if (line.indexOf('|') !== -1) {
        const parts = line.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
        word = parts[0] || '';
        translation = parts[1] || '';
        extraNote = parts.slice(2).join(' | ');
      } else if (/\s+[—–-]\s+/.test(line)) {
        const idx = line.search(/\s+[—–-]\s+/);
        const sepMatch = line.match(/\s+[—–-]\s+/);
        word = line.slice(0, idx).trim();
        translation = line.slice(idx + sepMatch[0].length).trim();
      } else if (line.indexOf('=') !== -1) {
        const idx = line.indexOf('=');
        word = line.slice(0, idx).trim();
        translation = line.slice(idx + 1).trim();
      } else if (line.indexOf(':') !== -1) {
        const idx = line.indexOf(':');
        word = line.slice(0, idx).trim();
        translation = line.slice(idx + 1).trim();
      } else if (/^(.+?)\s*\(([^()]{2,})\)\s*$/.test(line)) {
        const m = line.match(/^(.+?)\s*\(([^()]{2,})\)\s*$/);
        word = m[1].trim();
        translation = m[2].trim();
      } else {
        word = line;
        translation = '';
      }

      word = cleanWordToken(word);
      translation = cleanWordToken(translation);

      if (!word) return;

      entries.push({
        rawLine: trimmed,
        word: word,
        phonetic: phonetic,
        translation: translation,
        extraNote: extraNote,
        lesson: activeLesson,
        needsAi: !translation || !phonetic
      });
    });

    return {
      entries: entries,
      detectedLessons: detectedLessons
    };
  }

  function exportToTXT(words, lessons, mode) {
    const formatMode = mode === 'simple' ? 'simple' : 'detailed';
    const list = Array.isArray(words) ? words : [];
    const grouped = new Map();

    // Seed lesson order from lessons list
    (lessons || []).forEach(function (l) {
      if (l && l.name && !grouped.has(l.name)) {
        grouped.set(l.name, []);
      }
    });

    list.forEach(function (w) {
      const lessonName = (w.lesson && String(w.lesson).trim()) || 'Umumiy darslik';
      if (!grouped.has(lessonName)) {
        grouped.set(lessonName, []);
      }
      grouped.get(lessonName).push(w);
    });

    const lines = [
      'SWE ENGLISH EXTRA — BARCHA DARSLIK LUG‘ATLARI (.TXT)',
      'Eksport vaqti: ' + new Date().toISOString().slice(0, 10),
      'Jami so‘zlar: ' + list.length,
      ''
    ];

    grouped.forEach(function (items, lessonName) {
      if (items.length === 0) return;
      lines.push('=== ' + lessonName + ' ===');

      items.forEach(function (w, idx) {
        if (formatMode === 'simple') {
          const ipaPart = w.phonetic ? (' ' + w.phonetic) : '';
          lines.push((idx + 1) + '. ' + w.word + ipaPart + ' — ' + w.translation);
        } else {
          const ukPart = (w.phoneticUk && w.phoneticUk !== w.phonetic) ? (' | UK: ' + w.phoneticUk) : '';
          const sylPart = w.syllables ? (' (' + w.syllables + ')') : '';
          lines.push((idx + 1) + '. ' + w.word + (w.phonetic ? ' ' + w.phonetic : '') + ukPart + sylPart + ' [' + (w.partOfSpeech || 'word') + ', ' + (w.level || 'B2') + ', ' + (w.category || 'IELTS') + ']');
          lines.push('   Tarjima: ' + w.translation);
          if (w.definition) lines.push('   Izoh: ' + w.definition);
          if (Array.isArray(w.examples) && w.examples.length) {
            w.examples.slice(0, 2).forEach(function (ex, exIdx) {
              lines.push('   Misol ' + (exIdx + 1) + ': ' + ex.replace(/\*\*/g, ''));
            });
          }
          if (Array.isArray(w.synonyms) && w.synonyms.length) {
            lines.push('   Sinonimlar: ' + w.synonyms.join(', '));
          }
          if (Array.isArray(w.antonyms) && w.antonyms.length) {
            lines.push('   Antonimlar: ' + w.antonyms.join(', '));
          }
          if (w.mnemonic) {
            lines.push('   Assotsiatsiya: ' + w.mnemonic);
          }
          lines.push('');
        }
      });

      lines.push('');
    });

    return lines.join('\r\n');
  }

  function extractJsonFromAiResponse(rawText) {
    let text = String(rawText || '').trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.words)) return parsed.words;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && Array.isArray(parsed.vocabulary)) return parsed.vocabulary;
      if (parsed && Array.isArray(parsed.data)) return parsed.data;
    } catch (e) {
      // Fallback: slice outer JSON array
    }

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const slice = text.slice(firstBracket, lastBracket + 1);
      const parsedSlice = JSON.parse(slice);
      if (Array.isArray(parsedSlice)) return parsedSlice;
    }

    throw new Error('AI javobidan yaroqli JSON massiv ajratib bo‘lmadi.');
  }

  function ensureBoldWordInExample(sentence, word) {
    const text = String(sentence || '').trim();
    if (!text) return '';
    if (/\*\*[^*]+\*\*/.test(text)) return text;
    const cleanWord = String(word || '').trim();
    if (!cleanWord) return text;
    const escaped = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escaped + ')', 'i');
    if (regex.test(text)) {
      return text.replace(regex, '**$1**');
    }
    return text;
  }

  const AI_CACHE_KEY = 'swe_english_ai_cache_v1';
  const MAX_CACHE_ENTRIES = 1500;
  const DEFAULT_BATCH_SIZE = 40;

  function isRichWordRecord(rec) {
    if (!rec || typeof rec !== 'object') return false;
    const word = cleanWordToken(rec.word);
    const tr = String(rec.translation || '').trim();
    const ph = String(rec.phonetic || '').trim();
    const def = String(rec.definition || '').trim();
    const ex = Array.isArray(rec.examples) ? rec.examples.filter(Boolean) : [];
    return Boolean(word && tr && ph && def && ex.length >= 2);
  }

  function getBrowserLocalStorage() {
    try {
      return (typeof window !== 'undefined' && window && window.localStorage) ? window.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  function loadLexiconCache(storageBackend) {
    const store = storageBackend || getBrowserLocalStorage();
    if (!store) return {};
    try {
      const raw = store.getItem(AI_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveLexiconCache(cacheObj, storageBackend) {
    const store = storageBackend || getBrowserLocalStorage();
    if (!store || !cacheObj || typeof cacheObj !== 'object') return false;
    try {
      const keys = Object.keys(cacheObj);
      if (keys.length > MAX_CACHE_ENTRIES) {
        keys.sort(function (a, b) {
          return Number((cacheObj[a] && cacheObj[a].cachedAt) || 0) - Number((cacheObj[b] && cacheObj[b].cachedAt) || 0);
        });
        const removeCount = keys.length - MAX_CACHE_ENTRIES;
        for (let i = 0; i < removeCount; i++) {
          delete cacheObj[keys[i]];
        }
      }
      store.setItem(AI_CACHE_KEY, JSON.stringify(cacheObj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildReusableItemFromRecord(rec, srcEntry, forcedCategory, forcedLesson) {
    const lesson = forcedLesson || String((srcEntry && srcEntry.lesson) || rec.lesson || '1-dars: Academic Foundations').trim();
    const category = forcedCategory || String(rec.category || 'IELTS').trim();
    const srcTranslation = srcEntry ? String(srcEntry.translation || '').trim() : '';
    const srcPhonetic = srcEntry ? String(srcEntry.phonetic || '').trim() : '';
    return {
      word: cleanWordToken(rec.word || (srcEntry && srcEntry.word) || ''),
      phonetic: srcPhonetic || String(rec.phonetic || '').trim(),
      phoneticUk: String(rec.phoneticUk || '').trim(),
      syllables: String(rec.syllables || '').trim(),
      partOfSpeech: String(rec.partOfSpeech || 'word').trim(),
      translation: srcTranslation || String(rec.translation || '').trim(),
      definition: String(rec.definition || '').trim(),
      examples: Array.isArray(rec.examples) ? rec.examples.slice(0, 2) : [],
      synonyms: Array.isArray(rec.synonyms) ? rec.synonyms.slice(0, 4) : [],
      antonyms: Array.isArray(rec.antonyms) ? rec.antonyms.slice(0, 4) : [],
      mnemonic: String(rec.mnemonic || '').trim(),
      category: category,
      lesson: lesson,
      level: String(rec.level || 'B2').trim().toUpperCase()
    };
  }

  function planAiEnrichment(entries, options) {
    const opts = options || {};
    const list = Array.isArray(entries) ? entries : [];
    const forcedCategory = opts.forcedCategory && opts.forcedCategory !== 'AUTO' ? opts.forcedCategory : null;
    const forcedLesson = opts.forcedLesson && opts.forcedLesson !== 'AUTO' ? opts.forcedLesson : null;

    const dbByWord = new Map();
    if (Array.isArray(opts.existingWords)) {
      opts.existingWords.forEach(function (w) {
        if (!isRichWordRecord(w)) return;
        const key = cleanWordToken(w.word).toLowerCase();
        if (key && !dbByWord.has(key)) dbByWord.set(key, w);
      });
    }

    const useCache = opts.useCache !== false;
    const cacheObj = opts.cache || (useCache ? loadLexiconCache() : {});
    const resolvedByIndex = new Array(list.length);
    const missingEntries = [];
    const missingByKey = new Map();

    let reusedFromDb = 0;
    let reusedFromCache = 0;
    let deduplicated = 0;

    list.forEach(function (src, idx) {
      const key = cleanWordToken(src && src.word).toLowerCase();
      if (!key) return;

      if (dbByWord.has(key)) {
        reusedFromDb++;
        resolvedByIndex[idx] = buildReusableItemFromRecord(dbByWord.get(key), src, forcedCategory, forcedLesson);
        return;
      }

      if (useCache && cacheObj[key] && isRichWordRecord(cacheObj[key])) {
        reusedFromCache++;
        resolvedByIndex[idx] = buildReusableItemFromRecord(cacheObj[key], src, forcedCategory, forcedLesson);
        return;
      }

      if (isRichWordRecord(src)) {
        reusedFromCache++;
        resolvedByIndex[idx] = buildReusableItemFromRecord(src, src, forcedCategory, forcedLesson);
        return;
      }

      if (missingByKey.has(key)) {
        deduplicated++;
        missingByKey.get(key).indices.push(idx);
        return;
      }

      const group = { key: key, entry: src, indices: [idx] };
      missingByKey.set(key, group);
      missingEntries.push(group);
    });

    return {
      total: list.length,
      reusedFromDb: reusedFromDb,
      reusedFromCache: reusedFromCache,
      deduplicated: deduplicated,
      missingEntries: missingEntries,
      resolvedByIndex: resolvedByIndex,
      cacheObj: cacheObj,
      useCache: useCache,
      hasExternalCache: Boolean(opts.cache)
    };
  }

  function normalizeAiEnrichedItems(aiItems, fallbackEntries, options) {
    const opts = options || {};
    const forcedCategory = opts.forcedCategory && opts.forcedCategory !== 'AUTO' ? opts.forcedCategory : null;
    const forcedLesson = opts.forcedLesson && opts.forcedLesson !== 'AUTO' ? opts.forcedLesson : null;
    const allowedCategories = ['IELTS', 'General English', 'Business', 'Phrasal Verbs', 'Idioms'];
    const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

    const bySourceIndex = Array.isArray(aiItems) ? aiItems : [];

    return fallbackEntries.map(function (src, idx) {
      const srcWordLower = cleanWordToken(src.word).toLowerCase();
      const ai = bySourceIndex[idx] || bySourceIndex.find(function (item) {
        if (!item) return false;
        const w = String(item.w || item.word || '').trim().toLowerCase();
        return w && w === srcWordLower;
      }) || {};

      const finalWord = cleanWordToken(ai.w || ai.word || src.word);
      const levelRaw = String(ai.lvl || ai.level || 'B2').trim().toUpperCase();
      const level = allowedLevels.indexOf(levelRaw) !== -1 ? levelRaw : 'B2';

      let category = forcedCategory || String(ai.cat || ai.category || 'IELTS').trim();
      if (!forcedCategory && allowedCategories.indexOf(category) === -1 && !(opts.existingCategories || []).includes(category)) {
        category = 'IELTS';
      }

      const lesson = forcedLesson || String(src.lesson || ai.lesson || '1-dars: Academic Foundations').trim();
      const rawExamples = Array.isArray(ai.ex || ai.examples)
        ? (ai.ex || ai.examples)
        : [ai.example1, ai.example2];
      const examples = rawExamples
        .map(function (ex) { return ensureBoldWordInExample(ex, finalWord); })
        .filter(Boolean)
        .slice(0, 2);

      const rawSyn = Array.isArray(ai.syn) ? ai.syn : (Array.isArray(ai.synonyms) ? ai.synonyms : []);
      const rawAnt = Array.isArray(ai.ant) ? ai.ant : (Array.isArray(ai.antonyms) ? ai.antonyms : []);

      return {
        word: finalWord,
        phonetic: String(ai.p || ai.phonetic || src.phonetic || '').trim(),
        phoneticUk: String(ai.pUk || ai.phoneticUk || src.phoneticUk || '').trim(),
        syllables: String(ai.syl || ai.syllables || src.syllables || '').trim(),
        partOfSpeech: String(ai.pos || ai.partOfSpeech || 'word').trim(),
        translation: String(ai.tr || ai.translation || src.translation || '').trim(),
        definition: String(ai.d || ai.definition || '').trim(),
        examples: examples,
        synonyms: rawSyn.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4),
        antonyms: rawAnt.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4),
        mnemonic: String(ai.m || ai.mnemonic || '').trim(),
        category: category,
        lesson: lesson,
        level: level
      };
    });
  }

  function buildEnrichPrompt(batchEntries, options) {
    const opts = options || {};
    const forcedCategory = opts.forcedCategory && opts.forcedCategory !== 'AUTO' ? opts.forcedCategory : null;
    const categories = (opts.existingCategories && opts.existingCategories.length)
      ? opts.existingCategories.join(', ')
      : 'IELTS, General English, Business, Phrasal Verbs, Idioms';

    // Ultra-compact wire input to minimize input tokens (no index/lesson duplication)
    const compactInput = batchEntries.map(function (e) {
      const hint = String(e.translation || '').trim();
      return hint ? (e.word + '|' + hint) : e.word;
    });

    const catRule = forcedCategory
      ? ''
      : ',"cat":best of [' + categories + ']';

    return [
      'Return ONLY a JSON array matching input count & order. Fix spelling if needed. Keep Uzbek values in Latin Uzbek (o‘,g‘,sh,ch).',
      'Keys per item: "w":word,"p":US IPA "/.../","pUk":UK IPA "/.../" (or "" if same as US),"syl":syllables with CAPS stress e.g. "u·BIQ·ui·tous","pos":partOfSpeech,"tr":Uzbek translation,"d":concise English def,"ex":[2 short sentences with **w**],"syn":[2 synonyms],"ant":[1 antonym],"m":short mnemonic,"lvl":A1-C2' + catRule + '.',
      'Input:' + JSON.stringify(compactInput)
    ].join('\n');
  }

  function isPrivateOrLocalHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '::' ||
      host.indexOf('fe80:') === 0 ||
      host.indexOf('fc') === 0 ||
      host.indexOf('fd') === 0
    ) {
      return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = Number(ipv4[1]);
      const b = Number(ipv4[2]);
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
    }
    return false;
  }

  function validateAiEndpoint(rawUrl) {
    const str = String(rawUrl || '').trim();
    if (!str) {
      throw new Error('AI Endpoint URL kiritilmagan.');
    }
    let parsed;
    try {
      parsed = new URL(str);
    } catch (e) {
      throw new Error('AI Endpoint URL noto‘g‘ri formatda.');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Xavfsizlik talabi: AI endpoint faqat HTTPS protokoli bo‘lishi shart.');
    }
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      throw new Error('Xavfsizlik talabi: Lokal yoki ichki tarmoq (SSRF) manzillariga so‘rov yuborish taqiqlangan.');
    }
    return parsed.toString();
  }

  async function callAiProvider(promptText, aiConfig, fetchImpl) {
    const fetcher = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetcher) {
      throw new Error('Brauzerda fetch API topilmadi.');
    }

    const cfg = aiConfig || {};
    const rawKey = String(cfg.apiKey || '').trim();
    const isMasked = rawKey.indexOf('••') !== -1;
    const apiKey = isMasked ? '' : rawKey;
    const serverMode = !fetchImpl && root && root.SWESync && typeof root.SWESync.proxyAiRequest === 'function' && root.SWESync.isServerMode();
    const hasServerKey = Boolean(cfg.hasApiKey) && serverMode;

    if (!apiKey && !hasServerKey) {
      throw new Error('AI API Key kiritilmagan. .TXT Kiritish bo‘limidagi DeepSeek API sozlamasiga kalitni kiriting.');
    }

    const provider = cfg.provider || 'deepseek';

    if (provider === 'gemini') {
      const model = String(cfg.model || 'gemini-2.5-flash').trim();
      const baseEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent';
      const safeEndpoint = validateAiEndpoint(baseEndpoint);
      const requestPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      };

      if (!apiKey && hasServerKey) {
        return root.SWESync.proxyAiRequest(safeEndpoint, '', requestPayload, 'gemini');
      }

      let res;
      try {
        res = await fetcher(safeEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestPayload)
        });
      } catch (networkErr) {
        if (serverMode) {
          return root.SWESync.proxyAiRequest(safeEndpoint, apiKey, requestPayload, 'gemini');
        }
        throw new Error('Gemini serveriga ulanib bo‘lmadi: ' + (networkErr && networkErr.message ? networkErr.message : 'Network error'));
      }

      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
        throw new Error('Gemini API xatosi: ' + msg);
      }

      const text = data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');

      if (!text) throw new Error('Gemini bo‘sh javob qaytardi.');
      return text;
    }

    const rawCustomUrl = String(cfg.customUrl || '').trim();
    if (provider === 'custom' && !rawCustomUrl && !apiKey && hasServerKey) {
      const customDefaultModel = (PROVIDER_DEFAULTS[provider] && PROVIDER_DEFAULTS[provider].defaultModel) || 'deepseek-chat';
      const customPayload = {
        model: String(cfg.model || customDefaultModel).trim(),
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: 'You are a helpful English-Uzbek lexicographer. Output strict JSON arrays only.' },
          { role: 'user', content: promptText }
        ]
      };
      return root.SWESync.proxyAiRequest('', '', customPayload, provider);
    }

    // DeepSeek, OpenAI or Custom OpenAI-compatible
    let rawEndpoint = 'https://api.deepseek.com/chat/completions';
    if (provider === 'openai') {
      rawEndpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (provider === 'custom') {
      rawEndpoint = rawCustomUrl;
    } else if (provider === 'deepseek') {
      rawEndpoint = rawCustomUrl || 'https://api.deepseek.com/chat/completions';
    }

    const endpoint = validateAiEndpoint(rawEndpoint);

    const defaultModel = (PROVIDER_DEFAULTS[provider] && PROVIDER_DEFAULTS[provider].defaultModel) || 'deepseek-chat';
    const model = String(cfg.model || defaultModel).trim();
    const requestPayload = {
      model: model,
      temperature: 0.2,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a helpful English-Uzbek lexicographer. Output strict JSON arrays only.' },
        { role: 'user', content: promptText }
      ]
    };

    // Prefer secure server proxy when key lives server-side (or falls back on CORS)
    if (!apiKey && hasServerKey) {
      return root.SWESync.proxyAiRequest(endpoint, '', requestPayload, provider);
    }

    let res;
    try {
      res = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestPayload)
      });
    } catch (networkErr) {
      if (serverMode) {
        return root.SWESync.proxyAiRequest(endpoint, apiKey, requestPayload, provider);
      }
      throw new Error('AI serveriga ulanib bo‘lmadi: ' + (networkErr && networkErr.message ? networkErr.message : 'Network error'));
    }

    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error((provider === 'deepseek' ? 'DeepSeek API xatosi: ' : 'AI API xatosi: ') + msg);
    }

    const content = data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!content) throw new Error('AI API bo‘sh javob qaytardi.');
    return content;
  }

  async function enrichEntriesWithAI(entries, aiConfig, options) {
    const opts = options || {};
    const list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) return [];

    const plan = planAiEnrichment(list, opts);
    const forcedCategory = opts.forcedCategory && opts.forcedCategory !== 'AUTO' ? opts.forcedCategory : null;
    const forcedLesson = opts.forcedLesson && opts.forcedLesson !== 'AUTO' ? opts.forcedLesson : null;
    const batchSize = Number(opts.batchSize) > 0 ? Number(opts.batchSize) : DEFAULT_BATCH_SIZE;
    const uniqueMissing = plan.missingEntries.map(function (g) { return g.entry; });
    const totalBatches = Math.ceil(uniqueMissing.length / batchSize);
    let apiCallsMade = 0;

    if (uniqueMissing.length > 0) {
      let cacheDirty = false;
      for (let b = 0; b < totalBatches; b++) {
        const slice = uniqueMissing.slice(b * batchSize, (b + 1) * batchSize);
        if (typeof opts.onProgress === 'function') {
          opts.onProgress({
            currentBatch: b + 1,
            totalBatches: totalBatches,
            processedCount: b * batchSize,
            totalCount: uniqueMissing.length
          });
        }

        const prompt = buildEnrichPrompt(slice, opts);
        apiCallsMade++;
        const rawResponse = await callAiProvider(prompt, aiConfig, opts.fetchImpl);
        const parsedJson = extractJsonFromAiResponse(rawResponse);
        const normalizedSlice = normalizeAiEnrichedItems(parsedJson, slice, opts);

        normalizedSlice.forEach(function (item, sliceIdx) {
          const group = plan.missingEntries[b * batchSize + sliceIdx];
          if (!group) return;

          if (plan.useCache && item && item.word && item.translation) {
            const storeRecord = Object.assign({}, item, { cachedAt: Date.now() });
            plan.cacheObj[group.key] = storeRecord;
            const itemKey = cleanWordToken(item.word).toLowerCase();
            if (itemKey && itemKey !== group.key) {
              plan.cacheObj[itemKey] = storeRecord;
            }
            cacheDirty = true;
          }

          group.indices.forEach(function (origIdx) {
            const origSrc = list[origIdx];
            plan.resolvedByIndex[origIdx] = Object.assign({}, item, {
              lesson: forcedLesson || String((origSrc && origSrc.lesson) || item.lesson || '1-dars: Academic Foundations').trim(),
              category: forcedCategory || item.category
            });
          });
        });
      }

      if (cacheDirty && plan.useCache && !plan.hasExternalCache) {
        saveLexiconCache(plan.cacheObj);
      }
    }

    if (typeof opts.onProgress === 'function') {
      opts.onProgress({
        currentBatch: totalBatches,
        totalBatches: totalBatches,
        processedCount: uniqueMissing.length,
        totalCount: uniqueMissing.length
      });
    }

    if (typeof opts.onStats === 'function') {
      opts.onStats({
        total: list.length,
        reusedFromDb: plan.reusedFromDb,
        reusedFromCache: plan.reusedFromCache,
        deduplicated: plan.deduplicated,
        sentToAi: uniqueMissing.length,
        apiCalls: apiCallsMade
      });
    }

    return plan.resolvedByIndex.filter(Boolean);
  }

  async function testAiConnection(aiConfig, fetchImpl) {
    // Minimal 1-token verification ping instead of generating multi-sentence definitions
    const prompt = 'Reply ONLY JSON: [{"word":"ok","translation":"tayyor"}]';
    const raw = await callAiProvider(prompt, aiConfig, fetchImpl);
    const parsed = extractJsonFromAiResponse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  }

  const api = {
    PROVIDER_DEFAULTS: PROVIDER_DEFAULTS,
    AI_CACHE_KEY: AI_CACHE_KEY,
    DEFAULT_BATCH_SIZE: DEFAULT_BATCH_SIZE,
    SAMPLE_TXT: SAMPLE_TXT,
    isPrivateOrLocalHostname: isPrivateOrLocalHostname,
    validateAiEndpoint: validateAiEndpoint,
    isRichWordRecord: isRichWordRecord,
    loadLexiconCache: loadLexiconCache,
    saveLexiconCache: saveLexiconCache,
    planAiEnrichment: planAiEnrichment,
    parseRawTxtVocabulary: parseRawTxtVocabulary,
    exportToTXT: exportToTXT,
    extractJsonFromAiResponse: extractJsonFromAiResponse,
    normalizeAiEnrichedItems: normalizeAiEnrichedItems,
    buildEnrichPrompt: buildEnrichPrompt,
    callAiProvider: callAiProvider,
    enrichEntriesWithAI: enrichEntriesWithAI,
    testAiConnection: testAiConnection
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWEAiTxt = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
