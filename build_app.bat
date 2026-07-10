@echo off
echo ==========================================
echo StudyLens - Full Application Build Script
echo ==========================================
echo.

:: 1. Verify Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

:: 2. Verify Node
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js (npm) is not installed or not in PATH!
    pause
    exit /b 1
)

echo [1/4] Installing Python dependencies...
cd studylens\backend
pip install -r requirements.txt
pip install pyinstaller
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)

echo.
echo [2/4] Building the Python AI Backend (this takes a minute)...
pyinstaller --name "backend-x86_64-pc-windows-msvc" --onefile --windowed --exclude-module PyQt5 --exclude-module PySide6 --add-data "models;models" run_backend.py --clean -y
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller backend build failed.
    pause
    exit /b 1
)

echo.
echo [3/4] Copying compiled backend to Tauri...
copy /Y "dist\backend-x86_64-pc-windows-msvc.exe" "..\..\studylens-desktop\src-tauri\bin\backend-x86_64-pc-windows-msvc.exe"
cd ..\..\studylens-desktop

echo.
echo [4/4] Building the Tauri Desktop App...
call npm install
call npm run tauri build

echo.
echo ==========================================
echo SUCCESS!
echo Your compiled application installer is located at:
echo studylens-desktop\src-tauri\target\release\bundle\
echo ==========================================
pause
