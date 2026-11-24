/**
 * SWE ENGLISH EXTRA — Topic-by-Topic Irregular Verbs Engine (V1 · V2 · V3 · O'zbekcha)
 * Supports starter curriculum topics, flexible table/.TXT bulk parsing, export, and variant-aware grading.
 */
(function (root) {
  'use strict';

  const DEFAULT_IRREGULAR_TOPICS = [
    {
      id: 'ir-topic-1',
      name: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)',
      description: 'Uchala shakli ham bir xil yoziladigan eng faol fe’llar',
      order: 1
    },
    {
      id: 'ir-topic-2',
      name: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)',
      description: 'Past Simple va Past Participle shakli bir xil bo‘lgan fe’llar',
      order: 2
    },
    {
      id: 'ir-topic-3',
      name: '3-mavzu: Uchala shakli farqli fe’llar (ABC)',
      description: 'V1, V2 va V3 ustunlarida to‘liq o‘zgaradigan asosiy fe’llar',
      order: 3
    },
    {
      id: 'ir-topic-4',
      name: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)',
      description: 'Yuqori darajadagi va ikki xil variantli noto‘g‘ri fe’llar',
      order: 4
    }
  ];

  const RAW_STARTER_VERBS = [
    // 1-mavzu
    { id: 'irv-cost', v1: 'cost', v2: 'cost', v3: 'cost', translation: 'turmoq (narx)', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-cut', v1: 'cut', v2: 'cut', v3: 'cut', translation: 'kesmoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-hit', v1: 'hit', v2: 'hit', v3: 'hit', translation: 'urmoq, zarba bermoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-hurt', v1: 'hurt', v2: 'hurt', v3: 'hurt', translation: 'og‘ritmoq, jarohatlamoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-let', v1: 'let', v2: 'let', v3: 'let', translation: 'ruxsat bermoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-put', v1: 'put', v2: 'put', v3: 'put', translation: 'qo‘ymoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-read', v1: 'read', v2: 'read', v3: 'read', translation: 'o‘qimoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-set', v1: 'set', v2: 'set', v3: 'set', translation: 'o‘rnatmoq, belgilamoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-shut', v1: 'shut', v2: 'shut', v3: 'shut', translation: 'yopmoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },
    { id: 'irv-split', v1: 'split', v2: 'split', v3: 'split', translation: 'bo‘lmoq, ajratmoq', topic: '1-mavzu: O‘zgarmas fe’llar (V1 = V2 = V3)' },

    // 2-mavzu
    { id: 'irv-bring', v1: 'bring', v2: 'brought', v3: 'brought', translation: 'olib kelmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-build', v1: 'build', v2: 'built', v3: 'built', translation: 'qurmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-buy', v1: 'buy', v2: 'bought', v3: 'bought', translation: 'sotib olmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-catch', v1: 'catch', v2: 'caught', v3: 'caught', translation: 'tutmoq, ushlamoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-feel', v1: 'feel', v2: 'felt', v3: 'felt', translation: 'his qilmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-find', v1: 'find', v2: 'found', v3: 'found', translation: 'topmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-keep', v1: 'keep', v2: 'kept', v3: 'kept', translation: 'saqlamoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-leave', v1: 'leave', v2: 'left', v3: 'left', translation: 'tark etmoq, ketmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-make', v1: 'make', v2: 'made', v3: 'made', translation: 'yasamoq, qilmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },
    { id: 'irv-teach', v1: 'teach', v2: 'taught', v3: 'taught', translation: 'o‘qitmoq, o‘rgatmoq', topic: '2-mavzu: V2 va V3 bir xil fe’llar (ABB)' },

    // 3-mavzu
    { id: 'irv-begin', v1: 'begin', v2: 'began', v3: 'begun', translation: 'boshlamoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-break', v1: 'break', v2: 'broke', v3: 'broken', translation: 'sindirmoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-choose', v1: 'choose', v2: 'chose', v3: 'chosen', translation: 'tanlamoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-drive', v1: 'drive', v2: 'drove', v3: 'driven', translation: 'haydamoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-eat', v1: 'eat', v2: 'ate', v3: 'eaten', translation: 'yemoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-fall', v1: 'fall', v2: 'fell', v3: 'fallen', translation: 'yiqilmoq, tushmoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-give', v1: 'give', v2: 'gave', v3: 'given', translation: 'bermoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-go', v1: 'go', v2: 'went', v3: 'gone', translation: 'bormoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-speak', v1: 'speak', v2: 'spoke', v3: 'spoken', translation: 'gapirmoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },
    { id: 'irv-write', v1: 'write', v2: 'wrote', v3: 'written', translation: 'yozmoq', topic: '3-mavzu: Uchala shakli farqli fe’llar (ABC)' },

    // 4-mavzu (151-165 exact curriculum table)
    { id: 'irv-spin', v1: 'spin', v2: 'spun', v3: 'spun', translation: 'aylanmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-spit', v1: 'spit', v2: 'spat/spit', v3: 'spat/spit', translation: 'tupurmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-spoil', v1: 'spoil', v2: 'spoilt/spoiled', v3: 'spoilt/spoiled', translation: 'buzmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-swell', v1: 'swell', v2: 'swelled', v3: 'swollen/swelled', translation: 'shishmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-swing', v1: 'swing', v2: 'swung', v3: 'swung', translation: 'tebranmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-tread', v1: 'tread', v2: 'trod', v3: 'trodden/trod', translation: 'bosmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-thrust', v1: 'thrust', v2: 'thrust', v3: 'thrust', translation: 'kuch bilan itarmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-undertake', v1: 'undertake', v2: 'undertook', v3: 'undertaken', translation: 'zimmasiga olmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-uphold', v1: 'uphold', v2: 'upheld', v3: 'upheld', translation: 'kuchda qoldirmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-wet', v1: 'wet', v2: 'wet/wetted', v3: 'wet/wetted', translation: 'ho‘llamoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-abide', v1: 'abide', v2: 'abode/abided', v3: 'abode/abided', translation: 'rioya qilmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-alight', v1: 'alight', v2: 'alighted/alit', v3: 'alighted/alit', translation: 'tushmoq; qo‘nmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-backslide', v1: 'backslide', v2: 'backslid', v3: 'backslid/backslidden', translation: 'eski yomon odatga qaytmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-befall', v1: 'befall', v2: 'befell', v3: 'befallen', translation: 'boshiga tushmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' },
    { id: 'irv-behold', v1: 'behold', v2: 'beheld', v3: 'beheld', translation: 'ko‘rmoq; tomosha qilmoq', topic: '4-mavzu: Murakkab va B2–C1 fe’llar (151–165)' }
  ];

  const SAMPLE_IRREGULAR_TXT = [
    '# 5-mavzu: Muloqot va harakat fe’llari',
    '1 forbid | forbade/forbad | forbidden | taqiqlamoq',
    '2 forgive | forgave | forgiven | kechirmoq',
    '3 freeze | froze | frozen | muzlamoq',
    '4 kneel | knelt/kneeled | knelt/kneeled | tiz cho‘kmoq',
    '5 seek | sought | sought | qidirmoq, izlamoq',
    '6 strive | strove/strived | striven/strived | astoydil intilmoq'
  ].join('\n');

  function cleanFormString(val) {
    return String(val || '')
      .trim()
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ');
  }

  function normalizeTopicRecord(raw, idx) {
    if (typeof raw === 'string') {
      const sName = raw.trim();
      return {
        id: 'ir-topic-' + ((Number(idx) || 0) + 1) + '-' + Math.random().toString(36).slice(2, 6),
        name: sName,
        description: '',
        order: (Number(idx) || 0) + 1
      };
    }
    const obj = raw || {};
    const name = String(obj.name || '').trim();
    return {
      id: obj.id ? String(obj.id) : ('ir-topic-' + ((Number(idx) || 0) + 1) + '-' + Math.random().toString(36).slice(2, 6)),
      name: name,
      description: String(obj.description || '').trim(),
      order: Number.isFinite(Number(obj.order)) ? Number(obj.order) : ((Number(idx) || 0) + 1)
    };
  }

  function normalizeIrregularVerb(raw, fallbackTopic, now, defaultOrder) {
    const ts = typeof now === 'number' ? now : Date.now();
    const obj = raw || {};
    const v1 = cleanFormString(obj.v1 || obj.base || obj.word || '').toLowerCase();
    const v2 = cleanFormString(obj.v2 || obj.past || '').toLowerCase();
    const v3 = cleanFormString(obj.v3 || obj.participle || obj.pastParticiple || '').toLowerCase();
    const translation = String(obj.translation || obj.uz || obj.meaning || '').trim().replace(/\s+/g, ' ');
    const topic = String(obj.topic || fallbackTopic || DEFAULT_IRREGULAR_TOPICS[0].name).trim() || DEFAULT_IRREGULAR_TOPICS[0].name;

    return {
      id: obj.id ? String(obj.id) : ('irv-' + ts + '-' + Math.random().toString(36).slice(2, 7)),
      v1: v1,
      v2: v2,
      v3: v3,
      translation: translation,
      topic: topic,
      order: Number.isFinite(Number(obj.order)) ? Number(obj.order) : (Number(defaultOrder) || 0),
      createdAt: obj.createdAt ? Number(obj.createdAt) : ts,
      updatedAt: obj.updatedAt ? Number(obj.updatedAt) : ts
    };
  }

  function extractTopicHeader(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return '';

    const hashMatch = trimmed.match(/^#{1,4}\s*(.+)$/);
    if (hashMatch) return hashMatch[1].trim();

    const bracketMatch = trimmed.match(/^\[([^\]]{2,90})\]$/);
    if (bracketMatch) return bracketMatch[1].trim();

    const eqMatch = trimmed.match(/^={2,}\s*(.+?)\s*={2,}$/);
    if (eqMatch) return eqMatch[1].trim();

    if (/^(?:\d+\s*[-.]?\s*mavzu|mavzu\s*\d+|topic\s*\d+|unit\s*\d+)\b/i.test(trimmed) && !/[|\t]/.test(trimmed)) {
      const dashParts = trimmed.split(/\s+[—–-]\s+/);
      if (dashParts.length <= 2) {
        return trimmed.replace(/:$/, '').trim();
      }
    }
    return '';
  }

  function isHeaderNoiseRow(parts) {
    if (!parts || parts.length < 3) return false;
    const joined = parts.map(function (p) { return String(p || '').trim().toLowerCase(); }).join('|');
    return /^(?:no\.?\|)?v1\|v2\|v3(?:\||$)/i.test(joined) ||
      /^(?:№\|)?infinitive\|past/i.test(joined);
  }

  function parseSingleIrregularLine(line, currentTopic) {
    let cleaned = String(line || '').trim();
    if (!cleaned || /^\/\//.test(cleaned)) return null;

    // Strip leading bullet / row index such as "151.", "151)", "#151", or "151   "
    cleaned = cleaned.replace(/^(?:#?\d{1,4}[.)]\s*|\d{1,4}\s+(?=[a-zA-Z]))/, '').trim();
    if (!cleaned) return null;

    let cells = null;

    if (cleaned.indexOf('\t') !== -1) {
      cells = cleaned.split('\t').map(function (c) { return c.trim(); }).filter(Boolean);
    } else if (cleaned.indexOf('|') !== -1) {
      cells = cleaned.split('|').map(function (c) { return c.trim(); }).filter(Boolean);
    } else if (/\s+[—–-]\s+/.test(cleaned)) {
      cells = cleaned.split(/\s+[—–-]\s+/).map(function (c) { return c.trim(); }).filter(Boolean);
    }

    if (cells && cells.length >= 4) {
      // If first column is still a bare number (e.g. "151 | spin | spun | spun | aylanmoq")
      if (/^\d{1,4}\.?$/.test(cells[0]) && cells.length >= 5) {
        cells = cells.slice(1);
      }
      if (isHeaderNoiseRow(cells)) return null;
      return {
        v1: cleanFormString(cells[0]).toLowerCase(),
        v2: cleanFormString(cells[1]).toLowerCase(),
        v3: cleanFormString(cells[2]).toLowerCase(),
        translation: cells.slice(3).join(' — ').trim(),
        topic: currentTopic
      };
    }

    // Fallback: whitespace-separated table copy-paste (e.g. "163 backslide backslid backslid/backslidden eski yomon odatga qaytmoq")
    const wsMatch = cleaned.match(/^([a-zA-Z][a-zA-Z/'()-]*)\s+([a-zA-Z][a-zA-Z/'()-]*)\s+([a-zA-Z][a-zA-Z/'()-]*)\s+(.+)$/);
    if (wsMatch) {
      const cand = [wsMatch[1], wsMatch[2], wsMatch[3], wsMatch[4]];
      if (isHeaderNoiseRow(cand)) return null;
      return {
        v1: cleanFormString(wsMatch[1]).toLowerCase(),
        v2: cleanFormString(wsMatch[2]).toLowerCase(),
        v3: cleanFormString(wsMatch[3]).toLowerCase(),
        translation: wsMatch[4].trim(),
        topic: currentTopic
      };
    }

    return null;
  }

  function parseIrregularBulkText(rawText, options) {
    const opts = options || {};
    const fallbackTopic = String(opts.fallbackTopic || DEFAULT_IRREGULAR_TOPICS[0].name).trim() || DEFAULT_IRREGULAR_TOPICS[0].name;
    let currentTopic = fallbackTopic;
    const topicsSet = new Map();
    const entries = [];

    const lines = String(rawText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const headerTopic = extractTopicHeader(line);
      if (headerTopic) {
        currentTopic = headerTopic;
        if (!topicsSet.has(currentTopic.toLowerCase())) {
          topicsSet.set(currentTopic.toLowerCase(), currentTopic);
        }
        continue;
      }

      const parsed = parseSingleIrregularLine(line, currentTopic);
      if (parsed && parsed.v1 && parsed.v2 && parsed.v3 && parsed.translation) {
        if (!topicsSet.has(currentTopic.toLowerCase())) {
          topicsSet.set(currentTopic.toLowerCase(), currentTopic);
        }
        entries.push(parsed);
      }
    }

    const discoveredTopics = Array.from(topicsSet.values()).map(function (name, idx) {
      return { name: name, description: '', order: idx + 1 };
    });

    return {
      topics: discoveredTopics,
      entries: entries
    };
  }

  function mergeIrregularEntries(existingTopics, existingVerbs, incomingTopics, incomingEntries, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const topics = (Array.isArray(existingTopics) ? existingTopics : []).map(function (t, i) {
      return normalizeTopicRecord(t, i);
    }).filter(function (t) { return Boolean(t.name); });

    const topicNamesLower = new Set(topics.map(function (t) { return t.name.toLowerCase(); }));
    let topicsAdded = 0;

    (Array.isArray(incomingTopics) ? incomingTopics : []).forEach(function (t) {
      const name = String((t && t.name) || t || '').trim();
      if (name && !topicNamesLower.has(name.toLowerCase())) {
        topics.push(normalizeTopicRecord({
          id: t && t.id,
          name: name,
          description: (t && t.description) || '',
          order: topics.length + 1
        }, topics.length));
        topicNamesLower.add(name.toLowerCase());
        topicsAdded++;
      }
    });

    const verbs = (Array.isArray(existingVerbs) ? existingVerbs : []).map(function (v, i) {
      return normalizeIrregularVerb(v, DEFAULT_IRREGULAR_TOPICS[0].name, ts, i + 1);
    });

    const keyToIndex = new Map();
    verbs.forEach(function (v, idx) {
      keyToIndex.set(v.topic.toLowerCase() + '::' + v.v1.toLowerCase(), idx);
    });

    let added = 0;
    let updated = 0;
    let skipped = 0;

    (Array.isArray(incomingEntries) ? incomingEntries : []).forEach(function (raw) {
      const norm = normalizeIrregularVerb(raw, (topics[0] && topics[0].name) || DEFAULT_IRREGULAR_TOPICS[0].name, ts, verbs.length + 1);
      if (!norm.v1 || !norm.v2 || !norm.v3 || !norm.translation) {
        skipped++;
        return;
      }

      if (!topicNamesLower.has(norm.topic.toLowerCase())) {
        topics.push(normalizeTopicRecord({ name: norm.topic, order: topics.length + 1 }, topics.length));
        topicNamesLower.add(norm.topic.toLowerCase());
        topicsAdded++;
      }

      const compositeKey = norm.topic.toLowerCase() + '::' + norm.v1.toLowerCase();
      if (keyToIndex.has(compositeKey)) {
        const idx = keyToIndex.get(compositeKey);
        const cur = verbs[idx];
        verbs[idx] = Object.assign({}, cur, {
          v2: norm.v2,
          v3: norm.v3,
          translation: norm.translation,
          topic: norm.topic,
          updatedAt: ts
        });
        updated++;
      } else {
        keyToIndex.set(compositeKey, verbs.length);
        verbs.push(norm);
        added++;
      }
    });

    return {
      irregularTopics: topics,
      irregularVerbs: verbs,
      summary: {
        added: added,
        updated: updated,
        skipped: skipped,
        topicsAdded: topicsAdded
      }
    };
  }

  function exportIrregularToTXT(topics, verbs) {
    const topicList = Array.isArray(topics) ? topics : [];
    const verbList = Array.isArray(verbs) ? verbs : [];
    const grouped = new Map();

    topicList.forEach(function (t) {
      if (t && t.name) grouped.set(t.name, []);
    });

    verbList.forEach(function (v) {
      const tName = (v && v.topic) || 'Umumiy';
      if (!grouped.has(tName)) grouped.set(tName, []);
      grouped.get(tName).push(v);
    });

    const blocks = [];
    grouped.forEach(function (items, topicName) {
      if (!items.length) return;
      const lines = ['# ' + topicName];
      items.forEach(function (item, idx) {
        lines.push((idx + 1) + '. ' + item.v1 + ' | ' + item.v2 + ' | ' + item.v3 + ' | ' + item.translation);
      });
      blocks.push(lines.join('\n'));
    });

    return blocks.join('\n\n') + (blocks.length ? '\n' : '');
  }

  function normalizeFormToken(str) {
    return String(str || '')
      .toLowerCase()
      .trim()
      .replace(/[’`ʻʼ]/g, "'")
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ');
  }

  function getAcceptedFormVariants(expectedForm) {
    const clean = normalizeFormToken(expectedForm);
    if (!clean) return [];
    const parts = clean.split('/').map(function (p) { return p.trim(); }).filter(Boolean);
    const accepted = new Set(parts);
    accepted.add(clean);
    if (parts.length === 2) {
      accepted.add(parts[1] + '/' + parts[0]);
    }
    return Array.from(accepted);
  }

  function gradeVerbForm(userAnswer, expectedForm) {
    const userClean = normalizeFormToken(userAnswer);
    if (!userClean) return false;
    const accepted = getAcceptedFormVariants(expectedForm);
    return accepted.indexOf(userClean) !== -1;
  }

  function gradeIrregularPair(userV2, userV3, verbObj) {
    const v2Ok = Boolean(verbObj && gradeVerbForm(userV2, verbObj.v2));
    const v3Ok = Boolean(verbObj && gradeVerbForm(userV3, verbObj.v3));
    return {
      v2Ok: v2Ok,
      v3Ok: v3Ok,
      allOk: v2Ok && v3Ok,
      expectedV2: (verbObj && verbObj.v2) || '',
      expectedV3: (verbObj && verbObj.v3) || ''
    };
  }

  const DEFAULT_IRREGULAR_VERBS = RAW_STARTER_VERBS.map(function (v, idx) {
    return normalizeIrregularVerb(v, v.topic, 1700000000000, idx + 1);
  });

  const api = {
    DEFAULT_IRREGULAR_TOPICS: DEFAULT_IRREGULAR_TOPICS,
    DEFAULT_IRREGULAR_VERBS: DEFAULT_IRREGULAR_VERBS,
    SAMPLE_IRREGULAR_TXT: SAMPLE_IRREGULAR_TXT,
    cleanFormString: cleanFormString,
    normalizeTopicRecord: normalizeTopicRecord,
    normalizeIrregularVerb: normalizeIrregularVerb,
    parseSingleIrregularLine: parseSingleIrregularLine,
    parseIrregularBulkText: parseIrregularBulkText,
    mergeIrregularEntries: mergeIrregularEntries,
    exportIrregularToTXT: exportIrregularToTXT,
    getAcceptedFormVariants: getAcceptedFormVariants,
    gradeVerbForm: gradeVerbForm,
    gradeIrregularPair: gradeIrregularPair
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWEIrregular = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
