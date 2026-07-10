/**
 * StudyLens Popup Script - Simplified Tracking Status
 */

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

async function checkServerStatus() {
  try {
    const response = await fetch('http://127.0.0.1:7842/health', { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadActiveState() {
  const isOnline = await checkServerStatus();
  
  const container = document.getElementById('statusContainer');
  const titleEl = document.getElementById('pageTitle');
  const msgEl = document.getElementById('statusMessage');
  const details = document.getElementById('trackingDetails');

  if (!isOnline) {
    container.className = 'status-box status-offline';
    titleEl.textContent = 'Backend Unreachable';
    msgEl.textContent = 'Ensure StudyLens desktop app is running.';
    msgEl.classList.remove('pulse');
    details.style.display = 'none';
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Ignore restricted urls
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      container.className = 'status-box status-ignored';
      titleEl.textContent = 'Browser Page';
      msgEl.textContent = 'Not trackable.';
      msgEl.classList.remove('pulse');
      details.style.display = 'none';
      return;
    }

    titleEl.textContent = tab.title || tab.url;

    // Ask background script for current session state
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE', tabId: tab.id });

    if (response?.hasSession) {
      const s = response.session;
      
      // Determine state: Tracking vs Analyzing vs Ignored
      if (s.tracking_status === 'IGNORED') {
        container.className = 'status-box status-ignored';
        msgEl.textContent = 'Not Educational - Tracking Disabled';
        msgEl.classList.remove('pulse');
        details.style.display = 'none';
      } 
      else if (s.tracking_status === 'ANALYZING') {
        container.className = 'status-box status-analyzing';
        msgEl.textContent = 'Analyzing content for tracking...';
        msgEl.classList.add('pulse');
        details.style.display = 'none';
      }
      else {
        // TRACKING
        container.className = 'status-box status-tracking';
        msgEl.textContent = 'Tracking Active';
        msgEl.classList.remove('pulse');
        
        details.style.display = 'block';
        document.getElementById('clockTime').textContent = formatDuration(s.clockAccumulator);
        document.getElementById('eventCount').textContent = s.eventCount || 0;

        const isVideo = s.sessionType === 'video';
        if (isVideo) {
          document.getElementById('videoRow').style.display = 'flex';
          document.getElementById('scrollRow').style.display = 'none';
          document.getElementById('videoTime').textContent = formatDuration(s.videoAccumulator);
        } else {
          document.getElementById('videoRow').style.display = 'none';
          document.getElementById('scrollRow').style.display = 'flex';
          document.getElementById('scrollDepth').textContent = (s.scrollPct || 0) + '%';
        }
      }
    } else {
      // No session known yet by background script. It might still be injecting/analyzing.
      container.className = 'status-box status-analyzing';
      msgEl.textContent = 'Awaiting connection...';
      msgEl.classList.add('pulse');
      details.style.display = 'none';
    }
  } catch (err) {
    // Background script might be reloading
    container.className = 'status-box status-analyzing';
    msgEl.textContent = 'Connecting to extension...';
    msgEl.classList.add('pulse');
    details.style.display = 'none';
  }
}

// Initial load and polling
loadActiveState();
setInterval(loadActiveState, 1000);
