/**
 * StudyLens Background Service Worker (background.js)
 *
 * Handles:
 *  - YouTube video session tracking (play/pause/seek/speed/chapter/transcript)
 *  - Website reading session tracking (scroll/section-focus/time-on-page)
 *  - On-startup injection into already-open tabs (no page refresh needed)
 *  - Flush payload to local server on tab close / navigation / page unload
 *  - Offline buffer in chrome.storage.local with alarm-based retry
 *  - Live event feed for popup display
 */

// ─────────────────────────────────────────────
// In-memory session store: { [tabId]: SessionData }
// ─────────────────────────────────────────────
const activeSessions = {};
const tabTrackingStates = {};

// Live event feed — keeps the last 50 events across all tabs
const recentEvents = [];
const MAX_RECENT_EVENTS = 50;

function addRecentEvent(event) {
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.length = MAX_RECENT_EVENTS;
  }
}

// ─────────────────────────────────────────────
// Startup injection — inject into ALREADY-OPEN tabs
// so users don't need to refresh after extension install/reload
// ─────────────────────────────────────────────
async function injectIntoExistingTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return; }

  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    const url = tab.url;

    // Skip non-http pages
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

    // Only inject YouTube tracker into already-open YouTube watch tabs.
    // content_website.js is handled by the manifest's content_scripts declaration
    // (runs automatically on document_idle) — re-injecting it causes duplicate IIFEs.
    if (url.includes('youtube.com/watch')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content_youtube.js'],
        });
        console.log(`[StudyLens] Injected YouTube tracker into tab ${tab.id}`);
      } catch {
        // Tab restricted or still loading
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[StudyLens] Extension installed/updated — injecting into existing tabs...');
  injectIntoExistingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[StudyLens] Browser started — injecting into existing tabs...');
  injectIntoExistingTabs();
});

// ─────────────────────────────────────────────
// Message handler — receives from content scripts AND popup
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Messages from POPUP (no sender.tab) ──
  if (!sender.tab) {
    switch (message.type) {
      case 'GET_SESSION_STATE': {
        const queryTabId = message.tabId;
        let foundSession = queryTabId ? activeSessions[queryTabId] : null;
        let foundTabId   = queryTabId;

        if (!foundSession) {
          for (const [tid, s] of Object.entries(activeSessions)) {
            foundSession = s;
            foundTabId   = parseInt(tid);
            break;
          }
        }

        if (foundSession) {
          let clockAccum = foundSession._clockTimeAccumulator;
          let videoAccum = foundSession._videoTimeAccumulator;
          if (foundSession._isPlaying && foundSession._lastPlayWallTime) {
            const elapsed = (Date.now() - foundSession._lastPlayWallTime) / 1000;
            clockAccum += elapsed;
            videoAccum += elapsed * foundSession._currentSpeed;
          }
          sendResponse({
            hasSession: true,
            session: {
              tabId: foundTabId,
              title: foundSession.title,
              platform: foundSession.platform,
              sessionType: foundSession.session_type || 'video',
              url: foundSession.url,
              isPlaying: foundSession._isPlaying,
              currentSpeed: foundSession._currentSpeed,
              clockAccumulator: clockAccum,
              videoAccumulator: videoAccum,
              videoDuration: foundSession.video_duration,
              eventCount: foundSession.events.length,
              scrollPct: foundSession.max_scroll_percent || 0,
              tracking_status: 'TRACKING',
            },
          });
        } else {
          // If no active session, maybe we have a tracking status for this tab (ANALYZING / IGNORED)
          const status = queryTabId ? tabTrackingStates[queryTabId] : null;
          if (status) {
            sendResponse({ hasSession: true, session: { tracking_status: status, tabId: queryTabId } });
          } else {
            sendResponse({ hasSession: false });
          }
        }
        return true;
      }
      case 'GET_RECENT_EVENTS': {
        sendResponse({ events: recentEvents });
        return true;
      }
      case 'GET_ALL_SESSIONS': {
        const sessions = {};
        for (const [tid, s] of Object.entries(activeSessions)) {
          sessions[tid] = {
            title: s.title,
            platform: s.platform,
            sessionType: s.session_type || 'video',
            isPlaying: s._isPlaying,
            eventCount: s.events.length,
          };
        }
        sendResponse({ sessions });
        return true;
      }
      case 'PING':
        sendResponse({ status: 'ok' });
        return true;
    }
    return false;
  }

  // ── Messages from CONTENT SCRIPTS (has sender.tab) ──
  const tabId = sender.tab.id;

  switch (message.type) {
    // ── YouTube / Video events ──
    case 'VIDEO_START':
      handleVideoStart(tabId, message, sender);
      break;
    case 'VIDEO_PLAY':
      handleVideoPlay(tabId, message);
      break;
    case 'VIDEO_PAUSE':
      handleVideoPause(tabId, message);
      break;
    case 'VIDEO_SEEK':
      handleVideoSeek(tabId, message);
      break;
    case 'VIDEO_SPEED_CHANGE':
      handleSpeedChange(tabId, message);
      break;
    case 'VIDEO_ENDED':
      handleVideoEnded(tabId, message);
      break;
    case 'VIDEO_CHAPTER':
      handleChapterChange(tabId, message);
      break;
    case 'TRANSCRIPT_CAPTURED':
      handleTranscript(tabId, message);
      break;
    case 'PAGE_LEAVE':
      flushSession(tabId, 'page_leave');
      break;

    // ── Website reading events ──
    case 'WEBSITE_START':
      handleWebsiteStart(tabId, message, sender);
      break;
    case 'WEBSITE_SCROLL':
      handleWebsiteScroll(tabId, message);
      break;
    case 'WEBSITE_SECTION_FOCUS':
      handleWebsiteSectionFocus(tabId, message);
      break;
    case 'WEBSITE_END':
      handleWebsiteEnd(tabId, message);
      break;

    // ── AI Chat events ──
    case 'AI_CHAT_END':
      handleAIChatEnd(tabId, message, sender);
      break;
    case 'TRACKING_STATUS_UPDATE':
      tabTrackingStates[tabId] = message.status;
      if (message.status === 'ANALYZING') {
         updateBadge(tabId, 'WAIT');
      } else if (message.status === 'IGNORED') {
         updateBadge(tabId, 'SKIP');
      }
      break;

    case 'PING':
      sendResponse({ status: 'ok' });
      break;
  }
  return false;
});

