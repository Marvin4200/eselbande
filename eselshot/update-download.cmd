@echo off
rem Baut EselShot.exe neu, legt sie als EselShot-Setup.exe in filehoster\downloads
rem ab und schreibt die Version daneben in version.txt. Der Dateiname UND die
rem Versionsdatei muessen zu dem passen, was filehoster/index.js unter
rem /download/EselShot-Setup.exe bzw. /api/eselshot/version ausliefert --
rem sonst denkt der eingebaute Updater, es gaebe kein/ein falsches Update.
rem Nach dem Deploy des Filehoster-Containers ist der Download live.
setlocal
cd /d "%~dp0"

echo === Baue EselShot.exe ===
python build.py || goto :err

echo.
echo === Ermittle Version aus eselshot\__init__.py ===
for /f "delims=" %%v in ('python -c "from eselshot import __version__; print(__version__)"') do set "VERSION=%%v"
if "%VERSION%"=="" (
  echo Konnte Version nicht ermitteln.
  goto :err
)
echo Version: %VERSION%

echo.
echo === Kopiere in filehoster\downloads ===
if not exist "..\filehoster\downloads" mkdir "..\filehoster\downloads"
copy /Y "dist\EselShot.exe" "..\filehoster\downloads\EselShot-Setup.exe" || goto :err
> "..\filehoster\downloads\version.txt" echo %VERSION%

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
