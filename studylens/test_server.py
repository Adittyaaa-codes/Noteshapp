from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
import uvicorn
import json
from datetime import datetime
import sys

# Reconfigure stdout/stderr to handle UTF-8, preventing UnicodeEncodeErrors on Windows terminals/logs
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

app = FastAPI(title="StudyLens Test Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

received_sessions = []

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "2.0.0"}

@app.post("/events/video-session")
async def receive_session(request: Request):
    try:
        body = await request.body()
        if not body:
            return JSONResponse(status_code=200, content={"status": "empty", "received": False})
        data = json.loads(body)
    except Exception as e:
        print(f"[ERROR] Could not parse body: {e}")
        return JSONResponse(status_code=200, content={"status": "parse_error", "received": False})

    data['_received_at'] = datetime.now().isoformat()
    received_sessions.append(data)
    session_type = data.get('session_type', 'video')
    print(f"[*] Received {session_type} session: {data.get('title')} ({data.get('platform')}) - {len(data.get('events', []))} events")
    return {"status": "success", "received": True}

@app.get("/api/sessions/latest")
async def get_latest_sessions(since: str = None):
    if not since:
        return {"sessions": received_sessions}
    new_sessions = [s for s in received_sessions if s.get('_received_at') > since]
    return {"sessions": new_sessions}

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html_content = r"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StudyLens Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: #0a0c12;
      --surface: #111318;
      --surface2: #181b23;
      --surface3: #1e2230;
      --border: #252838;
      --teal: #00d4d4;
      --teal-dim: rgba(0,212,212,0.12);
      --purple: #a855f7;
      --purple-dim: rgba(168,85,247,0.12);
      --green: #22c55e;
      --green-dim: rgba(34,197,94,0.12);
      --yellow: #f59e0b;
      --red: #ef4444;
      --text: #e2e8f0;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

    /* ── Header ── */
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px; border-bottom: 1px solid var(--border);
      background: var(--surface); position: sticky; top: 0; z-index: 10;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, var(--teal), var(--purple)); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
    .logo-text { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
    .logo-text span { color: var(--teal); }
    .live-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--green); font-weight: 500; background: var(--green-dim); padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(34,197,94,0.2); }
    .live-dot { width: 8px; height: 8px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.4); } 70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }

    /* ── Stats Bar ── */
    .stats-bar {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 1px; background: var(--border); border-bottom: 1px solid var(--border);
    }
    .stat-item { background: var(--surface); padding: 16px 24px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 700; color: var(--teal); font-variant-numeric: tabular-nums; }
    .stat-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }

    /* ── Tabs ── */
    .tab-bar { display: flex; padding: 0 28px; gap: 4px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .tab { padding: 12px 18px; font-size: 13px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all .2s; }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--teal); border-bottom-color: var(--teal); }

    /* ── Main ── */
    main { padding: 24px 28px; max-width: 1100px; margin: 0 auto; }

    /* ── Session Card ── */
    .session-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; margin-bottom: 20px; overflow: hidden;
      animation: slideIn 0.35s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes slideIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }
    .card-top { padding: 20px 24px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border); }
    .card-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; line-height: 1.3; }
    .card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-video { background: var(--teal-dim); color: var(--teal); border: 1px solid rgba(0,212,212,.2); }
    .badge-reading { background: var(--purple-dim); color: var(--purple); border: 1px solid rgba(168,85,247,.2); }
    .badge-youtube { background: rgba(239,68,68,.12); color: #f87171; border: 1px solid rgba(239,68,68,.2); }
    .badge-website { background: var(--purple-dim); color: var(--purple); border: 1px solid rgba(168,85,247,.2); }
    .card-time { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

    /* ── Stats Grid ── */
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; padding: 20px 24px; border-bottom: 1px solid var(--border); }
    .metric { background: var(--surface2); border-radius: 10px; padding: 14px; text-align: center; }
    .metric-val { font-size: 22px; font-weight: 700; color: var(--teal); font-variant-numeric: tabular-nums; }
    .metric-val.purple { color: var(--purple); }
    .metric-val.green { color: var(--green); }
    .metric-val.yellow { color: var(--yellow); }
    .metric-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }

    /* ── Sections & Events ── */
    .card-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
    .section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 8px; }

    .events-box { background: var(--surface2); border-radius: 10px; max-height: 220px; overflow-y: auto; }
    .event-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 12.5px; }
    .event-row:last-child { border-bottom: none; }
    .ev-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .ev-dot.play    { background: var(--green); }
    .ev-dot.pause   { background: var(--yellow); }
    .ev-dot.seek    { background: var(--teal); }
    .ev-dot.speed   { background: var(--purple); }
    .ev-dot.start   { background: #60a5fa; }
    .ev-dot.end     { background: var(--red); }
    .ev-dot.scroll  { background: var(--teal); }
    .ev-dot.section { background: var(--purple); }
    .ev-dot.other   { background: var(--text-muted); }
    .ev-type  { width: 120px; font-weight: 600; color: var(--text-dim); flex-shrink: 0; }
    .ev-detail { flex: 1; color: var(--text-muted); }
    .ev-ts    { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); }

    /* ── Headings ── */
    .headings-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .heading-chip { background: var(--surface3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; font-size: 12px; color: var(--text-dim); }

    /* ── Sections focused ── */
    .sections-list { display: flex; flex-direction: column; gap: 6px; }
    .section-row { display: flex; justify-content: space-between; align-items: center; background: var(--surface2); border-radius: 8px; padding: 8px 12px; font-size: 13px; }
    .section-name { color: var(--text); flex: 1; }
    .section-dur { color: var(--purple); font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 12px; }

    /* ── Scroll bar ── */
    .scroll-bar-wrap { background: var(--surface2); border-radius: 8px; padding: 12px; }
    .scroll-track { background: var(--surface3); border-radius: 4px; height: 10px; overflow: hidden; }
    .scroll-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--teal), var(--purple)); transition: width .5s ease; }
    .scroll-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 6px; }

    /* ── Collapsibles ── */
    details { border-top: 1px solid var(--border); }
    summary { padding: 12px 24px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; gap: 6px; list-style: none; outline: none; }
    summary:hover { color: var(--text); }
    summary::before { content: '▶'; font-size: 10px; transition: transform .2s; }
    details[open] summary::before { transform: rotate(90deg); }
    .detail-inner { padding: 0 24px 20px; }
    pre.json-view { background: #0a0c12; border: 1px solid var(--border); border-radius: 10px; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #94a3b8; white-space: pre-wrap; max-height: 280px; overflow-y: auto; }
    pre.transcript-view { background: var(--surface2); border-radius: 10px; padding: 14px; font-size: 12.5px; color: var(--text-dim); white-space: pre-wrap; max-height: 260px; overflow-y: auto; line-height: 1.7; }

    /* ── Empty state ── */
    .empty { text-align: center; padding: 80px 20px; color: var(--text-muted); }
    .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: .5; }
    .empty h2 { font-size: 20px; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; }
    .empty p { font-size: 14px; }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-icon">📚</div>
    <div class="logo-text">Study<span>Lens</span> Dashboard</div>
  </div>
  <div class="live-badge"><div class="live-dot"></div> Live — localhost:7842</div>