// ─────────────────────────────────────────────
// Tab lifecycle
// ─────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSessions[tabId]) {
    flushSession(tabId, 'tab_closed');
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && activeSessions[tabId]) {
    const session = activeSessions[tabId];
    if (session.url && !changeInfo.url.startsWith(session.url.split('?')[0])) {
      flushSession(tabId, 'navigation');
    }
  }

  // When a YouTube tab finishes loading, inject tracker if not already present
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content_youtube.js'],
    }).catch(() => {});
  }
});

// ─────────────────────────────────────────────
// Retry via alarms every 60 seconds
// ─────────────────────────────────────────────
chrome.alarms.create('retry_failed_events', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'retry_failed_events') {
    retryBufferedSessions();
  }
});

// ─────────────────────────────────────────────
// VIDEO Event Handlers
// ─────────────────────────────────────────────

function handleVideoStart(tabId, message, sender) {
  if (activeSessions[tabId] && activeSessions[tabId].url !== message.url) {
    flushSession(tabId, 'new_video');
  }

  const now = new Date().toISOString();
  activeSessions[tabId] = {
    tabId,
    session_type: 'video',
    url: message.url || sender.tab?.url || '',
    title: message.title || sender.tab?.title || '',
    platform: message.platform || 'youtube',
    video_duration: message.video_duration || 0,
    session_start_ts: now,
    session_end_ts: null,
    events: [],
    _isPlaying: false,
    _lastPlayWallTime: null,
    _lastPlayVideoTime: message.current_time || 0,
    _currentSpeed: 1.0,
    _videoTimeAccumulator: 0,
    _clockTimeAccumulator: 0,
    transcript: null,
  };

  const event = {
    type: 'VIDEO_START',
    timestamp: now,
    video_time: message.current_time || 0,
    video_duration: message.video_duration || 0,
    title: message.title,
    url: message.url,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: message.platform });
  updateBadge(tabId, 'REC');
  console.log(`[StudyLens] Video session started for tab ${tabId}: ${message.title}`);
}

