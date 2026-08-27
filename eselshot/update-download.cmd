@echo off
rem Baut EselShot.exe neu und legt sie in filehoster\downloads ab.
rem Nach dem Deploy des Filehoster-Containers ist der Download live.
setlocal
cd /d "%~dp0"

echo === Baue EselShot.exe ===
python build.py || goto :err

echo.
echo === Kopiere in filehoster\downloads ===
if not exist "..\filehoster\downloads" mkdir "..\filehoster\downloads"
copy /Y "dist\EselShot.exe" "..\filehoster\downloads\EselShot.exe" || goto :err

echo.
echo Fertig. Deploy jetzt den Filehoster:
echo   cd ..\..\fahrstuhl ^&^& docker compose up -d --build filehoster
echo.
pause
exit /b 0

:err
echo.
echo Fehler beim Build.
pause
exit /b 1
