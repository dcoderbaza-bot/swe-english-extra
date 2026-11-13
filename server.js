/**
 * SWE ENGLISH EXTRA — Zero-Dependency Node.js Real-Time Classroom Server
 * Serves static SPA assets, persists state in data/db.json, authenticates roles/students,
 * streams live student activity via Server-Sent Events (/api/stream), and supports AI proxy fallback.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Data = require('./js/default-data.js');
const SRS = require('./js/srs.js');
const Auth = require('./js/auth.js');
const Storage = require('./js/storage.js');

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

function signSessionToken(sessionObj, secret) {
  const payload = Buffer.from(JSON.stringify(sessionObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySessionToken(token, secret) {
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
      aiConfig: { provider: (db.aiConfig && db.aiConfig.provider) || 'deepseek', model: (db.aiConfig && db.aiConfig.model) || 'deepseek-chat', apiKey: '', customUrl: '' },
      auth: { hashes: {}, updatedAt: null },
      auditLog: []
    };
  }

  // Teacher & IT Manager receive sanitized student records (no password hashes), full progress, and live logs
  const safeStudents = (db.students || []).map(Auth.sanitizeStudentForClient);
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
    aiConfig: db.aiConfig,
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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function createAppServer(options) {
  const opts = options || {};
  const rootDir = path.resolve(opts.rootDir || __dirname);
  const dataFilePath = path.resolve(opts.dataFilePath || path.join(rootDir, 'data', 'db.json'));
  const secretFilePath = path.resolve(opts.secretFilePath || path.join(path.dirname(dataFilePath), '.session-secret'));

  const sessionSecret = readOrCreateSecret(secretFilePath);
  const sseClients = new Set();

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
    return verifySessionToken(token, sessionSecret);
  }

  function serveStaticFile(reqPath, res) {
    const cleanRel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const resolved = path.resolve(rootDir, cleanRel);

    // Block path traversal outside rootDir and block sensitive runtime data/server source
    if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    const relFromRoot = path.relative(rootDir, resolved).replace(/\\/g, '/');
    if (relFromRoot === 'server.js' || relFromRoot === '.gitignore' || relFromRoot === 'data' || relFromRoot.startsWith('data/') || relFromRoot.startsWith('.git')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(resolved, function (err, stat) {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(resolved).pipe(res);
    });
  }

  const server = http.createServer(async function (req, res) {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    try {
      if (pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, mode: 'server', version: 3, timestamp: Date.now() });
        return;
      }

      if (pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
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
        const authRes = Auth.authenticate({
          authState: db.auth,
          students: db.students,
          role: body.role || 'student',
          username: body.username || '',
          password: body.password || ''
        });

        if (!authRes.ok) {
          sendJson(res, 401, { ok: false, error: authRes.error });
          return;
        }

        const now = Date.now();
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

        const token = signSessionToken(session, sessionSecret);
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
        const body = await readJsonBody(req);
        if (session.role === 'student') {
          db = Storage.recordStudentEvent(db, session, body, Date.now());
          saveDb();
          broadcastSse(body.type === 'HEARTBEAT' ? 'heartbeat' : 'telemetry');
        }
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
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
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, 'STUDENT_PW_RESET', 'O‘quvchi paroli yangilandi: ' + body.studentId, now);
        } else if (body.action === 'toggleActive') {
          db.students = Auth.toggleStudentActive(db.students, session.role, body.studentId);
          db.auditLog = Auth.appendAuditLog(db.auditLog, session.role, 'STUDENT_STATUS', 'O‘quvchi holati o‘zgartirildi: ' + body.studentId, now);
        } else {
          sendJson(res, 400, { ok: false, error: 'Noma’lum student amali.' });
          return;
        }

        saveDb();
        broadcastSse('students');
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/ai-config' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Faqat Teacher yoki IT Manager ruxsatiga ega.' });
          return;
        }
        const body = await readJsonBody(req);
        const cfg = body.aiConfig || {};
        db.aiConfig = {
          provider: String(cfg.provider || 'deepseek'),
          model: String(cfg.model || 'deepseek-chat'),
          customUrl: String(cfg.customUrl || ''),
          apiKey: String(cfg.apiKey || '')
        };
        db.auditLog = Auth.appendAuditLog(
          db.auditLog,
          session.role,
          'AI_CONFIG',
          db.aiConfig.provider + ' (' + db.aiConfig.model + ') saqlandi',
          Date.now()
        );
        saveDb();
        sendJson(res, 200, { ok: true, state: sanitizeDbForSession(db, session) });
        return;
      }

      if (pathname === '/api/ai-proxy' && req.method === 'POST') {
        const session = getSessionFromRequest(req, parsedUrl);
        if (!session || !Auth.isAdminRole(session.role)) {
          sendJson(res, 403, { ok: false, error: 'Faqat Teacher yoki IT Manager ruxsatiga ega.' });
          return;
        }
        const body = await readJsonBody(req, 4 * 1024 * 1024);
        const endpoint = String(body.endpoint || '').trim();
        const apiKey = String(body.apiKey || (db.aiConfig && db.aiConfig.apiKey) || '').trim();
        if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
          sendJson(res, 400, { ok: false, error: 'Noto‘g‘ri AI endpoint URL.' });
          return;
        }
        if (!apiKey) {
          sendJson(res, 400, { ok: false, error: 'API Key kiritilmagan.' });
          return;
        }

        const aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify(body.payload || {})
        });
        const aiData = await aiRes.json().catch(function () { return {}; });
        if (!aiRes.ok) {
          const msg = (aiData && aiData.error && aiData.error.message) || ('HTTP ' + aiRes.status);
          sendJson(res, aiRes.status, { ok: false, error: 'AI API xatosi: ' + msg });
          return;
        }
        const content = aiData && aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content;
        sendJson(res, 200, { ok: true, content: content || '' });
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
          db.auditLog = Auth.appendAuditLog(
            db.auditLog,
            session.role,
            'PASSWORD_CHANGE',
            Auth.ROLE_META[body.targetRole].label + ' paroli yangilandi',
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

      serveStaticFile(pathname, res);
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
  const host = process.env.HOST || '127.0.0.1';
  const server = createAppServer({ rootDir: __dirname });
  server.listen(port, host, function () {
    console.log('SWE ENGLISH EXTRA Real-Time Server running at http://' + host + ':' + port);
    console.log('Data file: ' + path.join(__dirname, 'data', 'db.json'));
  });
}

module.exports = {
  createAppServer: createAppServer,
  MIME_TYPES: MIME_TYPES
};
