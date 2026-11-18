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

const Data = require('./js/default-data.js');
const SRS = require('./js/srs.js');
const Auth = require('./js/auth.js');
const Storage = require('./js/storage.js');
const AiTxt = require('./js/ai-txt.js');
const Exam = require('./js/exam.js');

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
  "connect-src 'self' https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');

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
      students: [],
      studentProgress: ownProgress,
      studentActivityLog: [],
      stats: Storage.createEmptyStats(Date.now()),
      settings: db.settings,
      aiConfig: {
        provider: (db.aiConfig && db.aiConfig.provider) || 'deepseek',
        model: (db.aiConfig && db.aiConfig.model) || 'deepseek-chat',
        apiKey: '',
        customUrl: '',
        hasApiKey: false,
        apiKeyMasked: ''
      },
      auth: { hashes: {}, updatedAt: null },
      auditLog: []
    };
  }

  // Teacher receives AI readiness status without API key/endpoint settings; IT Manager receives masked metadata
  const safeStudents = (db.students || []).map(Auth.sanitizeStudentForClient);
  const rawAi = db.aiConfig || {};
  const canSeeAiSettings = Auth.canManageAiConfig(session.role);
  return {
    version: 3,
    words: db.words,
    categories: db.categories,
    lessons: db.lessons,
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
      apiKeyMasked: canSeeAiSettings ? maskApiKey(rawAi.apiKey) : ''
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
  const dataFilePath = path.resolve(opts.dataFilePath || path.join(rootDir, 'data', 'db.json'));
  const secretFilePath = path.resolve(opts.secretFilePath || path.join(path.dirname(dataFilePath), '.session-secret'));
  const tokenTtlMs = typeof opts.tokenTtlMs === 'number' && opts.tokenTtlMs > 0 ? opts.tokenTtlMs : DEFAULT_TOKEN_TTL_MS;
  const maxAttempts = typeof opts.maxLoginAttempts === 'number' && opts.maxLoginAttempts > 0 ? opts.maxLoginAttempts : SERVER_MAX_LOGIN_ATTEMPTS;
  const lockoutMs = typeof opts.lockoutMs === 'number' && opts.lockoutMs > 0 ? opts.lockoutMs : SERVER_LOCKOUT_MS;
  const fetcher = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);

  const sessionSecret = readOrCreateSecret(secretFilePath);
  const sseClients = new Set();
  const revokedTokens = new Map();
  const rateLimitMap = new Map();
  const aiProxyCache = new Map();
  const aiInFlight = new Map();
  const AI_PROXY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const AI_PROXY_CACHE_MAX = 150;

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

  function getClientIp(req) {
    if ((opts.trustProxy || process.env.TRUST_PROXY === '1') && req && req.headers && req.headers['x-forwarded-for']) {
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
        sendJson(res, 200, { ok: true, mode: 'server', version: 4, timestamp: Date.now() });
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
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive'
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

        const rawSubmittedKey = String(cfg.apiKey || '').trim();
        const isMaskedSubmit = rawSubmittedKey.indexOf('••') !== -1;
        let nextApiKey = (db.aiConfig && db.aiConfig.apiKey) || '';
        if (cfg.clearKey === true) {
          nextApiKey = '';
        } else if (rawSubmittedKey && !isMaskedSubmit) {
          nextApiKey = rawSubmittedKey;
        }

        db.aiConfig = {
          provider: String(cfg.provider || 'deepseek'),
          model: String(cfg.model || 'deepseek-chat'),
          customUrl: customUrl,
          apiKey: nextApiKey
        };
        db.auditLog = Auth.appendAuditLog(
          db.auditLog,
          session.role,
          'AI_CONFIG',
          db.aiConfig.provider + ' (' + db.aiConfig.model + ') sozlandi' + (nextApiKey ? ' [API Key himoyalangan]' : ' [API Key tozalangan]'),
          Date.now()
        );
        saveDb();
        broadcastSse('ai-config');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
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
  server.closeAllSse = function () {
    sseClients.forEach(function (clientRes) {
      try { clientRes.end(); } catch (e) { /* Ignore */ }
    });
    sseClients.clear();
  };

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4175;
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer({ rootDir: __dirname });
  server.listen(port, host, function () {
    console.log('SWE ENGLISH EXTRA Real-Time Server running (all IPs enabled):');
    console.log('  Local:   http://127.0.0.1:' + port);
    if (host === '0.0.0.0' || host === '::') {
      const nets = os.networkInterfaces();
      Object.keys(nets).forEach(function (ifName) {
        (nets[ifName] || []).forEach(function (info) {
          if (info && info.family === 'IPv4' && !info.internal) {
            console.log('  Network: http://' + info.address + ':' + port);
          }
        });
      });
    } else {
      console.log('  Bound:   http://' + host + ':' + port);
    }
    console.log('Data file: ' + path.join(__dirname, 'data', 'db.json'));
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
