/**
 * SWE ENGLISH EXTRA — Zero-Dependency Node.js Real-Time Classroom Server
 * Serves static SPA assets, persists state in data/db.json, authenticates roles/students,
 * streams live student activity via Server-Sent Events (/api/stream), and supports AI proxy fallback.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const Data = require('./js/default-data.js');
const SRS = require('./js/srs.js');
const Auth = require('./js/auth.js');
const Storage = require('./js/storage.js');
const AiTxt = require('./js/ai-txt.js');
const Exam = require('./js/exam.js');
const Speech = require('./js/speech.js');
const Irregular = require('./js/irregular-verbs.js');

const DEFAULT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const SERVER_MAX_LOGIN_ATTEMPTS = 5;
const SERVER_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const SERVER_LOCKOUT_MS = 3 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const BASE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.tailwindcss.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');

function listReachableLanUrls(port) {
  const nets = os.networkInterfaces();
  const entries = [];
  const portNum = Number(port) || 4175;
  Object.keys(nets).forEach(function (ifName) {
    (nets[ifName] || []).forEach(function (info) {
      if (!info || info.family !== 'IPv4' || info.internal) return;
      const addr = String(info.address || '');
      if (!addr || addr.indexOf('169.254.') === 0) return;
      const lowerName = String(ifName || '').toLowerCase();
      const isVirtual = /vethernet|hyper-v|wsl|docker|virtualbox|vmware|loopback/.test(lowerName) ||
        (addr.indexOf('172.') === 0 && lowerName.indexOf('wi-fi') === -1 && lowerName.indexOf('ethernet') === -1);
      entries.push({
        name: ifName,
        ip: addr,
        url: 'http://' + addr + ':' + portNum,
        isVirtual: isVirtual
      });
    });
  });
  entries.sort(function (a, b) {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function isTrustworthyRequest(req) {
  if (!req || !req.headers) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto === 'https') return true;
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function getSecurityHeaders(isHtml, trustworthyOrigin) {
  const headers = Object.assign({}, BASE_SECURITY_HEADERS);
  if (trustworthyOrigin !== false) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
  }
  if (isHtml) {
    headers['Content-Security-Policy'] = HTML_CSP;
  }
  return headers;
}

function maskApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

function readOrCreateSecret(secretFile) {
  const dir = path.dirname(secretFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, secret, 'utf8');
  return secret;
}

function signSessionToken(sessionObj, secret, ttlMs, nowMs) {
  const issuedAt = typeof nowMs === 'number' ? nowMs : Date.now();
  const lifetime = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TOKEN_TTL_MS;
  const enriched = Object.assign({}, sessionObj, {
    iat: issuedAt,
    exp: issuedAt + lifetime,
    jti: crypto.randomBytes(12).toString('hex')
  });
  const payload = Buffer.from(JSON.stringify(enriched), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySessionToken(token, secret, revokedSet, nowMs) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  const sig = parts[1];
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || !parsed.role || !parsed.userId) return null;
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (!parsed.exp || now > Number(parsed.exp)) return null;
    if (revokedSet && parsed.jti && revokedSet.has(parsed.jti)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function sanitizeDbForSession(db, session) {
  if (!session) {
    return { unauthenticated: true, version: 3 };
  }

  const rawAi = db.aiConfig || {};
  const effectiveTts = Speech.resolveEffectiveTtsConfig(rawAi, 'en-US');

  if (session.role === 'student') {
    const ownProgress = {};
    if (db.studentProgress && db.studentProgress[session.userId]) {
      ownProgress[session.userId] = db.studentProgress[session.userId];
    }
    return {
      version: 3,
      words: db.words,
      categories: db.categories,
      lessons: db.lessons,
      irregularTopics: db.irregularTopics || [],
      irregularVerbs: db.irregularVerbs || [],
      students: [],
      studentProgress: ownProgress,
      studentActivityLog: [],
      stats: Storage.createEmptyStats(Date.now()),
      settings: db.settings,
      aiConfig: {
        provider: rawAi.provider || 'deepseek',
        model: rawAi.model || 'deepseek-chat',
        apiKey: '',
        customUrl: '',
        hasApiKey: false,
        apiKeyMasked: '',
        ttsProvider: rawAi.ttsProvider || 'auto',
        ttsModel: '',
        ttsCustomUrl: '',
        ttsApiKey: '',
        ttsVoiceUs: '',
        ttsVoiceUk: '',
        hasTtsKey: Boolean(effectiveTts.hasKey),
        ttsApiKeyMasked: ''
      },
      auth: { hashes: {}, updatedAt: null },
      auditLog: []
    };
  }

  // Teacher receives AI/TTS readiness status without keys/endpoints; IT Manager receives masked metadata
  const safeStudents = (db.students || []).map(Auth.sanitizeStudentForClient);
  const canSeeAiSettings = Auth.canManageAiConfig(session.role);
  return {
    version: 3,
    words: db.words,
    categories: db.categories,
    lessons: db.lessons,
    irregularTopics: db.irregularTopics || [],
    irregularVerbs: db.irregularVerbs || [],
    students: safeStudents,
    studentProgress: db.studentProgress || {},
    studentActivityLog: db.studentActivityLog || [],
    stats: db.stats,
    settings: db.settings,
    aiConfig: {
      provider: rawAi.provider || 'deepseek',
      model: rawAi.model || 'deepseek-chat',
      customUrl: canSeeAiSettings ? (rawAi.customUrl || '') : '',
      apiKey: '',
      hasApiKey: Boolean(rawAi.apiKey),
      apiKeyMasked: canSeeAiSettings ? maskApiKey(rawAi.apiKey) : '',
      ttsProvider: rawAi.ttsProvider || 'auto',
      ttsModel: canSeeAiSettings ? (rawAi.ttsModel || '') : '',
      ttsCustomUrl: canSeeAiSettings ? (rawAi.ttsCustomUrl || '') : '',
      ttsApiKey: '',
      ttsVoiceUs: canSeeAiSettings ? (rawAi.ttsVoiceUs || '') : '',
      ttsVoiceUk: canSeeAiSettings ? (rawAi.ttsVoiceUk || '') : '',
      hasTtsKey: Boolean(rawAi.ttsApiKey || effectiveTts.hasKey),
      ttsApiKeyMasked: canSeeAiSettings ? maskApiKey(rawAi.ttsApiKey) : ''
    },
    auth: { hashes: {}, updatedAt: (db.auth && db.auth.updatedAt) || null },
    auditLog: db.auditLog || []
  };
}

function readJsonBody(req, limitBytes) {
  const maxBytes = limitBytes || 2 * 1024 * 1024;
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('So‘rov hajmi juda katta.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('JSON format noto‘g‘ri.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, getCorsHeaders(), getSecurityHeaders(false), extraHeaders || {}));
  res.end(body);
}

function createAppServer(options) {
  const opts = options || {};
  const rootDir = path.resolve(opts.rootDir || __dirname);
  const defaultDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
  const dataFilePath = path.resolve(opts.dataFilePath || path.join(defaultDataDir, 'db.json'));
  const secretFilePath = path.resolve(opts.secretFilePath || path.join(path.dirname(dataFilePath), '.session-secret'));
  const tokenTtlMs = typeof opts.tokenTtlMs === 'number' && opts.tokenTtlMs > 0 ? opts.tokenTtlMs : DEFAULT_TOKEN_TTL_MS;
  const maxAttempts = typeof opts.maxLoginAttempts === 'number' && opts.maxLoginAttempts > 0 ? opts.maxLoginAttempts : SERVER_MAX_LOGIN_ATTEMPTS;
  const lockoutMs = typeof opts.lockoutMs === 'number' && opts.lockoutMs > 0 ? opts.lockoutMs : SERVER_LOCKOUT_MS;
  const fetcher = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  let publicUrl = String(opts.publicUrl || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  let tunnelStatus = publicUrl ? 'ready' : 'idle';

  const sessionSecret = readOrCreateSecret(secretFilePath);
  const sseClients = new Set();
  const revokedTokens = new Map();
  const rateLimitMap = new Map();
  const registerLimitMap = new Map();
  const aiProxyCache = new Map();
  const aiInFlight = new Map();
  const AI_PROXY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const AI_PROXY_CACHE_MAX = 150;
  const ttsCacheDir = path.join(path.dirname(dataFilePath), 'tts-cache');
  const ttsInFlight = new Map();
  const pronounceInFlight = new Map();
  const TTS_DISK_CACHE_MAX = 2000;

  async function resolvePrimaryPronunciationOnServer(entries, actorRole) {
    const cfg = db.aiConfig || {};
    const list = (Array.isArray(entries) ? entries : []).filter(function (item) {
      return item && String(item.word || '').trim().length > 0;
    });
    if (list.length === 0) {
      return { source: 'db', provider: cfg.provider || 'deepseek', updatedCount: 0, items: [] };
    }
    if (!cfg.apiKey) {
      return { mode: 'no-ai-key', provider: cfg.provider || 'deepseek', updatedCount: 0, items: list };
    }

    const sig = list.map(function (x) { return String(x.word || '').trim().toLowerCase(); }).sort().join('|');
    let pending = pronounceInFlight.get(sig);
    if (!pending) {
      pending = (async function () {
        let stats = { sentToAi: 0, apiCalls: 0 };
        const items = await AiTxt.resolvePronunciationWithAI(list, cfg, {
          existingWords: db.words,
          useCache: false,
          batchSize: AiTxt.DEFAULT_BATCH_SIZE || 40,
          onStats: function (st) { stats = st; },
          fetchImpl: fetcher
        });

        const byLower = new Map();
        items.forEach(function (it) {
          if (it && it.word) byLower.set(it.word.toLowerCase(), it);
        });

        let updatedCount = 0;
        const now = Date.now();
        db.words = (db.words || []).map(function (w) {
          const match = byLower.get(String(w.word || '').trim().toLowerCase());
          if (!match) return w;
          const nextPh = w.phonetic || match.phonetic || '';
          const nextUk = w.phoneticUk || match.phoneticUk || '';
          const nextSyl = w.syllables || match.syllables || '';
          const nextNote = w.pronunciationNote || match.pronunciationNote || '';
          if (
            nextPh === (w.phonetic || '') &&
            nextUk === (w.phoneticUk || '') &&
            nextSyl === (w.syllables || '') &&
            nextNote === (w.pronunciationNote || '')
          ) {
            return w;
          }
          updatedCount++;
          return Object.assign({}, w, {
            phonetic: nextPh,
            phoneticUk: nextUk,
            syllables: nextSyl,
            pronunciationNote: nextNote,
            updatedAt: now
          });
        });

        if (updatedCount > 0) {
          if (Auth.isAdminRole(actorRole)) {
            db.auditLog = Auth.appendAuditLog(
              db.auditLog,
              actorRole,
              'AI_PRONOUNCE',
              (cfg.provider || 'deepseek') + ' orqali ' + updatedCount + ' ta so‘z talaffuzi aniqlandi',
              now
            );
          }
          saveDb();
          broadcastSse('curriculum');
        }

        return {
          source: stats.apiCalls > 0 ? 'ai' : 'db',
          provider: cfg.provider || 'deepseek',
          apiCalls: stats.apiCalls || 0,
          updatedCount: updatedCount,
          items: items
        };
      })().finally(function () {
        pronounceInFlight.delete(sig);
      });
      pronounceInFlight.set(sig, pending);
    }
    return pending;
  }

  function readTtsDiskCache(cacheHash) {
    if (!/^[a-f0-9]{64}$/.test(cacheHash)) return null;
    const candidates = [
      { ext: '.mp3', mime: 'audio/mpeg' },
      { ext: '.wav', mime: 'audio/wav' }
    ];
    for (let i = 0; i < candidates.length; i++) {
      const filePath = path.join(ttsCacheDir, cacheHash + candidates[i].ext);
      if (fs.existsSync(filePath)) {
        try {
          return { buffer: fs.readFileSync(filePath), mime: candidates[i].mime };
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function writeTtsDiskCache(cacheHash, mime, buf) {
    if (!/^[a-f0-9]{64}$/.test(cacheHash) || !buf || buf.length < 32) return;
    try {
      if (!fs.existsSync(ttsCacheDir)) {
        fs.mkdirSync(ttsCacheDir, { recursive: true });
      }
      const existing = fs.readdirSync(ttsCacheDir);
      if (existing.length >= TTS_DISK_CACHE_MAX) {
        const removeSlice = existing.slice(0, Math.max(1, existing.length - TTS_DISK_CACHE_MAX + 50));
        removeSlice.forEach(function (name) {
          try { fs.unlinkSync(path.join(ttsCacheDir, name)); } catch (e) {}
        });
      }
      const ext = mime === 'audio/wav' ? '.wav' : '.mp3';
      fs.writeFileSync(path.join(ttsCacheDir, cacheHash + ext), buf);
    } catch (e) {
      // Ignore non-fatal cache write errors
    }
  }

  async function synthesizeViaProvider(text, accent, effectiveTts) {
    const provider = effectiveTts.provider;
    const model = effectiveTts.model;
    const voice = effectiveTts.voice;
    const apiKey = effectiveTts.apiKey;
    const accentLabel = accent === 'en-GB'
      ? 'standard British Received Pronunciation (UK English)'
      : 'standard General American (US English)';

    if (provider === 'openai' || provider === 'custom') {
      const rawUrl = provider === 'custom'
        ? effectiveTts.customUrl
        : (effectiveTts.customUrl || Speech.TTS_PROVIDER_DEFAULTS.openai.endpoint);
      const safeEndpoint = AiTxt.validateAiEndpoint(rawUrl);
      const bodyObj = {
        model: model || 'gpt-4o-mini-tts',
        input: text,
        voice: voice || 'coral',
        response_format: 'mp3',
        speed: 1.0
      };
      if (String(bodyObj.model).indexOf('gpt-4o-mini-tts') === 0) {
        bodyObj.instructions = 'Pronounce clearly, naturally, and articulately in ' + accentLabel + '.';
      }
      const ttsRes = await fetcher(safeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        redirect: 'error',
        body: JSON.stringify(bodyObj)
      });
      if (!ttsRes.ok) {
        const errData = await ttsRes.json().catch(function () { return {}; });
        const msg = (errData && errData.error && errData.error.message) || ('HTTP ' + ttsRes.status);
        throw new Error('TTS API xatosi: ' + msg);
      }
      const arrBuf = await ttsRes.arrayBuffer();
      const ct = String(ttsRes.headers.get('content-type') || 'audio/mpeg').split(';')[0].trim();
      return { buffer: Buffer.from(arrBuf), mime: ct.indexOf('wav') !== -1 ? 'audio/wav' : 'audio/mpeg' };
    }

    if (provider === 'gemini') {
      const gemModel = model || Speech.TTS_PROVIDER_DEFAULTS.gemini.defaultModel;
      const safeEndpoint = AiTxt.validateAiEndpoint(
        'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(gemModel) + ':generateContent'
      );
      const ttsRes = await fetcher(safeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        redirect: 'error',
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'Pronounce clearly and naturally in ' + accentLabel + ': ' + text }]
          }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice || 'Kore' }
              }
            }
          }
        })
      });
      const gemData = await ttsRes.json().catch(function () { return {}; });
      if (!ttsRes.ok) {
        const msg = (gemData && gemData.error && gemData.error.message) || ('HTTP ' + ttsRes.status);
        throw new Error('Gemini TTS API xatosi: ' + msg);
      }
      let audioPart = null;
      const parts = gemData && gemData.candidates && gemData.candidates[0] &&
        gemData.candidates[0].content && gemData.candidates[0].content.parts;
      if (Array.isArray(parts)) {
        audioPart = parts.find(function (p) { return p && (p.inlineData || p.inline_data); });
      }
      const inline = audioPart && (audioPart.inlineData || audioPart.inline_data);
      if (!inline || !inline.data) {
        throw new Error('Gemini TTS bo‘sh audio qaytardi.');
      }
      const rawBytes = Buffer.from(inline.data, 'base64');
      const inlineMime = String(inline.mimeType || inline.mime_type || 'audio/L16;codec=pcm;rate=24000').toLowerCase();
      if (inlineMime.indexOf('l16') !== -1 || inlineMime.indexOf('pcm') !== -1) {
        const wavBytes = Speech.pcm16ToWavUint8Array(rawBytes, inlineMime);
        return { buffer: Buffer.from(wavBytes), mime: 'audio/wav' };
      }
      return { buffer: rawBytes, mime: inlineMime.indexOf('mp3') !== -1 || inlineMime.indexOf('mpeg') !== -1 ? 'audio/mpeg' : 'audio/wav' };
    }

    if (provider === 'elevenlabs') {
      const voiceId = voice || Speech.TTS_PROVIDER_DEFAULTS.elevenlabs.voiceUs;
      const safeEndpoint = AiTxt.validateAiEndpoint(
        'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId)
      );
      const ttsRes = await fetcher(safeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey
        },
        redirect: 'error',
        body: JSON.stringify({
          text: text,
          model_id: model || Speech.TTS_PROVIDER_DEFAULTS.elevenlabs.defaultModel
        })
      });
      if (!ttsRes.ok) {
        const errData = await ttsRes.json().catch(function () { return {}; });
        const msg = (errData && (errData.detail && errData.detail.message || errData.detail || errData.error && errData.error.message)) || ('HTTP ' + ttsRes.status);
        throw new Error('ElevenLabs TTS xatosi: ' + msg);
      }
      const arrBuf = await ttsRes.arrayBuffer();
      return { buffer: Buffer.from(arrBuf), mime: 'audio/mpeg' };
    }

    throw new Error('Qo‘llab-quvvatlanmagan TTS provayder.');
  }

  function pruneSecurityMaps(nowMs) {
    const ts = typeof nowMs === 'number' ? nowMs : Date.now();
    revokedTokens.forEach(function (exp, jti) {
      if (!exp || ts > Number(exp)) revokedTokens.delete(jti);
    });
    rateLimitMap.forEach(function (rec, key) {
      if (rec.lockedUntil && ts > rec.lockedUntil + SERVER_ATTEMPT_WINDOW_MS) {
        rateLimitMap.delete(key);
      } else if (!rec.lockedUntil && rec.firstAttemptAt && (ts - rec.firstAttemptAt) > SERVER_ATTEMPT_WINDOW_MS) {
        rateLimitMap.delete(key);
      }
    });
  }

  function isProxiedTunnelRequest(req) {
    if (!req || !req.headers) return false;
    const host = String(req.headers.host || '').toLowerCase();
    return Boolean(
      opts.trustProxy ||
      process.env.TRUST_PROXY === '1' ||
      host.endsWith('.lhr.life') ||
      host.endsWith('.localhost.run') ||
      host.endsWith('.onrender.com') ||
      host.endsWith('.up.railway.app') ||
      host.endsWith('.fly.dev') ||
      host.endsWith('.trycloudflare.com')
    );
  }

  function getClientIp(req) {
    if (isProxiedTunnelRequest(req) && req && req.headers && req.headers['x-forwarded-for']) {
      const fwd = String(req.headers['x-forwarded-for']).split(',')[0].trim();
      if (fwd) return fwd.replace(/^::ffff:/, '');
    }
    const raw = (req && req.socket && req.socket.remoteAddress) ? String(req.socket.remoteAddress) : '127.0.0.1';
    return raw.replace(/^::ffff:/, '');
  }

  function getLoginBucketKey(req, role, username) {
    const ip = getClientIp(req);
    const cleanRole = String(role || 'student');
    const cleanUser = cleanRole === 'student' ? Auth.normalizeUsername(username) : cleanRole;
    return ip + ':' + cleanRole + ':' + (cleanUser || '_blank_');
  }

  function checkServerRateLimit(bucketKey, nowMs) {
    const ts = typeof nowMs === 'number' ? nowMs : Date.now();
    pruneSecurityMaps(ts);
    const rec = rateLimitMap.get(bucketKey);
    if (!rec) return { allowed: true, retryAfterSec: 0, remaining: maxAttempts };
    if (rec.lockedUntil && ts < rec.lockedUntil) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((rec.lockedUntil - ts) / 1000)),
        remaining: 0
      };
    }
    if (rec.firstAttemptAt && (ts - rec.firstAttemptAt) > SERVER_ATTEMPT_WINDOW_MS) {
      rateLimitMap.delete(bucketKey);
      return { allowed: true, retryAfterSec: 0, remaining: maxAttempts };
    }
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, maxAttempts - Number(rec.count || 0))
    };
  }

  function recordServerFailure(bucketKey, nowMs) {
    const ts = typeof nowMs === 'number' ? nowMs : Date.now();
    const prev = rateLimitMap.get(bucketKey);
    let count = 1;
    let firstAttemptAt = ts;
    if (prev && prev.firstAttemptAt && (ts - prev.firstAttemptAt) <= SERVER_ATTEMPT_WINDOW_MS) {
      count = Number(prev.count || 0) + 1;
      firstAttemptAt = prev.firstAttemptAt;
    }
    const justLocked = count >= maxAttempts;
    const lockedUntil = justLocked ? (ts + lockoutMs) : 0;
    rateLimitMap.set(bucketKey, { count: count, firstAttemptAt: firstAttemptAt, lockedUntil: lockedUntil });
    return {
      locked: justLocked,
      count: count,
      remaining: Math.max(0, maxAttempts - count),
      retryAfterSec: lockedUntil ? Math.max(1, Math.ceil(lockoutMs / 1000)) : 0
    };
  }

  function clearServerRateLimitForAccount(role, username) {
    const suffix = role === 'student'
      ? (':student:' + Auth.normalizeUsername(username))
      : (':' + role + ':' + role);
    Array.from(rateLimitMap.keys()).forEach(function (k) {
      if (k.endsWith(suffix)) rateLimitMap.delete(k);
    });
  }

  function loadDb() {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dataFilePath)) {
      const initial = Storage.createDefaultState(Date.now());
      fs.writeFileSync(dataFilePath, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      return Storage.normalizeState(parsed, Date.now());
    } catch (e) {
      const fallback = Storage.createDefaultState(Date.now());
      fs.writeFileSync(dataFilePath, JSON.stringify(fallback, null, 2), 'utf8');
      return fallback;
    }
  }

  let db = loadDb();

  function saveDb() {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dataFilePath, JSON.stringify(db, null, 2), 'utf8');
  }

  function broadcastSse(reason) {
    const dataStr = JSON.stringify({ reason: reason || 'update', timestamp: Date.now() });
    sseClients.forEach(function (clientRes) {
      try {
        clientRes.write('event: update\ndata: ' + dataStr + '\n\n');
      } catch (e) {
        sseClients.delete(clientRes);
      }
    });
  }

  function getSessionFromRequest(req, parsedUrl) {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || (parsedUrl && parsedUrl.searchParams.get('token')) || '';
    pruneSecurityMaps(Date.now());
    return verifySessionToken(token, sessionSecret, revokedTokens, Date.now());
  }

  function serveStaticFile(reqPath, req, res) {
    const cleanRel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const resolved = path.resolve(rootDir, cleanRel);
    const secHeaders = getSecurityHeaders(false, isTrustworthyRequest(req));

    // Block path traversal outside rootDir and block sensitive runtime data, tests, or server code
    if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
      res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, secHeaders));
      res.end('Forbidden');
      return;
    }
    const relFromRoot = path.relative(rootDir, resolved).replace(/\\/g, '/');
    if (
      relFromRoot === 'server.js' ||
      relFromRoot === '.gitignore' ||
      relFromRoot === 'package.json' ||
      relFromRoot === 'Dockerfile' ||
      relFromRoot === 'render.yaml' ||
      relFromRoot === 'start-server.bat' ||
      relFromRoot === 'data' ||
      relFromRoot.startsWith('data/') ||
      relFromRoot === 'tests' ||
      relFromRoot.startsWith('tests/') ||
      relFromRoot.startsWith('.git')
    ) {
      res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, secHeaders));
      res.end('Forbidden');
      return;
    }

    fs.stat(resolved, function (err, stat) {
      if (err || !stat.isFile()) {
        res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, secHeaders));
        res.end('Not found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, Object.assign({
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      }, getSecurityHeaders(ext === '.html', isTrustworthyRequest(req))));
      fs.createReadStream(resolved).pipe(res);
    });
  }

  const server = http.createServer(async function (req, res) {
    const parsedUrl = new URL(req.url || '/', 'http://' + ((req && req.headers && req.headers.host) || '127.0.0.1'));
    const pathname = parsedUrl.pathname;

    try {
      if (pathname.startsWith('/api/') && req.method === 'OPTIONS') {
        res.writeHead(204, Object.assign({}, getCorsHeaders(), getSecurityHeaders(false)));
        res.end();
        return;
      }

      if (pathname === '/api/health' && req.method === 'GET') {
        const openSignup = !(db.settings && db.settings.allowOpenSignup === false);
        sendJson(res, 200, {
          ok: true,
          mode: 'server',
          version: 5,
          allowOpenSignup: openSignup,
          publicUrl: publicUrl || '',
          tunnelStatus: tunnelStatus,
          timestamp: Date.now()
        });
        return;
      }

      if (pathname === '/api/public-link' && req.method === 'GET') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Kirish havolasini faqat Teacher yoki IT Manager ko‘ra oladi.' });
          return;
        }
        const allowOpenSignup = !(db.settings && db.settings.allowOpenSignup === false);
        sendJson(res, 200, {
          ok: true,
          publicUrl: publicUrl || '',
          tunnelStatus: tunnelStatus,
          allowOpenSignup: allowOpenSignup
        });
        return;
      }

      if (pathname === '/api/student-join' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const now = Date.now();
        const allowOpenSignup = !(db.settings && db.settings.allowOpenSignup === false);
        const rawIdent = String(body.username || body.identifier || body.fullName || '').trim();
        const rlBucket = getLoginBucketKey(req, 'student', rawIdent);
        const rlCheck = checkServerRateLimit(rlBucket, now);

        if (!rlCheck.allowed) {
          sendJson(
            res,
            429,
            {
              ok: false,
              rateLimited: true,
              retryAfterSec: rlCheck.retryAfterSec,
              error: 'Juda ko‘p xato urinish! ' + rlCheck.retryAfterSec + ' soniyadan keyin qayta urinib ko‘ring.'
            },
            { 'Retry-After': String(rlCheck.retryAfterSec) }
          );
          return;
        }

        const joinRes = Auth.joinOrAuthenticateStudent({
          students: db.students,
          username: body.username || '',
          fullName: body.fullName || '',
          group: body.group || '',
          password: body.password || '',
          allowOpenSignup: allowOpenSignup,
          now: now
        });

        if (!joinRes.ok) {
          if (joinRes.statusCode === 401 && String(body.password || '').trim()) {
            const failState = recordServerFailure(rlBucket, now);
            if (failState.locked) {
              db.auditLog = Auth.appendAuditLog(
                db.auditLog,
                'student',
                'AUTH_LOCKOUT',
                'Brute-force himoya: ' + rlBucket + ' vaqtincha bloklandi (' + maxAttempts + ' xato urinish)',
                now
              );
              saveDb();
              sendJson(
                res,
                429,
                {
                  ok: false,
                  rateLimited: true,
                  retryAfterSec: failState.retryAfterSec,
                  error: 'Juda ko‘p xato urinish! ' + failState.retryAfterSec + ' soniyadan keyin qayta urinib ko‘ring.'
                },
                { 'Retry-After': String(failState.retryAfterSec) }
              );
              return;
            }
          }
          sendJson(res, joinRes.statusCode || 400, {
            ok: false,
            needsPassword: Boolean(joinRes.needsPassword),
            error: joinRes.error || 'Kirishda xatolik yuz berdi.'
          });
          return;
        }

        rateLimitMap.delete(rlBucket);
        db.students = joinRes.students;
        db.studentProgress = Storage.ensureStudentProgress(db, joinRes.session.userId, now);
        db = Storage.recordStudentEvent(db, joinRes.session, {
          type: joinRes.mode === 'created' ? 'REGISTER' : 'LOGIN',
          view: 'dashboard',
          detail: joinRes.mode === 'created'
            ? 'Telefondan tezkor qo‘shilib kirdi'
            : 'Telefondan tizimga kirdi'
        }, now);
        saveDb();
        broadcastSse(joinRes.mode === 'created' ? 'students' : 'login');

        const token = signSessionToken(joinRes.session, sessionSecret, tokenTtlMs, now);
        sendJson(res, 200, {
          ok: true,
          mode: joinRes.mode,
          token: token,
          session: joinRes.session,
          state: sanitizeDbForSession(db, joinRes.session)
        });
        return;
      }

      if (pathname === '/api/network-info' && req.method === 'GET') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Tarmoq havolalarini faqat Teacher yoki IT Manager ko‘ra oladi.' });
          return;
        }
        const hostHeader = String((req && req.headers && req.headers.host) || '');
        const portPart = hostHeader.indexOf(':') !== -1 ? Number(hostHeader.split(':').pop()) : (server.address() && server.address().port) || 4175;
        const allowOpenSignup = !(db.settings && db.settings.allowOpenSignup === false);
        sendJson(res, 200, {
          ok: true,
          port: portPart || 4175,
          allowOpenSignup: allowOpenSignup,
          urls: listReachableLanUrls(portPart || 4175)
        });
        return;
      }

      if (pathname === '/api/register' && req.method === 'POST') {
        const allowOpenSignup = !(db.settings && db.settings.allowOpenSignup === false);
        if (!allowOpenSignup) {
          sendJson(res, 403, { ok: false, error: 'Ochiq ro‘yxatdan o‘tish vaqtincha yopilgan. O‘qituvchingizdan login va parol so‘rang.' });
          return;
        }
        const body = await readJsonBody(req);
        const now = Date.now();
        const clientIp = getClientIp(req);
        const regRec = registerLimitMap.get(clientIp);
        if (regRec && (now - regRec.firstAt) <= SERVER_ATTEMPT_WINDOW_MS && regRec.count >= 120) {
          sendJson(res, 429, { ok: false, error: 'Ushbu tarmoqdan juda ko‘p ro‘yxatdan o‘tish bo‘ldi. Birozdan so‘ng qayta urining.' });
          return;
        }

        let regRes;
        try {
          regRes = Auth.registerStudentSelf(db.students, body, now);
        } catch (regErr) {
          sendJson(res, 400, { ok: false, error: (regErr && regErr.message) || 'Ro‘yxatdan o‘tishda xatolik.' });
          return;
        }

        if (!regRec || (now - regRec.firstAt) > SERVER_ATTEMPT_WINDOW_MS) {
          registerLimitMap.set(clientIp, { count: 1, firstAt: now });
        } else {
          regRec.count++;
        }

        db.students = regRes.students;
        db.studentProgress = Storage.ensureStudentProgress(db, regRes.created.id, now);
        db = Storage.recordStudentEvent(db, regRes.session, {
          type: 'REGISTER',
          view: 'dashboard',
          detail: 'Telefondan / mustaqil ro‘yxatdan o‘tib kirdi'
        }, now);
        saveDb();
        broadcastSse('students');

        const token = signSessionToken(regRes.session, sessionSecret, tokenTtlMs, now);
        sendJson(res, 200, {
          ok: true,
          token: token,
          session: regRes.session,
          state: sanitizeDbForSession(db, regRes.session)
        });
        return;
      }

      if (pathname === '/api/stream' && req.method === 'GET') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Jonli oqim (SSE) uchun avtorizatsiya talab qilinadi.' });
          return;
        }
        if (session.role === 'student') {
          const existsActive = (db.students || []).some(function (s) {
            return s.id === session.userId && s.active !== false;
          });
          if (!existsActive) {
            sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti faol emas.' });
            return;
          }
        }
        res.writeHead(200, Object.assign({
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }, getCorsHeaders(), getSecurityHeaders(false)));
        res.write('event: connected\ndata: {"ok":true}\n\n');
        sseClients.add(res);
        const keepAlive = setInterval(function () {
          try { res.write(': ping\n\n'); } catch (e) { clearInterval(keepAlive); }
        }, 20000);
        req.on('close', function () {
          clearInterval(keepAlive);
          sseClients.delete(res);
        });
        return;
      }

      if (pathname === '/api/login' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const now = Date.now();
        const rlBucket = getLoginBucketKey(req, body.role, body.username);
        const rlCheck = checkServerRateLimit(rlBucket, now);

        if (!rlCheck.allowed) {
          sendJson(
            res,
            429,
            {
              ok: false,
              rateLimited: true,
              retryAfterSec: rlCheck.retryAfterSec,
              error: 'Juda ko‘p xato urinish! ' + rlCheck.retryAfterSec + ' soniyadan keyin qayta urinib ko‘ring.'
            },
            { 'Retry-After': String(rlCheck.retryAfterSec) }
          );
          return;
        }

        const authRes = Auth.authenticate({
          authState: db.auth,
          students: db.students,
          role: body.role || 'student',
          username: body.username || '',
          password: body.password || '',
          now: now
        });

        if (!authRes.ok) {
          const failState = recordServerFailure(rlBucket, now);
          if (failState.locked) {
            db.auditLog = Auth.appendAuditLog(
              db.auditLog,
              String(body.role || 'student'),
              'AUTH_LOCKOUT',
              'Brute-force himoya: ' + rlBucket + ' vaqtincha bloklandi (' + maxAttempts + ' xato urinish)',
              now
            );
            saveDb();
            sendJson(
              res,
              429,
              {
                ok: false,
                rateLimited: true,
                retryAfterSec: failState.retryAfterSec,
                error: 'Juda ko‘p xato urinish! ' + failState.retryAfterSec + ' soniyadan keyin qayta urinib ko‘ring.'
              },
              { 'Retry-After': String(failState.retryAfterSec) }
            );
            return;
          }
          sendJson(res, 401, {
            ok: false,
            remainingAttempts: failState.remaining,
            error: authRes.error
          });
          return;
        }

        rateLimitMap.delete(rlBucket);
        const session = authRes.session;
        if (session.role === 'student') {
          db = Storage.recordStudentEvent(db, session, {
            type: 'LOGIN',
            view: 'dashboard',
            detail: 'Tizimga kirdi'
          }, now);
        } else {
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'LOGIN',
            Auth.ROLE_META[session.role].label + ' sifatida tizimga kirdi',
            now
          );
        }
        saveDb();
        broadcastSse('login');

        const token = signSessionToken(session, sessionSecret, tokenTtlMs, now);
        sendJson(res, 200, {
          ok: true,
          token: token,
          session: session,
          state: sanitizeDbForSession(db, session)
        });
        return;
      }

      if (pathname === '/api/logout' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (session) {
          const now = Date.now();
          if (session.jti) {
            revokedTokens.set(session.jti, session.exp || (now + tokenTtlMs));
          }
          if (session.role === 'student') {
            db = Storage.recordStudentEvent(db, session, {
              type: 'LOGOUT',
              detail: 'Tizimdan chiqdi'
            }, now);
          } else {
            db.auditLog = Auth.appendAuditLog(
              db.auditLog,
              session.role,
              'LOGOUT',
              Auth.ROLE_META[session.role].label + ' sessiyani yopdi',
              now
            );
          }
          saveDb();
          broadcastSse('logout');
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Sessiya topilmadi yoki muddati tugagan.' });
          return;
        }
        if (session.role === 'student') {
          const existsActive = (db.students || []).some(function (s) {
            return s.id === session.userId && s.active !== false;
          });
          if (!existsActive) {
            sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti faol emas.' });
            return;
          }
        }
        sendJson(res, 200, { ok: true, session: session, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/review' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Avtorizatsiya talab qilinadi.' });
          return;
        }
        if (session.role === 'student' && !(db.students || []).some(function (s) { return s.id === session.userId && s.active !== false; })) {
          sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti topilmadi yoki bloklangan.' });
          return;
        }
        const body = await readJsonBody(req);
        const result = Storage.applyWordReviewForSession(db, session, body.wordId, body.ratingKey, SRS, Date.now());
        db = result.state;
        saveDb();
        broadcastSse('telemetry');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/telemetry' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Avtorizatsiya talab qilinadi.' });
          return;
        }
        if (session.role === 'student' && !(db.students || []).some(function (s) { return s.id === session.userId && s.active !== false; })) {
          sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti topilmadi yoki bloklangan.' });
          return;
        }
        const body = await readJsonBody(req);
        if (session.role === 'student') {
          db = Storage.recordStudentEvent(db, session, body, Date.now());
          saveDb();
          broadcastSse(body.type === 'HEARTBEAT' ? 'heartbeat' : 'telemetry');
        }
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/exam' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Avtorizatsiya talab qilinadi.' });
          return;
        }
        if (session.role === 'student' && !(db.students || []).some(function (s) { return s.id === session.userId && s.active !== false; })) {
          sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti topilmadi yoki bloklangan.' });
          return;
        }
        const body = await readJsonBody(req);
        try {
          const examRes = Exam.applyExamAction(db, session, body, Date.now());
          db = examRes.state;
          saveDb();
          broadcastSse('exam');
          sendJson(res, 200, { ok: true, finalExam: examRes.finalExam, state: sanitizeDbForSession(db, session) });
        } catch (examErr) {
          sendJson(res, (examErr && examErr.statusCode) || 400, {
            ok: false,
            code: (examErr && examErr.code) || '',
            error: (examErr && examErr.message) || 'Yakuniy test amali bajarilmadi.'
          });
        }
        return;
      }

      if (pathname === '/api/curriculum' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Faqat Teacher yoki IT Manager ruxsatiga ega.' });
          return;
        }
        const body = await readJsonBody(req, 6 * 1024 * 1024);
        const now = Date.now();

        if (Array.isArray(body.words)) {
          db.words = body.words.map(function (w) { return Storage.normalizeWordRecord(w, now); });
        }
        if (Array.isArray(body.categories)) {
          db.categories = body.categories;
        }
        if (Array.isArray(body.lessons)) {
          db.lessons = body.lessons;
        }
        if (Array.isArray(body.irregularTopics)) {
          db.irregularTopics = body.irregularTopics.map(function (t, idx) {
            return Irregular.normalizeTopicRecord(t, idx);
          }).filter(function (t) { return Boolean(t && t.name); });
        }
        if (Array.isArray(body.irregularVerbs)) {
          const fallbackTopic = (db.irregularTopics && db.irregularTopics[0] && db.irregularTopics[0].name) || '';
          db.irregularVerbs = body.irregularVerbs.map(function (v, idx) {
            return Irregular.normalizeIrregularVerb(v, fallbackTopic, now, idx + 1);
          }).filter(function (v) { return Boolean(v && v.v1 && v.v2 && v.v3 && v.translation); });
        }
        if (body.auditAction) {
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, body.auditAction, body.auditDetail || '', now);
        }

        saveDb();
        broadcastSse('curriculum');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/students' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.canManageStudents(session.role)) {
          sendJson(res, 403, { ok: false, error: 'O‘quvchilarni boshqarish uchun admin huquqi kerak.' });
          return;
        }
        const body = await readJsonBody(req);
        const now = Date.now();

        if (body.action === 'create') {
          const resCreate = Auth.createStudentAccount(db.students, session.role, body.student, now);
          db.students = resCreate.students;
          db.studentProgress = Storage.ensureStudentProgress(db, resCreate.created.id, now);
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'STUDENT_ADD',
            'Yangi o‘quvchi qo‘shildi: ' + resCreate.created.fullName + ' (@' + resCreate.created.username + ')',
            now
          );
        } else if (body.action === 'resetPassword') {
          db.students = Auth.resetStudentPassword(db.students, session.role, body.studentId, body.newPassword);
          const resetStu = (db.students || []).find(function (s) { return s.id === body.studentId; });
          if (resetStu) clearServerRateLimitForAccount('student', resetStu.username);
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, 'STUDENT_PW_RESET', 'O‘quvchi paroli yangilandi: ' + body.studentId, now);
        } else if (body.action === 'toggleActive') {
          db.students = Auth.toggleStudentActive(db.students, session.role, body.studentId);
          const toggledStu = (db.students || []).find(function (s) { return s.id === body.studentId; });
          if (toggledStu) clearServerRateLimitForAccount('student', toggledStu.username);
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, 'STUDENT_STATUS', 'O‘quvchi holati o‘zgartirildi: ' + body.studentId, now);
        } else if (body.action === 'delete') {
          const delRes = Auth.deleteStudentAccount(db.students, session.role, body.studentId);
          db.students = delRes.students;
          if (db.studentProgress && delRes.deleted && delRes.deleted.id) {
            delete db.studentProgress[delRes.deleted.id];
          }
          if (Array.isArray(db.studentActivityLog) && delRes.deleted && delRes.deleted.id) {
            db.studentActivityLog = db.studentActivityLog.filter(function (ev) {
              return ev.studentId !== delRes.deleted.id;
            });
          }
          if (delRes.deleted && delRes.deleted.username) {
            clearServerRateLimitForAccount('student', delRes.deleted.username);
          }
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'STUDENT_DELETE',
            'O‘quvchi o‘chirildi: ' + delRes.deleted.fullName + ' (@' + delRes.deleted.username + ')',
            now
          );
        } else if (body.action === 'approveExamRetake') {
          const retakeRes = Exam.approveExamRetake(db, session.role, body.studentId, now);
          db = retakeRes.state;
          clearServerRateLimitForAccount('student', retakeRes.student.username);
        } else if (body.action === 'setOpenSignup') {
          const enabled = Boolean(body.allowOpenSignup);
          db.settings = Object.assign({}, db.settings || {}, { allowOpenSignup: enabled });
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'OPEN_SIGNUP',
            'O‘quvchilar uchun ochiq ro‘yxatdan o‘tish ' + (enabled ? 'YOQILDI' : 'YOPILDI'),
            now
          );
        } else {
          sendJson(res, 400, { ok: false, error: 'Noma’lum student amali.' });
          return;
        }

        saveDb();
        broadcastSse(body.action === 'approveExamRetake' ? 'exam' : 'students');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/ai-config' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.canManageAiConfig(session.role)) {
          sendJson(res, 403, { ok: false, error: 'API kalit sozlamalarini faqat IT Manager boshqaradi!' });
          return;
        }
        const body = await readJsonBody(req);
        const cfg = body.aiConfig || {};
        const customUrl = String(cfg.customUrl || '').trim();
        if (customUrl) {
          try {
            AiTxt.validateAiEndpoint(customUrl);
          } catch (urlErr) {
            sendJson(res, 400, { ok: false, error: urlErr.message });
            return;
          }
        }
        const ttsCustomUrl = String(cfg.ttsCustomUrl || '').trim();
        if (ttsCustomUrl) {
          try {
            AiTxt.validateAiEndpoint(ttsCustomUrl);
          } catch (ttsUrlErr) {
            sendJson(res, 400, { ok: false, error: ttsUrlErr.message });
            return;
          }
        }

        const prevAi = db.aiConfig || {};
        const rawSubmittedKey = String(cfg.apiKey || '').trim();
        const isMaskedSubmit = rawSubmittedKey.indexOf('••') !== -1;
        let nextApiKey = prevAi.apiKey || '';
        if (cfg.clearKey === true) {
          nextApiKey = '';
        } else if (rawSubmittedKey && !isMaskedSubmit) {
          nextApiKey = rawSubmittedKey;
        }

        const rawTtsKey = String(cfg.ttsApiKey || '').trim();
        const isTtsMasked = rawTtsKey.indexOf('••') !== -1;
        let nextTtsKey = prevAi.ttsApiKey || '';
        if (cfg.clearTtsKey === true) {
          nextTtsKey = '';
        } else if (rawTtsKey && !isTtsMasked) {
          nextTtsKey = rawTtsKey;
        }

        db.aiConfig = {
          provider: String(cfg.provider || 'deepseek'),
          model: String(cfg.model || 'deepseek-chat'),
          customUrl: customUrl,
          apiKey: nextApiKey,
          ttsProvider: String(cfg.ttsProvider || 'auto'),
          ttsModel: String(cfg.ttsModel || '').trim(),
          ttsCustomUrl: ttsCustomUrl,
          ttsApiKey: nextTtsKey,
          ttsVoiceUs: String(cfg.ttsVoiceUs || '').trim(),
          ttsVoiceUk: String(cfg.ttsVoiceUk || '').trim()
        };
        db.auditLog = Auth.appendAuditLog(
          db.auditLog,
          session.role,
          'AI_CONFIG',
          db.aiConfig.provider + ' (' + db.aiConfig.model + ') · TTS: ' + db.aiConfig.ttsProvider + ' sozlandi',
          Date.now()
        );
        saveDb();
        broadcastSse('ai-config');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if ((pathname === '/api/pronounce' || pathname === '/api/tts') && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session) {
          sendJson(res, 401, { ok: false, error: 'Avval tizimga kiring.' });
          return;
        }
        if (session.role === 'student') {
          const existsActive = (db.students || []).some(function (s) {
            return s.id === session.userId && s.active !== false;
          });
          if (!existsActive) {
            sendJson(res, 401, { ok: false, error: 'O‘quvchi akkaunti faol emas.' });
            return;
          }
        }
        if (!fetcher) {
          sendJson(res, 500, { ok: false, error: 'Serverda fetch API mavjud emas.' });
          return;
        }

        const body = await readJsonBody(req);

        if (pathname === '/api/pronounce') {
          let targets = [];
          if (Array.isArray(body.words) && body.words.length > 0) {
            if (!Auth.isAdminRole(session.role) && body.words.length > 1) {
              sendJson(res, 403, { ok: false, error: 'Ommaviy talaffuz aniqlash faqat Teacher yoki IT Manager uchun.' });
              return;
            }
            targets = body.words.slice(0, 80);
          } else if (body.wordId) {
            const matched = (db.words || []).find(function (w) { return w.id === body.wordId; });
            if (matched) targets = [matched];
          } else if (body.word) {
            const wClean = String(body.word || '').trim().slice(0, 120);
            const matchedByWord = (db.words || []).find(function (w) {
              return String(w.word || '').trim().toLowerCase() === wClean.toLowerCase();
            });
            targets = [matchedByWord || { word: wClean }];
          }

          if (targets.length === 0) {
            sendJson(res, 400, { ok: false, error: 'Talaffuzini aniqlash uchun so‘z kiritilmadi.' });
            return;
          }

          try {
            const out = await resolvePrimaryPronunciationOnServer(targets, session.role);
            sendJson(res, 200, Object.assign({ ok: true, state: sanitizeDbForSession(db, session) }, out));
          } catch (pErr) {
            sendJson(res, 502, { ok: false, error: (pErr && pErr.message) || 'Birlamchi AI talaffuz aniqlashda xatolik.' });
          }
          return;
        }

        const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 320);
        if (!text) {
          sendJson(res, 400, { ok: false, error: 'Talaffuz uchun matn kiritilmadi.' });
          return;
        }
        const accent = body.accent === 'en-GB' ? 'en-GB' : 'en-US';

        // Step 1: Ensure word pronunciation metadata is determined via Primary AI (DeepSeek) first if missing
        if (!body.testConfig && db.aiConfig && db.aiConfig.apiKey) {
          const wordMatch = (db.words || []).find(function (w) {
            return (body.wordId && w.id === body.wordId) ||
              String(w.word || '').trim().toLowerCase() === text.toLowerCase();
          });
          if (wordMatch && !AiTxt.hasCompletePronunciation(wordMatch)) {
            try {
              await resolvePrimaryPronunciationOnServer([wordMatch], session.role);
            } catch (_) {
              // Do not block audio playback if text AI transiently fails
            }
          }
        }

        // Only IT Manager can test unsaved ttsConfig overrides
        let rawCfg = db.aiConfig || {};
        let useDiskCache = true;
        if (body.testConfig && typeof body.testConfig === 'object' && Auth.canManageAiConfig(session.role)) {
          useDiskCache = false;
          const tc = body.testConfig;
          const rawTestKey = String(tc.ttsApiKey || '').trim();
          const rawPrimaryTestKey = String(tc.apiKey || '').trim();
          rawCfg = {
            provider: String(tc.provider || rawCfg.provider || 'deepseek'),
            model: String(tc.model || rawCfg.model || 'deepseek-chat'),
            apiKey: (rawPrimaryTestKey && rawPrimaryTestKey.indexOf('••') === -1) ? rawPrimaryTestKey : (rawCfg.apiKey || ''),
            customUrl: String(tc.customUrl || rawCfg.customUrl || ''),
            ttsProvider: String(tc.ttsProvider || 'auto'),
            ttsModel: String(tc.ttsModel || '').trim(),
            ttsCustomUrl: String(tc.ttsCustomUrl || '').trim(),
            ttsApiKey: (rawTestKey && rawTestKey.indexOf('••') === -1) ? rawTestKey : (tc.clearTtsKey ? '' : (rawCfg.ttsApiKey || '')),
            ttsVoiceUs: String(tc.ttsVoiceUs || '').trim(),
            ttsVoiceUk: String(tc.ttsVoiceUk || '').trim()
          };
        }

        const effectiveTts = Speech.resolveEffectiveTtsConfig(rawCfg, accent);
        if (effectiveTts.provider === 'browser' || !effectiveTts.apiKey) {
          sendJson(res, 200, { ok: true, mode: 'browser-fallback' });
          return;
        }

        if (effectiveTts.provider === 'custom' && !effectiveTts.customUrl) {
          sendJson(res, 400, { ok: false, error: 'Custom TTS uchun HTTPS Endpoint URL kiriting.' });
          return;
        }
        if (effectiveTts.customUrl) {
          try {
            AiTxt.validateAiEndpoint(effectiveTts.customUrl);
          } catch (ttsUrlErr) {
            sendJson(res, 400, { ok: false, error: ttsUrlErr.message });
            return;
          }
        }

        const cacheHash = crypto.createHash('sha256')
          .update([effectiveTts.provider, effectiveTts.model, effectiveTts.voice, accent, text.toLowerCase()].join('|'))
          .digest('hex');

        if (useDiskCache) {
          const cachedAudio = readTtsDiskCache(cacheHash);
          if (cachedAudio && cachedAudio.buffer) {
            res.writeHead(200, Object.assign({
              'Content-Type': cachedAudio.mime,
              'Cache-Control': 'private, max-age=86400',
              'X-TTS-Source': 'cache',
              'X-TTS-Provider': effectiveTts.provider
            }, getCorsHeaders(), getSecurityHeaders(false, isTrustworthyRequest(req))));
            res.end(cachedAudio.buffer);
            return;
          }
        }

        try {
          let pending = ttsInFlight.get(cacheHash);
          if (!pending) {
            pending = synthesizeViaProvider(text, accent, effectiveTts).then(function (result) {
              if (useDiskCache && result && result.buffer) {
                writeTtsDiskCache(cacheHash, result.mime, result.buffer);
              }
              return result;
            }).finally(function () {
              ttsInFlight.delete(cacheHash);
            });
            ttsInFlight.set(cacheHash, pending);
          }

          const synth = await pending;
          res.writeHead(200, Object.assign({
            'Content-Type': synth.mime,
            'Cache-Control': 'private, max-age=86400',
            'X-TTS-Source': 'api',
            'X-TTS-Provider': effectiveTts.provider
          }, getCorsHeaders(), getSecurityHeaders(false, isTrustworthyRequest(req))));
          res.end(synth.buffer);
          return;
        } catch (ttsErr) {
          sendJson(res, 502, { ok: false, error: (ttsErr && ttsErr.message) || 'Talaffuz audio olishda xatolik.' });
          return;
        }
      }

      if (pathname === '/api/ai-proxy' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Faqat Teacher yoki IT Manager ruxsatiga ega.' });
          return;
        }
        if (!fetcher) {
          sendJson(res, 500, { ok: false, error: 'Serverda fetch API mavjud emas.' });
          return;
        }
        const body = await readJsonBody(req, 4 * 1024 * 1024);
        const rawEndpointInput = String(body.endpoint || '').trim() ||
          ((db.aiConfig && db.aiConfig.provider === 'custom' && db.aiConfig.customUrl) ? String(db.aiConfig.customUrl).trim() : '');
        let safeEndpoint;
        try {
          safeEndpoint = AiTxt.validateAiEndpoint(rawEndpointInput);
        } catch (urlErr) {
          sendJson(res, 400, { ok: false, error: urlErr.message });
          return;
        }

        const submittedKey = Auth.canManageAiConfig(session.role) ? String(body.apiKey || '').trim() : '';
        const apiKey = (submittedKey && submittedKey.indexOf('••') === -1 ? submittedKey : '') ||
          String((db.aiConfig && db.aiConfig.apiKey) || '').trim();

        if (!apiKey) {
          sendJson(res, 400, { ok: false, error: 'API Key kiritilmagan.' });
          return;
        }

        const provider = String(body.provider || (db.aiConfig && db.aiConfig.provider) || 'deepseek');
        const isGemini = provider === 'gemini' || safeEndpoint.indexOf('generativelanguage.googleapis.com') !== -1;
        const headers = { 'Content-Type': 'application/json' };
        if (isGemini) {
          headers['x-goog-api-key'] = apiKey;
        } else {
          headers['Authorization'] = 'Bearer ' + apiKey;
        }

        const nowMs = Date.now();
        const proxyCacheKey = crypto.createHash('sha256')
          .update(provider + '|' + safeEndpoint + '|' + JSON.stringify(body.payload || {}))
          .digest('hex');

        const cachedEntry = aiProxyCache.get(proxyCacheKey);
        if (cachedEntry && (nowMs - cachedEntry.ts) <= AI_PROXY_CACHE_TTL_MS && cachedEntry.content) {
          sendJson(res, 200, { ok: true, content: cachedEntry.content, cached: true });
          return;
        }
        if (cachedEntry) aiProxyCache.delete(proxyCacheKey);

        let pendingPromise = aiInFlight.get(proxyCacheKey);
        if (!pendingPromise) {
          pendingPromise = (async function () {
            const aiRes = await fetcher(safeEndpoint, {
              method: 'POST',
              headers: headers,
              redirect: 'error',
              body: JSON.stringify(body.payload || {})
            });
            const aiData = await aiRes.json().catch(function () { return {}; });
            if (!aiRes.ok) {
              const msg = (aiData && aiData.error && aiData.error.message) || ('HTTP ' + aiRes.status);
              return { ok: false, status: aiRes.status, error: 'AI API xatosi: ' + msg };
            }
            let content = '';
            if (isGemini) {
              content = (aiData &&
                aiData.candidates &&
                aiData.candidates[0] &&
                aiData.candidates[0].content &&
                aiData.candidates[0].content.parts &&
                aiData.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('')) || '';
            } else {
              content = (aiData && aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content) || '';
            }
            if (content) {
              if (aiProxyCache.size >= AI_PROXY_CACHE_MAX) {
                const oldestKey = aiProxyCache.keys().next().value;
                if (oldestKey) aiProxyCache.delete(oldestKey);
              }
              aiProxyCache.set(proxyCacheKey, { content: content, ts: Date.now() });
            }
            return { ok: true, content: content };
          })().finally(function () {
            aiInFlight.delete(proxyCacheKey);
          });
          aiInFlight.set(proxyCacheKey, pendingPromise);
        }

        const proxyOut = await pendingPromise;
        if (!proxyOut.ok) {
          sendJson(res, proxyOut.status || 502, { ok: false, error: proxyOut.error });
          return;
        }
        sendJson(res, 200, { ok: true, content: proxyOut.content, cached: false });
        return;
      }

      if (pathname === '/api/security' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.canManageSecurity(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Faqat IT Manager ushbu bo‘limni boshqara oladi!' });
          return;
        }
        const body = await readJsonBody(req);
        const now = Date.now();

        if (body.action === 'changeRolePassword') {
          db.auth = Auth.changeRolePassword(db.auth, session.role, body.targetRole, body.newPassword);
          clearServerRateLimitForAccount(body.targetRole);
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'PASSWORD_CHANGE',
            Auth.ROLE_META[body.targetRole].label + ' paroli yangilandi',
            now
          );
        } else if (body.action === 'clearRateLimits') {
          rateLimitMap.clear();
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'RATE_LIMIT_CLEAR',
            'Brute-force bloklovlari IT Manager tomonidan tozalandi',
            now
          );
        } else if (body.action === 'resetDatabase') {
          const preservedAuth = db.auth;
          const preservedStudents = db.students;
          const fresh = Storage.createDefaultState(now);
          db = Object.assign(fresh, {
            auth: preservedAuth,
            students: preservedStudents
          });
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, 'DB_RESET', 'Lug‘at va statistika standart holatga qaytarildi', now);
        } else {
          sendJson(res, 400, { ok: false, error: 'Noma’lum xavfsizlik amali.' });
          return;
        }

        saveDb();
        broadcastSse('security');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      serveStaticFile(pathname, req, res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: (err && err.message) || 'Server ichki xatosi' });
    }
  });

  server.getDbSnapshot = function () { return db; };
  server.setPublicUrl = function (nextUrl, status) {
    const cleaned = String(nextUrl || '').trim().replace(/\/+$/, '');
    const changed = cleaned !== publicUrl || (status && status !== tunnelStatus);
    publicUrl = cleaned;
    if (status) tunnelStatus = status;
    else tunnelStatus = cleaned ? 'ready' : 'idle';
    if (changed) broadcastSse('tunnel');
  };
  server.getPublicUrl = function () { return publicUrl; };
  server.closeAllSse = function () {
    sseClients.forEach(function (clientRes) {
      try { clientRes.end(); } catch (e) { /* Ignore */ }
    });
    sseClients.clear();
  };

  return server;
}

