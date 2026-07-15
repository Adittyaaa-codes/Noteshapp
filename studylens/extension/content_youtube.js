/**
 * StudyLens — YouTube Content Script (content_youtube.js)
 *
 * Tracks: play, pause, seek, speed change, video end, chapters, transcript.
 * Handles YouTube SPA navigation cleanly without duplicate events.
 */

(function () {
  'use strict';

  // ── Prevent double-injection ──────────────────────────────
  if (window.__studyLensYT) return;
  window.__studyLensYT = true;

  console.log('[StudyLens] YouTube tracker loaded:', location.href);

  // ── State ─────────────────────────────────────────────────
  let video            = null;
  let videoId          = null;
  let videoTitle       = null;
  let initSent         = false;
  let attached         = false;
  let lastVideoTime    = 0;
  let lastSpeed        = 1;           // Track speed to deduplicate ratechange
  let lastNavUrl       = location.href;
  let navCooldown      = false;       // Prevent duplicate SPA nav handling
  let lastChapterTitle = null;
  let transcriptSent   = false;       // Only send transcript once per video

  // Rewatch detection
  const REWATCH_WINDOW_MS = 60000;
  const REWATCH_THRESHOLD = 3;
  let backwardSeeks = [];

  // ── Utilities ─────────────────────────────────────────────

  function getVideoId() {
    try { return new URLSearchParams(location.search).get('v') || null; } catch { return null; }
  }

  function getVideoTitle() {
    const selectors = [
      'h1.ytd-video-primary-info-renderer yt-formatted-string',
      'h1.ytd-watch-metadata yt-formatted-string',
      '#title h1 yt-formatted-string',
      'ytd-watch-metadata h1',
      '#container h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return document.title.replace(' - YouTube', '').trim();
  }

  function now() { return new Date().toISOString(); }

  function send(type, extra) {
    const msg = Object.assign({ type, platform: 'youtube', url: location.href, title: videoTitle || getVideoTitle() }, extra || {});
    try { chrome.runtime.sendMessage(msg); } catch (e) { /* context invalidated */ }
  }

  // ── Debounce helper ───────────────────────────────────────

  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── AI Classification ──────────────────────────────────────────────────────────

  const BACKEND = 'http://127.0.0.1:7842';
  const _ytClassifyCache = new Map(); // videoId -> boolean

  // ── Tier-2: keyword heuristic (instant, no network) ──────────────────────────
  function keywordClassify(text) {
    const t = (text || '').toLowerCase();
    // Hard-block: clearly non-educational YouTube content signals
    const blocklist = /\b(music video|official video|official audio|lyric video|lyrics|trailer|reaction|vlog|meme|funny|prank|gameplay|fortnite|roblox|minecraft let|nfl|nba|soccer goal|cricket match|bollywood song|movie review|netflix|song|shorts|comedy skit|roast|unboxing)\b/;
    if (blocklist.test(t)) return false;
    // Strong educational signals
    const allowlist = /\b(tutorial|lecture|lesson|course|learn|study|explain|how to|guide|introduction|algorithm|data structure|python|javascript|typescript|java|c\+\+|rust|golang|math|physics|chemistry|biology|history|science|programming|coding|machine learning|deep learning|ai|engineering|statistics|calculus|algebra|exam|test|revision|concept|theory|proof|computer science|operating system|networking|database|system design|interview prep|competitive programming|research|university|college|professor)\b/;
    if (allowlist.test(t)) return true;
    // Default: YES \u2014 better to track a non-study video than miss a study one
    return true;
  }

  // \u2500\u2500 Tier-3: backend ML classifier (async, with per-video caching) \u2500\u2500
  async function backendClassifyYT(title) {
    try {
      const resp = await fetch(BACKEND + '/classify/educational', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: title }),
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      // Only act on a high-confidence NO; default to YES when uncertain
      if (data.label === 'NO' && (data.confidence || 0) >= 0.80) return false;
      return true;
    } catch {
      return null; // backend unavailable \u2014 caller falls back to keyword result
    }
  }

  // \u2500\u2500 Main classifier: 3-tier pipeline with per-video cache \u2500\u2500
  async function checkIfStudyVideo(title, vid) {
    // Tier 1: per-video cache (avoids re-classifying the same video on repeat plays)
    if (vid && _ytClassifyCache.has(vid)) {
      const cached = _ytClassifyCache.get(vid);
      console.log(`[StudyLens] YT cache HIT for ${vid}: ${cached ? 'STUDY' : 'SKIP'}`);
      return cached;
    }

    // Tier 2: keyword heuristic
    const kwResult = keywordClassify(title);

    let finalResult;

    if (kwResult === false) {
      // Only call ML backend when heuristic says NO (to avoid slow calls on obvious content)
      const mlResult = await backendClassifyYT(title);
      finalResult = mlResult !== null ? mlResult : kwResult;
    } else {
      finalResult = kwResult; // true
    }

    // Cache result for this video session
    if (vid) _ytClassifyCache.set(vid, finalResult);

    return finalResult;
  }



  // ── Session Init ──────────────────────────────────────────

  function initSession() {
    if (initSent || !video) return;
    initSent = true;
    videoId    = getVideoId();
    videoTitle = getVideoTitle();
    lastSpeed  = video.playbackRate || 1;

    send('VIDEO_START', {
      video_id: videoId,
      current_time: video.currentTime,
      video_duration: video.duration || 0,
      timestamp: now(),
    });

    // Extract transcript once, after 3s (player data should be ready)
    if (!transcriptSent) {
      transcriptSent = true;
      setTimeout(extractTranscript, 3000);
    }
  }

  // ── Reset state for SPA navigation ────────────────────────

  function resetState() {
    initSent         = false;
    attached         = false;
    lastChapterTitle = null;
    backwardSeeks    = [];
    transcriptSent   = false;
    lastSpeed        = 1;
    lastVideoTime    = 0;
    video            = null;
  }

  // ── Video Event Listeners ─────────────────────────────────

  function attachVideoListeners(v) {
    if (attached && video === v) return;  // Already attached to this exact element
    video    = v;
    attached = true;
    lastSpeed = v.playbackRate || 1;

    // PLAY — deduplicated: only fires after actual user-play, not on resume-from-seek
    v.addEventListener('play', function onPlay() {
      // initSession is idempotent — safe to call on every play
      initSession();
      send('VIDEO_PLAY', { video_id: videoId, video_time: v.currentTime, timestamp: now() });
      lastVideoTime = v.currentTime;
    });

    // PAUSE — don't fire if the video just ended (ended fires its own event)
    v.addEventListener('pause', function onPause() {
      if (v.ended) return;  // Skip pause that follows "ended"
      send('VIDEO_PAUSE', { video_id: videoId, video_time: v.currentTime, timestamp: now() });
    });

    // SEEKED — fire only once per seek action
    const debouncedSeek = debounce(function () {
      const seekedTo   = v.currentTime;
      const seekedFrom = lastVideoTime;

      // Ignore micro-seeks (< 0.5s) caused by YouTube internal buffering
      if (Math.abs(seekedTo - seekedFrom) < 0.5) {
        lastVideoTime = seekedTo;
        return;
      }

      send('VIDEO_SEEK', { video_id: videoId, from_time: seekedFrom, to_time: seekedTo, timestamp: now() });

      // Rewatch detection
      if (seekedTo < seekedFrom) {
        const nowMs = Date.now();
        backwardSeeks = backwardSeeks.filter(t => nowMs - t < REWATCH_WINDOW_MS);
        backwardSeeks.push(nowMs);
        if (backwardSeeks.length >= REWATCH_THRESHOLD) {
          send('REWATCH_SIGNAL', { video_id: videoId, video_time: seekedTo, timestamp: now() });
          backwardSeeks = [];
        }
      }

      lastVideoTime = seekedTo;
    }, 200);

    v.addEventListener('seeked', debouncedSeek);

    // TIMEUPDATE — only used to track current position (no events sent)
    v.addEventListener('timeupdate', function () {
      if (!v.seeking) lastVideoTime = v.currentTime;
    });

    // RATECHANGE — deduplicated: only fires when speed actually changes to a new value
    v.addEventListener('ratechange', function () {
      const newSpeed = v.playbackRate;
      if (newSpeed === lastSpeed) return;  // Ignore spurious duplicate ratechange
      const oldSpeed = lastSpeed;
      lastSpeed = newSpeed;
      send('VIDEO_SPEED_CHANGE', { video_id: videoId, video_time: v.currentTime, old_speed: oldSpeed, new_speed: newSpeed, timestamp: now() });
    });

    // ENDED
    v.addEventListener('ended', function () {
      send('VIDEO_ENDED', { video_id: videoId, video_time: v.currentTime, timestamp: now() });
      initSent = false;
      attached = false;
    });

    // ── If already playing when injected — send start+play ONCE ──
    if (!v.paused && !initSent) {
      initSession();
      send('VIDEO_PLAY', { video_id: videoId || getVideoId(), video_time: v.currentTime, timestamp: now() });
      lastVideoTime = v.currentTime;
    } else if (v.readyState >= 2 && v.currentTime > 0 && !initSent) {
      // Paused but has progress (user paused before script loaded)
      initSession();
    }
  }

  // ── Chapter Detection (polled via timeupdate) ─────────────

  let lastChapterCheck = 0;
  function checkChapter() {
    const nowMs = Date.now();
    if (nowMs - lastChapterCheck < 1000) return;  // Check at most once/sec
    lastChapterCheck = nowMs;

    const chapterEl = document.querySelector('.ytp-chapter-title-content, .ytp-chapter-container .ytp-chapter-title');
    const title = chapterEl?.textContent?.trim() || null;
    if (title && title !== lastChapterTitle) {
      lastChapterTitle = title;
      send('VIDEO_CHAPTER', { video_time: video?.currentTime || 0, chapter_title: title, timestamp: now() });
    }
  }

  // Hook chapter checks to timeupdate (already throttled above)
  function startChapterPolling() {
    if (!video) return;
    video.addEventListener('timeupdate', checkChapter);
  }

  // ── Transcript Extraction ─────────────────────────────────

  function extractTranscript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('yt_api.js');
    (document.body || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  // Listen for response from yt_api.js (runs in page context)
  window.addEventListener('message', function (event) {
    if (event.source !== window || event.data?.type !== 'YT_STUDYLENS_RESPONSE') return;
    if (event.data.error) { console.debug('[StudyLens] Player API error:', event.data.error); return; }

    const playerData = event.data.payload;
    if (!playerData) return;

    let captionTracks = null;
    try { captionTracks = playerData.captions.playerCaptionsTracklistRenderer.captionTracks; } catch {}
    if (!captionTracks?.length) { console.debug('[StudyLens] No caption tracks'); return; }

    const track = captionTracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || captionTracks[0];
    if (!track?.baseUrl) return;

    fetch(track.baseUrl + '&fmt=srv3')
      .then(r => r.text())
      .then(xml => {
        if (!xml) return;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const lines = [];
        doc.querySelectorAll('text').forEach(node => {
          const start = parseFloat(node.getAttribute('start') || '0');
          const text = (node.textContent || '')
            .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
          if (text) {
            const m = String(Math.floor(start / 60)).padStart(2, '0');
            const s = String(Math.floor(start % 60)).padStart(2, '0');
            lines.push(`[${m}:${s}] ${text}`);
          }
        });
        if (lines.length > 0) {
          send('TRANSCRIPT_CAPTURED', { transcript: lines.join('\n') });
          console.log('[StudyLens] Transcript sent:', lines.length, 'lines');
        }
      })
      .catch(err => console.debug('[StudyLens] Transcript fetch failed:', err));
  });

  // ── Page Unload ───────────────────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && initSent) {
      try { chrome.runtime.sendMessage({ type: 'PAGE_LEAVE' }); } catch {}
    }
  });

  window.addEventListener('beforeunload', function () {
    if (initSent) { try { chrome.runtime.sendMessage({ type: 'PAGE_LEAVE' }); } catch {} }
  });

  // ── SPA Navigation ─────────────────────────────────────────
  // YouTube is a SPA. Deduplicated: only handles a given URL change once.

  function handleSPANavigation() {
    const newUrl = location.href;
    if (newUrl === lastNavUrl) return;   // Same URL — ignore
    if (navCooldown) return;             // Already handling a nav event

    navCooldown = true;
    setTimeout(() => { navCooldown = false; }, 1000);  // 1s cooldown

    console.log('[StudyLens] SPA nav:', lastNavUrl, '->', newUrl);
    lastNavUrl = newUrl;

    if (initSent) {
      try { chrome.runtime.sendMessage({ type: 'PAGE_LEAVE' }); } catch {}
    }
    resetState();

    // Look for video element after navigation
    setTimeout(findAndAttach, 1000);
    setTimeout(findAndAttach, 2500);
  }

  // Only hook pushState (yt-navigate-finish is enough for all other nav)
  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(history, arguments);
    setTimeout(handleSPANavigation, 150);
  };

  // YouTube fires this after every SPA navigation — primary signal
  window.addEventListener('yt-navigate-finish', function () {
    setTimeout(handleSPANavigation, 150);
  });

  // ── Video Element Discovery ───────────────────────────────

  async function findAndAttach() {
    if (location.pathname !== '/watch') return;

    const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!v || (v === video && attached)) return;

    // Wait for title to render
    await new Promise(r => setTimeout(r, 800));
    const title = getVideoTitle();
    const vid   = getVideoId();

    const isStudy = await checkIfStudyVideo(title, vid);
    if (!isStudy) {
      console.log('[StudyLens] Not study video — skipping:', title);
      try { chrome.runtime.sendMessage({ type: 'TRACKING_STATUS_UPDATE', status: 'IGNORED', url: location.href, title }); } catch(e) {}
      return;
    }

    console.log('[StudyLens] Study video confirmed — tracking:', title);
    try { chrome.runtime.sendMessage({ type: 'TRACKING_STATUS_UPDATE', status: 'TRACKING', url: location.href, title }); } catch(e) {}
    attachVideoListeners(v);
    startChapterPolling();

  }

  // MutationObserver — fires when the video element is inserted into the DOM
  let attachTimeout = null;
  const observer = new MutationObserver(function () {
    if (!video || !document.contains(video) || !attached) {
      if (attachTimeout) return;
      attachTimeout = setTimeout(function () {
        attachTimeout = null;
        findAndAttach();
      }, 500);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial attempts — reduced from 6 to 3 (500ms, 1.5s, 3s)
  findAndAttach();
  setTimeout(findAndAttach, 500);
  setTimeout(findAndAttach, 1500);
  setTimeout(findAndAttach, 3000);

})();
