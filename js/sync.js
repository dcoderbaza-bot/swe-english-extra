/**
 * SWE ENGLISH EXTRA — Hybrid Real-Time Sync Engine
 * Supports both:
 * 1) Live Node Server Mode (REST + Server-Sent Events across devices/browsers)
 * 2) Local Multi-Tab Mode (LocalStorage + BroadcastChannel + storage events on file:// or static hosts)
 */
(function (root) {
  'use strict';

  const SYNC_CHANNEL_NAME = 'swe_english_extra_sync_v3';
  const TOKEN_KEY = 'swe_english_extra_token_v3';
  const SERVER_URL_KEY = 'swe_english_extra_server_url_v1';

  let serverMode = false;
  let serverIsServerless = false;
  let serverAllowOpenSignup = true;
  let serverPublicUrl = '';
  let activeServerBaseUrl = '';
  let memorySessionToken = '';
  let eventSource = null;
  let sseConnected = false;
  let fallbackPollTimerId = null;
  let lifecycleBound = false;
  let broadcastChannel = null;
  let updateListeners = [];

  function getBrowserLocalStorage() {
    try {
      return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeServerBaseUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : ('http://' + trimmed);
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.origin;
    } catch (e) {
      return '';
    }
  }

  function getServerBaseUrl() {
    if (activeServerBaseUrl) return activeServerBaseUrl;
    const store = getBrowserLocalStorage();
    if (!store) return '';
    try {
      return normalizeServerBaseUrl(store.getItem(SERVER_URL_KEY) || '');
    } catch (e) {
      return '';
    }
  }

  function setServerBaseUrl(rawUrl) {
    const clean = normalizeServerBaseUrl(rawUrl);
    activeServerBaseUrl = clean;
    const store = getBrowserLocalStorage();
    if (store) {
      try {
        if (!clean) store.removeItem(SERVER_URL_KEY);
        else store.setItem(SERVER_URL_KEY, clean);
      } catch (e) {
        // Ignore storage errors
      }
    }
    return clean;
  }

  function initServerBaseFromQuery() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('server')) {
        const paramVal = params.get('server') || '';
        setServerBaseUrl(paramVal);
      }
    } catch (e) {
      // Ignore query parse error
    }
  }

  function resolveApiUrl(apiPath) {
    return activeServerBaseUrl ? (activeServerBaseUrl + apiPath) : apiPath;
  }

  function getSessionToken() {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) {
        const sTok = sessionStorage.getItem(TOKEN_KEY);
        if (sTok) {
          memorySessionToken = sTok;
          return sTok;
        }
      }
    } catch (_) {}
    const ls = getBrowserLocalStorage();
    if (ls) {
      try {
        const lTok = ls.getItem(TOKEN_KEY);
        if (lTok) {
          memorySessionToken = lTok;
          return lTok;
        }
      } catch (_) {}
    }
    return memorySessionToken || '';
  }

  function setSessionToken(token) {
    const clean = String(token || '');
    memorySessionToken = clean;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) {
        if (!clean) sessionStorage.removeItem(TOKEN_KEY);
        else sessionStorage.setItem(TOKEN_KEY, clean);
      }
    } catch (_) {}
    const ls = getBrowserLocalStorage();
    if (ls) {
      try {
        if (!clean) ls.removeItem(TOKEN_KEY);
        else ls.setItem(TOKEN_KEY, clean);
      } catch (_) {}
    }
  }

  function isServerMode() {
    return serverMode;
  }

  function emitUpdate(info) {
    updateListeners.forEach(function (fn) {
      try { fn(info); } catch (e) { /* Ignore subscriber error */ }
    });
  }

  function onSyncUpdate(listener) {
    if (typeof listener === 'function') {
      updateListeners.push(listener);
    }
    return function unsubscribe() {
      updateListeners = updateListeners.filter(function (fn) { return fn !== listener; });
    };
  }

  function notifyLocalTabs(reason) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'update', reason: reason || 'local', timestamp: Date.now() });
      } catch (e) {
        // Ignore closed channel
      }
    }
  }

  function startLocalListeners(StorageMod) {
    if (typeof BroadcastChannel !== 'undefined' && !broadcastChannel) {
      try {
        broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        broadcastChannel.onmessage = function (ev) {
          emitUpdate({ source: 'local', reason: (ev && ev.data && ev.data.reason) || 'broadcast' });
        };
      } catch (e) {
        broadcastChannel = null;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function (ev) {
        if (!ev || !StorageMod || ev.key === StorageMod.STORAGE_KEY) {
          emitUpdate({ source: 'local', reason: 'storage' });
        }
      });
    }
  }

  function stopFallbackPolling() {
    if (fallbackPollTimerId) {
      clearInterval(fallbackPollTimerId);
      fallbackPollTimerId = null;
    }
  }

  function startFallbackPolling(intervalMs) {
    if (fallbackPollTimerId || !serverMode || !getSessionToken()) return;
    const pollMs = Number(intervalMs) > 0 ? Number(intervalMs) : (serverIsServerless ? 5000 : 10000);
    fallbackPollTimerId = setInterval(function () {
      if (!serverMode || !getSessionToken() || (!serverIsServerless && sseConnected)) {
        if (!serverIsServerless && sseConnected) stopFallbackPolling();
        return;
      }
      if (typeof document !== 'undefined' && document.hidden) return;
      emitUpdate({ source: 'poll', reason: 'mobile-poll', timestamp: Date.now() });
    }, pollMs);
  }

  function bindMobileLifecycleListeners() {
    if (lifecycleBound || typeof window === 'undefined' || !window.addEventListener) return;
    lifecycleBound = true;
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && serverMode && getSessionToken()) {
          if (!sseConnected) startServerStream();
          emitUpdate({ source: 'wakeup', reason: 'visibility', timestamp: Date.now() });
        }
      });
    }
    window.addEventListener('online', function () {
      if (serverMode && getSessionToken()) {
        startServerStream();
        emitUpdate({ source: 'wakeup', reason: 'online', timestamp: Date.now() });
      }
    });
  }

  function stopServerStream() {
    sseConnected = false;
    stopFallbackPolling();
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* Ignore */ }
      eventSource = null;
    }
  }

  function startServerStream() {
    const token = getSessionToken();
    if (!serverMode || !token) return;
    bindMobileLifecycleListeners();
    if (serverIsServerless || typeof EventSource === 'undefined') {
      stopServerStream();
      startFallbackPolling(serverIsServerless ? 5000 : 10000);
      return;
    }
    stopServerStream();
    try {
      eventSource = new EventSource(resolveApiUrl('/api/stream?token=' + encodeURIComponent(token)));
      eventSource.addEventListener('connected', function () {
        sseConnected = true;
        stopFallbackPolling();
      });
      eventSource.addEventListener('update', function (ev) {
        sseConnected = true;
        stopFallbackPolling();
        let payload = {};
        try { payload = JSON.parse(ev.data || '{}'); } catch (e) { payload = {}; }
        emitUpdate({ source: 'server', reason: payload.reason || 'sse', timestamp: payload.timestamp || Date.now() });
      });
      eventSource.onerror = function () {
        sseConnected = false;
        // Mobile carrier proxies / tunnels may drop idle SSE streams; keep live via adaptive polling while EventSource retries
        startFallbackPolling();
      };
    } catch (e) {
      eventSource = null;
      startFallbackPolling();
    }
  }

  async function probeServerHealth(baseOrigin) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 4500) : null;
    try {
      const url = (baseOrigin ? baseOrigin : '') + '/api/health';
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json().catch(function () { return null; });
      if (data && data.ok && data.mode === 'server') {
        serverIsServerless = Boolean(data.serverless);
        serverAllowOpenSignup = data.allowOpenSignup !== false;
        serverPublicUrl = String(data.publicUrl || '').trim();
        return true;
      }
      return false;
    } catch (e) {
      if (timer) clearTimeout(timer);
      return false;
    }
  }

  async function detectServer() {
    if (typeof window === 'undefined' || !window.location || typeof fetch !== 'function') {
      serverMode = false;
      return false;
    }

    initServerBaseFromQuery();
    const savedBase = getServerBaseUrl();

    if (savedBase && await probeServerHealth(savedBase)) {
      activeServerBaseUrl = savedBase;
      serverMode = true;
      if (getSessionToken()) startServerStream();
      return true;
    }

    if (window.location.protocol !== 'file:' && await probeServerHealth('')) {
      activeServerBaseUrl = '';
      serverMode = true;
      if (getSessionToken()) startServerStream();
      return true;
    }

    serverMode = false;
    return false;
  }

  async function apiRequest(url, method, body) {
    const token = getSessionToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(resolveApiUrl(url), {
      method: method || 'GET',
      cache: 'no-store',
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || ('Server xatosi: HTTP ' + res.status));
      err.status = res.status;
      err.rateLimited = Boolean(data.rateLimited);
      err.retryAfterSec = Number(data.retryAfterSec || 0);
      throw err;
    }
    return data;
  }

  function activateSessionFromAuthResponse(data) {
    if (data && data.token) {
      setSessionToken(data.token);
    }
    startServerStream();
    return data;
  }

  async function loginRemote(credentials) {
    return activateSessionFromAuthResponse(await apiRequest('/api/login', 'POST', credentials));
  }

  async function registerStudentRemote(payload) {
    return activateSessionFromAuthResponse(await apiRequest('/api/register', 'POST', payload));
  }

  async function joinStudentRemote(payload) {
    return activateSessionFromAuthResponse(await apiRequest('/api/student-join', 'POST', payload));
  }

  async function fetchPublicLinkRemote() {
    const data = await apiRequest('/api/public-link', 'GET');
    if (data && typeof data.publicUrl === 'string') {
      serverPublicUrl = data.publicUrl.trim();
    }
    return data;
  }

  function getPublicShareUrl() {
    if (serverPublicUrl) return serverPublicUrl;
    if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
      const host = String(window.location.hostname || '').toLowerCase();
      const isPrivateOrLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
        /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (!isPrivateOrLocal) {
        return window.location.origin;
      }
    }
    return '';
  }

  async function fetchNetworkInfoRemote() {
    return apiRequest('/api/network-info', 'GET');
  }

  function isOpenSignupAllowed() {
    return serverAllowOpenSignup;
  }

  async function logoutRemote() {
    stopServerStream();
    try {
      if (serverMode && getSessionToken()) {
        await apiRequest('/api/logout', 'POST', {});
      }
    } catch (e) {
      // Proceed with local logout even if network fails
    } finally {
      setSessionToken('');
    }
  }

  async function fetchRemoteState() {
    return apiRequest('/api/state', 'GET');
  }

  async function pushReviewRemote(wordId, ratingKey) {
    return apiRequest('/api/review', 'POST', { wordId: wordId, ratingKey: ratingKey });
  }

  async function pushTelemetryRemote(eventPayload) {
    return apiRequest('/api/telemetry', 'POST', eventPayload);
  }

  async function pushCurriculumRemote(payload) {
    return apiRequest('/api/curriculum', 'POST', payload);
  }

  async function pushStudentActionRemote(payload) {
    return apiRequest('/api/students', 'POST', payload);
  }

  async function pushAiConfigRemote(aiConfig) {
    return apiRequest('/api/ai-config', 'POST', { aiConfig: aiConfig });
  }

  async function pushSecurityRemote(payload) {
    return apiRequest('/api/security', 'POST', payload);
  }

  async function pushExamActionRemote(payload) {
    return apiRequest('/api/exam', 'POST', payload);
  }

  async function proxyAiRequest(endpoint, apiKey, requestPayload, provider) {
    const data = await apiRequest('/api/ai-proxy', 'POST', {
      endpoint: endpoint,
      apiKey: apiKey || '',
      provider: provider || 'deepseek',
      payload: requestPayload
    });
    return data.content;
  }

  async function resolvePronunciationRemote(payload) {
    return apiRequest('/api/pronounce', 'POST', payload || {});
  }

  async function fetchTtsAudio(payload) {
    const token = getSessionToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(resolveApiUrl('/api/tts'), {
      method: 'POST',
      cache: 'no-store',
      headers: headers,
      body: JSON.stringify(payload || {})
    });

    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.indexOf('audio/') === 0) {
      const blob = await res.blob();
      return {
        mode: 'audio',
        blob: blob,
        mime: ct.split(';')[0].trim(),
        source: res.headers.get('x-tts-source') || 'api',
        provider: res.headers.get('x-tts-provider') || 'api'
      };
    }

    const data = await res.json().catch(function () { return {}; });
    if (res.ok && data && data.mode === 'browser-fallback') {
      return { mode: 'browser-fallback' };
    }
    return {
      mode: 'error',
      status: res.status,
      error: (data && data.error) || ('TTS HTTP ' + res.status)
    };
  }

  const api = {
    SYNC_CHANNEL_NAME: SYNC_CHANNEL_NAME,
    isServerMode: isServerMode,
    isOpenSignupAllowed: isOpenSignupAllowed,
    normalizeServerBaseUrl: normalizeServerBaseUrl,
    getServerBaseUrl: getServerBaseUrl,
    setServerBaseUrl: setServerBaseUrl,
    getSessionToken: getSessionToken,
    setSessionToken: setSessionToken,
    detectServer: detectServer,
    startLocalListeners: startLocalListeners,
    notifyLocalTabs: notifyLocalTabs,
    startServerStream: startServerStream,
    stopServerStream: stopServerStream,
    onSyncUpdate: onSyncUpdate,
    loginRemote: loginRemote,
    registerStudentRemote: registerStudentRemote,
    joinStudentRemote: joinStudentRemote,
    fetchPublicLinkRemote: fetchPublicLinkRemote,
    getPublicShareUrl: getPublicShareUrl,
    fetchNetworkInfoRemote: fetchNetworkInfoRemote,
    logoutRemote: logoutRemote,
    fetchRemoteState: fetchRemoteState,
    pushReviewRemote: pushReviewRemote,
    pushTelemetryRemote: pushTelemetryRemote,
    pushCurriculumRemote: pushCurriculumRemote,
    pushStudentActionRemote: pushStudentActionRemote,
    pushAiConfigRemote: pushAiConfigRemote,
    pushSecurityRemote: pushSecurityRemote,
    pushExamActionRemote: pushExamActionRemote,
    proxyAiRequest: proxyAiRequest,
    resolvePronunciationRemote: resolvePronunciationRemote,
    fetchTtsAudio: fetchTtsAudio
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWESync = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
