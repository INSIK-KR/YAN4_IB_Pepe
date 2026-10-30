@echo off
REM Close YAN4-IB-Shell / Cursor first if delete fails (app.asar file lock).
cd /d "%~dp0"
echo Cleaning old release-* folders...
for /d %%D in (release-*) do (
  echo Removing %%D
  rmdir /s /q "%%D" 2>nul
)
if exist "release\win-unpacked" (
  echo Removing release\win-unpacked
  rmdir /s /q "release\win-unpacked" 2>nul
)
if exist "win-unpacked" (
  rmdir /s /q "win-unpacked" 2>nul
)
echo Done. Remaining:
dir /b /ad release* 2>nul
dir /b "release\*.exe" 2>nul
pause
