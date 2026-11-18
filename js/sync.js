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

  let serverMode = false;
  let eventSource = null;
  let broadcastChannel = null;
  let updateListeners = [];

  function getSessionToken() {
    try {
      return typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(TOKEN_KEY) || '') : '';
    } catch (e) {
      return '';
    }
  }

  function setSessionToken(token) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (!token) sessionStorage.removeItem(TOKEN_KEY);
      else sessionStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      // Ignore storage errors
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

  function stopServerStream() {
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* Ignore */ }
      eventSource = null;
    }
  }

  function startServerStream() {
    const token = getSessionToken();
    if (!serverMode || typeof EventSource === 'undefined' || !token) return;
    stopServerStream();
    try {
      eventSource = new EventSource('/api/stream?token=' + encodeURIComponent(token));
      eventSource.addEventListener('update', function (ev) {
        let payload = {};
        try { payload = JSON.parse(ev.data || '{}'); } catch (e) { payload = {}; }
        emitUpdate({ source: 'server', reason: payload.reason || 'sse', timestamp: payload.timestamp || Date.now() });
      });
      eventSource.onerror = function () {
        // EventSource automatically reconnects while session token stays valid
      };
    } catch (e) {
      eventSource = null;
    }
  }

  async function detectServer() {
    if (typeof window === 'undefined' || !window.location || window.location.protocol === 'file:' || typeof fetch !== 'function') {
      serverMode = false;
      return false;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 1500) : null;
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        serverMode = false;
        return false;
      }
      const data = await res.json().catch(function () { return null; });
      serverMode = Boolean(data && data.ok && data.mode === 'server');
      if (serverMode && getSessionToken()) {
        startServerStream();
      }
      return serverMode;
    } catch (e) {
      if (timer) clearTimeout(timer);
      serverMode = false;
      return false;
    }
  }

  async function apiRequest(url, method, body) {
    const token = getSessionToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(url, {
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

  async function loginRemote(credentials) {
    const data = await apiRequest('/api/login', 'POST', credentials);
    if (data.token) {
      setSessionToken(data.token);
    }
    startServerStream();
    return data;
  }

  async function logoutRemote() {
    try {
      if (serverMode && getSessionToken()) {
        await apiRequest('/api/logout', 'POST', {});
      }
    } catch (e) {
      // Proceed with local logout even if network fails
    } finally {
      stopServerStream();
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

  async function proxyAiRequest(endpoint, apiKey, requestPayload, provider) {
    const data = await apiRequest('/api/ai-proxy', 'POST', {
      endpoint: endpoint,
      apiKey: apiKey || '',
      provider: provider || 'deepseek',
      payload: requestPayload
    });
    return data.content;
  }

  const api = {
    SYNC_CHANNEL_NAME: SYNC_CHANNEL_NAME,
    isServerMode: isServerMode,
    getSessionToken: getSessionToken,
    setSessionToken: setSessionToken,
    detectServer: detectServer,
    startLocalListeners: startLocalListeners,
    notifyLocalTabs: notifyLocalTabs,
    startServerStream: startServerStream,
    stopServerStream: stopServerStream,
    onSyncUpdate: onSyncUpdate,
    loginRemote: loginRemote,
    logoutRemote: logoutRemote,
    fetchRemoteState: fetchRemoteState,
    pushReviewRemote: pushReviewRemote,
    pushTelemetryRemote: pushTelemetryRemote,
    pushCurriculumRemote: pushCurriculumRemote,
    pushStudentActionRemote: pushStudentActionRemote,
    pushAiConfigRemote: pushAiConfigRemote,
    pushSecurityRemote: pushSecurityRemote,
    proxyAiRequest: proxyAiRequest
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWESync = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
