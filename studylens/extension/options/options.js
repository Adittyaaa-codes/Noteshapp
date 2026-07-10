/**
 * StudyLens Options Page Script
 * Manages custom platforms, tracking rules, server config, and data stats.
 */

// ─── State ─────────────────────────────────────────────────

let customPlatforms = [];

// ─── Navigation ────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(`section-${section}`)?.classList.add('active');

    // Load section-specific data
    if (section === 'server') loadServerSection();
    if (section === 'data') loadDataSection();
  });
});

// ─── Load Settings from Storage ────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'custom_platforms',
    'tracking_settings',
  ]);

  // Custom platforms
  customPlatforms = data.custom_platforms || [];
  renderCustomPlatforms();

  // Tracking settings
  const settings = data.tracking_settings || {};
  document.getElementById('minDuration').value = settings.min_duration_minutes ?? 3;
  document.getElementById('rewatchThreshold').value = settings.rewatch_threshold ?? 3;
  document.getElementById('extractTranscript').checked = settings.extract_transcript !== false;
}

// ─── Custom Platforms ───────────────────────────────────────

function renderCustomPlatforms() {
  const list = document.getElementById('customPlatformList');
  const empty = document.getElementById('emptyCustom');

  list.innerHTML = '';

  if (customPlatforms.length === 0) {
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  customPlatforms.forEach((platform, index) => {
    const item = document.createElement('div');
    item.className = 'custom-item';
    item.innerHTML = `
      <div class="platform-icon custom">🌐</div>
      <div class="custom-item-info">
        <div class="custom-item-name">${escapeHtml(platform.name)}</div>
        <div class="custom-item-domain">${escapeHtml(platform.domain)}</div>
        ${platform.notes ? `<div class="custom-item-notes">${escapeHtml(platform.notes)}</div>` : ''}
      </div>
      <div class="platform-features">
        <span class="badge badge-green">Video Tracking</span>
        <span class="badge badge-teal">Generic Tracking</span>
      </div>
      <button class="btn-remove" data-index="${index}" title="Remove platform">×</button>
    `;
    list.appendChild(item);
  });

  // Remove buttons
  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      customPlatforms.splice(idx, 1);
      saveCustomPlatforms();
      renderCustomPlatforms();
    });
  });
}

async function saveCustomPlatforms() {
  await chrome.storage.local.set({ custom_platforms: customPlatforms });
}

// Add platform form
document.getElementById('addPlatformBtn').addEventListener('click', () => {
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('inputName').focus();
});

document.getElementById('cancelAddBtn').addEventListener('click', () => {
  document.getElementById('addForm').style.display = 'none';
  clearAddForm();
});

document.getElementById('saveAddBtn').addEventListener('click', async () => {
  const name = document.getElementById('inputName').value.trim();
  const domain = document.getElementById('inputDomain').value.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const notes = document.getElementById('inputNotes').value.trim();

  if (!name || !domain) {
    showFieldError(!name ? 'inputName' : 'inputDomain');
    return;
  }

  // Check for duplicates
  if (customPlatforms.some(p => p.domain === domain)) {
    showFieldError('inputDomain', 'Domain already added');
    return;
  }

  customPlatforms.push({ name, domain, notes, added_at: new Date().toISOString() });
  await saveCustomPlatforms();
  renderCustomPlatforms();
  document.getElementById('addForm').style.display = 'none';
  clearAddForm();
});

// Allow Enter to save
document.getElementById('inputNotes').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('saveAddBtn').click();
});

function clearAddForm() {
  document.getElementById('inputName').value = '';
  document.getElementById('inputDomain').value = '';
  document.getElementById('inputNotes').value = '';
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  field.style.borderColor = '#ef4444';
  field.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)';
  setTimeout(() => {
    field.style.borderColor = '';
    field.style.boxShadow = '';
  }, 2000);
}

// ─── Tracking Settings ──────────────────────────────────────

document.getElementById('saveTrackingBtn').addEventListener('click', async () => {
  const settings = {
    min_duration_minutes: parseInt(document.getElementById('minDuration').value) || 3,
    rewatch_threshold: parseInt(document.getElementById('rewatchThreshold').value) || 3,
    extract_transcript: document.getElementById('extractTranscript').checked,
  };
  await chrome.storage.local.set({ tracking_settings: settings });

  const feedback = document.getElementById('trackingSaved');
  feedback.style.opacity = '1';
  setTimeout(() => { feedback.style.opacity = '0'; }, 2000);
});

// ─── Server Section ─────────────────────────────────────────

async function loadServerSection() {
  const data = await chrome.storage.local.get('pending_sessions');
  const pending = data.pending_sessions || [];
  document.getElementById('bufferCount').textContent = pending.length;
}

document.getElementById('checkServerBtn')?.addEventListener('click', async () => {
  const result = document.getElementById('serverStatusResult');
  result.style.display = 'block';
  result.textContent = 'Checking...';
  result.className = 'server-result';

  try {
    const response = await fetch('http://localhost:7842/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const data = await response.json();
      result.className = 'server-result success';
      result.textContent = `✓ Server online — version ${data.version || '1.0.0'}`;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    result.className = 'server-result error';
    result.textContent = `✗ Server unreachable — ${err.message}. Start StudyLens main.py to enable AI features.`;
  }
});

document.getElementById('clearBufferBtn')?.addEventListener('click', async () => {
  if (confirm('Clear all buffered sessions? These will be lost permanently.')) {
    await chrome.storage.local.set({ pending_sessions: [] });
    document.getElementById('bufferCount').textContent = '0';
  }
});

// ─── Data Section ───────────────────────────────────────────

async function loadDataSection() {
  try {
    const response = await fetch('http://localhost:7842/api/stats', {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const data = await response.json();
      document.getElementById('statSessions').textContent = data.total_sessions ?? '—';
      document.getElementById('statEvents').textContent = data.total_events ?? '—';
      document.getElementById('statTopics').textContent = data.total_topics ?? '—';
    }
  } catch {
    // Server offline
  }
}

document.getElementById('resetExtensionBtn')?.addEventListener('click', async () => {
  if (confirm('Reset extension data? This clears buffered sessions and custom platforms from the extension storage. Your server database is NOT affected.')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ custom_platforms: [] });
    customPlatforms = [];
    renderCustomPlatforms();
    loadSettings();
    alert('Extension data reset successfully.');
  }
});

// ─── Helpers ─────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────

loadSettings();
