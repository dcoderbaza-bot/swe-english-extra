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
          lines.push((idx + 1) + '. ' + w.word + (w.phonetic ? ' ' + w.phonetic : '') + ' [' + (w.partOfSpeech || 'word') + ', ' + (w.level || 'B2') + ', ' + (w.category || 'IELTS') + ']');
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

  function normalizeAiEnrichedItems(aiItems, fallbackEntries, options) {
    const opts = options || {};
    const forcedCategory = opts.forcedCategory && opts.forcedCategory !== 'AUTO' ? opts.forcedCategory : null;
    const forcedLesson = opts.forcedLesson && opts.forcedLesson !== 'AUTO' ? opts.forcedLesson : null;
    const allowedCategories = ['IELTS', 'General English', 'Business', 'Phrasal Verbs', 'Idioms'];
    const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

    const bySourceIndex = Array.isArray(aiItems) ? aiItems : [];

    return fallbackEntries.map(function (src, idx) {
      const ai = bySourceIndex[idx] || bySourceIndex.find(function (item) {
        return item && item.word && String(item.word).trim().toLowerCase() === src.word.toLowerCase();
      }) || {};

      const finalWord = cleanWordToken(ai.word || src.word);
      const levelRaw = String(ai.level || 'B2').trim().toUpperCase();
      const level = allowedLevels.indexOf(levelRaw) !== -1 ? levelRaw : 'B2';

      let category = forcedCategory || String(ai.category || 'IELTS').trim();
      if (!forcedCategory && allowedCategories.indexOf(category) === -1 && !(opts.existingCategories || []).includes(category)) {
        category = 'IELTS';
      }

      const lesson = forcedLesson || String(ai.lesson || src.lesson || '1-dars: Academic Foundations').trim();
      const rawExamples = Array.isArray(ai.examples) ? ai.examples : [ai.example1, ai.example2];
      const examples = rawExamples
        .map(function (ex) { return ensureBoldWordInExample(ex, finalWord); })
        .filter(Boolean)
        .slice(0, 2);

      return {
        word: finalWord,
        phonetic: String(ai.phonetic || src.phonetic || '').trim(),
        partOfSpeech: String(ai.partOfSpeech || 'word').trim(),
        translation: String(ai.translation || src.translation || '').trim(),
        definition: String(ai.definition || '').trim(),
        examples: examples,
        synonyms: Array.isArray(ai.synonyms) ? ai.synonyms.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4) : [],
        antonyms: Array.isArray(ai.antonyms) ? ai.antonyms.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4) : [],
        mnemonic: String(ai.mnemonic || '').trim(),
        category: category,
        lesson: lesson,
        level: level
      };
    });
  }

  function buildEnrichPrompt(batchEntries, options) {
    const opts = options || {};
    const categories = (opts.existingCategories && opts.existingCategories.length)
      ? opts.existingCategories.join(', ')
      : 'IELTS, General English, Business, Phrasal Verbs, Idioms';

    const compactInput = batchEntries.map(function (e, i) {
      return {
        index: i,
        raw: e.rawLine,
        word: e.word,
        translationHint: e.translation,
        lesson: e.lesson
      };
    });

    return [
      'You are an expert English-Uzbek lexicographer and IELTS instructor.',
      'Clean, fix spelling/typos, and enrich EVERY vocabulary entry below into structured JSON.',
      'Return ONLY a valid JSON array with exact same length and order as the input.',
      'For each item return an object with these exact keys:',
      '- "word": corrected English word or phrase',
      '- "phonetic": British/International IPA transcription in slashes like "/ɪnˈdev.ər/"',
      '- "partOfSpeech": e.g. "noun", "verb", "adjective", "adverb", "phrasal verb", "idiom"',
      '- "translation": clear, accurate Uzbek translation (use Latin Uzbek alphabet with o‘, g‘, sh, ch)',
      '- "definition": concise natural English definition',
      '- "examples": array of exactly 2 realistic context sentences where the target word/phrase is wrapped in **bold** markers like **word**',
      '- "synonyms": array of 2-4 English synonyms',
      '- "antonyms": array of 1-3 English antonyms (or empty array if none)',
      '- "mnemonic": short memorable Uzbek/English association tip to remember the word',
      '- "category": best fit from [' + categories + ']',
      '- "lesson": preserve input lesson name',
      '- "level": CEFR level ("A1", "A2", "B1", "B2", "C1", or "C2")',
      '',
      'Input entries JSON:',
      JSON.stringify(compactInput)
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

    const batchSize = Number(opts.batchSize) > 0 ? Number(opts.batchSize) : 15;
    const totalBatches = Math.ceil(list.length / batchSize);
    const enrichedAll = [];

    for (let b = 0; b < totalBatches; b++) {
      const slice = list.slice(b * batchSize, (b + 1) * batchSize);
      if (typeof opts.onProgress === 'function') {
        opts.onProgress({
          currentBatch: b + 1,
          totalBatches: totalBatches,
          processedCount: b * batchSize,
          totalCount: list.length
        });
      }

      const prompt = buildEnrichPrompt(slice, opts);
      const rawResponse = await callAiProvider(prompt, aiConfig, opts.fetchImpl);
      const parsedJson = extractJsonFromAiResponse(rawResponse);
      const normalized = normalizeAiEnrichedItems(parsedJson, slice, opts);
      normalized.forEach(function (item) { enrichedAll.push(item); });
    }

    if (typeof opts.onProgress === 'function') {
      opts.onProgress({
        currentBatch: totalBatches,
        totalBatches: totalBatches,
        processedCount: list.length,
        totalCount: list.length
      });
    }

    return enrichedAll;
  }

  async function testAiConnection(aiConfig, fetchImpl) {
    const prompt = 'Return a JSON array with 1 item translating "resilient" into Uzbek with keys "word" and "translation".';
    const raw = await callAiProvider(prompt, aiConfig, fetchImpl);
    const parsed = extractJsonFromAiResponse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  }

  const api = {
    PROVIDER_DEFAULTS: PROVIDER_DEFAULTS,
    SAMPLE_TXT: SAMPLE_TXT,
    isPrivateOrLocalHostname: isPrivateOrLocalHostname,
    validateAiEndpoint: validateAiEndpoint,
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
