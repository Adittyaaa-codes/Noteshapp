# Noteshapp

Noteshapp is a privacy-first, desktop-native local AI study workspace built with Tauri v2, React, Python, and local LLMs (Ollama). 

Our application intelligently tracks user activity and provides comprehensive study analytics to help users optimize their learning habits. Because Noteshapp is powered entirely by local Artificial Intelligence models, your data is completely safe. The app operates 100% locally and **does not rely on any third-party services or cloud providers**, ensuring absolute privacy for your personal notes, tasks, and browsing activity.

## Core Features
- **Local AI Engine**: Enhance, summarize, and query your notes securely without your data ever leaving your machine.
- **Activity Tracking & Analytics**: Gain insights into your study habits with built-in, on-device analytics that track your productivity without invading your privacy.
- **Offline & Private**: Completely independent of third-party cloud services.
- **Rich Editor**: Fully featured note-taking with markdown, drawing canvas, and embedded AI actions.

---

## 🚀 How to Install and Run Noteshapp

Noteshapp consists of three main parts: 
1. **The AI Backend** (Python)
2. **The Desktop App** (Tauri + React)
3. **The Browser Extension** (Chrome/Edge)

Follow these simple steps to get everything running!

### Prerequisites
Make sure you have installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Python](https://www.python.org/) (v3.10 or higher)
- [Ollama](https://ollama.com/) (For local AI models)
- [Rust & Cargo](https://rustup.rs/) (For building the desktop app)

---

### Step 1: Start the Local AI (Ollama)
Noteshapp relies on Ollama for all AI features.
1. Open your terminal or command prompt.
2. Run the following command to start Ollama in the background:
   ```bash
   ollama serve
   ```

### Step 2: Start the Python Backend
The Python backend handles database management, ML content classification, and talks to Ollama.
1. Open a new terminal.
2. Navigate to the backend folder:
   ```bash
   cd studylens/backend
   ```
3. Install the required Python packages (we recommend using a virtual environment or Anaconda):
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server:
   ```bash
   uvicorn main:app --port 7842
   ```

### Step 3: Start the Desktop Application
The desktop app is where you'll write notes, view your analytics, and manage your tasks.
1. Open a new terminal.
2. Navigate to the desktop app folder:
   ```bash
   cd studylens-desktop
   ```
3. Install the Node modules:
   ```bash
   npm install
   ```
4. Run the application in development mode:
   ```bash
   npm run tauri dev
   ```
*(The first time you run this, Rust may take a few minutes to compile the Tauri bridge. Subsequent runs will be very fast!)*

---

### Step 4: Install the Browser Extension
The browser extension safely tracks your educational activity (like YouTube videos and articles) and feeds it to the desktop app for your analytics dashboard.

1. Open your Chromium-based browser (Google Chrome, Microsoft Edge, Brave, etc.).
2. Go to your extensions page by typing **`chrome://extensions/`** in the URL bar.
3. Turn on **Developer mode** (usually a toggle in the top right corner).
4. Click on the **"Load unpacked"** button.
5. In the file explorer that opens, navigate to this project folder, select the **`studylens/extension`** folder, and click **Select Folder**.
6. The extension is now installed! It will automatically start logging your educational web activity directly to your local Noteshapp database.

---

## 📦 How to Build for Production (One-Click Build)

If you don't want to run the app in developer mode every time, you can package the entire app (including the Python backend) into a single `.exe` file.

1. Double-click the `build_app.bat` file in the root folder (or run it from your terminal).
2. The script will automatically compile the Python backend, move it to the Tauri build folder, and package the final desktop application.
3. When it finishes, you can find the final installer in:
   `studylens-desktop/src-tauri/target/release/bundle/`
