# StudyLens Browser Extension

A privacy-first, offline browser extension that automatically tracks your study sessions across YouTube, Coursera, Physics Wallah, and any custom platform you configure.

## Features

- **Video Event Tracking** — Captures play, pause, seek, speed changes with precise timestamps
- **True Time Analysis** — Calculates both *clock time spent* (wall time) and *video time consumed* (accounting for 1.5x, 2x speed + skipping)
- **Transcript Extraction** — Extracts YouTube auto-captions, Coursera transcript panels, and VTT subtitle files
- **Rewatch Detection** — Flags topics you repeatedly revisit (3+ backward seeks in 60s)
- **Custom Platforms** — Add any video learning site from the Settings page
- **Offline Buffer** — Stores events in browser storage if the local server is offline; retries automatically every minute
- **Zero Cloud** — All data goes only to `localhost:7842` (your local StudyLens server)

## Supported Platforms

| Platform | Event Tracking | Transcript | Extra Data |
|---|---|---|---|
| **YouTube** | Full | ✓ (auto-captions API) | Video ID, Chapters |
| **Coursera** | Full | ✓ (transcript panel + VTT) | Course name |
| **Physics Wallah** | Full | ✓ (VTT tracks + notes) | Subject name |
| **Generic (any site)** | Full | ✓ (VTT + TextTrack API) | — |
| **Custom platforms** | Full | ✓ (VTT) | Configured name |

## Event Payload

When a tab is closed or you navigate away, the extension sends a structured payload to `localhost:7842/events/video-session`:

```json
{
  "schema_version": "1.0",
  "flush_reason": "tab_closed",
  "session_id": "tab-123-1719456000000",
  "url": "https://www.youtube.com/watch?v=abc123",
  "title": "Machine Learning Full Course",
  "platform": "youtube",
  "video_duration_seconds": 3600,
  "clock_time_spent_seconds": 1200,
  "video_time_consumed_seconds": 1800,
  "completion_percentage": 50,
  "session_start_ts": "2026-06-27T10:00:00.000Z",
  "session_end_ts": "2026-06-27T10:20:00.000Z",
  "events": [
    { "type": "VIDEO_START", "timestamp": "...", "video_time": 0 },
    { "type": "VIDEO_SPEED_CHANGE", "timestamp": "...", "old_speed": 1, "new_speed": 1.5 },
    { "type": "VIDEO_SEEK", "timestamp": "...", "from_time": 420, "to_time": 900, "direction": "forward" },
    { "type": "VIDEO_PAUSE", "timestamp": "...", "video_time": 2250 }
  ],
  "transcript": "[00:00] Welcome to this course...\n[00:30] Today we cover..."
}
```

**Note on time calculation:**  
`clock_time_spent` = actual wall-clock time you had the tab open and playing  
`video_time_consumed` = how much of the video content you actually consumed (e.g., 20 min at 1.5x = 30 min of content)

## Installation

### Chrome / Brave
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `extension/manifest.json`

> **Note:** Firefox requires Manifest V3 extension signing for permanent install. For development, the temporary load is sufficient.

## Adding Custom Platforms

1. Click the StudyLens icon in your browser toolbar
2. Click **Platforms** (or go to Settings)
3. Click **+ Add Platform**
4. Enter the platform name and domain (e.g., `portal.university.edu`)
5. Save — StudyLens will now track videos on that domain automatically

## Architecture

```
content_youtube.js  ─┐
content_coursera.js  ─┤  chrome.runtime.sendMessage
content_pw.js        ─┤──────────────────────────────> background.js
content_generic.js  ─┘  (per-tab event aggregation,
                          timing math, flush logic)
                                    │
                                    │ POST on tab close
                                    ▼
                        http://localhost:7842/events/video-session
                                    │
                                    ▼
                          StudyLens Python Server
                          (FastAPI + SQLite + LLM)
```

## File Structure

```
extension/
├── manifest.json           # MV3 manifest
├── background.js           # Service worker (event hub + flush logic)
├── content_youtube.js      # YouTube-specific tracker + transcript
├── content_coursera.js     # Coursera tracker + transcript panel
├── content_pw.js           # Physics Wallah tracker + VTT
├── content_generic.js      # Generic video tracker for all other sites
├── popup/
│   ├── popup.html          # Extension toolbar popup
│   ├── popup.js            # Live session display
│   └── popup.css           # Dark theme styles
├── options/
│   ├── options.html        # Full settings page
│   ├── options.js          # Platform manager + settings
│   └── options.css         # Settings page styles
└── icons/
    ├── icon_16.png
    ├── icon_32.png
    ├── icon_48.png
    └── icon_128.png
```
