/**
 * SWE ENGLISH EXTRA — Role & Multi-User Authentication (IT Manager, Teacher & Students)
 * Uses pure-JS salted SHA-256 so it works uniformly in file://, browser, and Node.js.
 */
(function (root) {
  'use strict';

  const SESSION_KEY = 'swe_english_extra_session_v2';
  const LEGACY_SESSION_KEY = 'swe_english_extra_session_v1';
  const SALT_PREFIX = 'SWE_ENG_EXTRA_V2_SALT:';

  // Only salted SHA-256 hashes are stored here (never plaintext passwords)
  const DEFAULT_AUTH_HASHES = {
    it_manager: '39f0d2187ebe9119f2c25eebc3b2430989469997cf3eb21da947abd410807420',
    teacher: '79511e5ff7a60b187f9440f6313fd960be4b6e76e424f014cc66ab633bfbfd15'
  };

  const DEFAULT_STUDENTS = [
    {
      id: 'stu-student1',
      username: 'student1',
      fullName: 'O‘quvchi 1 (Namuna)',
      group: 'Group A',
      active: true,
      passwordHash: 'a9fc1f569bbc378e84eb1dffc0d329f01f9ecf6cd1b406885ffe7100b1475f50',
      createdAt: null
    },
    {
      id: 'stu-ali',
      username: 'ali',
      fullName: 'Ali Valiyev',
      group: 'IELTS B2',
      active: true,
      passwordHash: 'bd8171c800b8548e855f39741af92c95df6a1bb662cac5f505fd6f745395dc49',
      createdAt: null
    },
    {
      id: 'stu-madina',
      username: 'madina',
      fullName: 'Madina Karimova',
      group: 'IELTS C1',
      active: true,
      passwordHash: 'ffe4c14f158cf9ff314f219fcb26ed32e41a2846731b3636aa2ad51727385084',
      createdAt: null
    }
  ];

  const ROLE_META = {
    student: {
      key: 'student',
      label: 'O‘quvchi',
      badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25'
    },
    teacher: {
      key: 'teacher',
      label: 'Teacher',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
    },
    it_manager: {
      key: 'it_manager',
      label: 'IT Manager',
      badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
    }
  };

  function utf8ToBytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(String(str)));
    }
    const encoded = unescape(encodeURIComponent(String(str)));
    const bytes = [];
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded.charCodeAt(i));
    }
    return bytes;
  }

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256Hex(message) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const bytes = utf8ToBytes(message);
    const bitLen = bytes.length * 8;

    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
      bytes.push(0);
    }

    const highBits = Math.floor(bitLen / 0x100000000);
    const lowBits = bitLen >>> 0;
    bytes.push((highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff);
    bytes.push((lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff);

    const w = new Array(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const j = offset + i * 4;
        w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let a = H[0], b = H[1], c = H[2], d = H[3];
      let e = H[4], f = H[5], g = H[6], h = H[7];

      for (let i = 0; i < 64; i++) {
        const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }

    return H.map(function (v) {
      return ('00000000' + v.toString(16)).slice(-8);
    }).join('');
  }

  function normalizeUsername(username) {
    return String(username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
  }

  const STRETCH_ROUNDS = 4000;
  const RATE_LIMIT_KEY = 'swe_auth_rate_limit_v1';
  const MAX_LOGIN_ATTEMPTS = 5;
  const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
  const LOCKOUT_MS = 3 * 60 * 1000;

  function constantTimeEqual(a, b) {
    const strA = String(a || '');
    const strB = String(b || '');
    if (strA.length !== strB.length || strA.length === 0) return false;
    let diff = 0;
    for (let i = 0; i < strA.length; i++) {
      diff |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
    }
    return diff === 0;
  }

  function generateSaltHex(byteLen) {
    const len = byteLen || 12;
    const bytes = new Uint8Array(len);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        const buf = nodeCrypto.randomBytes(len);
        for (let i = 0; i < len; i++) bytes[i] = buf[i];
      } catch (e) {
        for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
    } else {
      for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function stretchSha256(scopeTag, secret, saltHex, rounds) {
    const total = Math.max(100, Math.min(20000, Number(rounds) || STRETCH_ROUNDS));
    let acc = sha256Hex(SALT_PREFIX + scopeTag + ':' + saltHex + ':' + String(secret));
    for (let i = 0; i < total; i++) {
      acc = sha256Hex(acc + ':' + saltHex + ':' + String(i));
    }
    return acc;
  }

  function hashRolePassword(role, password) {
    const salt = generateSaltHex(12);
    const scope = 'role:' + String(role);
    const digest = stretchSha256(scope, password, salt, STRETCH_ROUNDS);
    return 'swe3:' + STRETCH_ROUNDS + ':' + salt + ':' + digest;
  }

  function hashStudentPassword(username, password) {
    const cleanUser = normalizeUsername(username);
    const salt = generateSaltHex(12);
    const scope = 'student:' + cleanUser;
    const digest = stretchSha256(scope, password, salt, STRETCH_ROUNDS);
    return 'swe3:' + STRETCH_ROUNDS + ':' + salt + ':' + digest;
  }

  function verifyPasswordHash(scopeTag, secret, storedHash) {
    const stored = String(storedHash || '');
    if (!stored || typeof secret !== 'string') return false;

    if (stored.indexOf('swe3:') === 0) {
      const parts = stored.split(':');
      if (parts.length !== 4) return false;
      const rounds = Number(parts[1]);
      const salt = parts[2];
      const expected = parts[3];
      if (!salt || !expected || !Number.isFinite(rounds) || rounds < 100 || rounds > 20000) {
        return false;
      }
      const computed = stretchSha256(scopeTag, secret, salt, rounds);
      return constantTimeEqual(computed, expected);
    }

    // Legacy v2 unsalted-per-user salted SHA-256 compatibility for starter accounts
    const legacyTag = scopeTag.indexOf('role:') === 0 ? scopeTag.slice(5) : scopeTag;
    const legacyDigest = sha256Hex(SALT_PREFIX + legacyTag + ':' + secret);
    return constantTimeEqual(legacyDigest, stored);
  }

  function validatePasswordStrength(password) {
    const pw = String(password || '');
    const trimmed = pw.trim();
    if (!trimmed || trimmed.length < 8) {
      return {
        ok: false,
        score: 1,
        label: 'Juda zaif',
        error: 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak.'
      };
    }
    if (/^\s|\s$/.test(pw)) {
      return {
        ok: false,
        score: 1,
        label: 'Noto‘g‘ri',
        error: 'Parol boshida yoki oxirida bo‘sh joy bo‘lmasligi kerak.'
      };
    }
    const hasLetter = /[A-Za-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasDigit = /\d/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);
    const classes = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

    if (!hasLetter || (!hasDigit && !hasSymbol)) {
      return {
        ok: false,
        score: 2,
        label: 'Kuchsiz',
        error: 'Parolda harflar bilan birga kamida bitta raqam yoki belgi bo‘lishi shart.'
      };
    }

    const isStrong = pw.length >= 12 && classes >= 3;
    return {
      ok: true,
      score: isStrong ? 4 : 3,
      label: isStrong ? 'Kuchli' : 'Qoniqarli',
      error: ''
    };
  }

  function readRateLimitMap(store) {
    const backend = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!backend) return {};
    try {
      const raw = backend.getItem(RATE_LIMIT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeRateLimitMap(map, store) {
    const backend = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!backend) return;
    try {
      backend.setItem(RATE_LIMIT_KEY, JSON.stringify(map));
    } catch (e) {
      // Ignore storage error
    }
  }

  function checkLoginRateLimit(bucketKey, now, store) {
    const ts = typeof now === 'number' ? now : Date.now();
    const key = String(bucketKey || 'default');
    const map = readRateLimitMap(store);
    const rec = map[key];
    if (!rec) return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, retryAfterSec: 0 };

    if (rec.lockedUntil && ts < rec.lockedUntil) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSec: Math.max(1, Math.ceil((rec.lockedUntil - ts) / 1000))
      };
    }
    if (rec.firstAttemptAt && (ts - rec.firstAttemptAt) > ATTEMPT_WINDOW_MS) {
      return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, retryAfterSec: 0 };
    }
    const count = Number(rec.count || 0);
    return {
      allowed: true,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - count),
      retryAfterSec: 0
    };
  }

  function recordLoginFailure(bucketKey, now, store) {
    const ts = typeof now === 'number' ? now : Date.now();
    const key = String(bucketKey || 'default');
    const map = readRateLimitMap(store);
    const prev = map[key];
    let count = 1;
    let firstAttemptAt = ts;

    if (prev && prev.firstAttemptAt && (ts - prev.firstAttemptAt) <= ATTEMPT_WINDOW_MS) {
      count = Number(prev.count || 0) + 1;
      firstAttemptAt = prev.firstAttemptAt;
    }

    const lockedUntil = count >= MAX_LOGIN_ATTEMPTS ? (ts + LOCKOUT_MS) : 0;
    map[key] = { count: count, firstAttemptAt: firstAttemptAt, lockedUntil: lockedUntil };
    writeRateLimitMap(map, store);

    return {
      allowed: !lockedUntil,
      count: count,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - count),
      retryAfterSec: lockedUntil ? Math.ceil(LOCKOUT_MS / 1000) : 0
    };
  }

  function clearLoginFailures(bucketKey, store) {
    const key = String(bucketKey || 'default');
    const map = readRateLimitMap(store);
    if (map[key]) {
      delete map[key];
      writeRateLimitMap(map, store);
    }
  }

  function createDefaultAuthState() {
    return {
      hashes: Object.assign({}, DEFAULT_AUTH_HASHES),
      updatedAt: null
    };
  }

  function createDefaultStudents(now) {
    const ts = typeof now === 'number' ? now : Date.now();
    return DEFAULT_STUDENTS.map(function (s) {
      return Object.assign({}, s, { createdAt: s.createdAt || ts });
    });
  }

  function sanitizeStudentForClient(student) {
    return {
      id: student.id,
      username: student.username,
      fullName: student.fullName,
      group: student.group || 'General',
      active: student.active !== false,
      createdAt: student.createdAt || null
    };
  }

  function isStretchedHash(hashStr) {
    return typeof hashStr === 'string' && hashStr.indexOf('swe3:') === 0;
  }

  function verifyRolePassword(authState, role, password) {
    if (role !== 'it_manager' && role !== 'teacher') return false;
    if (!password || typeof password !== 'string') return false;
    const hashes = (authState && authState.hashes) ? authState.hashes : DEFAULT_AUTH_HASHES;
    const expected = hashes[role] || DEFAULT_AUTH_HASHES[role];
    return verifyPasswordHash('role:' + role, password, expected);
  }

  function authenticate(params) {
    const opts = params || {};
    const role = opts.role || 'student';
    const password = String(opts.password || '');
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const rlStore = opts.rateLimitStore || null;
    const rlBucket = role === 'student'
      ? ('student:' + normalizeUsername(opts.username))
      : ('staff:' + role);

    if (rlStore || opts.enforceRateLimit) {
      const rl = checkLoginRateLimit(rlBucket, now, rlStore);
      if (!rl.allowed) {
        return {
          ok: false,
          rateLimited: true,
          retryAfterSec: rl.retryAfterSec,
          error: 'Juda ko‘p xato urinish! ' + rl.retryAfterSec + ' soniyadan keyin qayta urinib ko‘ring.'
        };
      }
    }

    if (role === 'it_manager' || role === 'teacher') {
      if (!verifyRolePassword(opts.authState, role, password)) {
        if (rlStore || opts.enforceRateLimit) recordLoginFailure(rlBucket, now, rlStore);
        return { ok: false, error: 'Admin paroli noto‘g‘ri!' };
      }
      if (rlStore || opts.enforceRateLimit) clearLoginFailures(rlBucket, rlStore);
      return {
        ok: true,
        session: {
          role: role,
          userId: role,
          username: role,
          fullName: ROLE_META[role].label,
          group: 'Staff',
          loginAt: now
        }
      };
    }

    if (role === 'student') {
      const cleanUser = normalizeUsername(opts.username);
      if (!cleanUser) {
        return { ok: false, error: 'O‘quvchi loginini kiriting (masalan: student1, ali, madina).' };
      }
      if (!password) {
        return { ok: false, error: 'Parolni kiriting.' };
      }
      const list = Array.isArray(opts.students) ? opts.students : [];
      const found = list.find(function (s) {
        return normalizeUsername(s.username) === cleanUser;
      });
      if (!found) {
        if (rlStore || opts.enforceRateLimit) recordLoginFailure(rlBucket, now, rlStore);
        return { ok: false, error: 'O‘quvchi login yoki paroli noto‘g‘ri!' };
      }
      if (found.active === false) {
        return { ok: false, error: 'Ushbu o‘quvchi akkaunti vaqtincha bloklangan.' };
      }
      if (!verifyPasswordHash('student:' + normalizeUsername(found.username), password, found.passwordHash)) {
        if (rlStore || opts.enforceRateLimit) recordLoginFailure(rlBucket, now, rlStore);
        return { ok: false, error: 'O‘quvchi login yoki paroli noto‘g‘ri!' };
      }

      if (rlStore || opts.enforceRateLimit) clearLoginFailures(rlBucket, rlStore);
      return {
        ok: true,
        session: {
          role: 'student',
          userId: found.id,
          username: found.username,
          fullName: found.fullName,
          group: found.group || 'General',
          loginAt: now
        }
      };
    }

    return { ok: false, error: 'Noto‘g‘ri rol tanlandi.' };
  }

  function changeRolePassword(authState, actorRole, targetRole, newPassword) {
    if (targetRole !== 'it_manager' && targetRole !== 'teacher') {
      throw new Error('Noto‘g‘ri rol tanlandi.');
    }
    if (actorRole !== 'it_manager' && actorRole !== targetRole) {
      throw new Error('Bu parolni o‘zgartirish uchun IT Manager huquqi kerak.');
    }
    const policy = validatePasswordStrength(newPassword);
    if (!policy.ok) {
      throw new Error(policy.error);
    }

    const nextHashes = Object.assign({}, DEFAULT_AUTH_HASHES, (authState && authState.hashes) || {});
    nextHashes[targetRole] = hashRolePassword(targetRole, String(newPassword).trim());

    return {
      hashes: nextHashes,
      updatedAt: Date.now()
    };
  }

  function createStudentAccount(students, actorRole, payload, now) {
    if (!canManageStudents(actorRole)) {
      throw new Error('O‘quvchi yaratish uchun Teacher yoki IT Manager huquqi kerak.');
    }
    const cleanUser = normalizeUsername(payload && payload.username);
    const fullName = String((payload && payload.fullName) || '').trim();
    const group = String((payload && payload.group) || 'General').trim() || 'General';
    const password = String((payload && payload.password) || '');

    if (cleanUser.length < 3) {
      throw new Error('Login kamida 3 ta lotin harf/raqamdan iborat bo‘lishi kerak.');
    }
    if (fullName.length < 2) {
      throw new Error('O‘quvchining ism-familiyasini kiriting.');
    }
    const policy = validatePasswordStrength(password);
    if (!policy.ok) {
      throw new Error(policy.error);
    }

    const list = Array.isArray(students) ? students.slice() : [];
    if (list.some(function (s) { return normalizeUsername(s.username) === cleanUser; })) {
      throw new Error('"' + cleanUser + '" logini allaqachon band!');
    }

    const ts = typeof now === 'number' ? now : Date.now();
    const created = {
      id: 'stu-' + cleanUser + '-' + Math.random().toString(36).slice(2, 5),
      username: cleanUser,
      fullName: fullName,
      group: group,
      active: true,
      passwordHash: hashStudentPassword(cleanUser, password.trim()),
      createdAt: ts
    };
    list.push(created);
    return { students: list, created: created };
  }

  function resetStudentPassword(students, actorRole, studentId, newPassword) {
    if (!canManageStudents(actorRole)) {
      throw new Error('Parolni yangilash uchun Teacher yoki IT Manager huquqi kerak.');
    }
    const policy = validatePasswordStrength(newPassword);
    if (!policy.ok) {
      throw new Error(policy.error);
    }
    const list = Array.isArray(students) ? students.slice() : [];
    let found = false;
    const updated = list.map(function (s) {
      if (s.id !== studentId && normalizeUsername(s.username) !== normalizeUsername(studentId)) return s;
      found = true;
      return Object.assign({}, s, {
        passwordHash: hashStudentPassword(s.username, String(newPassword).trim())
      });
    });
    if (!found) {
      throw new Error('O‘quvchi topilmadi.');
    }
    return updated;
  }

  function toggleStudentActive(students, actorRole, studentId) {
    if (!canManageStudents(actorRole)) {
      throw new Error('O‘quvchi holatini o‘zgartirish uchun admin huquqi kerak.');
    }
    return (students || []).map(function (s) {
      if (s.id !== studentId) return s;
      return Object.assign({}, s, { active: s.active === false });
    });
  }

  function isAdminRole(role) {
    return role === 'teacher' || role === 'it_manager';
  }

  function canManageSecurity(role) {
    return role === 'it_manager';
  }

  function canManageLessons(role) {
    return role === 'teacher' || role === 'it_manager';
  }

  function canBulkTxtAi(role) {
    return role === 'teacher' || role === 'it_manager';
  }

  function canMonitorStudents(role) {
    return role === 'teacher' || role === 'it_manager';
  }

  function canManageStudents(role) {
    return role === 'teacher' || role === 'it_manager';
  }

  function getSession(sessionBackend) {
    const store = sessionBackend || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!store) return null;
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.role && (isAdminRole(parsed.role) || (parsed.role === 'student' && parsed.userId))) {
          return parsed;
        }
      }
      const legacyRole = store.getItem(LEGACY_SESSION_KEY);
      if (isAdminRole(legacyRole)) {
        return {
          role: legacyRole,
          userId: legacyRole,
          username: legacyRole,
          fullName: ROLE_META[legacyRole].label,
          group: 'Staff',
          loginAt: Date.now()
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function setSession(sessionObj, sessionBackend) {
    const store = sessionBackend || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!store) return sessionObj || null;
    try {
      store.removeItem(LEGACY_SESSION_KEY);
      if (!sessionObj) {
        store.removeItem(SESSION_KEY);
        return null;
      }
      store.setItem(SESSION_KEY, JSON.stringify(sessionObj));
    } catch (e) {
      // Ignore storage restriction
    }
    return sessionObj;
  }

  function getSessionRole(sessionBackend) {
    const sess = getSession(sessionBackend);
    return sess ? sess.role : 'guest';
  }

  function setSessionRole(role, sessionBackend) {
    if (!isAdminRole(role)) {
      setSession(null, sessionBackend);
      return 'guest';
    }
    setSession({
      role: role,
      userId: role,
      username: role,
      fullName: ROLE_META[role].label,
      group: 'Staff',
      loginAt: Date.now()
    }, sessionBackend);
    return role;
  }

  function appendAuditLog(auditLog, actorRole, action, detail, now) {
    const list = Array.isArray(auditLog) ? auditLog.slice() : [];
    list.unshift({
      id: 'log-' + (now || Date.now()) + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: typeof now === 'number' ? now : Date.now(),
      actorRole: actorRole || 'student',
      action: String(action || ''),
      detail: String(detail || '')
    });
    return list.slice(0, 150);
  }

  const api = {
    SESSION_KEY: SESSION_KEY,
    DEFAULT_AUTH_HASHES: DEFAULT_AUTH_HASHES,
    DEFAULT_STUDENTS: DEFAULT_STUDENTS,
    ROLE_META: ROLE_META,
    STRETCH_ROUNDS: STRETCH_ROUNDS,
    MAX_LOGIN_ATTEMPTS: MAX_LOGIN_ATTEMPTS,
    LOCKOUT_MS: LOCKOUT_MS,
    sha256Hex: sha256Hex,
    constantTimeEqual: constantTimeEqual,
    normalizeUsername: normalizeUsername,
    hashRolePassword: hashRolePassword,
    hashStudentPassword: hashStudentPassword,
    verifyPasswordHash: verifyPasswordHash,
    isStretchedHash: isStretchedHash,
    validatePasswordStrength: validatePasswordStrength,
    checkLoginRateLimit: checkLoginRateLimit,
    recordLoginFailure: recordLoginFailure,
    clearLoginFailures: clearLoginFailures,
    createDefaultAuthState: createDefaultAuthState,
    createDefaultStudents: createDefaultStudents,
    sanitizeStudentForClient: sanitizeStudentForClient,
    verifyRolePassword: verifyRolePassword,
    authenticate: authenticate,
    changeRolePassword: changeRolePassword,
    createStudentAccount: createStudentAccount,
    resetStudentPassword: resetStudentPassword,
    toggleStudentActive: toggleStudentActive,
    isAdminRole: isAdminRole,
    canManageSecurity: canManageSecurity,
    canManageLessons: canManageLessons,
    canBulkTxtAi: canBulkTxtAi,
    canMonitorStudents: canMonitorStudents,
    canManageStudents: canManageStudents,
    getSession: getSession,
    setSession: setSession,
    getSessionRole: getSessionRole,
    setSessionRole: setSessionRole,
    appendAuditLog: appendAuditLog
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWEAuth = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
