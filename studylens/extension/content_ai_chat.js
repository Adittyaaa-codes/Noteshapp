/**
 * StudyLens — AI Chat Tracker (content_ai_chat.js)
 *
 * Supported platforms:
 *   - ChatGPT (chatgpt.com)
 *   - Claude (claude.ai)
 *   - Gemini (gemini.google.com)
 *   - Perplexity (perplexity.ai)
 *
 * How it works:
 *   1. Watches the DOM for new assistant messages via MutationObserver.
 *   2. When a full conversation is detected, it extracts all Q&A pairs.
 *   3. On tab hide / unload, it calls the local backend /classify/educational
 *      to check if the conversation was educational. Only then is the session
 *      flushed to StudyLens for tracking.
 *
 * What is tracked:
 *   - session_type: 'ai_chat'
 *   - platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity'
 *   - transcript: full conversation Q&A text
 *   - The FIRST user message is used as the session title
 */

(function () {
  'use strict';

  if (window.__studyLensAIChat) return;
  window.__studyLensAIChat = true;

  const BACKEND = 'http://127.0.0.1:7842';
  const hostname = location.hostname.replace(/^www\./, '');

  // ── Platform Detection ────────────────────────────────────────────────────

  function detectPlatform() {
    if (hostname.includes('chatgpt.com'))        return 'chatgpt';
    if (hostname.includes('claude.ai'))          return 'claude';
    if (hostname.includes('gemini.google.com'))  return 'gemini';
    if (hostname.includes('perplexity.ai'))      return 'perplexity';
    return null;
  }

  const PLATFORM = detectPlatform();
  if (!PLATFORM) return; // Not a supported AI chat site

  // ── Conversation Extractors ───────────────────────────────────────────────

  /**
   * Returns array of { role: 'user'|'assistant', text: string }
   */
  function extractConversation() {
    switch (PLATFORM) {
      case 'chatgpt':    return extractChatGPT();
      case 'claude':     return extractClaude();
      case 'gemini':     return extractGemini();
      case 'perplexity': return extractPerplexity();
      default:           return [];
    }
  }

  function extractChatGPT() {
    const turns = [];
    // ChatGPT uses [data-message-author-role="user"] and [data-message-author-role="assistant"]
    const messages = document.querySelectorAll('[data-message-author-role]');
    messages.forEach(el => {
      const role = el.getAttribute('data-message-author-role');
      const text = el.innerText?.trim();
      if (text && (role === 'user' || role === 'assistant')) {
        turns.push({ role, text });
      }
    });
    return turns;
  }

  function extractClaude() {
    const turns = [];
    // Claude renders human turns in [data-testid="human-turn"] and
    // AI responses in [data-testid="ai-turn"]
    const humanTurns = document.querySelectorAll('[data-testid="human-turn"]');
    const aiTurns    = document.querySelectorAll('[data-testid="ai-turn"]');

    // Interleave them in DOM order
    const allNodes = Array.from(document.querySelectorAll(
      '[data-testid="human-turn"], [data-testid="ai-turn"]'
    ));
    allNodes.forEach(el => {
      const role = el.getAttribute('data-testid') === 'human-turn' ? 'user' : 'assistant';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
    return turns;
  }

  function extractGemini() {
    const turns = [];
    // Gemini uses <user-query> and <model-response> custom elements
    const allNodes = Array.from(document.querySelectorAll('user-query, model-response'));
    allNodes.forEach(el => {
      const role = el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
    return turns;
  }

  function extractPerplexity() {
    const turns = [];
    // Perplexity has .query-text for user and .prose for the answer
    const queryNodes  = document.querySelectorAll('[class*="AnswerBody"] [class*="prose"]');
    const userNodes   = document.querySelectorAll('[class*="UserMessageQuery"]');

    const allNodes = Array.from(
      document.querySelectorAll('[class*="UserMessageQuery"], [class*="AnswerBody"]')
    );
    allNodes.forEach(el => {
      const cls  = el.className || '';
      const role = cls.includes('UserMessage') ? 'user' : 'assistant';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
    return turns;
  }

  // ── Transcript Builder ────────────────────────────────────────────────────

  function buildTranscript(turns) {
    return turns
      .map(t => `[${t.role === 'user' ? 'User' : 'AI'}]: ${t.text}`)
      .join('\n\n');
  }

  function getTitle(turns) {
    const firstUser = turns.find(t => t.role === 'user');
    const raw = firstUser?.text || document.title || 'AI Chat Session';
    return raw.slice(0, 120); // cap title length
  }

  // ── Client-side fast blocklist (avoids backend call entirely) ─────────────
  const FAST_BLOCKLIST = /\b(world cup|cricket|ipl|nba|nfl|fifa|match score|wicket|goal|trophy|bollywood|movie|film|actor|actress|song|album|music|concert|celebrity|recipe|cooking|restaurant|meme|joke|funny|roast|prank|viral|gossip|travel|vacation|hotel|flight|astrology|horoscope|zodiac|shopping|amazon|flipkart|crypto price|stock price|market today)\b/i;

  /**
   * Sends ALL user prompts combined to the backend classifier.
   * Returns true only if the conversation is educational.
   */
  async function isEducational(turns) {
    if (turns.length === 0) return false;

    // Combine ALL user messages for a stronger signal
    const allUserText = turns
      .filter(t => t.role === 'user')
      .map(t => t.text)
      .join(' ')
      .slice(0, 800);

    if (!allUserText) return false;

    // Fast client-side check — if clearly non-educational, skip backend entirely
    if (FAST_BLOCKLIST.test(allUserText)) {
      console.log(`[StudyLens AI] Fast-blocked (non-educational): ${allUserText.slice(0, 80)}`);
      return false;
    }

    // Also include the first AI response for extra context
    const firstAI = turns.find(t => t.role === 'assistant')?.text || '';
    const preview = `${allUserText}\n${firstAI}`.slice(0, 800);

    try {
      const resp = await fetch(BACKEND + '/classify/educational', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: preview }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      const isStudy = data.label === 'YES';
      console.log(`[StudyLens AI] Classify: ${isStudy ? '✓ EDUCATIONAL' : '✗ SKIP'} (${Math.round((data.confidence || 0) * 100)}%) — ${allUserText.slice(0, 60)}`);
      return isStudy;
    } catch (e) {
      console.warn('[StudyLens AI] Classify failed — skipping:', e.message);
      return false; // Fail safe: never track if backend is down
    }
  }

  // ── Session State ─────────────────────────────────────────────────────────

  let sessionStartTime = Date.now();
  let sessionFlushed   = false;
  let turnCount        = 0; // track how many turns we saw last check

  async function flushSession(reason) {
    if (sessionFlushed) return;

    const turns = extractConversation();
    if (turns.length < 2) return; // Need at least one Q&A pair

    // Educational gate — only proceed if the AI says this is study content
    const educational = await isEducational(turns);
    if (!educational) {
      console.log('[StudyLens AI] Not educational — not tracking this chat.');
      try {
        chrome.runtime.sendMessage({
          type: 'TRACKING_STATUS_UPDATE',
          status: 'IGNORED',
          url: location.href,
          title: getTitle(turns),
        });
      } catch (_) {}
      return;
    }

    sessionFlushed = true;
    const transcript = buildTranscript(turns);
    const title      = getTitle(turns);
    const totalSecs  = Math.round((Date.now() - sessionStartTime) / 1000);

    const payload = {
      type:         'AI_CHAT_END',
      session_type: 'ai_chat',
      platform:     PLATFORM,
      url:          location.href,
      title:        title,
      domain:       hostname,
      transcript:   transcript,
      total_time_seconds: totalSecs,
      turn_count:   turns.length,
      timestamp:    new Date().toISOString(),
      reason,
    };

    console.log(`[StudyLens AI] Flushing educational chat (${turns.length} turns, ${totalSecs}s): ${title}`);

    try {
      chrome.runtime.sendMessage(payload);
    } catch (_) {}
  }

  // ── MutationObserver — watch for new messages ─────────────────────────────

  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    // Debounce rapid DOM changes (streaming responses)
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const turns = extractConversation();
      if (turns.length > turnCount) {
        turnCount = turns.length;
        // Update tracking status in popup when conversation grows
        const title = getTitle(turns);
        try {
          chrome.runtime.sendMessage({
            type:   'TRACKING_STATUS_UPDATE',
            status: 'TRACKING',
            url:    location.href,
            title,
          });
        } catch (_) {}
      }
    }, 1500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });

  // ── Session Lifecycle ─────────────────────────────────────────────────────

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSession('tab_hidden');
    } else {
      // Tab became visible again — reset for a potential new conversation
      const turns = extractConversation();
      if (turns.length === 0) {
        // New conversation started, reset session
        sessionStartTime = Date.now();
        sessionFlushed   = false;
        turnCount        = 0;
      }
    }
  });

  window.addEventListener('beforeunload', () => flushSession('page_unload'));

  // ── Notify popup we're on an AI chat site ────────────────────────────────
  try {
    chrome.runtime.sendMessage({
      type:   'TRACKING_STATUS_UPDATE',
      status: 'ANALYZING',
      url:    location.href,
      title:  document.title || `${PLATFORM} Chat`,
    });
  } catch (_) {}

  console.log(`[StudyLens AI] Chat tracker active on ${PLATFORM}`);
})();
