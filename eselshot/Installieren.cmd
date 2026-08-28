@echo off
rem Einrichter fuer EselShot - startet das kleine Installationsfenster.
setlocal
cd /d "%~dp0"

set "PYW=pythonw"
where pythonw >nul 2>&1 || set "PYW=python"
where %PYW% >nul 2>&1 || (
  echo.
  echo   Python 3 wurde nicht gefunden.
  echo   Bitte von https://www.python.org/downloads/ installieren
  echo   und beim Setup den Haken bei "Add python.exe to PATH" setzen.
  echo.
  pause
  exit /b 1
)

start "" %PYW% -m eselshot --install