function shouldAutoStartTunnel() {
  if (process.env.NO_TUNNEL === '1' || process.env.NO_TUNNEL === 'true') return false;
  if (process.env.PUBLIC_URL) return false;
  if (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.KOYEB_SERVICE_NAME || process.env.DYNO) {
    return false;
  }
  return true;
}

function startPublicSshTunnel(port, serverInstance) {
  let child = null;
  let stopped = false;
  let retryTimer = null;

  function launch() {
    if (stopped) return;
    serverInstance.setPublicUrl('', 'connecting');
    let streamTail = '';
    const args = [
      '-T',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-R', '80:127.0.0.1:' + port,
      'nokey@localhost.run'
    ];
    try {
      // Keep stdin as an open pipe so localhost.run does not close the session on immediate EOF
      child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      serverInstance.setPublicUrl('', 'unavailable');
      return;
    }

    function inspectChunk(chunk) {
      const clean = String(chunk || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const combined = streamTail + clean;
      streamTail = combined.slice(-512);
      const matches = combined.match(/https:\/\/[a-z0-9-]+\.(?:[a-z0-9-]+\.)?lhr\.life\b/gi);
      if (matches && matches.length > 0) {
        const detected = matches[matches.length - 1].trim();
        if (detected !== serverInstance.getPublicUrl()) {
          serverInstance.setPublicUrl(detected, 'ready');
          console.log('\n====================================================================');
          console.log('  GLOBAL TELEFON HAVOLASI (4G / 5G / Wi-Fi — Hamma kira oladi!):');
          console.log('  ' + detected);
          console.log('====================================================================\n');
        }
      }
    }

    if (child.stdout) child.stdout.on('data', inspectChunk);
    if (child.stderr) child.stderr.on('data', inspectChunk);

    child.on('error', function () {
      serverInstance.setPublicUrl('', 'unavailable');
    });

    child.on('close', function () {
      child = null;
      if (stopped) return;
      serverInstance.setPublicUrl('', 'reconnecting');
      retryTimer = setTimeout(launch, 4000);
    });
  }

  launch();

  return function stopTunnel() {
    stopped = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (child) {
      try { child.kill(); } catch (_) {}
      child = null;
    }
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4175;
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer({ rootDir: __dirname });
  let stopTunnelFn = null;

  server.listen(port, host, function () {
    console.log('SWE ENGLISH EXTRA v5 Real-Time Server running:');
    console.log('  Local:   http://127.0.0.1:' + port);
    if (host === '0.0.0.0' || host === '::') {
      const urls = listReachableLanUrls(port);
      urls.forEach(function (item) {
        if (!item.isVirtual) {
          console.log('  Wi-Fi (' + item.name + '): ' + item.url);
        }
      });
    }
    if (process.env.PUBLIC_URL) {
      console.log('  Cloud Public URL: ' + process.env.PUBLIC_URL);
    } else if (shouldAutoStartTunnel()) {
      console.log('  4G/5G Global HTTPS tunnel ulanmoqda...');
      stopTunnelFn = startPublicSshTunnel(port, server);
    }
    console.log('Data file: ' + (process.env.DATA_DIR ? path.join(path.resolve(process.env.DATA_DIR), 'db.json') : path.join(__dirname, 'data', 'db.json')));
  });

  function shutdownCleanly() {
    if (stopTunnelFn) stopTunnelFn();
    server.closeAllSse();
    server.close(function () {
      process.exit(0);
    });
    setTimeout(function () { process.exit(0); }, 1000).unref();
  }

  process.on('SIGINT', shutdownCleanly);
  process.on('SIGTERM', shutdownCleanly);
  process.on('exit', function () {
    if (stopTunnelFn) stopTunnelFn();
  });
}

module.exports = {
  createAppServer: createAppServer,
  MIME_TYPES: MIME_TYPES,
  signSessionToken: signSessionToken,
  verifySessionToken: verifySessionToken,
  getSecurityHeaders: getSecurityHeaders,
  maskApiKey: maskApiKey
};