function handleVideoPlay(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  session._isPlaying = true;
  session._lastPlayWallTime = Date.now();
  session._lastPlayVideoTime = message.video_time;

  const event = {
    type: 'VIDEO_PLAY',
    timestamp: message.timestamp || new Date().toISOString(),
    video_time: message.video_time,
    speed: session._currentSpeed,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
  updateBadge(tabId, 'REC');
}

function handleVideoPause(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (session._isPlaying) accumulateTime(session);
  session._isPlaying = false;

  const event = {
    type: 'VIDEO_PAUSE',
    timestamp: message.timestamp || new Date().toISOString(),
    video_time: message.video_time,
    clock_time_so_far: Math.round(session._clockTimeAccumulator),
    video_time_so_far: Math.round(session._videoTimeAccumulator),
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
  updateBadge(tabId, '||');
}

function handleVideoSeek(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (session._isPlaying) {
    accumulateTime(session);
    session._lastPlayWallTime = Date.now();
    session._lastPlayVideoTime = message.to_time;
  }

  const direction = message.to_time > message.from_time ? 'forward' : 'backward';
  const event = {
    type: 'VIDEO_SEEK',
    timestamp: message.timestamp || new Date().toISOString(),
    from_time: message.from_time,
    to_time: message.to_time,
    direction,
    delta_seconds: Math.round(Math.abs(message.to_time - message.from_time)),
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
}

function handleSpeedChange(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (session._isPlaying) {
    accumulateTime(session);
    session._lastPlayWallTime = Date.now();
    session._lastPlayVideoTime = message.video_time;
  }

  const oldSpeed = session._currentSpeed;
  session._currentSpeed = message.new_speed;

  const event = {
    type: 'VIDEO_SPEED_CHANGE',
    timestamp: message.timestamp || new Date().toISOString(),
    video_time: message.video_time,
    old_speed: oldSpeed,
    new_speed: message.new_speed,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
}

function handleVideoEnded(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (session._isPlaying) accumulateTime(session);
  session._isPlaying = false;
  session.session_end_ts = new Date().toISOString();

  const event = {
    type: 'VIDEO_ENDED',
    timestamp: message.timestamp || new Date().toISOString(),
    video_time: message.video_time || session.video_duration,
    completion_percent: session.video_duration > 0
      ? Math.round((message.video_time / session.video_duration) * 100)
      : null,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });

  flushSession(tabId, 'video_ended');
  updateBadge(tabId, 'OK');
}

function handleChapterChange(tabId, message) {
  const event = {
    type: 'VIDEO_CHAPTER',
    timestamp: message.timestamp || new Date().toISOString(),
    video_time: message.video_time,
    chapter_title: message.chapter_title,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: activeSessions[tabId]?.platform, title: activeSessions[tabId]?.title });
}

function handleTranscript(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;
  session.transcript = message.transcript;
  addRecentEvent({
    type: 'TRANSCRIPT_CAPTURED',
    timestamp: new Date().toISOString(),
    tabId,
    platform: session.platform,
    title: session.title,
    length: message.transcript?.length || 0,
  });
  console.log(`[StudyLens] Transcript captured for tab ${tabId} (${message.transcript?.length} chars)`);
}

// ─────────────────────────────────────────────
// WEBSITE Reading Event Handlers
// ─────────────────────────────────────────────

function handleWebsiteStart(tabId, message, sender) {
  // If there's an existing session for this tab, flush it first
  if (activeSessions[tabId]) {
    flushSession(tabId, 'new_page');
  }

  const now = new Date().toISOString();
  activeSessions[tabId] = {
    tabId,
    session_type: 'reading',
    url: message.url || sender.tab?.url || '',
    title: message.title || sender.tab?.title || '',
    platform: message.domain || 'website',
    domain: message.domain || '',
    session_start_ts: now,
    session_end_ts: null,
    events: [],
    headings: message.headings || [],
    word_count: message.word_count || 0,
    max_scroll_percent: 0,
    sections_focused: [],
    // Reading sessions don't use play/pause time model
    _isPlaying: false,
    _lastPlayWallTime: null,
    _currentSpeed: 1.0,
    _videoTimeAccumulator: 0,
    _clockTimeAccumulator: 0,
  };

  const event = {
    type: 'WEBSITE_START',
    timestamp: now,
    url: message.url,
    title: message.title,
    headings: message.headings || [],
    word_count: message.word_count || 0,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: message.domain });
  updateBadge(tabId, 'READ');
  console.log(`[StudyLens] Website reading session started: ${message.title} (${message.domain})`);
}

function handleWebsiteScroll(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (message.scroll_percent > (session.max_scroll_percent || 0)) {
    session.max_scroll_percent = message.scroll_percent;
  }

  const event = {
    type: 'WEBSITE_SCROLL',
    timestamp: message.timestamp || new Date().toISOString(),
    scroll_percent: message.scroll_percent,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
}

function handleWebsiteSectionFocus(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  session.sections_focused = session.sections_focused || [];
  session.sections_focused.push({
    section: message.section,
    duration_seconds: message.duration_seconds,
  });

  const event = {
    type: 'WEBSITE_SECTION_FOCUS',
    timestamp: message.timestamp || new Date().toISOString(),
    section: message.section,
    duration_seconds: message.duration_seconds,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });
}

function handleWebsiteEnd(tabId, message) {
  const session = activeSessions[tabId];
  if (!session) return;

  session.session_end_ts = message.timestamp || new Date().toISOString();
  session.total_time_seconds = message.total_time_seconds;
  session.max_scroll_percent = message.max_scroll_percent;
  session.avg_reading_wpm = message.avg_reading_wpm;

  const event = {
    type: 'WEBSITE_END',
    timestamp: session.session_end_ts,
    total_time_seconds: message.total_time_seconds,
    max_scroll_percent: message.max_scroll_percent,
    sections_read: message.sections_read,
    avg_reading_wpm: message.avg_reading_wpm,
    word_count: message.word_count,
  };
  pushEvent(tabId, event);
  addRecentEvent({ ...event, tabId, platform: session.platform, title: session.title });

  flushSession(tabId, message.reason || 'page_end');
  updateBadge(tabId, 'OK');
}

// ─────────────────────────────────────────────
// AI CHAT Event Handler
// ─────────────────────────────────────────────

function handleAIChatEnd(tabId, message, sender) {
  const now = new Date().toISOString();
  const totalSecs = message.total_time_seconds || 0;

  // Only bother if there's meaningful content (at least 30s and 2+ turns)
  if (totalSecs < 30 && (message.turn_count || 0) < 2) {
    console.log(`[StudyLens] AI chat too short — skipping (${totalSecs}s, ${message.turn_count} turns)`);
    return;
  }

  const session = {
    tabId,
    session_type:  'ai_chat',
    url:           message.url || sender.tab?.url || '',
    title:         message.title || sender.tab?.title || 'AI Chat Session',
    platform:      message.platform || 'ai_chat',
    domain:        message.domain || '',
    session_start_ts: new Date(Date.now() - totalSecs * 1000).toISOString(),
    session_end_ts:   now,
    transcript:    message.transcript || null,
    turn_count:    message.turn_count || 0,
    events: [{
      type:      'AI_CHAT_END',
      timestamp: now,
      turn_count:    message.turn_count || 0,
      total_time_seconds: totalSecs,
      reason:    message.reason || 'tab_hidden',
    }],
    _isPlaying:             false,
    _lastPlayWallTime:      null,
    _currentSpeed:          1.0,
    _videoTimeAccumulator:  0,
    _clockTimeAccumulator:  totalSecs,
    total_time_seconds:     totalSecs,
  };

  addRecentEvent({
    type:         'AI_CHAT_END',
    timestamp:    now,
    tabId,
    platform:     message.platform,
    title:        session.title,
    turn_count:   message.turn_count,
    clock_time:   totalSecs,
  });

  updateBadge(tabId, 'AI');
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId }).catch(() => {});

  const payload = buildAIChatPayload(session, message.reason || 'session_end');
  console.log(`[StudyLens] AI chat session flushed: "${session.title}" (${message.turn_count} turns, ${totalSecs}s)`);
  sendPayload(payload);
}

