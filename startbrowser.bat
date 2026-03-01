@echo off
title DOS Browser - TUI
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js ist nicht installiert oder nicht im PATH.
    echo Bitte Node.js von https://nodejs.org herunterladen und installieren.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "%~dp0node_modules" (
    echo Abhaengigkeiten werden installiert, bitte warten...
    call npm install
    echo.
)

:: Parse optional URL argument
set URL_ARG=
if not "%~1"=="" set URL_ARG=%~1

:: Parse optional flags (pass all extra args through)
echo DOS Browser wird gestartet...
echo Druecke STRG+C oder ESC zum Beenden.
echo.

node tui-browser.js %URL_ARG% %2 %3 %4 %5

pause
