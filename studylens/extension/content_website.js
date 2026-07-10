/**
 * StudyLens — Website Reading Tracker (content_website.js)
 *
 * Tracking modes:
 *   1. CUSTOM PLATFORM — user explicitly listed this domain. Track immediately.
 *   2. AUTO-DETECT (SLM stub) — for all other sites, returns null until SLM is
 *      wired up. When implemented, will POST title+headings to local model.
 *
 * What is tracked:
 *   - WEBSITE_START: page load, title, headings extracted
 *   - WEBSITE_SCROLL: scroll depth milestones (25/50/75/90/100%)
 *   - WEBSITE_SECTION_FOCUS: heading user lingered on (>5s)
 *   - WEBSITE_END: session summary
 */

(function () {
  'use strict';

  // Prevent double-injection (script may be injected by both manifest + background)
  if (window.__studyLensWebsite) return;
  window.__studyLensWebsite = true;

  // ── Constants ─────────────────────────────────────────────
  const IGNORED_HOSTNAMES = new Set([
    'localhost', '127.0.0.1', 'chrome.google.com',
    'accounts.google.com', 'mail.google.com', 'drive.google.com',
    'docs.google.com', 'sheets.google.com', 'slides.google.com',
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'reddit.com', 'tiktok.com', 'netflix.com', 'hotstar.com',
    'primevideo.com', 'spotify.com', 'discord.com', 'slack.com',
    'whatsapp.com', 'web.whatsapp.com', 'telegram.org',
    'amazon.com', 'flipkart.com', 'myntra.com', 'swiggy.com',
    'zomato.com', 'news.ycombinator.com',
  ]);

  const SECTION_FOCUS_MIN_MS = 5000;
  const SCROLL_DEBOUNCE_MS   = 300;

  // ── State ─────────────────────────────────────────────────
  let sessionActive      = false;
  let listenersAttached  = false;   // Guard against duplicate event listeners
  let sessionStartTime   = null;
  let maxScrollPct       = 0;
  let scrollMilestones   = new Set();
  let sectionLog         = [];
  let currentSection     = null;
  let sectionStartTime   = null;
  let wordCount          = 0;
  let scrollDebounce     = null;
  let lastScrollTop      = 0;
  let lastScrollTime     = Date.now();
  let scrollSpeedSamples = [];

  // ── Utilities ─────────────────────────────────────────────

  function getHostname() {
    return location.hostname.replace(/^www\./, '');
  }

  function getPageTitle() {
    return document.title.trim() || location.hostname;
  }

  function extractHeadings() {
    const nodes = document.querySelectorAll('h1, h2, h3');
    const result = [];
    nodes.forEach(n => {
      const text = n.textContent.trim();
      if (text.length > 3 && text.length < 200) result.push(text);
    });
    return result.slice(0, 20);
  }

  function estimateWordCount() {
    const bodyText = document.body ? document.body.innerText || '' : '';
    return bodyText.split(/\s+/).filter(Boolean).length;
  }

  function send(type, extra) {
    const msg = Object.assign({
      type,
      platform: 'website',
      session_type: 'reading',
      url: location.href,
      title: getPageTitle(),
      domain: getHostname(),
    }, extra || {});
    try {
      chrome.runtime.sendMessage(msg);
    } catch (e) {
      // Extension context invalidated on reload — ignore
    }
  }

  function now() {
    return new Date().toISOString();
  }

  // ── AI Classification (calls backend /api/classify) ──────

  const BACKEND = 'http://127.0.0.1:7842';

  async function checkIfStudyContent(title, headings) {
    // Check sessionStorage cache first (valid for 30 min)
    const cacheKey = 'slm_' + location.hostname + location.pathname.slice(0, 40);
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { result, ts } = JSON.parse(cached);
        if (Date.now() - ts < 30 * 60 * 1000) return result;
      }
    } catch (_) {}

    try {
      const resp = await fetch(BACKEND + '/classify/educational', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: title }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      
      const is_study = (data.label === "YES");
      console.log(`[StudyLens] Classify: ${is_study ? '✓ STUDY' : '✗ SKIP'} (${Math.round((data.confidence||0)*100)}%)`);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ result: is_study, ts: Date.now() })); } catch(_) {}
      return is_study;
    } catch (e) {
      console.log('[StudyLens] Classify fetch failed, defaulting to NOT track:', e.message);
      return false; // Network error -> do NOT track
    }
  }

  // ── Platform Check ─────────────────────────────────────────

  async function isCustomPlatform() {
    try {
      const data = await chrome.storage.local.get('custom_platforms');
      const platforms = data.custom_platforms || [];
      const hostname = getHostname();
      return platforms.some(p => {
        // Strip protocol/www from stored domain for reliable matching
        const domain = p.domain
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '');
        return hostname === domain
          || hostname.endsWith('.' + domain)
          || domain.endsWith('.' + hostname);
      });
    } catch {
      return false;
    }
  }

  // ── Session Start ─────────────────────────────────────────

  function startSession() {
    if (sessionActive) return;
    sessionActive    = true;
    sessionStartTime = Date.now();
    wordCount        = estimateWordCount();

    const headings = extractHeadings();
    send('WEBSITE_START', { timestamp: now(), headings, word_count: wordCount });
    console.log('[StudyLens] Website session started:', getPageTitle(), '@', getHostname());
  }

  // ── Scroll Tracking ───────────────────────────────────────

  function getScrollPct() {
    const el     = document.documentElement;
    const scrolled = el.scrollTop || document.body.scrollTop;
    const total    = el.scrollHeight - el.clientHeight;
    if (total <= 0) return 100;
    return Math.min(100, Math.round((scrolled / total) * 100));
  }

  function onScroll() {
    if (!sessionActive) return;

    const pct = getScrollPct();
    if (pct > maxScrollPct) maxScrollPct = pct;

    for (const milestone of [25, 50, 75, 90, 100]) {
      if (pct >= milestone && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone);
        send('WEBSITE_SCROLL', { timestamp: now(), scroll_percent: milestone });
      }
    }

    // Reading speed estimate from scroll velocity
    const nowMs      = Date.now();
    const timeDelta  = (nowMs - lastScrollTime) / 1000;
    const currTop    = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollDelta = Math.abs(currTop - lastScrollTop);
    if (timeDelta > 0 && scrollDelta > 0) {
      const wpm = ((scrollDelta / window.innerHeight) * 250 / timeDelta) * 60;
      if (wpm > 0 && wpm < 2000) {
        scrollSpeedSamples.push(wpm);
        if (scrollSpeedSamples.length > 20) scrollSpeedSamples.shift();
      }
    }
    lastScrollTop  = currTop;
    lastScrollTime = nowMs;

    detectCurrentSection();
  }

  // ── Section Focus Detection ───────────────────────────────

  function detectCurrentSection() {
    const headings = document.querySelectorAll('h1, h2, h3');
    let nearest = null;
    let nearestDist = Infinity;

    headings.forEach(h => {
      const rect = h.getBoundingClientRect();
      const dist = Math.abs(rect.top);
      if (rect.top <= window.innerHeight * 0.6 && dist < nearestDist) {
        nearestDist = dist;
        nearest = h.textContent.trim();
      }
    });

    if (nearest && nearest !== currentSection) {
      if (currentSection && sectionStartTime) {
        const duration = Date.now() - sectionStartTime;
        if (duration >= SECTION_FOCUS_MIN_MS) {
          sectionLog.push({ heading: currentSection, duration_ms: duration });
          send('WEBSITE_SECTION_FOCUS', {
            timestamp: now(),
            section: currentSection,
            duration_seconds: Math.round(duration / 1000),
          });
        }
      }
      currentSection   = nearest;
      sectionStartTime = Date.now();
    }
  }

  // ── Session End ───────────────────────────────────────────

  function endSession(reason) {
    if (!sessionActive) return;
    sessionActive = false;

    if (currentSection && sectionStartTime) {
      const duration = Date.now() - sectionStartTime;
      if (duration >= SECTION_FOCUS_MIN_MS) {
        sectionLog.push({ heading: currentSection, duration_ms: duration });
      }
    }

    const totalSeconds   = Math.round((Date.now() - sessionStartTime) / 1000);
    const avgReadingWpm  = scrollSpeedSamples.length > 0
      ? Math.round(scrollSpeedSamples.reduce((a, b) => a + b, 0) / scrollSpeedSamples.length)
      : null;

    send('WEBSITE_END', {
      timestamp: now(),
      reason,
      total_time_seconds: totalSeconds,
      max_scroll_percent: maxScrollPct,
      sections_read: sectionLog.length,
      section_log: sectionLog,
      avg_reading_wpm: avgReadingWpm,
      word_count: wordCount,
    });

    console.log('[StudyLens] Session ended:', reason, '| Time:', totalSeconds + 's | Scroll:', maxScrollPct + '%');
  }

  // ── Attach Event Listeners (idempotent) ───────────────────

  function attachListeners() {
    if (listenersAttached) return;  // Never attach twice
    listenersAttached = true;

    window.addEventListener('scroll', () => {
      if (scrollDebounce) clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(onScroll, SCROLL_DEBOUNCE_MS);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        endSession('tab_hidden');
      } else if (document.visibilityState === 'visible' && !sessionActive) {
        // Tab became visible again — resume tracking
        startSession();
      }
    });

    window.addEventListener('beforeunload', () => endSession('page_unload'));

    // Kick off initial scroll position check
    setTimeout(onScroll, 600);
  }

  // ── Init ──────────────────────────────────────────────────

  async function init() {
    const hostname = getHostname();

    // Hard-skip ignored/browser pages and non-http protocols
    if (IGNORED_HOSTNAMES.has(hostname)) return;
    if (!hostname || location.protocol === 'chrome-extension:' || location.protocol === 'about:') return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    const headings = extractHeadings();
    const title    = getPageTitle();
    
    try { chrome.runtime.sendMessage({ type: 'TRACKING_STATUS_UPDATE', status: 'ANALYZING', url: location.href, title }); } catch(e) {}

    // Ask local AI if this is study-related content
    const isStudy  = await checkIfStudyContent(title, headings);
    if (!isStudy) {
      console.log('[StudyLens] Not study content — skipping tracking for:', title);
      try { chrome.runtime.sendMessage({ type: 'TRACKING_STATUS_UPDATE', status: 'IGNORED', url: location.href, title }); } catch(e) {}
      return;
    }

    try { chrome.runtime.sendMessage({ type: 'TRACKING_STATUS_UPDATE', status: 'TRACKING', url: location.href, title }); } catch(e) {}
    startSession();
    attachListeners();
  }

  init();
})();
