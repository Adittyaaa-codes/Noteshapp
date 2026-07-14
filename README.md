# Noteshapp

Noteshapp is a privacy-first, desktop-native local AI study workspace built with Tauri v2, React, Python, and local LLMs (Ollama). 

Our application intelligently tracks user activity and provides comprehensive study analytics to help users optimize their learning habits. Because Noteshapp is powered entirely by local Artificial Intelligence models, your data is completely safe. The app operates 100% locally and **does not rely on any third-party services or cloud providers**, ensuring absolute privacy for your personal notes, tasks, and browsing activity.

## Core Features
- **Local AI Engine**: Enhance, summarize, and query your notes securely without your data ever leaving your machine.
- **Activity Tracking & Analytics**: Gain insights into your study habits with built-in, on-device analytics that track your productivity without invading your privacy.
- **Offline & Private**: Completely independent of third-party cloud services.
- **Rich Editor**: Fully featured note-taking with markdown, drawing canvas, and embedded AI actions.

## How to Build the App (For Developers)

Because this app bundles a full Python machine learning backend as a "sidecar" within a Rust/Tauri desktop application, the build process has two steps: building the Python binary, and then building the Tauri app. 

### Prerequisites
1. **Node.js** (v18+)
2. **Rust** (and Cargo)
3. **Python** (v3.10+)

### One-Click Build
To make things easy, just double-click the `build_app.bat` file in this folder (or run it from your terminal).

This script will automatically:
1. Install the required Python dependencies.
2. Run `PyInstaller` to compile the backend into a standalone `.exe`.
3. Move the compiled backend into the Tauri `bin/` folder.
4. Run `npm install` and `npm run tauri build` to package the final desktop application.

When it finishes, the final installer will be located in:
`studylens-desktop/src-tauri/target/release/bundle/`

### Manual Development (Hot-Reloading)
If you want to run the app in development mode with hot-reloading:
```bash
cd studylens-desktop
npm install
npm run tauri dev
```
*(Note: Our Tauri configuration is set up so that if the compiled backend `.exe` isn't found, Tauri will automatically fall back to launching the Python scripts directly on your machine for a seamless dev experience!)*