function buildAIChatPayload(session, reason) {
  return {
    schema_version: '2.0',
    flush_reason:   reason,
    session_type:   'ai_chat',
    session_id:     `ai-${session.tabId}-${Date.parse(session.session_start_ts)}`,
    url:            session.url,
    title:          session.title,
    platform:       session.platform,
    domain:         session.domain || null,

    // Reuse transcript field (already part of StudySessionPayload)
    transcript:     session.transcript || null,
    clock_time_spent_seconds: session.total_time_seconds,

    // AI-chat specific metadata
    meta: {
      turn_count:        session.turn_count,
      extension_version: chrome.runtime.getManifest().version,
    },

    session_start_ts: session.session_start_ts,
    session_end_ts:   session.session_end_ts,
    events:           session.events,
  };
}

// ─────────────────────────────────────────────
// Time Accumulation Logic (for video sessions)
// ─────────────────────────────────────────────

function accumulateTime(session) {
  if (!session._isPlaying || session._lastPlayWallTime === null) return;

  const nowMs = Date.now();
  const wallElapsed  = (nowMs - session._lastPlayWallTime) / 1000;
  const videoElapsed = wallElapsed * session._currentSpeed;

  session._clockTimeAccumulator += wallElapsed;
  session._videoTimeAccumulator += videoElapsed;
  session._lastPlayWallTime = nowMs;
}

