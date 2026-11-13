/**
 * SWE ENGLISH EXTRA — Role-Based Admin Auth (IT Manager & Teacher) with Salted SHA-256
 */
(function (root) {
  'use strict';

  const SESSION_KEY = 'swe_english_extra_session_v1';
  const SALT_PREFIX = 'SWE_ENG_EXTRA_V2_SALT:';

  // Only salted SHA-256 hashes are stored here (never plaintext passwords)
  const DEFAULT_AUTH_HASHES = {
    it_manager: '39f0d2187ebe9119f2c25eebc3b2430989469997cf3eb21da947abd410807420',
    teacher: '79511e5ff7a60b187f9440f6313fd960be4b6e76e424f014cc66ab633bfbfd15'
  };

  const ROLE_META = {
    student: {
      key: 'student',
      label: 'O‘quvchi',
      badgeClass: 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
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

  function hashRolePassword(role, password) {
    return sha256Hex(SALT_PREFIX + String(role) + ':' + String(password));
  }

  function createDefaultAuthState() {
    return {
      hashes: Object.assign({}, DEFAULT_AUTH_HASHES),
      updatedAt: null
    };
  }

  function verifyRolePassword(authState, role, password) {
    if (role !== 'it_manager' && role !== 'teacher') return false;
    if (!password || typeof password !== 'string') return false;
    const hashes = (authState && authState.hashes) ? authState.hashes : DEFAULT_AUTH_HASHES;
    const expected = hashes[role] || DEFAULT_AUTH_HASHES[role];
    return hashRolePassword(role, password) === expected;
  }

  function changeRolePassword(authState, actorRole, targetRole, newPassword) {
    if (targetRole !== 'it_manager' && targetRole !== 'teacher') {
      throw new Error('Noto‘g‘ri rol tanlandi.');
    }
    if (actorRole !== 'it_manager' && actorRole !== targetRole) {
      throw new Error('Bu parolni o‘zgartirish uchun IT Manager huquqi kerak.');
    }
    if (!newPassword || String(newPassword).trim().length < 6) {
      throw new Error('Parol kamida 6 ta belgidan iborat bo‘lishi kerak.');
    }

    const nextHashes = Object.assign({}, DEFAULT_AUTH_HASHES, (authState && authState.hashes) || {});
    nextHashes[targetRole] = hashRolePassword(targetRole, newPassword);

    return {
      hashes: nextHashes,
      updatedAt: Date.now()
    };
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

  function getSessionRole(sessionBackend) {
    const store = sessionBackend || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!store) return 'student';
    try {
      const val = store.getItem(SESSION_KEY);
      return isAdminRole(val) ? val : 'student';
    } catch (e) {
      return 'student';
    }
  }

  function setSessionRole(role, sessionBackend) {
    const store = sessionBackend || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    const normalized = isAdminRole(role) ? role : 'student';
    if (!store) return normalized;
    try {
      if (normalized === 'student') {
        store.removeItem(SESSION_KEY);
      } else {
        store.setItem(SESSION_KEY, normalized);
      }
    } catch (e) {
      // Ignore storage restriction
    }
    return normalized;
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
    return list.slice(0, 100);
  }

  const api = {
    SESSION_KEY: SESSION_KEY,
    DEFAULT_AUTH_HASHES: DEFAULT_AUTH_HASHES,
    ROLE_META: ROLE_META,
    sha256Hex: sha256Hex,
    hashRolePassword: hashRolePassword,
    createDefaultAuthState: createDefaultAuthState,
    verifyRolePassword: verifyRolePassword,
    changeRolePassword: changeRolePassword,
    isAdminRole: isAdminRole,
    canManageSecurity: canManageSecurity,
    canManageLessons: canManageLessons,
    canBulkTxtAi: canBulkTxtAi,
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
