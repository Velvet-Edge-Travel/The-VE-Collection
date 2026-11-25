@echo off
setlocal
cd /d "%~dp0"
if not exist "preview-site.py" (
  echo Extract the entire Local Preview ZIP before opening the website.
  pause
  exit /b 1
)
py -3 --version >nul 2>nul
if not errorlevel 1 (
  py -3 "preview-site.py" %*
  goto finish
)
python --version >nul 2>nul
if not errorlevel 1 (
  python "preview-site.py" %*
  goto finish
)
echo Python 3 was not found. Open index.html in Edge or Chrome to view the website.
pause
exit /b 1

:finish
set "previewExit=%errorlevel%"
if not "%previewExit%"=="0" pause
exit /b %previewExit%
