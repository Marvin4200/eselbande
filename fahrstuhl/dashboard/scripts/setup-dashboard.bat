@echo off
REM Fahrstuhl Bot Developer Dashboard - Setup
REM Dieses Script richtet das Dashboard ein

echo.
echo ╔══════════════════════════════════════════╗
echo ║   Fahrstuhl Bot Dashboard - Setup        ║
echo ╚══════════════════════════════════════════╝
echo.

REM Colors/status messages
echo Step 1: Erstelle Verzeichnisse...
if not exist "public" (
    mkdir public
    echo ✓ public/ erstellt
) else (
    echo ✓ public/ existiert schon
)

echo.
echo Step 2: Kopiere HTML-Datei...
if exist "dev-dashboard-public-index.html" (
    copy "dev-dashboard-public-index.html" "public\index.html" >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✓ index.html in public/ kopiert
    ) else (
        echo ❌ Fehler beim Kopieren
    )
) else (
    echo ⚠️  dev-dashboard-public-index.html nicht gefunden!
    echo    Diese Datei wird benötigt.
)

echo.
echo Step 3: Installiere npm-Dependencies...
call npm install express express-session axios dotenv
if %errorlevel% equ 0 (
    echo ✓ Dependencies installiert
) else (
    echo ❌ npm install fehlgeschlagen
    pause
    exit /b 1
)

echo.
echo Step 4: Erstelle .env wenn nicht vorhanden...
if not exist ".env" (
    (
        echo # Fahrstuhl Bot Developer Dashboard
        echo # Discord OAuth2 Credentials
        echo.
        echo DISCORD_CLIENT_ID=your-client-id-here
        echo DISCORD_CLIENT_SECRET=your-client-secret-here
        echo DEV_USER_ID=your-discord-user-id-here
        echo.
        echo # OAuth Redirect
        echo DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/callback
        echo.
        echo # Session
        echo SESSION_SECRET=fahrstuhl-dev-secret-2024
        echo.
        echo # Server
        echo DASHBOARD_PORT=3001
    ) > .env
    echo ✓ .env erstellt
    echo ⚠️  Bitte Discord OAuth Credentials in .env eintragen!
) else (
    echo ✓ .env existiert schon
)

echo.
echo ╔══════════════════════════════════════════╗
echo ║   ✅ Setup abgeschlossen!                ║
echo ╚══════════════════════════════════════════╝
echo.
echo Nächste Schritte:
echo.
echo 1. Öffne .env und trage ein:
echo    - DISCORD_CLIENT_ID
echo    - DISCORD_CLIENT_SECRET
echo    - DEV_USER_ID
echo.
echo    (Siehe DEV-DASHBOARD-README.md für Anleitung)
echo.
echo 2. Starte das Dashboard:
echo    node dev-dashboard.js
echo.
echo    ODER nutze: start-dashboard.bat
echo.
echo 3. Öffne im Browser:
echo    http://localhost:3001
echo.

pause