// ─────────────────────────────────────────────
// Session Flush → Send to Local Server
// ─────────────────────────────────────────────

async function flushSession(tabId, reason) {
  const session = activeSessions[tabId];
  if (!session) return;

  if (session._isPlaying) accumulateTime(session);
  session.session_end_ts = session.session_end_ts || new Date().toISOString();

  const payload = buildPayload(session, reason);
  delete activeSessions[tabId];

  addRecentEvent({
    type: 'SESSION_FLUSHED',
    timestamp: new Date().toISOString(),
    tabId,
    reason,
    title: session.title,
    platform: session.platform,
    session_type: session.session_type,
    clock_time: Math.round(session._clockTimeAccumulator),
    video_time: Math.round(session._videoTimeAccumulator),
    event_count: session.events.length,
  });

  await sendPayload(payload);
}

function buildPayload(session, reason) {
  const isReading = session.session_type === 'reading';
  const clockTime = isReading
    ? (session.total_time_seconds || Math.round((Date.parse(session.session_end_ts) - Date.parse(session.session_start_ts)) / 1000))
    : Math.round(session._clockTimeAccumulator);
  const videoTime = Math.round(session._videoTimeAccumulator);
  const duration  = session.video_duration || 0;

  return {
    schema_version: '2.0',
    flush_reason: reason,
    session_type: session.session_type || 'video',
    session_id: `tab-${session.tabId}-${Date.parse(session.session_start_ts)}`,
    url: session.url,
    title: session.title,
    platform: session.platform,
    domain: session.domain || null,

    // Video-specific
    video_duration_seconds: duration || null,
    clock_time_spent_seconds: clockTime,
    video_time_consumed_seconds: isReading ? null : videoTime,
    completion_percentage: !isReading && duration > 0
      ? Math.min(100, Math.round((videoTime / duration) * 100))
      : null,
    transcript: session.transcript || null,

    // Reading-specific
    max_scroll_percent: session.max_scroll_percent || null,
    avg_reading_wpm: session.avg_reading_wpm || null,
    word_count: session.word_count || null,
    headings: session.headings || null,
    sections_focused: session.sections_focused || null,

    session_start_ts: session.session_start_ts,
    session_end_ts: session.session_end_ts,
    events: session.events,
    meta: {
      extension_version: chrome.runtime.getManifest().version,
      user_agent: navigator.userAgent,
    },
  };
}

async function sendPayload(payload) {
  const SERVER_URL = 'http://127.0.0.1:7842/events/video-session';
  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (response.ok) {
      console.log(`[StudyLens] Payload sent: ${payload.title} (${payload.session_type})`);
      return;
    }
    throw new Error(`Server ${response.status}`);
  } catch (err) {
    console.warn(`[StudyLens] Buffering session (server unreachable): ${err.message}`);
    await bufferSession(payload);
  }
}

// ─────────────────────────────────────────────
// Offline Buffer
// ─────────────────────────────────────────────

async function bufferSession(payload) {
  const data = await chrome.storage.local.get('pending_sessions');
  const pending = data.pending_sessions || [];
  pending.push({ payload, buffered_at: new Date().toISOString() });
  await chrome.storage.local.set({ pending_sessions: pending.slice(-50) });
}

async function retryBufferedSessions() {
  const data = await chrome.storage.local.get('pending_sessions');
  const pending = data.pending_sessions || [];
  if (pending.length === 0) return;

  const SERVER_URL = 'http://127.0.0.1:7842/events/video-session';
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — drop sessions older than this
  const now = Date.now();

  const stillFailed = [];
  for (const item of pending) {
    // Drop sessions older than 24 hours to prevent unbounded accumulation
    if (item.buffered_at && (now - Date.parse(item.buffered_at)) > MAX_AGE_MS) {
      console.log(`[StudyLens] Dropping stale buffered session (>24h): ${item.payload?.title}`);
      continue;
    }
    try {
      const r = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      if (!r.ok) throw new Error(`${r.status}`);
    } catch {
      stillFailed.push(item);
    }
  }
  await chrome.storage.local.set({ pending_sessions: stillFailed });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function pushEvent(tabId, event) {
  const session = activeSessions[tabId];
  if (session) session.events.push(event);
}

function updateBadge(tabId, text) {
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({
    color: text === 'READ' ? '#7c3aed' : '#00b4b4',
    tabId,
  }).catch(() => {});
}