</header>

<div class="stats-bar">
  <div class="stat-item"><div class="stat-num" id="statTotal">0</div><div class="stat-lbl">Total Sessions</div></div>
  <div class="stat-item"><div class="stat-num" id="statVideo">0</div><div class="stat-lbl">Video Sessions</div></div>
  <div class="stat-item"><div class="stat-num" id="statReading">0</div><div class="stat-lbl">Reading Sessions</div></div>
  <div class="stat-item"><div class="stat-num" id="statEvents">0</div><div class="stat-lbl">Total Events</div></div>
</div>

<div class="tab-bar">
  <div class="tab active" data-tab="all">All Sessions</div>
  <div class="tab" data-tab="video">Video</div>
  <div class="tab" data-tab="reading">Reading</div>
</div>

<main>
  <div id="sessionList">
    <div class="empty" id="emptyState">
      <div class="empty-icon">🎓</div>
      <h2>Waiting for study sessions...</h2>
      <p>Watch a YouTube video or visit a site you've added as a custom study platform.</p>
    </div>
  </div>
</main>

<script>
  let allSessions = [];
  let lastPollTime = null;
  let activeTab = 'all';

  // ── Tab switching ──
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeTab = t.dataset.tab;
      rerenderList();
    });
  });

  // ── Helpers ──
  function fmt(s) {
    if (!s && s !== 0) return '—';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function tsShort(iso) { return iso ? iso.split('T')[1].substring(0,8) : ''; }
  function dotClass(type) {
    if (!type) return 'other';
    if (type.includes('PLAY') || type.includes('START')) return type.includes('START') ? 'start' : 'play';
    if (type.includes('PAUSE')) return 'pause';
    if (type.includes('SEEK') || type.includes('SCROLL')) return 'seek';
    if (type.includes('SPEED')) return 'speed';
    if (type.includes('ENDED') || type.includes('END')) return 'end';
    if (type.includes('SECTION')) return 'section';
    return 'other';
  }
  function evDetail(e) {
    switch(e.type) {
      case 'VIDEO_START':    return `Duration: ${fmt(e.video_duration)}`;
      case 'VIDEO_PLAY':     return `At ${fmt(e.video_time)}`;
      case 'VIDEO_PAUSE':    return `At ${fmt(e.video_time)} | Watched: ${fmt(e.video_time_so_far)}`;
      case 'VIDEO_SEEK':     return `${fmt(e.from_time)} → ${fmt(e.to_time)} (${e.direction})`;
      case 'VIDEO_SPEED_CHANGE': return `${e.old_speed}x → ${e.new_speed}x`;
      case 'VIDEO_ENDED':    return `Completion: ${e.completion_percent}%`;
      case 'VIDEO_CHAPTER':  return esc(e.chapter_title);
      case 'WEBSITE_START':  return `${e.word_count || 0} words | ${(e.headings||[]).length} headings`;
      case 'WEBSITE_SCROLL': return `Scrolled to ${e.scroll_percent}%`;
      case 'WEBSITE_SECTION_FOCUS': return `"${esc(e.section)}" — ${e.duration_seconds}s`;
      case 'WEBSITE_END':    return `${fmt(e.total_time_seconds)} | Scroll: ${e.max_scroll_percent}% | ~${e.avg_reading_wpm||'?'} wpm`;
      case 'TRANSCRIPT_CAPTURED': return `${e.length} characters`;
      default: return '';
    }
  }

  // ── Card builder ──
  function buildCard(s) {
    const isReading = s.session_type === 'reading';
    const events = s.events || [];
    const receivedAt = new Date(s._received_at).toLocaleTimeString();

    // Metrics
    let metricsHtml = '';
    if (isReading) {
      metricsHtml = `
        <div class="metric"><div class="metric-val purple">${fmt(s.clock_time_spent_seconds)}</div><div class="metric-lbl">Time on Page</div></div>
        <div class="metric"><div class="metric-val">${s.max_scroll_percent != null ? s.max_scroll_percent + '%' : '—'}</div><div class="metric-lbl">Max Scroll</div></div>
        <div class="metric"><div class="metric-val green">${(s.sections_focused||[]).length}</div><div class="metric-lbl">Sections Read</div></div>
        <div class="metric"><div class="metric-val yellow">${s.avg_reading_wpm || '—'}</div><div class="metric-lbl">Avg WPM</div></div>
        <div class="metric"><div class="metric-val">${s.word_count || '—'}</div><div class="metric-lbl">Word Count</div></div>
      `;
    } else {
      metricsHtml = `
        <div class="metric"><div class="metric-val">${fmt(s.clock_time_spent_seconds)}</div><div class="metric-lbl">Clock Time</div></div>
        <div class="metric"><div class="metric-val">${fmt(s.video_time_consumed_seconds)}</div><div class="metric-lbl">Video Consumed</div></div>
        <div class="metric"><div class="metric-val green">${s.completion_percentage != null ? s.completion_percentage + '%' : '—'}</div><div class="metric-lbl">Completion</div></div>
        <div class="metric"><div class="metric-val purple">${events.length}</div><div class="metric-lbl">Events</div></div>
      `;
    }

    // Events timeline
    let evHtml = events.map(e => `
      <div class="event-row">
        <div class="ev-dot ${dotClass(e.type)}"></div>
        <div class="ev-type">${e.type.replace('VIDEO_','').replace('WEBSITE_','')}</div>
        <div class="ev-detail">${evDetail(e)}</div>
        <div class="ev-ts">${tsShort(e.timestamp)}</div>
      </div>`).join('') || '<div style="padding:12px 14px;color:var(--text-muted);font-size:13px;">No events recorded</div>';

    // Headings (reading only)
    let headingsHtml = '';
    if (isReading && s.headings && s.headings.length) {
      headingsHtml = `
        <div>
          <div class="section-label">Page Headings</div>
          <div class="headings-list">${s.headings.map(h => `<div class="heading-chip">${esc(h)}</div>`).join('')}</div>
        </div>`;
    }

    // Sections focused (reading only)
    let sectionsHtml = '';
    if (isReading && s.sections_focused && s.sections_focused.length) {
      sectionsHtml = `
        <div>
          <div class="section-label">Sections Focused On</div>
          <div class="sections-list">
            ${s.sections_focused.map(sf => `
              <div class="section-row">
                <div class="section-name">${esc(sf.section)}</div>
                <div class="section-dur">${sf.duration_seconds}s</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    // Scroll bar (reading only)
    let scrollHtml = '';
    if (isReading && s.max_scroll_percent != null) {
      scrollHtml = `
        <div>
          <div class="section-label">Scroll Depth</div>
          <div class="scroll-bar-wrap">
            <div class="scroll-track"><div class="scroll-fill" style="width:${s.max_scroll_percent}%"></div></div>
            <div class="scroll-label"><span>0%</span><span>${s.max_scroll_percent}%</span><span>100%</span></div>
          </div>
        </div>`;
    }

    // Transcript (video only)
    let transcriptDetails = '';
    if (!isReading && s.transcript) {
      const lines = (s.transcript.split('\\n') || []).length;
      transcriptDetails = `
        <details>
          <summary>📜 Transcript (${lines} lines)</summary>
          <div class="detail-inner"><pre class="transcript-view">${esc(s.transcript.replace(/\\n/g, '\n'))}</pre></div>
        </details>`;
    }

    const platformBadge = s.platform === 'youtube' ? 'badge-youtube' : 'badge-website';
    const typeBadge = isReading ? 'badge-reading' : 'badge-video';

    return `
      <div class="session-card" data-type="${s.session_type || 'video'}">
        <div class="card-top">
          <div style="flex:1;min-width:0;">
            <div class="card-title">${esc(s.title || 'Unknown')}</div>
            <div class="card-meta">
              <span class="badge ${typeBadge}">${isReading ? '📖 Reading' : '🎬 Video'}</span>
              <span class="badge ${platformBadge}">${esc(s.platform)}</span>
              <span style="font-size:12px;color:var(--text-muted);">${esc(s.domain || s.url || '').substring(0,60)}</span>
            </div>
          </div>
          <div class="card-time">Received ${receivedAt}</div>
        </div>

        <div class="metrics">${metricsHtml}</div>

        <div class="card-body">
          ${scrollHtml}
          ${headingsHtml}
          ${sectionsHtml}
        </div>

        <details>
          <summary>Event Timeline (${events.length})</summary>
          <div class="detail-inner"><div class="events-box">${evHtml}</div></div>
        </details>

        ${transcriptDetails}

        <details>
          <summary>&lt;/&gt; Raw JSON Payload</summary>
          <div class="detail-inner"><pre class="json-view">${esc(JSON.stringify(s, null, 2))}</pre></div>
        </details>
      </div>`;
  }

  // ── Render ──
  function rerenderList() {
    const filtered = activeTab === 'all' ? allSessions
      : allSessions.filter(s => (activeTab === 'reading' ? s.session_type === 'reading' : s.session_type !== 'reading'));

    const list = document.getElementById('sessionList');
    const empty = document.getElementById('emptyState');

    if (filtered.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = filtered.map(buildCard).join('');
  }

  function updateStats() {
    document.getElementById('statTotal').textContent = allSessions.length;
    document.getElementById('statVideo').textContent = allSessions.filter(s => s.session_type !== 'reading').length;
    document.getElementById('statReading').textContent = allSessions.filter(s => s.session_type === 'reading').length;
    document.getElementById('statEvents').textContent = allSessions.reduce((a, s) => a + (s.events || []).length, 0);
  }

  // ── Poll ──
  async function poll() {
    try {
      const url = lastPollTime ? `/api/sessions/latest?since=${encodeURIComponent(lastPollTime)}` : '/api/sessions/latest';
      const data = await (await fetch(url)).json();
      if (data.sessions && data.sessions.length > 0) {
        data.sessions.forEach(s => {
          allSessions.unshift(s);
          if (s._received_at > (lastPollTime || '')) lastPollTime = s._received_at;
        });
        updateStats();
        rerenderList();
      }
    } catch {}
  }

  setInterval(poll, 1000);
  poll();
</script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7842, log_level="warning")
